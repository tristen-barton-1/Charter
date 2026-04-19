import { Agent } from "@openai/agents";
import { z } from "zod";
import { getChartFromConversationSystemPrompt } from "@/lib/chart-conversation-fewshot";

const parsedFlagsSchema = z
  .object({
    anxiety: z.boolean().optional(),
    depression: z.boolean().optional(),
    sleepPoor: z.boolean().optional(),
    sleepStable: z.boolean().optional(),
    appetiteGood: z.boolean().optional(),
    medCompliant: z.boolean().optional(),
    paranoia: z.boolean().optional(),
    delusions: z.boolean().optional(),
    agitation: z.boolean().optional(),
    pacing: z.boolean().optional(),
    wandering: z.boolean().optional(),
    notRedirectable: z.boolean().optional(),
    confused: z.boolean().optional(),
    minimalSpeech: z.boolean().optional(),
    calm: z.boolean().optional(),
    cooperative: z.boolean().optional(),
  })
  .optional();

export const chartFromConversationOutputSchema = z.object({
  notes: z.object({
    hpi: z.string(),
    mse: z.string(),
    plan: z.string(),
    psychotherapy: z.string(),
  }),
  parsed: z.object({
    staffSummary: z.string().optional(),
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
