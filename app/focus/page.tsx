import Link from "next/link";

import { requireUser } from "@/lib/auth";
import { formatTokyoDateTime } from "@/lib/date";
import { prisma } from "@/lib/prisma";

type WrongBucket = {
  questionId: string;
  prompt: string;
  level: string;
  category: string;
  count: number;
  lastWrongAt: Date;
};

export default async function FocusPage() {
  const user = await requireUser();

  const wrongAnswers = await prisma.quizAnswer.findMany({
    where: {
      attempt: { userId: user.id },
      isCorrect: false,
    },
    include: {
      question: true,
      attempt: {
        select: {
          createdAt: true,
        },
      },
    },
    orderBy: {
      attempt: {
        createdAt: "desc",
      },
    },
    take: 1200,
  });

  const bucketMap = new Map<string, WrongBucket>();
  for (const entry of wrongAnswers) {
    const current = bucketMap.get(entry.questionId);
    if (!current) {
      bucketMap.set(entry.questionId, {
        questionId: entry.questionId,
        prompt: entry.question.prompt,
        level: entry.question.level,
        category: entry.question.category,
        count: 1,
        lastWrongAt: entry.attempt.createdAt,
      });
      continue;
    }
    current.count += 1;
    if (entry.attempt.createdAt > current.lastWrongAt) {
      current.lastWrongAt = entry.attempt.createdAt;
    }
  }

  const buckets = Array.from(bucketMap.values()).sort((a, b) => {
    if (b.count !== a.count) {
      return b.count - a.count;
    }
    return b.lastWrongAt.getTime() - a.lastWrongAt.getTime();
  });

  const topQuestionIds = buckets.slice(0, 20).map((item) => item.questionId);
  const quickQuizHref =
    topQuestionIds.length > 0
      ? `/quiz?ids=${encodeURIComponent(topQuestionIds.join(","))}&source=focus`
      : "/quiz";
  const examQuizHref =
    topQuestionIds.length > 0
      ? `/quiz?ids=${encodeURIComponent(topQuestionIds.join(","))}&source=focus&exam=1&minutes=20`
      : "/quiz?exam=1&minutes=20";

  return (
    <section className="space-y-6">
      <div className="panel p-6">
        <h1 className="text-2xl font-bold text-slate-900">On sai trong diem</h1>
        <p className="mt-1 text-sm text-slate-600">
          He thong gom cac cau ban sai nhieu nhat thanh mot deck rieng de dap lai.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href={quickQuizHref} className="btn-primary text-sm">
            Lam lai bo sai ({topQuestionIds.length} cau)
          </Link>
          <Link href={examQuizHref} className="btn-soft text-sm">
            Thi thu bo sai (20 phut)
          </Link>
          <Link href="/placement" className="btn-soft text-sm">
            Test lai dau vao
          </Link>
        </div>
      </div>

      {buckets.length === 0 ? (
        <div className="panel p-6">
          <p className="text-slate-700">
            Chua co du lieu cau sai. Ban lam mot bai quiz roi quay lai day de xem deck trong diem.
          </p>
        </div>
      ) : (
        <div className="panel p-6">
          <h2 className="text-lg font-bold text-slate-800">Danh sach cau sai nhieu nhat</h2>
          <div className="mt-4 space-y-3">
            {buckets.slice(0, 30).map((item, index) => (
              <article key={item.questionId} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="chip">#{index + 1}</span>
                    <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 font-semibold text-rose-700">
                      Sai {item.count} lan
                    </span>
                    <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-slate-600">
                      {item.level} - {item.category}
                    </span>
                  </div>
                  <span className="text-xs text-slate-500">
                    Lan sai gan nhat: {formatTokyoDateTime(item.lastWrongAt)}
                  </span>
                </div>
                <p className="mt-2 text-sm font-semibold text-slate-800">{item.prompt}</p>
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}


