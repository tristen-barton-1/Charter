import { NextResponse } from "next/server";
import { diagnosisOrder } from "@/lib/diagnoses";
import type { PatientRecord } from "@/lib/types";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { devMemoryGetPatient } from "@/lib/dev-api-memory";

const diagnosisSet = new Set<string>(diagnosisOrder);

function isSex(value: unknown): value is PatientRecord["sex"] {
  return value === "male" || value === "female" || value === "other" || value === null;
}

function normalizeDiagnoses(value: unknown): PatientRecord["diagnoses"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((code): code is PatientRecord["diagnoses"][number] => diagnosisSet.has(String(code)));
}

function toPatientRecord(row: any, encounterCount = 0, latestEncounterAt: string | null = null): PatientRecord {
  return {
    id: row.id,
    name: row.name,
    age: row.age,
    sex: isSex(row.sex) ? row.sex : null,
    room: row.room,
    facility: row.facility,
    diagnoses: normalizeDiagnoses(row.diagnoses),
    transcript: "",
    enablePsychotherapy: Boolean(row.enable_psychotherapy),
    status: row.status ?? "",
    summary: row.summary ?? "",
    lastSeen: row.last_seen ?? "",
    encounterCount,
    latestEncounterAt,
  };
}

function withEncounterCount(patient: PatientRecord): PatientRecord {
  return {
    ...patient,
    encounterCount: patient.encounterCount ?? 0,
    latestEncounterAt: patient.latestEncounterAt ?? null,
  };
}

async function loadEncounterStats(supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>) {
  const { data } = await supabase
    .from("encounters")
    .select("patient_id, created_at, ended_at")
    .order("created_at", { ascending: false });

  const stats = new Map<string, { count: number; latest: string | null }>();

  for (const encounter of data ?? []) {
    const current = stats.get(encounter.patient_id) ?? { count: 0, latest: null };
    current.count += 1;
    current.latest = current.latest ?? encounter.ended_at ?? encounter.created_at ?? null;
    stats.set(encounter.patient_id, current);
  }

  return stats;
}

export async function PUT(request: Request, context: any) {
  const { patientId } = await context.params;
  const body = (await request.json().catch(() => null)) as Partial<PatientRecord> | null;
  const age = typeof body?.age === "number" ? body.age : Number(body?.age);

  if (!body || typeof body.name !== "string" || !Number.isFinite(age)) {
    return NextResponse.json({ error: "Invalid patient payload." }, { status: 400 });
  }

  const update = {
    name: body.name.trim(),
    age: Math.trunc(age),
    sex: isSex(body.sex) ? body.sex : null,
    room: typeof body.room === "string" && body.room.trim() ? body.room.trim() : "Room TBD",
    facility: typeof body.facility === "string" && body.facility.trim() ? body.facility.trim() : "Long-term care facility",
    diagnoses: normalizeDiagnoses(body.diagnoses),
    enable_psychotherapy: Boolean(body.enablePsychotherapy),
    status: typeof body.status === "string" ? body.status : "",
    summary: typeof body.summary === "string" ? body.summary : "",
    last_seen: typeof body.lastSeen === "string" ? body.lastSeen : "Today",
  };

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({
      patient: withEncounterCount(
        toPatientRecord({
          id: patientId,
          ...update,
          last_seen: update.last_seen,
        }),
      ),
    });
  }

  const { data, error } = await supabase
    .from("patients")
    .update(update)
    .eq("id", patientId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const stats = await loadEncounterStats(supabase);
  const encounterStats = stats.get(data.id);
  return NextResponse.json({
    patient: toPatientRecord(data, encounterStats?.count ?? 0, encounterStats?.latest ?? null),
  });
}

export async function DELETE(_request: Request, context: any) {
  const { patientId } = await context.params;
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return NextResponse.json({ success: true, patientId });
  }

  const { error } = await supabase
    .from("patients")
    .delete()
    .eq("id", patientId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function GET(request: Request, context: any) {
  const { patientId } = await context.params;
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    const mem = devMemoryGetPatient(patientId);
    if (!mem) {
      return NextResponse.json({ error: "Patient not found." }, { status: 404 });
    }
    return NextResponse.json({ patient: withEncounterCount(mem) });
  }

  const { data, error } = await supabase
    .from("patients")
    .select("id, name, age, sex, room, facility, diagnoses, enable_psychotherapy, status, summary, last_seen")
    .eq("id", patientId)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: encounters } = await supabase
    .from("encounters")
    .select("patient_id, created_at, ended_at")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });

  const latestEncounterAt = encounters?.[0]?.ended_at ?? encounters?.[0]?.created_at ?? null;
  return NextResponse.json({
    patient: toPatientRecord(data, encounters?.length ?? 0, latestEncounterAt),
  });
}
