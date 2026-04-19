import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3000";

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body && typeof body.error === "string" ? body.error : res.statusText;
    throw new Error(`${msg} (${res.status})`);
  }
  return body;
}

async function findOrCreatePatient(patientPayload) {
  const list = await fetchJson(`${BASE}/api/patients`, { method: "GET" });
  const patients = Array.isArray(list.patients) ? list.patients : [];
  const name = patientPayload.name.trim().toLowerCase();
  const existing = patients.find((p) => p.name.trim().toLowerCase() === name);
  if (existing) {
    console.log(`Using existing patient: ${existing.name} (${existing.id})`);
    return existing;
  }
  const created = await fetchJson(`${BASE}/api/patients`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: patientPayload.name,
      age: patientPayload.age,
      sex: patientPayload.sex,
      diagnoses: patientPayload.diagnoses,
      enablePsychotherapy: Boolean(patientPayload.enablePsychotherapy),
    }),
  });
  console.log(`Created patient: ${created.patient.name} (${created.patient.id})`);
  return created.patient;
}

async function main() {
  const payloadPath = path.join(__dirname, "seed-blake-west-payload.json");
  const raw = JSON.parse(fs.readFileSync(payloadPath, "utf8"));
  const patientPartial = raw.patient;
  const enablePsychotherapy = Boolean(raw.encounterInput?.enablePsychotherapy);

  const patient = await findOrCreatePatient({
    ...patientPartial,
    enablePsychotherapy,
  });

  const encounterInput = {
    age: patient.age,
    sex: patient.sex,
    diagnoses: patient.diagnoses,
    transcript: "",
    enablePsychotherapy: enablePsychotherapy || patient.enablePsychotherapy,
  };

  console.log("Running chart-from-conversation (OpenAI)…");
  const chart = await fetchJson(`${BASE}/api/chart-from-conversation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      patient,
      transcript: raw.transcript,
      encounterInput,
    }),
  });

  const displayTranscript = chart.polishedTranscript ?? raw.transcript;
  const notes = { ...chart.notes };
  if (!encounterInput.enablePsychotherapy) {
    notes.psychotherapy = "";
  }

  const encounterInputFull = {
    ...encounterInput,
    transcript: displayTranscript,
  };

  const startedAt = new Date().toISOString();
  const endedAt = new Date().toISOString();

  console.log("Saving encounter…");
  const saved = await fetchJson(`${BASE}/api/patients/${encodeURIComponent(patient.id)}/encounters`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      startedAt,
      endedAt,
      transcript: displayTranscript,
      input: encounterInputFull,
      parsed: chart.parsed,
      notes,
      generatedNotes: { ...notes },
    }),
  });

  const enc = saved.encounter;
  console.log("");
  console.log("Encounter saved:", enc.id);
  console.log("History URL:", `${BASE}/patients/${patient.id}/history`);
  console.log("");
  console.log("Without Supabase, encounters are kept in server memory until you restart `npm run dev`.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
