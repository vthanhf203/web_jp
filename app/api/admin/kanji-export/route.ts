import { NextResponse } from "next/server";

import { JLPT_LEVELS, type JlptLevel } from "@/lib/admin-vocab-library";
import { isAdminEmail } from "@/lib/admin";
import { getCurrentUser } from "@/lib/auth";
import { sortKanjiByLearningOrder } from "@/lib/kanji-compound";
import { loadAdminKanjiMetadata } from "@/lib/kanji-metadata";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ExportLevel = JlptLevel | "ALL";

function parseExportLevel(value: string | null): ExportLevel {
  const normalized = (value ?? "ALL").trim().toUpperCase();
  if (normalized === "ALL") {
    return "ALL";
  }
  if (JLPT_LEVELS.includes(normalized as JlptLevel)) {
    return normalized as JlptLevel;
  }
  return "ALL";
}

function splitReading(value: string): string[] {
  return value
    .split(/[;,|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function toIso(value: Date): string {
  return value.toISOString();
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json(
      {
        message: "Bạn không có quyền export dữ liệu Kanji.",
      },
      { status: 403 }
    );
  }

  const url = new URL(request.url);
  const level = parseExportLevel(url.searchParams.get("level"));
  const shouldDownload = url.searchParams.get("download") === "1";

  const [kanjiRows, metadataStore] = await Promise.all([
    prisma.kanji.findMany({
      where: level === "ALL" ? {} : { jlptLevel: level },
    }),
    loadAdminKanjiMetadata(),
  ]);

  const metadataByCharacter = new Map(
    metadataStore.entries.map((entry) => [entry.character, entry])
  );
  const sortedRows = sortKanjiByLearningOrder(kanjiRows, {
    getOrder: (item) => metadataByCharacter.get(item.character)?.order,
  });

  const payload = sortedRows.map((kanji) => {
    const metadata = metadataByCharacter.get(kanji.character);
    const fallbackCreatedAt = toIso(kanji.createdAt);
    const relatedVocabularies = (metadata?.relatedWords ?? []).map((word) => ({
      id: word.id,
      word: word.word,
      reading: word.reading,
      kanji: word.kanji,
      hanviet: word.hanviet,
      meaning: word.meaning,
      type: word.type,
      jlptLevel: word.jlptLevel,
      exampleSentence: word.exampleSentence,
      exampleMeaning: word.exampleMeaning,
      note: word.note,
      sourceLabel: word.sourceLabel,
      createdAt: word.createdAt,
      updatedAt: word.updatedAt,
    }));

    return {
      id: metadata?.id || `kanji-${kanji.character}`,
      character: kanji.character,
      meaning: kanji.meaning,
      onReading: splitReading(kanji.onReading),
      kunReading: splitReading(kanji.kunReading),
      strokeCount: kanji.strokeCount,
      jlptLevel: kanji.jlptLevel,
      order: metadata?.order ?? null,
      category: metadata?.category || "",
      tags: metadata?.tags ?? [],
      strokeHint: metadata?.strokeHint || "",
      strokeImage: metadata?.strokeImage || "",
      exampleWord: kanji.exampleWord,
      exampleMeaning: kanji.exampleMeaning,
      relatedVocabularies,
      createdAt: metadata?.createdAt || fallbackCreatedAt,
      updatedAt: metadata?.updatedAt || fallbackCreatedAt,
    };
  });

  const dateKey = new Date().toISOString().slice(0, 10);
  const fileLevel = level.toLowerCase();
  const filename = `kanji-export-${fileLevel}-${dateKey}.json`;

  return new Response(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...(shouldDownload
        ? {
            "Content-Disposition": `attachment; filename="${filename}"`,
          }
        : {}),
    },
  });
}
