import Image from "next/image";
import Link from "next/link";

import { requireUser } from "@/lib/auth";
import { loadGrammarDataset, type GrammarPoint } from "@/lib/grammar-dataset";

type SearchParams = Promise<{
  level?: string | string[];
  lesson?: string | string[];
  point?: string | string[];
  q?: string | string[];
}>;

type LevelFilter = "N5" | "N4";

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
  return value === "N5" || value === "N4";
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

function stripKanaReadingFromSentence(value: string): string {
  return value
    .replace(/\s*\([\u3040-\u30ffー・\s]+\)/g, "")
    .replace(/\s*（[\u3040-\u30ffー・\s]+）/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function splitExampleLine(line: string): { jp: string; vi: string } {
  const text = line.trim();
  if (!text) {
    return { jp: "", vi: "" };
  }

  const separatorIndex = text.lastIndexOf(" - ");
  if (separatorIndex < 0) {
    return {
      jp: stripKanaReadingFromSentence(text),
      vi: "",
    };
  }

  const jp = stripKanaReadingFromSentence(text.slice(0, separatorIndex));
  const vi = text.slice(separatorIndex + 3).trim();

  return { jp, vi };
}

export default async function GrammarPage(props: { searchParams: SearchParams }) {
  await requireUser();

  const dataset = await loadGrammarDataset();
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
  const selectedPointIndex = selectedPoint
    ? filteredPoints.findIndex((point) => point.id === selectedPoint.id)
    : -1;
  const prevPoint =
    selectedPointIndex > 0 ? filteredPoints[selectedPointIndex - 1] ?? null : null;
  const nextPoint =
    selectedPointIndex >= 0 && selectedPointIndex + 1 < filteredPoints.length
      ? filteredPoints[selectedPointIndex + 1] ?? null
      : null;

  const selectedTopic = selectedLesson ? displayTopic(selectedLesson.topic) : null;
  const levelBookTitle =
    level === "N5" ? "Minna no Nihongo I (第1〜25課)" : "Minna no Nihongo II (第26〜50課)";
  const levelTotalPoints = lessonsByLevel.reduce((sum, lesson) => sum + lesson.pointCount, 0);

  return (
    <section className="space-y-6 rounded-3xl border border-sky-100 bg-[#d8e5f7] p-6 shadow-[0_8px_28px_rgba(28,78,140,0.08)] [background-image:linear-gradient(rgba(255,255,255,0.3)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.3)_1px,transparent_1px)] [background-size:30px_30px]">
      <div className="rounded-2xl border border-slate-200 bg-white/95 p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-slate-800">Ngu phap JLPT N5 - N4</h1>
            <p className="mt-1 text-sm text-slate-600">
              Du lieu da import tu file PDF cua ban. Co {dataset.lessonCount} bai.
            </p>
          </div>

          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1">
            <Link
              href={buildGrammarHref({ level: "N5" })}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                level === "N5" ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-200"
              }`}
            >
              N5
            </Link>
            <Link
              href={buildGrammarHref({ level: "N4" })}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                level === "N4" ? "bg-emerald-600 text-white" : "text-slate-700 hover:bg-slate-200"
              }`}
            >
              N4
            </Link>
          </div>
        </div>
      </div>

      {!hasLessons ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-800">
          Chua co du lieu ngu phap. Hay chay script import PDF de nap du lieu.
        </div>
      ) : selectedLesson ? (
        <div className="grid gap-5 lg:grid-cols-[0.95fr_2.05fr]">
          <aside className="rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-sm">
            <h2 className="text-xl font-bold text-slate-800">Danh sach bai {level}</h2>
            <div className="mt-4 max-h-[68vh] space-y-2 overflow-y-auto pr-1">
              {lessonsByLevel.map((lesson) => {
                const active = lesson.id === selectedLesson.id;
                return (
                  <Link
                    key={lesson.id}
                    href={buildGrammarHref({ level, lessonId: lesson.id })}
                    className={`block rounded-xl border px-4 py-3 transition ${
                      active
                        ? "border-blue-300 bg-blue-50"
                        : "border-slate-200 bg-slate-50 hover:border-slate-300"
                    }`}
                  >
                    <p className="text-lg font-semibold text-slate-800">{lesson.title}</p>
                    <p className="mt-1 text-sm text-slate-500">{lesson.pointCount} mau ngu phap</p>
                  </Link>
                );
              })}
            </div>
          </aside>

          <div className="rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-sm">
            <div className="mb-4">
              <Link href={buildGrammarHref({ level })} className="btn-soft text-sm">
                ← Quay lai danh sach bai
              </Link>
            </div>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-500">{selectedLesson.level}</p>
                <h2 className="text-2xl font-bold text-slate-800">{selectedLesson.title}</h2>
                {selectedTopic ? <p className="mt-1 text-sm text-slate-600">Chu de: {selectedTopic}</p> : null}
              </div>

              <form className="flex w-full max-w-xl items-center gap-2">
                <input type="hidden" name="level" value={level} />
                <input type="hidden" name="lesson" value={selectedLesson.id} />
                <input
                  name="q"
                  defaultValue={rawQuery}
                  placeholder="Tim theo y nghia, mau cau, vi du..."
                  className="input-base"
                />
                <button type="submit" className="btn-primary shrink-0">
                  Tim
                </button>
              </form>
            </div>

            {filteredPoints.length === 0 ? (
              <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                Khong co mau nao khop tu khoa tim kiem.
              </p>
            ) : selectedPoint ? (
              <div className="mt-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    href={buildGrammarHref({
                      level,
                      lessonId: selectedLesson.id,
                      rawQuery,
                    })}
                    className="btn-soft text-sm"
                  >
                    ← Quay lai danh sach mau
                  </Link>
                  <p className="text-sm text-slate-500">
                    Mau {selectedPoint.order}/{filteredPoints.length}
                  </p>
                </div>

                <article className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <div className="flex items-center gap-2 text-xl font-semibold text-slate-800">
                    <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-blue-100 px-2 text-sm text-blue-700">
                      {selectedPoint.order}
                    </span>
                    {selectedPoint.title || `Mau ${selectedPoint.order}`}
                  </div>

                  {selectedPoint.image ? (
                    <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white">
                      <Image
                        src={selectedPoint.image}
                        alt={selectedPoint.title || `Mau ${selectedPoint.order}`}
                        width={1200}
                        height={700}
                        className="h-auto w-full object-contain"
                        unoptimized
                      />
                    </div>
                  ) : null}

                  {selectedPoint.meaning ? (
                    <p className="mt-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-900">
                      <span className="font-semibold">Y nghia:</span> {selectedPoint.meaning}
                    </p>
                  ) : null}

                  {selectedPoint.usage.length > 0 ? (
                    <div className="mt-3 space-y-1">
                      <p className="text-sm font-semibold text-slate-700">Cach dung</p>
                      {selectedPoint.usage.map((line, index) => (
                        <p
                          key={`${selectedPoint.id}-usage-${index}`}
                          className="break-words text-sm leading-relaxed text-slate-700"
                        >
                          - {line}
                        </p>
                      ))}
                    </div>
                  ) : null}

                  {selectedPoint.examples.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      <p className="text-sm font-semibold text-slate-700">Vi du</p>
                      {selectedPoint.examples.map((line, index) => {
                        const example = splitExampleLine(line);
                        if (!example.jp && !example.vi) {
                          return null;
                        }
                        return (
                          <div
                            key={`${selectedPoint.id}-example-${index}`}
                            className="space-y-1 rounded-lg bg-white px-3 py-2"
                          >
                            {example.jp ? (
                              <p className="break-words text-sm leading-relaxed text-slate-800">
                                {example.jp}
                              </p>
                            ) : null}
                            {example.vi ? (
                              <p className="break-words text-sm leading-relaxed text-slate-600">
                                {example.vi}
                              </p>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}

                  {selectedPoint.notes.length > 0 ? (
                    <div className="mt-3 space-y-1">
                      <p className="text-sm font-semibold text-slate-700">Chu y</p>
                      {selectedPoint.notes.map((line, index) => (
                        <p
                          key={`${selectedPoint.id}-note-${index}`}
                          className="break-words text-sm leading-relaxed text-slate-700"
                        >
                          - {line}
                        </p>
                      ))}
                    </div>
                  ) : null}

                  {!selectedPoint.meaning &&
                  selectedPoint.usage.length === 0 &&
                  selectedPoint.examples.length === 0 &&
                  selectedPoint.notes.length === 0 ? (
                    <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-white p-3 text-xs text-slate-600">
                      {selectedPoint.content}
                    </pre>
                  ) : null}
                </article>

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
                      ← Mau truoc
                    </Link>
                  ) : (
                    <span className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-2 text-sm text-slate-400">
                      ← Mau truoc
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
                      Mau tiep →
                    </Link>
                  ) : (
                    <span className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-2 text-sm text-slate-400">
                      Mau tiep →
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-6 space-y-3">
                <p className="text-sm text-slate-600">
                  Chon mot mau ngu phap ben duoi de xem chi tiet.
                </p>
                <div className="grid gap-3 md:grid-cols-2">
                  {filteredPoints.map((point) => (
                    <Link
                      key={point.id}
                      href={buildGrammarHref({
                        level,
                        lessonId: selectedLesson.id,
                        pointId: point.id,
                        rawQuery,
                      })}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 transition hover:border-sky-300 hover:bg-sky-50"
                    >
                      <p className="text-xs font-semibold text-slate-500">Mau {point.order}</p>
                      <p className="mt-1 text-xl font-semibold text-slate-800">
                        {point.title || `Mau ${point.order}`}
                      </p>
                      {point.meaning ? (
                        <p className="mt-1 line-clamp-2 text-sm text-slate-600">{point.meaning}</p>
                      ) : null}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-5 rounded-2xl border border-slate-200 bg-white/95 p-6 shadow-sm">
          <div>
            <span className="inline-flex rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
              {level}
            </span>
            <h2 className="mt-3 text-4xl font-extrabold tracking-tight text-slate-900">
              {levelBookTitle}
            </h2>
            <p className="mt-2 text-base text-slate-600">
              {lessonsByLevel.length} bai hoc · {levelTotalPoints} mau ngu phap
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {lessonsByLevel.map((lesson) => (
              <Link
                key={lesson.id}
                href={buildGrammarHref({ level, lessonId: lesson.id })}
                className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[1.7rem] font-bold text-slate-900">Bai {lesson.lessonNumber}</p>
                    <p className="mt-1 line-clamp-2 text-[0.95rem] text-slate-600">
                      {displayTopic(lesson.topic) ?? lesson.title}
                    </p>
                  </div>
                  <span className="text-2xl text-slate-300 transition group-hover:text-sky-500">›</span>
                </div>
                <p className="mt-4 text-[0.92rem] font-medium text-slate-500">{lesson.pointCount} mau cau</p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
