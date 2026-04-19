import type { ParsedEncounter } from "@/lib/types";

export function createEmptyParsedEncounter(): ParsedEncounter {
  return {
    denialMode: "none",
    msePreset: "standard",
    flags: {},
  };
}
