import { NextResponse } from "next/server";

import { isAdminEmail } from "@/lib/admin";
import { getCurrentUser } from "@/lib/auth";
import { GRAMMAR_LEVELS, loadGrammarDataset, type GrammarLevel } from "@/lib/grammar-dataset";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ExportLevel = GrammarLevel | "ALL";

function parseLevel(value: string | null): ExportLevel {
  const normalized = (value ?? "ALL").trim().toUpperCase();
  if (normalized === "ALL") {
    return "ALL";
  }
  if (GRAMMAR_LEVELS.includes(normalized as GrammarLevel)) {
    return normalized as GrammarLevel;
  }
  return "ALL";
}

function buildFilename(level: ExportLevel, lessonFilter: string | null): string {
  const dateKey = new Date().toISOString().slice(0, 10);
  const baseLevel = level.toLowerCase();
  if (lessonFilter) {
    return `grammar-export-${baseLevel}-lesson-${lessonFilter}-${dateKey}.json`;
  }
  return `grammar-export-${baseLevel}-${dateKey}.json`;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json(
      {
        message: "Ban khong co quyen export du lieu ngu phap.",
      },
      { status: 403 }
    );
  }

  const url = new URL(request.url);
  const level = parseLevel(url.searchParams.get("level"));
  const lessonFilter = (url.searchParams.get("lesson") ?? "").trim();
  const shouldDownload = url.searchParams.get("download") === "1";

  const dataset = await loadGrammarDataset();
  let lessons = [...dataset.lessons];

  if (level !== "ALL") {
    lessons = lessons.filter((lesson) => lesson.level === level);
  }

  if (lessonFilter) {
    lessons = lessons.filter(
      (lesson) =>
        lesson.id === lessonFilter || String(lesson.lessonNumber) === lessonFilter
    );
  }

  lessons.sort((a, b) => {
    const levelOrder = GRAMMAR_LEVELS.indexOf(a.level) - GRAMMAR_LEVELS.indexOf(b.level);
    if (levelOrder !== 0) {
      return levelOrder;
    }
    return a.lessonNumber - b.lessonNumber;
  });

  const payload = {
    exportedAt: new Date().toISOString(),
    source: dataset.source,
    importedAt: dataset.importedAt,
    level,
    lessonFilter: lessonFilter || null,
    lessonCount: lessons.length,
    pointCount: lessons.reduce((sum, lesson) => sum + lesson.points.length, 0),
    lessons,
  };

  return new Response(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...(shouldDownload
        ? {
            "Content-Disposition": `attachment; filename="${buildFilename(
              level,
              lessonFilter || null
            )}"`,
          }
        : {}),
    },
  });
}

