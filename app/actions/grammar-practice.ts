"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { parseGrammarPracticeInput } from "@/lib/grammar-practice-import";
import {
  DEFAULT_GRAMMAR_DECK_NAME,
  loadGrammarPracticeStore,
  saveGrammarPracticeStore,
  type GrammarPracticeItem,
} from "@/lib/grammar-practice-store";

export type GrammarPracticeImportState = {
  status: "idle" | "success" | "error";
  message: string;
};

const importSchema = z.object({
  rawInput: z.string().min(1),
  deckName: z.string().trim().max(120).optional(),
});

const deleteSchema = z.object({
  itemId: z.string().min(1),
});

function nowIso(): string {
  return new Date().toISOString();
}

function touchGrammarPaths() {
  revalidatePath("/self-study");
  revalidatePath("/self-study/grammar");
}

export async function importGrammarPracticeAction(
  _prevState: GrammarPracticeImportState,
  formData: FormData
): Promise<GrammarPracticeImportState> {
  const user = await requireUser();
  const parsed = importSchema.safeParse({
    rawInput: formData.get("rawInput"),
    deckName: formData.get("deckName"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Vui long nhap JSON ngu phap.",
    };
  }

  const rows = parseGrammarPracticeInput(parsed.data.rawInput).slice(0, 300);
  if (rows.length === 0) {
    return {
      status: "error",
      message: "Khong parse duoc JSON. Can co pattern/title va meaning.",
    };
  }

  const now = nowIso();
  const selectedDeckName = parsed.data.deckName?.trim();
  const nextItems: GrammarPracticeItem[] = rows.map((row) => ({
    id: row.id?.trim() || crypto.randomUUID(),
    pattern: row.pattern,
    displayPattern: row.displayPattern,
    meaning: row.meaning,
    meaningShort: row.meaningShort,
    deckName: selectedDeckName || row.deckName || row.topic || DEFAULT_GRAMMAR_DECK_NAME,
    jlptLevel: row.jlptLevel,
    topic: row.topic,
    structure: row.structure,
    structureDetail: row.structureDetail,
    nuance: row.nuance,
    nuanceUsage: row.nuanceUsage,
    confusablePatterns: row.confusablePatterns,
    notes: row.notes,
    examples: row.examples,
    distractors: row.distractors,
    quiz: row.quiz,
    review: row.review,
    createdAt: now,
    updatedAt: now,
  }));

  const store = await loadGrammarPracticeStore(user.id);
  const existingById = new Map(store.items.map((item) => [item.id, item]));
  for (const item of nextItems) {
    existingById.set(item.id, {
      ...existingById.get(item.id),
      ...item,
      createdAt: existingById.get(item.id)?.createdAt ?? item.createdAt,
      updatedAt: now,
    });
  }

  await saveGrammarPracticeStore(user.id, {
    updatedAt: now,
    items: Array.from(existingById.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  });
  touchGrammarPaths();

  return {
    status: "success",
    message: `Da import ${nextItems.length} mau ngu phap vao muc "${selectedDeckName || nextItems[0]?.deckName || DEFAULT_GRAMMAR_DECK_NAME}".`,
  };
}

export async function deleteGrammarPracticeItemAction(formData: FormData) {
  const user = await requireUser();
  const parsed = deleteSchema.safeParse({
    itemId: formData.get("itemId"),
  });
  if (!parsed.success) {
    redirect("/self-study/grammar");
  }

  const store = await loadGrammarPracticeStore(user.id);
  store.items = store.items.filter((item) => item.id !== parsed.data.itemId);
  await saveGrammarPracticeStore(user.id, store);
  touchGrammarPaths();
  redirect("/self-study/grammar");
}
