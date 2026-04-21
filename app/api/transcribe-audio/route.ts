import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 503 });
  }

  const incoming = await request.formData().catch(() => null);
  if (!incoming) {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const file = incoming.get("file");
  if (!(file instanceof Blob) || file.size < 32) {
    return NextResponse.json({ error: "No audio file uploaded." }, { status: 400 });
  }

  const whisperModel = process.env.OPENAI_WHISPER_MODEL?.trim() || "whisper-1";
  const filename =
    file instanceof File && file.name
      ? file.name
      : file.type.includes("mp4")
        ? "visit.m4a"
        : "visit.webm";

  const outbound = new FormData();
  outbound.append("file", file, filename);
  outbound.append("model", whisperModel);

  const openaiRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: outbound,
  });

  if (!openaiRes.ok) {
    const errText = await openaiRes.text();
    return NextResponse.json(
      { error: `Transcription failed: ${openaiRes.status} ${errText.slice(0, 400)}` },
      { status: 502 },
    );
  }

  const payload = (await openaiRes.json()) as { text?: string };
  const text = typeof payload.text === "string" ? payload.text.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "Empty transcription." }, { status: 502 });
  }

  return NextResponse.json({ text });
}
