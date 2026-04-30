import Link from "next/link";
import GrammarRoadmap, {
  type GrammarRoadmapLesson,
  type GrammarRoadmapLevelTab,
} from "@/app/grammar/grammar-roadmap";
import GrammarPointCards from "@/app/grammar/grammar-point-cards";
import GrammarDetail from "@/components/GrammarDetail";
import SearchBar from "@/components/SearchBar";

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

  const selectedPoint = requestedPointId
    ? filteredPoints.find((point) => point.id === requestedPointId) ?? null
    : null;
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

  const selectedTopicRaw = selectedLesson ? displayTopic(selectedLesson.topic) : null;
  const selectedLessonTitle = selectedLesson
    ? lessonDisplayTitle(
        toDisplayLessonNumber(selectedLesson.level, selectedLesson.lessonNumber),
        selectedLesson.title
      )
    : "";
  const selectedTopic = selectedTopicRaw;
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
    <section className="space-y-8 rounded-[2rem] bg-[#F8FAFC] p-5 sm:p-6">
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

      {!hasLessons ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-800">
          Chưa có dữ liệu ngữ pháp. Hãy chạy script import PDF để nạp dữ liệu.
        </div>
      ) : selectedLesson ? (
        <div className="grid gap-8 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="self-start rounded-2xl bg-white/90 p-5 shadow-[0_12px_34px_rgba(15,23,42,0.08)] backdrop-blur-xl lg:ml-8">
            <h2 className="text-xl font-bold text-slate-900">Danh sách bài {level}</h2>
            <div className="mt-4 max-h-[66vh] space-y-2 overflow-y-auto pr-1">
              {lessonsByLevel.map((lesson) => {
                const active = lesson.id === selectedLesson.id;
                const learnedInLesson = lessonPointLearnedCount.get(lesson.id) ?? 0;
                return (
                  <Link
                    key={lesson.id}
                    href={buildGrammarHref({ level, lessonId: lesson.id })}
                    className={`group block rounded-full px-4 py-3 transition ${
                      active
                        ? "bg-indigo-50 ring-1 ring-indigo-200 shadow-[0_10px_24px_rgba(99,102,241,0.16)]"
                        : "bg-slate-50/90 hover:bg-white hover:shadow-[0_8px_18px_rgba(15,23,42,0.08)]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="line-clamp-1 text-sm font-semibold text-slate-800">
                        {lessonDisplayTitle(
                          toDisplayLessonNumber(lesson.level, lesson.lessonNumber),
                          lesson.title
                        )}
                      </p>
                      <span className="shrink-0 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-slate-600 shadow-sm">
                        {learnedInLesson}/{lesson.pointCount}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </aside>

          <div className="rounded-2xl bg-white/92 p-6 shadow-[0_14px_36px_rgba(15,23,42,0.08)] backdrop-blur-xl">
            <div className="mb-5">
              <Link href={buildGrammarHref({ level })} className="btn-soft text-sm">
                &larr; Quay lại danh sách bài
              </Link>
            </div>
            <div className="flex flex-wrap items-end justify-between gap-5">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
                  {selectedLesson.level}
                </p>
                <h2 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">
                  {selectedLessonTitle}
                </h2>
                {selectedTopic ? (
                  <p className="mt-1.5 text-sm text-slate-500">Chủ đề: {selectedTopic}</p>
                ) : null}
              </div>

              <form className="w-full sm:w-[280px] lg:w-[340px]">
                <input type="hidden" name="level" value={level} />
                <input type="hidden" name="lesson" value={selectedLesson.id} />
                <SearchBar
                  name="q"
                  defaultValue={rawQuery}
                  placeholder="Tìm theo ý nghĩa, mẫu câu, ví dụ..."
                />
                <button type="submit" className="sr-only">Tìm</button>
              </form>
            </div>

            {filteredPoints.length === 0 ? (
              <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                Không có mẫu nào khớp từ khóa tìm kiếm.
              </p>
            ) : selectedPoint ? (
              <div className="mt-7 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    href={buildGrammarHref({
                      level,
                      lessonId: selectedLesson.id,
                      rawQuery,
                    })}
                    className="btn-soft text-sm"
                  >
                    &larr; Quay lại danh sách mẫu
                  </Link>
                  <p className="text-sm text-slate-500">
                    Mẫu {selectedPoint.order}/{filteredPoints.length}
                  </p>
                </div>

                <GrammarDetail
                  order={selectedPoint.order}
                  title={selectedPoint.title || `Mẫu ${selectedPoint.order}`}
                  meaning={selectedPoint.meaning || "Chưa có ý nghĩa ngắn."}
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
                  quizHref={buildGrammarHref({
                    level,
                    lessonId: selectedLesson.id,
                    pointId: selectedPoint.id,
                    rawQuery,
                  })}
                />

                <div className="flex flex-wrap items-center justify-between gap-2">
                  {prevPoint ? (
                    <Link
                      href={buildGrammarHref({
                        level,
                        lessonId: selectedLesson.id,
                        pointId: prevPoint.id,
                        rawQuery,
                      })}
                      className="btn-soft text-sm"
                    >
                      &larr; Mẫu trước
                    </Link>
                  ) : (
                    <span className="rounded-xl bg-slate-100 px-4 py-2 text-sm text-slate-400">
                      &larr; Mẫu trước
                    </span>
                  )}

                  {nextPoint ? (
                    <Link
                      href={buildGrammarHref({
                        level,
                        lessonId: selectedLesson.id,
                        pointId: nextPoint.id,
                        rawQuery,
                      })}
                      className="btn-primary text-sm"
                    >
                      Mẫu tiếp &rarr;
                    </Link>
                  ) : (
                    <span className="rounded-xl bg-slate-100 px-4 py-2 text-sm text-slate-400">
                      Mẫu tiếp &rarr;
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-7 space-y-4">
                <p className="text-sm text-slate-500">
                  Chọn một mẫu ngữ pháp bên dưới để xem chi tiết.
                </p>
                <GrammarPointCards
                  items={filteredPoints.map((point) => ({
                    id: point.id,
                    href: buildGrammarHref({
                      level,
                      lessonId: selectedLesson.id,
                      pointId: point.id,
                      rawQuery,
                    }),
                    order: point.order,
                    title: point.title || `Mẫu ${point.order}`,
                    meaning: point.meaning,
                  }))}
                />
              </div>
            )}
          </div>
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




