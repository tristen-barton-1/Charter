import { NextResponse } from "next/server";
import { formatTranscriptForAi, isOpenAiPolishEnabled } from "@/lib/transcript-server-format";

type Body = {
  transcript?: string;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Body | null;
  const raw = typeof body?.transcript === "string" ? body.transcript : "";

  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  const apiKey = process.env.OPENAI_API_KEY ?? null;

  if (isOpenAiPolishEnabled() && !apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 503 });
  }

  const transcript = await formatTranscriptForAi(raw, apiKey, model);
  return NextResponse.json({ transcript });
}
