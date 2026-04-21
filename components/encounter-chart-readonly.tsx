"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import CopyButton from "@/components/copy-button";
import type { EncounterInput, SavedChart } from "@/lib/types";

export interface EncounterChartReadonlyProps {
  transcript: string;
  input: EncounterInput;
  notes: SavedChart["notes"];
}

export default function EncounterChartReadonly({ transcript, input, notes }: EncounterChartReadonlyProps) {
  return (
    <div className="grid gap-4">
      <Card className="border-slate-700/80 bg-slate-950/50">
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <CardTitle className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-400">Transcript</CardTitle>
          <CopyButton text={transcript} label="Copy transcript" className="shrink-0" />
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-line text-sm leading-7 text-slate-200">{transcript}</p>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="border-slate-700/80 bg-slate-950/50">
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <CardTitle className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-400">HPI</CardTitle>
            <CopyButton text={notes.hpi} label="Copy HPI" className="shrink-0" />
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-line text-sm leading-7 text-slate-200">{notes.hpi}</p>
          </CardContent>
        </Card>
        <Card className="border-slate-700/80 bg-slate-950/50">
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <CardTitle className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-400">MSE</CardTitle>
            <CopyButton text={notes.mse} label="Copy MSE" className="shrink-0" />
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-line text-sm leading-7 text-slate-200">{notes.mse}</p>
          </CardContent>
        </Card>
        <Card className="border-slate-700/80 bg-slate-950/50 xl:col-span-2">
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <CardTitle className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-400">Plan of Care</CardTitle>
            <CopyButton text={notes.plan} label="Copy plan" className="shrink-0" />
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-line text-sm leading-7 text-slate-200">{notes.plan}</p>
          </CardContent>
        </Card>
        {input.enablePsychotherapy || notes.psychotherapy.trim().length > 0 ? (
          <Card className="border-slate-700/80 bg-slate-950/50 xl:col-span-2">
            <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
              <CardTitle className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-400">
                90833 Psychotherapy Note
              </CardTitle>
              <CopyButton text={notes.psychotherapy} label="Copy 90833" className="shrink-0" />
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-line text-sm leading-7 text-slate-200">{notes.psychotherapy}</p>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
