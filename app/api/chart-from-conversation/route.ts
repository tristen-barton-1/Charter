import { NextResponse } from "next/server";
import { run } from "@openai/agents";
import type { EncounterInput, NoteOutputs, ParsedEncounter, PatientRecord, SavedChart } from "@/lib/types";
import type { ChartTranscriptSource } from "@/lib/record-flow-storage";
import { normalizeAiChartPayload } from "@/lib/ai-chart-response";
import { createPsychChartingAgent } from "@/lib/charting-agent";
import { formatTranscriptForAi } from "@/lib/transcript-server-format";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { devMemoryListEncounters } from "@/lib/dev-api-memory";

export const maxDuration = 120;

type Body = {
  patient?: Partial<PatientRecord> | null;
  transcript?: string;
  encounterInput?: EncounterInput | null;
  chartSource?: ChartTranscriptSource | string | null;

  /**
   * Optional override. If supplied, this is treated as LAST_CHART_CONTEXT.
   * Otherwise the route fetches the most recent encounter whose saved chart has HPI, MSE, and POC.
   */
  context?: string | null;
  lastChartContext?: string | null;
};

function normalizeChartSource(raw: unknown): ChartTranscriptSource {
  return raw === "clinician_dictation" ? "clinician_dictation" : "visit_conversation";
}

function trimContext(value: string, maxChars = 12000): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return trimmed.slice(0, maxChars).trimEnd();
}

function formatSavedChartForLastChartContext(chart: SavedChart | null): string {
  if (!chart) return "";

  const notes = chart.notes ?? chart.generatedNotes;
  const parts: string[] = [];

  parts.push(`Prior chart date: ${chart.endedAt ?? chart.createdAt ?? chart.startedAt ?? "unknown"}`);

  if (typeof chart.transcript === "string" && chart.transcript.trim()) {
    parts.push(`Prior transcript / dictation:\n${chart.transcript.trim()}`);
  }

  if (notes?.hpi?.trim()) {
    parts.push(`Prior HPI:\n${notes.hpi.trim()}`);
  }

  if (notes?.mse?.trim()) {
    parts.push(`Prior MSE:\n${notes.mse.trim()}`);
  }

  if (notes?.plan?.trim()) {
    parts.push(`Prior POC:\n${notes.plan.trim()}`);
  }

  if (notes?.psychotherapy?.trim()) {
    parts.push(`Prior Psychotherapy Note:\n${notes.psychotherapy.trim()}`);
  }

  return trimContext(parts.join("\n\n---\n\n"));
}

function encounterHasHpiMsePoc(chart: SavedChart): boolean {
  const n = chart.notes;
  const g = chart.generatedNotes;
  const hpi = ((n?.hpi ?? "").trim() || (g?.hpi ?? "").trim()).length > 0;
  const mse = ((n?.mse ?? "").trim() || (g?.mse ?? "").trim()).length > 0;
  const plan = ((n?.plan ?? "").trim() || (g?.plan ?? "").trim()).length > 0;
  return hpi && mse && plan;
}

function rowToSavedChart(data: {
  id: string;
  patient_id: string;
  created_at: string;
  updated_at: string;
  started_at: string;
  ended_at: string | null;
  transcript: string | null;
  input: unknown;
  parsed: unknown;
  notes: unknown;
  generated_notes: unknown;
}): SavedChart {
  return {
    id: data.id,
    patientId: data.patient_id,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    startedAt: data.started_at,
    endedAt: data.ended_at,
    transcript: data.transcript ?? "",
    input: data.input as EncounterInput,
    parsed: data.parsed as ParsedEncounter,
    notes: data.notes as NoteOutputs,
    generatedNotes: data.generated_notes as NoteOutputs,
  };
}

const PRIOR_CHART_SCAN_LIMIT = 80;

async function fetchLatestPriorChart(patientId: string): Promise<SavedChart | null> {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    const encounters = devMemoryListEncounters(patientId);
    return encounters.find(encounterHasHpiMsePoc) ?? null;
  }

  const { data, error } = await supabase
    .from("encounters")
    .select("id, patient_id, started_at, ended_at, transcript, input, parsed, notes, generated_notes, created_at, updated_at")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false })
    .limit(PRIOR_CHART_SCAN_LIMIT);

  if (error) {
    console.warn("Unable to fetch last chart context:", error.message);
    return null;
  }

  const rows = Array.isArray(data) ? data : [];
  for (const row of rows) {
    const chart = rowToSavedChart(row);
    if (encounterHasHpiMsePoc(chart)) {
      return chart;
    }
  }

  return null;
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 503 });
  }

  const polishModel = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  const chartModel = process.env.OPENAI_CHART_MODEL?.trim() || polishModel;

  const body = (await request.json().catch(() => null)) as Body | null;
  const rawTranscript = typeof body?.transcript === "string" ? body.transcript : "";
  const patient = body?.patient && typeof body.patient === "object" ? body.patient : null;
  const encounterInput = body?.encounterInput && typeof body.encounterInput === "object" ? body.encounterInput : null;
  const chartSource = normalizeChartSource(body?.chartSource);

  /**
   * Patient is still required only so the app knows which organizational record
   * to attach the encounter to and so we can locate a prior encounter with HPI/MSE/POC.
   * Do not send patient demographic/diagnosis context to the model.
   */
  if (!patient || typeof patient.id !== "string" || typeof patient.name !== "string") {
    return NextResponse.json({ error: "Invalid request: patient required." }, { status: 400 });
  }

  const enablePsychotherapy = Boolean(encounterInput?.enablePsychotherapy);

  const transcriptForChart = await formatTranscriptForAi(rawTranscript, apiKey, polishModel);
  const rawTrim = rawTranscript.trim();
  const polishedTranscript =
    transcriptForChart.trim() && transcriptForChart.trim() !== rawTrim ? transcriptForChart.trim() : undefined;

  const explicitContext =
    typeof body?.lastChartContext === "string"
      ? body.lastChartContext
      : typeof body?.context === "string"
        ? body.context
        : "";

  const lastChartContext =
    explicitContext.trim() ||
    formatSavedChartForLastChartContext(await fetchLatestPriorChart(patient.id));

  const userContent = `TODAY_TRANSCRIPT:
${transcriptForChart.trim() || "(empty)"}

LAST_CHART_CONTEXT:
${lastChartContext.trim() || "(none)"}

Task:
Create a psychiatric follow-up chart from TODAY_TRANSCRIPT using LAST_CHART_CONTEXT only for continuity and baseline reference. Make the HPI and MSE thorough, natural, and clinically useful. Support 99309 through clinical substance. Return the required JSON object only.`;

  const chartingAgent = createPsychChartingAgent(chartModel, chartSource);

  let finalOutput: unknown;
  try {
    const result = await run(chartingAgent, userContent);
    finalOutput = result.finalOutput;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: `OpenAI Agents error: ${message.slice(0, 500)}` },
      { status: 502 },
    );
  }

  if (finalOutput == null) {
    return NextResponse.json({ error: "Empty model response." }, { status: 502 });
  }

  try {
    const { notes, parsed } = normalizeAiChartPayload(finalOutput, enablePsychotherapy);
    return NextResponse.json({ notes, parsed, ...(polishedTranscript ? { polishedTranscript } : {}) });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid chart payload.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
