"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import EncounterChartReadonly from "@/components/encounter-chart-readonly";
import type { PatientRecord, SavedChart } from "@/lib/types";
import { diagnosisLabels, formatList } from "@/lib/diagnoses";
import { deleteEncounter, fetchEncounter, fetchPatient } from "@/lib/backend";

interface PatientEncounterDetailProps {
  patientId: string;
  encounterId: string;
}

function formatDisorders(patient: PatientRecord): string {
  return formatList(patient.diagnoses.map((diagnosis) => diagnosisLabels[diagnosis]));
}

export default function PatientEncounterDetail({ patientId, encounterId }: PatientEncounterDetailProps) {
  const router = useRouter();
  const [patient, setPatient] = useState<PatientRecord | null>(null);
  const [encounter, setEncounter] = useState<SavedChart | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        const [p, enc] = await Promise.all([fetchPatient(patientId), fetchEncounter(patientId, encounterId)]);
        if (cancelled) {
          return;
        }
        setPatient(p);
        setEncounter(enc);
        setError(enc ? null : "This encounter could not be found.");
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load encounter.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [patientId, encounterId]);

  async function removeEncounter() {
    if (!encounter) {
      return;
    }
    if (!window.confirm("Delete this saved encounter permanently?")) {
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await deleteEncounter(patientId, encounter.id);
      router.push(`/patients/${patientId}/history`);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete encounter.");
    } finally {
      setDeleting(false);
    }
  }

  const listHref = `/patients/${patientId}/history`;

  return (
    <main className="min-h-screen px-3 py-4 sm:px-4 sm:py-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href={listHref}
            className={cn(
              "inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-slate-600 bg-slate-900/40 px-3 text-sm font-medium text-slate-100 transition-colors hover:bg-slate-800/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            )}
          >
            <ChevronLeft className="h-4 w-4" />
            <span>All encounters</span>
          </Link>
        </div>

        <Card className="border-slate-700/80 bg-slate-900/70 text-slate-100">
          <CardHeader className="space-y-2">
            <CardTitle>{patient ? `${patient.name}` : "Encounter"}</CardTitle>
            <CardDescription className="max-w-3xl text-slate-300">
              {patient
                ? `${patient.age}-year-old ${patient.sex ?? "patient"} · ${patient.room} · ${formatDisorders(patient)}`
                : "Saved visit transcript and generated chart."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/50 p-5 text-sm text-slate-300">
                Loading encounter…
              </div>
            ) : error && !encounter ? (
              <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-5 text-sm text-rose-200">
                {error}
              </div>
            ) : encounter ? (
              <>
                {error ? (
                  <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
                    {error}
                  </div>
                ) : null}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-lg font-semibold text-slate-50">
                      {new Date(encounter.startedAt ?? encounter.createdAt).toLocaleString([], {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </p>
                    <p className="text-sm text-slate-400">
                      Saved {new Date(encounter.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-rose-600/50 text-rose-200 hover:bg-rose-950/40"
                      disabled={deleting}
                      onClick={() => void removeEncounter()}
                    >
                      <Trash2 className="h-4 w-4" />
                      <span>{deleting ? "Deleting…" : "Delete"}</span>
                    </Button>
                  </div>
                </div>

                <EncounterChartReadonly
                  transcript={encounter.transcript}
                  input={encounter.input}
                  notes={encounter.notes}
                />
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
