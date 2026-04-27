import Link from "next/link";

import {
  ConjugationStudyClient,
  type ConjugationStudyItem,
} from "@/app/components/conjugation-study-client";
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

function pickSingle(value?: string | string[]): string | null {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function levelHref(level: JlptLevel, lessonId?: string | null): string {
  const query = new URLSearchParams();
  query.set("level", level);
  if (lessonId) {
    query.set("lesson", lessonId);
  }
  return `/conjugation?${query.toString()}`;
}

function levelButtonClass(level: JlptLevel, activeLevel: JlptLevel): string {
  if (level !== activeLevel) {
    return "border-slate-200 bg-white text-slate-700 hover:bg-slate-50";
  }
  if (level === "N5") {
    return "border-emerald-300 bg-emerald-100 text-emerald-800";
  }
  if (level === "N4") {
    return "border-blue-300 bg-blue-100 text-blue-800";
  }
  if (level === "N3") {
    return "border-amber-300 bg-amber-100 text-amber-800";
  }
  if (level === "N2") {
    return "border-orange-300 bg-orange-100 text-orange-800";
  }
  return "border-rose-300 bg-rose-100 text-rose-800";
}

export default async function ConjugationPage(props: { searchParams: SearchParams }) {
  await requireUser();

  const params = await props.searchParams;
  const library = await loadAdminConjugationLibrary();
  const lessons = [...library.lessons].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt)
  );

  const selectedLevel = normalizeJlptLevel(pickSingle(params.level));
  const filteredLessons = lessons.filter(
    (lesson) => lesson.jlptLevel === selectedLevel
  );
  const requestedLessonId = pickSingle(params.lesson);
  const selectedLesson =
    filteredLessons.find((lesson) => lesson.id === requestedLessonId) ??
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
    <section className="space-y-6 rounded-3xl border border-sky-100 bg-[#d8e5f7] p-6 shadow-[0_8px_28px_rgba(28,78,140,0.08)] [background-image:linear-gradient(rgba(255,255,255,0.3)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.3)_1px,transparent_1px)] [background-size:30px_30px]">
      <div className="rounded-2xl border border-slate-200 bg-white/95 p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-extrabold text-slate-900">Chia thể JLPT</h1>
            <p className="mt-1 text-sm text-slate-600">
              Học theo lesson đã được admin tạo sẵn, dùng để ôn nhanh động từ/tính từ theo các thể.
            </p>
          </div>
          <Link href="/dashboard" className="btn-soft">
            Về tổng quan
          </Link>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {JLPT_LEVELS.map((level) => (
            <Link
              key={level}
              href={levelHref(level)}
              className={`rounded-xl border px-4 py-2 text-sm font-semibold transition ${levelButtonClass(
                level,
                selectedLevel
              )}`}
            >
              <div className="leading-tight">
                <p>
                  {level} ({levelStats[level].lessonCount} lesson)
                </p>
                <p className="text-xs font-medium opacity-80">
                  {levelStats[level].itemCount} mục chia thể
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(290px,1fr)_minmax(0,2fr)]">
        <aside className="rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-sm">
          <h2 className="text-xl font-bold text-slate-800">Lesson {selectedLevel}</h2>
          <p className="mt-1 text-sm text-slate-500">
            Chọn lesson để mở chế độ học chia thể.
          </p>

          <div className="mt-4 max-h-[72vh] space-y-2 overflow-y-auto pr-1">
            {filteredLessons.length === 0 ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                Chưa có lesson chia thể nào ở {selectedLevel}.
              </p>
            ) : (
              filteredLessons.map((lesson) => {
                const active = selectedLesson?.id === lesson.id;
                return (
                  <Link
                    key={lesson.id}
                    href={levelHref(selectedLevel, lesson.id)}
                    className={`block rounded-xl border px-3 py-3 transition ${
                      active
                        ? "border-sky-300 bg-gradient-to-r from-sky-50 to-white shadow-[0_12px_26px_rgba(37,99,235,0.14)]"
                        : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 truncate text-sm font-semibold text-slate-800" title={lesson.title}>
                        {lesson.title}
                      </p>
                      <span className="shrink-0 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
                        {lesson.items.length}
                      </span>
                    </div>
                    {lesson.description ? (
                      <p className="mt-1 line-clamp-2 text-xs text-slate-500">{lesson.description}</p>
                    ) : (
                      <p className="mt-1 text-xs text-slate-400">Không có mô tả.</p>
                    )}
                  </Link>
                );
              })
            )}
          </div>
        </aside>

        <div className="rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-sm">
          {!selectedLesson ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              Chưa có lesson nào để học ở {selectedLevel}.
            </p>
          ) : studyItems.length === 0 ? (
            <div className="space-y-3">
              <h3 className="text-xl font-bold text-slate-800">{selectedLesson.title}</h3>
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                Lesson này chưa có dữ liệu chia thể. Vui lòng chờ admin cập nhật.
              </p>
            </div>
          ) : (
            <ConjugationStudyClient
              level={selectedLesson.jlptLevel}
              lessonTitle={selectedLesson.title}
              lessonDescription={selectedLesson.description}
              items={studyItems}
            />
          )}
        </div>
      </div>
    </section>
  );
}

