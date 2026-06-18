import "server-only";

import type { Prisma } from "@prisma/client";

import {
  DEFAULT_READING_DECK_NAME,
  type ReadingPracticeStore,
  type ReadingTextItem,
} from "@/lib/reading-practice-store";
import { prisma } from "@/lib/prisma";

function getStoreKey(userId: string): string {
  return `user_reading_vocab_store:${userId}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function normalizeReadingVocabText(input: unknown): ReadingTextItem | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }

  const raw = input as Partial<ReadingTextItem>;
  const title = normalizeString(raw.title);
  const paragraphs = normalizeStringArray(raw.paragraphs);
  if (!title || paragraphs.length === 0) {
    return null;
  }

  const now = nowIso();

  return {
    id: normalizeString(raw.id) || crypto.randomUUID(),
    title,
    deckName: normalizeString(raw.deckName) || DEFAULT_READING_DECK_NAME,
    jlptLevel: normalizeString(raw.jlptLevel) || "N5",
    topic: normalizeString(raw.topic) || "Tong hop",
    difficulty: normalizeString(raw.difficulty) || "Ngan",
    estimatedMinutes:
      typeof raw.estimatedMinutes === "number" && Number.isFinite(raw.estimatedMinutes)
        ? raw.estimatedMinutes
        : 3,
    paragraphs,
    translation: normalizeString(raw.translation),
    vocabulary: Array.isArray(raw.vocabulary) ? raw.vocabulary : [],
    grammarCoverage: Array.isArray(raw.grammarCoverage) ? raw.grammarCoverage : [],
    questions: Array.isArray(raw.questions) ? raw.questions : [],
    postReadingQuiz: raw.postReadingQuiz,
    sentenceRecallPractice: raw.sentenceRecallPractice,
    createdAt: normalizeString(raw.createdAt) || now,
    updatedAt: normalizeString(raw.updatedAt) || now,
  };
}

function normalizeStore(input: unknown): ReadingPracticeStore {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { updatedAt: "", items: [] };
  }

  const raw = input as Partial<ReadingPracticeStore>;
  const items = Array.isArray(raw.items)
    ? raw.items
        .map((entry) => normalizeReadingVocabText(entry))
        .filter((entry): entry is ReadingTextItem => Boolean(entry))
    : [];

  return {
    updatedAt: normalizeString(raw.updatedAt),
    items: items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };
}

export async function loadReadingVocabStore(userId: string): Promise<ReadingPracticeStore> {
  try {
    const record = await prisma.appData.findUnique({
      where: { key: getStoreKey(userId) },
      select: { value: true },
    });
    return normalizeStore(record?.value);
  } catch {
    return { updatedAt: "", items: [] };
  }
}

export async function saveReadingVocabStore(userId: string, store: ReadingPracticeStore) {
  const payload: ReadingPracticeStore = {
    updatedAt: nowIso(),
    items: store.items,
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
