import "server-only";

import type { Prisma } from "@prisma/client";

import { JLPT_LEVELS, type JlptLevel } from "@/lib/admin-vocab-library";
import { prisma } from "@/lib/prisma";

const APP_DATA_KEY = "open_japanese_dictionary";
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 80;

export type OpenDictionaryWord = {
  id: string;
  word: string;
  reading: string;
  kanji: string;
  meanings: string[];
  partsOfSpeech: string[];
  jlptLevel: JlptLevel | "";
  common: boolean;
  source: "JMdict";
};

export type OpenDictionaryKanji = {
  id: string;
  character: string;
  meanings: string[];
  onReadings: string[];
  kunReadings: string[];
  nanori: string[];
  strokeCount: number;
  jlptLevel: JlptLevel | "";
  grade: number | null;
  frequency: number | null;
  source: "KANJIDIC2";
};

export type OpenJapaneseDictionaryStore = {
  updatedAt: string;
  source: {
    jmdict?: string;
    kanjidic2?: string;
  };
  words: OpenDictionaryWord[];
  kanji: OpenDictionaryKanji[];
};

export type OpenDictionaryLookupKind = "all" | "word" | "kanji";

export type OpenDictionarySearchResult = {
  words: OpenDictionaryWord[];
  kanji: OpenDictionaryKanji[];
};

function nowIso(): string {
  return new Date().toISOString();
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanTextList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((entry) => cleanText(entry))
        .filter((entry) => entry.length > 0)
    )
  );
}

function normalizeOptionalJlptLevel(value: unknown): JlptLevel | "" {
  const normalized = cleanText(value).toUpperCase();
  return JLPT_LEVELS.includes(normalized as JlptLevel)
    ? (normalized as JlptLevel)
    : "";
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.floor(value);
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizeWord(input: unknown): OpenDictionaryWord | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const raw = input as Partial<OpenDictionaryWord>;
  const word = cleanText(raw.word);
  const reading = cleanText(raw.reading);
  const meanings = cleanTextList(raw.meanings);
  if (!word || !reading || meanings.length === 0) {
    return null;
  }

  return {
    id: cleanText(raw.id) || `${word}:${reading}`,
    word,
    reading,
    kanji: cleanText(raw.kanji),
    meanings,
    partsOfSpeech: cleanTextList(raw.partsOfSpeech),
    jlptLevel: normalizeOptionalJlptLevel(raw.jlptLevel),
    common: raw.common === true,
    source: "JMdict",
  };
}

function normalizeKanji(input: unknown): OpenDictionaryKanji | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const raw = input as Partial<OpenDictionaryKanji>;
  const character = cleanText(raw.character);
  if (!character) {
    return null;
  }

  return {
    id: cleanText(raw.id) || character,
    character,
    meanings: cleanTextList(raw.meanings),
    onReadings: cleanTextList(raw.onReadings),
    kunReadings: cleanTextList(raw.kunReadings),
    nanori: cleanTextList(raw.nanori),
    strokeCount: normalizeNumber(raw.strokeCount) ?? 0,
    jlptLevel: normalizeOptionalJlptLevel(raw.jlptLevel),
    grade: normalizeNumber(raw.grade),
    frequency: normalizeNumber(raw.frequency),
    source: "KANJIDIC2",
  };
}

function normalizeStore(input: unknown): OpenJapaneseDictionaryStore {
  if (!input || typeof input !== "object") {
    return {
      updatedAt: "",
      source: {},
      words: [],
      kanji: [],
    };
  }

  const raw = input as Partial<OpenJapaneseDictionaryStore>;
  const source =
    raw.source && typeof raw.source === "object" && !Array.isArray(raw.source)
      ? raw.source
      : {};

  return {
    updatedAt: cleanText(raw.updatedAt),
    source: {
      jmdict: cleanText(source.jmdict) || undefined,
      kanjidic2: cleanText(source.kanjidic2) || undefined,
    },
    words: Array.isArray(raw.words)
      ? raw.words
          .map((entry) => normalizeWord(entry))
          .filter((entry): entry is OpenDictionaryWord => !!entry)
      : [],
    kanji: Array.isArray(raw.kanji)
      ? raw.kanji
          .map((entry) => normalizeKanji(entry))
          .filter((entry): entry is OpenDictionaryKanji => !!entry)
      : [],
  };
}

function normalizeSearchText(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase();
}

function clampLimit(value: number | undefined): number {
  if (!value || !Number.isFinite(value)) {
    return DEFAULT_LIMIT;
  }
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(value)));
}

function rankWord(entry: OpenDictionaryWord, query: string): number | null {
  const word = normalizeSearchText(entry.word);
  const reading = normalizeSearchText(entry.reading);
  const kanji = normalizeSearchText(entry.kanji);
  const meanings = normalizeSearchText(entry.meanings.join(" "));
  const partsOfSpeech = normalizeSearchText(entry.partsOfSpeech.join(" "));

  if (word === query || reading === query || kanji === query) {
    return 0;
  }
  if (word.startsWith(query) || reading.startsWith(query) || kanji.startsWith(query)) {
    return 1;
  }
  if (word.includes(query) || reading.includes(query) || kanji.includes(query)) {
    return 2;
  }
  if (meanings.includes(query)) {
    return 3;
  }
  if (partsOfSpeech.includes(query)) {
    return 4;
  }
  return null;
}

function rankKanji(entry: OpenDictionaryKanji, query: string): number | null {
  const character = normalizeSearchText(entry.character);
  const readings = normalizeSearchText(
    [...entry.onReadings, ...entry.kunReadings, ...entry.nanori].join(" ")
  );
  const meanings = normalizeSearchText(entry.meanings.join(" "));

  if (character === query) {
    return 0;
  }
  if (character.includes(query)) {
    return 1;
  }
  if (readings.includes(query)) {
    return 2;
  }
  if (meanings.includes(query)) {
    return 3;
  }
  return null;
}

function sortWords(
  left: { entry: OpenDictionaryWord; rank: number },
  right: { entry: OpenDictionaryWord; rank: number }
): number {
  if (left.rank !== right.rank) {
    return left.rank - right.rank;
  }
  if (left.entry.common !== right.entry.common) {
    return left.entry.common ? -1 : 1;
  }
  return left.entry.word.localeCompare(right.entry.word, "ja");
}

function sortKanji(
  left: { entry: OpenDictionaryKanji; rank: number },
  right: { entry: OpenDictionaryKanji; rank: number }
): number {
  if (left.rank !== right.rank) {
    return left.rank - right.rank;
  }
  return left.entry.character.localeCompare(right.entry.character, "ja");
}

export async function loadOpenJapaneseDictionary(): Promise<OpenJapaneseDictionaryStore> {
  try {
    const record = await prisma.appData.findUnique({
      where: { key: APP_DATA_KEY },
      select: { value: true },
    });
    return normalizeStore(record?.value);
  } catch {
    return {
      updatedAt: "",
      source: {},
      words: [],
      kanji: [],
    };
  }
}

export async function saveOpenJapaneseDictionary(
  data: OpenJapaneseDictionaryStore
): Promise<void> {
  const payload = normalizeStore({
    ...data,
    updatedAt: nowIso(),
  });

  await prisma.appData.upsert({
    where: { key: APP_DATA_KEY },
    create: {
      key: APP_DATA_KEY,
      value: payload as unknown as Prisma.InputJsonValue,
    },
    update: {
      value: payload as unknown as Prisma.InputJsonValue,
    },
  });
}

export function searchOpenJapaneseDictionary(
  store: OpenJapaneseDictionaryStore,
  query: string,
  options: { kind?: OpenDictionaryLookupKind; limit?: number } = {}
): OpenDictionarySearchResult {
  const normalizedQuery = normalizeSearchText(query);
  const kind = options.kind ?? "all";
  const limit = clampLimit(options.limit);

  if (!normalizedQuery) {
    return {
      words: [],
      kanji: [],
    };
  }

  const words =
    kind === "kanji"
      ? []
      : store.words
          .map((entry) => {
            const rank = rankWord(entry, normalizedQuery);
            return rank === null ? null : { entry, rank };
          })
          .filter(
            (entry): entry is { entry: OpenDictionaryWord; rank: number } => !!entry
          )
          .sort(sortWords)
          .slice(0, limit)
          .map(({ entry }) => entry);

  const kanji =
    kind === "word"
      ? []
      : store.kanji
          .map((entry) => {
            const rank = rankKanji(entry, normalizedQuery);
            return rank === null ? null : { entry, rank };
          })
          .filter(
            (entry): entry is { entry: OpenDictionaryKanji; rank: number } => !!entry
          )
          .sort(sortKanji)
          .slice(0, limit)
          .map(({ entry }) => entry);

  return {
    words,
    kanji,
  };
}
