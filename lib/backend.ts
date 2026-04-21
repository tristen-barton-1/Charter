import type { EncounterInput, NoteOutputs, ParsedEncounter, PatientRecord, SavedChart } from "@/lib/types";

type PatientsResponse = {
  patients: PatientRecord[];
};

type PatientResponse = {
  patient: PatientRecord;
};

type DeleteResponse = {
  success: boolean;
};

type EncountersResponse = {
  encounters: SavedChart[];
};

type EncounterResponse = {
  encounter: SavedChart;
};

type ChartFromConversationResponse = {
  notes: NoteOutputs;
  parsed: ParsedEncounter;
  polishedTranscript?: string;
};

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message = body && typeof body === "object" && "error" in body ? String(body.error) : response.statusText;
    throw new Error(message || "Request failed.");
  }

  return (await response.json()) as T;
}

export async function fetchPatient(patientId: string): Promise<PatientRecord> {
  const response = await fetch(`/api/patients/${patientId}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
  const body = await parseJson<{ patient: PatientRecord }>(response);
  return body.patient;
}

export async function fetchPatients(): Promise<PatientRecord[]> {
  const response = await fetch("/api/patients", {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
  const body = await parseJson<PatientsResponse>(response);
  return body.patients;
}

export async function createPatient(patient: PatientRecord): Promise<PatientRecord> {
  const response = await fetch("/api/patients", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(patient),
  });
  const body = await parseJson<PatientResponse>(response);
  return body.patient;
}

export async function updatePatient(patientId: string, patient: PatientRecord): Promise<PatientRecord> {
  const response = await fetch(`/api/patients/${patientId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(patient),
  });
  const body = await parseJson<PatientResponse>(response);
  return body.patient;
}

export async function deletePatient(patientId: string): Promise<void> {
  const response = await fetch(`/api/patients/${patientId}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
  });
  await parseJson<DeleteResponse>(response);
}

export async function fetchPatientEncounters(patientId: string): Promise<SavedChart[]> {
  const response = await fetch(`/api/patients/${patientId}/encounters`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
  const body = await parseJson<EncountersResponse>(response);
  return body.encounters;
}

export async function fetchEncounter(patientId: string, encounterId: string): Promise<SavedChart | null> {
  const response = await fetch(
    `/api/patients/${patientId}/encounters/${encodeURIComponent(encounterId)}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
    },
  );
  if (response.status === 404) {
    return null;
  }
  const body = await parseJson<EncounterResponse>(response);
  return body.encounter;
}

export async function chartFromConversation(payload: {
  patient: PatientRecord;
  transcript: string;
  encounterInput: EncounterInput;
}): Promise<ChartFromConversationResponse> {
  const response = await fetch("/api/chart-from-conversation", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return parseJson<ChartFromConversationResponse>(response);
}

export async function polishTranscriptText(transcript: string): Promise<string> {
  const response = await fetch("/api/polish-transcript", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ transcript }),
  });
  const body = await parseJson<{ transcript: string }>(response);
  return typeof body.transcript === "string" ? body.transcript : "";
}

export async function transcribeVisitAudio(blob: Blob): Promise<string> {
  const formData = new FormData();
  const name = blob.type.includes("mp4") ? "visit.m4a" : "visit.webm";
  formData.append("file", blob, name);
  const response = await fetch("/api/transcribe-audio", {
    method: "POST",
    body: formData,
  });
  const body = await parseJson<{ text: string }>(response);
  return typeof body.text === "string" ? body.text : "";
}

export async function createEncounter(patientId: string, encounter: SavedChart): Promise<SavedChart> {
  const response = await fetch(`/api/patients/${patientId}/encounters`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(encounter),
  });
  const body = await parseJson<EncounterResponse>(response);
  return body.encounter;
}

export async function deleteEncounter(patientId: string, encounterId: string): Promise<void> {
  const response = await fetch(`/api/patients/${patientId}/encounters/${encodeURIComponent(encounterId)}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
  });
  await parseJson<DeleteResponse>(response);
}
