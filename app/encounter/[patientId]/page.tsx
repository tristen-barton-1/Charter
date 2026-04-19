"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Bot } from "lucide-react";
import EncounterForm from "@/components/encounter-form";
import NoteOutput from "@/components/note-output";
import { Button } from "@/components/ui/button";
import type { EncounterInput, NoteOutputs, PatientRecord, SavedChart } from "@/lib/types";
import {
  applyAiChartResult,
  applyPendingEncounterToState,
  buildSavedChart,
  CHARTER_STORAGE_KEY,
  consumePendingEncounter,
  createDefaultAppState,
  createWorkspaceFromPatient,
  ensureEncounterSessionState,
  savePersistedAppState,
  sanitizePersistedState,
  type AppState,
  type Workspace,
} from "@/lib/charter-persisted-state";
import {
  chartFromConversation,
  createEncounter as apiCreateEncounter,
  fetchPatients,
  polishTranscriptText,
} from "@/lib/backend";
import {
  RECORD_FLOW_CONTEXT_KEY,
  type RecordFlowContext,
} from "@/lib/record-flow-storage";

const EMPTY: PatientRecord = {
  id: "__empty__",
  name: "",
  age: 0,
  sex: null,
  room: "",
  facility: "",
  diagnoses: [],
  transcript: "",
  enablePsychotherapy: false,
  status: "",
  summary: "",
  lastSeen: "",
};

async function persistEncounter(patientId: string, workspace: Workspace, startedAt: string | null): Promise<SavedChart> {
  const localChart = buildSavedChart(patientId, workspace, startedAt);
  try {
    return await apiCreateEncounter(patientId, localChart);
  } catch {
    return localChart;
  }
}

export default function EncounterPage() {
  const router = useRouter();
  const params = useParams();
  const patientId = typeof params.patientId === "string" ? params.patientId : "";

  const defaultState = useMemo(() => createDefaultAppState(), []);
  const [hydrated, setHydrated] = useState(false);
  const [appState, setAppState] = useState<AppState>(defaultState);
  const [aiChartLoading, setAiChartLoading] = useState(false);
  const [polishLoading, setPolishLoading] = useState(false);
  const [aiChartError, setAiChartError] = useState<string | null>(null);

  useEffect(() => {
    if (!patientId) {
      router.replace("/");
      return;
    }
    try {
      const raw = window.localStorage.getItem(CHARTER_STORAGE_KEY);
      let next = raw ? sanitizePersistedState(JSON.parse(raw)) : null;
      if (!next) {
        next = createDefaultAppState();
      }
      const pend = consumePendingEncounter();
      if (pend && pend.patientId === patientId) {
        next = applyPendingEncounterToState(next, pend.patientId, pend.startedAt);
           } else {
        next = ensureEncounterSessionState(next, patientId);
      }
      savePersistedAppState(next);
      setAppState(next);
    } catch {
      router.replace("/");
    } finally {
      setHydrated(true);
    }
  }, [patientId, router]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const remotePatients = await fetchPatients();
        if (cancelled || remotePatients.length === 0) {
          return;
        }
        setAppState((prev) => {
          const nextWorkspaces = remotePatients.reduce<Record<string, Workspace>>((acc, patient) => {
            acc[patient.id] = prev.workspaces[patient.id] ?? createWorkspaceFromPatient(patient);
            return acc;
          }, {});
          const merged: AppState = {
            ...prev,
            patients: remotePatients,
            workspaces: nextWorkspaces,
            activePatientId: remotePatients.some((p) => p.id === prev.activePatientId)
              ? prev.activePatientId
              : remotePatients[0].id,
          };
          savePersistedAppState(merged);
          return merged;
        });
      } catch {
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    savePersistedAppState(appState);
  }, [appState, hydrated]);

  useEffect(() => {
    if (!hydrated || !patientId || appState.patients.length === 0) {
      return;
    }
    if (!appState.patients.some((p) => p.id === patientId)) {
      router.replace("/");
    }
  }, [hydrated, patientId, appState.patients, router]);

  const patient = appState.patients.find((p) => p.id === patientId) ?? EMPTY;
  const workspace = appState.workspaces[patientId] ?? createWorkspaceFromPatient(patient);
  const encounterStartedAt = appState.encounterStartedAt;

  function setWorkspace(updater: (w: Workspace) => Workspace) {
    setAppState((prev) => ({
      ...prev,
      workspaces: {
        ...prev.workspaces,
        [patientId]: updater(prev.workspaces[patientId] ?? createWorkspaceFromPatient(patient)),
      },
    }));
  }

  function syncInput<K extends keyof EncounterInput>(key: K, value: EncounterInput[K]) {
    if (key === "transcript") {
      setWorkspace((w) => ({
        ...w,
        input: { ...w.input, transcript: value as string },
      }));
      return;
    }
    setWorkspace((w) => {
      const next: Workspace = {
        ...w,
        input: { ...w.input, [key]: value } as EncounterInput,
      };
      if (key === "enablePsychotherapy" && value === false) {
        return {
          ...next,
          notes: { ...next.notes, psychotherapy: "" },
          generatedNotes: { ...next.generatedNotes, psychotherapy: "" },
          dirty: { ...next.dirty, psychotherapy: false },
        };
      }
      return next;
    });
  }

  function toggleDiagnosis(diagnosis: EncounterInput["diagnoses"][number]) {
    setWorkspace((w) => {
      const has = w.input.diagnoses.includes(diagnosis);
      const diagnoses = has
        ? w.input.diagnoses.filter((c) => c !== diagnosis)
        : [...w.input.diagnoses, diagnosis];
      return { ...w, input: { ...w.input, diagnoses } };
    });
  }

  async function runPolishTranscript() {
    setAiChartError(null);
    setPolishLoading(true);
    try {
      const text = await polishTranscriptText(workspace.input.transcript);
      syncInput("transcript", text);
    } catch (e) {
      setAiChartError(e instanceof Error ? e.message : "Polish failed.");
    } finally {
      setPolishLoading(false);
    }
  }

  async function runAiChartFromConversation() {
    if (!patient.name.trim() || patient.id === "__empty__") {
      setAiChartError("Invalid patient.");
      return;
    }
    setAiChartError(null);
    setAiChartLoading(true);
    try {
      const result = await chartFromConversation({
        patient,
        transcript: workspace.input.transcript,
        encounterInput: workspace.input,
      });
      setWorkspace((w) => applyAiChartResult(w, result));
    } catch (e) {
      setAiChartError(e instanceof Error ? e.message : "AI chart failed.");
    } finally {
      setAiChartLoading(false);
    }
  }

  function startRecordVisit() {
    sessionStorage.setItem(
      RECORD_FLOW_CONTEXT_KEY,
      JSON.stringify({ encounterInput: workspace.input } satisfies RecordFlowContext),
    );
    router.push(`/encounter/${patientId}/record`);
  }

  function resetSection(section: keyof NoteOutputs) {
    setWorkspace((w) => ({
      ...w,
      notes: { ...w.notes, [section]: w.generatedNotes[section] },
      dirty: { ...w.dirty, [section]: false },
    }));
  }

  function editSection(section: keyof NoteOutputs, value: string) {
    setWorkspace((w) => ({
      ...w,
      notes: { ...w.notes, [section]: value },
      dirty: { ...w.dirty, [section]: true },
    }));
  }

  function cancelEncounter() {
    const p = appState.patients.find((x) => x.id === patientId);
    if (!p) {
      router.push("/");
      return;
    }
    setAppState((prev) => {
      const next: AppState = {
        ...prev,
        encounterPatientId: null,
        encounterStartedAt: null,
        workspaces: {
          ...prev.workspaces,
          [patientId]: createWorkspaceFromPatient(p),
        },
      };
      savePersistedAppState(next);
      return next;
    });
    router.push("/");
  }

  function endEncounter() {
    void (async () => {
      const startedAt = encounterStartedAt ?? workspace.startedAt ?? new Date().toISOString();
      const savedChart = await persistEncounter(patientId, workspace, startedAt);
      setAppState((prev) => {
        const w = prev.workspaces[patientId];
        if (!w) {
          return prev;
        }
        const next: AppState = {
          ...prev,
          encounterPatientId: null,
          encounterStartedAt: null,
          workspaces: {
            ...prev.workspaces,
            [patientId]: {
              ...w,
              charts: [savedChart, ...w.charts.filter((c) => c.id !== savedChart.id)],
              startedAt: null,
            },
          },
        };
        savePersistedAppState(next);
        return next;
      });
      router.push("/");
    })();
  }

  if (!hydrated || !patientId || patient.id === "__empty__") {
    return (
      <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
        <p className="text-sm text-slate-400">Loading encounter…</p>
      </main>
    );
  }

  const startSignal = appState.startSignal;

  return (
    <main className="relative min-h-screen pb-28 pt-4 sm:pb-10 sm:pt-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 sm:px-4 lg:px-6">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-700/80 bg-slate-900/60 px-5 py-4 sm:px-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Encounter</p>
            <h1 className="text-xl font-semibold text-slate-50 sm:text-2xl">{patient.name}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={cancelEncounter}>
              Cancel encounter
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => router.push("/")}>
              Back to dashboard
            </Button>
          </div>
        </header>

        <div className="grid gap-4">
          <EncounterForm
            patientName={patient.name}
            input={workspace.input}
            encounterActive
            startSignal={startSignal}
            onAgeChange={(age) => syncInput("age", age)}
            onSexChange={(sex) => syncInput("sex", sex)}
            onTranscriptChange={(transcript) => syncInput("transcript", transcript)}
            onToggleDiagnosis={toggleDiagnosis}
            onEnablePsychotherapyChange={(enabled) => syncInput("enablePsychotherapy", enabled)}
            onAiChart={runAiChartFromConversation}
            onPolishTranscript={runPolishTranscript}
            onRecordVisit={startRecordVisit}
            aiChartLoading={aiChartLoading}
            polishLoading={polishLoading}
            aiChartError={aiChartError}
            onEndEncounter={endEncounter}
          />

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="xl:col-span-2">
              <NoteOutput
                title="HPI"
                description="Polished history of present illness with LTC wording, staff summary, symptom review, and medication monitoring language."
                value={workspace.notes.hpi}
                generatedValue={workspace.generatedNotes.hpi}
                placeholder="Run AI chart visit after capturing a transcript — sections stay empty until then."
                onChange={(value) => editSection("hpi", value)}
                onReset={() => resetSection("hpi")}
              />
            </div>

            <NoteOutput
              title="MSE"
              description="Structured mental status exam with the appropriate preset selected from the transcript."
              value={workspace.notes.mse}
              generatedValue={workspace.generatedNotes.mse}
              placeholder="Run AI chart visit after capturing a transcript — sections stay empty until then."
              onChange={(value) => editSection("mse", value)}
              onReset={() => resetSection("mse")}
            />

            <NoteOutput
              title="Plan of Care"
              description="Diagnosis-based plan sections with LTC behavioral language and stable medication continuation phrasing."
              value={workspace.notes.plan}
              generatedValue={workspace.generatedNotes.plan}
              placeholder="Run AI chart visit after capturing a transcript — sections stay empty until then."
              onChange={(value) => editSection("plan", value)}
              onReset={() => resetSection("plan")}
            />

            <div className="xl:col-span-2">
              <NoteOutput
                title="90833 Psychotherapy Note"
                description="Optional psychotherapy documentation."
                value={workspace.input.enablePsychotherapy ? workspace.notes.psychotherapy : ""}
                generatedValue={workspace.generatedNotes.psychotherapy}
                placeholder="Enable 90833 above, then run AI chart visit to generate this section."
                disabled={!workspace.input.enablePsychotherapy}
                onChange={(value) => editSection("psychotherapy", value)}
                onReset={() => resetSection("psychotherapy")}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/70 bg-slate-950/85 px-3 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur md:hidden">
        <div className="mx-auto max-w-6xl">
          <Button
            variant="outline"
            size="lg"
            onClick={() => void runAiChartFromConversation()}
            disabled={aiChartLoading || polishLoading}
            className="h-12 w-full min-w-0 border-cyan-700/60 bg-cyan-950/30 px-2 text-slate-100 hover:bg-cyan-950/45"
          >
            <Bot className="h-4 w-4 shrink-0" />
            <span className="truncate text-sm">{aiChartLoading ? "AI charting…" : "AI chart visit"}</span>
          </Button>
        </div>
      </div>
    </main>
  );
}
