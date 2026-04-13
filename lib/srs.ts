export type ReviewSnapshot = {
  repetitions: number;
  easeFactor: number;
  intervalDays: number;
};

export type ReviewRating = "again" | "hard" | "good" | "easy";

type ReviewUpdate = {
  repetitions: number;
  easeFactor: number;
  intervalDays: number;
  dueAt: Date;
  lastReviewedAt: Date;
};

const MIN_EASE_FACTOR = 1.3;
const DAY_MS = 24 * 60 * 60 * 1000;

function clampEaseFactor(value: number): number {
  return Math.max(MIN_EASE_FACTOR, Number(value.toFixed(2)));
}

function dueAfterMinutes(minutes: number): Date {
  return new Date(Date.now() + minutes * 60 * 1000);
}

function dueAfterDays(days: number): Date {
  return new Date(Date.now() + days * DAY_MS);
}

export function calculateSrsUpdate(
  review: ReviewSnapshot,
  rating: ReviewRating
): ReviewUpdate {
  let repetitions = review.repetitions;
  let easeFactor = review.easeFactor;
  let intervalDays = review.intervalDays;
  let dueAt = dueAfterMinutes(10);

  if (rating === "again") {
    repetitions = 0;
    intervalDays = 0;
    easeFactor = clampEaseFactor(easeFactor - 0.2);
    dueAt = dueAfterMinutes(10);
  }

  if (rating === "hard") {
    repetitions = Math.max(1, repetitions);
    intervalDays = Math.max(1, Math.round(Math.max(1, intervalDays) * 1.2));
    easeFactor = clampEaseFactor(easeFactor - 0.15);
    dueAt = dueAfterDays(intervalDays);
  }

  if (rating === "good") {
    repetitions += 1;
    if (repetitions === 1) {
      intervalDays = 1;
    } else if (repetitions === 2) {
      intervalDays = 3;
    } else {
      intervalDays = Math.max(1, Math.round(intervalDays * easeFactor));
    }
    easeFactor = clampEaseFactor(easeFactor + 0.05);
    dueAt = dueAfterDays(intervalDays);
  }

  if (rating === "easy") {
    repetitions += 1;
    if (repetitions <= 1) {
      intervalDays = 3;
    } else {
      intervalDays = Math.max(2, Math.round(intervalDays * easeFactor * 1.3));
    }
    easeFactor = clampEaseFactor(easeFactor + 0.1);
    dueAt = dueAfterDays(intervalDays);
  }

  return {
    repetitions,
    easeFactor,
    intervalDays,
    dueAt,
    lastReviewedAt: new Date(),
  };
}

export const reviewXpByRating: Record<ReviewRating, number> = {
  again: 1,
  hard: 2,
  good: 3,
  easy: 4,
};
