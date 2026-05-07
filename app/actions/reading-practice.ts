"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import {
  loadReadingPracticeStore,
  saveReadingPracticeStore,
  type ReadingTextItem,
} from "@/lib/reading-practice-store";
import { parseReadingTextInput } from "@/lib/reading-text-import";

export type ReadingTextImportState = {
  status: "idle" | "success" | "error";
  message: string;
};

const importSchema = z.object({
  rawInput: z.string().min(1),
});

const deleteSchema = z.object({
  textId: z.string().min(1),
});

function nowIso(): string {
  return new Date().toISOString();
}

function touchReadingPaths() {
  revalidatePath("/self-study");
  revalidatePath("/self-study/reading");
}

export async function importReadingTextsAction(
  _prevState: ReadingTextImportState,
  formData: FormData
): Promise<ReadingTextImportState> {
  const user = await requireUser();

  const parsed = importSchema.safeParse({
    rawInput: formData.get("rawInput"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Vui lòng nhập JSON văn bản tiếng Nhật.",
    };
  }

  const rows = parseReadingTextInput(parsed.data.rawInput).slice(0, 200);
  if (rows.length === 0) {
    return {
      status: "error",
      message: "Không parse được JSON. Cần có title và content/paragraphs.",
    };
  }

  const store = await loadReadingPracticeStore(user.id);
  const now = nowIso();
  const nextItems: ReadingTextItem[] = rows.map((row) => ({
    id: row.id?.trim() || crypto.randomUUID(),
    title: row.title,
    jlptLevel: row.jlptLevel,
    topic: row.topic,
    difficulty: row.difficulty,
    estimatedMinutes: row.estimatedMinutes,
    paragraphs: row.paragraphs,
    translation: row.translation,
    vocabulary: row.vocabulary,
    questions: row.questions,
    createdAt: now,
    updatedAt: now,
  }));

  const existingById = new Map(store.items.map((item) => [item.id, item]));
  for (const item of nextItems) {
    existingById.set(item.id, {
      ...existingById.get(item.id),
      ...item,
      createdAt: existingById.get(item.id)?.createdAt ?? item.createdAt,
      updatedAt: now,
    });
  }

  await saveReadingPracticeStore(user.id, {
    updatedAt: now,
    items: Array.from(existingById.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  });
  touchReadingPaths();

  return {
    status: "success",
    message: `Đã import ${nextItems.length} bài đọc.`,
  };
}

export async function deleteReadingTextAction(formData: FormData) {
  const user = await requireUser();
  const parsed = deleteSchema.safeParse({
    textId: formData.get("textId"),
  });

  if (!parsed.success) {
    redirect("/self-study/reading");
  }

  const store = await loadReadingPracticeStore(user.id);
  store.items = store.items.filter((item) => item.id !== parsed.data.textId);
  await saveReadingPracticeStore(user.id, store);
  touchReadingPaths();
  redirect("/self-study/reading");
}
