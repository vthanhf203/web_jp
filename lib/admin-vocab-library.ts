import "server-only";

import type { Prisma } from "@prisma/client";

import type { LessonItem } from "@/lib/vocab-store";
import { prisma } from "@/lib/prisma";

export const JLPT_LEVELS = ["N5", "N4", "N3", "N2", "N1"] as const;
export type JlptLevel = (typeof JLPT_LEVELS)[number];

export type AdminVocabLesson = {
  id: string;
  title: string;
  description: string;
  jlptLevel: JlptLevel;
  createdAt: string;
  updatedAt: string;
  items: LessonItem[];
};

export type AdminVocabLibrary = {
  updatedAt: string;
  lessons: AdminVocabLesson[];
};

const APP_DATA_KEY = "admin_vocab_library";

function nowIso(): string {
  return new Date().toISOString();
}

export function normalizeJlptLevel(value: unknown): JlptLevel {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (normalized === "N5") {
    return "N5";
  }
  if (normalized === "N4") {
    return "N4";
  }
  if (normalized === "N3") {
    return "N3";
  }
  if (normalized === "N2") {
    return "N2";
  }
  if (normalized === "N1") {
    return "N1";
  }
  return "N5";
}

function normalizeItem(input: unknown): LessonItem | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const raw = input as Partial<LessonItem>;
  const word = typeof raw.word === "string" ? raw.word.trim() : "";
  const meaning = typeof raw.meaning === "string" ? raw.meaning.trim() : "";
  if (!word || !meaning) {
    return null;
  }

  return {
    id: typeof raw.id === "string" ? raw.id : crypto.randomUUID(),
    word,
    reading: typeof raw.reading === "string" ? raw.reading.trim() : "",
    kanji: typeof raw.kanji === "string" ? raw.kanji.trim() : "",
    hanviet: typeof raw.hanviet === "string" ? raw.hanviet.trim() : "",
    partOfSpeech:
      typeof raw.partOfSpeech === "string" ? raw.partOfSpeech.trim() : "",
    meaning,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : nowIso(),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : nowIso(),
  };
}

function normalizeLesson(input: unknown): AdminVocabLesson | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const raw = input as Partial<AdminVocabLesson>;
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  if (!title) {
    return null;
  }

  const items = Array.isArray(raw.items)
    ? raw.items.map((entry) => normalizeItem(entry)).filter(Boolean)
    : [];

  return {
    id: typeof raw.id === "string" ? raw.id : crypto.randomUUID(),
    title,
    description:
      typeof raw.description === "string" ? raw.description.trim() : "",
    jlptLevel: normalizeJlptLevel(raw.jlptLevel),
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : nowIso(),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : nowIso(),
    items: items as LessonItem[],
  };
}

function normalizeLibrary(input: unknown): AdminVocabLibrary {
  if (!input || typeof input !== "object") {
    return {
      updatedAt: "",
      lessons: [],
    };
  }

  const raw = input as Partial<AdminVocabLibrary>;
  const lessons = Array.isArray(raw.lessons)
    ? raw.lessons.map((entry) => normalizeLesson(entry)).filter(Boolean)
    : [];

  return {
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
    lessons: (lessons as AdminVocabLesson[]).sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt)
    ),
  };
}

export async function loadAdminVocabLibrary(): Promise<AdminVocabLibrary> {
  try {
    const record = await prisma.appData.findUnique({
      where: { key: APP_DATA_KEY },
      select: { value: true },
    });
    return normalizeLibrary(record?.value);
  } catch {
    return {
      updatedAt: "",
      lessons: [],
    };
  }
}

export async function saveAdminVocabLibrary(data: AdminVocabLibrary): Promise<void> {
  const payload = {
    ...data,
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

export function cloneItemsForUser(items: LessonItem[]): LessonItem[] {
  const now = nowIso();
  return items.map((item) => ({
    id: crypto.randomUUID(),
    word: item.word,
    reading: item.reading,
    kanji: item.kanji,
    hanviet: item.hanviet,
    partOfSpeech: item.partOfSpeech,
    meaning: item.meaning,
    createdAt: now,
    updatedAt: now,
  }));
}
