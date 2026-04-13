import Link from "next/link";

import { submitReviewAction } from "@/app/actions/study";
import { formatTokyoDateTime } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

const reviewButtons = [
  {
    rating: "again",
    label: "Again",
    tone: "border-rose-200 bg-rose-50 text-rose-700",
  },
  {
    rating: "hard",
    label: "Hard",
    tone: "border-amber-200 bg-amber-50 text-amber-700",
  },
  {
    rating: "good",
    label: "Good",
    tone: "border-sky-200 bg-sky-50 text-sky-700",
  },
  {
    rating: "easy",
    label: "Easy",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
] as const;

export default async function ReviewPage() {
  const user = await requireUser();

  const now = new Date();

  const [dueCount, nextReview, upcomingReviews] = await Promise.all([
    prisma.review.count({
      where: {
        userId: user.id,
        dueAt: { lte: now },
      },
    }),
    prisma.review.findFirst({
      where: {
        userId: user.id,
        dueAt: { lte: now },
      },
      include: {
        kanji: true,
        vocab: true,
      },
      orderBy: { dueAt: "asc" },
    }),
    prisma.review.findMany({
      where: {
        userId: user.id,
        dueAt: { gt: now },
      },
      include: { kanji: true, vocab: true },
      orderBy: { dueAt: "asc" },
      take: 5,
    }),
  ]);

  return (
    <section className="space-y-6">
      <div className="panel p-6">
        <h1 className="text-2xl font-bold text-slate-900">Ôn tập SRS</h1>
        <p className="mt-1 text-sm text-slate-600">
          Còn <strong>{dueCount}</strong> thẻ đến hạn. Nhịp đều mỗi ngày sẽ tăng
          tốc độ ghi nhớ rất tốt.
        </p>
      </div>

      {!nextReview ? (
        <div className="panel p-6">
          <p className="text-slate-700">
            Hiện chưa có thẻ đến hạn. Bạn có thể thêm thẻ từ thư viện.
          </p>
          <div className="mt-4 flex gap-2">
            <Link href="/kanji" className="btn-soft">
              Mở thư viện Kanji
            </Link>
            <Link href="/vocab" className="btn-soft">
              Mở thư viện Từ vựng
            </Link>
          </div>
        </div>
      ) : (
        <article className="panel p-6">
          <p className="chip">
            {nextReview.cardType === "KANJI" ? "Kanji" : "Từ vựng"}
          </p>

          {nextReview.kanji ? (
            <div className="mt-4 space-y-2">
              <p className="text-5xl font-bold text-slate-900">
                {nextReview.kanji.character}
              </p>
              <p className="text-sm text-slate-600">
                On: <strong>{nextReview.kanji.onReading}</strong> | Kun:{" "}
                <strong>{nextReview.kanji.kunReading}</strong>
              </p>
              <p className="text-lg text-slate-800">{nextReview.kanji.meaning}</p>
              <p className="text-sm text-slate-700">
                Ví dụ: {nextReview.kanji.exampleWord} -{" "}
                {nextReview.kanji.exampleMeaning}
              </p>
            </div>
          ) : null}

          {nextReview.vocab ? (
            <div className="mt-4 space-y-2">
              <p className="text-4xl font-bold text-slate-900">{nextReview.vocab.word}</p>
              <p className="text-sm text-slate-600">{nextReview.vocab.reading}</p>
              <p className="text-lg text-slate-800">{nextReview.vocab.meaning}</p>
              <p className="text-sm text-slate-700">{nextReview.vocab.exampleSentence}</p>
              <p className="text-sm text-slate-600">{nextReview.vocab.exampleMeaning}</p>
            </div>
          ) : null}

          <p className="mt-4 text-xs text-slate-500">
            SRS hiện tại: rep {nextReview.repetitions}, EF {nextReview.easeFactor},
            interval {nextReview.intervalDays} ngày
          </p>

          <div className="mt-5 grid gap-2 sm:grid-cols-4">
            {reviewButtons.map((item) => (
              <form action={submitReviewAction} key={item.rating}>
                <input type="hidden" name="reviewId" value={nextReview.id} />
                <input type="hidden" name="rating" value={item.rating} />
                <button
                  type="submit"
                  className={`w-full rounded-xl border px-3 py-2 text-sm font-semibold ${item.tone}`}
                >
                  {item.label}
                </button>
              </form>
            ))}
          </div>
        </article>
      )}

      <div className="panel p-5">
        <h2 className="text-lg font-semibold text-slate-800">Lịch ôn kế tiếp</h2>
        {upcomingReviews.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">Chưa có lịch ôn mới.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {upcomingReviews.map((review) => (
              <li
                key={review.id}
                className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
              >
                <span className="font-medium text-slate-700">
                  {review.kanji?.character ?? review.vocab?.word ?? "Card"}
                </span>
                <span className="text-slate-500">{formatTokyoDateTime(review.dueAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
