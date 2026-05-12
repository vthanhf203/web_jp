import { NextResponse } from "next/server";

import { JLPT_LEVELS, type JlptLevel } from "@/lib/admin-vocab-library";
import { getCurrentUser } from "@/lib/auth";
import { sortKanjiByLearningOrder } from "@/lib/kanji-compound";
import { loadUserKanjiStore } from "@/lib/user-kanji-store";

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
    .split(/[;,|/]|,\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      {
        message: "Bạn cần đăng nhập để export Kanji cá nhân.",
      },
      { status: 401 }
    );
  }

  const url = new URL(request.url);
  const level = parseExportLevel(url.searchParams.get("level"));
  const shouldDownload = url.searchParams.get("download") === "1";
  const deckName = (url.searchParams.get("deck") ?? "").trim();

  const store = await loadUserKanjiStore(user.id);
  const levelFilteredItems =
    level === "ALL" ? store.items : store.items.filter((item) => item.jlptLevel === level);
  const filteredItems = deckName
    ? levelFilteredItems.filter((item) => item.deckName === deckName)
    : levelFilteredItems;
  const sortedItems = sortKanjiByLearningOrder(filteredItems, {
    getOrder: (item) => item.order,
  });

  const payload = sortedItems.map((item) => ({
    id: item.id,
    character: item.character,
    deckName: item.deckName,
    hanviet: item.hanviet,
    meaning: item.meaning,
    onReading: splitReading(item.onReading),
    kunReading: splitReading(item.kunReading),
    strokeCount: item.strokeCount,
    jlptLevel: item.jlptLevel,
    order: item.order,
    category: item.category,
    tags: item.tags,
    strokeHint: item.strokeHint,
    strokeImage: item.strokeImage,
    exampleWord: item.exampleWord,
    exampleMeaning: item.exampleMeaning,
    relatedVocabularies: item.relatedWords.map((word) => ({
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
    })),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }));

  const dateKey = new Date().toISOString().slice(0, 10);
  const fileLevel = level.toLowerCase();
  const fileDeck = deckName
    ? `-${deckName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "deck"}`
    : "";
  const filename = `personal-kanji-export-${fileLevel}${fileDeck}-${dateKey}.json`;

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
