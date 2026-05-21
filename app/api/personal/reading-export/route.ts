import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { loadReadingPracticeStore, type ReadingTextItem } from "@/lib/reading-practice-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const READING_LEVELS = ["N5", "N4", "N3", "N2", "N1"] as const;
type ReadingLevel = (typeof READING_LEVELS)[number];
type ExportLevel = ReadingLevel | "ALL";

function parseExportLevel(value: string | null): ExportLevel {
  const normalized = (value ?? "ALL").trim().toUpperCase();
  if (normalized === "ALL") {
    return "ALL";
  }
  if (READING_LEVELS.includes(normalized as ReadingLevel)) {
    return normalized as ReadingLevel;
  }
  return "ALL";
}

function splitTranslationByParagraph(text: string): string[] {
  if (!text.trim()) {
    return [];
  }
  const blocks = text
    .split(/\n{2,}|\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  return blocks;
}

function normalizeDeckForFileName(deckName: string): string {
  return (
    deckName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "deck"
  );
}

function mapReadingItemForExport(item: ReadingTextItem) {
  const paragraphTranslations = splitTranslationByParagraph(item.translation);
  return {
    id: item.id,
    deckName: item.deckName,
    title: item.title,
    jlptLevel: item.jlptLevel,
    topic: item.topic,
    difficulty: item.difficulty,
    estimatedMinutes: item.estimatedMinutes,
    paragraphs: item.paragraphs.map((jp, index) => ({
      jp,
      vi: paragraphTranslations[index] ?? "",
    })),
    translation: item.translation,
    vocabulary: item.vocabulary,
    grammarCoverage: item.grammarCoverage,
    questions: item.questions,
    postReadingQuiz: item.postReadingQuiz,
    sentenceRecallPractice: item.sentenceRecallPractice,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      {
        message: "Ban can dang nhap de export bai doc.",
      },
      { status: 401 }
    );
  }

  const url = new URL(request.url);
  const level = parseExportLevel(url.searchParams.get("level"));
  const deckName = (url.searchParams.get("deck") ?? "").trim();
  const shouldDownload = url.searchParams.get("download") === "1";

  const store = await loadReadingPracticeStore(user.id);
  const levelFilteredItems =
    level === "ALL" ? store.items : store.items.filter((item) => item.jlptLevel === level);
  const filteredItems = deckName
    ? levelFilteredItems.filter((item) => item.deckName === deckName)
    : levelFilteredItems;

  const payload = filteredItems
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(mapReadingItemForExport);

  const dateKey = new Date().toISOString().slice(0, 10);
  const fileLevel = level.toLowerCase();
  const fileDeck = deckName ? `-${normalizeDeckForFileName(deckName)}` : "";
  const filename = `reading-export-${fileLevel}${fileDeck}-${dateKey}.json`;

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
