import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type GrammarPoint = {
  id: string;
  order: number;
  title: string;
  meaning: string;
  usage: string[];
  examples: string[];
  notes: string[];
  content: string;
  image?: string;
};

export const GRAMMAR_LEVELS = ["N5", "N4", "N3", "N2", "N1"] as const;
export type GrammarLevel = (typeof GRAMMAR_LEVELS)[number];

export type GrammarLesson = {
  id: string;
  lessonNumber: number;
  level: GrammarLevel;
  title: string;
  topic?: string;
  pointCount: number;
  points: GrammarPoint[];
};

export type GrammarDataset = {
  source: string;
  importedAt: string;
  lessonCount: number;
  lessons: GrammarLesson[];
};

const APP_DATA_KEY = "grammar_dataset";
const GRAMMAR_DATASET_FILE = path.join(
  process.cwd(),
  "data",
  "grammar",
  "minna-n4n5.json"
);

function normalizeText(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeLevel(value: unknown): GrammarLevel {
  const normalized = normalizeText(value).toUpperCase();
  if (normalized === "N1") {
    return "N1";
  }
  if (normalized === "N2") {
    return "N2";
  }
  if (normalized === "N3") {
    return "N3";
  }
  if (normalized === "N4") {
    return "N4";
  }
  return "N5";
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => normalizeText(entry)).filter(Boolean);
}

function normalizePoint(input: unknown, lessonNumber: number, order: number): GrammarPoint | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const raw = input as Partial<GrammarPoint>;
  const title = normalizeText(raw.title);

  return {
    id: normalizeText(raw.id) || `l${lessonNumber}-p${order}`,
    order: typeof raw.order === "number" && Number.isFinite(raw.order) ? raw.order : order,
    title: title || `Mau ${order}`,
    meaning: normalizeText(raw.meaning),
    usage: normalizeStringArray(raw.usage),
    examples: normalizeStringArray(raw.examples),
    notes: normalizeStringArray(raw.notes),
    content: normalizeText(raw.content),
    image: normalizeText(raw.image) || undefined,
  };
}

function normalizeLesson(input: unknown): GrammarLesson | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const raw = input as Partial<GrammarLesson>;
  const lessonNumber =
    typeof raw.lessonNumber === "number" && Number.isFinite(raw.lessonNumber)
      ? Math.max(1, Math.floor(raw.lessonNumber))
      : 1;

  const points = Array.isArray(raw.points)
    ? raw.points
        .map((point, index) => normalizePoint(point, lessonNumber, index + 1))
        .filter((point): point is GrammarPoint => !!point)
        .sort((a, b) => a.order - b.order)
    : [];

  const title = normalizeText(raw.title) || `Bai ${lessonNumber}`;

  return {
    id: normalizeText(raw.id) || `lesson-${String(lessonNumber).padStart(2, "0")}`,
    lessonNumber,
    level: normalizeLevel(raw.level),
    title,
    topic: normalizeText(raw.topic) || undefined,
    pointCount: points.length,
    points,
  };
}

function normalizeDataset(input: unknown): GrammarDataset {
  if (!input || typeof input !== "object") {
    return {
      source: "",
      importedAt: "",
      lessonCount: 0,
      lessons: [],
    };
  }

  const raw = input as Partial<GrammarDataset>;
  const lessons = Array.isArray(raw.lessons) ? raw.lessons : [];
  const normalizedLessons = lessons
    .map((lesson) => normalizeLesson(lesson))
    .filter((lesson): lesson is GrammarLesson => !!lesson)
    .sort((a, b) => a.lessonNumber - b.lessonNumber);

  return {
    source: typeof raw.source === "string" ? raw.source : "",
    importedAt: typeof raw.importedAt === "string" ? raw.importedAt : "",
    lessonCount:
      typeof raw.lessonCount === "number" ? raw.lessonCount : normalizedLessons.length,
    lessons: normalizedLessons,
  };
}

async function loadGrammarDatasetFromFile(): Promise<GrammarDataset | null> {
  try {
    const raw = await readFile(GRAMMAR_DATASET_FILE, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    const normalized = normalizeDataset(parsed);
    if (normalized.lessons.length === 0) {
      return null;
    }
    return normalized;
  } catch {
    return null;
  }
}

function emptyGrammarDataset(): GrammarDataset {
  return {
    source: "",
    importedAt: "",
    lessonCount: 0,
    lessons: [],
  };
}

function levelSet(dataset: GrammarDataset): Set<string> {
  return new Set(dataset.lessons.map((lesson) => lesson.level));
}

function shouldReplaceWithFallback(current: GrammarDataset, fallback: GrammarDataset): boolean {
  if (fallback.lessons.length === 0) {
    return false;
  }
  if (current.lessons.length === 0) {
    return true;
  }
  if (fallback.lessons.length > current.lessons.length) {
    return true;
  }

  const currentLevels = levelSet(current);
  const fallbackLevels = levelSet(fallback);
  for (const level of fallbackLevels) {
    if (!currentLevels.has(level)) {
      return true;
    }
  }
  return false;
}

export async function loadGrammarDataset(): Promise<GrammarDataset> {
  let dataset = emptyGrammarDataset();

  try {
    const record = await prisma.appData.findUnique({
      where: { key: APP_DATA_KEY },
      select: { value: true },
    });
    dataset = normalizeDataset(record?.value);
  } catch {
    // ignore and fallback below
  }

  const fallback = await loadGrammarDatasetFromFile();
  if (!fallback || !shouldReplaceWithFallback(dataset, fallback)) {
    return dataset;
  }

  try {
    await prisma.appData.upsert({
      where: { key: APP_DATA_KEY },
      create: {
        key: APP_DATA_KEY,
        value: fallback as unknown as Prisma.InputJsonValue,
      },
      update: {
        value: fallback as unknown as Prisma.InputJsonValue,
      },
    });
  } catch {
    // ignore persist issue; still return parsed fallback dataset
  }

  return fallback;
}

export async function saveGrammarDataset(data: GrammarDataset): Promise<void> {
  const normalized = normalizeDataset(data);
  const payload = {
    ...normalized,
    importedAt: nowIso(),
    lessonCount: normalized.lessons.length,
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
