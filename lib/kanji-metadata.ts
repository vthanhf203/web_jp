import "server-only";

import type { Prisma } from "@prisma/client";

import { normalizeJlptLevel, type JlptLevel } from "@/lib/admin-vocab-library";
import { prisma } from "@/lib/prisma";

export type KanjiLinkedWord = {
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

export type KanjiMetadataEntry = {
  id: string;
  character: string;
  order: number | null;
  category: string;
  tags: string[];
  createdAt: string;
  relatedWords: KanjiLinkedWord[];
  updatedAt: string;
};

export type KanjiMetadataStore = {
  updatedAt: string;
  entries: KanjiMetadataEntry[];
};

const APP_DATA_KEY = "admin_kanji_metadata";

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

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeLinkedWord(input: unknown): KanjiLinkedWord | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const raw = input as Partial<KanjiLinkedWord>;
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
    kanji,
    hanviet: normalizeText(raw.hanviet),
    meaning,
    type: normalizeText(raw.type),
    jlptLevel: normalizeJlptLevel(raw.jlptLevel),
    exampleSentence: normalizeText(raw.exampleSentence),
    exampleMeaning: normalizeText(raw.exampleMeaning),
    note: normalizeText(raw.note),
    sourceLabel: normalizeText(raw.sourceLabel) || "Kanji JSON",
    createdAt,
    updatedAt,
  };
}

function normalizeEntry(input: unknown): KanjiMetadataEntry | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const raw = input as Partial<KanjiMetadataEntry>;
  const character = typeof raw.character === "string" ? raw.character.trim() : "";
  if (!character) {
    return null;
  }

  const now = nowIso();
  const createdAt = normalizeDate((raw as Record<string, unknown>).createdAt, now);
  const updatedAt = normalizeDate(raw.updatedAt, createdAt);
  const relatedWords = Array.isArray(raw.relatedWords)
    ? raw.relatedWords
        .map((item) => normalizeLinkedWord(item))
        .filter((item): item is KanjiLinkedWord => !!item)
    : [];

  return {
    id: normalizeText((raw as Record<string, unknown>).id) || character,
    character,
    order: parseOptionalOrder((raw as Record<string, unknown>).order),
    category: normalizeText((raw as Record<string, unknown>).category),
    tags: normalizeStringArray((raw as Record<string, unknown>).tags),
    createdAt,
    relatedWords,
    updatedAt,
  };
}

function normalizeStore(input: unknown): KanjiMetadataStore {
  if (!input || typeof input !== "object") {
    return {
      updatedAt: "",
      entries: [],
    };
  }

  const raw = input as Partial<KanjiMetadataStore>;
  const entries = Array.isArray(raw.entries)
    ? raw.entries
        .map((entry) => normalizeEntry(entry))
        .filter((entry): entry is KanjiMetadataEntry => !!entry)
        .sort((a, b) => a.character.localeCompare(b.character, "ja"))
    : [];

  return {
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
    entries,
  };
}

export async function loadAdminKanjiMetadata(): Promise<KanjiMetadataStore> {
  try {
    const record = await prisma.appData.findUnique({
      where: { key: APP_DATA_KEY },
      select: { value: true },
    });
    return normalizeStore(record?.value);
  } catch {
    return normalizeStore(null);
  }
}

export async function saveAdminKanjiMetadata(store: KanjiMetadataStore): Promise<void> {
  const payload = {
    ...store,
    updatedAt: nowIso(),
  };

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

export function getKanjiMetadataMap(store: KanjiMetadataStore): Map<string, KanjiMetadataEntry> {
  return new Map(store.entries.map((entry) => [entry.character, entry]));
}
