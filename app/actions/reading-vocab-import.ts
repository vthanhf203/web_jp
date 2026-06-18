"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { DEFAULT_READING_DECK_NAME, type ReadingTextItem } from "@/lib/reading-practice-store";
import { parseReadingTextInput } from "@/lib/reading-text-import";
import { loadReadingVocabStore, saveReadingVocabStore } from "@/lib/reading-vocab-store";

export type ReadingVocabImportState = {
  status: "idle" | "success" | "error";
  message: string;
};

const importSchema = z.object({
  rawInput: z.string().min(1),
  deckName: z.string().trim().max(120).optional(),
});

const deleteSchema = z.object({
  textId: z.string().min(1),
});

function nowIso(): string {
  return new Date().toISOString();
}

export async function importReadingVocabTextsAction(
  _prevState: ReadingVocabImportState,
  formData: FormData
): Promise<ReadingVocabImportState> {
  const user = await requireUser();
  const parsed = importSchema.safeParse({
    rawInput: formData.get("rawInput"),
    deckName: formData.get("deckName"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Vui long nhap JSON bai doc.",
    };
  }

  const rows = parseReadingTextInput(parsed.data.rawInput).slice(0, 200);
  if (rows.length === 0) {
    return {
      status: "error",
      message: "Khong parse duoc JSON. Can co title va content/paragraphs.",
    };
  }

  const store = await loadReadingVocabStore(user.id);
  const now = nowIso();
  const selectedDeckName = parsed.data.deckName?.trim();
  const nextItems: ReadingTextItem[] = rows.map((row) => ({
    id: row.id?.trim() || crypto.randomUUID(),
    title: row.title,
    deckName: selectedDeckName || row.deckName || row.topic || DEFAULT_READING_DECK_NAME,
    jlptLevel: row.jlptLevel,
    topic: row.topic,
    difficulty: row.difficulty,
    estimatedMinutes: row.estimatedMinutes,
    paragraphs: row.paragraphs,
    translation: row.translation,
    vocabulary: row.vocabulary,
    grammarCoverage: row.grammarCoverage,
    questions: row.questions,
    postReadingQuiz: row.postReadingQuiz,
    sentenceRecallPractice: row.sentenceRecallPractice,
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

  await saveReadingVocabStore(user.id, {
    updatedAt: now,
    items: Array.from(existingById.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  });
  revalidatePath("/reading-vocab");

  return {
    status: "success",
    message: `Da import ${nextItems.length} bai doc vao kho tu vung bai doc rieng.`,
  };
}

export async function deleteReadingVocabTextAction(formData: FormData) {
  const user = await requireUser();
  const parsed = deleteSchema.safeParse({
    textId: formData.get("textId"),
  });

  if (!parsed.success) {
    redirect("/reading-vocab");
  }

  const store = await loadReadingVocabStore(user.id);
  const nextItems = store.items.filter((item) => item.id !== parsed.data.textId);
  await saveReadingVocabStore(user.id, {
    updatedAt: nowIso(),
    items: nextItems,
  });
  revalidatePath("/reading-vocab");

  const nextText = nextItems.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (nextText) {
    redirect(`/reading-vocab?text=${encodeURIComponent(nextText.id)}`);
  }
  redirect("/reading-vocab");
}
