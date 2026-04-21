import type { PatientRecord, SavedChart } from "@/lib/types";

const patients = new Map<string, PatientRecord>();
const encountersByPatient = new Map<string, SavedChart[]>();

export function devMemoryUpsertPatient(patient: PatientRecord): void {
  patients.set(patient.id, patient);
}

export function devMemoryListPatients(): PatientRecord[] {
  return Array.from(patients.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function devMemoryGetPatient(patientId: string): PatientRecord | undefined {
  return patients.get(patientId);
}

export function devMemoryAppendEncounter(patientId: string, chart: SavedChart): void {
  const list = encountersByPatient.get(patientId) ?? [];
  encountersByPatient.set(patientId, [chart, ...list]);
  const p = patients.get(patientId);
  if (p) {
    const latest = chart.endedAt ?? chart.createdAt;
    patients.set(patientId, {
      ...p,
      encounterCount: (p.encounterCount ?? 0) + 1,
      latestEncounterAt: latest,
    });
  }
}

export function devMemoryListEncounters(patientId: string): SavedChart[] {
  return [...(encountersByPatient.get(patientId) ?? [])];
}

export function devMemoryGetEncounter(patientId: string, encounterId: string): SavedChart | undefined {
  return encountersByPatient.get(patientId)?.find((e) => e.id === encounterId);
}
