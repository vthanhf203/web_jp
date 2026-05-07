import { Rating, State, fsrs, type CardInput, type Grade } from "ts-fsrs";

export type ReviewSnapshot = {
  repetitions: number;
  easeFactor: number;
  intervalDays: number;
  dueAt: Date;
  lastReviewedAt: Date | null;
  fsrsState: number;
  fsrsStability: number;
  fsrsDifficulty: number;
  fsrsLearningSteps: number;
  fsrsLapses: number;
};

export type ReviewRating = "again" | "hard" | "good" | "easy";

type ReviewUpdate = {
  repetitions: number;
  easeFactor: number;
  intervalDays: number;
  fsrsState: number;
  fsrsStability: number;
  fsrsDifficulty: number;
  fsrsLearningSteps: number;
  fsrsLapses: number;
  dueAt: Date;
  lastReviewedAt: Date;
};

const scheduler = fsrs({
  request_retention: 0.9,
  maximum_interval: 36500,
  enable_fuzz: true,
  enable_short_term: true,
  learning_steps: ["1m", "10m"],
  relearning_steps: ["10m"],
});

const DAY_MS = 24 * 60 * 60 * 1000;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeState(review: ReviewSnapshot): State {
  const raw = review.fsrsState;
  if (raw === State.New || raw === State.Learning || raw === State.Review || raw === State.Relearning) {
    // Legacy rows may still have fsrsState=New while reps already > 0.
    if (raw === State.New && review.repetitions > 0) {
      return review.intervalDays > 0 ? State.Review : State.Learning;
    }
    return raw;
  }
  if (review.repetitions <= 0) {
    return State.New;
  }
  if (review.intervalDays > 0) {
    return State.Review;
  }
  return State.Learning;
}

function safeDate(value: Date | null | undefined, fallback: Date): Date {
  if (!value) {
    return fallback;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return fallback;
  }
  return date;
}

function buildCardFromReview(review: ReviewSnapshot, now: Date): CardInput {
  const state = normalizeState(review);
  const reps = Math.max(0, Math.trunc(review.repetitions || 0));
  const scheduledDays = Math.max(0, Math.trunc(review.intervalDays || 0));

  let stability = Number.isFinite(review.fsrsStability) ? review.fsrsStability : 0;
  let difficulty = Number.isFinite(review.fsrsDifficulty) ? review.fsrsDifficulty : 0;

  if ((state === State.Review || state === State.Relearning) && stability <= 0) {
    stability = Math.max(0.1, scheduledDays || 1);
  }

  if (state === State.Review || state === State.Relearning) {
    difficulty = clamp(difficulty > 0 ? difficulty : 5, 1, 10);
  } else {
    difficulty = clamp(difficulty, 0, 10);
  }

  const due = safeDate(review.dueAt, now);
  const fallbackLastReview =
    reps > 0 ? new Date(due.getTime() - Math.max(1, scheduledDays) * DAY_MS) : undefined;
  const lastReview =
    reps > 0 ? safeDate(review.lastReviewedAt, fallbackLastReview ?? now) : undefined;

  return {
    due,
    stability,
    difficulty,
    elapsed_days: 0,
    scheduled_days: scheduledDays,
    learning_steps: Math.max(0, Math.trunc(review.fsrsLearningSteps || 0)),
    reps,
    lapses: Math.max(0, Math.trunc(review.fsrsLapses || 0)),
    state,
    last_review: lastReview,
  };
}

function mapRatingToFsrs(rating: ReviewRating): Grade {
  if (rating === "again") {
    return Rating.Again;
  }
  if (rating === "hard") {
    return Rating.Hard;
  }
  if (rating === "easy") {
    return Rating.Easy;
  }
  return Rating.Good;
}

function toLegacyEaseFactor(difficulty: number, stability: number): number {
  const eased = 2.5 + stability / 35 - (difficulty - 5) / 8;
  return Number(clamp(eased, 1.3, 3.5).toFixed(2));
}

export function calculateSrsUpdate(
  review: ReviewSnapshot,
  rating: ReviewRating
): ReviewUpdate {
  const now = new Date();
  const card = buildCardFromReview(review, now);
  const result = scheduler.next(card, now, mapRatingToFsrs(rating));
  const next = result.card;

  return {
    repetitions: next.reps,
    easeFactor: toLegacyEaseFactor(next.difficulty, next.stability),
    intervalDays: next.scheduled_days,
    fsrsState: next.state,
    fsrsStability: Number(next.stability.toFixed(6)),
    fsrsDifficulty: Number(next.difficulty.toFixed(6)),
    fsrsLearningSteps: next.learning_steps,
    fsrsLapses: next.lapses,
    dueAt: next.due,
    lastReviewedAt: next.last_review ?? now,
  };
}

export const reviewXpByRating: Record<ReviewRating, number> = {
  again: 1,
  hard: 2,
  good: 3,
  easy: 4,
};
