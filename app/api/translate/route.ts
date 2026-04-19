import { NextResponse } from "next/server";
import Groq from "groq-sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TranslatePayload = {
  text?: string;
};

type GoogleTranslateResponse = {
  data?: {
    translations?: Array<{
      translatedText?: string;
    }>;
  };
  error?: {
    message?: string;
  };
};

export async function POST(request: Request) {
  const googleApiKey = process.env.GOOGLE_TRANSLATE_KEY?.trim();
  const groqApiKey = (process.env.GROQ_API_KEY ?? process.env.GROQ_API_Key ?? "").trim();

  try {
    const body = (await request.json()) as TranslatePayload;
    const text = body?.text?.trim();

    if (!text) {
      return NextResponse.json({ translation: "" });
    }

    let googleErrorMessage = "";
    if (googleApiKey) {
      try {
        const res = await fetch(
          `https://translation.googleapis.com/language/translate/v2?key=${googleApiKey}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              q: text,
              source: "ja",
              target: "vi",
              format: "text",
            }),
          }
        );

        const data = (await res.json()) as GoogleTranslateResponse;
        if (!res.ok) {
          throw new Error(data?.error?.message ?? "Google translate request failed.");
        }

        const translation = data?.data?.translations?.[0]?.translatedText ?? "";
        return NextResponse.json({ translation });
      } catch (error) {
        googleErrorMessage = error instanceof Error ? error.message : "Google translate failed.";
      }
    }

    if (!groqApiKey) {
      return NextResponse.json(
        { message: googleErrorMessage || "Chua cai dat GOOGLE_TRANSLATE_KEY hoac GROQ_API_KEY" },
        { status: 500 }
      );
    }

    try {
      const groq = new Groq({ apiKey: groqApiKey });
      const completion = await groq.chat.completions.create({
        model: "llama-3.1-8b-instant",
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "Translate Japanese text to natural Vietnamese. Return only the Vietnamese translation, no extra notes.",
          },
          {
            role: "user",
            content: text,
          },
        ],
      });

      const translation = completion.choices[0]?.message?.content?.trim() ?? "";
      return NextResponse.json({ translation });
    } catch (error) {
      const groqErrorMessage = error instanceof Error ? error.message : "Groq translate failed.";
      return NextResponse.json(
        { message: googleErrorMessage || groqErrorMessage || "Dich that bai" },
        { status: 500 }
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Dich that bai";
    return NextResponse.json({ message }, { status: 500 });
  }
}
