import "server-only";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  JLPT_LEVELS,
  normalizeJlptLevel,
  type JlptLevel,
} from "@/lib/admin-vocab-library";

export type ConjugationForm = {
  id: string;
  label: string;
  value: string;
};

export type ConjugationItem = {
  id: string;
  base: string;
  reading: string;
  kanji: string;
  hanviet: string;
  partOfSpeech: string;
  meaning: string;
  note: string;
  forms: ConjugationForm[];
  createdAt: string;
  updatedAt: string;
};

export type AdminConjugationLesson = {
  id: string;
  title: string;
  description: string;
  formKey: string;
  formLabel: string;
  jlptLevel: JlptLevel;
  createdAt: string;
  updatedAt: string;
  items: ConjugationItem[];
};

export type AdminConjugationLibrary = {
  updatedAt: string;
  lessons: AdminConjugationLesson[];
};

const APP_DATA_KEY = "admin_conjugation_library";

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeForm(input: unknown): ConjugationForm | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const raw = input as Partial<ConjugationForm>;
  const label = typeof raw.label === "string" ? raw.label.trim() : "";
  const value = typeof raw.value === "string" ? raw.value.trim() : "";
  if (!label || !value) {
    return null;
  }

  return {
    id: typeof raw.id === "string" ? raw.id : crypto.randomUUID(),
    label,
    value,
  };
}

function normalizeItem(input: unknown): ConjugationItem | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const raw = input as Partial<ConjugationItem>;
  const base = typeof raw.base === "string" ? raw.base.trim() : "";
  const meaning = typeof raw.meaning === "string" ? raw.meaning.trim() : "";
  if (!base || !meaning) {
    return null;
  }

  const forms = Array.isArray(raw.forms)
    ? raw.forms
        .map((entry) => normalizeForm(entry))
        .filter((entry): entry is ConjugationForm => !!entry)
    : [];

  return {
    id: typeof raw.id === "string" ? raw.id : crypto.randomUUID(),
    base,
    reading: typeof raw.reading === "string" ? raw.reading.trim() : "",
    kanji: typeof raw.kanji === "string" ? raw.kanji.trim() : "",
    hanviet: typeof raw.hanviet === "string" ? raw.hanviet.trim() : "",
    partOfSpeech:
      typeof raw.partOfSpeech === "string" ? raw.partOfSpeech.trim() : "",
    meaning,
    note: typeof raw.note === "string" ? raw.note.trim() : "",
    forms,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : nowIso(),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : nowIso(),
  };
}

function normalizeLesson(input: unknown): AdminConjugationLesson | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const raw = input as Partial<AdminConjugationLesson>;
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  if (!title) {
    return null;
  }

  const items = Array.isArray(raw.items)
    ? raw.items
        .map((entry) => normalizeItem(entry))
        .filter((entry): entry is ConjugationItem => !!entry)
    : [];

  return {
    id: typeof raw.id === "string" ? raw.id : crypto.randomUUID(),
    title,
    description:
      typeof raw.description === "string" ? raw.description.trim() : "",
    formKey:
      typeof raw.formKey === "string"
        ? raw.formKey.trim()
        : typeof (raw as Record<string, unknown>).form === "string"
          ? String((raw as Record<string, unknown>).form).trim()
          : "",
    formLabel:
      typeof raw.formLabel === "string"
        ? raw.formLabel.trim()
        : typeof (raw as Record<string, unknown>).form_label === "string"
          ? String((raw as Record<string, unknown>).form_label).trim()
          : "",
    jlptLevel: normalizeJlptLevel(raw.jlptLevel),
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : nowIso(),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : nowIso(),
    items,
  };
}

function normalizeLibrary(input: unknown): AdminConjugationLibrary {
  if (!input || typeof input !== "object") {
    return {
      updatedAt: "",
      lessons: [],
    };
  }

  const raw = input as Partial<AdminConjugationLibrary>;
  const lessons = Array.isArray(raw.lessons)
    ? raw.lessons
        .map((entry) => normalizeLesson(entry))
        .filter((entry): entry is AdminConjugationLesson => !!entry)
    : [];

  return {
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
    lessons: lessons.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  };
}

export async function loadAdminConjugationLibrary(): Promise<AdminConjugationLibrary> {
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

export async function saveAdminConjugationLibrary(
  data: AdminConjugationLibrary
): Promise<void> {
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

export { JLPT_LEVELS, normalizeJlptLevel, type JlptLevel };
