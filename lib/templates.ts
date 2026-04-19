import type { DiagnosisCode, MsePreset } from "@/lib/types";
import { diagnosisLabels } from "@/lib/diagnoses";

export const fullDenialSentence =
  "The patient denies any increase in depressive symptoms, irritability, agitation, hallucinations, delusions, verbal outbursts, or suicidal or homicidal ideation.";

export const shortDenialSentence =
  "The patient denies suicidal ideation, homicidal ideation, auditory or visual hallucinations, and acute behavioral concerns.";

export const defaultStabilitySentence =
  "During today's evaluation, the patient is calm, cooperative, and appropriately engaged. No evidence of acute psychiatric decompensation is observed.";

export const defaultMedReviewSentence =
  "The patient remains medication compliant and denies adverse effects. Recent nursing notes, medication administration records, and available clinical data were reviewed for ongoing monitoring of treatment response and tolerability.";

export const nonCompliantMedReviewSentence =
  "Medication adherence and tolerability were reviewed with staff and nursing documentation. Recent nursing notes, medication administration records, and available clinical data were reviewed for ongoing monitoring of treatment response and tolerability.";

export const msePresetTemplates: Record<MsePreset, string[]> = {
  standard: [
    "Appearance: Appropriately groomed",
    "Speech: Clear",
    "Mood: Euthymic",
    "Affect: Congruent with mood",
    "Thought Processes: Circumstantial",
    "Thought Content: No delusions, obsessions, ruminations, paranoia, suicidal, or homicidal ideations",
    "Perception: No hallucinations or illusions",
    "Orientation: Alert and oriented x3",
    "Memory and Concentration: Short-term and long-term memory intact",
    "Insight and Judgment: Good",
  ],
  dementia: [
    "Appearance: Elderly female appearing stated age, appropriately dressed",
    "Behavior: Cooperative but limited engagement due to cognitive impairment",
    "Speech: Minimal",
    "Mood: Unable to reliably assess due to cognition",
    "Affect: Constricted",
    "Thought Process: Disorganized and impoverished",
    "Thought Content: Paranoid thoughts reported by staff",
    "Perception: No hallucinations observed during evaluation",
    "Cognition: Severe cognitive impairment with disorientation and memory deficits consistent with advanced dementia",
    "Insight: Poor",
    "Judgment: Impaired",
    "Impulse Control: Limited",
  ],
  psychosis: [
    "Behavior: Suspicious, hypervigilant, not easily redirectable",
    "Speech: Normal rate, pressured at times when discussing delusions",
    "Mood: Anxious",
    "Affect: Constricted, paranoid",
    "Thought Process: Disorganized",
    "Thought Content: Prominent persecutory delusions; denies SI/HI",
    "Perception: No overt hallucinations reported, though reliability limited",
    "Insight/Judgment: Poor",
    "Cognition: Impaired",
  ],
};

export const planTemplates: Record<
  DiagnosisCode,
  {
    heading: string;
    lines: string[];
  }
> = {
  alzheimers: {
    heading: diagnosisLabels.alzheimers,
    lines: [
      "Continue donepezil and memantine as ordered.",
      "Maintain a structured routine and familiar staff approach in the long-term care setting.",
      "Monitor cognition, safety, and any change in behavior.",
    ],
  },
  mdd: {
    heading: diagnosisLabels.mdd,
    lines: [
      "Continue current antidepressant regimen as ordered.",
      "Monitor mood, sleep, appetite, and energy level.",
      "Staff to report any worsening depression, tearfulness, or suicidal thinking.",
    ],
  },
  gad: {
    heading: diagnosisLabels.gad,
    lines: [
      "Continue buspirone as ordered.",
      "Monitor anxiety symptoms.",
      "Avoid benzodiazepines when cognition is a concern.",
    ],
  },
  schizoaffective: {
    heading: diagnosisLabels.schizoaffective,
    lines: [
      "Continue current antipsychotic and mood stabilizer regimen as ordered.",
      "Monitor for mood instability, psychosis, and medication tolerability.",
      "Coordinate with nursing staff regarding any behavioral change or safety concern.",
    ],
  },
  bipolar: {
    heading: diagnosisLabels.bipolar,
    lines: [
      "Continue mood stabilizer and/or antipsychotic regimen as ordered.",
      "Monitor for sleep disruption, irritability, elevated mood, or agitation.",
      "Staff to report any signs of mood cycling or behavioral escalation.",
    ],
  },
  delusional_disorder: {
    heading: diagnosisLabels.delusional_disorder,
    lines: [
      "Continue current antipsychotic regimen as ordered if prescribed.",
      "Monitor fixed false beliefs, suspiciousness, and impact on care participation.",
      "Use calm redirection and consistent staff communication in the long-term care setting.",
    ],
  },
  schizophrenia: {
    heading: diagnosisLabels.schizophrenia,
    lines: [
      "Continue current antipsychotic and mood stabilizer regimen as ordered.",
      "Monitor psychosis, hallucinations, and response to treatment.",
      "Maintain close nursing communication for any acute behavioral or safety change.",
    ],
  },
  dementia_mood: {
    heading: diagnosisLabels.dementia_mood,
    lines: [
      "Maintain structured routine and supportive staff approach.",
      "Monitor for mood lability, crying spells, irritability, or withdrawal.",
      "Continue nonpharmacologic support and report any worsening symptoms.",
    ],
  },
  dementia_anxiety: {
    heading: diagnosisLabels.dementia_anxiety,
    lines: [
      "Monitor for changes in pacing or wandering behaviors.",
      "Maintain structured environment and supervision for safety.",
      "Staff to monitor and report agitation, psychosis, or behavioral escalation.",
    ],
  },
  dementia_behavior: {
    heading: diagnosisLabels.dementia_behavior,
    lines: [
      "Maintain structured routine.",
      "Supervised ambulation for safety.",
      "Redirection during pacing.",
    ],
  },
  insomnia: {
    heading: diagnosisLabels.insomnia,
    lines: [
      "Continue or adjust trazodone as ordered.",
      "Reinforce sleep hygiene.",
      "Consider melatonin issues if relevant.",
    ],
  },
  skin_picking: {
    heading: diagnosisLabels.skin_picking,
    lines: [
      "Continue medication as ordered.",
      "Monitor skin integrity and any return of picking behaviors.",
      "No recent reports of skin picking if stable.",
    ],
  },
  impulse_control: {
    heading: diagnosisLabels.impulse_control,
    lines: [
      "Continue medication as ordered.",
      "Monitor for impulsive or repetitive behaviors.",
      "No reported recent behaviors if stable.",
    ],
  },
};

export const psychotherapySections = {
  title: "90833 psychotherapy note",
  timeSpent: "16 minutes",
  focus: "supportive psychotherapy focused on anxiety, insomnia, coping, and stress management in the long-term care setting.",
  separation:
    "Psychotherapy was provided in addition to E/M service. Time and effort were separate and distinct from medication management and clinical evaluation.",
};
