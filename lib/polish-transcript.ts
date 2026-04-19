const POLISH_SYSTEM = `You format raw speech-to-text (e.g. Whisper) into readable clinical visit prose for downstream charting.

Allowed edits only:
- Sentence breaks, commas, periods, question marks, and capitalization at sentence starts.
- Blank lines between clear topic or speaker shifts when obvious from context.
- Obvious missing spaces between words (word-boundary fixes only).

Strict rules — violating any of these is a failure:
- Do not change clinical meaning. Do not paraphrase, summarize, add facts, or remove facts.
- Do not substitute homophones or "fix" a phrase into a different medical meaning. Examples: "e mar" / "emar" / "e-mar" in charting context means the medication administration record — normalize to "eMAR", never "him", "hit him", or "EMR" unless the surrounding words clearly mean something else.
- Preserve medication names, doses, vitals, times, and facility terms exactly unless fixing clear ASR word-splits (e.g. "142 over 88" stays; do not invent units).
- Do not invent subjects (e.g. do not add "him/her" for medication dosing) unless the raw text clearly refers to the patient.
- If a fragment is ambiguous, keep it close to the original wording rather than guessing.

Output only the cleaned transcript text. No title, label, markdown fences, or commentary.`;

export async function polishVisitTranscript(
  transcript: string,
  apiKey: string,
  model: string,
): Promise<string | null> {
  const trimmed = transcript.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length > 48_000) {
    return null;
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.08,
      max_tokens: Math.min(16_384, Math.max(512, Math.ceil(trimmed.length / 3) + 400)),
      messages: [
        { role: "system", content: POLISH_SYSTEM },
        { role: "user", content: trimmed },
      ],
    }),
  });

  if (!res.ok) {
    return null;
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) {
    return null;
  }

  let out = text.replace(/^```(?:text|plain)?\s*/i, "").replace(/\s*```$/i, "").trim();
  if (!out) {
    return null;
  }
  return out;
}
