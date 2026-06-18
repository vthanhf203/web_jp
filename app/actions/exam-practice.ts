"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { loadExamPracticeStore, parseExamPracticeInput, saveExamPracticeStore } from "@/lib/exam-practice-store";
import type { ExamPracticeTest } from "@/lib/exam-practice-types";

export type ExamPracticeImportState = {
  status: "idle" | "success" | "error";
  message: string;
};

const importSchema = z.object({
  rawInput: z.string().min(1),
});

const deleteSchema = z.object({
  testId: z.string().min(1),
});

function nowIso(): string {
  return new Date().toISOString();
}

export async function importExamPracticeTestsAction(
  _prevState: ExamPracticeImportState,
  formData: FormData
): Promise<ExamPracticeImportState> {
  const user = await requireUser();
  const parsed = importSchema.safeParse({
    rawInput: formData.get("rawInput"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Vui lòng nhập JSON đề thi.",
    };
  }

  let tests: ExamPracticeTest[] = [];
  try {
    tests = parseExamPracticeInput(parsed.data.rawInput).slice(0, 100);
  } catch {
    return {
      status: "error",
      message: "JSON chưa đúng định dạng. Cần có title và sections/questions.",
    };
  }

  if (tests.length === 0) {
    return {
      status: "error",
      message: "Không tìm thấy đề hợp lệ. Cần có title và ít nhất 1 câu hỏi.",
    };
  }

  const store = await loadExamPracticeStore(user.id);
  const now = nowIso();
  const byId = new Map(store.tests.map((test) => [test.id, test]));

  for (const test of tests) {
    byId.set(test.id, {
      ...byId.get(test.id),
      ...test,
      createdAt: byId.get(test.id)?.createdAt ?? test.createdAt,
      updatedAt: now,
    });
  }

  await saveExamPracticeStore(user.id, {
    updatedAt: now,
    tests: Array.from(byId.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  });
  revalidatePath("/luyen-de");

  return {
    status: "success",
    message: `Đã import ${tests.length} đề vào mục Luyện Đề.`,
  };
}

export async function deleteExamPracticeTestAction(formData: FormData) {
  const user = await requireUser();
  const parsed = deleteSchema.safeParse({
    testId: formData.get("testId"),
  });

  if (!parsed.success) {
    return;
  }

  const store = await loadExamPracticeStore(user.id);
  const nextTests = store.tests.filter((test) => test.id !== parsed.data.testId);

  await saveExamPracticeStore(user.id, {
    updatedAt: nowIso(),
    tests: nextTests,
  });
  revalidatePath("/luyen-de");
}
