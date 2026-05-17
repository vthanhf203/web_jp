import "server-only";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type ListeningQuestion = {
  id: string;
  type: string;
  questionType?: string;
  level?: number;
  prompt: string;
  options: string[];
  correctAnswer: string | boolean;
  explanation?: string;
  explanationTraps?: string;
  points: number;
};

export type ListeningTtsConfig = {
  voice: string;
  rate: string;
  pitch: string;
};

export const DEFAULT_LISTENING_DECK_NAME = "Chua phan loai";

export type ListeningPracticeItem = {
  id: string;
  title: string;
  deckName: string;
  jlptLevel: string;
  topic: string;
  situation?: string;
  keyPoint?: string;
  meta?: {
    level?: string;
    type?: string;
    durationEstimate?: string;
  };
  difficulty: string;
  estimatedMinutes: number;
  script: string;
  scriptRaw?: string;
  translation?: string;
  tts: ListeningTtsConfig;
  questions: ListeningQuestion[];
  createdAt: string;
  updatedAt: string;
};

export type ListeningPracticeStore = {
  updatedAt: string;
  items: ListeningPracticeItem[];
};

function getStoreKey(userId: string): string {
  return `user_listening_practice_store:${userId}`;
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
  const keys = ["text", "value", "content", "message", "correct", "vi", "vn"];
  for (const key of keys) {
    const parsed = normalizeString(obj[key]);
    if (parsed) {
      return parsed;
    }
  }
  return "";
}

function normalizeOptionalNumber(value: unknown): number | undefined {
  const numeric = typeof value === "number" ? value : Number(normalizeString(value));
  return Number.isFinite(numeric) ? numeric : undefined;
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
  const numeric = normalizeOptionalNumber(value);
  if (!numeric || numeric <= 0) {
    return 3;
  }
  return Math.min(60, Math.max(1, Math.round(numeric)));
}

function normalizeBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  const text = normalizeString(value).toLowerCase();
  if (["true", "1", "yes", "y", "dung", "dung."].includes(text)) {
    return true;
  }
  if (["false", "0", "no", "n", "sai"].includes(text)) {
    return false;
  }
  return fallback;
}

function normalizeQuestion(input: unknown, index: number): ListeningQuestion | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  const raw = input as Record<string, unknown>;
  const prompt = normalizeString(raw.prompt ?? raw.question ?? raw.q);
  const type = normalizeString(raw.type) || "multipleChoice";
  const correctRaw = raw.correctAnswer ?? raw.answer ?? raw.correct;
  if (!prompt || typeof correctRaw === "undefined") {
    return null;
  }

  const isTrueFalse = type.toLowerCase().includes("truefalse") || typeof correctRaw === "boolean";
  const options = Array.isArray(raw.options)
    ? raw.options.map((entry) => normalizeString(entry)).filter(Boolean)
    : isTrueFalse
      ? ["true", "false"]
      : [];

  const explanationRaw = raw.explanation ?? raw.reason ?? raw.note;
  const explanation = normalizeString(explanationRaw) || normalizeNestedString(explanationRaw);
  const explanationTraps =
    explanationRaw && typeof explanationRaw === "object" && !Array.isArray(explanationRaw)
      ? normalizeString((explanationRaw as Record<string, unknown>).traps)
      : "";

  return {
    id: normalizeString(raw.id) || `q-${index + 1}`,
    type,
    questionType: normalizeString(raw.questionType ?? raw.skill ?? raw.category) || undefined,
    level: normalizeOptionalNumber(raw.level),
    prompt,
    options,
    correctAnswer: isTrueFalse ? normalizeBoolean(correctRaw) : normalizeString(correctRaw),
    explanation: explanation || undefined,
    explanationTraps: explanationTraps || undefined,
    points: normalizeOptionalNumber(raw.points) ?? 1,
  };
}

function normalizeTtsConfig(input: unknown): ListeningTtsConfig {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      voice: "ja-JP-NanamiNeural",
      rate: "-5%",
      pitch: "+0Hz",
    };
  }
  const raw = input as Record<string, unknown>;
  return {
    voice: normalizeString(raw.voice) || "ja-JP-NanamiNeural",
    rate: normalizeString(raw.rate) || "-5%",
    pitch: normalizeString(raw.pitch) || "+0Hz",
  };
}

function normalizeListeningItem(input: unknown): ListeningPracticeItem | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  const raw = input as Record<string, unknown>;
  const title = normalizeString(raw.title ?? raw.name);
  const scriptRaw = normalizeString(raw.scriptRaw ?? raw.rawScript ?? raw.speechScript);
  const script = normalizeString(raw.script ?? raw.content ?? raw.text ?? raw.transcript ?? scriptRaw);
  if (!title || !script) {
    return null;
  }

  const questions = Array.isArray(raw.questions)
    ? raw.questions
        .map((entry, index) => normalizeQuestion(entry, index))
        .filter((entry): entry is ListeningQuestion => Boolean(entry))
    : [];

  const now = nowIso();
  const topic = normalizeString(raw.topic ?? raw.category ?? raw.theme) || "Tong hop";
  const metaInput = raw.meta && typeof raw.meta === "object" && !Array.isArray(raw.meta) ? raw.meta : null;
  const metaRaw = metaInput as Record<string, unknown> | null;
  const metaLevel = normalizeString(metaRaw?.level);
  const metaType = normalizeString(metaRaw?.type);
  const metaDurationEstimate = normalizeString(metaRaw?.duration_estimate ?? metaRaw?.durationEstimate);
  const hasMeta = Boolean(metaLevel || metaType || metaDurationEstimate);

  return {
    id: normalizeString(raw.id) || crypto.randomUUID(),
    title,
    deckName:
      normalizeString(raw.deckName ?? raw.deck ?? raw.collection ?? raw.groupName ?? raw.group) ||
      topic ||
      DEFAULT_LISTENING_DECK_NAME,
    jlptLevel: normalizeLevel(raw.jlptLevel ?? raw.level ?? raw.jlpt),
    topic,
    situation: normalizeString(raw.situation) || undefined,
    keyPoint: normalizeString(raw.keyPoint ?? raw.key_point ?? raw.keypoint) || undefined,
    meta: hasMeta
      ? {
          level: metaLevel || undefined,
          type: metaType || undefined,
          durationEstimate: metaDurationEstimate || undefined,
        }
      : undefined,
    difficulty: normalizeString(raw.difficulty ?? raw.length) || "Trung binh",
    estimatedMinutes: normalizeMinutes(raw.estimatedMinutes ?? raw.minutes ?? raw.duration),
    script,
    scriptRaw: scriptRaw || undefined,
    translation: normalizeString(raw.translation ?? raw.vi ?? raw.meaning),
    tts: normalizeTtsConfig(raw.tts),
    questions,
    createdAt: normalizeString(raw.createdAt) || now,
    updatedAt: normalizeString(raw.updatedAt) || now,
  };
}

function normalizeStore(input: unknown): ListeningPracticeStore {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      updatedAt: "",
      items: [],
    };
  }

  const raw = input as Partial<ListeningPracticeStore>;
  const items = Array.isArray(raw.items)
    ? raw.items
        .map((entry) => normalizeListeningItem(entry))
        .filter((entry): entry is ListeningPracticeItem => Boolean(entry))
    : [];

  return {
    updatedAt: normalizeString(raw.updatedAt),
    items: items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };
}

export async function loadListeningPracticeStore(userId: string): Promise<ListeningPracticeStore> {
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

export async function saveListeningPracticeStore(userId: string, store: ListeningPracticeStore) {
  const payload: ListeningPracticeStore = {
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

export function normalizeListeningJsonRows(input: unknown): ListeningPracticeItem[] {
  if (Array.isArray(input)) {
    return input
      .map((entry) => normalizeListeningItem(entry))
      .filter((entry): entry is ListeningPracticeItem => Boolean(entry));
  }
  if (input && typeof input === "object" && !Array.isArray(input)) {
    const raw = input as Record<string, unknown>;
    const list = raw.items ?? raw.data ?? raw.lessons ?? raw.listening ?? raw.audios;
    if (Array.isArray(list)) {
      return list
        .map((entry) => normalizeListeningItem(entry))
        .filter((entry): entry is ListeningPracticeItem => Boolean(entry));
    }
    const single = normalizeListeningItem(raw);
    return single ? [single] : [];
  }
  return [];
}
