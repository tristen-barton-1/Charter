import { NextResponse } from "next/server";
import type { EncounterInput, NoteOutputs, ParsedEncounter, SavedChart } from "@/lib/types";
import { devMemoryGetEncounter, devMemoryUpdateEncounter } from "@/lib/dev-api-memory";
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

export async function PUT(request: Request, context: any) {
  const { patientId, encounterId } = await context.params;
  const body = (await request.json().catch(() => null)) as Partial<SavedChart> | null;

  if (!body || typeof body.input !== "object" || typeof body.parsed !== "object" || !body.notes || !body.generatedNotes) {
    return NextResponse.json({ error: "Invalid encounter payload." }, { status: 400 });
  }

  const updatedAt = new Date().toISOString();
  const patch = {
    updated_at: updatedAt,
    ended_at: typeof body.endedAt === "string" ? body.endedAt : updatedAt,
    transcript: typeof body.transcript === "string" ? body.transcript : "",
    input: body.input,
    parsed: body.parsed,
    notes: body.notes,
    generated_notes: body.generatedNotes,
  };

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    const existing = devMemoryGetEncounter(patientId, encounterId);
    if (!existing) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    const merged: SavedChart = {
      ...existing,
      id: encounterId,
      patientId,
      updatedAt,
      endedAt: typeof body.endedAt === "string" ? body.endedAt : updatedAt,
      transcript: patch.transcript,
      input: patch.input as EncounterInput,
      parsed: patch.parsed as ParsedEncounter,
      notes: patch.notes as NoteOutputs,
      generatedNotes: patch.generated_notes as NoteOutputs,
    };
    devMemoryUpdateEncounter(patientId, encounterId, merged);
    return NextResponse.json({ encounter: merged });
  }

  const { data, error } = await supabase
    .from("encounters")
    .update(patch)
    .eq("id", encounterId)
    .eq("patient_id", patientId)
    .select(
      "id, patient_id, started_at, ended_at, transcript, input, parsed, notes, generated_notes, created_at, updated_at",
    )
    .single();

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
