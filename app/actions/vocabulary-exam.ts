"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import {
  loadVocabularyExamStore,
  parseVocabularyExamInput,
  saveVocabularyExamStore,
} from "@/lib/vocabulary-exam-store";
import type { VocabularyExamTest } from "@/lib/vocabulary-exam-types";

export type VocabularyExamImportState = {
  status: "idle" | "success" | "error";
  message: string;
};

const importSchema = z.object({ rawInput: z.string().min(1) });
const deleteSchema = z.object({ testId: z.string().min(1) });

export async function importVocabularyExamTestsAction(
  _previousState: VocabularyExamImportState,
  formData: FormData
): Promise<VocabularyExamImportState> {
  const user = await requireUser();
  const parsed = importSchema.safeParse({ rawInput: formData.get("rawInput") });
  if (!parsed.success) {
    return { status: "error", message: "Hãy dán JSON hoặc chọn một file JSON trước." };
  }

  let tests: VocabularyExamTest[];
  try {
    tests = parseVocabularyExamInput(parsed.data.rawInput).slice(0, 100);
  } catch {
    return { status: "error", message: "JSON không hợp lệ hoặc chưa đúng cấu trúc đề từ vựng." };
  }

  if (tests.length === 0) {
    return {
      status: "error",
      message: "Không tìm thấy đề hợp lệ. Mỗi đề cần title, sections/questions, choices và correctAnswer.",
    };
  }

  const store = await loadVocabularyExamStore(user.id);
  const byId = new Map(store.tests.map((test) => [test.id, test]));
  const now = new Date().toISOString();
  for (const test of tests) {
    byId.set(test.id, {
      ...byId.get(test.id),
      ...test,
      createdAt: byId.get(test.id)?.createdAt ?? test.createdAt ?? now,
      updatedAt: now,
    });
  }

  await saveVocabularyExamStore(user.id, {
    updatedAt: now,
    tests: Array.from(byId.values()).sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "")),
  });
  revalidatePath("/luyen-de/tu-vung");

  return { status: "success", message: `Đã import ${tests.length} đề từ vựng vào tài khoản.` };
}

export async function deleteVocabularyExamTestAction(formData: FormData) {
  const user = await requireUser();
  const parsed = deleteSchema.safeParse({ testId: formData.get("testId") });
  if (!parsed.success) {
    return;
  }
  const store = await loadVocabularyExamStore(user.id);
  await saveVocabularyExamStore(user.id, {
    updatedAt: new Date().toISOString(),
    tests: store.tests.filter((test) => test.id !== parsed.data.testId),
  });
  revalidatePath("/luyen-de/tu-vung");
}
