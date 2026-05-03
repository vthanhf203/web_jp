import Link from "next/link";
import GrammarRoadmap, {
  type GrammarRoadmapLesson,
  type GrammarRoadmapLevelTab,
} from "@/app/grammar/grammar-roadmap";
import GrammarDetail from "@/components/GrammarDetail";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Flower2,
  Lightbulb,
  PenLine,
  Search,
  Sparkles,
  TrendingUp,
} from "lucide-react";

import { requireUser } from "@/lib/auth";
import {
  GRAMMAR_LEVELS,
  loadGrammarDataset,
  type GrammarLevel,
  type GrammarPoint,
} from "@/lib/grammar-dataset";
import {
  loadUserPersonalState,
  markGrammarPointLearned,
  saveUserPersonalState,
} from "@/lib/user-personal-data";

type SearchParams = Promise<{
  level?: string | string[];
  lesson?: string | string[];
  point?: string | string[];
  q?: string | string[];
}>;

type LevelFilter = GrammarLevel;

function pickSingle(value?: string | string[]): string {
  if (!value) {
    return "";
  }
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value;
}

function isLevelFilter(value: string): value is LevelFilter {
  return GRAMMAR_LEVELS.includes(value as GrammarLevel);
}

function normalizeQuery(value: string): string {
  return value.toLowerCase().trim();
}

function buildGrammarHref(options: {
  level: LevelFilter;
  lessonId?: string | null;
  pointId?: string | null;
  rawQuery?: string;
}): string {
  const query = new URLSearchParams();
  query.set("level", options.level);
  if (options.lessonId) {
    query.set("lesson", options.lessonId);
  }
  if (options.pointId) {
    query.set("point", options.pointId);
  }
  const trimmedQuery = (options.rawQuery ?? "").trim();
  if (trimmedQuery) {
    query.set("q", trimmedQuery);
  }
  return `/grammar?${query.toString()}`;
}

function pointMatchesQuery(point: GrammarPoint, query: string): boolean {
  if (!query) {
    return true;
  }

  const haystacks = [
    point.title,
    point.meaning,
    point.content,
    ...point.usage,
    ...point.examples,
    ...point.notes,
  ].map((entry) => entry.toLowerCase());

  return haystacks.some((entry) => entry.includes(query));
}

function displayTopic(topic?: string): string | null {
  if (!topic) {
    return null;
  }
  const value = topic.trim();
  if (!value) {
    return null;
  }
  const normalized = value.toLowerCase();
  if (
    normalized === "ok" ||
    normalized === "-" ||
    normalized === "..." ||
    normalized === "n/a" ||
    normalized === "none"
  ) {
    return null;
  }
  if (value.length > 90) {
    return null;
  }
  if (value.startsWith("-") || value.startsWith("*") || value.startsWith("*")) {
    return null;
  }
  if (value.includes("Lesson") && value.length <= 10) {
    return null;
  }
  return value;
}

function extractLessonNumberFromTitle(title?: string): number | null {
  if (!title) {
    return null;
  }
  const normalized = title.trim().toLowerCase();
  const match = normalized.match(/^b[àa]i\s*(\d+)$/);
  if (!match) {
    return null;
  }
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
}

function lessonDisplayTitle(lessonNumber: number, title?: string): string {
  const parsedTitleNumber = extractLessonNumberFromTitle(title);
  if (!title?.trim() || parsedTitleNumber !== null) {
    return `Bài ${lessonNumber}`;
  }
  return title.trim();
}

function toDisplayLessonNumber(level: GrammarLevel, lessonNumber: number): number {
  if (level === "N4" && lessonNumber >= 1 && lessonNumber <= 25) {
    return lessonNumber + 25;
  }
  return lessonNumber;
}

function splitExampleLine(line: string): { jp: string; vi: string } {
  const text = line.trim();
  if (!text) {
    return { jp: "", vi: "" };
  }

  const separatorIndex = text.lastIndexOf(" - ");
  if (separatorIndex < 0) {
    return {
      jp: text,
      vi: "",
    };
  }

  const jp = text.slice(0, separatorIndex).trim();
  const vi = text.slice(separatorIndex + 3).trim();

  return { jp, vi };
}

function shouldHideGrammarNote(line: string): boolean {
  const text = line.trim().toLowerCase();
  return text.startsWith("tags:") || text.startsWith("lien quan:");
}

export default async function GrammarPage(props: { searchParams: SearchParams }) {
  const user = await requireUser();
  const [dataset, loadedPersonalState] = await Promise.all([
    loadGrammarDataset(),
    loadUserPersonalState(user.id),
  ]);
  let personalState = loadedPersonalState;
  const params = await props.searchParams;

  const requestedLevel = pickSingle(params.level);
  const level: LevelFilter = isLevelFilter(requestedLevel) ? requestedLevel : "N5";

  const lessonsByLevel = dataset.lessons
    .filter((lesson) => lesson.level === level)
    .sort((a, b) => a.lessonNumber - b.lessonNumber);

  const requestedLessonId = pickSingle(params.lesson);
  const requestedPointId = pickSingle(params.point);
  const hasLessons = lessonsByLevel.length > 0;
  const selectedLesson = requestedLessonId
    ? lessonsByLevel.find((lesson) => lesson.id === requestedLessonId) ?? null
    : null;

  const rawQuery = pickSingle(params.q);
  const query = normalizeQuery(rawQuery);

  const filteredPoints = selectedLesson
    ? selectedLesson.points.filter((point) => pointMatchesQuery(point, query))
    : [];

  const selectedPointFromQuery = requestedPointId
    ? filteredPoints.find((point) => point.id === requestedPointId) ?? null
    : null;
  const selectedPoint = selectedPointFromQuery ?? filteredPoints[0] ?? null;
  if (selectedPoint) {
    const nextLearned = markGrammarPointLearned(personalState, selectedPoint.id);
    if (nextLearned.added) {
      personalState = nextLearned.state;
      await saveUserPersonalState(user.id, personalState);
    }
  }
  const selectedPointIndex = selectedPoint
    ? filteredPoints.findIndex((point) => point.id === selectedPoint.id)
    : -1;
  const prevPoint =
    selectedPointIndex > 0 ? filteredPoints[selectedPointIndex - 1] ?? null : null;
  const nextPoint =
    selectedPointIndex >= 0 && selectedPointIndex + 1 < filteredPoints.length
      ? filteredPoints[selectedPointIndex + 1] ?? null
      : null;

  const selectedLessonTitle = selectedLesson
    ? lessonDisplayTitle(
        toDisplayLessonNumber(selectedLesson.level, selectedLesson.lessonNumber),
        selectedLesson.title
      )
    : "";
  const levelBookTitle =
    level === "N5"
      ? "Minna no Nihongo I (Bài 1~25)"
      : level === "N4"
        ? "Minna no Nihongo II (Bài 26~50)"
        : `Ngữ pháp JLPT ${level}`;
  const bookmarkKeySet = new Set(personalState.bookmarks.map((item) => `${item.type}:${item.refId}`));
  const learnedPointIdSet = new Set([
    ...personalState.grammarProgress.learnedPointIds,
    ...personalState.bookmarks
      .filter((item) => item.type === "grammar")
      .map((item) => item.refId),
  ]);
  const selectedPointBookmarked = selectedPoint
    ? bookmarkKeySet.has(`grammar:${selectedPoint.id}`)
    : false;
  const lessonPointLearnedCount = new Map(
    lessonsByLevel.map((lesson) => [
      lesson.id,
      lesson.points.filter((point) => learnedPointIdSet.has(point.id)).length,
    ])
  );
  const focusLesson =
    lessonsByLevel.find(
      (lesson) => (lessonPointLearnedCount.get(lesson.id) ?? 0) < lesson.points.length
    ) ?? lessonsByLevel[0] ?? null;
  const totalPointCount = lessonsByLevel.reduce((sum, lesson) => sum + lesson.pointCount, 0);
  const learnedPointCount = lessonsByLevel.reduce(
    (sum, lesson) => sum + (lessonPointLearnedCount.get(lesson.id) ?? 0),
    0
  );
  const overallProgress = totalPointCount
    ? Math.round((learnedPointCount / totalPointCount) * 100)
    : 0;
  const selectedLessonLearnedCount = selectedLesson
    ? lessonPointLearnedCount.get(selectedLesson.id) ?? 0
    : 0;
  const selectedLessonProgress =
    selectedLesson && selectedLesson.pointCount > 0
      ? Math.round((selectedLessonLearnedCount / selectedLesson.pointCount) * 100)
      : 0;
  const relatedPoints =
    selectedLesson && selectedPoint
      ? filteredPoints.filter((point) => point.id !== selectedPoint.id).slice(0, 5)
      : [];
  const reminderText =
    selectedPoint?.notes.find((line) => !shouldHideGrammarNote(line)) ||
    selectedPoint?.meaning ||
    "Doc mau cau, xem vi du, roi luyen tap ngay de giu nhip nho.";
  const heroLesson = focusLesson;
  const levelTabs: GrammarRoadmapLevelTab[] = GRAMMAR_LEVELS.map((entry) => ({
    level: entry,
    href: buildGrammarHref({ level: entry }),
    lessonCount: dataset.lessons.filter((lesson) => lesson.level === entry).length,
    active: entry === level,
  }));
  const roadmapLessons: GrammarRoadmapLesson[] = lessonsByLevel.map((lesson) => {
    const displayLessonNumber = toDisplayLessonNumber(lesson.level, lesson.lessonNumber);
    const learnedCount = lessonPointLearnedCount.get(lesson.id) ?? 0;
    const progress = lesson.pointCount
      ? Math.round((learnedCount / Math.max(lesson.pointCount, 1)) * 100)
      : 0;
    const isDone = lesson.pointCount > 0 && learnedCount >= lesson.pointCount;
    const isLearning = learnedCount > 0 || (heroLesson ? lesson.id === heroLesson.id : false);
    const status: GrammarRoadmapLesson["status"] = isDone
      ? "done"
      : isLearning
        ? "current"
        : "todo";

    return {
      id: lesson.id,
      href: buildGrammarHref({ level, lessonId: lesson.id }),
      lessonNumber: displayLessonNumber,
      title: lessonDisplayTitle(displayLessonNumber, lesson.title),
      topic: displayTopic(lesson.topic),
      pointCount: lesson.pointCount,
      learnedCount,
      progress,
      status,
    };
  });

  return (
    <section
      className={
        selectedLesson
          ? "rounded-[2rem] bg-[#f7f8ff] p-3 shadow-[0_18px_46px_rgba(15,23,42,0.08)] sm:p-4"
          : "space-y-8 rounded-[2rem] bg-[#F8FAFC] p-5 sm:p-6"
      }
    >
      {!selectedLesson ? (
      <div className="relative overflow-hidden rounded-[2rem] border border-white/70 bg-white/55 p-5 shadow-[0_22px_48px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:p-6">
        <div className="pointer-events-none absolute -right-14 -top-16 h-52 w-52 rounded-full bg-[radial-gradient(circle_at_center,rgba(167,139,250,0.2)_0%,rgba(125,211,252,0.12)_44%,rgba(255,255,255,0)_72%)]" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              Minna no Nihongo Grammar
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Ngữ pháp JLPT N5 - N1
            </h1>
            <p className="mt-1.5 text-sm font-medium text-slate-500">
              Dữ liệu đã import từ file PDF của bạn. Có {dataset.lessonCount} bài.
            </p>
          </div>

          {selectedLesson ? (
            <div className="inline-flex rounded-full border border-white/80 bg-white/80 p-1 shadow-[0_10px_20px_rgba(15,23,42,0.08)]">
              {GRAMMAR_LEVELS.map((entry) => (
                <Link
                  key={entry}
                  href={buildGrammarHref({ level: entry })}
                  className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] transition ${
                    level === entry
                      ? "bg-slate-900 text-white shadow-[0_10px_20px_rgba(15,23,42,0.22)]"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-800"
                  }`}
                >
                  {entry}
                </Link>
              ))}
            </div>
          ) : null}
        </div>

        <div className="relative mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
          <div className="h-2.5 rounded-full bg-slate-200/80">
            <div
              className="h-full rounded-full bg-gradient-to-r from-sky-400 to-violet-400 transition-all duration-500"
              style={{ width: `${Math.max(6, overallProgress)}%` }}
            />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            {overallProgress}% bài học hoàn thành
          </p>
        </div>
      </div>
      ) : null}

      {!hasLessons ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-800">
          Chưa có dữ liệu ngữ pháp. Hãy chạy script import PDF để nạp dữ liệu.
        </div>
      ) : selectedLesson ? (
        <div className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)_230px]">
          <aside className="self-start overflow-hidden rounded-[22px] border border-[#ebe9ff] bg-white p-4 shadow-[0_16px_36px_rgba(50,45,120,0.08)]">
            <div className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#f0edff] text-[#7c5cff]">
                <Flower2 className="h-5 w-5" />
              </span>
              <h2 className="text-sm font-black text-[#1a1f3d]">Danh sach bai {level}</h2>
            </div>
            <div className="mt-4 max-h-[70vh] space-y-2 overflow-y-auto pr-1">
              {lessonsByLevel.map((lesson) => {
                const active = lesson.id === selectedLesson.id;
                const displayLessonNumber = toDisplayLessonNumber(lesson.level, lesson.lessonNumber);
                const learnedInLesson = lessonPointLearnedCount.get(lesson.id) ?? 0;
                const lessonDone = lesson.pointCount > 0 && learnedInLesson >= lesson.pointCount;
                return (
                  <Link
                    key={lesson.id}
                    href={buildGrammarHref({ level, lessonId: lesson.id })}
                    className={`flex items-center gap-3 rounded-xl border px-3 py-3 transition ${
                      active
                        ? "border-[#8b6cff] bg-[#f4f1ff] shadow-[0_12px_26px_rgba(124,92,255,0.15)]"
                        : "border-transparent bg-[#fafbff] hover:border-[#e8e3ff] hover:bg-white"
                    }`}
                  >
                    <span
                      className={`grid h-6 w-6 place-items-center rounded-lg ${
                        active ? "bg-[#7c5cff] text-white" : "bg-[#eeeaff] text-[#7c5cff]"
                      }`}
                    >
                      <BookOpen className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-bold text-[#26304f]">
                      Bai {displayLessonNumber}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        lessonDone
                          ? "bg-emerald-50 text-emerald-600"
                          : learnedInLesson > 0
                            ? "bg-blue-50 text-blue-600"
                            : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {learnedInLesson}/{lesson.pointCount}
                    </span>
                  </Link>
                );
              })}
            </div>
          </aside>

          <main className="rounded-[22px] border border-[#ebe9ff] bg-white p-4 shadow-[0_18px_42px_rgba(50,45,120,0.08)] sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Link
                href={buildGrammarHref({ level })}
                className="inline-flex items-center gap-2 rounded-xl border border-[#e5e0ff] bg-white px-3 py-2 text-xs font-bold text-[#6b55dc] shadow-sm transition hover:bg-[#f7f4ff]"
              >
                <ChevronLeft className="h-4 w-4" />
                Quay lai danh sach bai
              </Link>
              <p className="text-sm font-black text-[#7c5cff]">
                Mau {selectedPoint ? selectedPoint.order : 0}/{filteredPoints.length}
              </p>
            </div>

            <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
              <div>
                <span className="rounded-full bg-[#efeaff] px-2.5 py-1 text-xs font-black text-[#7c5cff]">
                  {selectedLesson.level}
                </span>
                <h1 className="mt-2 text-3xl font-black leading-tight text-[#101735]">
                  {selectedLessonTitle}
                </h1>
                <p className="mt-1 text-sm font-medium text-[#6b7288]">
                  Chon mot mau ngu phap ben duoi de xem chi tiet.
                </p>
              </div>

              <form className="relative w-full sm:w-[320px]">
                <input type="hidden" name="level" value={level} />
                <input type="hidden" name="lesson" value={selectedLesson.id} />
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9aa3bd]" />
                <input
                  type="search"
                  name="q"
                  defaultValue={rawQuery}
                  placeholder="Tim theo y nghia, mau cau, vi du..."
                  className="h-11 w-full rounded-xl border border-[#dde4f6] bg-white pl-10 pr-3 text-sm font-semibold text-[#26304f] outline-none transition placeholder:text-[#9aa3bd] focus:border-[#8b6cff] focus:ring-4 focus:ring-[#8b6cff]/10"
                />
                <button type="submit" className="sr-only">Tim</button>
              </form>
            </div>

            {filteredPoints.length === 0 ? (
              <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                Khong co mau nao khop tu khoa tim kiem.
              </p>
            ) : selectedPoint ? (
              <div className="mt-5">
                <GrammarDetail
                  order={selectedPoint.order}
                  title={selectedPoint.title || `Mau ${selectedPoint.order}`}
                  meaning={selectedPoint.meaning || "Chua co y nghia ngan."}
                  usage={
                    selectedPoint.usage.length > 0
                      ? selectedPoint.usage
                      : selectedPoint.content
                          .split("\n")
                          .map((line) => line.trim())
                          .filter(Boolean)
                  }
                  examples={selectedPoint.examples
                    .map((line) => splitExampleLine(line))
                    .filter((example) => Boolean(example.jp || example.vi))
                    .map((example) => ({
                      japanese: example.jp,
                      translation: example.vi,
                    }))}
                  notes={selectedPoint.notes.filter((line) => !shouldHideGrammarNote(line))}
                  initialBookmarked={selectedPointBookmarked}
                />

                <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1.3fr_1fr]">
                  {prevPoint ? (
                    <Link
                      href={buildGrammarHref({
                        level,
                        lessonId: selectedLesson.id,
                        pointId: prevPoint.id,
                        rawQuery,
                      })}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#dde4f6] bg-white px-4 py-3 text-sm font-bold text-[#6b55dc] transition hover:bg-[#f7f4ff]"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Mau truoc
                    </Link>
                  ) : (
                    <span className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#edf0f8] bg-[#f8fafc] px-4 py-3 text-sm font-bold text-slate-400">
                      <ChevronLeft className="h-4 w-4" />
                      Mau truoc
                    </span>
                  )}

                  <Link
                    href={buildGrammarHref({
                      level,
                      lessonId: selectedLesson.id,
                      pointId: selectedPoint.id,
                      rawQuery,
                    })}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#7c5cff] to-[#5b43e9] px-5 py-3 text-sm font-black text-white shadow-[0_16px_28px_rgba(124,92,255,0.28)] transition hover:-translate-y-0.5"
                  >
                    <PenLine className="h-4 w-4" />
                    Luyen tap ngay
                  </Link>

                  {nextPoint ? (
                    <Link
                      href={buildGrammarHref({
                        level,
                        lessonId: selectedLesson.id,
                        pointId: nextPoint.id,
                        rawQuery,
                      })}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#dde4f6] bg-white px-4 py-3 text-sm font-bold text-[#6b55dc] transition hover:bg-[#f7f4ff]"
                    >
                      Mau tiep theo
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  ) : (
                    <span className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#edf0f8] bg-[#f8fafc] px-4 py-3 text-sm font-bold text-slate-400">
                      Mau tiep theo
                      <ChevronRight className="h-4 w-4" />
                    </span>
                  )}
                </div>
              </div>
            ) : null}
          </main>

          <aside className="space-y-4 self-start">
            <section className="rounded-[20px] border border-[#f0dced] bg-[#fff8fb] p-4 shadow-[0_14px_32px_rgba(100,45,90,0.07)]">
              <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-pink-100 text-pink-500">
                  <Lightbulb className="h-4 w-4" />
                </span>
                <h3 className="text-sm font-black text-[#26304f]">Meo nho</h3>
              </div>
              <p className="mt-3 text-sm leading-6 text-[#667085]">{reminderText}</p>
            </section>

            <section className="rounded-[20px] border border-[#e9e5ff] bg-white p-4 shadow-[0_14px_32px_rgba(50,45,120,0.07)]">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-[#7c5cff]" />
                <h3 className="text-sm font-black text-[#26304f]">Tien do bai</h3>
              </div>
              <div className="mt-4 grid place-items-center">
                <div
                  className="grid h-28 w-28 place-items-center rounded-full"
                  style={{
                    background: `conic-gradient(#7c5cff ${selectedLessonProgress * 3.6}deg, #eeeaff 0deg)`,
                  }}
                >
                  <div className="grid h-20 w-20 place-items-center rounded-full bg-white text-center">
                    <p className="text-2xl font-black text-[#7c5cff]">
                      {selectedLessonLearnedCount}/{selectedLesson.pointCount}
                    </p>
                    <p className="text-[11px] font-bold text-[#7a8198]">mau da hoc</p>
                  </div>
                </div>
              </div>
              <p className="mt-3 text-center text-xs font-bold text-[#7a8198]">
                Hoan thanh {selectedLessonProgress}%
              </p>
            </section>

            <section className="rounded-[20px] border border-[#e9edf8] bg-white p-4 shadow-[0_14px_32px_rgba(50,45,120,0.07)]">
              <h3 className="text-sm font-black text-[#26304f]">Mau lien quan</h3>
              <div className="mt-3 space-y-2">
                {relatedPoints.length > 0 ? (
                  relatedPoints.map((point) => (
                    <Link
                      key={point.id}
                      href={buildGrammarHref({
                        level,
                        lessonId: selectedLesson.id,
                        pointId: point.id,
                        rawQuery,
                      })}
                      className="flex items-center justify-between gap-3 rounded-xl px-2 py-2 text-sm font-bold text-[#4b556f] transition hover:bg-[#f7f4ff] hover:text-[#6b55dc]"
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {point.order}. {point.title || `Mau ${point.order}`}
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0" />
                    </Link>
                  ))
                ) : (
                  <p className="rounded-xl bg-[#f8fafc] px-3 py-3 text-sm font-semibold text-[#7a8198]">
                    Bai nay chi co mot mau phu hop.
                  </p>
                )}
              </div>
            </section>

            <section className="rounded-[20px] border border-[#ffe6cc] bg-[#fff8ed] p-4 shadow-[0_14px_32px_rgba(120,70,20,0.07)]">
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-orange-100 text-orange-500">
                  <Sparkles className="h-5 w-5" />
                </span>
                <p className="text-sm font-bold leading-6 text-[#7a5730]">
                  Hoc moi ngay mot chut, tien bo moi ngay mot nhieu.
                </p>
              </div>
            </section>
          </aside>
        </div>
      ) : (
        <GrammarRoadmap
          bookTitle={levelBookTitle}
          overallProgress={overallProgress}
          levelTabs={levelTabs}
          lessons={roadmapLessons}
        />
      )}
    </section>
  );
}




