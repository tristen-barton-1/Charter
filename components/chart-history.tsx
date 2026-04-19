"use client";

import { ChevronLeft, FileText } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import CopyButton from "@/components/copy-button";
import type { SavedChart } from "@/lib/types";

export interface ChartHistoryProps {
  patientName?: string;
  charts: SavedChart[];
  onClose: () => void;
  onReopenChart: (chartId: string) => void;
}

function buildChartCopy(chart: SavedChart): string {
  const dateLabel = new Date(chart.createdAt).toLocaleString();
  const sections = [
    `Encounter date: ${dateLabel}`,
    `Transcript:\n${chart.input.transcript}`,
    `HPI:\n${chart.notes.hpi}`,
    `MSE:\n${chart.notes.mse}`,
    `Plan of Care:\n${chart.notes.plan}`,
  ];

  if (chart.notes.psychotherapy.trim()) {
    sections.push(`90833 Psychotherapy Note:\n${chart.notes.psychotherapy}`);
  }

  return sections.join("\n\n");
}

export default function ChartHistory({ patientName, charts, onClose, onReopenChart }: ChartHistoryProps) {
  return (
    <Card className="overflow-hidden border-slate-700/80 bg-slate-900/70 text-slate-100">
      <CardHeader className="space-y-2">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>{patientName ? `${patientName} saved notes` : "Patient saved notes"}</CardTitle>
            <CardDescription className="mt-1 max-w-2xl text-slate-300">
              Review prior saved encounters, including the original transcript and dated note text.
            </CardDescription>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            <ChevronLeft className="h-4 w-4" />
            <span>Back</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {charts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/50 p-5 text-sm text-slate-300">
            No saved charts yet for this patient.
          </div>
        ) : (
          charts.map((chart) => (
            <div key={chart.id} className="rounded-2xl border border-slate-700 bg-slate-950/50 p-4 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-50">
                    {new Date(chart.createdAt).toLocaleString()}
                  </p>
                  <p className="text-xs text-slate-400">
                    {chart.input.age}-year-old {chart.input.sex ?? "patient"} with {chart.input.diagnoses.length} diagnosis{chart.input.diagnoses.length === 1 ? "" : "es"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <CopyButton text={buildChartCopy(chart)} label="Copy encounter" />
                  <Button type="button" variant="outline" size="sm" onClick={() => onReopenChart(chart.id)}>
                    <FileText className="h-4 w-4" />
                    <span>Reopen</span>
                  </Button>
                </div>
              </div>
              <div className="mt-4 grid gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Transcript</p>
                  <p className="mt-1 whitespace-pre-line rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm leading-6 text-slate-200">
                    {chart.input.transcript}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">HPI</p>
                  <p className="mt-1 whitespace-pre-line text-sm leading-6 text-slate-200">{chart.notes.hpi}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">MSE</p>
                  <p className="mt-1 whitespace-pre-line text-sm leading-6 text-slate-200">{chart.notes.mse}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Plan</p>
                  <p className="mt-1 whitespace-pre-line text-sm leading-6 text-slate-200">{chart.notes.plan}</p>
                </div>
                {chart.notes.psychotherapy.trim() ? (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">90833</p>
                    <p className="mt-1 whitespace-pre-line text-sm leading-6 text-slate-200">{chart.notes.psychotherapy}</p>
                  </div>
                ) : null}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
