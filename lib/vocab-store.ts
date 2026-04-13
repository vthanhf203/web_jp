import "server-only";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type LessonItem = {
  id: string;
  word: string;
  reading: string;
  kanji: string;
  hanviet: string;
  partOfSpeech: string;
  meaning: string;
  createdAt: string;
  updatedAt: string;
};

export type Lesson = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  items: LessonItem[];
};

type VocabStore = {
  lessons: Lesson[];
};

function getStoreKey(userId: string): string {
  return `user_vocab_store:${userId}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeStore(input: unknown): VocabStore {
  if (!input || typeof input !== "object") {
    return { lessons: [] };
  }

  const rawLessons = (input as { lessons?: unknown }).lessons;
  if (!Array.isArray(rawLessons)) {
    return { lessons: [] };
  }

  const lessons: Lesson[] = rawLessons
    .filter((item) => item && typeof item === "object")
    .map((item) => item as Partial<Lesson>)
    .map((lesson) => ({
      id: typeof lesson.id === "string" ? lesson.id : crypto.randomUUID(),
      title:
        typeof lesson.title === "string" && lesson.title.trim()
          ? lesson.title
          : "Bai chua dat ten",
      createdAt: typeof lesson.createdAt === "string" ? lesson.createdAt : nowIso(),
      updatedAt: typeof lesson.updatedAt === "string" ? lesson.updatedAt : nowIso(),
      items: Array.isArray(lesson.items)
        ? lesson.items
            .filter((entry) => entry && typeof entry === "object")
            .map((entry) => entry as Partial<LessonItem>)
            .map((entry) => ({
              id: typeof entry.id === "string" ? entry.id : crypto.randomUUID(),
              word: typeof entry.word === "string" ? entry.word : "",
              reading: typeof entry.reading === "string" ? entry.reading : "",
              kanji: typeof entry.kanji === "string" ? entry.kanji : "",
              hanviet: typeof entry.hanviet === "string" ? entry.hanviet : "",
              partOfSpeech:
                typeof entry.partOfSpeech === "string" ? entry.partOfSpeech : "",
              meaning: typeof entry.meaning === "string" ? entry.meaning : "",
              createdAt:
                typeof entry.createdAt === "string" ? entry.createdAt : nowIso(),
              updatedAt:
                typeof entry.updatedAt === "string" ? entry.updatedAt : nowIso(),
            }))
            .filter((entry) => entry.word && entry.meaning)
        : [],
    }));

  return { lessons };
}

export async function loadUserVocabStore(userId: string): Promise<VocabStore> {
  try {
    const record = await prisma.appData.findUnique({
      where: { key: getStoreKey(userId) },
      select: { value: true },
    });
    return normalizeStore(record?.value);
  } catch {
    return { lessons: [] };
  }
}

export async function saveUserVocabStore(userId: string, data: VocabStore) {
  await prisma.appData.upsert({
    where: { key: getStoreKey(userId) },
    create: {
      key: getStoreKey(userId),
      value: data as unknown as Prisma.InputJsonValue,
    },
    update: {
      value: data as unknown as Prisma.InputJsonValue,
    },
  });
}