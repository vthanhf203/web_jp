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
const IMPORT_HISTORY_APP_DATA_KEY = "admin_vocab_import_history";

export type AdminVocabImportSource = "single_lesson" | "bundle";

export type AdminVocabImportLessonChange = {
  lessonId: string;
  lessonTitle: string;
  jlptLevel: JlptLevel;
  itemIds: string[];
};

export type AdminVocabImportHistoryEntry = {
  id: string;
  createdAt: string;
  source: AdminVocabImportSource;
  importedRows: number;
  noKanjiCount: number;
  createdLessonIds: string[];
  lessonChanges: AdminVocabImportLessonChange[];
  rolledBackAt?: string;
};

type AdminVocabImportHistoryStore = {
  updatedAt: string;
  entries: AdminVocabImportHistoryEntry[];
};

const MAX_IMPORT_HISTORY_ENTRIES = 200;

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

function normalizeLessonChange(input: unknown): AdminVocabImportLessonChange | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const raw = input as Partial<AdminVocabImportLessonChange>;
  const lessonId = typeof raw.lessonId === "string" ? raw.lessonId.trim() : "";
  const lessonTitle = typeof raw.lessonTitle === "string" ? raw.lessonTitle.trim() : "";
  if (!lessonId || !lessonTitle) {
    return null;
  }

  const itemIds = Array.isArray(raw.itemIds)
    ? raw.itemIds
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

  return {
    lessonId,
    lessonTitle,
    jlptLevel: normalizeJlptLevel(raw.jlptLevel),
    itemIds: Array.from(new Set(itemIds)),
  };
}

function normalizeImportHistoryEntry(input: unknown): AdminVocabImportHistoryEntry | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const raw = input as Partial<AdminVocabImportHistoryEntry>;
  const source = raw.source === "bundle" ? "bundle" : raw.source === "single_lesson" ? "single_lesson" : "";
  if (!source) {
    return null;
  }

  const lessonChanges: AdminVocabImportLessonChange[] = Array.isArray(raw.lessonChanges)
    ? raw.lessonChanges
        .map((entry) => normalizeLessonChange(entry))
        .filter((entry): entry is AdminVocabImportLessonChange => !!entry)
    : [];
  if (lessonChanges.length === 0) {
    return null;
  }

  const createdLessonIds = Array.isArray(raw.createdLessonIds)
    ? raw.createdLessonIds
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

  return {
    id: typeof raw.id === "string" ? raw.id : crypto.randomUUID(),
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : nowIso(),
    source,
    importedRows:
      typeof raw.importedRows === "number" && Number.isFinite(raw.importedRows) && raw.importedRows > 0
        ? Math.floor(raw.importedRows)
        : lessonChanges.reduce((sum, lesson) => sum + lesson.itemIds.length, 0),
    noKanjiCount:
      typeof raw.noKanjiCount === "number" && Number.isFinite(raw.noKanjiCount) && raw.noKanjiCount >= 0
        ? Math.floor(raw.noKanjiCount)
        : 0,
    createdLessonIds: Array.from(new Set(createdLessonIds)),
    lessonChanges,
    rolledBackAt: typeof raw.rolledBackAt === "string" ? raw.rolledBackAt : undefined,
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

function normalizeImportHistoryStore(input: unknown): AdminVocabImportHistoryStore {
  if (!input || typeof input !== "object") {
    return {
      updatedAt: "",
      entries: [],
    };
  }

  const raw = input as Partial<AdminVocabImportHistoryStore>;
  const entries: AdminVocabImportHistoryEntry[] = Array.isArray(raw.entries)
    ? raw.entries
        .map((entry) => normalizeImportHistoryEntry(entry))
        .filter((entry): entry is AdminVocabImportHistoryEntry => !!entry)
    : [];

  const sorted = entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return {
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
    entries: sorted.slice(0, MAX_IMPORT_HISTORY_ENTRIES),
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

export async function loadAdminVocabImportHistory(): Promise<AdminVocabImportHistoryEntry[]> {
  try {
    const record = await prisma.appData.findUnique({
      where: { key: IMPORT_HISTORY_APP_DATA_KEY },
      select: { value: true },
    });
    return normalizeImportHistoryStore(record?.value).entries;
  } catch {
    return [];
  }
}

export async function saveAdminVocabImportHistory(
  entries: AdminVocabImportHistoryEntry[]
): Promise<void> {
  const normalized = normalizeImportHistoryStore({
    updatedAt: nowIso(),
    entries,
  });

  await prisma.appData.upsert({
    where: { key: IMPORT_HISTORY_APP_DATA_KEY },
    create: {
      key: IMPORT_HISTORY_APP_DATA_KEY,
      value: normalized as unknown as Prisma.InputJsonValue,
    },
    update: {
      value: normalized as unknown as Prisma.InputJsonValue,
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
