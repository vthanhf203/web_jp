import "server-only";

import type { Kanji, Vocab } from "@prisma/client";

import type { AdminVocabLibrary, JlptLevel } from "@/lib/admin-vocab-library";

export type KanjiCompoundWord = {
  id: string;
  word: string;
  reading: string;
  kanji: string;
  hanviet: string;
  meaning: string;
  sourceLabel: string;
  sourceType: "admin" | "core";
  jlptLevel: JlptLevel;
};

function sourcePriority(item: KanjiCompoundWord): number {
  const sourceLabel = item.sourceLabel.toLowerCase();
  if (sourceLabel.includes("kanji json")) {
    return 0;
  }
  if (item.sourceType === "admin") {
    return 1;
  }
  return 2;
}

const LEVEL_ORDER: Record<string, number> = {
  N5: 0,
  N4: 1,
  N3: 2,
  N2: 3,
  N1: 4,
};

function levelRank(level: string): number {
  const rank = LEVEL_ORDER[level.toUpperCase()];
  return Number.isFinite(rank) ? rank : 99;
}

function isKanjiChar(char: string): boolean {
  return /[\u4e00-\u9fff]/.test(char);
}

export function extractKanjiChars(value: string): string[] {
  if (!value.trim()) {
    return [];
  }
  return Array.from(new Set(Array.from(value).filter((char) => isKanjiChar(char))));
}

function canUseWordForLevel(kanjiText: string, levelKanjiSet: Set<string>): boolean {
  const chars = extractKanjiChars(kanjiText);
  if (chars.length === 0) {
    return false;
  }
  return chars.every((char) => levelKanjiSet.has(char));
}

export function sortKanjiByLearningOrder<T extends { jlptLevel: string; strokeCount: number; character: string }>(
  items: T[],
  options?: {
    getOrder?: (item: T) => number | null | undefined;
  }
): T[] {
  return [...items].sort((a, b) => {
    const levelDiff = levelRank(a.jlptLevel) - levelRank(b.jlptLevel);
    if (levelDiff !== 0) {
      return levelDiff;
    }
    const orderA = options?.getOrder?.(a);
    const orderB = options?.getOrder?.(b);
    const hasOrderA = Number.isFinite(orderA);
    const hasOrderB = Number.isFinite(orderB);
    if (hasOrderA && hasOrderB) {
      const orderDiff = Number(orderA) - Number(orderB);
      if (orderDiff !== 0) {
        return orderDiff;
      }
    } else if (hasOrderA !== hasOrderB) {
      return hasOrderA ? -1 : 1;
    }
    const strokeDiff = a.strokeCount - b.strokeCount;
    if (strokeDiff !== 0) {
      return strokeDiff;
    }
    return a.character.localeCompare(b.character, "ja");
  });
}

export function buildKanjiCompoundWords(options: {
  targetLevel: JlptLevel;
  kanjiList: Pick<Kanji, "character" | "jlptLevel">[];
  vocabList: Pick<Vocab, "id" | "word" | "reading" | "meaning" | "jlptLevel">[];
  adminLibrary: AdminVocabLibrary;
  extraWords?: Array<{
    id: string;
    word: string;
    reading: string;
    kanji: string;
    hanviet: string;
    meaning: string;
    jlptLevel: JlptLevel;
    sourceLabel: string;
  }>;
}): KanjiCompoundWord[] {
  const levelKanjiSet = new Set(
    options.kanjiList
      .filter((kanji) => kanji.jlptLevel === options.targetLevel)
      .map((kanji) => kanji.character)
  );

  if (levelKanjiSet.size === 0) {
    return [];
  }

  const merged: KanjiCompoundWord[] = [];

  for (const lesson of options.adminLibrary.lessons) {
    if (lesson.jlptLevel !== options.targetLevel) {
      continue;
    }
    for (const item of lesson.items) {
      const displayKanji = (item.kanji || item.word || "").trim();
      if (!displayKanji) {
        continue;
      }
      if (!canUseWordForLevel(displayKanji, levelKanjiSet)) {
        continue;
      }
      merged.push({
        id: `admin-${lesson.id}-${item.id}`,
        word: item.word,
        reading: item.reading,
        kanji: displayKanji,
        hanviet: item.hanviet,
        meaning: item.meaning,
        sourceLabel: lesson.title,
        sourceType: "admin",
        jlptLevel: options.targetLevel,
      });
    }
  }

  for (const item of options.vocabList) {
    if ((item.jlptLevel || "").toUpperCase() !== options.targetLevel) {
      continue;
    }
    const displayKanji = (item.word || "").trim();
    if (!displayKanji) {
      continue;
    }
    if (!canUseWordForLevel(displayKanji, levelKanjiSet)) {
      continue;
    }
    merged.push({
      id: `core-${item.id}`,
      word: item.word,
      reading: item.reading,
      kanji: displayKanji,
      hanviet: "",
      meaning: item.meaning,
      sourceLabel: "CSDL he thong",
      sourceType: "core",
      jlptLevel: options.targetLevel,
    });
  }

  for (const item of options.extraWords ?? []) {
    if (item.jlptLevel !== options.targetLevel) {
      continue;
    }
    const displayKanji = (item.kanji || item.word || "").trim();
    if (!displayKanji) {
      continue;
    }
    if (!canUseWordForLevel(displayKanji, levelKanjiSet)) {
      continue;
    }
    merged.push({
      id: `meta-${item.id}`,
      word: item.word,
      reading: item.reading,
      kanji: displayKanji,
      hanviet: item.hanviet,
      meaning: item.meaning,
      sourceLabel: item.sourceLabel || "Kanji JSON",
      sourceType: "admin",
      jlptLevel: item.jlptLevel,
    });
  }

  const used = new Set<string>();
  const unique = merged.filter((item) => {
    const key = `${item.kanji}|${item.reading}|${item.meaning}`;
    if (used.has(key)) {
      return false;
    }
    used.add(key);
    return true;
  });

  return unique.sort((a, b) => {
    const sourceDiff = sourcePriority(a) - sourcePriority(b);
    if (sourceDiff !== 0) {
      return sourceDiff;
    }
    const lenDiff = extractKanjiChars(b.kanji).length - extractKanjiChars(a.kanji).length;
    if (lenDiff !== 0) {
      return lenDiff;
    }
    return a.kanji.localeCompare(b.kanji, "ja");
  });
}
