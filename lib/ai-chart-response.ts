import type { DenialMode, MsePreset, NoteOutputs, ParsedEncounter, ParsedFlags } from "@/lib/types";
import { createEmptyParsedEncounter } from "@/lib/parsed-encounter-defaults";

const denialModes = new Set<DenialMode>(["none", "short", "full"]);
const msePresets = new Set<MsePreset>(["standard", "dementia", "psychosis"]);

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function normalizeDenial(value: unknown): DenialMode {
  return typeof value === "string" && denialModes.has(value as DenialMode) ? (value as DenialMode) : "none";
}

function normalizeMsePreset(value: unknown): MsePreset {
  return typeof value === "string" && msePresets.has(value as MsePreset) ? (value as MsePreset) : "standard";
}

function normalizeFlags(value: unknown): ParsedFlags {
  if (!value || typeof value !== "object") {
    return {};
  }
  const input = value as Record<string, unknown>;
  const out: ParsedFlags = {};
  const keys = [
    "anxiety",
    "depression",
    "sleepPoor",
    "sleepStable",
    "appetiteGood",
    "medCompliant",
    "paranoia",
    "delusions",
    "agitation",
    "pacing",
    "wandering",
    "notRedirectable",
    "confused",
    "minimalSpeech",
    "calm",
    "cooperative",
  ] as const;
  for (const key of keys) {
    if (input[key] === true) {
      out[key] = true;
    }
  }
  return out;
}

function normalizeParsed(value: unknown): ParsedEncounter {
  if (!value || typeof value !== "object") {
    return createEmptyParsedEncounter();
  }
  const o = value as Record<string, unknown>;
  const staffSummary = o.staffSummary;
  return {
    staffSummary: typeof staffSummary === "string" ? staffSummary : undefined,
    denialMode: normalizeDenial(o.denialMode),
    msePreset: normalizeMsePreset(o.msePreset),
    flags: normalizeFlags(o.flags),
  };
}

export function normalizeAiChartPayload(
  parsed: unknown,
  enablePsychotherapy: boolean,
): { notes: NoteOutputs; parsed: ParsedEncounter } {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid model output.");
  }
  const root = parsed as Record<string, unknown>;
  const notesRaw = root.notes;
  if (!notesRaw || typeof notesRaw !== "object") {
    throw new Error("Model output missing notes.");
  }
  const n = notesRaw as Record<string, unknown>;
  const notes: NoteOutputs = {
    hpi: asString(n.hpi),
    mse: asString(n.mse),
    plan: asString(n.plan),
    psychotherapy: enablePsychotherapy ? asString(n.psychotherapy) : "",
  };
  return {
    notes,
    parsed: normalizeParsed(root.parsed),
  };
}

export function extractJsonFromModelText(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonStr = fence ? fence[1].trim() : trimmed;
  return JSON.parse(jsonStr) as unknown;
}
