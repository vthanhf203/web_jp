import Link from "next/link";

import { KanjiStudyClient, type StudyMode as KanjiStudyMode } from "@/app/components/kanji-study-client";
import { VocabStudyClient, type StudyMode as VocabStudyMode } from "@/app/components/vocab-study-client";
import { normalizeJlptLevel } from "@/lib/admin-vocab-library";
import { requireUser } from "@/lib/auth";
import { loadAdminKanjiMetadata } from "@/lib/kanji-metadata";
import { sortKanjiByLearningOrder } from "@/lib/kanji-compound";
import { prisma } from "@/lib/prisma";
import { isUserKanjiId, loadUserKanjiStore } from "@/lib/user-kanji-store";

type SearchParams = Promise<{
  q?: string | string[];
  level?: string | string[];
  ids?: string | string[];
  mode?: string | string[];
  scope?: string | string[];
  related?: string | string[];
}>;

function pickHanvietFromRelatedWords(
  character: string,
  relatedWords: Array<{
    word: string;
    kanji: string;
    hanviet: string;
  }>
): string {
  const exact = relatedWords.find((entry) => {
    const hanviet = entry.hanviet.trim();
    if (!hanviet) {
      return false;
    }
    return entry.kanji === character || entry.word === character;
  });
  if (exact?.hanviet.trim()) {
    return exact.hanviet.trim();
  }
  const fallback = relatedWords.find((entry) => entry.hanviet.trim());
  return fallback?.hanviet.trim() ?? "";
}

function pickSingle(value?: string | string[]): string {
  if (!value) {
    return "";
  }
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value;
}

function shuffleArray<T>(items: T[]): T[] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export default async function KanjiLearnPage(props: { searchParams: SearchParams }) {
  const user = await requireUser();

  const params = await props.searchParams;
  const rawQuery = pickSingle(params.q).trim();
  const query = rawQuery.toLowerCase();
  const levelRaw = pickSingle(params.level).trim();
  const level = levelRaw ? normalizeJlptLevel(levelRaw) : null;
  const modeRaw = pickSingle(params.mode).trim().toLowerCase();
  const mode: KanjiStudyMode = modeRaw === "quiz" ? "quiz" : "flashcard";
  const vocabMode: VocabStudyMode = modeRaw === "quiz" ? "quiz" : "flashcard";
  const scopeRaw = pickSingle(params.scope).trim().toLowerCase();
  const scope: "all" | "personal" = scopeRaw === "personal" ? "personal" : "all";
  const relatedRaw = pickSingle(params.related).trim().toLowerCase();
  const isRelatedVocabMode = relatedRaw === "vocab";
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
  const [queriedKanji, userKanjiStore, kanjiMetadata] = await Promise.all([
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
    loadAdminKanjiMetadata(),
  ]);
  const metadataEntryMap = new Map(kanjiMetadata.entries.map((entry) => [entry.character, entry]));

  const personalKanji = userKanjiStore.items
    .filter((item) => !level || item.jlptLevel === level)
    .map((item) => ({
      id: item.id,
      character: item.character,
      hanviet: item.hanviet,
      meaning: item.meaning,
      onReading: item.onReading,
      kunReading: item.kunReading,
      strokeCount: item.strokeCount,
      jlptLevel: item.jlptLevel,
      exampleWord: item.exampleWord,
      exampleMeaning: item.exampleMeaning,
      relatedWords: item.relatedWords,
    }));
  const dbKanji = queriedKanji.map((item) => ({
    id: item.id,
    character: item.character,
    hanviet: pickHanvietFromRelatedWords(
      item.character,
      metadataEntryMap.get(item.character)?.relatedWords ?? []
    ),
    meaning: item.meaning,
    onReading: item.onReading,
    kunReading: item.kunReading,
    strokeCount: item.strokeCount,
    jlptLevel: normalizeJlptLevel(item.jlptLevel),
    exampleWord: item.exampleWord,
    exampleMeaning: item.exampleMeaning,
    relatedWords: metadataEntryMap.get(item.character)?.relatedWords ?? [],
  }));
  const personalKanjiByCharacter = new Map(
    userKanjiStore.items.map((item) => [item.character, item])
  );
  const sortedDbKanji = sortKanjiByLearningOrder(dbKanji, {
    getOrder: (item) => metadataEntryMap.get(item.character)?.order,
  });
  const sortedPersonalKanji = sortKanjiByLearningOrder(personalKanji, {
    getOrder: (item) => personalKanjiByCharacter.get(item.character)?.order,
  });

  const mergedById = new Map<string, (typeof sortedDbKanji)[number]>();
  for (const item of sortedDbKanji) {
    mergedById.set(item.id, item);
  }
  for (const item of sortedPersonalKanji) {
    mergedById.set(item.id, item);
  }

  const defaultKanjiList = scope === "personal" ? sortedPersonalKanji : sortedDbKanji;
  const orderedKanji = selectedIds.length > 0
    ? selectedIds
        .map((id) => mergedById.get(id))
        .filter((item): item is (typeof defaultKanjiList)[number] => Boolean(item))
    : defaultKanjiList;

  const filteredKanji = query
    ? orderedKanji.filter((kanji) => {
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
    : orderedKanji;

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

  const relatedVocabByKey = new Map<
    string,
    {
      id: string;
      word: string;
      reading: string;
      kanji: string;
      hanviet: string;
      meaning: string;
    }
  >();
  for (const kanji of filteredKanji) {
    for (const word of kanji.relatedWords ?? []) {
      const surface = (word.word || word.kanji || "").trim();
      const kanjiText = (word.kanji || word.word || "").trim();
      const meaning = word.meaning.trim();
      if (!surface || !meaning) {
        continue;
      }
      const reading = word.reading.trim();
      const key = `${surface}|${reading}|${meaning}`.toLowerCase();
      if (relatedVocabByKey.has(key)) {
        continue;
      }
      relatedVocabByKey.set(key, {
        id: `kanji-related:${kanji.id}:${word.id}`,
        word: surface,
        reading,
        kanji: kanjiText || surface,
        hanviet: word.hanviet.trim(),
        meaning,
      });
    }
  }
  const relatedVocabItems = shuffleArray(Array.from(relatedVocabByKey.values()));

  if (isRelatedVocabMode) {
    if (relatedVocabItems.length === 0) {
      return (
        <section className="panel p-8">
          <h1 className="text-2xl font-bold text-slate-800">Chưa có từ vựng liên quan</h1>
          <p className="mt-2 text-slate-600">
            Bộ Kanji hiện tại chưa có mục từ vựng liên quan để tạo flashcard hoặc trắc nghiệm.
          </p>
          <Link href={backHref} className="btn-primary mt-5">
            Quay lại Kanji
          </Link>
        </section>
      );
    }

    const relatedTitleParts = [
      vocabMode === "quiz" ? "Quiz nhanh" : "Flashcard",
      "Từ vựng liên quan Kanji",
      selectedIds.length > 0 ? `${selectedIds.length} Kanji` : `${filteredKanji.length} Kanji`,
      `${relatedVocabItems.length} từ`,
    ];

    return (
      <VocabStudyClient
        lessonTitle={relatedTitleParts.join(" | ")}
        mode={vocabMode}
        items={relatedVocabItems}
        backHref={backHref}
      />
    );
  }

  const titleParts = [
    mode === "quiz" ? "Trắc nghiệm" : "Flashcard",
    scope === "personal" ? "Kanji cá nhân" : level ? `${level} Kanji` : "Kanji",
    selectedIds.length > 0 ? `Bộ đã chọn: ${selectedIds.length} chữ` : "",
    rawQuery ? `Lọc: ${rawQuery}` : `${filteredKanji.length} thẻ`,
  ].filter(Boolean);

  const buildRelatedVocabHref = (nextMode: VocabStudyMode): string => {
    const params = new URLSearchParams();
    if (rawQuery) {
      params.set("q", rawQuery);
    }
    if (level) {
      params.set("level", level);
    }
    if (selectedIds.length > 0) {
      params.set("ids", selectedIds.join(","));
    }
    if (scope === "personal") {
      params.set("scope", "personal");
    }
    if (nextMode === "quiz") {
      params.set("mode", "quiz");
    }
    params.set("related", "vocab");
    return `/kanji/learn?${params.toString()}`;
  };

  return (
    <KanjiStudyClient
      title={titleParts.join(" | ")}
      backHref={backHref}
      mode={mode}
      relatedVocabCount={relatedVocabItems.length}
      relatedVocabFlashcardHref={buildRelatedVocabHref("flashcard")}
      relatedVocabQuizHref={buildRelatedVocabHref("quiz")}
      items={filteredKanji.map((kanji) => ({
        id: kanji.id,
        character: kanji.character,
        hanviet: kanji.hanviet,
        meaning: kanji.meaning,
        onReading: kanji.onReading,
        kunReading: kanji.kunReading,
        strokeCount: kanji.strokeCount,
        exampleWord: kanji.exampleWord,
        exampleMeaning: kanji.exampleMeaning,
        relatedWords: kanji.relatedWords,
        jlptLevel: kanji.jlptLevel,
        isReviewable: !isUserKanjiId(kanji.id),
      }))}
    />
  );
}
