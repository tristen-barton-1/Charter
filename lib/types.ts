export type DiagnosisCode =
  | "alzheimers"
  | "mdd"
  | "gad"
  | "schizoaffective"
  | "bipolar"
  | "delusional_disorder"
  | "schizophrenia"
  | "dementia_mood"
  | "dementia_anxiety"
  | "dementia_behavior"
  | "insomnia"
  | "skin_picking"
  | "impulse_control";

export type Sex = "male" | "female" | "other" | null;
export type DenialMode = "none" | "short" | "full";
export type MsePreset = "standard" | "dementia" | "psychosis";

export interface EncounterInput {
  age: number | null;
  sex: Sex;
  diagnoses: DiagnosisCode[];
  transcript: string;
  enablePsychotherapy: boolean;
}

export interface ParsedFlags {
  anxiety?: boolean;
  depression?: boolean;
  sleepPoor?: boolean;
  sleepStable?: boolean;
  appetiteGood?: boolean;
  medCompliant?: boolean;
  paranoia?: boolean;
  delusions?: boolean;
  agitation?: boolean;
  pacing?: boolean;
  wandering?: boolean;
  notRedirectable?: boolean;
  confused?: boolean;
  minimalSpeech?: boolean;
  calm?: boolean;
  cooperative?: boolean;
}

export interface ParsedEncounter {
  staffSummary?: string;
  denialMode: DenialMode;
  msePreset: MsePreset;
  flags: ParsedFlags;
}

export interface NoteOutputs {
  hpi: string;
  mse: string;
  plan: string;
  psychotherapy: string;
}

export type NoteSection = keyof NoteOutputs;

export type NoteDirtyFlags = Record<NoteSection, boolean>;

export interface EncounterDraft {
  input: EncounterInput;
  parsed: ParsedEncounter;
  notes: NoteOutputs;
  generatedNotes: NoteOutputs;
}

export interface PatientRecord {
  id: string;
  name: string;
  age: number;
  sex: Sex;
  room: string;
  facility: string;
  diagnoses: DiagnosisCode[];
  transcript: string;
  enablePsychotherapy: boolean;
  status: string;
  summary: string;
  lastSeen: string;
  encounterCount?: number;
  latestEncounterAt?: string | null;
}

export interface SavedChart {
  id: string;
  patientId: string;
  createdAt: string;
  updatedAt: string;
  startedAt: string;
  endedAt: string | null;
  transcript: string;
  input: EncounterInput;
  parsed: ParsedEncounter;
  notes: NoteOutputs;
  generatedNotes: NoteOutputs;
}
