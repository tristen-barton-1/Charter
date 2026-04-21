"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PatientDashboard from "@/components/patient-dashboard";
import type { PatientRecord } from "@/lib/types";
import {
  createPatient as apiCreatePatient,
  deletePatient as apiDeletePatient,
  fetchPatients,
  updatePatient as apiUpdatePatient,
} from "@/lib/backend";
import type { NewPatientForm, PatientFormMode, PatientSortKey } from "@/components/patient-dashboard";
import {
  applyPendingEncounterToState,
  createDefaultAppState,
  createWorkspaceFromPatient,
  loadPersistedAppState,
  savePersistedAppState,
  type AppState,
  type Workspace,
} from "@/lib/charter-persisted-state";

const EMPTY_CENSUS_PATIENT: PatientRecord = {
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

export default function Page() {
  const router = useRouter();
  const defaultState = useMemo(() => createDefaultAppState(), []);
  const [appState, setAppState] = useState<AppState>(defaultState);
  const [patientFormMode, setPatientFormMode] = useState<PatientFormMode>(null);
  const [editingPatientId, setEditingPatientId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<PatientSortKey>("recent-desc");
  const [newPatient, setNewPatient] = useState<NewPatientForm>({
    name: "",
    age: "",
    sex: "female",
    room: "",
    diagnoses: [],
    enablePsychotherapy: false,
  });
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const loaded = loadPersistedAppState();
      if (loaded) {
        setAppState(loaded);
      }
    } catch {
    } finally {
      setHydrated(true);
    }
  }, []);

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

  const { patients, activePatientId, encounterPatientId, workspaces } = appState;

  function startEncounter(patientId: string) {
    const startedAt = new Date().toISOString();
    setAppState((prev) => {
      const next = applyPendingEncounterToState(prev, patientId, startedAt);
      savePersistedAppState(next);
      return next;
    });
    router.push(`/encounter/${patientId}/record`);
  }

  function cancelEncounter(patientId: string) {
    if (encounterPatientId !== patientId) {
      return;
    }

    const patient = patients.find((entry) => entry.id === patientId);
    if (!patient) {
      return;
    }

    setAppState((prev) => ({
      ...prev,
      encounterPatientId: null,
      encounterStartedAt: null,
      viewMode: "dashboard",
      workspaces: {
        ...prev.workspaces,
        [patientId]: createWorkspaceFromPatient(patient),
      },
    }));
  }

  function viewSavedNotes(patientId: string) {
    router.push(`/patients/${patientId}/history`);
  }

  function openAddPatientForm() {
    setEditingPatientId(null);
    setPatientFormMode((current) => (current === "add" ? null : "add"));
    setNewPatient({
      name: "",
      age: "",
      sex: "female",
      room: "",
      diagnoses: [],
      enablePsychotherapy: false,
    });
  }

  function openEditPatientForm(patientId: string) {
    const patient = patients.find((entry) => entry.id === patientId);
    if (!patient) {
      return;
    }

    setEditingPatientId(patientId);
    setPatientFormMode("edit");
    setNewPatient({
      name: patient.name,
      age: String(patient.age),
      sex: patient.sex,
      room: patient.room,
      diagnoses: [...patient.diagnoses],
      enablePsychotherapy: patient.enablePsychotherapy,
    });
  }

  function closePatientForm() {
    setPatientFormMode(null);
    setEditingPatientId(null);
    setNewPatient({
      name: "",
      age: "",
      sex: "female",
      room: "",
      diagnoses: [],
      enablePsychotherapy: false,
    });
  }

  function selectPatient(patientId: string) {
    if (encounterPatientId && encounterPatientId !== patientId) {
      return;
    }

    setAppState((prev) => ({ ...prev, activePatientId: patientId }));
  }

  async function savePatient() {
    const age = Number(newPatient.age);
    if (!newPatient.name.trim() || !Number.isFinite(age)) {
      return;
    }

    const formPatient = {
      name: newPatient.name.trim(),
      age,
      sex: newPatient.sex,
      room: newPatient.room.trim() || "Room TBD",
      diagnoses: (
        newPatient.diagnoses.length > 0 ? newPatient.diagnoses : ["dementia_behavior"]
      ) as PatientRecord["diagnoses"],
      enablePsychotherapy: newPatient.enablePsychotherapy,
    };

    const nextPatient: PatientRecord = {
      id: `p-${Date.now()}`,
      ...formPatient,
      facility: "Long-term care facility",
      transcript:
        "Per staff, no acute concerns reported today. Patient seen for follow-up in the long-term care facility.",
      status: "New patient",
      summary: "Newly added patient record.",
      lastSeen: "Today",
    };

    if (patientFormMode === "edit" && editingPatientId) {
      const current = patients.find((entry) => entry.id === editingPatientId);
      if (!current) {
        closePatientForm();
        return;
      }

      const updatedPatient: PatientRecord = {
        ...current,
        ...formPatient,
        id: editingPatientId,
      };

      let savedPatient = updatedPatient;

      try {
        savedPatient = await apiUpdatePatient(editingPatientId, updatedPatient);
      } catch {
      }

      setAppState((prev) => {
        const baseWorkspace = prev.workspaces[savedPatient.id] ?? createWorkspaceFromPatient(savedPatient);
        const psychotherapy = savedPatient.enablePsychotherapy ? baseWorkspace.notes.psychotherapy : "";
        return {
          ...prev,
          patients: prev.patients.map((patient) => (patient.id === editingPatientId ? savedPatient : patient)),
          workspaces: {
            ...prev.workspaces,
            [savedPatient.id]: {
              ...baseWorkspace,
              input: {
                ...baseWorkspace.input,
                age: savedPatient.age,
                sex: savedPatient.sex,
                diagnoses: savedPatient.diagnoses,
                enablePsychotherapy: savedPatient.enablePsychotherapy,
              },
              notes: { ...baseWorkspace.notes, psychotherapy },
              generatedNotes: { ...baseWorkspace.generatedNotes, psychotherapy },
              charts: baseWorkspace.charts,
            },
          },
          activePatientId: savedPatient.id,
          viewMode: "dashboard",
        };
      });
      closePatientForm();
      return;
    }

    let savedPatient = nextPatient;

    try {
      savedPatient = await apiCreatePatient(nextPatient);
    } catch {
    }

    setAppState((prev) => ({
      ...prev,
      patients: [...prev.patients, savedPatient],
      workspaces: {
        ...prev.workspaces,
        [savedPatient.id]: createWorkspaceFromPatient(savedPatient),
      },
      activePatientId: savedPatient.id,
      viewMode: "dashboard",
    }));
    closePatientForm();
  }

  async function deletePatient(patientId: string) {
    if (!window.confirm("Delete this patient and their saved encounters?")) {
      return;
    }

    try {
      await apiDeletePatient(patientId);
    } catch {
    }

    const remainingPatients = patients.filter((patient) => patient.id !== patientId);

    setAppState((prev) => {
      const nextWorkspaces = { ...prev.workspaces };
      delete nextWorkspaces[patientId];
      let nextActive = prev.activePatientId;
      if (nextActive === patientId) {
        nextActive = remainingPatients[0]?.id ?? "";
      }
      let nextEncounter = prev.encounterPatientId;
      let nextEncounterStarted = prev.encounterStartedAt;
      let nextView = prev.viewMode;
      if (nextEncounter === patientId) {
        nextEncounter = null;
        nextEncounterStarted = null;
        nextView = "dashboard";
      }
      return {
        ...prev,
        patients: remainingPatients,
        workspaces: nextWorkspaces,
        activePatientId: nextActive,
        encounterPatientId: nextEncounter,
        encounterStartedAt: nextEncounterStarted,
        viewMode: nextView,
      };
    });

    if (editingPatientId === patientId) {
      closePatientForm();
    }
  }

  return (
    <main className="relative min-h-screen pb-28 pt-4 sm:pb-10 sm:pt-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 sm:px-4 lg:px-6">
        <header className="glass-panel rounded-3xl border border-slate-700/80 px-5 py-5 shadow-soft sm:px-6">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl">
              Psych LTC patient census
            </h1>
            <p className="max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
              Track who is on service, open saved notes, and start a visit recording to generate the chart.
            </p>
          </div>
        </header>

        <PatientDashboard
          patients={patients}
          activePatientId={activePatientId}
          encounterActivePatientId={encounterPatientId}
          searchQuery={searchQuery}
          sortKey={sortKey}
          onSelectPatient={selectPatient}
          onStartEncounter={startEncounter}
          onCancelEncounter={cancelEncounter}
          onViewSavedNotes={viewSavedNotes}
          onSearchChange={setSearchQuery}
          onSortChange={setSortKey}
          onEditPatient={openEditPatientForm}
          onDeletePatient={deletePatient}
          newPatient={newPatient}
          showPatientForm={patientFormMode !== null}
          patientFormMode={patientFormMode}
          onTogglePatientForm={() => {
            if (patientFormMode === "add") {
              closePatientForm();
            } else {
              openAddPatientForm();
            }
          }}
          onClosePatientForm={closePatientForm}
          onNewPatientChange={setNewPatient}
          onSavePatient={savePatient}
        />

        <div className="rounded-3xl border border-dashed border-slate-700 bg-slate-950/50 px-6 py-10 text-sm text-slate-300">
          Use <span className="font-medium text-slate-100">Start encounter</span> to record the visit and generate the
          chart for the selected patient.
        </div>
      </div>
    </main>
  );
}
