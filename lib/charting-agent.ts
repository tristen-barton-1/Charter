import { Agent } from "@openai/agents";
import { z } from "zod";
import { getChartFromConversationSystemPrompt } from "@/lib/chart-conversation-fewshot";

const nullableFlag = z.boolean().nullable();

const parsedFlagsSchema = z.object({
  anxiety: nullableFlag,
  depression: nullableFlag,
  sleepPoor: nullableFlag,
  sleepStable: nullableFlag,
  appetiteGood: nullableFlag,
  medCompliant: nullableFlag,
  paranoia: nullableFlag,
  delusions: nullableFlag,
  agitation: nullableFlag,
  pacing: nullableFlag,
  wandering: nullableFlag,
  notRedirectable: nullableFlag,
  confused: nullableFlag,
  minimalSpeech: nullableFlag,
  calm: nullableFlag,
  cooperative: nullableFlag,
});

const chartNoteString = z.preprocess(
  (val) => (typeof val === "string" ? val : ""),
  z.string(),
);

export const chartFromConversationOutputSchema = z.object({
  notes: z.object({
    hpi: chartNoteString,
    mse: chartNoteString,
    plan: chartNoteString,
    psychotherapy: chartNoteString,
  }),
  parsed: z.object({
    staffSummary: z.string().nullable(),
    denialMode: z.enum(["none", "short", "full"]),
    msePreset: z.enum(["standard", "dementia", "psychosis"]),
    flags: parsedFlagsSchema,
  }),
});

export type ChartFromConversationAgentOutput = z.infer<typeof chartFromConversationOutputSchema>;

export function createPsychChartingAgent(model: string) {
  return new Agent({
    name: "Psych LTC charting",
    instructions: getChartFromConversationSystemPrompt(),
    model,
    modelSettings: { temperature: 0.25 },
    outputType: chartFromConversationOutputSchema,
  });
}
