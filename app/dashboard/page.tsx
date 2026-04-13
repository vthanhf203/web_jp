import Link from "next/link";

import { SectionCard } from "@/app/components/section-card";
import { formatTokyoDateTime } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

export default async function DashboardPage() {
  const user = await requireUser();

  const now = new Date();

  const [dueCount, kanjiDeckCount, vocabDeckCount, lastAttempts] =
    await Promise.all([
      prisma.review.count({
        where: {
          userId: user.id,
          dueAt: { lte: now },
        },
      }),
      prisma.review.count({
        where: {
          userId: user.id,
          kanjiId: { not: null },
        },
      }),
      prisma.review.count({
        where: {
          userId: user.id,
          vocabId: { not: null },
        },
      }),
      prisma.quizAttempt.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ]);

  return (
    <section className="space-y-6">
      <div className="panel p-6">
        <h1 className="text-2xl font-bold text-slate-900">
          Xin chào {user.name}, sẵn sàng học chưa?
        </h1>
        <p className="mt-1 text-slate-600">
          Đây là trung tâm học của bạn. Chỉ cần 20-30 phút mỗi ngày là tiến bộ
          rất rõ.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl bg-emerald-50 p-4">
            <p className="text-sm text-slate-600">XP hiện tại</p>
            <p className="mt-1 text-2xl font-bold text-emerald-700">{user.xp}</p>
          </div>
          <div className="rounded-xl bg-orange-50 p-4">
            <p className="text-sm text-slate-600">Streak</p>
            <p className="mt-1 text-2xl font-bold text-orange-700">{user.streak} ngày</p>
          </div>
          <div className="rounded-xl bg-sky-50 p-4">
            <p className="text-sm text-slate-600">Thẻ đến hạn</p>
            <p className="mt-1 text-2xl font-bold text-sky-700">{dueCount}</p>
          </div>
          <div className="rounded-xl bg-violet-50 p-4">
            <p className="text-sm text-slate-600">Cấp JLPT mục tiêu</p>
            <p className="mt-1 text-2xl font-bold text-violet-700">{user.level}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <SectionCard
          title="Lối tắt học nhanh"
          subtitle="Bắt đầu theo đúng thứ tự để có dữ liệu ôn tập"
        >
          <div className="grid gap-2">
            <Link className="btn-soft justify-start" href="/kanji">
              1. Chọn Kanji đưa vào SRS
            </Link>
            <Link className="btn-soft justify-start" href="/vocab">
              2. Chọn Từ vựng đưa vào SRS
            </Link>
            <Link className="btn-primary justify-start" href="/review">
              3. Ôn tập thẻ đến hạn
            </Link>
            <Link className="btn-soft justify-start" href="/quiz">
              4. Làm quiz JLPT mini
            </Link>
          </div>
        </SectionCard>

        <SectionCard title="Tổng quan deck">
          <div className="space-y-2 text-sm text-slate-700">
            <p>
              Kanji trong deck: <strong>{kanjiDeckCount}</strong>
            </p>
            <p>
              Từ vựng trong deck: <strong>{vocabDeckCount}</strong>
            </p>
            <p>
              Quiz gần nhất: <strong>{lastAttempts.length}</strong> lượt
            </p>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Lịch sử quiz gần đây">
        {lastAttempts.length === 0 ? (
          <p className="text-sm text-slate-600">
            Bạn chưa làm quiz nào. Vào mục Quiz để bắt đầu.
          </p>
        ) : (
          <ul className="space-y-2 text-sm">
            {lastAttempts.map((attempt) => (
              <li
                key={attempt.id}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
              >
                <span>
                  Điểm:{" "}
                  <strong>
                    {attempt.score}/{attempt.total}
                  </strong>
                </span>
                <span className="text-slate-500">
                  {formatTokyoDateTime(attempt.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </section>
  );
}
