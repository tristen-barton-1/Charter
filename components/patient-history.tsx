"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Search, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import CopyButton from "@/components/copy-button";
import type { PatientRecord, SavedChart } from "@/lib/types";
import { diagnosisLabels, formatList } from "@/lib/diagnoses";
import { deleteEncounter, fetchPatientEncounters, fetchPatients } from "@/lib/backend";

interface PatientHistoryProps {
  patientId: string;
}

interface DayGroup {
  label: string;
  key: string;
  encounters: SavedChart[];
}

function formatDisorders(patient: PatientRecord): string {
  return formatList(patient.diagnoses.map((diagnosis) => diagnosisLabels[diagnosis]));
}

function groupEncountersByDay(encounters: SavedChart[]): DayGroup[] {
  const groups = new Map<string, SavedChart[]>();

  for (const encounter of encounters) {
    const date = new Date(encounter.startedAt ?? encounter.createdAt);
    const key = date.toISOString().slice(0, 10);
    const current = groups.get(key) ?? [];
    current.push(encounter);
    groups.set(key, current);
  }

  return Array.from(groups.entries())
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([key, values]) => ({
      key,
      label: new Date(`${key}T00:00:00`).toLocaleDateString([], {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      encounters: values.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()),
    }));
}

function buildEncounterCopy(chart: SavedChart): string {
  const sections = [
    `Date: ${new Date(chart.startedAt ?? chart.createdAt).toLocaleString()}`,
    `Transcript:\n${chart.transcript}`,
    `HPI:\n${chart.notes.hpi}`,
    `MSE:\n${chart.notes.mse}`,
    `Plan of Care:\n${chart.notes.plan}`,
  ];

  if (chart.notes.psychotherapy.trim()) {
    sections.push(`90833 Psychotherapy Note:\n${chart.notes.psychotherapy}`);
  }

  return sections.join("\n\n");
}

export default function PatientHistory({ patientId }: PatientHistoryProps) {
  const router = useRouter();
  const [patient, setPatient] = useState<PatientRecord | null>(null);
  const [encounters, setEncounters] = useState<SavedChart[]>([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadHistory() {
      try {
        setLoading(true);
        const [patients, history] = await Promise.all([fetchPatients(), fetchPatientEncounters(patientId)]);
        if (cancelled) {
          return;
        }

        setPatient(patients.find((entry) => entry.id === patientId) ?? null);
        setEncounters(history);
        setError(null);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load history.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadHistory();

    return () => {
      cancelled = true;
    };
  }, [patientId]);

  const filteredEncounters = useMemo(() => {
    return encounters.filter((encounter) => {
      const encounterDate = (encounter.startedAt ?? encounter.createdAt).slice(0, 10);

      if (startDate && encounterDate < startDate) {
        return false;
      }

      if (endDate && encounterDate > endDate) {
        return false;
      }

      return true;
    });
  }, [encounters, endDate, startDate]);

  const grouped = useMemo(() => groupEncountersByDay(filteredEncounters), [filteredEncounters]);

  const dayLinks = grouped.map((group) => ({
    key: group.key,
    label: group.label,
  }));

  async function removeEncounter(encounter: SavedChart) {
    if (!window.confirm("Delete this saved encounter permanently?")) {
      return;
    }

    setDeletingId(encounter.id);
    setError(null);
    try {
      await deleteEncounter(patientId, encounter.id);
      setEncounters((previous) => previous.filter((entry) => entry.id !== encounter.id));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete encounter.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main className="min-h-screen px-3 py-4 sm:px-4 sm:py-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <Button type="button" variant="outline" size="sm" onClick={() => router.push("/")}>
            <ChevronLeft className="h-4 w-4" />
            <span>Back to dashboard</span>
          </Button>
        </div>

        <Card className="border-slate-700/80 bg-slate-900/70 text-slate-100">
          <CardHeader className="space-y-2">
            <CardTitle>{patient ? `${patient.name} encounter history` : "Encounter history"}</CardTitle>
            <CardDescription className="max-w-3xl text-slate-300">
              {patient
                ? `${patient.age}-year-old ${patient.sex ?? "patient"} · ${patient.room} · ${formatDisorders(patient)}`
                : "Review prior encounters organized by day, with the original transcript and chart text for each visit."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 rounded-2xl border border-slate-700 bg-slate-950/50 p-4 sm:grid-cols-[1fr_1fr_auto]">
              <label className="space-y-1">
                <span className="text-xs uppercase tracking-[0.16em] text-slate-400">Start date</span>
                <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/70 px-3">
                  <Search className="h-4 w-4 text-slate-400" />
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(event) => setStartDate(event.currentTarget.value)}
                    className="border-0 bg-transparent px-0 focus-visible:ring-0"
                  />
                </div>
              </label>
              <label className="space-y-1">
                <span className="text-xs uppercase tracking-[0.16em] text-slate-400">End date</span>
                <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/70 px-3">
                  <Search className="h-4 w-4 text-slate-400" />
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(event) => setEndDate(event.currentTarget.value)}
                    className="border-0 bg-transparent px-0 focus-visible:ring-0"
                  />
                </div>
              </label>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setStartDate("");
                    setEndDate("");
                  }}
                >
                  Clear filters
                </Button>
              </div>
            </div>

            {loading ? (
              <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/50 p-5 text-sm text-slate-300">
                Loading encounter history...
              </div>
            ) : error ? (
              <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-5 text-sm text-rose-200">
                {error}
              </div>
            ) : (
              <>
                {dayLinks.length > 0 ? (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {dayLinks.map((day) => (
                      <a
                        key={day.key}
                        href={`#${day.key}`}
                        className="shrink-0 rounded-full border border-slate-700 bg-slate-950/50 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-900"
                      >
                        {day.label}
                      </a>
                    ))}
                  </div>
                ) : null}

                <div className="text-sm text-slate-400">
                  Showing {filteredEncounters.length} encounter{filteredEncounters.length === 1 ? "" : "s"}.
                </div>

                {grouped.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/50 p-5 text-sm text-slate-300">
                    No saved encounters match the selected date range.
                  </div>
                ) : (
                  grouped.map((group) => (
                    <section key={group.key} id={group.key} className="scroll-mt-24 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h2 className="text-lg font-semibold text-slate-50">{group.label}</h2>
                          <p className="text-sm text-slate-400">
                            {group.encounters.length} encounter{group.encounters.length === 1 ? "" : "s"}
                          </p>
                        </div>
                      </div>

                      <div className="grid gap-4">
                        {group.encounters.map((encounter) => (
                          <Card key={encounter.id} className="border-slate-700 bg-slate-950/50">
                            <CardHeader className="space-y-2">
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div>
                                  <CardTitle className="text-base">
                                    {new Date(encounter.startedAt ?? encounter.createdAt).toLocaleTimeString([], {
                                      hour: "numeric",
                                      minute: "2-digit",
                                    })}
                                  </CardTitle>
                                  <CardDescription className="text-slate-300">
                                    Saved {new Date(encounter.createdAt).toLocaleString()}
                                  </CardDescription>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <CopyButton text={buildEncounterCopy(encounter)} label="Copy encounter" />
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="border-rose-600/50 text-rose-200 hover:bg-rose-950/40"
                                    disabled={deletingId === encounter.id}
                                    onClick={() => void removeEncounter(encounter)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    <span>{deletingId === encounter.id ? "Deleting…" : "Delete"}</span>
                                  </Button>
                                </div>
                              </div>
                            </CardHeader>
                            <CardContent className="grid gap-4">
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Transcript</p>
                                <p className="mt-1 whitespace-pre-line rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm leading-6 text-slate-200">
                                  {encounter.transcript}
                                </p>
                              </div>

                              <div className="grid gap-4 xl:grid-cols-2">
                                <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
                                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">HPI</p>
                                  <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-200">{encounter.notes.hpi}</p>
                                </div>
                                <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
                                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">MSE</p>
                                  <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-200">{encounter.notes.mse}</p>
                                </div>
                                <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4 xl:col-span-2">
                                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Plan of Care</p>
                                  <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-200">{encounter.notes.plan}</p>
                                </div>
                                {encounter.notes.psychotherapy.trim() ? (
                                  <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4 xl:col-span-2">
                                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">90833 Psychotherapy Note</p>
                                    <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-200">
                                      {encounter.notes.psychotherapy}
                                    </p>
                                  </div>
                                ) : null}
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </section>
                  ))
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
