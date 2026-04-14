"use server";

import { QuizOption } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { JLPT_LEVELS, normalizeJlptLevel, type JlptLevel } from "@/lib/admin-vocab-library";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  loadUserPersonalState,
  saveBookmarkNote,
  saveUserPersonalState,
  upsertBookmark,
  type PlacementBreakdown,
} from "@/lib/user-personal-data";

const learningPlanSchema = z.object({
  goalLevel: z.string().transform((value) => normalizeJlptLevel(value)),
  targetDate: z.string().min(1),
  dailyMinutes: z.coerce.number().int().min(10).max(180),
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

export async function saveLearningPlanAction(formData: FormData) {
  const user = await requireUser();
  const parsed = learningPlanSchema.safeParse({
    goalLevel: formData.get("goalLevel"),
    targetDate: formData.get("targetDate"),
    dailyMinutes: formData.get("dailyMinutes"),
  });
  if (!parsed.success) {
    return;
  }

  const state = await loadUserPersonalState(user.id);
  state.plan = {
    goalLevel: parsed.data.goalLevel,
    targetDate: parsed.data.targetDate,
    dailyMinutes: parsed.data.dailyMinutes,
    updatedAt: new Date().toISOString(),
  };

  await saveUserPersonalState(user.id, state);
  revalidatePath("/personal");
  revalidatePath("/dashboard");
}

export async function saveReminderSettingsAction(formData: FormData) {
  const user = await requireUser();
  const parsed = reminderSchema.safeParse({
    enabled: formData.get("enabled"),
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

