"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import EncounterChartReadonly from "@/components/encounter-chart-readonly";
import EncounterForm from "@/components/encounter-form";
import { Button } from "@/components/ui/button";
import type { EncounterInput, PatientRecord, SavedChart } from "@/lib/types";
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
  const [reviewMode, setReviewMode] = useState(false);
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
      const fromRecord =
        typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).get("fromRecord") === "1";
      const raw = window.localStorage.getItem(CHARTER_STORAGE_KEY);
      let next = raw ? sanitizePersistedState(JSON.parse(raw)) : null;
      if (!next) {
        next = createDefaultAppState();
      }
      const pend = consumePendingEncounter();
      if (pend && pend.patientId === patientId) {
        next = applyPendingEncounterToState(next, pend.patientId, pend.startedAt);
      } else if (next.encounterPatientId === patientId) {
        /* keep stored session */
      } else if (fromRecord) {
        /* record flow already finalized and saved in storage */
      } else {
        next = ensureEncounterSessionState(next, patientId);
      }
      savePersistedAppState(next);
      setAppState(next);
      if (fromRecord) {
        setReviewMode(true);
        const url = new URL(window.location.href);
        url.searchParams.delete("fromRecord");
        window.history.replaceState(null, "", url.pathname + (url.search || ""));
      }
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
    setWorkspace((w) => ({
      ...w,
      input: { ...w.input, [key]: value } as EncounterInput,
    }));
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
      JSON.stringify({
        encounterInput: workspace.input,
        chartSource: "visit_conversation",
      } satisfies RecordFlowContext),
    );
    router.push(`/encounter/${patientId}/record`);
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
      <main className="min-h-screen min-h-dvh bg-slate-950 px-[max(1rem,env(safe-area-inset-left))] py-10 pr-[max(1rem,env(safe-area-inset-right))] pt-[max(2.5rem,env(safe-area-inset-top))] text-slate-100">
        <p className="text-sm text-slate-400">Loading encounter…</p>
      </main>
    );
  }

  const startSignal = appState.startSignal;

  return (
    <main className="relative min-h-screen min-h-dvh pb-[max(7rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:pb-10 sm:pt-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] sm:pl-[max(1rem,env(safe-area-inset-left))] sm:pr-[max(1rem,env(safe-area-inset-right))] lg:pl-[max(1.5rem,env(safe-area-inset-left))] lg:pr-[max(1.5rem,env(safe-area-inset-right))]">
        <header className="flex flex-col gap-3 rounded-2xl border border-slate-700/80 bg-slate-900/60 px-4 py-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:rounded-3xl sm:px-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {reviewMode ? "Saved encounter" : "Encounter"}
            </p>
            <h1 className="text-xl font-semibold text-slate-50 sm:text-2xl">{patient.name}</h1>
            {reviewMode ? (
              <p className="mt-1 text-sm text-emerald-400/90">Recorded, charted, and saved to this patient.</p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {reviewMode ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => router.push(`/patients/${patientId}/history`)}
                >
                  Saved encounters
                </Button>
                <Button type="button" variant="default" size="sm" onClick={() => router.push("/")}>
                  Back to dashboard
                </Button>
              </>
            ) : (
              <>
                <Button type="button" variant="ghost" size="sm" onClick={cancelEncounter}>
                  Cancel encounter
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => router.push("/")}>
                  Back to dashboard
                </Button>
              </>
            )}
          </div>
        </header>

        {reviewMode ? (
          <EncounterChartReadonly
            transcript={workspace.input.transcript}
            input={workspace.input}
            notes={workspace.notes}
          />
        ) : (
          <EncounterForm
            patientName={patient.name}
            input={workspace.input}
            encounterActive
            startSignal={startSignal}
            onAgeChange={(age) => syncInput("age", age)}
            onSexChange={(sex) => syncInput("sex", sex)}
            onTranscriptChange={(transcript) => syncInput("transcript", transcript)}
            onToggleDiagnosis={toggleDiagnosis}
            onAiChart={runAiChartFromConversation}
            onPolishTranscript={runPolishTranscript}
            onRecordVisit={startRecordVisit}
            aiChartLoading={aiChartLoading}
            polishLoading={polishLoading}
            aiChartError={aiChartError}
            onEndEncounter={endEncounter}
            captureHidden
          />
        )}
      </div>
    </main>
  );
}
