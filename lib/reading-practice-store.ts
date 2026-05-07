import "server-only";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type ReadingVocabularyItem = {
  word: string;
  reading: string;
  meaning: string;
};

export type ReadingQuestionItem = {
  prompt: string;
  answer: string;
};

export type ReadingTextItem = {
  id: string;
  title: string;
  jlptLevel: string;
  topic: string;
  difficulty: string;
  estimatedMinutes: number;
  paragraphs: string[];
  translation: string;
  vocabulary: ReadingVocabularyItem[];
  questions: ReadingQuestionItem[];
  createdAt: string;
  updatedAt: string;
};

export type ReadingPracticeStore = {
  updatedAt: string;
  items: ReadingTextItem[];
};

function getStoreKey(userId: string): string {
  return `user_reading_practice_store:${userId}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeNestedString(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "";
  }
  const obj = value as Record<string, unknown>;
  const keys = ["vi", "vn", "text", "value", "translation", "meaning", "dich", "dịch", "content"];
  for (const key of keys) {
    const parsed = normalizeString(obj[key]);
    if (parsed) {
      return parsed;
    }
  }
  return "";
}

function normalizeLevel(value: unknown): string {
  const text = normalizeString(value).toUpperCase();
  if (["N1", "N2", "N3", "N4", "N5"].includes(text)) {
    return text;
  }
  const matched = text.match(/N[1-5]/g);
  if (matched && matched.length > 0) {
    return matched[0] ?? "N5";
  }
  return "N5";
}

function normalizeMinutes(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(normalizeString(value));
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 3;
  }
  return Math.min(60, Math.max(1, Math.round(numeric)));
}

function normalizeParagraphs(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === "string") {
          return normalizeString(entry);
        }
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
          return "";
        }
        const raw = entry as Record<string, unknown>;
        return (
          normalizeString(raw.jp ?? raw.ja ?? raw.text ?? raw.paragraph ?? raw.content) ||
          normalizeNestedString(raw.jp) ||
          normalizeNestedString(raw.text)
        );
      })
      .filter(Boolean);
  }

  const text = normalizeString(value);
  if (!text) {
    return [];
  }
  return text
    .split(/\n{2,}|\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function splitWordAndReading(input: string): { word: string; reading: string } {
  const clean = normalizeString(input);
  const matched = clean.match(/^(.+?)\s*[（(]([^（）()]+)[）)]$/);
  if (!matched) {
    return { word: clean, reading: "" };
  }
  return {
    word: normalizeString(matched[1]),
    reading: normalizeString(matched[2]),
  };
}

function normalizeVocabularyItem(input: unknown): ReadingVocabularyItem | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  const raw = input as Record<string, unknown>;
  const wordInput = normalizeString(raw.word ?? raw.term ?? raw.text);
  const split = splitWordAndReading(wordInput);
  const meaning =
    normalizeString(raw.meaning ?? raw.vi ?? raw.translation) ||
    normalizeNestedString(raw.meaning) ||
    normalizeNestedString(raw.translation);
  if (!split.word || !meaning) {
    return null;
  }
  return {
    word: split.word,
    reading: normalizeString(raw.reading ?? raw.kana ?? raw.furigana ?? raw.yomi) || split.reading,
    meaning,
  };
}

function normalizeQuestionItem(input: unknown): ReadingQuestionItem | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  const raw = input as Record<string, unknown>;
  const prompt =
    normalizeString(raw.prompt ?? raw.question ?? raw.q) ||
    normalizeNestedString(raw.prompt) ||
    normalizeNestedString(raw.question);
  const answer =
    normalizeString(raw.answer ?? raw.a ?? raw.explanation) ||
    normalizeNestedString(raw.answer) ||
    normalizeNestedString(raw.explanation);
  if (!prompt) {
    return null;
  }
  return {
    prompt,
    answer,
  };
}

function normalizeReadingText(input: unknown): ReadingTextItem | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }

  const raw = input as Partial<ReadingTextItem> & Record<string, unknown>;
  const title = normalizeString(raw.title ?? raw.name);
  const paragraphs = normalizeParagraphs(raw.paragraphs ?? raw.content ?? raw.text ?? raw.body);
  if (!title || paragraphs.length === 0) {
    return null;
  }

  const now = nowIso();
  return {
    id: normalizeString(raw.id) || crypto.randomUUID(),
    title,
    jlptLevel: normalizeLevel(raw.jlptLevel ?? raw.level ?? raw.jlpt),
    topic: normalizeString(raw.topic ?? raw.category ?? raw.theme) || "Tổng hợp",
    difficulty: normalizeString(raw.difficulty ?? raw.length) || "Ngắn",
    estimatedMinutes: normalizeMinutes(raw.estimatedMinutes ?? raw.minutes ?? raw.duration),
    paragraphs,
    translation:
      normalizeString(raw.translation ?? raw.meaning ?? raw.vi) ||
      normalizeNestedString(raw.translation) ||
      normalizeNestedString(raw.meaning),
    vocabulary: Array.isArray(raw.vocabulary ?? raw.words)
      ? ((raw.vocabulary ?? raw.words) as unknown[])
          .map((entry) => normalizeVocabularyItem(entry))
          .filter((entry): entry is ReadingVocabularyItem => Boolean(entry))
      : [],
    questions: Array.isArray(raw.questions)
      ? (raw.questions as unknown[])
          .map((entry) => normalizeQuestionItem(entry))
          .filter((entry): entry is ReadingQuestionItem => Boolean(entry))
      : [],
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
        .map((entry) => normalizeReadingText(entry))
        .filter((entry): entry is ReadingTextItem => Boolean(entry))
    : [];

  return {
    updatedAt: normalizeString(raw.updatedAt),
    items: items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };
}

export async function loadReadingPracticeStore(userId: string): Promise<ReadingPracticeStore> {
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

export async function saveReadingPracticeStore(userId: string, store: ReadingPracticeStore) {
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
