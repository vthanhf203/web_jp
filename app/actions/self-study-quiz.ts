"use server";

import { QuizOption } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin";
import { requireUser } from "@/lib/auth";
import { parseQuizInput } from "@/lib/quiz-import";
import { awardXp } from "@/lib/progress";
import { prisma } from "@/lib/prisma";

export type SelfStudyQuizImportState = {
  status: "idle" | "success" | "error";
  message: string;
};

const SELF_STUDY_PREFIX = "SELF::";
const FURIGANA_META_PATTERN = /\n?\[\[furigana:[\s\S]*?\]\]\s*$/;

const importSchema = z.object({
  rawInput: z.string().min(1),
  deckName: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .optional()
    .default("Tu hoc"),
});

const deleteDeckSchema = z.object({
  category: z.string().trim().min(1),
  returnTo: z.string().trim().optional().default("/self-study/quiz"),
});

function makeKey(level: string, category: string, prompt: string): string {
  return `${level.toUpperCase()}|||${category.trim().toLowerCase()}|||${prompt.trim().toLowerCase()}`;
}

function normalizeDeckCategory(deckName: string): string {
  const clean = deckName.trim().replace(/\s+/g, " ");
  return `${SELF_STUDY_PREFIX}${clean || "Tu hoc"}`;
}

function touchSelfStudyQuizPaths() {
  revalidatePath("/self-study");
  revalidatePath("/self-study/quiz");
}

function normalizeReturnTo(value: string): string {
  if (value.startsWith("/self-study")) {
    return value;
  }
  return "/self-study/quiz";
}

function withFuriganaMeta(
  explanation: string,
  readings: Partial<Record<QuizOption, string>>
): string {
  const cleanExplanation = explanation.replace(FURIGANA_META_PATTERN, "").trim();
  const cleanReadings = Object.fromEntries(
    Object.entries(readings)
      .map(([option, reading]) => [option, typeof reading === "string" ? reading.trim() : ""])
      .filter((entry): entry is [string, string] => Boolean(entry[1]))
  );

  if (Object.keys(cleanReadings).length === 0) {
    return cleanExplanation;
  }

  const meta = `[[furigana:${JSON.stringify(cleanReadings)}]]`;
  return cleanExplanation ? `${cleanExplanation}\n${meta}` : meta;
}

export async function importSelfStudyQuizAction(
  _prevState: SelfStudyQuizImportState,
  formData: FormData
): Promise<SelfStudyQuizImportState> {
  await requireAdmin();

  const parsed = importSchema.safeParse({
    rawInput: formData.get("rawInput"),
    deckName: formData.get("deckName"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Du lieu import chua hop le.",
    };
  }

  const rows = parseQuizInput(parsed.data.rawInput).slice(0, 500);
  if (rows.length === 0) {
    return {
      status: "error",
      message: "Khong parse duoc JSON/CSV. Kiem tra lai dinh dang.",
    };
  }

  const forcedCategory = normalizeDeckCategory(parsed.data.deckName);
  const normalizedRows = rows.map((row) => ({ ...row, category: forcedCategory }));
  const dedupedRows = Array.from(
    new Map(normalizedRows.map((row) => [makeKey(row.level, row.category, row.prompt), row])).values()
  );

  const existing = await prisma.quizQuestion.findMany({
    where: {
      OR: dedupedRows.map((row) => ({
        level: row.level,
        category: row.category,
        prompt: row.prompt,
      })),
    },
    select: {
      level: true,
      category: true,
      prompt: true,
    },
  });
  const existingKeySet = new Set(existing.map((row) => makeKey(row.level, row.category, row.prompt)));

  let createdCount = 0;
  let updatedCount = 0;

  for (const row of dedupedRows) {
    const key = makeKey(row.level, row.category, row.prompt);
    const explanation = withFuriganaMeta(row.explanation, row.optionReadings);
    if (existingKeySet.has(key)) {
      await prisma.quizQuestion.updateMany({
        where: {
          level: row.level,
          category: row.category,
          prompt: row.prompt,
        },
        data: {
          optionA: row.optionA,
          optionB: row.optionB,
          optionC: row.optionC,
          optionD: row.optionD,
          correctOption: row.correctOption,
          explanation,
        },
      });
      updatedCount += 1;
      continue;
    }

    await prisma.quizQuestion.create({
      data: {
        level: row.level,
        category: row.category,
        prompt: row.prompt,
        optionA: row.optionA,
        optionB: row.optionB,
        optionC: row.optionC,
        optionD: row.optionD,
        correctOption: row.correctOption,
        explanation,
      },
    });
    existingKeySet.add(key);
    createdCount += 1;
  }

  touchSelfStudyQuizPaths();
  return {
    status: "success",
    message: `Da xu ly ${dedupedRows.length} cau hoi (${createdCount} moi, ${updatedCount} cap nhat).`,
  };
}

export async function deleteSelfStudyQuizDeckAction(formData: FormData) {
  await requireAdmin();

  const parsed = deleteDeckSchema.safeParse({
    category: formData.get("category"),
    returnTo: formData.get("returnTo"),
  });
  if (!parsed.success || !parsed.data.category.startsWith(SELF_STUDY_PREFIX)) {
    redirect("/self-study/quiz");
  }

  await prisma.quizQuestion.deleteMany({
    where: {
      category: parsed.data.category,
    },
  });
  touchSelfStudyQuizPaths();
  redirect(normalizeReturnTo(parsed.data.returnTo));
}

function isQuizOption(value: string): value is QuizOption {
  return value === "A" || value === "B" || value === "C" || value === "D";
}

function parseSubmittedAnswers(formData: FormData): Array<{ questionId: string; selected: QuizOption }> {
  return Array.from(formData.entries())
    .filter(
      (entry): entry is [string, string] =>
        entry[0].startsWith("q_") && typeof entry[1] === "string"
    )
    .map(([key, value]) => ({
      questionId: key.replace("q_", ""),
      selected: value,
    }))
    .filter((item): item is { questionId: string; selected: QuizOption } => isQuizOption(item.selected));
}

function parseSubmittedQuestionIds(formData: FormData): string[] {
  return Array.from(
    new Set(
      formData
        .getAll("questionIds")
        .map((item) => String(item))
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

export async function submitSelfStudyQuizAction(formData: FormData) {
  const user = await requireUser();
  const selectedAnswers = parseSubmittedAnswers(formData);
  const submittedQuestionIds = parseSubmittedQuestionIds(formData);
  const category = String(formData.get("category") ?? "").trim();

  if (selectedAnswers.length === 0 && submittedQuestionIds.length === 0) {
    redirect(`/self-study/quiz?status=empty${category ? `&category=${encodeURIComponent(category)}` : ""}`);
  }

  const questionIds =
    submittedQuestionIds.length > 0
      ? submittedQuestionIds
      : selectedAnswers.map((item) => item.questionId);
  const answerMap = new Map(selectedAnswers.map((item) => [item.questionId, item.selected]));

  const questions = await prisma.quizQuestion.findMany({
    where: { id: { in: questionIds } },
    select: {
      id: true,
      correctOption: true,
    },
  });

  if (questions.length === 0) {
    redirect(`/self-study/quiz?status=empty${category ? `&category=${encodeURIComponent(category)}` : ""}`);
  }

  let score = 0;
  const answers = questions.map((question) => {
    const selected = answerMap.get(question.id);
    const selectedOption = selected ?? QuizOption.A;
    const isCorrect = Boolean(selected) && selectedOption === question.correctOption;
    if (isCorrect) {
      score += 1;
    }
    return {
      questionId: question.id,
      selectedOption,
      isCorrect,
    };
  });

  await prisma.quizAttempt.create({
    data: {
      userId: user.id,
      score,
      total: questions.length,
      answers: { create: answers },
    },
  });

  await awardXp(user.id, score * 2);
  touchSelfStudyQuizPaths();
  const base = `/self-study/quiz?score=${score}&total=${questions.length}`;
  redirect(category ? `${base}&category=${encodeURIComponent(category)}` : base);
}
