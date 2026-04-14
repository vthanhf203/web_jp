"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin";
import { normalizeJlptLevel } from "@/lib/admin-vocab-library";
import { prisma } from "@/lib/prisma";
import { parseQuizInput } from "@/lib/quiz-import";

export type AdminQuizImportState = {
  status: "idle" | "success" | "error";
  message: string;
};

const importQuizSchema = z.object({
  rawInput: z.string().min(1),
});

const clearQuizSchema = z.object({
  level: z.preprocess((value) => normalizeJlptLevel(value), z.string().min(1)),
  category: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : ""),
    z.string().max(80)
  ),
});

const deleteQuizSchema = z.object({
  questionId: z.string().min(1),
  level: z.preprocess((value) => normalizeJlptLevel(value), z.string().min(1)),
});

function makeKey(level: string, category: string, prompt: string): string {
  return `${level.toUpperCase()}|||${category.trim().toLowerCase()}|||${prompt
    .trim()
    .toLowerCase()}`;
}

function touchQuizPaths() {
  revalidatePath("/admin");
  revalidatePath("/admin/quiz");
  revalidatePath("/quiz");
  revalidatePath("/placement");
  revalidatePath("/focus");
  revalidatePath("/dashboard");
}

export async function importAdminQuizQuestionsAction(
  _prevState: AdminQuizImportState,
  formData: FormData
): Promise<AdminQuizImportState> {
  await requireAdmin();

  const parsed = importQuizSchema.safeParse({
    rawInput: formData.get("rawInput"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Hay nhap du lieu bai tap hop le.",
    };
  }

  const rows = parseQuizInput(parsed.data.rawInput).slice(0, 500);
  if (rows.length === 0) {
    return {
      status: "error",
      message: "Khong parse duoc du lieu. Hay thu JSON, JSON-lines hoac CSV.",
    };
  }

  const dedupedRows = Array.from(
    new Map(
      rows.map((row) => [makeKey(row.level, row.category, row.prompt), row])
    ).values()
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
  const existingKeySet = new Set(
    existing.map((row) => makeKey(row.level, row.category, row.prompt))
  );

  let createdCount = 0;
  let updatedCount = 0;

  for (const row of dedupedRows) {
    const key = makeKey(row.level, row.category, row.prompt);
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
          explanation: row.explanation,
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
        explanation: row.explanation,
      },
    });
    existingKeySet.add(key);
    createdCount += 1;
  }

  touchQuizPaths();
  return {
    status: "success",
    message: `Da xu ly ${dedupedRows.length} bai tap (${createdCount} moi, ${updatedCount} cap nhat).`,
  };
}

export async function clearAdminQuizQuestionsAction(formData: FormData) {
  await requireAdmin();

  const parsed = clearQuizSchema.safeParse({
    level: formData.get("level"),
    category: formData.get("category"),
  });
  if (!parsed.success) {
    return;
  }

  const where =
    parsed.data.category.length > 0
      ? { level: parsed.data.level, category: parsed.data.category }
      : { level: parsed.data.level };

  await prisma.quizQuestion.deleteMany({ where });
  touchQuizPaths();
  redirect(`/admin/quiz?level=${parsed.data.level}`);
}

export async function deleteAdminQuizQuestionAction(formData: FormData) {
  await requireAdmin();

  const parsed = deleteQuizSchema.safeParse({
    questionId: formData.get("questionId"),
    level: formData.get("level"),
  });
  if (!parsed.success) {
    return;
  }

  await prisma.quizQuestion.deleteMany({
    where: { id: parsed.data.questionId },
  });
  touchQuizPaths();
  redirect(`/admin/quiz?level=${parsed.data.level}`);
}

