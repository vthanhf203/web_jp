import { NextResponse } from "next/server";

import { loadGrammarDataset } from "@/lib/grammar-dataset";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const level = url.searchParams.get("level");
  const lesson = url.searchParams.get("lesson");
  const query = (url.searchParams.get("q") ?? "").trim().toLowerCase();

  const dataset = await loadGrammarDataset();
  let lessons = [...dataset.lessons];

  if (level === "N5" || level === "N4") {
    lessons = lessons.filter((item) => item.level === level);
  }

  if (lesson) {
    lessons = lessons.filter(
      (item) => item.id === lesson || String(item.lessonNumber) === lesson
    );
  }

  if (query) {
    lessons = lessons
      .map((entry) => ({
        ...entry,
        points: entry.points.filter((point) => {
          const haystacks = [
            point.title,
            point.meaning,
            point.content,
            ...point.usage,
            ...point.examples,
            ...point.notes,
          ].map((value) => value.toLowerCase());
          return haystacks.some((value) => value.includes(query));
        }),
      }))
      .filter((entry) => entry.points.length > 0)
      .map((entry) => ({
        ...entry,
        pointCount: entry.points.length,
      }));
  }

  return NextResponse.json({
    source: dataset.source,
    importedAt: dataset.importedAt,
    lessonCount: lessons.length,
    lessons,
  });
}
