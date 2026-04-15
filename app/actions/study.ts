"use server";

import { CardType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { awardXp } from "@/lib/progress";
import { prisma } from "@/lib/prisma";
import { calculateSrsUpdate, reviewXpByRating } from "@/lib/srs";
import { loadUserVocabStore, saveUserVocabStore } from "@/lib/vocab-store";

const addKanjiSchema = z.object({
  kanjiId: z.string().min(1),
});

const addVocabSchema = z.object({
  vocabId: z.string().min(1),
});

const addLibraryVocabSchema = z.object({
  word: z.string().trim().min(1),
  reading: z.string().trim().optional(),
  kanji: z.string().trim().optional(),
  hanviet: z.string().trim().optional(),
  meaning: z.string().trim().min(1),
  jlptLevel: z.string().trim().min(2).max(4).optional(),
  partOfSpeech: z.string().trim().optional(),
  targetDeck: z.string().trim().min(1),
  sourceId: z.string().trim().optional(),
  returnTo: z.string().trim().optional(),
});

const removeLibraryVocabSchema = z.object({
  word: z.string().trim().min(1),
  meaning: z.string().trim().optional(),
  targetDeck: z.string().trim().min(1),
  sourceId: z.string().trim().optional(),
  returnTo: z.string().trim().optional(),
});

const reviewSchema = z.object({
  reviewId: z.string().min(1),
  rating: z.enum(["again", "hard", "good", "easy"]),
});

export async function addKanjiToReviewAction(formData: FormData) {
  const user = await requireUser();

  const parsed = addKanjiSchema.safeParse({
    kanjiId: formData.get("kanjiId"),
  });

  if (!parsed.success) {
    return;
  }

  const existing = await prisma.review.findFirst({
    where: {
      userId: user.id,
      kanjiId: parsed.data.kanjiId,
    },
    select: { id: true },
  });

  if (!existing) {
    await prisma.review.create({
      data: {
        userId: user.id,
        cardType: CardType.KANJI,
        kanjiId: parsed.data.kanjiId,
        dueAt: new Date(),
      },
    });
  }

  revalidatePath("/kanji");
  revalidatePath("/review");
  revalidatePath("/dashboard");
}

export async function addVocabToReviewAction(formData: FormData) {
  const user = await requireUser();

  const parsed = addVocabSchema.safeParse({
    vocabId: formData.get("vocabId"),
  });

  if (!parsed.success) {
    return;
  }

  const existing = await prisma.review.findFirst({
    where: {
      userId: user.id,
      vocabId: parsed.data.vocabId,
    },
    select: { id: true },
  });

  if (!existing) {
    await prisma.review.create({
      data: {
        userId: user.id,
        cardType: CardType.VOCAB,
        vocabId: parsed.data.vocabId,
        dueAt: new Date(),
      },
    });
  }

  revalidatePath("/vocab");
  revalidatePath("/review");
  revalidatePath("/dashboard");
}

export async function addLibraryVocabToReviewAction(formData: FormData) {
  const user = await requireUser();

  const parsed = addLibraryVocabSchema.safeParse({
    word: formData.get("word"),
    reading: formData.get("reading"),
    kanji: formData.get("kanji"),
    hanviet: formData.get("hanviet"),
    meaning: formData.get("meaning"),
    jlptLevel: formData.get("jlptLevel"),
    partOfSpeech: formData.get("partOfSpeech"),
    targetDeck: formData.get("targetDeck"),
    sourceId: formData.get("sourceId"),
    returnTo: formData.get("returnTo"),
  });

  if (!parsed.success) {
    return { ok: false } as const;
  }

  const targetDeck = parsed.data.targetDeck.trim();
  if (!targetDeck.startsWith("lesson:")) {
    return { ok: false } as const;
  }
  const lessonId = targetDeck.slice("lesson:".length).trim();
  const store = await loadUserVocabStore(user.id);
  const lesson = store.lessons.find((entry) => entry.id === lessonId);

  if (lesson) {
    const existsInLesson = lesson.items.some((entry) => entry.word === parsed.data.word);
    if (!existsInLesson) {
      const now = new Date().toISOString();
      lesson.items.push({
        id: parsed.data.sourceId?.trim() || crypto.randomUUID(),
        word: parsed.data.word,
        reading: parsed.data.reading?.trim() || parsed.data.word,
        kanji: parsed.data.kanji?.trim() || "",
        hanviet: parsed.data.hanviet?.trim() || "",
        partOfSpeech: parsed.data.partOfSpeech?.trim() || "",
        meaning: parsed.data.meaning,
        createdAt: now,
        updatedAt: now,
      });
      lesson.updatedAt = now;
      await saveUserVocabStore(user.id, store);
    }
  }

  revalidatePath("/vocab");
  revalidatePath("/dashboard");
  return { ok: true } as const;
}

export async function removeLibraryVocabFromReviewAction(formData: FormData) {
  const user = await requireUser();

  const parsed = removeLibraryVocabSchema.safeParse({
    word: formData.get("word"),
    meaning: formData.get("meaning"),
    targetDeck: formData.get("targetDeck"),
    sourceId: formData.get("sourceId"),
    returnTo: formData.get("returnTo"),
  });

  if (!parsed.success) {
    return { ok: false } as const;
  }

  const targetDeck = parsed.data.targetDeck.trim();
  if (!targetDeck.startsWith("lesson:")) {
    return { ok: false } as const;
  }
  const lessonId = targetDeck.slice("lesson:".length).trim();
  const store = await loadUserVocabStore(user.id);
  const lesson = store.lessons.find((entry) => entry.id === lessonId);

  if (lesson) {
    const sourceId = parsed.data.sourceId?.trim();
    if (sourceId) {
      lesson.items = lesson.items.filter((item) => item.id !== sourceId);
    } else {
      const matchIndex = lesson.items.findIndex((item) => item.word === parsed.data.word);
      if (matchIndex >= 0) {
        lesson.items.splice(matchIndex, 1);
      }
    }
    lesson.updatedAt = new Date().toISOString();
    await saveUserVocabStore(user.id, store);
  }

  revalidatePath("/vocab");
  revalidatePath("/dashboard");
  return { ok: true } as const;
}

export async function submitReviewAction(formData: FormData) {
  const user = await requireUser();

  const parsed = reviewSchema.safeParse({
    reviewId: formData.get("reviewId"),
    rating: formData.get("rating"),
  });

  if (!parsed.success) {
    return;
  }

  const review = await prisma.review.findFirst({
    where: {
      id: parsed.data.reviewId,
      userId: user.id,
    },
    select: {
      id: true,
      repetitions: true,
      easeFactor: true,
      intervalDays: true,
    },
  });

  if (!review) {
    return;
  }

  const update = calculateSrsUpdate(review, parsed.data.rating);

  await prisma.review.update({
    where: { id: review.id },
    data: update,
  });

  await awardXp(user.id, reviewXpByRating[parsed.data.rating]);

  revalidatePath("/review");
  revalidatePath("/dashboard");
}
