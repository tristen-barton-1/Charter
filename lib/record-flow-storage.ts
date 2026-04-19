import type { EncounterInput, NoteOutputs, ParsedEncounter, PatientRecord } from "@/lib/types";

export const RECORD_FLOW_CONTEXT_KEY = "charter-record-flow-context";
export const RECORD_FLOW_RESULT_KEY = "charter-record-flow-result";
export const RECORD_FLOW_RESUME_KEY = "charter-resume-encounter";

export type RecordFlowContext = {
  encounterInput: EncounterInput;
};

export type RecordFlowResult = {
  patientId: string;
  patient: PatientRecord;
  encounterInput?: EncounterInput;
  transcript: string;
  polishedTranscript?: string;
  notes: NoteOutputs;
  parsed: ParsedEncounter;
};
