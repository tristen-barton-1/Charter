import { NextResponse } from "next/server";
import type { EncounterInput, NoteOutputs, ParsedEncounter, SavedChart } from "@/lib/types";
import { devMemoryGetEncounter } from "@/lib/dev-api-memory";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

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

export async function GET(_request: Request, context: any) {
  const { patientId, encounterId } = await context.params;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    const chart = devMemoryGetEncounter(patientId, encounterId);
    if (!chart) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    return NextResponse.json({ encounter: chart });
  }

  const { data, error } = await supabase
    .from("encounters")
    .select(
      "id, patient_id, started_at, ended_at, transcript, input, parsed, notes, generated_notes, created_at, updated_at",
    )
    .eq("patient_id", patientId)
    .eq("id", encounterId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json({ encounter: toChart(data) });
}

export async function DELETE(_request: Request, context: any) {
  const { patientId, encounterId } = await context.params;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ success: true });
  }

  const { error } = await supabase
    .from("encounters")
    .delete()
    .eq("id", encounterId)
    .eq("patient_id", patientId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
