import { NextResponse } from "next/server";
import { run } from "@openai/agents";
import type { DiagnosisCode, EncounterInput, PatientRecord } from "@/lib/types";
import { normalizeAiChartPayload } from "@/lib/ai-chart-response";
import { diagnosisLabels } from "@/lib/diagnoses";
import { createPsychChartingAgent } from "@/lib/charting-agent";
import { formatTranscriptForAi } from "@/lib/transcript-server-format";

export const maxDuration = 120;

type Body = {
  patient?: Partial<PatientRecord> | null;
  transcript?: string;
  encounterInput?: EncounterInput | null;
};

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 503 });
  }

  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";

  const body = (await request.json().catch(() => null)) as Body | null;
  const rawTranscript = typeof body?.transcript === "string" ? body.transcript : "";
  const patient = body?.patient && typeof body.patient === "object" ? body.patient : null;
  const encounterInput = body?.encounterInput && typeof body.encounterInput === "object" ? body.encounterInput : null;

  if (!patient || typeof patient.name !== "string") {
    return NextResponse.json({ error: "Invalid request: patient required." }, { status: 400 });
  }

  const diagnoses = Array.isArray(patient.diagnoses)
    ? (patient.diagnoses.filter((c): c is DiagnosisCode => typeof c === "string" && c in diagnosisLabels) as DiagnosisCode[])
    : [];

  const diagnosisNames = diagnoses.map((code) => diagnosisLabels[code]);

  const enablePsychotherapy = Boolean(encounterInput?.enablePsychotherapy);

  const transcriptForChart = await formatTranscriptForAi(rawTranscript, apiKey, model);
  const rawTrim = rawTranscript.trim();
  const polishedTranscript =
    transcriptForChart.trim() && transcriptForChart.trim() !== rawTrim ? transcriptForChart.trim() : undefined;

  const patientPayload = {
    name: patient.name,
    age: typeof patient.age === "number" ? patient.age : null,
    sex: patient.sex ?? null,
    room: typeof patient.room === "string" ? patient.room : "",
    facility: typeof patient.facility === "string" ? patient.facility : "",
    diagnoses: diagnosisNames,
    summary: typeof patient.summary === "string" ? patient.summary : "",
    status: typeof patient.status === "string" ? patient.status : "",
    enablePsychotherapy,
    encounterAge: encounterInput?.age ?? null,
    encounterSex: encounterInput?.sex ?? null,
    encounterDiagnoses: (encounterInput?.diagnoses ?? diagnoses).map((code) =>
      typeof code === "string" && code in diagnosisLabels ? diagnosisLabels[code as DiagnosisCode] : String(code),
    ),
  };

  const userContent = `PATIENT_CONTEXT_JSON:\n${JSON.stringify(patientPayload, null, 2)}\n\nVISIT_TRANSCRIPT:\n${transcriptForChart.trim() || "(empty)"}`;

  const chartingAgent = createPsychChartingAgent(model);

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
