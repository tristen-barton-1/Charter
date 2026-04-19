import { NextResponse } from "next/server";
import { diagnosisOrder } from "@/lib/diagnoses";
import type { PatientRecord } from "@/lib/types";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { devMemoryListPatients, devMemoryUpsertPatient } from "@/lib/dev-api-memory";

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

export async function GET() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ patients: devMemoryListPatients() });
  }

  const [{ data: patients, error: patientError }, { data: encounters, error: encounterError }] = await Promise.all([
    supabase
      .from("patients")
      .select("id, name, age, sex, room, facility, diagnoses, enable_psychotherapy, status, summary, last_seen, created_at, updated_at")
      .order("name", { ascending: true }),
    supabase
      .from("encounters")
      .select("id, patient_id, created_at, ended_at")
      .order("created_at", { ascending: false }),
  ]);

  if (patientError) {
    return NextResponse.json({ error: patientError.message }, { status: 500 });
  }

  if (encounterError) {
    return NextResponse.json({ error: encounterError.message }, { status: 500 });
  }

  const encounterStats = new Map<string, { count: number; latest: string | null }>();

  for (const encounter of encounters ?? []) {
    const current = encounterStats.get(encounter.patient_id) ?? { count: 0, latest: null };
    current.count += 1;
    current.latest = current.latest ?? encounter.ended_at ?? encounter.created_at ?? null;
    encounterStats.set(encounter.patient_id, current);
  }

  const payload = (patients ?? []).map((patient: any) => {
    const stats = encounterStats.get(patient.id);
    return toPatientRecord(patient, stats?.count ?? 0, stats?.latest ?? null);
  });

  return NextResponse.json({ patients: payload });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Partial<PatientRecord> | null;
  const age = typeof body?.age === "number" ? body.age : Number(body?.age);

  if (!body || typeof body.name !== "string" || !Number.isFinite(age)) {
    return NextResponse.json({ error: "Invalid patient payload." }, { status: 400 });
  }

  const insert = {
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
    const localPatient = toPatientRecord({
      id: `p-${Date.now()}`,
      ...insert,
      last_seen: insert.last_seen,
    });
    devMemoryUpsertPatient(localPatient);

    return NextResponse.json({ patient: localPatient }, { status: 201 });
  }

  const { data, error } = await supabase.from("patients").insert(insert).select().single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ patient: toPatientRecord(data) }, { status: 201 });
}
