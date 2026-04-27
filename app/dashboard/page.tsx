import { DashboardBentoClient } from "@/app/components/dashboard-bento-client";
import { loadAdminVocabLibrary } from "@/lib/admin-vocab-library";
import { requireUser } from "@/lib/auth";
import { toTokyoDateKey } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { loadUserPersonalState } from "@/lib/user-personal-data";

type LearningStep = {
  href: string;
  title: string;
  subtitle: string;
};

function getDateKeys(days: number): string[] {
  const keys: string[] = [];
  const now = new Date();
  for (let index = days - 1; index >= 0; index -= 1) {
    const date = new Date(now.getTime() - index * 24 * 60 * 60 * 1000);
    keys.push(toTokyoDateKey(date));
  }
  return keys;
}

function aggregateByDay(dates: Date[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const date of dates) {
    const key = toTokyoDateKey(date);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

function initialsFromName(name: string): string {
  const tokens = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (tokens.length === 0) {
    return "JP";
  }
  return tokens.map((token) => token[0]?.toUpperCase() ?? "").join("");
}

export default async function DashboardPage() {
  const user = await requireUser();

  const now = new Date();
  const last7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [kanjiCount, vocabCount, adminLibrary, personalState, reviews7d, reviews30d, quizAttempts30d, dueReviews, wrongAnswers] =
    await Promise.all([
      prisma.kanji.count(),
      prisma.vocab.count(),
      loadAdminVocabLibrary(),
      loadUserPersonalState(user.id),
      prisma.review.findMany({
        where: {
          userId: user.id,
          lastReviewedAt: { gte: last7 },
        },
        select: { lastReviewedAt: true },
      }),
      prisma.review.findMany({
        where: {
          userId: user.id,
          lastReviewedAt: { gte: last30 },
        },
        select: { lastReviewedAt: true },
      }),
      prisma.quizAttempt.findMany({
        where: {
          userId: user.id,
          createdAt: { gte: last30 },
        },
        select: {
          createdAt: true,
          score: true,
          total: true,
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      prisma.review.count({
        where: {
          userId: user.id,
          dueAt: { lte: now },
        },
      }),
      prisma.quizAnswer.count({
        where: {
          attempt: { userId: user.id },
          isCorrect: false,
        },
      }),
    ]);

  const reviewDates7d = reviews7d
    .map((entry) => entry.lastReviewedAt)
    .filter((value): value is Date => Boolean(value));
  const reviewDates30d = reviews30d
    .map((entry) => entry.lastReviewedAt)
    .filter((value): value is Date => Boolean(value));

  const reviewByDay7 = aggregateByDay(reviewDates7d);
  const keys7 = getDateKeys(7);
  const chart7 = keys7.map((key) => ({
    key,
    count: reviewByDay7.get(key) ?? 0,
  }));

  const max7 = Math.max(1, ...chart7.map((item) => item.count));

  const adminVocabCount = adminLibrary.lessons.reduce((sum, lesson) => sum + lesson.items.length, 0);
  const totalVocabCount = vocabCount + adminVocabCount;

  const quizTargetDays = 10;
  const quizDone = Math.min(quizAttempts30d.length, quizTargetDays);
  const quizGoalProgress = Math.round((quizDone / quizTargetDays) * 100);

  const xpGoal = 30;
  const xpProgress = Math.round(Math.min(100, (user.xp / xpGoal) * 100));

  const reviewPlanCount = dueReviews > 0 ? dueReviews : 15;

  const learningSteps: LearningStep[] = [
    {
      href: "/review",
      title: `Ôn tập (${reviewPlanCount} từ)`,
      subtitle: "Củng cố các thẻ đến hạn trong SRS",
    },
    {
      href: "/focus",
      title: "Sửa lỗi sai",
      subtitle: `${wrongAnswers} câu cần luyện lại hôm nay`,
    },
    {
      href: "/vocab",
      title: "Học từ vựng mới",
      subtitle: "Mở 1 chủ đề N5 để nạp từ mới",
    },
    {
      href: "/conjugation",
      title: "Ôn chia thể",
      subtitle: "Luyện các thể cơ bản theo lesson",
    },
    {
      href: "/quiz?level=N5",
      title: "Kiểm tra N5",
      subtitle: "Mini test để đo mức ghi nhớ hiện tại",
    },
  ];

  return (
    <DashboardBentoClient
      userName={user.name}
      initials={initialsFromName(user.name)}
      level={user.level}
      xp={user.xp}
      xpPercent={xpProgress}
      streak={user.streak}
      kanjiCount={kanjiCount}
      totalVocabCount={totalVocabCount}
      steps={learningSteps}
      quizGoalProgress={quizGoalProgress}
      quizDone={quizDone}
      quizTargetDays={quizTargetDays}
      remindersEnabled={personalState.reminders.enabled}
      dueReviews={dueReviews}
      reviewCount30d={reviewDates30d.length}
      chart7={chart7}
      maxChartCount={max7}
    />
  );
}
