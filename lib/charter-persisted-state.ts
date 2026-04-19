import type {
  EncounterInput,
  NoteDirtyFlags,
  NoteOutputs,
  ParsedEncounter,
  PatientRecord,
  SavedChart,
} from "@/lib/types";
import { createEmptyParsedEncounter } from "@/lib/parsed-encounter-defaults";
import { starterPatients } from "@/lib/patients";
import type { RecordFlowResult } from "@/lib/record-flow-storage";

export const CHARTER_STORAGE_KEY = "charter-psych-ltc-dashboard-v3";

export const PENDING_ENCOUNTER_KEY = "charter-pending-encounter";

export interface Workspace {
  input: EncounterInput;
  parsed: ParsedEncounter;
  notes: NoteOutputs;
  generatedNotes: NoteOutputs;
  dirty: NoteDirtyFlags;
  charts: SavedChart[];
  startedAt: string | null;
}

export type ViewMode = "dashboard" | "encounter";

export interface AppState {
  patients: PatientRecord[];
  activePatientId: string;
  encounterPatientId: string | null;
  viewMode: ViewMode;
  encounterStartedAt: string | null;
  startSignal: number;
  workspaces: Record<string, Workspace>;
}

export function createDirtyFlags(): NoteDirtyFlags {
  return {
    hpi: false,
    mse: false,
    plan: false,
    psychotherapy: false,
  };
}

export function emptyNoteOutputs(): NoteOutputs {
  return {
    hpi: "",
    mse: "",
    plan: "",
    psychotherapy: "",
  };
}

export function createWorkspaceFromPatient(patient: PatientRecord): Workspace {
  const input: EncounterInput = {
    age: patient.age,
    sex: patient.sex,
    diagnoses: patient.diagnoses,
    transcript: patient.transcript,
    enablePsychotherapy: patient.enablePsychotherapy,
  };
  const parsed = createEmptyParsedEncounter();
  const blank = emptyNoteOutputs();

  return {
    input,
    parsed,
    generatedNotes: blank,
    notes: blank,
    dirty: createDirtyFlags(),
    charts: [],
    startedAt: null,
  };
}

function createDefaultWorkspaces(): Record<string, Workspace> {
  return Object.fromEntries(starterPatients.map((patient) => [patient.id, createWorkspaceFromPatient(patient)]));
}

export function createDefaultAppState(): AppState {
  return {
    patients: starterPatients,
    activePatientId: starterPatients[0]?.id ?? "",
    encounterPatientId: null,
    viewMode: "dashboard",
    encounterStartedAt: null,
    startSignal: 0,
    workspaces: createDefaultWorkspaces(),
  };
}

function sanitizeChart(value: unknown, patientId: string): SavedChart | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<SavedChart>;
  if (
    !candidate.id ||
    !candidate.createdAt ||
    !candidate.updatedAt ||
    !candidate.startedAt ||
    !candidate.endedAt ||
    !candidate.input ||
    !candidate.parsed ||
    !candidate.notes ||
    !candidate.generatedNotes
  ) {
    return null;
  }

  return {
    id: candidate.id,
    patientId: typeof candidate.patientId === "string" ? candidate.patientId : patientId,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
    startedAt: candidate.startedAt,
    endedAt: candidate.endedAt ?? null,
    transcript: typeof candidate.transcript === "string" ? candidate.transcript : "",
    input: candidate.input as EncounterInput,
    parsed: candidate.parsed as ParsedEncounter,
    notes: candidate.notes as NoteOutputs,
    generatedNotes: candidate.generatedNotes as NoteOutputs,
  };
}

function sanitizeWorkspace(value: unknown, patientId = ""): Workspace | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<Workspace>;
  if (!candidate.input || !candidate.parsed || !candidate.notes || !candidate.generatedNotes || !candidate.dirty) {
    return null;
  }

  return {
    ...candidate,
    startedAt: typeof candidate.startedAt === "string" ? candidate.startedAt : null,
    charts: Array.isArray(candidate.charts)
      ? candidate.charts
          .map((chart) => sanitizeChart(chart, patientId))
          .filter((chart): chart is SavedChart => Boolean(chart))
      : [],
  } as Workspace;
}

export function sanitizePersistedState(value: unknown): AppState | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<AppState> & { workspaces?: Record<string, unknown>; patients?: unknown };
  const defaults = createDefaultAppState();
  const storedPatients = Array.isArray(candidate.patients)
    ? candidate.patients.filter((patient): patient is PatientRecord => {
        return Boolean(
          patient &&
            typeof patient === "object" &&
            typeof patient.id === "string" &&
            typeof patient.name === "string" &&
            typeof patient.age === "number" &&
            typeof patient.room === "string" &&
            typeof patient.facility === "string",
        );
      })
    : defaults.patients;

  const nextPatients = storedPatients.length > 0 ? storedPatients : defaults.patients;

  const workspaces = nextPatients.reduce<Record<string, Workspace>>((acc, patient) => {
    const stored = candidate.workspaces?.[patient.id];
    acc[patient.id] = sanitizeWorkspace(stored, patient.id) ?? createWorkspaceFromPatient(patient);
    return acc;
  }, {});

  return {
    patients: nextPatients,
    activePatientId:
      typeof candidate.activePatientId === "string" && workspaces[candidate.activePatientId]
        ? candidate.activePatientId
        : (nextPatients[0]?.id ?? ""),
    encounterPatientId:
      typeof candidate.encounterPatientId === "string" && workspaces[candidate.encounterPatientId]
        ? candidate.encounterPatientId
        : null,
    viewMode: candidate.viewMode === "encounter" ? "encounter" : "dashboard",
    encounterStartedAt: typeof candidate.encounterStartedAt === "string" ? candidate.encounterStartedAt : null,
    startSignal: typeof candidate.startSignal === "number" ? candidate.startSignal : 0,
    workspaces,
  };
}

export function loadPersistedAppState(): AppState | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const stored = window.localStorage.getItem(CHARTER_STORAGE_KEY);
    if (!stored) {
      return null;
    }
    return sanitizePersistedState(JSON.parse(stored));
  } catch {
    return null;
  }
}

export function savePersistedAppState(state: AppState): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(CHARTER_STORAGE_KEY, JSON.stringify(state));
}

export function applyAiChartResult(
  workspace: Workspace,
  result: { notes: NoteOutputs; parsed: ParsedEncounter; polishedTranscript?: string },
): Workspace {
  const psychotherapy = workspace.input.enablePsychotherapy ? result.notes.psychotherapy : "";
  const notes: NoteOutputs = { ...result.notes, psychotherapy };
  const input = result.polishedTranscript
    ? { ...workspace.input, transcript: result.polishedTranscript }
    : workspace.input;
  return {
    ...workspace,
    input,
    parsed: result.parsed,
    generatedNotes: notes,
    notes,
    dirty: createDirtyFlags(),
  };
}

export function createChartId(): string {
  return `chart-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function buildSavedChart(patientId: string, workspace: Workspace, startedAt: string | null): SavedChart {
  const timestamp = new Date().toISOString();
  return {
    id: createChartId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    patientId,
    startedAt: startedAt ?? new Date().toISOString(),
    endedAt: timestamp,
    transcript: workspace.input.transcript,
    input: workspace.input,
    parsed: workspace.parsed,
    notes: workspace.notes,
    generatedNotes: workspace.generatedNotes,
  };
}

export function consumePendingEncounter(): { patientId: string; startedAt: string } | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = sessionStorage.getItem(PENDING_ENCOUNTER_KEY);
    if (!raw) {
      return null;
    }
    sessionStorage.removeItem(PENDING_ENCOUNTER_KEY);
    const j = JSON.parse(raw) as { patientId?: string; startedAt?: string };
    if (typeof j.patientId === "string" && typeof j.startedAt === "string") {
      return { patientId: j.patientId, startedAt: j.startedAt };
    }
  } catch {
  }
  return null;
}

export function applyPendingEncounterToState(state: AppState, patientId: string, startedAt: string): AppState {
  const patient = state.patients.find((p) => p.id === patientId);
  if (!patient) {
    return state;
  }
  const w = state.workspaces[patientId] ?? createWorkspaceFromPatient(patient);
  return {
    ...state,
    activePatientId: patientId,
    encounterPatientId: patientId,
    viewMode: "dashboard",
    encounterStartedAt: startedAt,
    startSignal: state.startSignal + 1,
    workspaces: {
      ...state.workspaces,
      [patientId]: { ...w, startedAt },
    },
  };
}

export function ensureEncounterSessionState(state: AppState, patientId: string): AppState {
  const patient = state.patients.find((p) => p.id === patientId);
  if (!patient) {
    return state;
  }
  const w = state.workspaces[patientId] ?? createWorkspaceFromPatient(patient);
  const startedAt = w.startedAt ?? new Date().toISOString();
  return {
    ...state,
    activePatientId: patientId,
    encounterPatientId: patientId,
    viewMode: "dashboard",
    encounterStartedAt: state.encounterStartedAt ?? startedAt,
    startSignal: state.startSignal + 1,
    workspaces: {
      ...state.workspaces,
      [patientId]: { ...w, startedAt },
    },
  };
}

export function mergeRecordFlowResultIntoState(state: AppState, data: RecordFlowResult): AppState {
  const displayTx = data.polishedTranscript ?? data.transcript;
  const enc =
    data.encounterInput ??
    ({
      age: data.patient.age,
      sex: data.patient.sex,
      diagnoses: data.patient.diagnoses,
      transcript: displayTx,
      enablePsychotherapy: data.patient.enablePsychotherapy,
    } satisfies EncounterInput);
  const base = state.workspaces[data.patientId] ?? createWorkspaceFromPatient(data.patient);
  const psychotherapy = enc.enablePsychotherapy ? data.notes.psychotherapy : "";
  const notes: NoteOutputs = { ...data.notes, psychotherapy };
  return {
    ...state,
    activePatientId: data.patientId,
    encounterPatientId: data.patientId,
    viewMode: "dashboard",
    encounterStartedAt: state.encounterStartedAt ?? base.startedAt ?? new Date().toISOString(),
    startSignal: state.startSignal + 1,
    patients: state.patients.some((p) => p.id === data.patientId) ? state.patients : [...state.patients, data.patient],
    workspaces: {
      ...state.workspaces,
      [data.patientId]: {
        ...base,
        input: { ...enc, transcript: displayTx },
        parsed: data.parsed,
        notes,
        generatedNotes: notes,
        dirty: createDirtyFlags(),
      },
    },
  };
}
