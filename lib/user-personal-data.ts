import "server-only";

import type { Prisma } from "@prisma/client";

import { normalizeJlptLevel, type JlptLevel } from "@/lib/admin-vocab-library";
import { prisma } from "@/lib/prisma";

export type BookmarkType = "kanji" | "vocab" | "grammar";

export type PersonalBookmark = {
  id: string;
  type: BookmarkType;
  refId: string;
  title: string;
  subtitle: string;
  note: string;
  createdAt: string;
  updatedAt: string;
};

export type LearningPlan = {
  goalLevel: JlptLevel;
  targetDate: string;
  dailyMinutes: number;
  updatedAt: string;
};

export type ReminderSettings = {
  enabled: boolean;
  hour: number;
  minute: number;
  timezone: string;
  updatedAt: string;
};

export type PlacementBreakdown = {
  level: JlptLevel;
  correct: number;
  total: number;
};

export type PlacementResult = {
  score: number;
  total: number;
  recommendedLevel: JlptLevel;
  breakdown: PlacementBreakdown[];
  createdAt: string;
};

export type GrammarProgress = {
  learnedPointIds: string[];
  updatedAt: string;
};

export type UserPersonalState = {
  plan: LearningPlan | null;
  reminders: ReminderSettings;
  placement: PlacementResult | null;
  grammarProgress: GrammarProgress;
  bookmarks: PersonalBookmark[];
};

const APP_DATA_PREFIX = "user_personal_state:";

function nowIso(): string {
  return new Date().toISOString();
}

function getAppDataKey(userId: string): string {
  return `${APP_DATA_PREFIX}${userId}`;
}

function normalizeNumber(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return value;
}

function normalizeBookmark(input: unknown): PersonalBookmark | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const raw = input as Partial<PersonalBookmark>;
  const type = raw.type;
  if (type !== "kanji" && type !== "vocab" && type !== "grammar") {
    return null;
  }

  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  const refId = typeof raw.refId === "string" ? raw.refId.trim() : "";
  if (!title || !refId) {
    return null;
  }

  const createdAt = typeof raw.createdAt === "string" ? raw.createdAt : nowIso();
  const updatedAt = typeof raw.updatedAt === "string" ? raw.updatedAt : createdAt;

  return {
    id: typeof raw.id === "string" ? raw.id : crypto.randomUUID(),
    type,
    refId,
    title,
    subtitle: typeof raw.subtitle === "string" ? raw.subtitle.trim() : "",
    note: typeof raw.note === "string" ? raw.note.trim() : "",
    createdAt,
    updatedAt,
  };
}

function normalizePlan(input: unknown): LearningPlan | null {
  if (!input || typeof input !== "object") {
    return null;
  }
  const raw = input as Partial<LearningPlan>;
  const goalLevel = normalizeJlptLevel(raw.goalLevel);
  const targetDate = typeof raw.targetDate === "string" ? raw.targetDate : "";
  if (!targetDate) {
    return null;
  }
  const dailyMinutes = Math.min(180, Math.max(10, Math.round(normalizeNumber(raw.dailyMinutes, 25))));

  return {
    goalLevel,
    targetDate,
    dailyMinutes,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : nowIso(),
  };
}

function normalizeReminder(input: unknown): ReminderSettings {
  if (!input || typeof input !== "object") {
    return {
      enabled: false,
      hour: 20,
      minute: 0,
      timezone: "Asia/Tokyo",
      updatedAt: nowIso(),
    };
  }

  const raw = input as Partial<ReminderSettings>;
  const hour = Math.min(23, Math.max(0, Math.round(normalizeNumber(raw.hour, 20))));
  const minute = Math.min(59, Math.max(0, Math.round(normalizeNumber(raw.minute, 0))));

  return {
    enabled: Boolean(raw.enabled),
    hour,
    minute,
    timezone: typeof raw.timezone === "string" && raw.timezone.trim() ? raw.timezone : "Asia/Tokyo",
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : nowIso(),
  };
}

function normalizePlacementResult(input: unknown): PlacementResult | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const raw = input as Partial<PlacementResult>;
  const total = Math.max(0, Math.round(normalizeNumber(raw.total, 0)));
  const score = Math.max(0, Math.round(normalizeNumber(raw.score, 0)));
  if (total <= 0) {
    return null;
  }

  const rawBreakdown = Array.isArray(raw.breakdown) ? raw.breakdown : [];
  const breakdown: PlacementBreakdown[] = rawBreakdown
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => entry as Partial<PlacementBreakdown>)
    .map((entry) => ({
      level: normalizeJlptLevel(entry.level),
      correct: Math.max(0, Math.round(normalizeNumber(entry.correct, 0))),
      total: Math.max(0, Math.round(normalizeNumber(entry.total, 0))),
    }));

  return {
    score,
    total,
    recommendedLevel: normalizeJlptLevel(raw.recommendedLevel),
    breakdown,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : nowIso(),
  };
}

function normalizeGrammarProgress(input: unknown): GrammarProgress {
  if (!input || typeof input !== "object") {
    return {
      learnedPointIds: [],
      updatedAt: nowIso(),
    };
  }

  const raw = input as Partial<GrammarProgress>;
  const learnedPointIds = Array.isArray(raw.learnedPointIds)
    ? Array.from(
        new Set(
          raw.learnedPointIds
            .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
            .filter(Boolean)
        )
      ).slice(0, 5000)
    : [];

  return {
    learnedPointIds,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : nowIso(),
  };
}

function normalizeState(input: unknown): UserPersonalState {
  if (!input || typeof input !== "object") {
    return {
      plan: null,
      reminders: normalizeReminder(null),
      placement: null,
      grammarProgress: normalizeGrammarProgress(null),
      bookmarks: [],
    };
  }

  const raw = input as Partial<UserPersonalState>;
  const bookmarks = Array.isArray(raw.bookmarks)
    ? raw.bookmarks
        .map((entry) => normalizeBookmark(entry))
        .filter((entry): entry is PersonalBookmark => !!entry)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    : [];

  return {
    plan: normalizePlan(raw.plan),
    reminders: normalizeReminder(raw.reminders),
    placement: normalizePlacementResult(raw.placement),
    grammarProgress: normalizeGrammarProgress(raw.grammarProgress),
    bookmarks,
  };
}

export async function loadUserPersonalState(userId: string): Promise<UserPersonalState> {
  try {
    const record = await prisma.appData.findUnique({
      where: { key: getAppDataKey(userId) },
      select: { value: true },
    });
    return normalizeState(record?.value);
  } catch {
    return normalizeState(null);
  }
}

export async function saveUserPersonalState(userId: string, state: UserPersonalState): Promise<void> {
  const payload = normalizeState(state);
  await prisma.appData.upsert({
    where: { key: getAppDataKey(userId) },
    create: {
      key: getAppDataKey(userId),
      value: payload as unknown as Prisma.InputJsonValue,
    },
    update: {
      value: payload as unknown as Prisma.InputJsonValue,
    },
  });
}

export function upsertBookmark(
  state: UserPersonalState,
  input: {
    type: BookmarkType;
    refId: string;
    title: string;
    subtitle?: string;
  }
): { state: UserPersonalState; added: boolean; bookmark: PersonalBookmark } {
  const now = nowIso();
  const existing = state.bookmarks.find(
    (item) => item.type === input.type && item.refId === input.refId
  );

  if (existing) {
    const nextBookmarks = state.bookmarks.filter((item) => item.id !== existing.id);
    return {
      state: {
        ...state,
        bookmarks: nextBookmarks,
      },
      added: false,
      bookmark: existing,
    };
  }

  const bookmark: PersonalBookmark = {
    id: crypto.randomUUID(),
    type: input.type,
    refId: input.refId,
    title: input.title.trim(),
    subtitle: (input.subtitle ?? "").trim(),
    note: "",
    createdAt: now,
    updatedAt: now,
  };

  return {
    state: {
      ...state,
      bookmarks: [bookmark, ...state.bookmarks].slice(0, 300),
    },
    added: true,
    bookmark,
  };
}

export function saveBookmarkNote(
  state: UserPersonalState,
  bookmarkId: string,
  note: string
): UserPersonalState {
  const nextBookmarks = state.bookmarks.map((item) =>
    item.id === bookmarkId
      ? {
          ...item,
          note: note.trim().slice(0, 1200),
          updatedAt: nowIso(),
        }
      : item
  );

  return {
    ...state,
    bookmarks: nextBookmarks,
  };
}

export function markGrammarPointLearned(
  state: UserPersonalState,
  pointId: string
): { state: UserPersonalState; added: boolean } {
  const normalizedPointId = pointId.trim();
  if (!normalizedPointId) {
    return { state, added: false };
  }

  if (state.grammarProgress.learnedPointIds.includes(normalizedPointId)) {
    return { state, added: false };
  }

  const nextState: UserPersonalState = {
    ...state,
    grammarProgress: {
      learnedPointIds: [...state.grammarProgress.learnedPointIds, normalizedPointId].slice(-5000),
      updatedAt: nowIso(),
    },
  };

  return { state: nextState, added: true };
}

