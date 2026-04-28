import Link from "next/link";

import {
  ConjugationStudyClient,
  type ConjugationStudyItem,
} from "@/app/components/conjugation-study-client";
import LessonCard from "@/components/LessonCard";
import {
  JLPT_LEVELS,
  loadAdminConjugationLibrary,
  normalizeJlptLevel,
  type JlptLevel,
} from "@/lib/admin-conjugation-library";
import { requireUser } from "@/lib/auth";

type SearchParams = Promise<{
  level?: string | string[];
  lesson?: string | string[];
}>;

const LEVEL_ALL = "ALL" as const;
type LevelFilter = JlptLevel | typeof LEVEL_ALL;

type ConjugationRoadmapLesson = {
  id: string;
  href: string;
  title: string;
  subtitle: string;
  current: number;
  total: number;
  status: "done" | "learning" | "locked";
};

function pickSingle(value?: string | string[]): string {
  if (!value) {
    return "";
  }
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value;
}

function levelHref(level: LevelFilter, lessonId?: string | null): string {
  const query = new URLSearchParams();
  query.set("level", level);
  if (lessonId) {
    query.set("lesson", lessonId);
  }
  return `/conjugation?${query.toString()}`;
}

function levelBookTitle(level: LevelFilter): string {
  if (level === LEVEL_ALL) {
    return "Tổng hợp tất cả thể từ N5 đến N1";
  }
  if (level === "N5") {
    return "Luyện chia thể cơ bản";
  }
  if (level === "N4") {
    return "Luyện chia thể trung cấp đầu";
  }
  if (level === "N3") {
    return "Luyện chia thể trung cấp";
  }
  if (level === "N2") {
    return "Luyện chia thể nâng cao";
  }
  return "Luyện chia thể học thuật";
}

function formDisplayName(lesson: { formLabel: string; title: string }): string {
  const form = lesson.formLabel.trim();
  if (form) {
    return form;
  }
  return lesson.title.trim() || "Chưa đặt tên thể";
}

function parseLevelFilter(raw: string): LevelFilter {
  if (raw.trim().toUpperCase() === LEVEL_ALL) {
    return LEVEL_ALL;
  }
  return normalizeJlptLevel(raw);
}

function levelText(level: LevelFilter): string {
  return level === LEVEL_ALL ? "tất cả cấp" : level;
}

export default async function ConjugationPage(props: { searchParams: SearchParams }) {
  await requireUser();

  const params = await props.searchParams;
  const library = await loadAdminConjugationLibrary();
  const lessons = [...library.lessons].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt)
  );

  const selectedLevel = parseLevelFilter(pickSingle(params.level));
  const filteredLessons =
    selectedLevel === LEVEL_ALL
      ? lessons
      : lessons.filter((lesson) => lesson.jlptLevel === selectedLevel);

  const requestedLessonId = pickSingle(params.lesson);
  const selectedLesson = requestedLessonId
    ? filteredLessons.find((lesson) => lesson.id === requestedLessonId) ?? null
    : null;

  const lessonsWithData = filteredLessons.filter((lesson) => lesson.items.length > 0).length;
  const overallProgress = filteredLessons.length
    ? Math.round((lessonsWithData / filteredLessons.length) * 100)
    : 0;
  const maxItemCount = filteredLessons.reduce(
    (max, lesson) => Math.max(max, lesson.items.length),
    0
  );
  const focusLesson =
    filteredLessons.find((lesson) => lesson.items.length > 0) ??
    filteredLessons[0] ??
    null;

  const levelStats = Object.fromEntries(
    JLPT_LEVELS.map((level) => {
      const lessonsInLevel = lessons.filter((lesson) => lesson.jlptLevel === level);
      return [
        level,
        {
          lessonCount: lessonsInLevel.length,
          itemCount: lessonsInLevel.reduce((sum, lesson) => sum + lesson.items.length, 0),
        },
      ];
    })
  ) as Record<JlptLevel, { lessonCount: number; itemCount: number }>;
  const allStats = {
    lessonCount: lessons.length,
    itemCount: lessons.reduce((sum, lesson) => sum + lesson.items.length, 0),
  };

  const roadmapLessons: ConjugationRoadmapLesson[] = filteredLessons.map((lesson, index) => {
    const hasData = lesson.items.length > 0;
    const isLearning = selectedLesson
      ? lesson.id === selectedLesson.id
      : Boolean(focusLesson && lesson.id === focusLesson.id && hasData);

    return {
      id: lesson.id,
      href: levelHref(selectedLevel, lesson.id),
      title: formDisplayName(lesson),
      subtitle: `Bài ${index + 1}`,
      current: lesson.items.length,
      total: Math.max(maxItemCount, 1),
      status: !hasData ? "locked" : isLearning ? "learning" : "done",
    };
  });

  const studyItems: ConjugationStudyItem[] = (selectedLesson?.items ?? []).map((item) => ({
    id: item.id,
    base: item.base,
    reading: item.reading,
    kanji: item.kanji,
    hanviet: item.hanviet,
    partOfSpeech: item.partOfSpeech,
    meaning: item.meaning,
    note: item.note,
    forms: item.forms,
  }));

  return (
    <section className="space-y-8 rounded-[2rem] bg-[#F8FAFC] p-5 sm:p-6">
      <div className="relative overflow-hidden rounded-[2rem] border border-white/70 bg-white/55 p-5 shadow-[0_22px_48px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:p-6">
        <div className="pointer-events-none absolute -right-14 -top-16 h-52 w-52 rounded-full bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.2)_0%,rgba(99,102,241,0.12)_44%,rgba(255,255,255,0)_72%)]" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              Conjugation Roadmap
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Chia thể JLPT N5 - N1
            </h1>
            <p className="mt-1.5 text-sm font-medium text-slate-500">
              {levelBookTitle(selectedLevel)} •{" "}
              {(selectedLevel === LEVEL_ALL
                ? allStats.lessonCount
                : levelStats[selectedLevel].lessonCount)}{" "}
              bài •{" "}
              {(selectedLevel === LEVEL_ALL
                ? allStats.itemCount
                : levelStats[selectedLevel].itemCount)}{" "}
              mẫu chia thể
            </p>
          </div>

          <div className="inline-flex rounded-full border border-white/80 bg-white/80 p-1 shadow-[0_10px_20px_rgba(15,23,42,0.08)]">
            <Link
              href={levelHref(LEVEL_ALL)}
              className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] transition ${
                selectedLevel === LEVEL_ALL
                  ? "bg-slate-900 text-white shadow-[0_10px_20px_rgba(15,23,42,0.22)]"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-800"
              }`}
            >
              Tất cả
            </Link>
            {JLPT_LEVELS.map((level) => (
              <Link
                key={level}
                href={levelHref(level)}
                className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] transition ${
                  selectedLevel === level
                    ? "bg-slate-900 text-white shadow-[0_10px_20px_rgba(15,23,42,0.22)]"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-800"
                }`}
              >
                {level}
              </Link>
            ))}
          </div>
        </div>

        <div className="relative mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
          <div className="h-2.5 rounded-full bg-slate-200/80">
            <div
              className="h-full rounded-full bg-gradient-to-r from-sky-400 to-violet-400 transition-all duration-500"
              style={{ width: `${Math.max(6, overallProgress)}%` }}
            />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            {overallProgress}% bài đã có dữ liệu học
          </p>
        </div>
      </div>

      {filteredLessons.length === 0 ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Chưa có lesson chia thể ở {levelText(selectedLevel)}. Vui lòng chờ admin cập nhật dữ liệu.
        </p>
      ) : selectedLesson ? (
        <div className="grid gap-8 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="self-start rounded-2xl bg-white/90 p-5 shadow-[0_12px_34px_rgba(15,23,42,0.08)] backdrop-blur-xl lg:ml-8">
            <h2 className="text-xl font-bold text-slate-900">Danh sách bài {levelText(selectedLevel)}</h2>
            <div className="mt-4 max-h-[66vh] space-y-2 overflow-y-auto pr-1">
              {roadmapLessons.map((lesson) => {
                const active = lesson.id === selectedLesson.id;
                return (
                  <Link
                    key={lesson.id}
                    href={lesson.href}
                    className={`group block rounded-full px-4 py-3 transition ${
                      active
                        ? "bg-indigo-50 ring-1 ring-indigo-200 shadow-[0_10px_24px_rgba(99,102,241,0.16)]"
                        : "bg-slate-50/90 hover:bg-white hover:shadow-[0_8px_18px_rgba(15,23,42,0.08)]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="line-clamp-1 text-sm font-semibold text-slate-800">
                        {lesson.title}
                      </p>
                      <span className="shrink-0 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-slate-600 shadow-sm">
                        {lesson.current}
                      </span>
                    </div>
                    <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{lesson.subtitle}</p>
                  </Link>
                );
              })}
            </div>
          </aside>

          <div className="rounded-2xl bg-white/92 p-6 shadow-[0_14px_36px_rgba(15,23,42,0.08)] backdrop-blur-xl">
            <div className="mb-5">
              <Link href={levelHref(selectedLevel)} className="btn-soft text-sm">
                &larr; Quay lại danh sách bài
              </Link>
            </div>
            <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
                  {selectedLesson.jlptLevel}
                </p>
                <h2 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">
                  {formDisplayName(selectedLesson)}
                </h2>
                {selectedLesson.description ? (
                  <p className="mt-1.5 text-sm text-slate-500">{selectedLesson.description}</p>
                ) : null}
              </div>
            </div>

            {studyItems.length === 0 ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                Bài này chưa có dữ liệu chia thể. Vui lòng chờ admin cập nhật.
              </p>
            ) : (
              <ConjugationStudyClient
                level={selectedLesson.jlptLevel}
                lessonTitle={formDisplayName(selectedLesson)}
                lessonDescription={selectedLesson.description}
                showIntro={false}
                items={studyItems}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-6 rounded-[2rem] bg-[#F8FAFC] p-4 shadow-[0_4px_20px_rgba(0,0,0,0.03)] sm:p-6">
          <header className="space-y-2 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              Visual Study Roadmap
            </p>
            <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
              Lộ trình Chia thể
            </h2>
            <p className="text-sm font-medium text-slate-500">
              Chọn bài để vào màn học chi tiết.
            </p>
          </header>

          <div className="grid gap-x-4 gap-y-6 sm:grid-cols-2 xl:grid-cols-3">
            {roadmapLessons.map((lesson) => (
              <Link key={lesson.id} href={lesson.href} className="block">
                <LessonCard
                  title={lesson.title}
                  subtitle={lesson.subtitle}
                  status={lesson.status}
                  current={lesson.current}
                  total={lesson.total}
                />
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
