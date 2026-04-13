import { NextResponse } from "next/server";

import { normalizeJlptLevel } from "@/lib/admin-vocab-library";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const levelRaw = url.searchParams.get("level");
  const level = levelRaw ? normalizeJlptLevel(levelRaw) : null;
  const query = (url.searchParams.get("q") ?? "").trim().toLowerCase();

  const kanji = await prisma.kanji.findMany({
    where: {
      ...(level
        ? {
            jlptLevel: level,
          }
        : {}),
    },
    orderBy: [{ jlptLevel: "asc" }, { character: "asc" }],
  });

  const filtered = query
    ? kanji.filter((item) => {
        const haystacks = [
          item.character,
          item.meaning,
          item.onReading,
          item.kunReading,
          item.exampleWord,
          item.exampleMeaning,
        ].map((value) => value.toLowerCase());
        return haystacks.some((value) => value.includes(query));
      })
    : kanji;

  return NextResponse.json({
    level: level ?? "ALL",
    count: filtered.length,
    items: filtered,
  });
}
