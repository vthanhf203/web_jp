import Link from "next/link";

import { KanjiStudyClient, type StudyMode } from "@/app/components/kanji-study-client";
import { normalizeJlptLevel } from "@/lib/admin-vocab-library";
import { requireUser } from "@/lib/auth";
import { sortKanjiByLearningOrder } from "@/lib/kanji-compound";
import { prisma } from "@/lib/prisma";
import { isUserKanjiId, loadUserKanjiStore } from "@/lib/user-kanji-store";

type SearchParams = Promise<{
  q?: string | string[];
  level?: string | string[];
  ids?: string | string[];
  mode?: string | string[];
  scope?: string | string[];
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
  const user = await requireUser();

  const params = await props.searchParams;
  const rawQuery = pickSingle(params.q).trim();
  const query = rawQuery.toLowerCase();
  const levelRaw = pickSingle(params.level).trim();
  const level = levelRaw ? normalizeJlptLevel(levelRaw) : null;
  const modeRaw = pickSingle(params.mode).trim().toLowerCase();
  const mode: StudyMode = modeRaw === "quiz" ? "quiz" : "flashcard";
  const scopeRaw = pickSingle(params.scope).trim().toLowerCase();
  const scope: "all" | "personal" = scopeRaw === "personal" ? "personal" : "all";
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
  const dbSelectedIds = selectedIds.filter((id) => !isUserKanjiId(id));
  const [queriedKanji, userKanjiStore] = await Promise.all([
    scope === "personal"
      ? dbSelectedIds.length > 0
        ? prisma.kanji.findMany({
            where: {
              ...baseWhere,
              id: {
                in: dbSelectedIds,
              },
            },
          })
        : []
      : selectedIds.length > 0
        ? prisma.kanji.findMany({
            where: {
              ...baseWhere,
              id: {
                in: selectedIds,
              },
            },
          })
        : prisma.kanji.findMany({
            where: baseWhere,
          }),
    loadUserKanjiStore(user.id),
  ]);

  const personalKanji = userKanjiStore.items
    .filter((item) => !level || item.jlptLevel === level)
    .map((item) => ({
      id: item.id,
      character: item.character,
      meaning: item.meaning,
      onReading: item.onReading,
      kunReading: item.kunReading,
      strokeCount: item.strokeCount,
      jlptLevel: item.jlptLevel,
      exampleWord: item.exampleWord,
      exampleMeaning: item.exampleMeaning,
    }));
  const dbKanji = queriedKanji.map((item) => ({
    id: item.id,
    character: item.character,
    meaning: item.meaning,
    onReading: item.onReading,
    kunReading: item.kunReading,
    strokeCount: item.strokeCount,
    jlptLevel: normalizeJlptLevel(item.jlptLevel),
    exampleWord: item.exampleWord,
    exampleMeaning: item.exampleMeaning,
  }));

  const mergedByCharacter = new Map<string, (typeof personalKanji)[number]>();
  if (scope !== "personal") {
    for (const item of dbKanji) {
      mergedByCharacter.set(item.character, item);
    }
  }
  for (const item of personalKanji) {
    mergedByCharacter.set(item.character, item);
  }
  const mergedKanji = Array.from(mergedByCharacter.values());

  const sortedBySelectedIds = selectedIds.length > 0
    ? selectedIds
        .map((id) => mergedKanji.find((item) => item.id === id))
        .filter((item): item is (typeof mergedKanji)[number] => Boolean(item))
    : scope === "personal"
      ? mergedKanji
      : sortKanjiByLearningOrder(mergedKanji);

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
  if (scope === "personal") {
    backQuery.set("scope", "personal");
  }
  if (selectedIds.length > 0) {
    backQuery.set("pick", selectedIds.join(","));
  }
  const backHref = backQuery.toString() ? `/kanji?${backQuery.toString()}` : "/kanji";

  if (filteredKanji.length === 0) {
    return (
      <section className="panel p-8">
        <h1 className="text-2xl font-bold text-slate-800">Chưa có Kanji để học</h1>
        <p className="mt-2 text-slate-600">
          Không tìm thấy dữ liệu phù hợp bộ lọc hiện tại. Hãy quay lại và đổi từ khóa.
        </p>
        <Link href={backHref} className="btn-primary mt-5">
          Quay lại /kanji
        </Link>
      </section>
    );
  }

  const titleParts = [
    mode === "quiz" ? "Trắc nghiệm" : "Flashcard",
    scope === "personal" ? "Kanji cá nhân" : level ? `${level} Kanji` : "Kanji",
    selectedIds.length > 0 ? `Bộ đã chọn: ${selectedIds.length} chữ` : "",
    rawQuery ? `Lọc: ${rawQuery}` : `${filteredKanji.length} thẻ`,
  ].filter(Boolean);

  return (
    <KanjiStudyClient
      title={titleParts.join(" | ")}
      backHref={backHref}
      mode={mode}
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
        isReviewable: !isUserKanjiId(kanji.id),
      }))}
    />
  );
}
