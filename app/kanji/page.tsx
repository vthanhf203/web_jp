import Link from "next/link";

import {
  createKanjiPickDeckAction,
  deleteKanjiPickDeckAction,
} from "@/app/actions/kanji-pick-decks";
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
import {
  loadUserKanjiPickDeckStore,
  saveUserKanjiPickDeckStore,
} from "@/lib/user-kanji-pick-decks";
import { isUserKanjiId, loadUserKanjiStore } from "@/lib/user-kanji-store";
import { loadUserPersonalState } from "@/lib/user-personal-data";

type SearchParams = Promise<{
  q?: string | string[];
  level?: string | string[];
  pick?: string | string[];
  pickMode?: string | string[];
  selected?: string | string[];
  page?: string | string[];
  scope?: string | string[];
  deck?: string | string[];
  pickReset?: string | string[];
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

type KanjiListItem = {
  id: string;
  character: string;
  hanviet: string;
  meaning: string;
  onReading: string;
  kunReading: string;
  strokeHint: string;
  strokeImage: string;
  strokeCount: number;
  jlptLevel: JlptLevel;
  exampleWord: string;
  exampleMeaning: string;
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
  mode?: "flashcard" | "quiz";
  scope?: "all" | "personal";
  relatedVocab?: boolean;
}): string {
  const query = (options.rawQuery ?? "").trim();
  const params = new URLSearchParams();
  if (query) {
    params.set("q", query);
  }
  if (options.level) {
    params.set("level", options.level);
  }
  if (options.mode === "quiz") {
    params.set("mode", "quiz");
  }
  const picked = serializePickedIds(options.pickedIds ?? []);
  if (picked) {
    params.set("ids", picked);
  }
  if (options.scope === "personal") {
    params.set("scope", "personal");
  }
  if (options.relatedVocab) {
    params.set("related", "vocab");
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
  scope?: "all" | "personal";
}): string {
  const params = new URLSearchParams();
  params.set("level", options.level);
  params.set("mode", options.mode);
  if (options.source === "related") {
    params.set("source", "related");
  }
  if (options.scope === "personal") {
    params.set("scope", "personal");
  }
  const selectedChar = (options.selectedChar ?? "").trim();
  if (selectedChar) {
    params.set("char", selectedChar);
  }
  return `/kanji/words/learn?${params.toString()}`;
}

function buildKanjiWorksheetHref(options: {
  level: JlptLevel | null;
  rawQuery?: string;
  pickedIds?: string[];
  scope?: "all" | "personal";
}): string {
  const params = new URLSearchParams();
  const query = (options.rawQuery ?? "").trim();
  if (query) {
    params.set("q", query);
  }
  if (options.level) {
    params.set("level", options.level);
  }
  const picked = serializePickedIds(options.pickedIds ?? []);
  if (picked) {
    params.set("pick", picked);
  }
  if (options.scope === "personal") {
    params.set("scope", "personal");
  }
  const queryString = params.toString();
  return queryString ? `/kanji/worksheet?${queryString}` : "/kanji/worksheet";
}

function buildKanjiPageHref(options: {
  level: JlptLevel | null;
  rawQuery?: string;
  pickedIds?: string[];
  selectedChar?: string;
  page?: number;
  pickMode?: boolean;
  scope?: "all" | "personal";
  deckId?: string;
  pickReset?: boolean;
}): string {
  const query = (options.rawQuery ?? "").trim();
  const params = new URLSearchParams();
  if (options.level) {
    params.set("level", options.level);
  }
  if (options.scope === "personal") {
    params.set("scope", "personal");
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
  if (typeof options.page === "number" && Number.isFinite(options.page)) {
    params.set("page", String(Math.max(1, Math.floor(options.page))));
  }
  if (options.pickMode) {
    params.set("pickMode", "1");
  }
  const deckId = (options.deckId ?? "").trim();
  if (deckId) {
    params.set("deck", deckId);
  }
  if (options.pickReset) {
    params.set("pickReset", "1");
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

function extractKanjiCharacters(text: string): string[] {
  return Array.from(
    new Set(Array.from(text).filter((char) => /[\u3400-\u9fff]/u.test(char)))
  );
}

function tokenizeHanviet(text: string): string[] {
  return text
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildKanjiHanvietMapFromAdminVocab(
  items: Array<{ word: string; kanji: string; hanviet: string }>
): Map<string, string> {
  const directMap = new Map<string, string>();
  const positionalMap = new Map<string, string>();

  for (const item of items) {
    const hanviet = item.hanviet.trim();
    if (!hanviet) {
      continue;
    }
    const surface = (item.kanji || item.word).trim();
    if (!surface) {
      continue;
    }

    const kanjiChars = extractKanjiCharacters(surface);
    if (kanjiChars.length === 0) {
      continue;
    }

    const tokens = tokenizeHanviet(hanviet);
    if (tokens.length === 0) {
      continue;
    }

    if (kanjiChars.length === 1) {
      const char = kanjiChars[0];
      const candidate = tokens.length === 1 ? tokens[0] : tokens[tokens.length - 1];
      if (candidate && !directMap.has(char)) {
        directMap.set(char, candidate);
      }
      continue;
    }

    if (tokens.length === kanjiChars.length) {
      for (let index = 0; index < kanjiChars.length; index += 1) {
        const char = kanjiChars[index];
        const token = tokens[index];
        if (token && !positionalMap.has(char)) {
          positionalMap.set(char, token);
        }
      }
    }
  }

  const merged = new Map<string, string>();
  for (const [char, token] of positionalMap.entries()) {
    merged.set(char, token);
  }
  for (const [char, token] of directMap.entries()) {
    merged.set(char, token);
  }
  return merged;
}

function pickHanvietForKanji(
  character: string,
  explicitHanviet: string | undefined,
  relatedWords: Array<{
    word?: string;
    kanji?: string;
    hanviet?: string;
  }>
): string {
  const explicit = explicitHanviet?.trim();
  if (explicit) {
    return explicit;
  }

  const exactMatch = relatedWords.find((item) => {
    const hanviet = (item.hanviet ?? "").trim();
    if (!hanviet) {
      return false;
    }
    return item.kanji === character || item.word === character;
  });
  if (exactMatch) {
    return exactMatch.hanviet?.trim() || "";
  }

  const firstAvailable = relatedWords.find((item) => (item.hanviet ?? "").trim());
  return firstAvailable?.hanviet?.trim() || "";
}

export default async function KanjiPage(props: { searchParams: SearchParams }) {
  const user = await requireUser();
  const params = await props.searchParams;
  const rawQuery = pickSingle(params.q);
  const rawSelected = pickSingle(params.selected);
  const rawLevel = pickSingle(params.level).trim();
  const rawScope = pickSingle(params.scope).trim().toLowerCase();
  const rawPick = pickSingle(params.pick).trim();
  const rawPickMode = pickSingle(params.pickMode).trim();
  const rawPage = pickSingle(params.page).trim();
  const rawDeckId = pickSingle(params.deck).trim();
  const rawPickReset = pickSingle(params.pickReset).trim();
  const scope: "all" | "personal" = rawScope === "personal" ? "personal" : "all";
  const isPersonalScope = scope === "personal";
  const selectedLevel = rawLevel ? normalizeJlptLevel(rawLevel) : null;
  const query = rawQuery.trim().toLowerCase();

  const [
    kanjiRaw,
    reviewList,
    vocabList,
    adminLibrary,
    kanjiMetadata,
    personalState,
    userKanjiStore,
    kanjiPickDeckStore,
  ] =
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
      loadUserKanjiStore(user.id),
      loadUserKanjiPickDeckStore(user.id),
    ]);

  const metadataEntryMap = new Map(
    kanjiMetadata.entries.map((entry) => [entry.character, entry])
  );
  const vocabHanvietMap = buildKanjiHanvietMapFromAdminVocab(
    adminLibrary.lessons.flatMap((lesson) => lesson.items)
  );
  const dbKanjiList: KanjiListItem[] = sortKanjiByLearningOrder(kanjiRaw, {
    getOrder: (item) => metadataEntryMap.get(item.character)?.order,
  }).map((item) => ({
    id: item.id,
    character: item.character,
    hanviet: pickHanvietForKanji(
      item.character,
      vocabHanvietMap.get(item.character),
      metadataEntryMap.get(item.character)?.relatedWords ?? []
    ),
    meaning: item.meaning,
    onReading: item.onReading,
    kunReading: item.kunReading,
    strokeHint: metadataEntryMap.get(item.character)?.strokeHint || "",
    strokeImage: metadataEntryMap.get(item.character)?.strokeImage || "",
    strokeCount: item.strokeCount,
    jlptLevel: normalizeJlptLevel(item.jlptLevel),
    exampleWord: item.exampleWord,
    exampleMeaning: item.exampleMeaning,
  }));
  const personalKanjiByCharacter = new Map(userKanjiStore.items.map((item) => [item.character, item]));
  const personalKanjiList: KanjiListItem[] = sortKanjiByLearningOrder(
    userKanjiStore.items.map((item) => ({
      id: item.id,
      character: item.character,
      hanviet: pickHanvietForKanji(item.character, item.hanviet, item.relatedWords ?? []),
      meaning: item.meaning,
      onReading: item.onReading,
      kunReading: item.kunReading,
      strokeHint: item.strokeHint || metadataEntryMap.get(item.character)?.strokeHint || "",
      strokeImage: item.strokeImage || metadataEntryMap.get(item.character)?.strokeImage || "",
      strokeCount: item.strokeCount,
      jlptLevel: item.jlptLevel,
      exampleWord: item.exampleWord,
      exampleMeaning: item.exampleMeaning,
    })),
    {
      getOrder: (item) => personalKanjiByCharacter.get(item.character)?.order,
    }
  );
  const kanjiList = isPersonalScope ? personalKanjiList : dbKanjiList;
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
          kanji.hanviet,
          kanji.meaning,
          kanji.onReading,
          kanji.kunReading,
          kanji.strokeHint,
          kanji.strokeImage,
          kanji.jlptLevel,
          kanji.exampleWord,
          kanji.exampleMeaning,
        ].map((value) => value.toLowerCase());
        return haystacks.some((value) => value.includes(query));
      })
    : levelFilteredKanji;
  const flashcardScope: "all" | "personal" = isPersonalScope ? "personal" : "all";
  const scopedDecks = kanjiPickDeckStore.decks.filter((deck) => deck.scope === scope);
  const selectedDeck = scopedDecks.find((deck) => deck.id === rawDeckId) ?? null;
  const pickResetRequested = rawPickReset === "1";
  const fallbackPickedIds = selectedDeck
    ? selectedDeck.pickedIds
    : kanjiPickDeckStore.lastPicked[scope] ?? [];
  const pickedIds = pickResetRequested
    ? []
    : rawPick
      ? parsePickedIds(rawPick)
      : fallbackPickedIds;
  const buildScopedKanjiPageHref = (
    options: Omit<Parameters<typeof buildKanjiPageHref>[0], "scope">
  ) => buildKanjiPageHref({ ...options, scope });
  const filteredIds = new Set(filteredKanji.map((item) => item.id));
  const activePickedIds = pickedIds.filter((id) => filteredIds.has(id));
  const pickedIdSet = new Set(activePickedIds);
  const isPickMode = rawPickMode === "1" || activePickedIds.length > 0;
  const shouldPersistLastPicked = pickResetRequested || Boolean(rawPick) || Boolean(selectedDeck);
  const currentPersistedPicked = kanjiPickDeckStore.lastPicked[scope] ?? [];
  const shouldWriteLastPicked =
    shouldPersistLastPicked &&
    serializePickedIds(currentPersistedPicked) !== serializePickedIds(activePickedIds);
  if (shouldWriteLastPicked) {
    await saveUserKanjiPickDeckStore(user.id, {
      ...kanjiPickDeckStore,
      lastPicked: {
        ...kanjiPickDeckStore.lastPicked,
        [scope]: activePickedIds,
      },
    });
  }

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
  const orderedPickedIds = selectedFlashcardKanji.map((kanji) => kanji.id);
  const kanjiMetadataMap = new Map(
    kanjiMetadata.entries.map((entry) => [entry.character, entry.relatedWords])
  );
  const personalRelatedWordsMap = new Map(
    userKanjiStore.items.map((entry) => [entry.character, entry.relatedWords])
  );

  const importedRelatedWords: RelatedWord[] = selectedKanji
    ? dedupeRelatedWords(
        [
          ...(personalRelatedWordsMap.get(selectedKanji.character) ?? []).map((item) => ({
            id: `user-${selectedKanji.character}-${item.id}`,
            word: item.word,
            reading: item.reading,
            kanji: item.kanji,
            hanviet: item.hanviet,
            meaning: item.meaning,
            sourceLabel: item.sourceLabel || "JSON ca nhan",
            sourceType: "admin" as const,
          })),
          ...(kanjiMetadataMap.get(selectedKanji.character) ?? []).map((item) => ({
            id: `meta-${selectedKanji.character}-${item.id}`,
            word: item.word,
            reading: item.reading,
            kanji: item.kanji,
            hanviet: item.hanviet,
            meaning: item.meaning,
            sourceLabel: item.sourceLabel || "Kanji JSON",
            sourceType: "admin" as const,
          })),
        ]
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

  const personalExtraWords = userKanjiStore.items.flatMap((entry) =>
    entry.relatedWords.map((item) => ({
      id: `user-${entry.character}-${item.id}`,
      word: item.word,
      reading: item.reading,
      kanji: item.kanji,
      hanviet: item.hanviet,
      meaning: item.meaning,
      jlptLevel: normalizeJlptLevel(item.jlptLevel || entry.jlptLevel),
      sourceLabel: item.sourceLabel || "JSON ca nhan",
    }))
  );
  const adminExtraWords = kanjiMetadata.entries.flatMap((entry) =>
    entry.relatedWords.map((item) => ({
      id: item.id,
      word: item.word,
      reading: item.reading,
      kanji: item.kanji,
      hanviet: item.hanviet,
      meaning: item.meaning,
      jlptLevel: item.jlptLevel,
      sourceLabel: item.sourceLabel || "Kanji JSON",
    }))
  );

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
    extraWords: [...personalExtraWords, ...adminExtraWords],
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
    scope,
  });
  const compoundQuizHref = buildKanjiWordLearnHref({
    level: compoundLevel,
    mode: "quiz",
    scope,
  });
  const compoundRecallHref = buildKanjiWordLearnHref({
    level: compoundLevel,
    mode: "recall",
    scope,
  });
  const selectedCharCompoundFlashcardHref =
    selectedKanji && selectedCharCompoundWords.length > 0
      ? buildKanjiWordLearnHref({
          level: compoundLevel,
          mode: "flashcard",
          selectedChar: selectedKanji.character,
          scope,
        })
      : undefined;

  const relatedFlashcardHref = selectedKanji
    ? buildKanjiWordLearnHref({
        level: compoundLevel,
        mode: "flashcard",
        selectedChar: selectedKanji.character,
        source: "related",
        scope,
      })
    : selectedCharCompoundFlashcardHref
      ? selectedCharCompoundFlashcardHref
      : buildKanjiWordLearnHref({
          level: compoundLevel,
          mode: "flashcard",
          scope,
        });
  const selectedModeKanjiWordFlashcardHref = selectedKanji
    ? buildKanjiWordLearnHref({
        level: compoundLevel,
        mode: "flashcard",
        selectedChar: selectedKanji.character,
        scope,
      })
    : undefined;
  const allFilteredFlashcardHref = buildKanjiLearnHref({
    rawQuery,
    level: selectedLevel,
    scope: flashcardScope,
  });
  const allFilteredQuizHref = buildKanjiLearnHref({
    rawQuery,
    level: selectedLevel,
    mode: "quiz",
    scope: flashcardScope,
  });
  const worksheetHref = buildKanjiWorksheetHref({
    level: selectedLevel,
    rawQuery,
    pickedIds: orderedPickedIds,
    scope,
  });
  const pickedFlashcardHref = buildKanjiLearnHref({
    level: selectedLevel,
    pickedIds: orderedPickedIds,
    scope: flashcardScope,
  });
  const pickedQuizHref = buildKanjiLearnHref({
    level: selectedLevel,
    pickedIds: orderedPickedIds,
    mode: "quiz",
    scope: flashcardScope,
  });
  const pickedRelatedVocabFlashcardHref = buildKanjiLearnHref({
    level: selectedLevel,
    pickedIds: orderedPickedIds,
    scope: flashcardScope,
    relatedVocab: true,
  });
  const pickedRelatedVocabQuizHref = buildKanjiLearnHref({
    level: selectedLevel,
    pickedIds: orderedPickedIds,
    mode: "quiz",
    scope: flashcardScope,
    relatedVocab: true,
  });
  const selectedIndex = selectedKanji
    ? filteredKanji.findIndex((kanji) => kanji.id === selectedKanji.id)
    : -1;
  const derivedPage = selectedIndex >= 0 ? Math.floor(selectedIndex / KANJI_PAGE_SIZE) + 1 : 1;
  const totalPages = Math.max(1, Math.ceil(filteredKanji.length / KANJI_PAGE_SIZE));
  const currentPage = Math.min(totalPages, rawPage ? parsePage(rawPage) : derivedPage);
  const pageStart = (currentPage - 1) * KANJI_PAGE_SIZE;
  const returnToHref = buildScopedKanjiPageHref({
    level: selectedLevel,
    rawQuery,
    pickedIds: activePickedIds,
    selectedChar: selectedKanji?.character,
    page: currentPage,
    pickMode: isPickMode,
  });
  const clearPickedHref = buildScopedKanjiPageHref({
    level: selectedLevel,
    rawQuery,
    selectedChar: rawSelected,
    page: currentPage,
    pickMode: true,
    pickReset: true,
  });
  const enablePickModeHref = buildScopedKanjiPageHref({
    level: selectedLevel,
    rawQuery,
    pickedIds: activePickedIds,
    selectedChar: rawSelected,
    page: currentPage,
    pickMode: true,
  });
  const disablePickModeHref = buildScopedKanjiPageHref({
    level: selectedLevel,
    rawQuery,
    selectedChar: rawSelected,
    page: currentPage,
  });
  const systemScopeHref = buildKanjiPageHref({
    level: selectedLevel,
    rawQuery,
    selectedChar: rawSelected,
    scope: "all",
    page: 1,
  });
  const personalScopeHref = buildKanjiPageHref({
    level: selectedLevel,
    rawQuery,
    selectedChar: rawSelected,
    scope: "personal",
    page: 1,
  });
  const headerTabs = [
    {
      key: "ALL",
      label: "TAT CA",
      count: kanjiList.length,
      href: buildScopedKanjiPageHref({
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
      href: buildScopedKanjiPageHref({
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
  const pageItems = pageKanji.map((kanji) => {
    const toggledPickedIds = togglePickedId(activePickedIds, kanji.id);
    return {
      id: kanji.id,
      character: kanji.character,
      hanviet: kanji.hanviet,
      meaning: kanji.meaning,
      jlptLevel: kanji.jlptLevel,
      href: `${buildScopedKanjiPageHref({
        level: selectedLevel,
        rawQuery,
        pickedIds: activePickedIds,
        selectedChar: kanji.character,
        page: currentPage,
        pickMode: isPickMode,
      })}#kanji-${kanji.id}`,
      togglePickHref: buildScopedKanjiPageHref({
        level: selectedLevel,
        rawQuery,
        pickedIds: toggledPickedIds,
        selectedChar: rawSelected,
        page: currentPage,
        pickMode: true,
        pickReset: toggledPickedIds.length === 0,
      }),
      active: selectedKanji?.id === kanji.id,
      picked: pickedIdSet.has(kanji.id),
    };
  });
  const pageNumbers = Array.from({ length: totalPages }, (_, index) => index + 1).filter((page) =>
    Math.abs(page - currentPage) <= 2 || page === 1 || page === totalPages
  );
  const pickedIdsCsv = serializePickedIds(orderedPickedIds);
  const kanjiDeckReturnToHref = buildScopedKanjiPageHref({
    level: selectedLevel,
    rawQuery,
    selectedChar: rawSelected,
    page: currentPage,
    pickMode: true,
    deckId: rawDeckId || undefined,
  });
  const buildDeckApplyHref = (deckId: string) =>
    buildScopedKanjiPageHref({
      level: selectedLevel,
      rawQuery,
      selectedChar: rawSelected,
      page: 1,
      pickMode: true,
      deckId,
    });
  const buildDeckFlashcardHref = (deckPickedIds: string[]) =>
    buildKanjiLearnHref({
      level: null,
      pickedIds: deckPickedIds,
      scope: flashcardScope,
    });

  return (
    <section className="space-y-6">
      <KanjiExplorerHeader
        tabs={headerTabs}
        selectedLabel={selectedLevel ?? "Tat ca"}
        filteredCount={filteredKanji.length}
        roadmapHref={selectedLevel ? `/kanji/roadmap?level=${selectedLevel}` : "/kanji/roadmap"}
        worksheetHref={worksheetHref}
        allFlashcardHref={allFilteredFlashcardHref}
        allQuizHref={allFilteredQuizHref}
        pickedFlashcardHref={pickedFlashcardHref}
        pickedQuizHref={pickedQuizHref}
        pickedRelatedVocabFlashcardHref={pickedRelatedVocabFlashcardHref}
        pickedRelatedVocabQuizHref={pickedRelatedVocabQuizHref}
        clearPickedHref={activePickedIds.length > 0 ? clearPickedHref : undefined}
        pickedCount={activePickedIds.length}
        pickedPreview={pickedPreview}
      />

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white/75 p-3">
        <Link
          href={systemScopeHref}
          scroll={false}
          className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition ${
            !isPersonalScope
              ? "bg-sky-600 text-white"
              : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          Kho he thong
        </Link>
        <Link
          href={personalScopeHref}
          scroll={false}
          className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition ${
            isPersonalScope
              ? "bg-emerald-600 text-white"
              : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          Kanji ca nhan ({userKanjiStore.items.length})
        </Link>
          <p className="text-xs text-slate-500">
            {isPersonalScope
              ? "Dang o trang Kanji ca nhan ban da tu import."
              : "Dang hien thi kho Kanji he thong. Chuyen sang tab Kanji ca nhan de hoc du lieu ban tu import."}
          </p>
      </div>

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

      <div className="rounded-3xl border border-slate-200 bg-white/85 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)] backdrop-blur-md sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="inline-flex items-center rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-700">
              Tu hoc chu dong
            </p>
            <h2 className="mt-2 text-xl font-extrabold text-slate-900">
              Tu hoc Kanji + Tu vung o mot noi
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Ban dang co {userKanjiStore.items.length} Kanji ca nhan. Mo trang tu hoc de import/quan ly du lieu gon hon.
            </p>
          </div>
          <Link
            href="/self-study"
            className="rounded-full bg-indigo-600 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white transition hover:bg-indigo-500"
          >
            Mo tu hoc chu dong
          </Link>
        </div>
      </div>

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
                : `${compoundWords.length} tu ghep duoc tao tu JSON ca nhan + kho admin + vocab he thong, chi dung Kanji thuoc cap ${compoundLevel}.`}
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
          togglePickedHref={buildScopedKanjiPageHref({
            level: selectedLevel,
            rawQuery,
            pickedIds: selectedKanjiToggledPickedIds,
            selectedChar: selectedKanji.character,
            page: currentPage,
            pickMode: true,
            pickReset: selectedKanjiToggledPickedIds.length === 0,
          })}
          returnToHref={returnToHref}
          selectedFlashcardHref={buildKanjiLearnHref({
            rawQuery: selectedKanji.character,
            level: selectedLevel,
            scope: isUserKanjiId(selectedKanji.id) ? "personal" : flashcardScope,
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
          <h2 className="text-3xl font-extrabold text-slate-900">
            {isPersonalScope ? "Thu vien Kanji ca nhan" : "Thu vien Kanji"} ({filteredKanji.length})
          </h2>
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
                href={allFilteredQuizHref}
                className="rounded-full bg-sky-600 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-white transition-all duration-300 hover:-translate-y-0.5 hover:bg-sky-500"
              >
                Trac nghiem bo loc
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
                href={pickedQuizHref}
                className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition-all duration-300 ${
                  activePickedIds.length > 0
                    ? "bg-sky-100 text-sky-700 hover:-translate-y-0.5 hover:bg-sky-200"
                    : "pointer-events-none cursor-not-allowed bg-slate-100 text-slate-400"
                }`}
              >
                Quiz da chon ({activePickedIds.length})
              </Link>
              <Link
                href={pickedRelatedVocabFlashcardHref}
                className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition-all duration-300 ${
                  activePickedIds.length > 0
                    ? "bg-orange-100 text-orange-700 hover:-translate-y-0.5 hover:bg-orange-200"
                    : "pointer-events-none cursor-not-allowed bg-slate-100 text-slate-400"
                }`}
              >
                Tu lien quan da chon
              </Link>
              <Link
                href={pickedRelatedVocabQuizHref}
                className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition-all duration-300 ${
                  activePickedIds.length > 0
                    ? "bg-amber-100 text-amber-800 hover:-translate-y-0.5 hover:bg-amber-200"
                    : "pointer-events-none cursor-not-allowed bg-slate-100 text-slate-400"
                }`}
              >
                Quiz tu lien quan
              </Link>
              <Link
                href={disablePickModeHref}
                scroll={false}
                className="rounded-full bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600 shadow-[0_8px_16px_rgba(15,23,42,0.08)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-slate-50"
              >
                Tat che do chon
              </Link>
              <p className="text-xs text-slate-500">
                Bam nut &quot;Flash&quot; tren tung the de tu chon bo Kanji can hoc.
              </p>

              <div className="mt-3 w-full rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
                    BO FLASHCARD DA LUU ({scopedDecks.length})
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Tu nho danh sach da chon gan nhat cho tab {isPersonalScope ? "ca nhan" : "he thong"}.
                  </p>
                </div>

                {activePickedIds.length > 0 ? (
                  <form action={createKanjiPickDeckAction} className="mt-2 flex flex-wrap items-center gap-2">
                    <input
                      name="title"
                      required
                      maxLength={64}
                      placeholder="Ten bo flashcard..."
                      className="min-w-[220px] flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-emerald-300"
                    />
                    <input type="hidden" name="scope" value={scope} />
                    <input type="hidden" name="pickedIds" value={pickedIdsCsv} />
                    <input type="hidden" name="returnTo" value={kanjiDeckReturnToHref} />
                    <button
                      type="submit"
                      className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white transition hover:bg-emerald-500"
                    >
                      Luu bo ({activePickedIds.length})
                    </button>
                  </form>
                ) : (
                  <p className="mt-2 text-xs text-slate-500">
                    Chon it nhat 1 Kanji de luu thanh bo dung lai.
                  </p>
                )}

                {scopedDecks.length > 0 ? (
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {scopedDecks.map((deck) => (
                      <div
                        key={deck.id}
                        className={`rounded-xl border px-3 py-2 ${
                          selectedDeck?.id === deck.id
                            ? "border-emerald-300 bg-emerald-50/80"
                            : "border-slate-200 bg-white"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <Link
                            href={buildDeckApplyHref(deck.id)}
                            scroll={false}
                            className="truncate text-sm font-semibold text-slate-800 hover:text-emerald-700"
                          >
                            {deck.title}
                          </Link>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                            {deck.pickedIds.length} chu
                          </span>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <Link
                            href={buildDeckFlashcardHref(deck.pickedIds)}
                            scroll={false}
                            className="rounded-full bg-sky-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-700 hover:bg-sky-200"
                          >
                            Dung bo
                          </Link>
                          <form action={deleteKanjiPickDeckAction}>
                            <input type="hidden" name="deckId" value={deck.id} />
                            <input type="hidden" name="returnTo" value={kanjiDeckReturnToHref} />
                            <button
                              type="submit"
                              className="rounded-full bg-rose-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-rose-700 hover:bg-rose-200"
                            >
                              Xoa
                            </button>
                          </form>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
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
            {isPersonalScope
              ? "Ban chua co Kanji ca nhan nao phu hop bo loc. Vao Tu hoc chu dong de import JSON Kanji."
              : "Khong tim thay kanji phu hop. Thu tu khoa khac hoac ve lai net."}
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
                      href={buildScopedKanjiPageHref({
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
                      {"<- Truoc"}
                    </Link>
                  ) : null}

                  {pageNumbers.map((page, index) => {
                    const previous = pageNumbers[index - 1];
                    const needsGap = previous && page - previous > 1;
                    return (
                      <div key={page} className="flex items-center gap-2">
                        {needsGap ? <span className="text-xs text-slate-400">...</span> : null}
                        <Link
                          href={buildScopedKanjiPageHref({
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
                      href={buildScopedKanjiPageHref({
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
                      {"Sau ->"}
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
