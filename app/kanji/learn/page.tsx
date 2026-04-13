import Link from "next/link";

import { KanjiStudyClient } from "@/app/components/kanji-study-client";
import { normalizeJlptLevel } from "@/lib/admin-vocab-library";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type SearchParams = Promise<{
  q?: string | string[];
  level?: string | string[];
  ids?: string | string[];
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

export default async function KanjiLearnPage(props: { searchParams: SearchParams }) {
  await requireUser();

  const params = await props.searchParams;
  const rawQuery = pickSingle(params.q).trim();
  const query = rawQuery.toLowerCase();
  const levelRaw = pickSingle(params.level).trim();
  const level = levelRaw ? normalizeJlptLevel(levelRaw) : null;
  const rawIds = pickSingle(params.ids).trim();
  const selectedIds = rawIds
    ? Array.from(
        new Set(
          rawIds
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
        )
      )
    : [];

  const baseWhere = level
    ? {
        jlptLevel: level,
      }
    : {};
  const kanjiList = selectedIds.length > 0
    ? await prisma.kanji.findMany({
        where: {
          ...baseWhere,
          id: {
            in: selectedIds,
          },
        },
      })
    : await prisma.kanji.findMany({
        where: baseWhere,
        orderBy: [{ jlptLevel: "asc" }, { character: "asc" }],
      });

  const sortedBySelectedIds =
    selectedIds.length > 0
      ? [...kanjiList].sort((a, b) => selectedIds.indexOf(a.id) - selectedIds.indexOf(b.id))
      : kanjiList;

  const filteredKanji = query
    ? sortedBySelectedIds.filter((kanji) => {
        const haystacks = [
          kanji.character,
          kanji.meaning,
          kanji.onReading,
          kanji.kunReading,
          kanji.jlptLevel,
          kanji.exampleWord,
          kanji.exampleMeaning,
        ].map((value) => value.toLowerCase());
        return haystacks.some((value) => value.includes(query));
      })
    : sortedBySelectedIds;

  const backQuery = new URLSearchParams();
  if (rawQuery) {
    backQuery.set("q", rawQuery);
  }
  if (level) {
    backQuery.set("level", level);
  }
  if (selectedIds.length > 0) {
    backQuery.set("pick", selectedIds.join(","));
  }
  const backHref = backQuery.toString() ? `/kanji?${backQuery.toString()}` : "/kanji";

  if (filteredKanji.length === 0) {
    return (
      <section className="panel p-8">
        <h1 className="text-2xl font-bold text-slate-800">Chua co Kanji de hoc</h1>
        <p className="mt-2 text-slate-600">
          Khong tim thay du lieu phu hop bo loc hien tai. Hay quay lai va doi tu khoa.
        </p>
        <Link href={backHref} className="btn-primary mt-5">
          Quay lai /kanji
        </Link>
      </section>
    );
  }

  const titleParts = [
    level ? `${level} Kanji` : "Kanji",
    selectedIds.length > 0 ? `Bo da chon: ${selectedIds.length} chu` : "",
    rawQuery ? `Loc: ${rawQuery}` : `${filteredKanji.length} the`,
  ].filter(Boolean);

  return (
    <KanjiStudyClient
      title={titleParts.join(" | ")}
      backHref={backHref}
      items={filteredKanji.map((kanji) => ({
        id: kanji.id,
        character: kanji.character,
        meaning: kanji.meaning,
        onReading: kanji.onReading,
        kunReading: kanji.kunReading,
        strokeCount: kanji.strokeCount,
        exampleWord: kanji.exampleWord,
        exampleMeaning: kanji.exampleMeaning,
        jlptLevel: kanji.jlptLevel,
      }))}
    />
  );
}
