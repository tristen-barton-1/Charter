import type { PatientRecord } from "@/lib/types";

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

function startOfLocalDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function formatPatientLastSeen(patient: Pick<PatientRecord, "latestEncounterAt" | "lastSeen">): string {
  const iso = patient.latestEncounterAt?.trim();
  if (iso) {
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) {
      const now = new Date();
      const dayDiff = Math.round((startOfLocalDay(now) - startOfLocalDay(d)) / 864e5);
      if (dayDiff === 0) {
        return "Today";
      }
      if (dayDiff === 1) {
        return "Yesterday";
      }
      if (dayDiff > 1 && dayDiff < 7) {
        return `${dayDiff} days ago`;
      }
      return d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
      });
    }
  }
  const s = patient.lastSeen?.trim() ?? "";
  return s || "—";
}
