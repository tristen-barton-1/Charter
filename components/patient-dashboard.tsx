"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, Mic, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { DiagnosisCode, PatientRecord, Sex } from "@/lib/types";
import { diagnosisLabels, diagnosisOrder, formatList } from "@/lib/diagnoses";

export type PatientFormMode = "add" | "edit" | null;
export type PatientSortKey =
  | "name-asc"
  | "name-desc"
  | "age-asc"
  | "age-desc"
  | "room-asc"
  | "room-desc"
  | "encounters-desc"
  | "encounters-asc"
  | "recent-desc"
  | "recent-asc";

export interface NewPatientForm {
  name: string;
  age: string;
  sex: Sex;
  room: string;
  diagnoses: DiagnosisCode[];
  enablePsychotherapy: boolean;
}

export interface PatientDashboardProps {
  patients: PatientRecord[];
  activePatientId: string;
  encounterActivePatientId: string | null;
  newPatient: NewPatientForm;
  showPatientForm: boolean;
  patientFormMode: PatientFormMode;
  searchQuery: string;
  sortKey: PatientSortKey;
  onTogglePatientForm: () => void;
  onClosePatientForm: () => void;
  onNewPatientChange: (value: NewPatientForm) => void;
  onSearchChange: (value: string) => void;
  onSortChange: (value: PatientSortKey) => void;
  onSelectPatient: (patientId: string) => void;
  onStartEncounter: (patientId: string) => void;
  onCancelEncounter: (patientId: string) => void;
  onViewSavedNotes: (patientId: string) => void;
  onEditPatient: (patientId: string) => void;
  onDeletePatient: (patientId: string) => void;
  onSavePatient: () => void | Promise<void>;
}

function formatDisorders(patient: PatientRecord): string {
  const labels = patient.diagnoses.map((diagnosis) => diagnosisLabels[diagnosis]);
  return formatList(labels);
}

function getSearchText(patient: PatientRecord): string {
  return [
    patient.name,
    patient.room,
    patient.summary,
    patient.status,
    patient.lastSeen,
    formatDisorders(patient),
  ]
    .join(" ")
    .toLowerCase();
}

function getComparableDate(value: string | null | undefined): number {
  if (!value) {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export default function PatientDashboard({
  patients,
  activePatientId,
  encounterActivePatientId,
  newPatient,
  showPatientForm,
  patientFormMode,
  searchQuery = "",
  sortKey = "recent-desc",
  onTogglePatientForm,
  onClosePatientForm,
  onNewPatientChange,
  onSearchChange,
  onSortChange,
  onSelectPatient,
  onStartEncounter,
  onCancelEncounter,
  onViewSavedNotes,
  onEditPatient,
  onDeletePatient,
  onSavePatient,
}: PatientDashboardProps) {
  function updateNewPatient<K extends keyof NewPatientForm>(key: K, value: NewPatientForm[K]) {
    onNewPatientChange({ ...newPatient, [key]: value });
  }

  function toggleDiagnosis(diagnosis: DiagnosisCode) {
    const nextDiagnoses = newPatient.diagnoses.includes(diagnosis)
      ? newPatient.diagnoses.filter((code) => code !== diagnosis)
      : [...newPatient.diagnoses, diagnosis];

    onNewPatientChange({ ...newPatient, diagnoses: nextDiagnoses });
  }

  const filteredPatients = useMemo(() => {
    const query = (searchQuery ?? "").trim().toLowerCase();

    const filtered = patients.filter((patient) => {
      if (!query) {
        return true;
      }

      return getSearchText(patient).includes(query);
    });

    const sorted = [...filtered].sort((left, right) => {
      switch (sortKey) {
        case "name-asc":
          return left.name.localeCompare(right.name);
        case "name-desc":
          return right.name.localeCompare(left.name);
        case "age-asc":
          return left.age - right.age;
        case "age-desc":
          return right.age - left.age;
        case "room-asc":
          return left.room.localeCompare(right.room);
        case "room-desc":
          return right.room.localeCompare(left.room);
        case "encounters-asc":
          return (left.encounterCount ?? 0) - (right.encounterCount ?? 0);
        case "encounters-desc":
          return (right.encounterCount ?? 0) - (left.encounterCount ?? 0);
        case "recent-asc":
          return getComparableDate(left.latestEncounterAt) - getComparableDate(right.latestEncounterAt);
        case "recent-desc":
        default:
          return getComparableDate(right.latestEncounterAt) - getComparableDate(left.latestEncounterAt);
      }
    });

    return sorted;
  }, [patients, searchQuery, sortKey]);

  const [mounted, setMounted] = useState(false);
  const [actionsPatientId, setActionsPatientId] = useState<string | null>(null);
  const isPatientFormModal = showPatientForm && patientFormMode !== null;
  const actionsPatient = actionsPatientId
    ? patients.find((entry) => entry.id === actionsPatientId) ?? null
    : null;
  const actionsEncounterActive =
    actionsPatient != null && encounterActivePatientId === actionsPatient.id;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if ((!isPatientFormModal && !actionsPatientId) || typeof document === "undefined") {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isPatientFormModal, actionsPatientId]);

  useEffect(() => {
    if (!isPatientFormModal) {
      return;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClosePatientForm();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isPatientFormModal, onClosePatientForm]);

  useEffect(() => {
    if (!actionsPatientId || isPatientFormModal) {
      return;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setActionsPatientId(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [actionsPatientId, isPatientFormModal]);

  useEffect(() => {
    if (isPatientFormModal) {
      setActionsPatientId(null);
    }
  }, [isPatientFormModal]);

  useEffect(() => {
    if (actionsPatientId && !patients.some((p) => p.id === actionsPatientId)) {
      setActionsPatientId(null);
    }
  }, [patients, actionsPatientId]);

  const patientFormFields = (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1">
          <span className="text-xs uppercase tracking-[0.16em] text-slate-400">Name</span>
          <Input
            value={newPatient.name}
            onChange={(event) => updateNewPatient("name", event.currentTarget.value)}
            placeholder="Patient name"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs uppercase tracking-[0.16em] text-slate-400">Age</span>
          <Input
            value={newPatient.age}
            onChange={(event) => updateNewPatient("age", event.currentTarget.value)}
            inputMode="numeric"
            placeholder="Age"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs uppercase tracking-[0.16em] text-slate-400">Sex</span>
          <Select
            value={newPatient.sex ?? ""}
            onChange={(event) => updateNewPatient("sex", (event.currentTarget.value || null) as Sex)}
          >
            <option value="">Select sex</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="other">Other</option>
          </Select>
        </label>
        <label className="space-y-1">
          <span className="text-xs uppercase tracking-[0.16em] text-slate-400">Room</span>
          <Input
            value={newPatient.room}
            onChange={(event) => updateNewPatient("room", event.currentTarget.value)}
            placeholder="Room"
          />
        </label>
      </div>

      <div className="mt-4 flex flex-col gap-2 rounded-2xl border border-slate-700 bg-slate-950/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-200">90833 psychotherapy note</p>
          <p className="text-xs text-slate-400">When on, visit charts include a psychotherapy section.</p>
        </div>
        <Switch
          checked={newPatient.enablePsychotherapy}
          onCheckedChange={(checked) => updateNewPatient("enablePsychotherapy", checked)}
        />
      </div>

      <div className="mt-4 space-y-2">
        <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Disorders</p>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {diagnosisOrder.map((diagnosis) => {
            const checked = newPatient.diagnoses.includes(diagnosis);
            return (
              <label
                key={diagnosis}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2",
                  checked ? "border-primary/40 bg-primary/10" : "border-slate-700 bg-slate-900/60",
                )}
              >
                <Checkbox checked={checked} onCheckedChange={() => toggleDiagnosis(diagnosis)} />
                <span className="text-sm text-slate-100">{diagnosisLabels[diagnosis]}</span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="mt-6 flex justify-end border-t border-slate-800 pt-6">
        <Button type="button" onClick={onSavePatient}>
          {patientFormMode === "edit" ? "Update Patient" : "Save Patient"}
        </Button>
      </div>
    </>
  );

  const patientFormTitle = (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <p id="patient-form-title" className="text-lg font-semibold text-slate-50 sm:text-xl">
          {patientFormMode === "edit" ? "Edit patient" : "Add patient"}
        </p>
        <p className="text-sm text-slate-300">
          {patientFormMode === "edit"
            ? "Update resident details and save changes."
            : "Add a new LTC resident to the census."}
        </p>
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={onClosePatientForm}>
        Close
      </Button>
    </div>
  );

  const patientFormModalPortal =
    mounted && isPatientFormModal
      ? createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6">
            <button
              type="button"
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
              aria-label="Dismiss"
              onClick={onClosePatientForm}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="patient-form-title"
              className="relative z-10 w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-3xl border border-slate-700/90 bg-slate-900 p-5 shadow-2xl sm:p-8"
              onClick={(event) => event.stopPropagation()}
            >
              {patientFormTitle}
              {patientFormFields}
            </div>
          </div>,
          document.body,
        )
      : null;

  const patientActionsModal =
    mounted && actionsPatient && !isPatientFormModal
      ? createPortal(
          <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-6">
            <button
              type="button"
              className="absolute inset-0 bg-slate-950/85 backdrop-blur-md"
              aria-label="Dismiss"
              onClick={() => setActionsPatientId(null)}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="patient-actions-title"
              className="relative z-10 w-full max-w-md overflow-hidden rounded-[1.75rem] border border-slate-600/60 bg-gradient-to-b from-slate-900 to-slate-950 shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_25px_80px_-20px_rgba(0,0,0,0.85)]"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="h-1 w-full bg-gradient-to-r from-cyan-400 via-sky-500 to-violet-500" />
              <div className="p-6 sm:p-7">
                <div className="mb-6 flex items-start justify-between gap-4">
                  <div className="min-w-0 space-y-1">
                    <p id="patient-actions-title" className="truncate text-xl font-semibold tracking-tight text-slate-50">
                      {actionsPatient.name}
                    </p>
                    <p className="text-sm text-slate-400">
                      Room {actionsPatient.room} · {actionsPatient.age} / {actionsPatient.sex ?? "other"} ·{" "}
                      {actionsPatient.encounterCount ?? 0} encounters
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 shrink-0 rounded-xl p-0 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                    onClick={() => setActionsPatientId(null)}
                  >
                    <X className="h-5 w-5" />
                  </Button>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 justify-center gap-2 rounded-xl border-slate-600 bg-slate-950/50"
                      onClick={() => {
                        setActionsPatientId(null);
                        onViewSavedNotes(actionsPatient.id);
                      }}
                    >
                      <FileText className="h-4 w-4" />
                      <span>Saved notes</span>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 justify-center gap-2 rounded-xl border-slate-600 bg-slate-950/50"
                      onClick={() => {
                        setActionsPatientId(null);
                        onEditPatient(actionsPatient.id);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                      <span>Edit</span>
                    </Button>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 justify-center gap-2 rounded-xl border-slate-600 bg-slate-950/50"
                    onClick={() => {
                      setActionsPatientId(null);
                      onDeletePatient(actionsPatient.id);
                    }}
                    disabled={actionsEncounterActive}
                  >
                    <Trash2 className="h-4 w-4" />
                    <span>Delete</span>
                  </Button>
                  <Button
                    type="button"
                    variant={actionsEncounterActive ? "outline" : "default"}
                    className={cn(
                      "h-11 justify-center gap-2 rounded-xl",
                      actionsEncounterActive &&
                        "border-amber-600/70 bg-amber-950/40 text-amber-100 hover:bg-amber-950/60",
                    )}
                    onClick={() => {
                      setActionsPatientId(null);
                      if (actionsEncounterActive) {
                        onCancelEncounter(actionsPatient.id);
                        return;
                      }
                      onStartEncounter(actionsPatient.id);
                    }}
                  >
                    {actionsEncounterActive ? <X className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    <span>{actionsEncounterActive ? "Cancel encounter" : "Start encounter"}</span>
                  </Button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <Card className="overflow-hidden border-slate-700/80 bg-slate-900/70 text-slate-100">
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Patient dashboard</CardTitle>
            <CardDescription className="max-w-2xl text-slate-300">
              Search and sort the census; click a patient to chart, review notes, or edit details.
            </CardDescription>
          </div>
          <Button type="button" size="sm" onClick={onTogglePatientForm}>
            <Plus className="h-4 w-4" />
            <span>Add Patient</span>
          </Button>
        </div>

        <div className="grid gap-3 lg:grid-cols-[1fr_220px]">
          <label className="space-y-1">
            <span className="text-xs uppercase tracking-[0.16em] text-slate-400">Search patients</span>
            <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/50 px-3">
              <Search className="h-4 w-4 text-slate-400" />
              <Input
                value={searchQuery}
                onChange={(event) => onSearchChange(event.currentTarget.value)}
                placeholder="Name, room, diagnosis, summary"
                className="border-0 bg-transparent px-0 focus-visible:ring-0"
              />
            </div>
          </label>
          <label className="space-y-1">
            <span className="text-xs uppercase tracking-[0.16em] text-slate-400">Sort by</span>
            <Select value={sortKey} onChange={(event) => onSortChange(event.currentTarget.value as PatientSortKey)}>
              <option value="recent-desc">Most recent</option>
              <option value="recent-asc">Oldest recent</option>
              <option value="name-asc">Name A-Z</option>
              <option value="name-desc">Name Z-A</option>
              <option value="age-asc">Age low-high</option>
              <option value="age-desc">Age high-low</option>
              <option value="room-asc">Room A-Z</option>
              <option value="room-desc">Room Z-A</option>
              <option value="encounters-desc">Most encounters</option>
              <option value="encounters-asc">Fewest encounters</option>
            </Select>
          </label>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-3 text-sm text-slate-400">
          <span>
            Showing {filteredPatients.length} of {patients.length} patients
          </span>
          <span className="text-right">Tap a row for actions.</span>
        </div>

        <div className="min-w-0 rounded-2xl border border-slate-700 bg-slate-950/50">
          <table className="w-full min-w-0 table-fixed border-collapse text-left">
            <thead className="bg-slate-950/80">
              <tr className="text-xs uppercase tracking-[0.16em] text-slate-400">
                <th className="w-[30%] px-4 py-3 font-medium">Patient</th>
                <th className="w-[11%] px-4 py-3 font-medium">Age / Sex</th>
                <th className="w-[26%] px-4 py-3 font-medium">Disorders</th>
                <th className="w-[11%] px-4 py-3 font-medium">Room</th>
                <th className="w-[12%] px-4 py-3 font-medium">Last Seen</th>
                <th className="w-[10%] px-4 py-3 font-medium">Encounters</th>
              </tr>
            </thead>
            <tbody>
              {filteredPatients.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-sm text-slate-300" colSpan={6}>
                    No patients match the current search.
                  </td>
                </tr>
              ) : (
                filteredPatients.map((patient) => {
                  const selected = patient.id === activePatientId;
                  const selectionBlocked = Boolean(
                    encounterActivePatientId && encounterActivePatientId !== patient.id,
                  );
                  return (
                    <tr
                      key={patient.id}
                      onClick={() => {
                        if (selectionBlocked) {
                          return;
                        }
                        onSelectPatient(patient.id);
                        setActionsPatientId(patient.id);
                      }}
                      className={cn(
                        "border-t border-slate-800/80 transition-colors",
                        selectionBlocked ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-slate-900/80",
                        selected ? "bg-cyan-400/10" : "",
                      )}
                    >
                      <td className="px-4 py-4 align-top">
                        <div className="min-w-0 space-y-1 break-words">
                          <p className="font-semibold text-slate-50">{patient.name}</p>
                          <p className="text-sm text-slate-400">{patient.summary}</p>
                        </div>
                      </td>
                      <td className="px-4 py-4 align-top text-sm text-slate-200">
                        {patient.age} / {patient.sex ?? "other"}
                      </td>
                      <td className="px-4 py-4 align-top text-sm leading-6 text-slate-200 break-words">
                        {formatDisorders(patient)}
                      </td>
                      <td className="px-4 py-4 align-top text-sm break-words text-slate-200">{patient.room}</td>
                      <td className="px-4 py-4 align-top text-sm text-slate-200">{patient.lastSeen}</td>
                      <td className="px-4 py-4 align-top text-sm text-slate-200">{patient.encounterCount ?? 0}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {patientFormModalPortal}
        {patientActionsModal}
      </CardContent>
    </Card>
  );
}
