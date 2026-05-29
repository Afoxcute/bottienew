import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";

const GROQ_API_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const GROQ_MODEL = "whisper-large-v3-turbo";

export async function POST(req: Request) {
  try {
    await verifyAuth();
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) {
    return NextResponse.json(
      { error: "Voice transcription not configured" },
      { status: 500 },
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid request format" },
      { status: 400 },
    );
  }

  const audioFile = formData.get("audio") as File | null;
  if (!audioFile) {
    return NextResponse.json(
      { error: "No audio file provided" },
      { status: 400 },
    );
  }

  const MAX_FILE_SIZE = 25 * 1024 * 1024;
  if (audioFile.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "Audio file too large (max 25MB)" },
      { status: 413 },
    );
  }

  const groqFormData = new FormData();
  groqFormData.append("file", audioFile);
  groqFormData.append("model", GROQ_MODEL);
  groqFormData.append("language", "en");
  groqFormData.append("response_format", "json");
  groqFormData.append("temperature", "0");

  try {
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
      body: groqFormData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Voice] Groq API error:", response.status, errorText);
      if (response.status === 429) {
        return NextResponse.json(
          { error: "Rate limit exceeded. Please try again later." },
          { status: 429 },
        );
      }
      return NextResponse.json(
        { error: "Transcription failed. Please try again." },
        { status: response.status },
      );
    }

    const result = await response.json();
    if (typeof result.text !== "string") {
      return NextResponse.json(
        { error: "Invalid transcription response" },
        { status: 502 },
      );
    }

    return NextResponse.json({ text: result.text });
  } catch {
    return NextResponse.json(
      { error: "Network error. Please check your connection." },
      { status: 502 },
    );
  }
}
