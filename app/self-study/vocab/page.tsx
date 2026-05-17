import Link from "next/link";
import { BookMarked, ChevronLeft, Layers3, Plus, Sparkles } from "lucide-react";

import { createSelfStudyVocabLessonAction } from "@/app/actions/vocab-manager";
import { PersonalKanjiImportForm } from "@/app/components/personal-kanji-import-form";
import { VocabImportForm } from "@/app/components/vocab-import-form";
import { requireUser } from "@/lib/auth";
import { loadUserKanjiStore } from "@/lib/user-kanji-store";
import { formatVocabLabel } from "@/lib/vietnamese-labels";
import { loadUserVocabStore } from "@/lib/vocab-store";

type SearchParams = Promise<{
  lesson?: string | string[];
}>;

function pickSingle(value?: string | string[]): string {
  if (!value) {
    return "";
  }
  return Array.isArray(value) ? value[0] ?? "" : value;
}

export default async function SelfStudyVocabPage(props: { searchParams: SearchParams }) {
  const user = await requireUser();
  const params = await props.searchParams;
  const requestedLessonId = pickSingle(params.lesson).trim();

  const [userKanjiStore, vocabStore] = await Promise.all([
    loadUserKanjiStore(user.id),
    loadUserVocabStore(user.id),
  ]);

  const lessons = [...vocabStore.lessons].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const selectedLessonId =
    (requestedLessonId && lessons.some((lesson) => lesson.id === requestedLessonId)
      ? requestedLessonId
      : lessons[0]?.id) ?? "";
  const selectedLesson =
    selectedLessonId ? lessons.find((lesson) => lesson.id === selectedLessonId) ?? null : null;
  const totalVocabItems = lessons.reduce((sum, lesson) => sum + lesson.items.length, 0);
  const personalKanjiDeckCountMap = new Map<string, number>();
  for (const deckName of userKanjiStore.decks) {
    const normalized = deckName.trim();
    if (normalized) {
      personalKanjiDeckCountMap.set(normalized, 0);
    }
  }
  for (const item of userKanjiStore.items) {
    const deckName = item.deckName?.trim() || "Chua phan loai";
    personalKanjiDeckCountMap.set(deckName, (personalKanjiDeckCountMap.get(deckName) ?? 0) + 1);
  }
  const personalKanjiDeckGroups = Array.from(personalKanjiDeckCountMap.entries()).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
  );

  return (
    <section className="mx-auto max-w-[1240px] space-y-5 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            href="/self-study"
            className="grid h-11 w-11 place-items-center rounded-2xl border border-[#d8e2ee] bg-white text-[#14635d] shadow-[0_10px_24px_rgba(20,99,93,0.08)] transition hover:bg-[#f2fbfa]"
            aria-label="Quay lại tự học"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#14947f]">
              Kho tự học
            </p>
            <h1 className="mt-1 text-3xl font-black text-[#111827]">Tự học từ vựng & Kanji</h1>
          </div>
        </div>
        <form action={createSelfStudyVocabLessonAction}>
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-xl bg-[#14635d] px-4 py-2.5 text-sm font-black text-white shadow-[0_12px_24px_rgba(20,99,93,0.16)] transition hover:bg-[#104f4a]"
          >
            <Plus className="h-4 w-4" />
            Tạo bài từ vựng
          </button>
        </form>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <article className="rounded-2xl border border-[#d8e2ee] bg-white px-5 py-4 shadow-[0_14px_28px_rgba(20,99,93,0.06)]">
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-[#64748b]">
            <Sparkles className="h-4 w-4 text-[#14947f]" />
            Kanji cá nhân
          </p>
          <p className="mt-2 text-3xl font-black text-[#111827]">{userKanjiStore.items.length}</p>
        </article>
        <article className="rounded-2xl border border-[#d8e2ee] bg-white px-5 py-4 shadow-[0_14px_28px_rgba(20,99,93,0.06)]">
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-[#64748b]">
            <Layers3 className="h-4 w-4 text-[#4f7cff]" />
            Bài từ vựng
          </p>
          <p className="mt-2 text-3xl font-black text-[#111827]">{lessons.length}</p>
        </article>
        <article className="rounded-2xl border border-[#d8e2ee] bg-white px-5 py-4 shadow-[0_14px_28px_rgba(20,99,93,0.06)]">
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-[#64748b]">
            <BookMarked className="h-4 w-4 text-[#e68a2e]" />
            Từ đã lưu
          </p>
          <p className="mt-2 text-3xl font-black text-[#111827]">{totalVocabItems}</p>
        </article>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <article className="rounded-[24px] border border-[#d8e2ee] bg-white p-5 shadow-[0_18px_42px_rgba(20,99,93,0.08)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black text-[#111827]">Kanji cá nhân</h2>
              <p className="mt-1 text-sm leading-6 text-[#667085]">
                Import Kanji JSON vào thư viện riêng, rồi luyện bằng flashcard hoặc quiz.
              </p>
            </div>
            <Link
              href="/kanji/personal"
              className="rounded-xl border border-[#d8e2ee] bg-[#f8fafc] px-4 py-2 text-sm font-black text-[#263750] transition hover:bg-white"
            >
              Mở thư viện
            </Link>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={userKanjiStore.items.length > 0 ? "/kanji/learn?scope=personal" : "#"}
              className={`rounded-full px-4 py-2 text-xs font-black uppercase tracking-[0.12em] transition ${
                userKanjiStore.items.length > 0
                  ? "bg-[#14635d] text-white hover:bg-[#104f4a]"
                  : "pointer-events-none bg-slate-100 text-slate-400"
              }`}
            >
              Flashcard
            </Link>
            <Link
              href={userKanjiStore.items.length > 0 ? "/kanji/learn?scope=personal&mode=quiz" : "#"}
              className={`rounded-full px-4 py-2 text-xs font-black uppercase tracking-[0.12em] transition ${
                userKanjiStore.items.length > 0
                  ? "bg-[#3554a8] text-white hover:bg-[#29458f]"
                  : "pointer-events-none bg-slate-100 text-slate-400"
              }`}
            >
              Quiz Kanji
            </Link>
            <Link
              href={userKanjiStore.items.length > 0 ? "/kanji/learn?scope=personal&mode=recall" : "#"}
              className={`rounded-full px-4 py-2 text-xs font-black uppercase tracking-[0.12em] transition ${
                userKanjiStore.items.length > 0
                  ? "bg-orange-600 text-white hover:bg-orange-500"
                  : "pointer-events-none bg-slate-100 text-slate-400"
              }`}
            >
              Nhồi Kanji
            </Link>
            <Link
              href={userKanjiStore.items.length > 0 ? "/kanji/write-flashcard?scope=personal" : "#"}
              className={`rounded-full px-4 py-2 text-xs font-black uppercase tracking-[0.12em] transition ${
                userKanjiStore.items.length > 0
                  ? "bg-sky-600 text-white hover:bg-sky-500"
                  : "pointer-events-none bg-slate-100 text-slate-400"
              }`}
            >
              Luyện viết Kanji
            </Link>
          </div>

          <div className="mt-3 space-y-2">
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#5f7293]">
              Mục tự tạo ({personalKanjiDeckGroups.length})
            </p>
            <div className="flex flex-wrap gap-2">
              {personalKanjiDeckGroups.length > 0 ? (
                personalKanjiDeckGroups.map(([deckName, count]) => (
                  <span key={deckName} className="inline-flex overflow-hidden rounded-full border border-[#bdd7ff] bg-[#f1f6ff]">
                    <Link
                      href={`/kanji/learn?scope=personal&deck=${encodeURIComponent(deckName)}`}
                      className="px-3 py-1.5 text-xs font-black text-[#2557a7] transition hover:bg-[#e7f0ff]"
                      title={deckName}
                    >
                      {deckName} ({count})
                    </Link>
                    <Link
                      href={`/kanji/write-flashcard?scope=personal&deck=${encodeURIComponent(deckName)}`}
                      className="border-l border-[#bdd7ff] bg-white/70 px-3 py-1.5 text-xs font-black text-[#0f766e] transition hover:bg-[#e8fbf8]"
                      title={`Luyện viết ${deckName}`}
                    >
                      Viết
                    </Link>
                  </span>
                ))
              ) : (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-black text-slate-400">
                  Chưa có mục
                </span>
              )}
            </div>
          </div>

          <div className="mt-4">
            <PersonalKanjiImportForm
              deckNames={userKanjiStore.decks}
              items={userKanjiStore.items.map((item) => ({
                id: item.id,
                character: item.character,
                deckName: item.deckName,
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

        <article className="rounded-[24px] border border-[#d8e2ee] bg-white p-5 shadow-[0_18px_42px_rgba(20,99,93,0.08)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black text-[#111827]">Từ vựng cá nhân</h2>
              <p className="mt-1 text-sm leading-6 text-[#667085]">
                Chọn một bài để import JSON/CSV từ vựng và luyện flashcard.
              </p>
            </div>
            <Link
              href="/vocab?mode=self"
              className="rounded-xl border border-[#d8e2ee] bg-[#f8fafc] px-4 py-2 text-sm font-black text-[#263750] transition hover:bg-white"
            >
              Quản lý
            </Link>
          </div>

          {lessons.length > 0 ? (
            <div className="mt-4 flex max-h-32 flex-wrap gap-2 overflow-y-auto pr-1">
              {lessons.map((lesson) => {
                const active = lesson.id === selectedLessonId;
                return (
                  <Link
                    key={lesson.id}
                    href={`/self-study/vocab?lesson=${lesson.id}`}
                    className={`rounded-full border px-3 py-1.5 text-xs font-black transition ${
                      active
                        ? "border-[#14947f] bg-[#e8fbf8] text-[#108373]"
                        : "border-[#d8e2ee] bg-white text-[#667085] hover:bg-[#f8fafc]"
                    }`}
                  >
                    {formatVocabLabel(lesson.title)} ({lesson.items.length})
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-[#ffe0a8] bg-[#fff8e8] px-4 py-3 text-sm font-semibold text-[#a35b00]">
              Chưa có bài từ vựng cá nhân.
            </div>
          )}

          <div className="mt-4">
            <VocabImportForm lessonId={selectedLessonId || null} />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={selectedLesson ? `/vocab/learn?lesson=${selectedLesson.id}&mode=flashcard` : "#"}
              className={`rounded-full px-4 py-2 text-xs font-black uppercase tracking-[0.12em] transition ${
                selectedLesson
                  ? "bg-[#14635d] text-white hover:bg-[#104f4a]"
                  : "pointer-events-none bg-slate-100 text-slate-400"
              }`}
            >
              Flashcard từ vựng
            </Link>
          </div>
        </article>
      </div>
    </section>
  );
}
