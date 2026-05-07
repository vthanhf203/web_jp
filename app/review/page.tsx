import Link from "next/link";

import { submitReviewAction } from "@/app/actions/study";
import { requireUser } from "@/lib/auth";
import { formatTokyoDateTime } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { calculateSrsUpdate, type ReviewRating } from "@/lib/srs";

const DAY_MS = 24 * 60 * 60 * 1000;

const reviewButtons: Array<{
  rating: ReviewRating;
  label: string;
  tone: string;
  icon: string;
}> = [
  {
    rating: "again",
    label: "Again",
    tone: "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100",
    icon: "↻",
  },
  {
    rating: "hard",
    label: "Hard",
    tone: "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100",
    icon: "◐",
  },
  {
    rating: "good",
    label: "Good",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
    icon: "✓",
  },
  {
    rating: "easy",
    label: "Easy",
    tone: "border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100",
    icon: "★",
  },
];

function fsrsStateLabel(value: number): string {
  if (value === 1) {
    return "Learning";
  }
  if (value === 2) {
    return "Review";
  }
  if (value === 3) {
    return "Relearning";
  }
  return "New";
}

function formatRelativeEta(target: Date, base: Date): string {
  const diff = Math.max(0, target.getTime() - base.getTime());
  const minutes = Math.round(diff / (60 * 1000));
  if (minutes < 60) {
    return `${Math.max(1, minutes)}m`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${Math.max(1, hours)}h`;
  }
  const days = Math.round(hours / 24);
  return `${Math.max(1, days)}d`;
}

function dayLabelFromDate(date: Date): string {
  return date.toLocaleDateString("ja-JP", { weekday: "short" });
}

function reviewPrompt(review: {
  cardType: "KANJI" | "VOCAB";
  kanji: { character: string; meaning: string; onReading: string; kunReading: string } | null;
  vocab: {
    word: string;
    reading: string;
    meaning: string;
    exampleSentence: string;
    exampleMeaning: string;
  } | null;
}) {
  if (review.cardType === "KANJI" && review.kanji) {
    return {
      typeLabel: "Kanji",
      level: "N5",
      title: review.kanji.character,
      reading: `On: ${review.kanji.onReading} | Kun: ${review.kanji.kunReading}`,
      meaning: review.kanji.meaning,
      example: "",
    };
  }
  const vocab = review.vocab;
  return {
    typeLabel: "Tu vung",
    level: "Deck",
    title: vocab?.word ?? "Vocabulary",
    reading: vocab?.reading ?? "",
    meaning: vocab?.meaning ?? "",
    example: vocab?.exampleSentence ?? "",
  };
}

export default async function ReviewPage() {
  const user = await requireUser();
  const now = new Date();
  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);
  const endToday = new Date(now);
  endToday.setHours(23, 59, 59, 999);
  const end7 = new Date(startToday);
  end7.setDate(end7.getDate() + 6);
  end7.setHours(23, 59, 59, 999);

  const [
    dueNowCount,
    totalCount,
    doneTodayCount,
    nextReview,
    upcomingReviews,
    dueByStateRows,
    next7DayDueRows,
  ] = await Promise.all([
    prisma.review.count({
      where: { userId: user.id, dueAt: { lte: now } },
    }),
    prisma.review.count({
      where: { userId: user.id },
    }),
    prisma.review.count({
      where: {
        userId: user.id,
        lastReviewedAt: { gte: startToday, lte: endToday },
      },
    }),
    prisma.review.findFirst({
      where: { userId: user.id, dueAt: { lte: now } },
      include: { kanji: true, vocab: true },
      orderBy: { dueAt: "asc" },
    }),
    prisma.review.findMany({
      where: { userId: user.id, dueAt: { gt: now } },
      include: { kanji: true, vocab: true },
      orderBy: { dueAt: "asc" },
      take: 8,
    }),
    prisma.review.groupBy({
      by: ["fsrsState"],
      where: { userId: user.id, dueAt: { lte: now } },
      _count: { _all: true },
    }),
    prisma.review.findMany({
      where: { userId: user.id, dueAt: { gte: startToday, lte: end7 } },
      select: { dueAt: true },
    }),
  ]);

  const queueByState = new Map<number, number>();
  for (const row of dueByStateRows) {
    queueByState.set(row.fsrsState, row._count._all);
  }

  const stateSummary = [
    { key: 0, label: "Hoc moi", count: queueByState.get(0) ?? 0, tone: "bg-sky-500" },
    { key: 1, label: "Dang hoc", count: queueByState.get(1) ?? 0, tone: "bg-amber-500" },
    { key: 2, label: "On lai", count: queueByState.get(2) ?? 0, tone: "bg-emerald-500" },
    { key: 3, label: "Relearning", count: queueByState.get(3) ?? 0, tone: "bg-violet-500" },
  ];

  const sessionTotal = doneTodayCount + dueNowCount;
  const sessionProgressPercent =
    sessionTotal > 0 ? Math.round((doneTodayCount / sessionTotal) * 100) : 100;
  const retentionScore =
    totalCount > 0 ? Math.round(((totalCount - dueNowCount) / totalCount) * 100) : 100;
  const studyGoal = Math.max(20, Math.min(80, Math.ceil(totalCount * 0.25)));

  const next7Chart = Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(startToday);
    date.setDate(date.getDate() + offset);
    return {
      key: date.toISOString().slice(0, 10),
      label: dayLabelFromDate(date),
      count: 0,
    };
  });
  const bucketIndexByDate = new Map(next7Chart.map((item, index) => [item.key, index]));
  for (const entry of next7DayDueRows) {
    const key = entry.dueAt.toISOString().slice(0, 10);
    const index = bucketIndexByDate.get(key);
    if (index != null) {
      next7Chart[index].count += 1;
    }
  }
  const maxChartCount = Math.max(1, ...next7Chart.map((item) => item.count));

  const nextCardPreview = nextReview
    ? reviewButtons.map((button) => {
        const update = calculateSrsUpdate(
          {
            repetitions: nextReview.repetitions,
            easeFactor: nextReview.easeFactor,
            intervalDays: nextReview.intervalDays,
            dueAt: nextReview.dueAt,
            lastReviewedAt: nextReview.lastReviewedAt,
            fsrsState: nextReview.fsrsState,
            fsrsStability: nextReview.fsrsStability,
            fsrsDifficulty: nextReview.fsrsDifficulty,
            fsrsLearningSteps: nextReview.fsrsLearningSteps,
            fsrsLapses: nextReview.fsrsLapses,
          },
          button.rating
        );
        return {
          ...button,
          eta: formatRelativeEta(update.dueAt, now),
        };
      })
    : [];

  return (
    <section className="space-y-6">
      <header className="relative overflow-hidden rounded-3xl border border-indigo-100 bg-white px-6 pb-6 pt-7 shadow-[0_22px_50px_rgba(37,54,120,0.12)]">
        <div className="absolute inset-x-0 top-0 h-32 bg-[radial-gradient(ellipse_at_top_left,rgba(244,114,182,0.18),transparent_60%),radial-gradient(ellipse_at_top_right,rgba(99,102,241,0.18),transparent_55%)]" />
        <div className="relative">
          <h1 className="text-4xl font-black tracking-tight text-slate-900">Che do SRS</h1>
          <p className="mt-2 text-sm text-slate-600">
            On tap thong minh voi FSRS, uu tien dung han va giam qua tai.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
              Tat ca
            </span>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
              Tu vung
            </span>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
              Kanji
            </span>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
              Ngu phap
            </span>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-violet-100 bg-violet-50/70 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">The den han</p>
              <p className="mt-1 text-3xl font-black text-violet-900">{dueNowCount}</p>
            </div>
            <div className="rounded-2xl border border-orange-100 bg-orange-50/70 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">Chuoi on tap</p>
              <p className="mt-1 text-3xl font-black text-orange-900">{user.streak} ngay</p>
            </div>
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Ty le on dung</p>
              <p className="mt-1 text-3xl font-black text-emerald-900">{retentionScore}%</p>
            </div>
            <div className="rounded-2xl border border-sky-100 bg-sky-50/70 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-sky-600">Da hoc hom nay</p>
              <p className="mt-1 text-3xl font-black text-sky-900">{doneTodayCount}</p>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
              <span>Tien do phien hoc</span>
              <span>
                {doneTodayCount}/{Math.max(sessionTotal, doneTodayCount)}
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500"
                style={{ width: `${Math.min(100, Math.max(6, sessionProgressPercent))}%` }}
              />
            </div>
          </div>
        </div>
      </header>

      {!nextReview ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-lg font-semibold text-slate-800">Hien tai chua co the den han.</p>
          <p className="mt-2 text-sm text-slate-600">
            Ban co the them card tu thu vien Kanji/Tu vung de bat dau lich FSRS.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link href="/kanji" className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
              Mo thu vien Kanji
            </Link>
            <Link href="/vocab" className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
              Mo thu vien Tu vung
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,2.3fr)_minmax(320px,1fr)]">
          <article className="overflow-hidden rounded-3xl border border-indigo-100 bg-white shadow-[0_14px_34px_rgba(34,60,120,0.1)]">
            <div className="border-b border-indigo-100 bg-[linear-gradient(180deg,#ffffff,#f8f9ff)] px-6 py-5">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">
                    {reviewPrompt(nextReview).level}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">
                    {reviewPrompt(nextReview).typeLabel}
                  </span>
                </div>
                <span className="text-sm font-semibold text-slate-500">
                  FSRS: {fsrsStateLabel(nextReview.fsrsState)}
                </span>
              </div>
              <div className="mt-5 text-center">
                <p className="text-6xl font-black tracking-tight text-slate-900">
                  {reviewPrompt(nextReview).title}
                </p>
                {reviewPrompt(nextReview).reading ? (
                  <p className="mt-3 text-base font-medium text-slate-500">
                    {reviewPrompt(nextReview).reading}
                  </p>
                ) : null}
                <p className="mt-4 text-lg font-semibold text-slate-700">
                  {reviewPrompt(nextReview).meaning}
                </p>
                {reviewPrompt(nextReview).example ? (
                  <p className="mx-auto mt-3 max-w-3xl text-sm text-slate-500">
                    {reviewPrompt(nextReview).example}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="grid gap-3 px-5 pb-5 pt-4 sm:grid-cols-2 xl:grid-cols-4">
              {nextCardPreview.map((item) => (
                <form action={submitReviewAction} key={item.rating}>
                  <input type="hidden" name="reviewId" value={nextReview.id} />
                  <input type="hidden" name="rating" value={item.rating} />
                  <button
                    type="submit"
                    className={`w-full rounded-2xl border px-4 py-3 text-left transition ${item.tone}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black uppercase tracking-wide">{item.label}</span>
                      <span className="text-sm font-black">{item.icon}</span>
                    </div>
                    <p className="mt-2 text-2xl font-black">{item.eta}</p>
                    <p className="text-xs font-semibold opacity-80">On lai sau</p>
                  </button>
                </form>
              ))}
            </div>

            <div className="border-t border-slate-100 px-6 py-4 text-xs text-slate-500">
              reps {nextReview.repetitions} | lapses {nextReview.fsrsLapses} | stability{" "}
              {nextReview.fsrsStability.toFixed(2)} | difficulty{" "}
              {nextReview.fsrsDifficulty.toFixed(2)}
            </div>
          </article>

          <aside className="space-y-4">
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-base font-black text-slate-900">Hang doi on tap</h3>
              <ul className="mt-3 space-y-2 text-sm">
                {stateSummary.map((item) => (
                  <li key={item.key} className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-2 text-slate-600">
                      <span className={`h-2.5 w-2.5 rounded-full ${item.tone}`} />
                      {item.label}
                    </span>
                    <span className="font-bold text-slate-800">{item.count}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-base font-black text-slate-900">Lich on sap toi (7 ngay)</h3>
              <div className="mt-4 grid grid-cols-7 items-end gap-2">
                {next7Chart.map((entry) => (
                  <div key={entry.key} className="text-center">
                    <div className="mx-auto flex h-20 w-7 items-end rounded-full bg-slate-100 p-1">
                      <div
                        className="w-full rounded-full bg-gradient-to-t from-violet-500 to-indigo-300"
                        style={{
                          height: `${Math.max(8, Math.round((entry.count / maxChartCount) * 100))}%`,
                        }}
                      />
                    </div>
                    <p className="mt-1 text-[10px] font-semibold text-slate-500">{entry.label}</p>
                    <p className="text-[11px] font-black text-slate-700">{entry.count}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-base font-black text-slate-900">Muc tieu hom nay</h3>
              <p className="mt-2 text-4xl font-black text-indigo-600">{sessionProgressPercent}%</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                Da on {doneTodayCount} / muc tieu {studyGoal} the
              </p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500"
                  style={{
                    width: `${Math.min(100, Math.max(4, Math.round((doneTodayCount / studyGoal) * 100)))}%`,
                  }}
                />
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-black text-slate-900">The sap den han</h3>
                <span className="text-xs font-semibold text-slate-500">
                  {upcomingReviews.length} the
                </span>
              </div>
              <ul className="mt-3 space-y-2 text-sm">
                {upcomingReviews.length === 0 ? (
                  <li className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-500">
                    Chua co lich on tiep theo.
                  </li>
                ) : (
                  upcomingReviews.map((review) => (
                    <li
                      key={review.id}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                    >
                      <p className="font-bold text-slate-800">
                        {review.kanji?.character ?? review.vocab?.word ?? "Card"}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {formatTokyoDateTime(review.dueAt)}
                      </p>
                    </li>
                  ))
                )}
              </ul>
            </section>
          </aside>
        </div>
      )}
    </section>
  );
}
