import "server-only";

import type { Prisma } from "@prisma/client";

import { normalizeJlptLevel, type JlptLevel } from "@/lib/admin-vocab-library";
import { prisma } from "@/lib/prisma";
import type { ImportedKanjiLinkedWord, ImportedKanjiRow } from "@/lib/kanji-import";

export const USER_KANJI_ID_PREFIX = "user-kanji:";

export type UserKanjiLinkedWord = {
  id: string;
  word: string;
  reading: string;
  kanji: string;
  hanviet: string;
  meaning: string;
  type: string;
  jlptLevel: JlptLevel;
  exampleSentence: string;
  exampleMeaning: string;
  note: string;
  sourceLabel: string;
  createdAt: string;
  updatedAt: string;
};

export type UserKanjiItem = {
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
  order: number | null;
  category: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  exampleWord: string;
  exampleMeaning: string;
  relatedWords: UserKanjiLinkedWord[];
};

export type UserKanjiStore = {
  updatedAt: string;
  items: UserKanjiItem[];
};

function getStoreKey(userId: string): string {
  return `user_kanji_store:${userId}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeDate(value: unknown, fallback: string): string {
  const text = normalizeText(value);
  return text || fallback;
}

function normalizeNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(1, Math.floor(value));
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return Math.max(1, Math.floor(parsed));
    }
  }
  return fallback;
}

function parseOptionalOrder(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const rounded = Math.floor(value);
    return rounded >= 1 ? rounded : null;
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      const rounded = Math.floor(parsed);
      return rounded >= 1 ? rounded : null;
    }
  }
  return null;
}

function normalizeTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .map((item) => (typeof item === "string" ? item.trim() : ""))
          .filter(Boolean)
      )
    ).slice(0, 40);
  }
  if (typeof value === "string") {
    return Array.from(
      new Set(
        value
          .split(/[;,|]/)
          .map((item) => item.trim())
          .filter(Boolean)
      )
    ).slice(0, 40);
  }
  return [];
}

function normalizeRelatedWord(input: unknown, fallbackLevel: JlptLevel): UserKanjiLinkedWord | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const raw = input as Partial<UserKanjiLinkedWord>;
  const word = normalizeText(raw.word);
  const kanji = normalizeText(raw.kanji);
  const meaning = normalizeText(raw.meaning);
  if (!word && !kanji) {
    return null;
  }
  if (!meaning) {
    return null;
  }

  const now = nowIso();
  const createdAt = normalizeDate(raw.createdAt, now);
  const updatedAt = normalizeDate(raw.updatedAt, createdAt);

  return {
    id: normalizeText(raw.id) || crypto.randomUUID(),
    word: word || kanji,
    reading: normalizeText(raw.reading),
    kanji: kanji || word,
    hanviet: normalizeText(raw.hanviet),
    meaning,
    type: normalizeText(raw.type),
    jlptLevel: normalizeJlptLevel(raw.jlptLevel || fallbackLevel),
    exampleSentence: normalizeText(raw.exampleSentence),
    exampleMeaning: normalizeText(raw.exampleMeaning),
    note: normalizeText(raw.note),
    sourceLabel: normalizeText(raw.sourceLabel) || "JSON cá nhân",
    createdAt,
    updatedAt,
  };
}

function normalizeRelatedWords(
  value: unknown,
  fallbackLevel: JlptLevel
): UserKanjiLinkedWord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const unique = new Map<string, UserKanjiLinkedWord>();
  for (const entry of value) {
    const normalized = normalizeRelatedWord(entry, fallbackLevel);
    if (!normalized) {
      continue;
    }
    const key = `${normalized.kanji || normalized.word}|${normalized.reading}|${normalized.meaning}`;
    if (!unique.has(key)) {
      unique.set(key, normalized);
    }
  }

  return Array.from(unique.values());
}

function encodeValueForId(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return Array.from(trimmed)
    .map((char) => {
      if (/[a-zA-Z0-9_\-:.]/.test(char)) {
        return char;
      }
      const codePoint = char.codePointAt(0);
      return typeof codePoint === "number" ? `u${codePoint.toString(16)}` : "";
    })
    .filter(Boolean)
    .join("");
}

function buildUserKanjiIdFromCharacter(character: string): string {
  const encodedCharacter = encodeValueForId(character);
  if (!encodedCharacter) {
    return "";
  }
  return `${USER_KANJI_ID_PREFIX}${encodedCharacter}`;
}

function safeUserKanjiId(value: string, fallback = ""): string {
  const byCharacter = buildUserKanjiIdFromCharacter(fallback);
  if (byCharacter) {
    return byCharacter;
  }

  const encoded = encodeValueForId(value);
  const normalized = encoded || crypto.randomUUID();
  return normalized.startsWith(USER_KANJI_ID_PREFIX)
    ? normalized
    : `${USER_KANJI_ID_PREFIX}${normalized}`;
}

function normalizeItem(input: unknown): UserKanjiItem | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const raw = input as Partial<UserKanjiItem>;
  const character = normalizeText(raw.character);
  const meaning = normalizeText(raw.meaning);
  if (!character || !meaning) {
    return null;
  }

  const jlptLevel = normalizeJlptLevel(raw.jlptLevel || "N5");
  const now = nowIso();
  const createdAt = normalizeDate(raw.createdAt, now);
  const updatedAt = normalizeDate(raw.updatedAt, createdAt);
  const exampleWord = normalizeText(raw.exampleWord) || character;
  const exampleMeaning = normalizeText(raw.exampleMeaning) || meaning;

  return {
    id: safeUserKanjiId(normalizeText(raw.id), character),
    character,
    hanviet: normalizeText(raw.hanviet),
    meaning,
    onReading: normalizeText(raw.onReading) || "-",
    kunReading: normalizeText(raw.kunReading) || "-",
    strokeHint: normalizeText(raw.strokeHint),
    strokeImage: normalizeText(raw.strokeImage),
    strokeCount: normalizeNumber(raw.strokeCount, 1),
    jlptLevel,
    order: parseOptionalOrder(raw.order),
    category: normalizeText(raw.category),
    tags: normalizeTags(raw.tags),
    createdAt,
    updatedAt,
    exampleWord,
    exampleMeaning,
    relatedWords: normalizeRelatedWords(raw.relatedWords, jlptLevel),
  };
}

function normalizeStore(input: unknown): UserKanjiStore {
  if (!input || typeof input !== "object") {
    return {
      updatedAt: "",
      items: [],
    };
  }

  const raw = input as Partial<UserKanjiStore>;
  const items = Array.isArray(raw.items)
    ? raw.items
        .map((entry) => normalizeItem(entry))
        .filter((entry): entry is UserKanjiItem => !!entry)
    : [];

  return {
    updatedAt: normalizeText(raw.updatedAt),
    items,
  };
}

function convertImportedRelatedWord(
  input: ImportedKanjiLinkedWord,
  fallbackLevel: JlptLevel
): UserKanjiLinkedWord {
  const now = nowIso();
  return {
    id: input.id || crypto.randomUUID(),
    word: input.word || input.kanji,
    reading: input.reading || "",
    kanji: input.kanji || input.word,
    hanviet: input.hanviet || "",
    meaning: input.meaning || "",
    type: input.type || "",
    jlptLevel: normalizeJlptLevel(input.jlptLevel || fallbackLevel),
    exampleSentence: input.exampleSentence || "",
    exampleMeaning: input.exampleMeaning || "",
    note: input.note || "",
    sourceLabel: input.sourceLabel || "JSON cá nhân",
    createdAt: now,
    updatedAt: now,
  };
}

function convertImportedRow(
  row: ImportedKanjiRow,
  existing: UserKanjiItem | undefined
): UserKanjiItem {
  const now = nowIso();
  const jlptLevel = normalizeJlptLevel(row.jlptLevel || existing?.jlptLevel || "N5");
  const existingRelatedWords = existing?.relatedWords ?? [];
  const nextRelatedWords = row.relatedWordsProvided
    ? row.relatedWords
        .map((entry) => convertImportedRelatedWord(entry, jlptLevel))
        .filter((entry) => entry.word && entry.meaning)
    : existingRelatedWords;

  return {
    id: safeUserKanjiId(row.id || existing?.id || "", row.character),
    character: row.character,
    hanviet: row.hanviet || existing?.hanviet || "",
    meaning: row.meaning,
    onReading: row.onReading || existing?.onReading || "-",
    kunReading: row.kunReading || existing?.kunReading || "-",
    strokeHint: row.strokeHint || existing?.strokeHint || "",
    strokeImage: row.strokeImage || existing?.strokeImage || "",
    strokeCount: Math.max(1, row.strokeCount || existing?.strokeCount || 1),
    jlptLevel,
    order: row.order ?? existing?.order ?? null,
    category: row.category || existing?.category || "",
    tags: row.tags.length > 0 ? normalizeTags(row.tags) : existing?.tags ?? [],
    createdAt: row.createdAt || existing?.createdAt || now,
    updatedAt: row.updatedAt || now,
    exampleWord: row.exampleWord || existing?.exampleWord || row.character,
    exampleMeaning: row.exampleMeaning || existing?.exampleMeaning || row.meaning,
    relatedWords: nextRelatedWords,
  };
}

export function isUserKanjiId(value: string): boolean {
  return value.startsWith(USER_KANJI_ID_PREFIX);
}

export async function loadUserKanjiStore(userId: string): Promise<UserKanjiStore> {
  try {
    const record = await prisma.appData.findUnique({
      where: { key: getStoreKey(userId) },
      select: { value: true },
    });
    return normalizeStore(record?.value);
  } catch {
    return normalizeStore(null);
  }
}

export async function saveUserKanjiStore(userId: string, store: UserKanjiStore): Promise<void> {
  const payload = {
    updatedAt: nowIso(),
    items: normalizeStore(store).items,
  };

  await prisma.appData.upsert({
    where: { key: getStoreKey(userId) },
    create: {
      key: getStoreKey(userId),
      value: payload as unknown as Prisma.InputJsonValue,
    },
    update: {
      value: payload as unknown as Prisma.InputJsonValue,
    },
  });
}

export async function upsertUserKanjiRows(
  userId: string,
  rows: ImportedKanjiRow[]
): Promise<{ createdCount: number; updatedCount: number }> {
  const store = await loadUserKanjiStore(userId);
  const byCharacter = new Map(store.items.map((item) => [item.character, item]));
  const importedCharacters: string[] = [];
  const importedCharacterSet = new Set<string>();
  let createdCount = 0;
  let updatedCount = 0;

  for (const row of rows) {
    const character = normalizeText(row.character);
    const meaning = normalizeText(row.meaning);
    if (!character || !meaning) {
      continue;
    }
    const existing = byCharacter.get(character);
    const next = convertImportedRow(
      {
        ...row,
        character,
        meaning,
      },
      existing
    );
    if (existing) {
      updatedCount += 1;
    } else {
      createdCount += 1;
    }
    byCharacter.set(character, next);
    if (!importedCharacterSet.has(character)) {
      importedCharacterSet.add(character);
      importedCharacters.push(character);
    }
  }

  const importedItems = importedCharacters
    .map((character) => byCharacter.get(character))
    .filter((item): item is UserKanjiItem => Boolean(item));
  const remainingItems = store.items.filter((item) => !importedCharacterSet.has(item.character));
  const nextItems = [...importedItems, ...remainingItems];

  await saveUserKanjiStore(userId, {
    updatedAt: nowIso(),
    items: nextItems,
  });

  return {
    createdCount,
    updatedCount,
  };
}
