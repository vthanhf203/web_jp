import "server-only";

import { normalizeJlptLevel, type JlptLevel } from "@/lib/admin-vocab-library";
import { loadAdminVocabLibrary } from "@/lib/admin-vocab-library";
import { sortKanjiByLearningOrder } from "@/lib/kanji-compound";
import {
  loadAdminKanjiMetadata,
  type KanjiComponent,
  type KanjiLinkedWord,
  type KanjiMetadataEntry,
  type KanjiRadical,
  type KanjiStructure,
} from "@/lib/kanji-metadata";
import type {
  HandwritingComponent,
  HandwritingRadical,
  HandwritingRelatedWord,
  HandwritingSource,
  HandwritingStructure,
  KanjiHandwritingItem,
} from "@/lib/kanji-handwriting-types";
import { prisma } from "@/lib/prisma";
import { loadUserKanjiStore, type UserKanjiItem, type UserKanjiLinkedWord } from "@/lib/user-kanji-store";
import { loadUserVocabStore } from "@/lib/vocab-store";

type RelatedWordLike = {
  id?: string;
  word?: string;
  reading?: string;
  kanji?: string;
  hanviet?: string;
  meaning?: string;
  type?: string;
  jlptLevel?: unknown;
  exampleSentence?: string;
  exampleMeaning?: string;
  sourceLabel?: string;
  partOfSpeech?: string;
  note?: string;
};

type DraftItem = Omit<KanjiHandwritingItem, "source" | "sourceLabel" | "deckNames"> & {
  order: number | null;
  hasCore: boolean;
  personalDecks: Set<string>;
};

const MAX_RELATED_WORDS_PER_KANJI = 36;
const LEVEL_RANK: Record<string, number> = {
  N5: 0,
  N4: 1,
  N3: 2,
  N2: 3,
  N1: 4,
};

function isKanjiChar(char: string): boolean {
  return /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(char);
}

export function extractHandwritingKanjiChars(value: string): string[] {
  return Array.from(new Set(Array.from(value).filter((char) => isKanjiChar(char))));
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function normalizeComparableText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function buildHandwritingId(character: string): string {
  const encoded = Array.from(character)
    .map((char) => char.codePointAt(0)?.toString(16) ?? "")
    .filter(Boolean)
    .join("-");
  return `kanji:${encoded || character}`;
}

function mergeText(current: string, next: string): string {
  const cleanCurrent = normalizeText(current);
  const cleanNext = normalizeText(next);
  if (!cleanCurrent) {
    return cleanNext;
  }
  if (!cleanNext) {
    return cleanCurrent;
  }

  const currentKey = normalizeComparableText(cleanCurrent);
  const nextKey = normalizeComparableText(cleanNext);
  if (currentKey === nextKey || currentKey.includes(nextKey)) {
    return cleanCurrent;
  }
  if (nextKey.includes(currentKey)) {
    return cleanNext;
  }
  return `${cleanCurrent}; ${cleanNext}`;
}

function pickEarlierLevel(current: JlptLevel, next: JlptLevel): JlptLevel {
  return (LEVEL_RANK[next] ?? 99) < (LEVEL_RANK[current] ?? 99) ? next : current;
}

function cloneRadical(radical: KanjiRadical | HandwritingRadical | null | undefined): HandwritingRadical | null {
  return radical
    ? {
        symbol: radical.symbol,
        name: radical.name,
        meaning: radical.meaning,
        position: radical.position,
        note: radical.note,
      }
    : null;
}

function cloneComponents(components: Array<KanjiComponent | HandwritingComponent> | undefined): HandwritingComponent[] {
  return (components ?? []).map((component) => ({
    symbol: component.symbol,
    name: component.name,
    meaning: component.meaning,
    position: component.position,
    role: component.role,
  }));
}

function cloneStructure(
  structure: KanjiStructure | HandwritingStructure | null | undefined
): HandwritingStructure | null {
  return structure
    ? {
        type: structure.type,
        formula: structure.formula,
        meaning: structure.meaning,
        note: structure.note,
      }
    : null;
}

function dedupeStringList(values: string[]): string[] {
  return Array.from(new Set(values.map((item) => item.trim()).filter(Boolean)));
}

function toRelatedWord(
  word: RelatedWordLike,
  fallbackId: string,
  fallbackLevel: JlptLevel,
  fallbackSourceLabel: string
): HandwritingRelatedWord | null {
  const surface = normalizeText(word.word || word.kanji);
  const meaning = normalizeText(word.meaning);
  if (!surface || !meaning) {
    return null;
  }

  return {
    id: normalizeText(word.id) || fallbackId,
    word: surface,
    reading: normalizeText(word.reading),
    kanji: normalizeText(word.kanji) || surface,
    hanviet: normalizeText(word.hanviet),
    meaning,
    type: normalizeText(word.type || word.partOfSpeech),
    jlptLevel: normalizeJlptLevel(word.jlptLevel || fallbackLevel),
    exampleSentence: normalizeText(word.exampleSentence),
    exampleMeaning: normalizeText(word.exampleMeaning),
    sourceLabel: normalizeText(word.sourceLabel) || fallbackSourceLabel,
  };
}

function relatedKey(word: HandwritingRelatedWord): string {
  return [
    normalizeComparableText(word.word || word.kanji),
    normalizeComparableText(word.reading),
    normalizeComparableText(word.meaning),
  ].join("|");
}

function dedupeRelatedWords(words: HandwritingRelatedWord[]): HandwritingRelatedWord[] {
  const unique = new Map<string, HandwritingRelatedWord>();
  for (const word of words) {
    const key = relatedKey(word);
    if (!unique.has(key)) {
      unique.set(key, word);
    }
  }
  return Array.from(unique.values()).sort((a, b) => {
    const levelDelta = (LEVEL_RANK[a.jlptLevel] ?? 99) - (LEVEL_RANK[b.jlptLevel] ?? 99);
    if (levelDelta !== 0) {
      return levelDelta;
    }
    return (a.word || a.kanji).localeCompare(b.word || b.kanji, "ja");
  });
}

function addRelatedForCharacter(
  target: Map<string, HandwritingRelatedWord[]>,
  character: string,
  word: HandwritingRelatedWord | null
) {
  if (!word) {
    return;
  }
  const list = target.get(character) ?? [];
  list.push(word);
  target.set(character, list);
}

function addRelatedBySurface(
  target: Map<string, HandwritingRelatedWord[]>,
  surface: string,
  word: HandwritingRelatedWord | null
) {
  if (!word) {
    return;
  }
  const characters = extractHandwritingKanjiChars(surface);
  for (const character of characters) {
    addRelatedForCharacter(target, character, word);
  }
}

function buildExampleRelatedWord(options: {
  character: string;
  exampleWord: string;
  exampleMeaning: string;
  jlptLevel: JlptLevel;
  sourceLabel: string;
}): HandwritingRelatedWord | null {
  const word = normalizeText(options.exampleWord);
  const meaning = normalizeText(options.exampleMeaning);
  if (!word || !meaning) {
    return null;
  }

  return {
    id: `example:${options.character}:${word}`,
    word,
    reading: "",
    kanji: extractHandwritingKanjiChars(word).length > 0 ? word : "",
    hanviet: "",
    meaning,
    type: "",
    jlptLevel: options.jlptLevel,
    exampleSentence: "",
    exampleMeaning: "",
    sourceLabel: options.sourceLabel,
  };
}

function upsertDraft(
  target: Map<string, DraftItem>,
  source: {
    character: string;
    meaning: string;
    hanviet: string;
    onReading: string;
    kunReading: string;
    strokeCount: number;
    jlptLevel: JlptLevel;
    strokeHint: string;
    radical: HandwritingRadical | null;
    radicalHint: string;
    mnemonic: string;
    components: HandwritingComponent[];
    structure: HandwritingStructure | null;
    tags: string[];
    order: number | null;
    sourceType: "core" | "personal";
    deckName?: string;
  }
) {
  const characters = extractHandwritingKanjiChars(source.character);
  for (const character of characters) {
    const meaning = characters.length === 1
      ? source.meaning
      : mergeText(source.meaning, source.character);
    const existing = target.get(character);

    if (!existing) {
      target.set(character, {
        id: buildHandwritingId(character),
        character,
        meaning,
        hanviet: source.hanviet,
        onReading: source.onReading,
        kunReading: source.kunReading,
        strokeCount: Math.max(1, source.strokeCount || 1),
        jlptLevel: source.jlptLevel,
        strokeHint: source.strokeHint,
        radical: cloneRadical(source.radical),
        radicalHint: source.radicalHint,
        mnemonic: source.mnemonic,
        components: cloneComponents(source.components),
        structure: cloneStructure(source.structure),
        tags: [...source.tags],
        relatedWords: [],
        order: source.order,
        hasCore: source.sourceType === "core",
        personalDecks:
          source.sourceType === "personal" && source.deckName
            ? new Set([source.deckName])
            : new Set<string>(),
      });
      continue;
    }

    existing.meaning = mergeText(existing.meaning, meaning);
    existing.hanviet = mergeText(existing.hanviet, source.hanviet);
    existing.onReading = mergeText(existing.onReading, source.onReading);
    existing.kunReading = mergeText(existing.kunReading, source.kunReading);
    existing.strokeHint = mergeText(existing.strokeHint, source.strokeHint);
    existing.radicalHint = mergeText(existing.radicalHint, source.radicalHint);
    existing.mnemonic = mergeText(existing.mnemonic, source.mnemonic);
    existing.tags = dedupeStringList([...existing.tags, ...source.tags]);
    existing.jlptLevel = pickEarlierLevel(existing.jlptLevel, source.jlptLevel);
    if (source.sourceType === "core") {
      existing.hasCore = true;
      existing.strokeCount = Math.max(1, source.strokeCount || existing.strokeCount);
    }
    if (source.sourceType === "personal" && source.deckName) {
      existing.personalDecks.add(source.deckName);
    }
    if (!existing.radical && source.radical) {
      existing.radical = cloneRadical(source.radical);
    }
    if (existing.components.length === 0 && source.components.length > 0) {
      existing.components = cloneComponents(source.components);
    }
    if (!existing.structure && source.structure) {
      existing.structure = cloneStructure(source.structure);
    }
    if (Number.isFinite(source.order)) {
      existing.order = Number.isFinite(existing.order)
        ? Math.min(Number(existing.order), Number(source.order))
        : Number(source.order);
    }
  }
}

function getSource(draft: DraftItem): HandwritingSource {
  if (draft.hasCore && draft.personalDecks.size > 0) {
    return "mixed";
  }
  return draft.personalDecks.size > 0 ? "personal" : "core";
}

function getSourceLabel(draft: DraftItem): string {
  const decks = Array.from(draft.personalDecks).filter(Boolean);
  if (draft.hasCore && decks.length > 0) {
    return decks.length === 1 ? `Cá nhân + hệ thống: ${decks[0]}` : `Cá nhân ${decks.length} mục + hệ thống`;
  }
  if (decks.length > 0) {
    return decks.length === 1 ? `Cá nhân: ${decks[0]}` : `Cá nhân ${decks.length} mục`;
  }
  return "Hệ thống";
}

function addPersonalRelatedWords(
  relatedByCharacter: Map<string, HandwritingRelatedWord[]>,
  item: UserKanjiItem
) {
  const characters = extractHandwritingKanjiChars(item.character);
  for (const character of characters) {
    for (const [index, word] of item.relatedWords.entries()) {
      addRelatedForCharacter(
        relatedByCharacter,
        character,
        toRelatedWord(word, `personal:${item.id}:${index}`, item.jlptLevel, "Từ cá nhân")
      );
    }
    addRelatedForCharacter(
      relatedByCharacter,
      character,
      buildExampleRelatedWord({
        character,
        exampleWord: item.exampleWord,
        exampleMeaning: item.exampleMeaning,
        jlptLevel: item.jlptLevel,
        sourceLabel: "Ví dụ cá nhân",
      })
    );
  }
}

function addMetadataRelatedWords(
  relatedByCharacter: Map<string, HandwritingRelatedWord[]>,
  entry: KanjiMetadataEntry,
  fallbackLevel: JlptLevel
) {
  for (const [index, word] of entry.relatedWords.entries()) {
    addRelatedForCharacter(
      relatedByCharacter,
      entry.character,
      toRelatedWord(word, `metadata:${entry.character}:${index}`, fallbackLevel, "Kanji JSON")
    );
  }
}

export async function loadKanjiHandwritingItems(userId: string): Promise<KanjiHandwritingItem[]> {
  const [dbKanji, dbVocab, adminVocabLibrary, kanjiMetadata, userKanjiStore, userVocabStore] = await Promise.all([
    prisma.kanji.findMany({
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
    }),
    prisma.vocab.findMany({
      select: {
        id: true,
        word: true,
        reading: true,
        meaning: true,
        jlptLevel: true,
        partOfSpeech: true,
        exampleSentence: true,
        exampleMeaning: true,
      },
    }),
    loadAdminVocabLibrary(),
    loadAdminKanjiMetadata(),
    loadUserKanjiStore(userId),
    loadUserVocabStore(userId),
  ]);

  const metadataMap = new Map(kanjiMetadata.entries.map((entry) => [entry.character, entry]));
  const drafts = new Map<string, DraftItem>();
  const relatedByCharacter = new Map<string, HandwritingRelatedWord[]>();

  for (const item of dbKanji) {
    const jlptLevel = normalizeJlptLevel(item.jlptLevel);
    const metadata = metadataMap.get(item.character);
    upsertDraft(drafts, {
      character: item.character,
      meaning: item.meaning,
      hanviet: "",
      onReading: item.onReading,
      kunReading: item.kunReading,
      strokeCount: item.strokeCount,
      jlptLevel,
      strokeHint: metadata?.strokeHint ?? "",
      radical: cloneRadical(metadata?.radical),
      radicalHint: metadata?.radicalHint ?? "",
      mnemonic: metadata?.mnemonic ?? "",
      components: cloneComponents(metadata?.components),
      structure: cloneStructure(metadata?.structure),
      tags: metadata?.tags ?? [],
      order: metadata?.order ?? null,
      sourceType: "core",
    });
    if (metadata) {
      addMetadataRelatedWords(relatedByCharacter, metadata, jlptLevel);
    }
    addRelatedForCharacter(
      relatedByCharacter,
      item.character,
      buildExampleRelatedWord({
        character: item.character,
        exampleWord: item.exampleWord,
        exampleMeaning: item.exampleMeaning,
        jlptLevel,
        sourceLabel: "Ví dụ hệ thống",
      })
    );
  }

  for (const item of userKanjiStore.items) {
    upsertDraft(drafts, {
      character: item.character,
      meaning: item.meaning,
      hanviet: item.hanviet,
      onReading: item.onReading,
      kunReading: item.kunReading,
      strokeCount: item.strokeCount,
      jlptLevel: item.jlptLevel,
      strokeHint: item.strokeHint,
      radical: null,
      radicalHint: "",
      mnemonic: "",
      components: [],
      structure: null,
      tags: item.tags,
      order: item.order,
      sourceType: "personal",
      deckName: item.deckName,
    });
    addPersonalRelatedWords(relatedByCharacter, item);
  }

  for (const vocab of dbVocab) {
    const related = toRelatedWord(
      {
        id: `vocab:${vocab.id}`,
        word: vocab.word,
        kanji: vocab.word,
        reading: vocab.reading,
        meaning: vocab.meaning,
        type: vocab.partOfSpeech,
        jlptLevel: normalizeJlptLevel(vocab.jlptLevel),
        exampleSentence: vocab.exampleSentence,
        exampleMeaning: vocab.exampleMeaning,
        sourceLabel: "Từ vựng hệ thống",
      },
      `vocab:${vocab.id}`,
      normalizeJlptLevel(vocab.jlptLevel),
      "Từ vựng hệ thống"
    );
    addRelatedBySurface(relatedByCharacter, vocab.word, related);
  }

  for (const lesson of adminVocabLibrary.lessons) {
    for (const item of lesson.items) {
      const surface = item.kanji || item.word;
      const related = toRelatedWord(
        {
          id: `admin-vocab:${lesson.id}:${item.id}`,
          word: item.word,
          kanji: surface,
          reading: item.reading,
          hanviet: item.hanviet,
          meaning: item.meaning,
          type: item.partOfSpeech,
          jlptLevel: lesson.jlptLevel,
          sourceLabel: lesson.title,
        },
        `admin-vocab:${lesson.id}:${item.id}`,
        lesson.jlptLevel,
        lesson.title
      );
      addRelatedBySurface(relatedByCharacter, surface, related);
    }
  }

  for (const lesson of userVocabStore.lessons) {
    for (const item of lesson.items) {
      const surface = item.kanji || item.word;
      const related = toRelatedWord(
        {
          id: `user-vocab:${lesson.id}:${item.id}`,
          word: item.word,
          kanji: surface,
          reading: item.reading,
          hanviet: item.hanviet,
          meaning: item.meaning,
          type: item.partOfSpeech,
          sourceLabel: `Từ cá nhân: ${lesson.title}`,
        },
        `user-vocab:${lesson.id}:${item.id}`,
        "N5",
        `Từ cá nhân: ${lesson.title}`
      );
      addRelatedBySurface(relatedByCharacter, surface, related);
    }
  }

  const items = Array.from(drafts.values()).map((draft) => {
    const relatedWords = dedupeRelatedWords([
      ...draft.relatedWords,
      ...(relatedByCharacter.get(draft.character) ?? []),
    ]).slice(0, MAX_RELATED_WORDS_PER_KANJI);

    return {
      id: draft.id,
      character: draft.character,
      meaning: draft.meaning,
      hanviet: draft.hanviet,
      onReading: draft.onReading,
      kunReading: draft.kunReading,
      strokeCount: draft.strokeCount,
      jlptLevel: draft.jlptLevel,
      source: getSource(draft),
      sourceLabel: getSourceLabel(draft),
      deckNames: Array.from(draft.personalDecks).filter(Boolean),
      strokeHint: draft.strokeHint,
      radical: cloneRadical(draft.radical),
      radicalHint: draft.radicalHint,
      mnemonic: draft.mnemonic,
      components: cloneComponents(draft.components),
      structure: cloneStructure(draft.structure),
      tags: [...draft.tags],
      relatedWords,
      order: draft.order,
    };
  });

  return sortKanjiByLearningOrder(items, { getOrder: (item) => item.order }).map(({ order: _order, ...item }) => item);
}

export function selectKanjiHandwritingItems(
  items: KanjiHandwritingItem[],
  ids: string[],
  fallbackLimit = 120
): KanjiHandwritingItem[] {
  const idSet = new Set(ids.map((id) => id.trim()).filter(Boolean));
  if (idSet.size === 0) {
    return items.slice(0, fallbackLimit);
  }
  return items.filter((item) => idSet.has(item.id));
}
