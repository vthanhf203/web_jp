import Link from "next/link";

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
import { buildKanjiCompoundWords, sortKanjiByLearningOrder } from "@/lib/kanji-compound";
import { loadAdminKanjiMetadata } from "@/lib/kanji-metadata";
import { prisma } from "@/lib/prisma";
import { loadUserPersonalState } from "@/lib/user-personal-data";

type SearchParams = Promise<{
  q?: string | string[];
  level?: string | string[];
  pick?: string | string[];
  pickMode?: string | string[];
  selected?: string | string[];
  page?: string | string[];
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

type CompoundMode = "flashcard" | "quiz" | "recall";
type WordLearnSource = "compound" | "related";

const KANJI_PAGE_SIZE = 24;

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

function parsePage(value: string): number {
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }
  return Math.floor(parsed);
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

function buildKanjiWordLearnHref(options: {
  level: JlptLevel;
  mode: CompoundMode;
  selectedChar?: string;
  source?: WordLearnSource;
}): string {
  const params = new URLSearchParams();
  params.set("level", options.level);
  params.set("mode", options.mode);
  if (options.source === "related") {
    params.set("source", "related");
  }
  const selectedChar = (options.selectedChar ?? "").trim();
  if (selectedChar) {
    params.set("char", selectedChar);
  }
  return `/kanji/words/learn?${params.toString()}`;
}

function buildKanjiPageHref(options: {
  level: JlptLevel | null;
  rawQuery?: string;
  pickedIds?: string[];
  selectedChar?: string;
  page?: number;
  pickMode?: boolean;
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
  if ((options.page ?? 1) > 1) {
    params.set("page", String(options.page));
  }
  if (options.pickMode) {
    params.set("pickMode", "1");
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
  const rawPickMode = pickSingle(params.pickMode).trim();
  const rawPage = pickSingle(params.page).trim();
  const pickedIds = parsePickedIds(rawPick);
  const selectedLevel = rawLevel ? normalizeJlptLevel(rawLevel) : null;
  const query = rawQuery.trim().toLowerCase();

  const [kanjiRaw, reviewList, vocabList, adminLibrary, kanjiMetadata, personalState] =
    await Promise.all([
    prisma.kanji.findMany(),
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
    loadAdminKanjiMetadata(),
    loadUserPersonalState(user.id),
  ]);

  const metadataEntryMap = new Map(
    kanjiMetadata.entries.map((entry) => [entry.character, entry])
  );
  const kanjiList = sortKanjiByLearningOrder(kanjiRaw, {
    getOrder: (item) => metadataEntryMap.get(item.character)?.order,
  });
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
  const isPickMode = rawPickMode === "1" || activePickedIds.length > 0;

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
  const kanjiMetadataMap = new Map(
    kanjiMetadata.entries.map((entry) => [entry.character, entry.relatedWords])
  );

  const importedRelatedWords: RelatedWord[] = selectedKanji
    ? dedupeRelatedWords(
        (kanjiMetadataMap.get(selectedKanji.character) ?? []).map((item) => ({
          id: `meta-${selectedKanji.character}-${item.id}`,
          word: item.word,
          reading: item.reading,
          kanji: item.kanji,
          hanviet: item.hanviet,
          meaning: item.meaning,
          sourceLabel: item.sourceLabel || "Kanji JSON",
          sourceType: "admin" as const,
        }))
      )
    : [];

  const adminLibraryRelatedWords: RelatedWord[] = selectedKanji
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

  const adminRelatedWords = adminLibraryRelatedWords;

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

  const compoundLevel = selectedLevel ?? "N5";
  const compoundWords = buildKanjiCompoundWords({
    targetLevel: compoundLevel,
    kanjiList: kanjiList.map((kanji) => ({
      character: kanji.character,
      jlptLevel: kanji.jlptLevel,
    })),
    vocabList: vocabList.map((item) => ({
      id: item.id,
      word: item.word,
      reading: item.reading,
      meaning: item.meaning,
      jlptLevel: item.jlptLevel,
    })),
    adminLibrary,
    extraWords: kanjiMetadata.entries
      .flatMap((entry) => entry.relatedWords)
      .map((item) => ({
        id: item.id,
        word: item.word,
        reading: item.reading,
        kanji: item.kanji,
        hanviet: item.hanviet,
        meaning: item.meaning,
        jlptLevel: item.jlptLevel,
        sourceLabel: item.sourceLabel || "Kanji JSON",
      })),
  });
  const selectedCharCompoundWords = selectedKanji
    ? compoundWords.filter((item) =>
        `${item.kanji} ${item.word}`.includes(selectedKanji.character)
      )
    : [];
  const compoundPreviewSource = selectedKanji ? selectedCharCompoundWords : compoundWords;
  const compoundPreview = compoundPreviewSource.slice(0, 9);
  const compoundFlashcardHref = buildKanjiWordLearnHref({
    level: compoundLevel,
    mode: "flashcard",
  });
  const compoundQuizHref = buildKanjiWordLearnHref({
    level: compoundLevel,
    mode: "quiz",
  });
  const compoundRecallHref = buildKanjiWordLearnHref({
    level: compoundLevel,
    mode: "recall",
  });
  const selectedCharCompoundFlashcardHref =
    selectedKanji && selectedCharCompoundWords.length > 0
      ? buildKanjiWordLearnHref({
          level: compoundLevel,
          mode: "flashcard",
          selectedChar: selectedKanji.character,
        })
      : undefined;

  const relatedFlashcardHref = selectedKanji
    ? buildKanjiWordLearnHref({
        level: compoundLevel,
        mode: "flashcard",
        selectedChar: selectedKanji.character,
        source: "related",
      })
    : selectedCharCompoundFlashcardHref
      ? selectedCharCompoundFlashcardHref
      : buildKanjiWordLearnHref({
          level: compoundLevel,
          mode: "flashcard",
        });
  const selectedModeKanjiWordFlashcardHref = selectedKanji
    ? buildKanjiWordLearnHref({
        level: compoundLevel,
        mode: "flashcard",
        selectedChar: selectedKanji.character,
      })
    : undefined;
  const allFilteredFlashcardHref = buildKanjiLearnHref({
    rawQuery,
    level: selectedLevel,
  });
  const pickedFlashcardHref = buildKanjiLearnHref({
    level: selectedLevel,
    pickedIds: activePickedIds,
  });
  const selectedIndex = selectedKanji
    ? filteredKanji.findIndex((kanji) => kanji.id === selectedKanji.id)
    : -1;
  const derivedPage = selectedIndex >= 0 ? Math.floor(selectedIndex / KANJI_PAGE_SIZE) + 1 : 1;
  const totalPages = Math.max(1, Math.ceil(filteredKanji.length / KANJI_PAGE_SIZE));
  const currentPage = Math.min(totalPages, rawPage ? parsePage(rawPage) : derivedPage);
  const pageStart = (currentPage - 1) * KANJI_PAGE_SIZE;
  const returnToHref = buildKanjiPageHref({
    level: selectedLevel,
    rawQuery,
    pickedIds: activePickedIds,
    selectedChar: selectedKanji?.character,
    page: currentPage,
    pickMode: isPickMode,
  });
  const clearPickedHref = buildKanjiPageHref({
    level: selectedLevel,
    rawQuery,
    selectedChar: rawSelected,
    page: currentPage,
    pickMode: isPickMode,
  });
  const enablePickModeHref = buildKanjiPageHref({
    level: selectedLevel,
    rawQuery,
    pickedIds: activePickedIds,
    selectedChar: rawSelected,
    page: currentPage,
    pickMode: true,
  });
  const disablePickModeHref = buildKanjiPageHref({
    level: selectedLevel,
    rawQuery,
    selectedChar: rawSelected,
    page: currentPage,
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
        page: 1,
        pickMode: isPickMode,
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
        page: 1,
        pickMode: isPickMode,
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
  const pageKanji = filteredKanji.slice(pageStart, pageStart + KANJI_PAGE_SIZE);
  const pageItems = pageKanji.map((kanji) => ({
    id: kanji.id,
    character: kanji.character,
    meaning: kanji.meaning,
    jlptLevel: kanji.jlptLevel,
    href: buildKanjiPageHref({
      level: selectedLevel,
      rawQuery,
      pickedIds: activePickedIds,
      selectedChar: kanji.character,
      page: currentPage,
      pickMode: isPickMode,
    }),
    togglePickHref: buildKanjiPageHref({
      level: selectedLevel,
      rawQuery,
      pickedIds: togglePickedId(activePickedIds, kanji.id),
      selectedChar: rawSelected,
      page: currentPage,
      pickMode: true,
    }),
    active: selectedKanji?.id === kanji.id,
    picked: pickedIdSet.has(kanji.id),
  }));
  const pageNumbers = Array.from({ length: totalPages }, (_, index) => index + 1).filter((page) =>
    Math.abs(page - currentPage) <= 2 || page === 1 || page === totalPages
  );

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

      <div className="relative overflow-hidden rounded-3xl bg-white/85 p-5 shadow-[0_20px_50px_rgba(0,0,0,0.05)] backdrop-blur-md sm:p-6">
        <div className="pointer-events-none absolute -left-12 top-0 h-32 w-32 rounded-full bg-emerald-200/35 blur-3xl" />
        <div className="pointer-events-none absolute -right-14 bottom-0 h-36 w-36 rounded-full bg-cyan-200/30 blur-3xl" />

        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
              Tu ghep Kanji
            </p>
            <h2 className="mt-2 text-2xl font-extrabold text-slate-900">
              {selectedKanji
                ? `Cum tu hoc nhanh cho chu ${selectedKanji.character} (${compoundLevel})`
                : `Cum tu hoc nhanh tu Kanji ${compoundLevel}`}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {selectedKanji
                ? selectedCharCompoundWords.length > 0
                  ? `${selectedCharCompoundWords.length} tu ghep dang lien quan truc tiep den chu "${selectedKanji.character}".`
                  : `Chua tim thay tu ghep nao chua chu "${selectedKanji.character}" trong du lieu hien tai.`
                : `${compoundWords.length} tu ghep duoc tao tu kho admin + vocab he thong, chi dung Kanji thuoc cap ${compoundLevel}.`}
            </p>
            {selectedKanji && selectedCharCompoundWords.length > 0 ? (
              <p className="mt-1 text-xs font-medium text-slate-500">
                Hien dang uu tien preview theo chu da chon de ban hoc nhanh hon.
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={compoundFlashcardHref}
              className="rounded-full bg-sky-600 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-white transition-all duration-300 hover:-translate-y-0.5 hover:bg-sky-500"
            >
              Flashcard
            </Link>
            <Link
              href={compoundQuizHref}
              className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-white transition-all duration-300 hover:-translate-y-0.5 hover:bg-emerald-500"
            >
              Trac nghiem
            </Link>
            <Link
              href={compoundRecallHref}
              className="rounded-full bg-orange-600 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-white transition-all duration-300 hover:-translate-y-0.5 hover:bg-orange-500"
            >
              Nhoi nhet
            </Link>
            {selectedModeKanjiWordFlashcardHref ? (
              <Link
                href={selectedModeKanjiWordFlashcardHref}
                className="rounded-full bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-700 shadow-[0_8px_16px_rgba(15,23,42,0.08)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-slate-50"
              >
                Flashcard chu nay
              </Link>
            ) : null}
          </div>
        </div>

        {compoundPreview.length > 0 ? (
          <div className="relative mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {compoundPreview.map((item) => (
              <article
                key={item.id}
                className="rounded-2xl bg-slate-50/85 px-3 py-2 shadow-[0_10px_20px_rgba(15,23,42,0.05)]"
              >
                <p className="text-lg font-bold text-slate-900">{item.kanji || item.word}</p>
                <p className="text-sm text-slate-600">{item.reading || item.word}</p>
                <p className="text-sm text-slate-700">{item.meaning}</p>
              </article>
            ))}
          </div>
        ) : (
          <p className="relative mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            {selectedKanji
              ? `Chua co tu ghep nao chua chu "${selectedKanji.character}" o cap ${compoundLevel}. Hay bo sung them du lieu tu vung.`
              : `Chua co tu ghep phu hop cap ${compoundLevel}. Hay bo sung them du lieu tu vung.`}
          </p>
        )}
      </div>

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
            page: currentPage,
            pickMode: isPickMode,
          })}
          returnToHref={returnToHref}
          selectedFlashcardHref={buildKanjiLearnHref({
            rawQuery: selectedKanji.character,
            level: selectedLevel,
          })}
          relatedFlashcardHref={relatedFlashcardHref}
          jsonRelatedWords={importedRelatedWords}
          adminRelatedWords={adminRelatedWords}
          coreRelatedWords={coreRelatedWords}
        />
      ) : null}

      <div className="relative overflow-hidden rounded-3xl bg-white/80 p-6 shadow-[0_20px_50px_rgba(0,0,0,0.05)] backdrop-blur-md">
        <div className="pointer-events-none absolute -right-10 top-0 h-24 w-24 rounded-full bg-violet-200/25 blur-2xl" />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-3xl font-extrabold text-slate-900">Thu vien Kanji ({filteredKanji.length})</h2>
          <p className="text-sm text-slate-500">
            Trang {currentPage}/{totalPages} · Moi trang {KANJI_PAGE_SIZE} chu
          </p>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {isPickMode ? (
            <>
              <Link
                href={allFilteredFlashcardHref}
                className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-white transition-all duration-300 hover:-translate-y-0.5 hover:bg-emerald-500"
              >
                Flashcard bo loc
              </Link>
              <Link
                href={pickedFlashcardHref}
                className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition-all duration-300 ${
                  activePickedIds.length > 0
                    ? "bg-emerald-100 text-emerald-700 hover:-translate-y-0.5 hover:bg-emerald-200"
                    : "pointer-events-none cursor-not-allowed bg-slate-100 text-slate-400"
                }`}
              >
                Flashcard da chon ({activePickedIds.length})
              </Link>
              <Link
                href={disablePickModeHref}
                scroll={false}
                className="rounded-full bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600 shadow-[0_8px_16px_rgba(15,23,42,0.08)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-slate-50"
              >
                Tat che do chon
              </Link>
              <p className="text-xs text-slate-500">
                Bam nut "Flash" tren tung the de tu chon bo Kanji can hoc.
              </p>
            </>
          ) : (
            <>
              <Link
                href={enablePickModeHref}
                scroll={false}
                className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-white transition-all duration-300 hover:-translate-y-0.5 hover:bg-emerald-500"
              >
                Chon che do Flashcard
              </Link>
              <p className="text-xs text-slate-500">
                Bat che do nay de chon tung Kanji roi hoc flashcard theo bo ban tu tao.
              </p>
            </>
          )}
        </div>

        {filteredKanji.length === 0 ? (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            Khong tim thay kanji phu hop. Thu tu khoa khac hoac ve lai net.
          </p>
        ) : (
          <>
            <div className="mt-4">
              <KanjiLibraryGrid items={pageItems} selectionEnabled={isPickMode} />
            </div>
            {totalPages > 1 ? (
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50/90 px-4 py-3">
                <p className="text-sm text-slate-500">
                  Dang xem {pageStart + 1}-{Math.min(pageStart + KANJI_PAGE_SIZE, filteredKanji.length)} /{" "}
                  {filteredKanji.length} chu
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {currentPage > 1 ? (
                    <Link
                      href={buildKanjiPageHref({
                        level: selectedLevel,
                        rawQuery,
                        pickedIds: activePickedIds,
                        selectedChar: rawSelected,
                        page: currentPage - 1,
                        pickMode: isPickMode,
                      })}
                      scroll={false}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:-translate-y-0.5 hover:border-sky-200 hover:text-sky-700"
                    >
                      ← Truoc
                    </Link>
                  ) : null}

                  {pageNumbers.map((page, index) => {
                    const previous = pageNumbers[index - 1];
                    const needsGap = previous && page - previous > 1;
                    return (
                      <div key={page} className="flex items-center gap-2">
                        {needsGap ? <span className="text-xs text-slate-400">...</span> : null}
                        <Link
                          href={buildKanjiPageHref({
                            level: selectedLevel,
                            rawQuery,
                            pickedIds: activePickedIds,
                            selectedChar: rawSelected,
                            page,
                            pickMode: isPickMode,
                          })}
                          scroll={false}
                          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                            page === currentPage
                              ? "bg-sky-600 text-white shadow-[0_10px_18px_rgba(2,132,199,0.25)]"
                              : "border border-slate-200 bg-white text-slate-600 hover:-translate-y-0.5 hover:border-sky-200 hover:text-sky-700"
                          }`}
                        >
                          {page}
                        </Link>
                      </div>
                    );
                  })}

                  {currentPage < totalPages ? (
                    <Link
                      href={buildKanjiPageHref({
                        level: selectedLevel,
                        rawQuery,
                        pickedIds: activePickedIds,
                        selectedChar: rawSelected,
                        page: currentPage + 1,
                        pickMode: isPickMode,
                      })}
                      scroll={false}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:-translate-y-0.5 hover:border-sky-200 hover:text-sky-700"
                    >
                      Sau →
                    </Link>
                  ) : null}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
