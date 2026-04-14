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
      title: "Dat muc tieu hoc (N5/N4...) de app tu goi y moi ngay",
      time: "2 phut",
      href: "#plan-form",
    });
  }

  items.push({
    title:
      params.dueReviews > 0
        ? `On ${params.dueReviews} the den han trong SRS`
        : "On nhanh 10 the de giu nhip SRS",
    time: `${Math.max(8, Math.round(params.dailyMinutes * 0.35))} phut`,
    href: "/review",
  });

  items.push({
    title:
      params.wrongAnswers > 0
        ? `Dap lai bo cau sai (${params.wrongAnswers} cau sai da luu)`
        : "Lam mini test de tim diem yeu moi",
    time: `${Math.max(7, Math.round(params.dailyMinutes * 0.3))} phut`,
    href: "/focus",
  });

  items.push({
    title: "Hoc 1 chu de tu vung moi",
    time: `${Math.max(8, Math.round(params.dailyMinutes * 0.35))} phut`,
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
        <h1 className="text-2xl font-bold text-slate-900">Lo trinh hoc ca nhan</h1>
        <p className="mt-1 text-sm text-slate-600">
          Dat muc tieu, theo doi tien do, va de he thong tu goi y ban hoc gi moi ngay.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl bg-blue-50 p-4">
            <p className="text-sm text-slate-600">Muc tieu</p>
            <p className="mt-1 text-2xl font-bold text-blue-700">{plan?.goalLevel ?? user.level}</p>
          </div>
          <div className="rounded-xl bg-violet-50 p-4">
            <p className="text-sm text-slate-600">Han con lai</p>
            <p className="mt-1 text-2xl font-bold text-violet-700">
              {plan ? `${targetInDays} ngay` : "Chua dat"}
            </p>
          </div>
          <div className="rounded-xl bg-emerald-50 p-4">
            <p className="text-sm text-slate-600">Do chinh xac 30 ngay</p>
            <p className="mt-1 text-2xl font-bold text-emerald-700">{accuracyPercent}%</p>
          </div>
          <div className="rounded-xl bg-amber-50 p-4">
            <p className="text-sm text-slate-600">The da on 7 ngay</p>
            <p className="mt-1 text-2xl font-bold text-amber-700">{review7d}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="panel p-6" id="plan-form">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-slate-800">Muc tieu + goi y hom nay</h2>
            <Link href="/placement" className="btn-soft text-sm">
              Test dau vao
            </Link>
          </div>

          <form action={saveLearningPlanAction} className="mt-4 grid gap-3 md:grid-cols-3">
            <label className="space-y-1 text-sm">
              <span className="font-semibold text-slate-700">Muc tieu</span>
              <select name="goalLevel" defaultValue={plan?.goalLevel ?? user.level} className="input-base">
                <option value="N5">N5</option>
                <option value="N4">N4</option>
                <option value="N3">N3</option>
                <option value="N2">N2</option>
                <option value="N1">N1</option>
              </select>
            </label>

            <label className="space-y-1 text-sm">
              <span className="font-semibold text-slate-700">Han dat muc tieu</span>
              <input
                type="date"
                name="targetDate"
                className="input-base"
                defaultValue={plan?.targetDate ?? ""}
                required
              />
            </label>

            <label className="space-y-1 text-sm">
              <span className="font-semibold text-slate-700">Moi ngay (phut)</span>
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
              Luu lo trinh
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
            <h2 className="text-lg font-bold text-slate-800">Nhac hoc hang ngay</h2>
            <form action={saveReminderSettingsAction} className="mt-4 space-y-3">
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  name="enabled"
                  defaultChecked={personalState.reminders.enabled}
                />
                Bat nhac hoc bang thong bao trinh duyet
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1 text-sm">
                  <span className="font-semibold text-slate-700">Gio</span>
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
                  <span className="font-semibold text-slate-700">Phut</span>
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
                Luu nhac hoc
              </button>
            </form>
            <p className="mt-2 text-xs text-slate-500">
              Ban nho cap quyen Notification cho trinh duyet de nhac hoat dong.
            </p>
          </div>

          <AudioSettingsClient />
        </div>
      </div>

      <div className="panel p-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-slate-800">Bookmark + note ca nhan</h2>
          <span className="chip">{personalState.bookmarks.length} muc</span>
        </div>

        {personalState.bookmarks.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">
            Chua co muc nao. Bam &quot;Bookmark&quot; trong trang Kanji/Grammar/Search de luu.
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
                      Mo lai
                    </Link>
                    <form action={toggleBookmarkAction}>
                      <input type="hidden" name="type" value={bookmark.type} />
                      <input type="hidden" name="refId" value={bookmark.refId} />
                      <input type="hidden" name="title" value={bookmark.title} />
                      <input type="hidden" name="subtitle" value={bookmark.subtitle} />
                      <input type="hidden" name="returnTo" value="/personal" />
                      <button type="submit" className="btn-danger text-xs">
                        Bo danh dau
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
                    placeholder="Them meo nho rieng cho muc nay..."
                    className="input-base min-h-20 resize-y text-sm"
                  />
                  <button type="submit" className="btn-primary text-sm">
                    Luu note
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


