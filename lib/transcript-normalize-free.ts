function capitalizeFirst(s: string): string {
  return s.replace(/^(\s*)([a-z])/g, (_, ws: string, c: string) => `${ws}${c.toUpperCase()}`);
}

function formatBlock(s: string): string {
  let x = s.replace(/\s+/g, " ").trim();
  if (!x) {
    return "";
  }
  x = x.replace(/\bi\b/g, "I");
  x = capitalizeFirst(x);
  x = x.replace(/([.!?])(\s+)([a-z])/g, (_m, punct: string, sp: string, letter: string) => `${punct}${sp}${letter.toUpperCase()}`);
  return x;
}

export function normalizeTranscriptForChart(input: string): string {
  if (!input) {
    return input;
  }
  let t = input.replace(/\u00a0/g, " ");
  t = t.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  t = t.replace(/[ \t]+$/gm, "");
  t = t.replace(/\n{3,}/g, "\n\n");
  const blocks = t
    .split(/\n\n+/)
    .map((block) => formatBlock(block.replace(/\n/g, " ")))
    .filter(Boolean);
  return blocks.join("\n\n");
}
