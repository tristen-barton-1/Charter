"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { PatientRecord, SavedChart } from "@/lib/types";
import { diagnosisLabels, formatList } from "@/lib/diagnoses";
import { fetchPatientEncounters, fetchPatients } from "@/lib/backend";

interface PatientHistoryProps {
  patientId: string;
}

function formatDisorders(patient: PatientRecord): string {
  return formatList(patient.diagnoses.map((diagnosis) => diagnosisLabels[diagnosis]));
}

function previewText(encounter: SavedChart): string {
  const hpiFirst = encounter.notes.hpi.trim().split(/\n/)[0]?.trim() ?? "";
  if (hpiFirst) {
    const t = hpiFirst.replace(/\s+/g, " ");
    return t.length > 140 ? `${t.slice(0, 140).trim()}…` : t;
  }
  const tx = encounter.transcript.replace(/\s+/g, " ").trim();
  if (!tx) {
    return "No preview";
  }
  return tx.length > 140 ? `${tx.slice(0, 140).trim()}…` : tx;
}

function dayLabel(isoDate: string): string {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function PatientHistory({ patientId }: PatientHistoryProps) {
  const router = useRouter();
  const [patient, setPatient] = useState<PatientRecord | null>(null);
  const [encounters, setEncounters] = useState<SavedChart[]>([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const sortedEncounters = useMemo(() => {
    return [...filteredEncounters].sort(
      (a, b) =>
        new Date(b.startedAt ?? b.createdAt).getTime() - new Date(a.startedAt ?? a.createdAt).getTime(),
    );
  }, [filteredEncounters]);

  return (
    <main className="min-h-screen px-3 py-4 sm:px-4 sm:py-8">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <Button type="button" variant="outline" size="sm" onClick={() => router.push("/")}>
            <ChevronLeft className="h-4 w-4" />
            <span>Back to dashboard</span>
          </Button>
        </div>

        <Card className="border-slate-700/80 bg-slate-900/70 text-slate-100">
          <CardHeader className="space-y-2">
            <CardTitle>{patient ? `${patient.name} — saved encounters` : "Saved encounters"}</CardTitle>
            <CardDescription className="max-w-3xl text-slate-300">
              {patient
                ? `${patient.age}-year-old ${patient.sex ?? "patient"} · ${patient.room} · ${formatDisorders(patient)}`
                : "Tap an encounter to open the transcript and chart."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 rounded-2xl border border-slate-700 bg-slate-950/50 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <label className="space-y-1">
                <span className="text-xs uppercase tracking-[0.16em] text-slate-400">From</span>
                <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/70 px-3">
                  <Search className="h-4 w-4 shrink-0 text-slate-400" />
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(event) => setStartDate(event.currentTarget.value)}
                    className="border-0 bg-transparent px-0 focus-visible:ring-0"
                  />
                </div>
              </label>
              <label className="space-y-1">
                <span className="text-xs uppercase tracking-[0.16em] text-slate-400">To</span>
                <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/70 px-3">
                  <Search className="h-4 w-4 shrink-0 text-slate-400" />
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(event) => setEndDate(event.currentTarget.value)}
                    className="border-0 bg-transparent px-0 focus-visible:ring-0"
                  />
                </div>
              </label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full sm:w-auto"
                onClick={() => {
                  setStartDate("");
                  setEndDate("");
                }}
              >
                Clear
              </Button>
            </div>

            {loading ? (
              <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/50 p-5 text-sm text-slate-300">
                Loading encounters…
              </div>
            ) : error ? (
              <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-5 text-sm text-rose-200">
                {error}
              </div>
            ) : sortedEncounters.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/50 p-5 text-sm text-slate-300">
                No saved encounters match the selected dates.
              </div>
            ) : (
              <>
                <p className="text-xs text-slate-500">
                  {sortedEncounters.length} encounter{sortedEncounters.length === 1 ? "" : "s"}
                </p>
                <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-950/50">
                  {sortedEncounters.map((encounter, index) => {
                    const dayKey = new Date(encounter.startedAt ?? encounter.createdAt).toISOString().slice(0, 10);
                    const prevKey =
                      index > 0
                        ? new Date(
                            sortedEncounters[index - 1].startedAt ?? sortedEncounters[index - 1].createdAt,
                          )
                            .toISOString()
                            .slice(0, 10)
                        : null;
                    const showDay = dayKey !== prevKey;

                    return (
                      <Fragment key={encounter.id}>
                        {showDay ? (
                          <div className="border-b border-slate-700/80 bg-slate-900/80 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                            {dayLabel(dayKey)}
                          </div>
                        ) : null}
                        <Link
                          href={`/patients/${patientId}/history/${encounter.id}`}
                          className="flex items-start gap-3 border-b border-slate-800 px-3 py-3 text-left transition-colors last:border-b-0 hover:bg-slate-800/60"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-slate-100">
                              {new Date(encounter.startedAt ?? encounter.createdAt).toLocaleTimeString([], {
                                hour: "numeric",
                                minute: "2-digit",
                              })}
                            </p>
                            <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-slate-400">
                              {previewText(encounter)}
                            </p>
                          </div>
                          <ChevronRight className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" aria-hidden />
                        </Link>
                      </Fragment>
                    );
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
