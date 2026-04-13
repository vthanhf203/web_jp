"use server";

import { CardType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { awardXp } from "@/lib/progress";
import { prisma } from "@/lib/prisma";
import { calculateSrsUpdate, reviewXpByRating } from "@/lib/srs";

const addKanjiSchema = z.object({
  kanjiId: z.string().min(1),
});

const addVocabSchema = z.object({
  vocabId: z.string().min(1),
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
