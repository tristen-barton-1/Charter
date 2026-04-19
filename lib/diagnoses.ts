import type { DiagnosisCode } from "@/lib/types";

export const diagnosisOrder: DiagnosisCode[] = [
  "alzheimers",
  "mdd",
  "gad",
  "schizoaffective",
  "bipolar",
  "delusional_disorder",
  "schizophrenia",
  "dementia_mood",
  "dementia_anxiety",
  "dementia_behavior",
  "insomnia",
  "skin_picking",
  "impulse_control",
];

export const diagnosisLabels: Record<DiagnosisCode, string> = {
  alzheimers: "Alzheimer's disease",
  mdd: "Major depressive disorder",
  gad: "Generalized anxiety disorder",
  schizoaffective: "Schizoaffective disorder",
  bipolar: "Bipolar disorder",
  delusional_disorder: "Delusional disorder",
  schizophrenia: "Schizophrenia",
  dementia_mood: "Dementia with mood disturbance",
  dementia_anxiety: "Dementia with anxiety",
  dementia_behavior: "Dementia with behavioral disturbance",
  insomnia: "Insomnia",
  skin_picking: "Skin picking disorder",
  impulse_control: "Impulse control disorder",
};

export function formatList(items: string[]): string {
  if (items.length === 0) {
    return "";
  }

  if (items.length === 1) {
    return items[0];
  }

  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }

  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

export function formatDiagnosisHistory(codes: DiagnosisCode[]): string {
  const labels = diagnosisOrder
    .filter((code) => codes.includes(code))
    .map((code) => diagnosisLabels[code]);

  return labels.length > 0 ? formatList(labels) : "chronic psychiatric conditions";
}

export function formatSelectedDiagnosisSections(codes: DiagnosisCode[]): DiagnosisCode[] {
  return diagnosisOrder.filter((code) => codes.includes(code));
}
