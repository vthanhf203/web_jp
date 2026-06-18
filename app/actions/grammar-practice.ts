"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { parseGrammarPracticeInput, parseGrammarPracticeQuizDeckInput } from "@/lib/grammar-practice-import";
import {
  DEFAULT_GRAMMAR_DECK_NAME,
  loadGrammarPracticeStore,
  saveGrammarPracticeStore,
  type GrammarPracticeItem,
  type GrammarPracticeQuizDeck,
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

const deleteQuizDeckSchema = z.object({
  deckId: z.string().min(1),
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
      message: "Vui lòng nhập JSON ngữ pháp.",
    };
  }

  const rows = parseGrammarPracticeInput(parsed.data.rawInput).slice(0, 300);
  const quizDeckRows = parseGrammarPracticeQuizDeckInput(parsed.data.rawInput).slice(0, 80);
  if (rows.length === 0 && quizDeckRows.length === 0) {
    return {
      status: "error",
      message: "Không parse được JSON. Cần có pattern/title và meaning, hoặc quiz deck có items/questions.",
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
  const nextQuizDecks: GrammarPracticeQuizDeck[] = quizDeckRows.map((deck) => ({
    id: deck.id?.trim() || crypto.randomUUID(),
    deckName: selectedDeckName || deck.deckName || "Quiz ôn ngữ pháp",
    jlptLevel: deck.jlptLevel,
    quizType: deck.quizType,
    topic: deck.topic,
    estimatedMinutes: deck.estimatedMinutes,
    sourceGrammarIds: deck.sourceGrammarIds,
    instructionsVi: deck.instructionsVi,
    items: deck.items,
    reviewConfig: deck.reviewConfig,
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
  const existingQuizDecksById = new Map(store.quizDecks.map((deck) => [deck.id, deck]));
  for (const deck of nextQuizDecks) {
    existingQuizDecksById.set(deck.id, {
      ...existingQuizDecksById.get(deck.id),
      ...deck,
      createdAt: existingQuizDecksById.get(deck.id)?.createdAt ?? deck.createdAt,
      updatedAt: now,
    });
  }

  await saveGrammarPracticeStore(user.id, {
    updatedAt: now,
    items: Array.from(existingById.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    quizDecks: Array.from(existingQuizDecksById.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  });
  touchGrammarPaths();

  const messages = [];
  if (nextItems.length > 0) {
    messages.push(
      `${nextItems.length} mẫu ngữ pháp vào mục "${selectedDeckName || nextItems[0]?.deckName || DEFAULT_GRAMMAR_DECK_NAME}"`
    );
  }
  if (nextQuizDecks.length > 0) {
    const questionCount = nextQuizDecks.reduce((sum, deck) => sum + deck.items.length, 0);
    messages.push(`${nextQuizDecks.length} bộ quiz (${questionCount} câu)`);
  }

  return {
    status: "success",
    message: `Đã import ${messages.join(" và ")}.`,
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

export async function deleteGrammarPracticeQuizDeckAction(formData: FormData) {
  const user = await requireUser();
  const parsed = deleteQuizDeckSchema.safeParse({
    deckId: formData.get("deckId"),
  });
  if (!parsed.success) {
    redirect("/self-study/grammar");
  }

  const store = await loadGrammarPracticeStore(user.id);
  store.quizDecks = store.quizDecks.filter((deck) => deck.id !== parsed.data.deckId);
  await saveGrammarPracticeStore(user.id, store);
  touchGrammarPaths();
  redirect("/self-study/grammar");
}
