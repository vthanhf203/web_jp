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
  autoEnabled: boolean;
  manualEnabled: boolean;
  autoMinutes: number;
  manualMinutes: number;
  autoStrategy: "balanced" | "flashcard_first" | "kanji_first";
  manualFocus: string;
  dailyDeadlineTime: string;
  weeklyDeadlineDay: number;
  weeklyTargetSessions: number;
  monthlyDeadlineDay: number;
  monthlyTargetSessions: number;
  updatedAt: string;
};

export type DeadlineTaskStatus = "pending" | "doing" | "done" | "late_done" | "skipped";
export type DeadlineTaskPriority = "high" | "medium" | "low";
export type DeadlineTaskMode = "auto" | "manual";

export type DeadlineTask = {
  id: string;
  date: string;
  slot: string;
  subject: string;
  task: string;
  startTime: string;
  deadlineTime: string;
  priority: DeadlineTaskPriority;
  status: DeadlineTaskStatus;
  note: string;
  mode: DeadlineTaskMode;
  createdAt: string;
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
  deadlineTasks: DeadlineTask[];
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

function normalizeDate(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed || fallback;
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
  const fallbackDailyMinutes = Math.min(240, Math.max(10, Math.round(normalizeNumber(raw.dailyMinutes, 25))));

  const autoEnabled = typeof raw.autoEnabled === "boolean" ? raw.autoEnabled : true;
  const manualEnabled = typeof raw.manualEnabled === "boolean" ? raw.manualEnabled : true;
  const autoMinutes = Math.min(240, Math.max(0, Math.round(normalizeNumber(raw.autoMinutes, Math.round(fallbackDailyMinutes * 0.55)))));
  const manualMinutes = Math.min(240, Math.max(0, Math.round(normalizeNumber(raw.manualMinutes, Math.max(10, fallbackDailyMinutes - autoMinutes)))));
  const computedDailyMinutes = Math.max(10, Math.min(240, autoMinutes + manualMinutes));

  const autoStrategyRaw = typeof raw.autoStrategy === "string" ? raw.autoStrategy.trim() : "";
  const autoStrategy: LearningPlan["autoStrategy"] =
    autoStrategyRaw === "flashcard_first" || autoStrategyRaw === "review_first"
      ? "flashcard_first"
      : autoStrategyRaw === "kanji_first" || autoStrategyRaw === "weakness_first"
        ? "kanji_first"
        : "balanced";
  const manualFocus = typeof raw.manualFocus === "string" ? raw.manualFocus.trim().slice(0, 160) : "";

  const deadlineTimeRaw =
    typeof raw.dailyDeadlineTime === "string" && /^\d{2}:\d{2}$/.test(raw.dailyDeadlineTime)
      ? raw.dailyDeadlineTime
      : "21:30";

  const weeklyDeadlineDay = Math.max(
    0,
    Math.min(6, Math.round(normalizeNumber(raw.weeklyDeadlineDay, 0)))
  );
  const weeklyTargetSessions = Math.max(
    1,
    Math.min(28, Math.round(normalizeNumber(raw.weeklyTargetSessions, 5)))
  );
  const monthlyDeadlineDay = Math.max(
    1,
    Math.min(31, Math.round(normalizeNumber(raw.monthlyDeadlineDay, 28)))
  );
  const monthlyTargetSessions = Math.max(
    4,
    Math.min(120, Math.round(normalizeNumber(raw.monthlyTargetSessions, 24)))
  );

  return {
    goalLevel,
    targetDate,
    dailyMinutes: computedDailyMinutes,
    autoEnabled,
    manualEnabled,
    autoMinutes,
    manualMinutes,
    autoStrategy,
    manualFocus,
    dailyDeadlineTime: deadlineTimeRaw,
    weeklyDeadlineDay,
    weeklyTargetSessions,
    monthlyDeadlineDay,
    monthlyTargetSessions,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : nowIso(),
  };
}

function normalizeTaskStatus(input: unknown): DeadlineTaskStatus {
  const value = typeof input === "string" ? input.trim().toLowerCase() : "";
  if (value === "doing") {
    return "doing";
  }
  if (value === "done") {
    return "done";
  }
  if (value === "late_done") {
    return "late_done";
  }
  if (value === "skipped") {
    return "skipped";
  }
  return "pending";
}

function normalizeTaskPriority(input: unknown): DeadlineTaskPriority {
  const value = typeof input === "string" ? input.trim().toLowerCase() : "";
  if (value === "low") {
    return "low";
  }
  if (value === "medium") {
    return "medium";
  }
  return "high";
}

function normalizeTaskMode(input: unknown): DeadlineTaskMode {
  const value = typeof input === "string" ? input.trim().toLowerCase() : "";
  return value === "manual" ? "manual" : "auto";
}

function normalizeDateText(value: unknown, fallback = ""): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const text = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }
  return fallback;
}

function normalizeTimeText(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const text = value.trim();
  if (/^\d{2}:\d{2}$/.test(text)) {
    return text;
  }
  return fallback;
}

function normalizeDeadlineTask(input: unknown): DeadlineTask | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const raw = input as Partial<DeadlineTask>;
  const date = normalizeDateText(raw.date);
  const slot = typeof raw.slot === "string" ? raw.slot.trim() : "";
  const subject = typeof raw.subject === "string" ? raw.subject.trim() : "";
  const task = typeof raw.task === "string" ? raw.task.trim() : "";

  if (!date || !slot || !subject || !task) {
    return null;
  }

  const now = nowIso();
  const createdAt = normalizeDate(raw.createdAt, now);
  const updatedAt = normalizeDate(raw.updatedAt, createdAt);

  return {
    id: typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : crypto.randomUUID(),
    date,
    slot: slot.slice(0, 40),
    subject: subject.slice(0, 80),
    task: task.slice(0, 200),
    startTime: normalizeTimeText(raw.startTime, "08:30"),
    deadlineTime: normalizeTimeText(raw.deadlineTime, "09:30"),
    priority: normalizeTaskPriority(raw.priority),
    status: normalizeTaskStatus(raw.status),
    note: typeof raw.note === "string" ? raw.note.trim().slice(0, 240) : "",
    mode: normalizeTaskMode(raw.mode),
    createdAt,
    updatedAt,
  };
}

function compareDeadlineTask(a: DeadlineTask, b: DeadlineTask): number {
  if (a.date !== b.date) {
    return a.date.localeCompare(b.date);
  }
  if (a.startTime !== b.startTime) {
    return a.startTime.localeCompare(b.startTime);
  }
  if (a.deadlineTime !== b.deadlineTime) {
    return a.deadlineTime.localeCompare(b.deadlineTime);
  }
  return a.createdAt.localeCompare(b.createdAt);
}

function normalizeDeadlineTasks(input: unknown): DeadlineTask[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const taskMap = new Map<string, DeadlineTask>();
  for (const entry of input) {
    const task = normalizeDeadlineTask(entry);
    if (!task) {
      continue;
    }
    taskMap.set(task.id, task);
  }

  return Array.from(taskMap.values()).sort(compareDeadlineTask).slice(-1500);
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
      deadlineTasks: [],
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
    deadlineTasks: normalizeDeadlineTasks(raw.deadlineTasks),
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

export function upsertDeadlineTask(
  state: UserPersonalState,
  taskInput: Omit<DeadlineTask, "createdAt" | "updatedAt"> & { createdAt?: string; updatedAt?: string }
): UserPersonalState {
  const now = nowIso();
  const candidate = normalizeDeadlineTask({
    ...taskInput,
    createdAt: taskInput.createdAt ?? now,
    updatedAt: now,
  });
  if (!candidate) {
    return state;
  }

  const nextMap = new Map(state.deadlineTasks.map((task) => [task.id, task]));
  nextMap.set(candidate.id, candidate);

  return {
    ...state,
    deadlineTasks: Array.from(nextMap.values()).sort(compareDeadlineTask).slice(-1500),
  };
}

export function removeDeadlineTask(state: UserPersonalState, taskId: string): UserPersonalState {
  const normalizedId = taskId.trim();
  if (!normalizedId) {
    return state;
  }
  return {
    ...state,
    deadlineTasks: state.deadlineTasks.filter((task) => task.id !== normalizedId),
  };
}

