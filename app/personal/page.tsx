import Link from "next/link";

import {
  saveBookmarkNoteAction,
  saveLearningPlanAction,
  saveReminderSettingsAction,
  toggleBookmarkAction,
} from "@/app/actions/personal";
import { AudioSettingsClient } from "@/app/components/audio-settings-client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { loadUserPersonalState } from "@/lib/user-personal-data";

function daysUntil(dateString: string): number {
  if (!dateString) {
    return 0;
  }
  const now = new Date();
  const target = new Date(`${dateString}T23:59:59`);
  const diff = target.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)));
}

function recommendationItems(params: {
  dueReviews: number;
  wrongAnswers: number;
  hasPlan: boolean;
  dailyMinutes: number;
}) {
  const items: Array<{ title: string; time: string; href: string }> = [];

  if (!params.hasPlan) {
    items.push({
      title: "Đặt mục tiêu học (N5/N4...) để app tự gợi ý mỗi ngày",
      time: "2 phút",
      href: "#plan-form",
    });
  }

  items.push({
    title:
      params.dueReviews > 0
        ? `Ôn ${params.dueReviews} thẻ đến hạn trong SRS`
        : "Ôn nhanh 10 thẻ để giữ nhịp SRS",
    time: `${Math.max(8, Math.round(params.dailyMinutes * 0.35))} phút`,
    href: "/review",
  });

  items.push({
    title:
      params.wrongAnswers > 0
        ? `Đáp lại bộ câu sai (${params.wrongAnswers} câu sai đã lưu)`
        : "Làm mini test để tìm điểm yếu mới",
    time: `${Math.max(7, Math.round(params.dailyMinutes * 0.3))} phút`,
    href: "/focus",
  });

  items.push({
    title: "Học 1 chủ đề từ vựng mới",
    time: `${Math.max(8, Math.round(params.dailyMinutes * 0.35))} phút`,
    href: "/vocab",
  });

  return items.slice(0, 4);
}

function bookmarkHref(type: string, refId: string, title: string): string {
  if (type === "kanji") {
    return `/kanji?q=${encodeURIComponent(refId)}&selected=${encodeURIComponent(refId)}`;
  }
  if (type === "grammar") {
    return `/grammar?q=${encodeURIComponent(title)}`;
  }
  return `/search?q=${encodeURIComponent(title)}`;
}

export default async function PersonalPage() {
  const user = await requireUser();

  const now = new Date();
  const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const last7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [personalState, dueReviews, wrongAnswers, review7d, quiz30d] = await Promise.all([
    loadUserPersonalState(user.id),
    prisma.review.count({
      where: {
        userId: user.id,
        dueAt: { lte: now },
      },
    }),
    prisma.quizAnswer.count({
      where: {
        isCorrect: false,
        attempt: { userId: user.id },
      },
    }),
    prisma.review.count({
      where: {
        userId: user.id,
        lastReviewedAt: { gte: last7 },
      },
    }),
    prisma.quizAttempt.findMany({
      where: {
        userId: user.id,
        createdAt: { gte: last30 },
      },
      select: {
        score: true,
        total: true,
      },
      orderBy: { createdAt: "desc" },
      take: 40,
    }),
  ]);

  const totalQuizCorrect = quiz30d.reduce((sum, item) => sum + item.score, 0);
  const totalQuizQuestions = quiz30d.reduce((sum, item) => sum + item.total, 0);
  const accuracyPercent =
    totalQuizQuestions > 0 ? Math.round((totalQuizCorrect / totalQuizQuestions) * 100) : 0;

  const plan = personalState.plan;
  const targetInDays = plan ? daysUntil(plan.targetDate) : 0;
  const dailyMinutes = plan?.dailyMinutes ?? 25;
  const recommendations = recommendationItems({
    dueReviews,
    wrongAnswers,
    hasPlan: Boolean(plan),
    dailyMinutes,
  });

  return (
    <section className="space-y-6">
      <div className="panel p-6">
        <h1 className="text-2xl font-bold text-slate-900">Lộ trình học cá nhân</h1>
        <p className="mt-1 text-sm text-slate-600">
          Đặt mục tiêu, theo dõi tiến độ, và để hệ thống tự gợi ý bạn học gì mỗi ngày.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl bg-blue-50 p-4">
            <p className="text-sm text-slate-600">Mục tiêu</p>
            <p className="mt-1 text-2xl font-bold text-blue-700">{plan?.goalLevel ?? user.level}</p>
          </div>
          <div className="rounded-xl bg-violet-50 p-4">
            <p className="text-sm text-slate-600">Hạn còn lại</p>
            <p className="mt-1 text-2xl font-bold text-violet-700">
              {plan ? `${targetInDays} ngày` : "Chưa đặt"}
            </p>
          </div>
          <div className="rounded-xl bg-emerald-50 p-4">
            <p className="text-sm text-slate-600">Độ chính xác 30 ngày</p>
            <p className="mt-1 text-2xl font-bold text-emerald-700">{accuracyPercent}%</p>
          </div>
          <div className="rounded-xl bg-amber-50 p-4">
            <p className="text-sm text-slate-600">Thẻ đã ôn 7 ngày</p>
            <p className="mt-1 text-2xl font-bold text-amber-700">{review7d}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="panel p-6" id="plan-form">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-slate-800">Mục tiêu + gợi ý hôm nay</h2>
            <Link href="/placement" className="btn-soft text-sm">
              Test đầu vào
            </Link>
          </div>

          <form action={saveLearningPlanAction} className="mt-4 grid gap-3 md:grid-cols-3">
            <label className="space-y-1 text-sm">
              <span className="font-semibold text-slate-700">Mục tiêu</span>
              <select name="goalLevel" defaultValue={plan?.goalLevel ?? user.level} className="input-base">
                <option value="N5">N5</option>
                <option value="N4">N4</option>
                <option value="N3">N3</option>
                <option value="N2">N2</option>
                <option value="N1">N1</option>
              </select>
            </label>

            <label className="space-y-1 text-sm">
              <span className="font-semibold text-slate-700">Hạn đạt mục tiêu</span>
              <input
                type="date"
                name="targetDate"
                className="input-base"
                defaultValue={plan?.targetDate ?? ""}
                required
              />
            </label>

            <label className="space-y-1 text-sm">
              <span className="font-semibold text-slate-700">Mỗi ngày (phút)</span>
              <input
                type="number"
                name="dailyMinutes"
                className="input-base"
                min={10}
                max={180}
                defaultValue={dailyMinutes}
                required
              />
            </label>

            <button type="submit" className="btn-primary md:col-span-3">
              Lưu lộ trình
            </button>
          </form>

          <div className="mt-5 space-y-2">
            {recommendations.map((item, index) => (
              <Link
                key={`${item.title}-${index}`}
                href={item.href}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 hover:bg-white"
              >
                <span>
                  {index + 1}. {item.title}
                </span>
                <span className="chip">{item.time}</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="panel p-6">
            <h2 className="text-lg font-bold text-slate-800">Nhắc học hằng ngày</h2>
            <form action={saveReminderSettingsAction} className="mt-4 space-y-3">
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  name="enabled"
                  defaultChecked={personalState.reminders.enabled}
                />
                Bật nhắc học bằng thông báo trình duyệt
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1 text-sm">
                  <span className="font-semibold text-slate-700">Giờ</span>
                  <input
                    type="number"
                    name="hour"
                    min={0}
                    max={23}
                    defaultValue={personalState.reminders.hour}
                    className="input-base"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-semibold text-slate-700">Phút</span>
                  <input
                    type="number"
                    name="minute"
                    min={0}
                    max={59}
                    defaultValue={personalState.reminders.minute}
                    className="input-base"
                  />
                </label>
              </div>
              <input type="hidden" name="timezone" value={personalState.reminders.timezone || "Asia/Tokyo"} />
              <button type="submit" className="btn-soft w-full">
                Lưu nhắc học
              </button>
            </form>
            <p className="mt-2 text-xs text-slate-500">
              Bạn nhớ cấp quyền Notification cho trình duyệt để nhắc hoạt động.
            </p>
          </div>

          <AudioSettingsClient />
        </div>
      </div>

      <div className="panel p-6">
        <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-slate-800">Bookmark + note cá nhân</h2>
            <span className="chip">{personalState.bookmarks.length} mục</span>
        </div>

        {personalState.bookmarks.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">
            Chưa có mục nào. Bấm &quot;Bookmark&quot; trong trang Kanji/Grammar/Search để lưu.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {personalState.bookmarks.map((bookmark) => (
              <article key={bookmark.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                      {bookmark.type}
                    </p>
                    <p className="text-lg font-bold text-slate-900">{bookmark.title}</p>
                    {bookmark.subtitle ? (
                      <p className="text-sm text-slate-600">{bookmark.subtitle}</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Link href={bookmarkHref(bookmark.type, bookmark.refId, bookmark.title)} className="btn-soft text-sm">
                      Mở lại
                    </Link>
                    <form action={toggleBookmarkAction}>
                      <input type="hidden" name="type" value={bookmark.type} />
                      <input type="hidden" name="refId" value={bookmark.refId} />
                      <input type="hidden" name="title" value={bookmark.title} />
                      <input type="hidden" name="subtitle" value={bookmark.subtitle} />
                      <input type="hidden" name="returnTo" value="/personal" />
                      <button type="submit" className="btn-danger text-xs">
                        Bỏ đánh dấu
                      </button>
                    </form>
                  </div>
                </div>

                <form action={saveBookmarkNoteAction} className="mt-3 space-y-2">
                  <input type="hidden" name="bookmarkId" value={bookmark.id} />
                  <input type="hidden" name="returnTo" value="/personal" />
                  <textarea
                    name="note"
                    defaultValue={bookmark.note}
                    placeholder="Thêm mẹo nhớ riêng cho mục này..."
                    className="input-base min-h-20 resize-y text-sm"
                  />
                  <button type="submit" className="btn-primary text-sm">
                    Lưu note
                  </button>
                </form>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}


