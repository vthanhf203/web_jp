import { NextResponse } from "next/server";

import { JLPT_LEVELS, loadAdminVocabLibrary, type JlptLevel } from "@/lib/admin-vocab-library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalize(value: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

function normalizeText(value: string | null): string {
  return (value ?? "").trim();
}

function levelRank(level: string): number {
  const normalized = level.toUpperCase() as JlptLevel;
  const index = JLPT_LEVELS.indexOf(normalized);
  return index >= 0 ? index : 99;
}

function slugify(value: string): string {
  const slug = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "vocab";
}

function formatTokyoDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "00";
  const day = parts.find((part) => part.type === "day")?.value ?? "00";
  return `${year}-${month}-${day}`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const level = normalize(url.searchParams.get("level"));
  const query = normalize(url.searchParams.get("q"));
  const lessonId = normalizeText(url.searchParams.get("lesson"));
  const shouldDownload = url.searchParams.get("download") === "1";

  const library = await loadAdminVocabLibrary();
  let lessons = [...library.lessons];

  if (level) {
    lessons = lessons.filter((lesson) => lesson.jlptLevel.toLowerCase() === level);
  }

  if (lessonId) {
    lessons = lessons.filter((lesson) => lesson.id === lessonId);
  }

  if (query) {
    lessons = lessons
      .map((lesson) => ({
        ...lesson,
        items: lesson.items.filter((item) =>
          [
            item.word,
            item.reading,
            item.kanji,
            item.hanviet,
            item.meaning,
            item.partOfSpeech,
          ]
            .join(" ")
            .toLowerCase()
            .includes(query)
        ),
      }))
      .filter((lesson) => lesson.items.length > 0);
  }

  lessons = lessons.sort((a, b) => {
    const levelDiff = levelRank(a.jlptLevel) - levelRank(b.jlptLevel);
    if (levelDiff !== 0) {
      return levelDiff;
    }
    return a.title.localeCompare(b.title, "vi");
  });

  const payload = {
    updatedAt: library.updatedAt,
    lessonCount: lessons.length,
    lessons: lessons.map((lesson) => ({
      id: lesson.id,
      title: lesson.title,
      description: lesson.description,
      jlptLevel: lesson.jlptLevel,
      itemCount: lesson.items.length,
      updatedAt: lesson.updatedAt,
      items: lesson.items,
    })),
  };

  const dateKey = formatTokyoDateKey(new Date());
  const filenameParts = [
    "vocab-export",
    level || "all",
    lessonId ? slugify(lessons[0]?.title ?? lessonId) : "",
    query ? slugify(query) : "",
    dateKey,
  ].filter(Boolean);
  const filename = `${filenameParts.join("-")}.json`;

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
