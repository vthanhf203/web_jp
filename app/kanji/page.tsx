
import { KanjiDetail } from "@/app/components/kanji-detail";
import { KanjiDrawSearch } from "@/app/components/kanji-draw-search";
import { KanjiExplorerHeader } from "@/app/components/kanji-explorer-header";
import { KanjiLibraryGrid } from "@/app/components/kanji-library-grid";
import {
  JLPT_LEVELS,
  loadAdminVocabLibrary,
  normalizeJlptLevel,
  type JlptLevel,
} from "@/lib/admin-vocab-library";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { loadUserPersonalState } from "@/lib/user-personal-data";

type SearchParams = Promise<{
  q?: string | string[];
  level?: string | string[];
  pick?: string | string[];
  selected?: string | string[];
}>;

type RelatedWord = {
  id: string;
  word: string;
  reading: string;
  kanji: string;
  hanviet: string;
  meaning: string;
  sourceLabel: string;
  sourceGroupId?: string;
  sourceType: "admin" | "core";
};

function pickSingle(value?: string | string[]): string {
  if (!value) {
    return "";
  }
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value;
}

function parsePickedIds(rawValue: string): string[] {
  if (!rawValue.trim()) {
    return [];
  }
  return Array.from(
    new Set(
      rawValue
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

function serializePickedIds(ids: string[]): string {
  return Array.from(new Set(ids.map((item) => item.trim()).filter(Boolean))).join(",");
}

function togglePickedId(ids: string[], targetId: string): string[] {
  if (ids.includes(targetId)) {
    return ids.filter((id) => id !== targetId);
  }
  return [...ids, targetId];
}

function buildKanjiLearnHref(options: {
  rawQuery?: string;
  level: JlptLevel | null;
  pickedIds?: string[];
}): string {
  const query = (options.rawQuery ?? "").trim();
  const params = new URLSearchParams();
  if (query) {
    params.set("q", query);
  }
  if (options.level) {
    params.set("level", options.level);
  }
  const picked = serializePickedIds(options.pickedIds ?? []);
  if (picked) {
    params.set("ids", picked);
  }
  const queryString = params.toString();
  if (!queryString) {
    return "/kanji/learn";
  }
  return `/kanji/learn?${queryString}`;
}

function buildKanjiPageHref(options: {
  level: JlptLevel | null;
  rawQuery?: string;
  pickedIds?: string[];
  selectedChar?: string;
}): string {
  const query = (options.rawQuery ?? "").trim();
  const params = new URLSearchParams();
  if (options.level) {
    params.set("level", options.level);
  }
  if (query) {
    params.set("q", query);
  }
  const picked = serializePickedIds(options.pickedIds ?? []);
  if (picked) {
    params.set("pick", picked);
  }
  const selectedChar = (options.selectedChar ?? "").trim();
  if (selectedChar) {
    params.set("selected", selectedChar);
  }
  const queryString = params.toString();
  return queryString ? `/kanji?${queryString}` : "/kanji";
}

function chooseSelectedKanji<T extends { character: string; meaning: string }>(
  list: T[],
  rawQuery: string,
  rawSelected: string
): T | null {
  if (list.length === 0) {
    return null;
  }

  const selected = rawSelected.trim();
  if (selected) {
    const exactSelected = list.find((item) => item.character === selected);
    if (exactSelected) {
      return exactSelected;
    }
  }

  const query = rawQuery.trim();
  if (!query) {
    return list[0];
  }

  const exactChar = list.find((item) => item.character === query);
  if (exactChar) {
    return exactChar;
  }

  const exactMeaning = list.find((item) => item.meaning.toLowerCase() === query.toLowerCase());
  if (exactMeaning) {
    return exactMeaning;
  }

  return list[0];
}

function dedupeRelatedWords(items: RelatedWord[]): RelatedWord[] {
  const used = new Set<string>();
  const output: RelatedWord[] = [];

  for (const item of items) {
    const key = `${item.kanji || item.word}|${item.reading}|${item.meaning}|${item.sourceType}`;
    if (used.has(key)) {
      continue;
    }
    used.add(key);
    output.push(item);
  }

  return output;
}

export default async function KanjiPage(props: { searchParams: SearchParams }) {
  const user = await requireUser();
  const params = await props.searchParams;
  const rawQuery = pickSingle(params.q);
  const rawSelected = pickSingle(params.selected);
  const rawLevel = pickSingle(params.level).trim();
  const rawPick = pickSingle(params.pick).trim();
  const pickedIds = parsePickedIds(rawPick);
  const selectedLevel = rawLevel ? normalizeJlptLevel(rawLevel) : null;
  const query = rawQuery.trim().toLowerCase();

  const [kanjiList, reviewList, vocabList, adminLibrary, personalState] = await Promise.all([
    prisma.kanji.findMany({
      orderBy: [{ jlptLevel: "asc" }, { character: "asc" }],
    }),
    prisma.review.findMany({
      where: {
        userId: user.id,
        kanjiId: { not: null },
      },
      select: {
        kanjiId: true,
        dueAt: true,
      },
    }),
    prisma.vocab.findMany({
      orderBy: [{ jlptLevel: "asc" }, { word: "asc" }],
    }),
    loadAdminVocabLibrary(),
    loadUserPersonalState(user.id),
  ]);

  const reviewByKanjiId = new Map(
    reviewList
      .filter((review): review is { kanjiId: string; dueAt: Date } => !!review.kanjiId)
      .map((review) => [review.kanjiId, review.dueAt])
  );
  const countByLevel = JLPT_LEVELS.reduce(
    (acc, level) => {
      acc[level] = kanjiList.filter((kanji) => kanji.jlptLevel === level).length;
      return acc;
    },
    {} as Record<JlptLevel, number>
  );
  const levelFilteredKanji = selectedLevel
    ? kanjiList.filter((kanji) => kanji.jlptLevel === selectedLevel)
    : kanjiList;

  const filteredKanji = query
    ? levelFilteredKanji.filter((kanji) => {
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
    : levelFilteredKanji;
  const filteredIds = new Set(filteredKanji.map((item) => item.id));
  const activePickedIds = pickedIds.filter((id) => filteredIds.has(id));
  const pickedIdSet = new Set(activePickedIds);

  const selectedKanji = chooseSelectedKanji(filteredKanji, rawQuery, rawSelected);
  const selectedDueAt = selectedKanji ? reviewByKanjiId.get(selectedKanji.id) : undefined;
  const bookmarkedKeySet = new Set(
    personalState.bookmarks.map((item) => `${item.type}:${item.refId}`)
  );
  const selectedKanjiBookmarked = selectedKanji
    ? bookmarkedKeySet.has(`kanji:${selectedKanji.character}`)
    : false;
  const selectedKanjiPicked = selectedKanji ? pickedIdSet.has(selectedKanji.id) : false;
  const selectedKanjiToggledPickedIds = selectedKanji
    ? togglePickedId(activePickedIds, selectedKanji.id)
    : activePickedIds;
  const selectedFlashcardKanji = filteredKanji.filter((kanji) => pickedIdSet.has(kanji.id));

  const adminRelatedWords: RelatedWord[] = selectedKanji
    ? dedupeRelatedWords(
        adminLibrary.lessons.flatMap((lesson) =>
          lesson.items
            .filter((item) => {
              const sourceText = `${item.kanji} ${item.word}`;
              return sourceText.includes(selectedKanji.character);
            })
            .map((item) => ({
              id: `${lesson.id}-${item.id}`,
              word: item.word,
              reading: item.reading,
              kanji: item.kanji,
              hanviet: item.hanviet,
              meaning: item.meaning,
              sourceLabel: lesson.title,
              sourceGroupId: lesson.id,
              sourceType: "admin" as const,
            }))
        )
      )
    : [];

  const coreRelatedWords: RelatedWord[] = selectedKanji
    ? dedupeRelatedWords(
        vocabList
          .filter((item) => item.word.includes(selectedKanji.character))
          .map((item) => ({
            id: item.id,
            word: item.word,
            reading: item.reading,
            kanji: item.word,
            hanviet: "",
            meaning: item.meaning,
            sourceLabel: item.jlptLevel,
            sourceType: "core" as const,
          }))
      )
    : [];

  const relatedFlashcardHref =
    adminRelatedWords[0]?.sourceGroupId
      ? `/vocab/learn?group=${encodeURIComponent(adminRelatedWords[0].sourceGroupId)}&mode=flashcard`
      : selectedKanji
        ? buildKanjiLearnHref({
            rawQuery: selectedKanji.character,
            level: selectedLevel,
          })
        : "/vocab";
  const allFilteredFlashcardHref = buildKanjiLearnHref({
    rawQuery,
    level: selectedLevel,
  });
  const pickedFlashcardHref = buildKanjiLearnHref({
    level: selectedLevel,
    pickedIds: activePickedIds,
  });
  const returnToHref = buildKanjiPageHref({
    level: selectedLevel,
    rawQuery,
    pickedIds: activePickedIds,
    selectedChar: selectedKanji?.character,
  });
  const clearPickedHref = buildKanjiPageHref({
    level: selectedLevel,
    rawQuery,
    selectedChar: rawSelected,
  });
  const headerTabs = [
    {
      key: "ALL",
      label: "TAT CA",
      count: kanjiList.length,
      href: buildKanjiPageHref({
        level: null,
        rawQuery,
        pickedIds: activePickedIds,
        selectedChar: rawSelected,
      }),
      active: selectedLevel === null,
    },
    ...JLPT_LEVELS.map((level) => ({
      key: level,
      label: level,
      count: countByLevel[level],
      href: buildKanjiPageHref({
        level,
        rawQuery,
        pickedIds: activePickedIds,
        selectedChar: rawSelected,
      }),
      active: selectedLevel === level,
    })),
  ];
  const pickedPreview =
    selectedFlashcardKanji.length > 0
      ? `Da chon: ${selectedFlashcardKanji
          .slice(0, 12)
          .map((item) => item.character)
          .join(" · ")}${selectedFlashcardKanji.length > 12 ? ` ... (+${selectedFlashcardKanji.length - 12})` : ""}`
      : "";
  const libraryItems = filteredKanji.map((kanji) => ({
    id: kanji.id,
    character: kanji.character,
    meaning: kanji.meaning,
    jlptLevel: kanji.jlptLevel,
    href: buildKanjiPageHref({
      level: selectedLevel,
      rawQuery,
      pickedIds: activePickedIds,
      selectedChar: kanji.character,
    }),
    active: selectedKanji?.id === kanji.id,
    picked: pickedIdSet.has(kanji.id),
  }));

  return (
    <section className="space-y-6">
      <KanjiExplorerHeader
        tabs={headerTabs}
        selectedLabel={selectedLevel ?? "Tat ca"}
        filteredCount={filteredKanji.length}
        roadmapHref={selectedLevel ? `/kanji/roadmap?level=${selectedLevel}` : "/kanji/roadmap"}
        allFlashcardHref={allFilteredFlashcardHref}
        pickedFlashcardHref={pickedFlashcardHref}
        clearPickedHref={activePickedIds.length > 0 ? clearPickedHref : undefined}
        pickedCount={activePickedIds.length}
        pickedPreview={pickedPreview}
      />

      <KanjiDrawSearch
        items={levelFilteredKanji.map((kanji) => ({
          character: kanji.character,
          meaning: kanji.meaning,
          onReading: kanji.onReading,
          kunReading: kanji.kunReading,
          jlptLevel: kanji.jlptLevel,
          strokeCount: kanji.strokeCount,
        }))}
        initialQuery={rawQuery}
        level={selectedLevel ?? undefined}
      />

      {selectedKanji ? (
        <KanjiDetail
          selectedKanji={selectedKanji}
          selectedDueAt={selectedDueAt}
          selectedKanjiBookmarked={selectedKanjiBookmarked}
          selectedKanjiPicked={selectedKanjiPicked}
          togglePickedHref={buildKanjiPageHref({
            level: selectedLevel,
            rawQuery,
            pickedIds: selectedKanjiToggledPickedIds,
            selectedChar: selectedKanji.character,
          })}
          returnToHref={returnToHref}
          selectedFlashcardHref={buildKanjiLearnHref({
            rawQuery: selectedKanji.character,
            level: selectedLevel,
          })}
          relatedFlashcardHref={relatedFlashcardHref}
          adminRelatedWords={adminRelatedWords}
          coreRelatedWords={coreRelatedWords}
        />
      ) : null}

      <div className="relative overflow-hidden rounded-3xl bg-white/80 p-6 shadow-[0_20px_50px_rgba(0,0,0,0.05)] backdrop-blur-md">
        <div className="pointer-events-none absolute -right-10 top-0 h-24 w-24 rounded-full bg-violet-200/25 blur-2xl" />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-3xl font-extrabold text-slate-900">Thu vien Kanji ({filteredKanji.length})</h2>
          <p className="text-sm text-slate-500">Bam vao o de mo chi tiet va tu vung lien quan</p>
        </div>

        {filteredKanji.length === 0 ? (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            Khong tim thay kanji phu hop. Thu tu khoa khac hoac ve lai net.
          </p>
        ) : (
          <div className="mt-4">
            <KanjiLibraryGrid items={libraryItems} />
          </div>
        )}
      </div>
    </section>
  );
}

