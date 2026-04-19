import { NextResponse } from "next/server";
import type { EncounterInput, NoteOutputs, ParsedEncounter, SavedChart } from "@/lib/types";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { devMemoryAppendEncounter, devMemoryListEncounters } from "@/lib/dev-api-memory";

function toChart(row: any): SavedChart {
  return {
    id: row.id,
    patientId: row.patient_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    transcript: row.transcript ?? "",
    input: row.input as EncounterInput,
    parsed: row.parsed as ParsedEncounter,
    notes: row.notes as NoteOutputs,
    generatedNotes: row.generated_notes as NoteOutputs,
  };
}

export async function GET(
  _request: Request,
  context: any,
) {
  const { patientId } = await context.params;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ encounters: devMemoryListEncounters(patientId) });
  }

  const { data, error } = await supabase
    .from("encounters")
    .select("id, patient_id, started_at, ended_at, transcript, input, parsed, notes, generated_notes, created_at, updated_at")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ encounters: (data ?? []).map(toChart) });
}

export async function POST(
  request: Request,
  context: any,
) {
  const { patientId } = await context.params;
  const body = (await request.json().catch(() => null)) as Partial<SavedChart> | null;

  if (!body || !body.input || !body.parsed || !body.notes || !body.generatedNotes) {
    return NextResponse.json({ error: "Invalid encounter payload." }, { status: 400 });
  }

  const startedAt = typeof body.startedAt === "string" ? body.startedAt : new Date().toISOString();
  const endedAt = typeof body.endedAt === "string" ? body.endedAt : new Date().toISOString();

  const insert = {
    patient_id: patientId,
    started_at: startedAt,
    ended_at: endedAt,
    transcript: typeof body.transcript === "string" ? body.transcript : "",
    input: body.input,
    parsed: body.parsed,
    notes: body.notes,
    generated_notes: body.generatedNotes,
  };

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    const chart = toChart({
      id: `e-${Date.now()}`,
      patient_id: patientId,
      created_at: endedAt,
      updated_at: endedAt,
      started_at: startedAt,
      ended_at: endedAt,
      transcript: insert.transcript,
      input: insert.input,
      parsed: insert.parsed,
      notes: insert.notes,
      generated_notes: insert.generated_notes,
    });
    devMemoryAppendEncounter(patientId, chart);
    return NextResponse.json({ encounter: chart }, { status: 201 });
  }

  const { data, error } = await supabase.from("encounters").insert(insert).select().single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ encounter: toChart(data) }, { status: 201 });
}
