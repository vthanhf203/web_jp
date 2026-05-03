import Link from "next/link";

import { deleteSelfStudyQuizDeckAction } from "@/app/actions/self-study-quiz";
import { createSelfStudyVocabLessonAction } from "@/app/actions/vocab-manager";
import { PersonalKanjiImportForm } from "@/app/components/personal-kanji-import-form";
import { SelfStudyQuizImportForm } from "@/app/components/self-study-quiz-import-form";
import { VocabImportForm } from "@/app/components/vocab-import-form";
import { isAdminEmail } from "@/lib/admin";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { loadUserKanjiStore } from "@/lib/user-kanji-store";
import { formatVocabLabel } from "@/lib/vietnamese-labels";
import { loadUserVocabStore } from "@/lib/vocab-store";

type SearchParams = Promise<{
  lesson?: string | string[];
}>;

const SELF_STUDY_PREFIX = "SELF::";

function pickSingle(value?: string | string[]): string {
  if (!value) {
    return "";
  }
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value;
}

function toQuizDeckLabel(category: string): string {
  return category.startsWith(SELF_STUDY_PREFIX) ? category.slice(SELF_STUDY_PREFIX.length) : category;
}

export default async function SelfStudyPage(props: { searchParams: SearchParams }) {
  const user = await requireUser();
  const params = await props.searchParams;
  const requestedLessonId = pickSingle(params.lesson).trim();

  const [userKanjiStore, vocabStore] = await Promise.all([
    loadUserKanjiStore(user.id),
    loadUserVocabStore(user.id),
  ]);
  const isAdmin = isAdminEmail(user.email);
  const selfStudyQuizDecks = isAdmin
    ? await prisma.quizQuestion.groupBy({
        by: ["category"],
        where: {
          category: {
            startsWith: SELF_STUDY_PREFIX,
          },
        },
        _count: {
          _all: true,
        },
        orderBy: {
          category: "asc",
        },
      })
    : [];
  const selfStudyQuizQuestionCount = selfStudyQuizDecks.reduce(
    (sum, deck) => sum + deck._count._all,
    0
  );

  const lessons = [...vocabStore.lessons].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const selectedLessonId =
    (requestedLessonId && lessons.some((lesson) => lesson.id === requestedLessonId)
      ? requestedLessonId
      : lessons[0]?.id) ?? "";
  const selectedLesson =
    selectedLessonId ? lessons.find((lesson) => lesson.id === selectedLessonId) ?? null : null;
  const totalVocabItems = lessons.reduce((sum, lesson) => sum + lesson.items.length, 0);
  const personalKanjiCountByLevel = userKanjiStore.items.reduce(
    (acc, item) => {
      const level = item.jlptLevel;
      acc[level] = (acc[level] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
        <p className="inline-flex items-center rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-700">
          Tự học chủ động
        </p>
        <h1 className="mt-3 text-3xl font-extrabold text-slate-900">Tự học theo kho riêng của bạn</h1>
        <p className="mt-2 text-sm text-slate-600">
          Một nơi để bạn tự import Kanji và từ vựng, sau đó học bằng flashcard/trắc nghiệm/nhại lại.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <article className="rounded-2xl border border-sky-100 bg-sky-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">Kanji cá nhân</p>
            <p className="mt-2 text-3xl font-extrabold text-slate-900">{userKanjiStore.items.length}</p>
            <p className="text-xs text-slate-500">chữ đã lưu</p>
          </article>
          <article className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Bài từ vựng</p>
            <p className="mt-2 text-3xl font-extrabold text-slate-900">{lessons.length}</p>
            <p className="text-xs text-slate-500">bài cá nhân</p>
          </article>
          <article className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">Từ vựng đã lưu</p>
            <p className="mt-2 text-3xl font-extrabold text-slate-900">{totalVocabItems}</p>
            <p className="text-xs text-slate-500">mục từ vựng</p>
          </article>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <article className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
          <h2 className="text-2xl font-extrabold text-slate-900">Tự học Kanji</h2>
          <p className="mt-1 text-sm text-slate-600">
            Dán JSON Kanji bạn muốn học, hệ thống sẽ merge vào thư viện Kanji riêng của bạn.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={
                userKanjiStore.items.length > 0
                  ? "/kanji/learn?scope=personal"
                  : "#"
              }
              className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition ${
                userKanjiStore.items.length > 0
                  ? "bg-emerald-600 text-white hover:bg-emerald-500"
                  : "pointer-events-none cursor-not-allowed bg-slate-100 text-slate-400"
              }`}
            >
              Flashcard Kanji cá nhân
            </Link>
            <Link
              href={
                userKanjiStore.items.length > 0
                  ? "/kanji/learn?scope=personal&mode=quiz"
                  : "#"
              }
              className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition ${
                userKanjiStore.items.length > 0
                  ? "bg-sky-600 text-white hover:bg-sky-500"
                  : "pointer-events-none cursor-not-allowed bg-slate-100 text-slate-400"
              }`}
            >
              Trắc nghiệm Kanji
            </Link>
            <Link
              href="/kanji/personal"
              className="rounded-full bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-700 shadow-[0_8px_16px_rgba(15,23,42,0.08)] transition hover:bg-slate-50"
            >
              Mở thư viện Kanji cá nhân
            </Link>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {["N5", "N4", "N3", "N2", "N1"].map((level) => {
              const count = personalKanjiCountByLevel[level] ?? 0;
              return (
                <Link
                  key={level}
                  href={count > 0 ? `/kanji/learn?scope=personal&level=${level}` : "#"}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                    count > 0
                      ? "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100"
                      : "pointer-events-none cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
                  }`}
                >
                  {level} ({count})
                </Link>
              );
            })}
          </div>
          <div className="mt-4">
            <PersonalKanjiImportForm
              items={userKanjiStore.items.map((item) => ({
                id: item.id,
                character: item.character,
                meaning: item.meaning,
                jlptLevel: item.jlptLevel,
                relatedWords: item.relatedWords.map((word) => ({
                  id: word.id,
                  word: word.word,
                  reading: word.reading,
                  meaning: word.meaning,
                })),
              }))}
            />
          </div>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-extrabold text-slate-900">Tự học Từ vựng</h2>
              <p className="mt-1 text-sm text-slate-600">
                Chọn bài học cá nhân rồi import JSON từ vựng vào bài đó.
              </p>
            </div>
            <form action={createSelfStudyVocabLessonAction}>
              <button
                type="submit"
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                + Tạo bài mới
              </button>
            </form>
          </div>

          {lessons.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {lessons.map((lesson) => {
                const active = lesson.id === selectedLessonId;
                return (
                  <Link
                    key={lesson.id}
                    href={`/self-study?lesson=${lesson.id}`}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                      active
                        ? "border-emerald-300 bg-emerald-100 text-emerald-700"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {formatVocabLabel(lesson.title)} ({lesson.items.length})
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              Chưa có bài từ vựng cá nhân. Bấm &quot;Tạo bài mới&quot; để bắt đầu.
            </p>
          )}

          <div className="mt-4">
            <VocabImportForm lessonId={selectedLessonId || null} />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={selectedLesson ? `/vocab/learn?lesson=${selectedLesson.id}&mode=flashcard` : "/vocab?mode=self"}
              className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition ${
                selectedLesson
                  ? "bg-emerald-600 text-white hover:bg-emerald-500"
                  : "pointer-events-none cursor-not-allowed bg-slate-100 text-slate-400"
              }`}
            >
              Flashcard từ vựng
            </Link>
            <Link
              href="/vocab?mode=self"
              className="rounded-full bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-700 shadow-[0_8px_16px_rgba(15,23,42,0.08)] transition hover:bg-slate-50"
            >
              Quản lý chi tiết
            </Link>
          </div>
        </article>
      </div>

      {isAdmin ? (
        <article className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-extrabold text-slate-900">Quiz JSON (Admin)</h2>
              <p className="mt-1 text-sm text-slate-600">
                Import bo cau hoi + dap an de tao khu on rieng trong Tu hoc.
              </p>
            </div>
            <Link
              href="/self-study/quiz"
              className="rounded-full bg-sky-600 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white transition hover:bg-sky-500"
            >
              Vao trang on quiz ({selfStudyQuizQuestionCount})
            </Link>
          </div>

          <div className="mt-4 rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-800">
            Meo: Moi bo import se duoc tach rieng theo "Ten bo quiz", khong tron vao quiz he thong.
          </div>

          {selfStudyQuizDecks.length > 0 ? (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-bold uppercase text-slate-500">
                Bo quiz da import ({selfStudyQuizDecks.length})
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {selfStudyQuizDecks.map((deck) => (
                  <div
                    key={deck.category}
                    className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2"
                  >
                    <Link
                      href={`/self-study/quiz?category=${encodeURIComponent(deck.category)}`}
                      className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800 hover:text-sky-700"
                    >
                      {toQuizDeckLabel(deck.category)} ({deck._count._all})
                    </Link>
                    <form action={deleteSelfStudyQuizDeckAction}>
                      <input type="hidden" name="category" value={deck.category} />
                      <input type="hidden" name="returnTo" value="/self-study" />
                      <button
                        type="submit"
                        className="rounded-lg bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700 transition hover:bg-rose-100"
                      >
                        Xoa
                      </button>
                    </form>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-4">
            <SelfStudyQuizImportForm />
          </div>
        </article>
      ) : null}
    </section>
  );
}
