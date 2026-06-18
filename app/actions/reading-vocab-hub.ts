"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { loadReadingVocabStore } from "@/lib/reading-vocab-store";
import { loadUserVocabStore, saveUserVocabStore, type LessonItem } from "@/lib/vocab-store";

const studyFromReadingSchema = z.object({
  textId: z.string().min(1),
  mode: z.enum(["flashcard", "quiz", "recall"]).default("flashcard"),
});

function nowIso(): string {
  return new Date().toISOString();
}

function clampTitle(input: string, max = 64): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return "Tu bai doc";
  }
  return trimmed.length <= max ? trimmed : trimmed.slice(0, max).trim();
}

function normalizeReadingLessonItems(
  vocabulary: Array<{
    word: string;
    reading: string;
    meaning: string;
    hanviet?: string;
    partOfSpeech?: string;
  }>
): LessonItem[] {
  const now = nowIso();
  const unique = new Map<string, LessonItem>();

  for (const word of vocabulary) {
    const sourceWord = word.word.trim();
    const meaning = word.meaning.trim();
    if (!sourceWord || !meaning) {
      continue;
    }

    const reading = word.reading.trim();
    const lessonWord = reading || sourceWord;
    const lessonReading = reading || sourceWord;
    const lessonKanji = reading && sourceWord !== reading ? sourceWord : "";

    const key = `${sourceWord}\u0000${lessonReading}\u0000${meaning}`.toLowerCase();
    if (unique.has(key)) {
      continue;
    }

    unique.set(key, {
      id: crypto.randomUUID(),
      word: lessonWord,
      reading: lessonReading,
      kanji: lessonKanji,
      hanviet: word.hanviet?.trim() ?? "",
      partOfSpeech: word.partOfSpeech?.trim() ?? "",
      meaning,
      createdAt: now,
      updatedAt: now,
    });
  }

  return Array.from(unique.values());
}

export async function startReadingVocabStudyFromHubAction(formData: FormData) {
  const user = await requireUser();
  const parsed = studyFromReadingSchema.safeParse({
    textId: formData.get("textId"),
    mode: formData.get("mode"),
  });

  if (!parsed.success) {
    redirect("/reading-vocab");
  }

  const readingStore = await loadReadingVocabStore(user.id);
  const selectedText = readingStore.items.find((item) => item.id === parsed.data.textId);
  if (!selectedText) {
    redirect("/reading-vocab");
  }

  const lessonItems = normalizeReadingLessonItems(selectedText.vocabulary);
  if (lessonItems.length === 0) {
    redirect(`/reading-vocab?text=${encodeURIComponent(selectedText.id)}`);
  }

  const vocabStore = await loadUserVocabStore(user.id);
  const now = nowIso();
  const lessonId = crypto.randomUUID();

  vocabStore.lessons.push({
    id: lessonId,
    title: clampTitle(`Doc: ${selectedText.title}`),
    createdAt: now,
    updatedAt: now,
    items: lessonItems,
  });

  await saveUserVocabStore(user.id, vocabStore);
  revalidatePath("/reading-vocab");
  revalidatePath("/self-study/vocab");
  revalidatePath("/vocab");
  redirect(`/vocab/learn?lesson=${encodeURIComponent(lessonId)}&mode=${parsed.data.mode}`);
}
