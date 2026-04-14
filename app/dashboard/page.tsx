import Link from "next/link";

import { SectionCard } from "@/app/components/section-card";
import { requireUser } from "@/lib/auth";
import { toTokyoDateKey } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { loadUserPersonalState } from "@/lib/user-personal-data";

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

export default async function DashboardPage() {
  const user = await requireUser();

  const now = new Date();
  const last7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [kanjiCount, vocabCount, personalState, reviews7d, reviews30d, quizAttempts30d, dueReviews, wrongAnswers] =
    await Promise.all([
      prisma.kanji.count(),
      prisma.vocab.count(),
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

  const totalQuizCorrect = quizAttempts30d.reduce((sum, item) => sum + item.score, 0);
  const totalQuizQuestions = quizAttempts30d.reduce((sum, item) => sum + item.total, 0);
  const quizAccuracy = totalQuizQuestions > 0 ? Math.round((totalQuizCorrect / totalQuizQuestions) * 100) : 0;

  const plan = personalState.plan;

  return (
    <section className="space-y-6">
      <div className="panel p-6">
        <h1 className="text-2xl font-bold text-slate-900">Xin chao {user.name}, san sang hoc chua?</h1>
        <p className="mt-1 text-slate-600">
          Day la trung tam hoc cua ban. Moi ngay 20-30 phut la du de thay tien bo ro rang.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl bg-emerald-50 p-4">
            <p className="text-sm text-slate-600">XP hien tai</p>
            <p className="mt-1 text-2xl font-bold text-emerald-700">{user.xp}</p>
          </div>
          <div className="rounded-xl bg-orange-50 p-4">
            <p className="text-sm text-slate-600">Streak</p>
            <p className="mt-1 text-2xl font-bold text-orange-700">{user.streak} ngay</p>
          </div>
          <div className="rounded-xl bg-sky-50 p-4">
            <p className="text-sm text-slate-600">Tong Kanji</p>
            <p className="mt-1 text-2xl font-bold text-sky-700">{kanjiCount}</p>
          </div>
          <div className="rounded-xl bg-violet-50 p-4">
            <p className="text-sm text-slate-600">Tong Tu vung</p>
            <p className="mt-1 text-2xl font-bold text-violet-700">{vocabCount}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <SectionCard title="Bat dau hoc nhanh" subtitle="Tap trung vao 4 buoc de de duy tri nhip hoc">
          <div className="grid gap-2">
            <Link className="btn-soft justify-start" href="/review">
              1. On the den han ({dueReviews})
            </Link>
            <Link className="btn-soft justify-start" href="/focus">
              2. Dap lai cau sai ({wrongAnswers})
            </Link>
            <Link className="btn-soft justify-start" href="/vocab">
              3. Hoc them tu vung theo chu de
            </Link>
            <Link className="btn-primary justify-start" href="/personal">
              4. Mo lo trinh ca nhan
            </Link>
          </div>
        </SectionCard>

        <SectionCard title="Tong quan hoc tap">
          <div className="space-y-2 text-sm text-slate-700">
            <p>
              Cap muc tieu: <strong>{plan?.goalLevel ?? user.level}</strong>
            </p>
            <p>
              Quiz 30 ngay: <strong>{quizAccuracy}%</strong> ({totalQuizCorrect}/{totalQuizQuestions})
            </p>
            <p>
              Luot on 30 ngay: <strong>{reviewDates30d.length}</strong>
            </p>
            <p>
              Reminder: <strong>{personalState.reminders.enabled ? "Da bat" : "Dang tat"}</strong>
            </p>
          </div>
        </SectionCard>
      </div>

      <div className="panel p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-slate-800">Thong ke tuan gan nhat</h2>
          <Link href="/placement" className="btn-soft text-sm">
            Kiem tra dau vao
          </Link>
        </div>
        <p className="mt-1 text-sm text-slate-600">So luot on SRS theo tung ngay (7 ngay).</p>
        <div className="mt-4 grid grid-cols-7 gap-2">
          {chart7.map((item) => {
            const barHeight = Math.max(10, Math.round((item.count / max7) * 110));
            return (
              <div key={item.key} className="flex flex-col items-center gap-2">
                <div className="flex h-[120px] w-full items-end rounded-lg border border-slate-200 bg-slate-50 px-1 py-1">
                  <div
                    className="w-full rounded-md bg-gradient-to-t from-emerald-500 to-emerald-300"
                    style={{ height: `${barHeight}px` }}
                    title={`${item.key}: ${item.count} luot`}
                  />
                </div>
                <p className="text-[11px] font-semibold text-slate-500">{item.key.slice(5)}</p>
                <p className="text-xs font-bold text-slate-700">{item.count}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

