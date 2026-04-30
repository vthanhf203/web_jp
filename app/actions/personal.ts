"use server";

import { QuizOption } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { JLPT_LEVELS, normalizeJlptLevel, type JlptLevel } from "@/lib/admin-vocab-library";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  type DeadlineTaskPriority,
  type DeadlineTaskStatus,
  loadUserPersonalState,
  removeDeadlineTask,
  saveBookmarkNote,
  saveUserPersonalState,
  upsertDeadlineTask,
  upsertBookmark,
  type PlacementBreakdown,
} from "@/lib/user-personal-data";
import { parseKanjiInput } from "@/lib/kanji-import";
import {
  loadUserKanjiStore,
  saveUserKanjiStore,
  upsertUserKanjiRows,
} from "@/lib/user-kanji-store";

export type PersonalKanjiImportState = {
  status: "idle" | "success" | "error";
  message: string;
};

const learningPlanSchema = z.object({
  goalLevel: z.string().transform((value) => normalizeJlptLevel(value)),
  targetDate: z.string().min(1),
  dailyMinutes: z.coerce.number().int().min(10).max(240),
  autoEnabled: z
    .union([z.literal("on"), z.literal("off"), z.literal("true"), z.literal("false"), z.literal("")])
    .optional(),
  manualEnabled: z
    .union([z.literal("on"), z.literal("off"), z.literal("true"), z.literal("false"), z.literal("")])
    .optional(),
  autoMinutes: z.coerce.number().int().min(0).max(240),
  manualMinutes: z.coerce.number().int().min(0).max(240),
  autoStrategy: z.enum(["balanced", "flashcard_first", "kanji_first"]),
  manualFocus: z.string().trim().max(160).optional(),
  dailyDeadlineTime: z.string().regex(/^\d{2}:\d{2}$/),
  weeklyDeadlineDay: z.coerce.number().int().min(0).max(6),
  weeklyTargetSessions: z.coerce.number().int().min(1).max(28),
  monthlyDeadlineDay: z.coerce.number().int().min(1).max(31),
  monthlyTargetSessions: z.coerce.number().int().min(4).max(120),
});

const boardGenerateSchema = z.object({
  days: z.coerce.number().int().min(3).max(60).default(14),
});

const deadlineTaskUpdateSchema = z.object({
  taskId: z.string().trim().min(1),
  status: z.enum(["pending", "doing", "done", "late_done", "skipped"]).optional(),
  note: z.string().trim().max(240).optional(),
});

const manualTaskSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slot: z.string().trim().min(1).max(40),
  subject: z.string().trim().min(1).max(80),
  task: z.string().trim().min(1).max(200),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  deadlineTime: z.string().regex(/^\d{2}:\d{2}$/),
  priority: z.enum(["high", "medium", "low"]),
});

const deleteTaskSchema = z.object({
  taskId: z.string().trim().min(1),
});

const reminderSchema = z.object({
  enabled: z
    .union([z.literal("on"), z.literal("off"), z.literal("true"), z.literal("false"), z.literal("")])
    .optional(),
  hour: z.coerce.number().int().min(0).max(23),
  minute: z.coerce.number().int().min(0).max(59),
  timezone: z.string().trim().min(1).max(120).default("Asia/Tokyo"),
});

const bookmarkSchema = z.object({
  type: z.enum(["kanji", "vocab", "grammar"]),
  refId: z.string().trim().min(1).max(140),
  title: z.string().trim().min(1).max(180),
  subtitle: z.string().trim().max(220).optional(),
  returnTo: z.string().trim().max(500).optional(),
});

const bookmarkNoteSchema = z.object({
  bookmarkId: z.string().trim().min(1),
  note: z.string().max(1200),
  returnTo: z.string().trim().max(500).optional(),
});

function isQuizOption(value: string): value is QuizOption {
  return value === "A" || value === "B" || value === "C" || value === "D";
}

const applyLevelSchema = z.object({
  level: z.string().transform((value) => normalizeJlptLevel(value)),
});

const importPersonalKanjiSchema = z.object({
  rawInput: z.string().min(1),
});

const deletePersonalKanjiSchema = z.object({
  id: z.string().trim().min(1),
});

function parsePlacementAnswers(formData: FormData): Array<{ questionId: string; selected: QuizOption }> {
  return Array.from(formData.entries())
    .filter((entry): entry is [string, string] => entry[0].startsWith("p_") && typeof entry[1] === "string")
    .map(([key, value]) => ({
      questionId: key.replace("p_", ""),
      selected: value,
    }))
    .filter((item): item is { questionId: string; selected: QuizOption } => isQuizOption(item.selected));
}

function inferRecommendedLevel(levelStats: PlacementBreakdown[]): JlptLevel {
  const levelOrder: JlptLevel[] = [...JLPT_LEVELS];
  let recommended: JlptLevel = "N5";

  for (const level of levelOrder) {
    const stat = levelStats.find((entry) => entry.level === level);
    if (!stat || stat.total < 2) {
      continue;
    }
    const ratio = stat.correct / stat.total;
    if (ratio >= 0.62) {
      recommended = level;
    }
  }

  return recommended;
}

function toIsoDateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(base: Date, days: number): Date {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map((part) => Number(part));
  if (!Number.isFinite(h) || !Number.isFinite(m)) {
    return 21 * 60;
  }
  return Math.max(0, Math.min(23 * 60 + 59, h * 60 + m));
}

function fromMinutes(value: number): string {
  const safe = Math.max(0, Math.min(23 * 60 + 59, Math.round(value)));
  const h = String(Math.floor(safe / 60)).padStart(2, "0");
  const m = String(safe % 60).padStart(2, "0");
  return `${h}:${m}`;
}

function createAutoDailyTemplates(params: {
  level: "N5" | "N4";
  strategy: "balanced" | "flashcard_first" | "kanji_first";
  dailyDeadlineTime: string;
}): Array<{
  slot: string;
  subject: string;
  task: string;
  startTime: string;
  deadlineTime: string;
  priority: DeadlineTaskPriority;
}> {
  const dayEndMinutes = toMinutes(params.dailyDeadlineTime);
  const reviewStart = fromMinutes(dayEndMinutes - 45);
  const finalStart = fromMinutes(dayEndMinutes + 10);

  if (params.strategy === "flashcard_first") {
    return [
      {
        slot: "Sáng",
        subject: `JP - Flashcard ${params.level}`,
        task: `Ôn 40 thẻ flashcard ${params.level} (mới + cũ)`,
        startTime: "08:30",
        deadlineTime: "09:20",
        priority: "high",
      },
      {
        slot: "Chiều/Tối",
        subject: `JP - Kanji ${params.level}`,
        task: `Kanji ${params.level}: 12 chữ + đọc âm On/Kun`,
        startTime: reviewStart,
        deadlineTime: params.dailyDeadlineTime,
        priority: "high",
      },
      {
        slot: "Tối",
        subject: "JP - Tổng kết",
        task: "Lọc 10 thẻ sai trong ngày và note nhanh 3 dòng",
        startTime: finalStart,
        deadlineTime: fromMinutes(dayEndMinutes + 45),
        priority: "medium",
      },
    ];
  }

  if (params.strategy === "kanji_first") {
    return [
      {
        slot: "Sáng",
        subject: `JP - Kanji ${params.level}`,
        task: `Kanji ${params.level}: 15 chữ + viết tay 3 lần`,
        startTime: "08:15",
        deadlineTime: "09:20",
        priority: "high",
      },
      {
        slot: "Chiều/Tối",
        subject: `JP - Flashcard ${params.level}`,
        task: `Ôn 35 thẻ flashcard ${params.level} + phát âm`,
        startTime: reviewStart,
        deadlineTime: params.dailyDeadlineTime,
        priority: "high",
      },
      {
        slot: "Tối",
        subject: "JP - Tổng kết",
        task: "Làm deck mini 8 từ khó + ôn lại nghĩa Hán Việt",
        startTime: finalStart,
        deadlineTime: fromMinutes(dayEndMinutes + 45),
        priority: "medium",
      },
    ];
  }

  return [
    {
      slot: "Sáng",
      subject: `JP - Flashcard ${params.level}`,
      task: `Ôn 30 thẻ flashcard ${params.level}`,
      startTime: "08:30",
      deadlineTime: "09:20",
      priority: "high",
    },
    {
      slot: "Chiều/Tối",
      subject: `JP - Kanji ${params.level}`,
      task: `Kanji ${params.level}: 12 chữ + ví dụ từ liên quan`,
      startTime: reviewStart,
      deadlineTime: params.dailyDeadlineTime,
      priority: "high",
    },
    {
      slot: "Tối",
      subject: "JP - Tổng kết",
      task: "Ôn lại flashcard sai + đánh dấu từ cần học lại",
      startTime: finalStart,
      deadlineTime: fromMinutes(dayEndMinutes + 45),
      priority: "medium",
    },
  ];
}

export async function saveLearningPlanAction(formData: FormData) {
  const user = await requireUser();
  const parsed = learningPlanSchema.safeParse({
    goalLevel: formData.get("goalLevel"),
    targetDate: formData.get("targetDate"),
    dailyMinutes: formData.get("dailyMinutes"),
    autoEnabled: formData.get("autoEnabled") ?? "",
    manualEnabled: formData.get("manualEnabled") ?? "",
    autoMinutes: formData.get("autoMinutes"),
    manualMinutes: formData.get("manualMinutes"),
    autoStrategy: formData.get("autoStrategy"),
    manualFocus: formData.get("manualFocus"),
    dailyDeadlineTime: formData.get("dailyDeadlineTime"),
    weeklyDeadlineDay: formData.get("weeklyDeadlineDay"),
    weeklyTargetSessions: formData.get("weeklyTargetSessions"),
    monthlyDeadlineDay: formData.get("monthlyDeadlineDay"),
    monthlyTargetSessions: formData.get("monthlyTargetSessions"),
  });
  if (!parsed.success) {
    return;
  }

  const autoEnabledRaw = String(parsed.data.autoEnabled ?? "").toLowerCase();
  const manualEnabledRaw = String(parsed.data.manualEnabled ?? "").toLowerCase();
  const autoEnabled = autoEnabledRaw === "on" || autoEnabledRaw === "true";
  const manualEnabled = manualEnabledRaw === "on" || manualEnabledRaw === "true";
  const autoMinutes = autoEnabled ? parsed.data.autoMinutes : 0;
  const manualMinutes = manualEnabled ? parsed.data.manualMinutes : 0;
  const combinedDailyMinutes = Math.max(
    10,
    Math.min(240, autoMinutes + manualMinutes || parsed.data.dailyMinutes)
  );

  const state = await loadUserPersonalState(user.id);
  state.plan = {
    goalLevel: parsed.data.goalLevel,
    targetDate: parsed.data.targetDate,
    dailyMinutes: combinedDailyMinutes,
    autoEnabled,
    manualEnabled,
    autoMinutes,
    manualMinutes,
    autoStrategy: parsed.data.autoStrategy,
    manualFocus: parsed.data.manualFocus ?? "",
    dailyDeadlineTime: parsed.data.dailyDeadlineTime,
    weeklyDeadlineDay: parsed.data.weeklyDeadlineDay,
    weeklyTargetSessions: parsed.data.weeklyTargetSessions,
    monthlyDeadlineDay: parsed.data.monthlyDeadlineDay,
    monthlyTargetSessions: parsed.data.monthlyTargetSessions,
    updatedAt: new Date().toISOString(),
  };

  await saveUserPersonalState(user.id, state);
  revalidatePath("/personal");
  revalidatePath("/dashboard");
}

export async function generateDeadlineBoardAction(formData: FormData) {
  const user = await requireUser();
  const parsed = boardGenerateSchema.safeParse({
    days: formData.get("days"),
  });
  if (!parsed.success) {
    return;
  }

  const state = await loadUserPersonalState(user.id);
  const plan = state.plan;
  const studyLevel: "N5" | "N4" = plan?.goalLevel === "N4" ? "N4" : "N5";
  const strategy = plan?.autoStrategy ?? "balanced";
  const dailyDeadlineTime = plan?.dailyDeadlineTime ?? "21:30";
  const templates = createAutoDailyTemplates({
    level: studyLevel,
    strategy,
    dailyDeadlineTime,
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endDate = toIsoDateLocal(addDays(today, parsed.data.days - 1));
  const startDate = toIsoDateLocal(today);

  const existingAutoMap = new Map<string, (typeof state.deadlineTasks)[number]>(
    state.deadlineTasks
      .filter((task) => task.mode === "auto")
      .map((task) => [`${task.date}|${task.slot}|${task.task}`, task])
  );

  const keepTasks = state.deadlineTasks.filter(
    (task) => task.mode === "manual" || task.date < startDate || task.date > endDate
  );

  let nextState = {
    ...state,
    deadlineTasks: keepTasks,
  };

  for (let i = 0; i < parsed.data.days; i += 1) {
    const date = addDays(today, i);
    const isoDate = toIsoDateLocal(date);

    for (const template of templates) {
      const key = `${isoDate}|${template.slot}|${template.task}`;
      const previous = existingAutoMap.get(key);

      nextState = upsertDeadlineTask(nextState, {
        id: previous?.id ?? crypto.randomUUID(),
        date: isoDate,
        slot: template.slot,
        subject: template.subject,
        task: template.task,
        startTime: template.startTime,
        deadlineTime: template.deadlineTime,
        priority: template.priority,
        status: previous?.status ?? "pending",
        note: previous?.note ?? "",
        mode: "auto",
        createdAt: previous?.createdAt,
      });
    }
  }

  await saveUserPersonalState(user.id, nextState);
  revalidatePath("/personal");
}

export async function updateDeadlineTaskAction(formData: FormData) {
  const user = await requireUser();
  const parsed = deadlineTaskUpdateSchema.safeParse({
    taskId: formData.get("taskId"),
    status: formData.get("status"),
    note: formData.get("note"),
  });
  if (!parsed.success) {
    return;
  }

  const state = await loadUserPersonalState(user.id);
  const existing = state.deadlineTasks.find((task) => task.id === parsed.data.taskId);
  if (!existing) {
    return;
  }

  const nextState = upsertDeadlineTask(state, {
    ...existing,
    status: (parsed.data.status ?? existing.status) as DeadlineTaskStatus,
    note: parsed.data.note ?? existing.note ?? "",
  });

  await saveUserPersonalState(user.id, nextState);
  revalidatePath("/personal");
}

export async function addManualDeadlineTaskAction(formData: FormData) {
  const user = await requireUser();
  const parsed = manualTaskSchema.safeParse({
    date: formData.get("date"),
    slot: formData.get("slot"),
    subject: formData.get("subject"),
    task: formData.get("task"),
    startTime: formData.get("startTime"),
    deadlineTime: formData.get("deadlineTime"),
    priority: formData.get("priority"),
  });
  if (!parsed.success) {
    return;
  }

  const state = await loadUserPersonalState(user.id);
  const nextState = upsertDeadlineTask(state, {
    id: crypto.randomUUID(),
    date: parsed.data.date,
    slot: parsed.data.slot,
    subject: parsed.data.subject,
    task: parsed.data.task,
    startTime: parsed.data.startTime,
    deadlineTime: parsed.data.deadlineTime,
    priority: parsed.data.priority as DeadlineTaskPriority,
    status: "pending",
    note: "",
    mode: "manual",
  });

  await saveUserPersonalState(user.id, nextState);
  revalidatePath("/personal");
}

export async function deleteDeadlineTaskAction(formData: FormData) {
  const user = await requireUser();
  const parsed = deleteTaskSchema.safeParse({
    taskId: formData.get("taskId"),
  });
  if (!parsed.success) {
    return;
  }

  const state = await loadUserPersonalState(user.id);
  const nextState = removeDeadlineTask(state, parsed.data.taskId);
  await saveUserPersonalState(user.id, nextState);
  revalidatePath("/personal");
}

export async function saveReminderSettingsAction(formData: FormData) {
  const user = await requireUser();
  const parsed = reminderSchema.safeParse({
    enabled: formData.get("enabled") ?? "",
    hour: formData.get("hour"),
    minute: formData.get("minute"),
    timezone: formData.get("timezone"),
  });
  if (!parsed.success) {
    return;
  }

  const enabledRaw = String(parsed.data.enabled ?? "").toLowerCase();
  const enabled = enabledRaw === "on" || enabledRaw === "true";

  const state = await loadUserPersonalState(user.id);
  state.reminders = {
    enabled,
    hour: parsed.data.hour,
    minute: parsed.data.minute,
    timezone: parsed.data.timezone,
    updatedAt: new Date().toISOString(),
  };

  await saveUserPersonalState(user.id, state);
  revalidatePath("/personal");
}

export async function toggleBookmarkAction(formData: FormData) {
  const user = await requireUser();
  const parsed = bookmarkSchema.safeParse({
    type: formData.get("type"),
    refId: formData.get("refId"),
    title: formData.get("title"),
    subtitle: formData.get("subtitle"),
    returnTo: formData.get("returnTo"),
  });
  if (!parsed.success) {
    return;
  }

  const state = await loadUserPersonalState(user.id);
  const next = upsertBookmark(state, {
    type: parsed.data.type,
    refId: parsed.data.refId,
    title: parsed.data.title,
    subtitle: parsed.data.subtitle,
  });
  await saveUserPersonalState(user.id, next.state);

  const returnTo = parsed.data.returnTo?.trim();
  if (returnTo) {
    revalidatePath(returnTo);
  }
  revalidatePath("/personal");
}

export async function saveBookmarkNoteAction(formData: FormData) {
  const user = await requireUser();
  const parsed = bookmarkNoteSchema.safeParse({
    bookmarkId: formData.get("bookmarkId"),
    note: formData.get("note"),
    returnTo: formData.get("returnTo"),
  });
  if (!parsed.success) {
    return;
  }

  const state = await loadUserPersonalState(user.id);
  const nextState = saveBookmarkNote(state, parsed.data.bookmarkId, parsed.data.note);
  await saveUserPersonalState(user.id, nextState);

  const returnTo = parsed.data.returnTo?.trim();
  if (returnTo) {
    revalidatePath(returnTo);
  }
  revalidatePath("/personal");
}

export async function submitPlacementTestAction(formData: FormData) {
  const user = await requireUser();
  const selectedAnswers = parsePlacementAnswers(formData);

  const submittedIds = Array.from(
    new Set(
      formData
        .getAll("questionIds")
        .map((item) => String(item))
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );

  if (submittedIds.length === 0) {
    redirect("/placement?status=empty");
  }

  const answerMap = new Map(selectedAnswers.map((item) => [item.questionId, item.selected]));
  const questions = await prisma.quizQuestion.findMany({
    where: { id: { in: submittedIds } },
    select: {
      id: true,
      level: true,
      correctOption: true,
    },
  });

  if (questions.length === 0) {
    redirect("/placement?status=empty");
  }

  let score = 0;
  const byLevel = new Map<JlptLevel, { correct: number; total: number }>();

  for (const level of JLPT_LEVELS) {
    byLevel.set(level, { correct: 0, total: 0 });
  }

  for (const question of questions) {
    const normalizedLevel = normalizeJlptLevel(question.level);
    const levelStat = byLevel.get(normalizedLevel) ?? { correct: 0, total: 0 };
    levelStat.total += 1;

    const selected = answerMap.get(question.id);
    const isCorrect = Boolean(selected) && selected === question.correctOption;
    if (isCorrect) {
      score += 1;
      levelStat.correct += 1;
    }

    byLevel.set(normalizedLevel, levelStat);
  }

  const breakdown: PlacementBreakdown[] = JLPT_LEVELS.map((level) => ({
    level,
    correct: byLevel.get(level)?.correct ?? 0,
    total: byLevel.get(level)?.total ?? 0,
  }));
  const recommendedLevel = inferRecommendedLevel(breakdown);

  const state = await loadUserPersonalState(user.id);
  state.placement = {
    score,
    total: questions.length,
    recommendedLevel,
    breakdown,
    createdAt: new Date().toISOString(),
  };

  await saveUserPersonalState(user.id, state);

  revalidatePath("/personal");
  revalidatePath("/placement");
  redirect(`/placement?score=${score}&total=${questions.length}&level=${recommendedLevel}`);
}

export async function applyPlacementLevelAction(formData: FormData) {
  const user = await requireUser();
  const parsed = applyLevelSchema.safeParse({
    level: formData.get("level"),
  });
  if (!parsed.success) {
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      level: parsed.data.level,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/personal");
  revalidatePath("/placement");
  redirect("/dashboard");
}

export async function importPersonalKanjiAction(
  _prevState: PersonalKanjiImportState,
  formData: FormData
): Promise<PersonalKanjiImportState> {
  const user = await requireUser();
  const parsed = importPersonalKanjiSchema.safeParse({
    rawInput: formData.get("rawInput"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Hãy nhập JSON Kanji hợp lệ.",
    };
  }

  const rows = parseKanjiInput(parsed.data.rawInput).slice(0, 1000);
  if (rows.length === 0) {
    return {
      status: "error",
      message: "Không parse được JSON Kanji. Hãy thử JSON array hoặc JSON-lines.",
    };
  }

  const { createdCount, updatedCount } = await upsertUserKanjiRows(user.id, rows);

  touchPersonalKanjiPaths();

  return {
    status: "success",
    message: `Đã lưu ${rows.length} Kanji cá nhân (${createdCount} mới, ${updatedCount} cập nhật).`,
  };
}

function touchPersonalKanjiPaths() {
  revalidatePath("/self-study");
  revalidatePath("/kanji");
  revalidatePath("/kanji/worksheet");
  revalidatePath("/kanji/learn");
  revalidatePath("/kanji/words/learn");
}

export async function deletePersonalKanjiAction(formData: FormData) {
  const user = await requireUser();
  const parsed = deletePersonalKanjiSchema.safeParse({
    id: formData.get("id"),
  });
  if (!parsed.success) {
    return;
  }

  const store = await loadUserKanjiStore(user.id);
  const nextItems = store.items.filter((item) => item.id !== parsed.data.id);
  if (nextItems.length === store.items.length) {
    return;
  }

  await saveUserKanjiStore(user.id, {
    updatedAt: new Date().toISOString(),
    items: nextItems,
  });
  touchPersonalKanjiPaths();
}

export async function clearPersonalKanjiAction() {
  const user = await requireUser();
  await saveUserKanjiStore(user.id, {
    updatedAt: new Date().toISOString(),
    items: [],
  });
  touchPersonalKanjiPaths();
}

