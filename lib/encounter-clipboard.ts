import type { SavedChart } from "@/lib/types";

export function buildSavedEncounterClipboardText(chart: SavedChart): string {
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
