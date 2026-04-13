import { NextResponse } from "next/server";

import { loadAdminVocabLibrary } from "@/lib/admin-vocab-library";

function normalize(value: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const level = normalize(url.searchParams.get("level"));
  const query = normalize(url.searchParams.get("q"));

  const library = await loadAdminVocabLibrary();
  let lessons = [...library.lessons];

  if (level) {
    lessons = lessons.filter((lesson) => lesson.jlptLevel.toLowerCase() === level);
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

  return NextResponse.json({
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
  });
}
