import Groq from "groq-sdk";
import { NextResponse } from "next/server";

import type { FuriganaWord } from "@/types/shadowing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FuriganaPayload = {
  text?: string;
};

type GroqJsonPayload = {
  words?: Array<{
    text?: string;
    furigana?: string;
    romaji?: string;
  }>;
};

function normalizeWords(words: GroqJsonPayload["words"]): FuriganaWord[] {
  if (!Array.isArray(words)) {
    return [];
  }

  return words
    .map((word) => {
      const text = typeof word?.text === "string" ? word.text.trim() : "";
      if (!text) {
        return null;
      }

      return {
        text,
        furigana: typeof word?.furigana === "string" ? word.furigana.trim() : "",
        romaji: typeof word?.romaji === "string" ? word.romaji.trim() : "",
      } satisfies FuriganaWord;
    })
    .filter((item): item is FuriganaWord => item !== null);
}

function parseJsonFromModel(content: string): GroqJsonPayload {
  const stripped = content
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(stripped) as GroqJsonPayload;
  } catch {
    const first = stripped.indexOf("{");
    const last = stripped.lastIndexOf("}");
    if (first >= 0 && last > first) {
      const sliced = stripped.slice(first, last + 1);
      return JSON.parse(sliced) as GroqJsonPayload;
    }
    throw new Error("Invalid JSON from model");
  }
}

export async function POST(request: Request) {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ message: "Chưa cài đặt GROQ_API_KEY" }, { status: 500 });
  }

  try {
    const body = (await request.json()) as FuriganaPayload;
    const text = body?.text?.trim();
    if (!text) {
      return NextResponse.json({ words: [] });
    }

    const groq = new Groq({ apiKey });
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content:
            "You are a Japanese language expert. Convert Japanese text to JSON. Return ONLY valid JSON, no markdown backticks, no explanation. Format: { words: [{ text: string, furigana: string, romaji: string }] } Rules: - For kanji/kana words: fill furigana and romaji - For hiragana only: furigana = same as text, fill romaji - For numbers/symbols: furigana = '', romaji = '' - Split by natural word boundaries",
        },
        {
          role: "user",
          content: text,
        },
      ],
    });

    const content = completion.choices[0]?.message?.content?.trim() ?? "";
    if (!content) {
      throw new Error("No content");
    }

    const parsed = parseJsonFromModel(content);
    const words = normalizeWords(parsed.words);

    if (words.length === 0) {
      throw new Error("No words");
    }

    return NextResponse.json({ words });
  } catch {
    return NextResponse.json({ message: "Phân tích furigana thất bại" }, { status: 500 });
  }
}
