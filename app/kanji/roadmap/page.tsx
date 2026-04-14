import Link from "next/link";

import { KanjiRoadmapClient } from "@/app/components/kanji-roadmap-client";
import { normalizeJlptLevel } from "@/lib/admin-vocab-library";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type SearchParams = Promise<{
  level?: string | string[];
}>;

function pickSingle(value?: string | string[]): string {
  if (!value) {
    return "";
  }
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value;
}

export default async function KanjiRoadmapPage(props: { searchParams: SearchParams }) {
  await requireUser();
  const params = await props.searchParams;
  const selectedLevel = normalizeJlptLevel(pickSingle(params.level));

  const kanjiList = await prisma.kanji.findMany({
    orderBy: [{ jlptLevel: "asc" }, { character: "asc" }],
    select: {
      id: true,
      character: true,
      meaning: true,
      onReading: true,
      kunReading: true,
      strokeCount: true,
      jlptLevel: true,
      exampleWord: true,
      exampleMeaning: true,
    },
  });

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Link href="/kanji" className="btn-premium text-sm">
          <span aria-hidden="true">←</span> Quay lai Kanji
        </Link>
        <Link href={`/kanji/roadmap?level=${selectedLevel}`} className="chip chip-glow">
          Level mac dinh: {selectedLevel}
        </Link>
      </div>

      <KanjiRoadmapClient items={kanjiList} initialLevel={selectedLevel} dailyTarget={10} />
    </section>
  );
}
