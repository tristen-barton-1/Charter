import { polishVisitTranscript } from "@/lib/polish-transcript";
import { normalizeTranscriptForChart } from "@/lib/transcript-normalize-free";

export function isOpenAiPolishEnabled(): boolean {
  const v = process.env.OPENAI_POLISH_TRANSCRIPT;
  return v !== "false" && v !== "0";
}

export async function formatTranscriptForAi(
  rawTranscript: string,
  apiKey: string | null,
  chartModel: string,
): Promise<string> {
  let t = normalizeTranscriptForChart(rawTranscript);
  if (!isOpenAiPolishEnabled() || !apiKey || !t.trim()) {
    return t;
  }
  const polishModel = process.env.OPENAI_TRANSCRIPT_POLISH_MODEL?.trim() || chartModel;
  const polished = await polishVisitTranscript(t, apiKey, polishModel);
  if (polished) {
    t = polished;
  }
  return t;
}
