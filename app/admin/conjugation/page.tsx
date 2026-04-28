import Link from "next/link";

import {
  clearAdminConjugationLessonAction,
  createAdminConjugationLessonAction,
  deleteAdminConjugationItemAction,
  deleteAdminConjugationLessonAction,
  moveAdminConjugationLessonLevelAction,
  updateAdminConjugationLessonAction,
} from "@/app/actions/admin-conjugation";
import { AdminConjugationImportForm } from "@/app/components/admin-conjugation-import-form";
import { AdminNav } from "@/app/components/admin-nav";
import { requireAdmin } from "@/lib/admin";
import {
  JLPT_LEVELS,
  loadAdminConjugationLibrary,
  normalizeJlptLevel,
  type JlptLevel,
} from "@/lib/admin-conjugation-library";

type SearchParams = Promise<{
  lesson?: string | string[];
  level?: string | string[];
}>;

const LEVEL_ALL = "ALL" as const;
type LevelFilter = JlptLevel | typeof LEVEL_ALL;

function pickSingle(value?: string | string[]): string | null {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function levelStyle(level: LevelFilter, active: LevelFilter): string {
  if (level !== active) {
    return "border-slate-200 bg-white text-slate-700 hover:bg-slate-50";
  }
  if (level === LEVEL_ALL) {
    return "border-slate-700 bg-slate-900 text-white";
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

function levelHref(level: LevelFilter, lessonId: string | null = null): string {
  const query = new URLSearchParams();
  query.set("level", level);
  if (lessonId) {
    query.set("lesson", lessonId);
  }
  return `/admin/conjugation?${query.toString()}`;
}

function parseLevelFilter(value: string | null): LevelFilter {
  const raw = (value ?? "").trim().toUpperCase();
  if (raw === LEVEL_ALL) {
    return LEVEL_ALL;
  }
  return normalizeJlptLevel(value);
}

function levelText(level: LevelFilter): string {
  return level === LEVEL_ALL ? "Tất cả" : level;
}

export default async function AdminConjugationPage(props: {
  searchParams: SearchParams;
}) {
  await requireAdmin();

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
  const allStats = {
    lessonCount: lessons.length,
    itemCount: lessons.reduce((sum, lesson) => sum + lesson.items.length, 0),
  };
  const createDefaultLevel: JlptLevel =
    selectedLevel === LEVEL_ALL ? "N5" : selectedLevel;

  return (
    <section className="space-y-6 rounded-3xl border border-sky-100 bg-[#d8e5f7] p-6 shadow-[0_8px_28px_rgba(28,78,140,0.08)] [background-image:linear-gradient(rgba(255,255,255,0.3)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.3)_1px,transparent_1px)] [background-size:30px_30px]">
      <div className="rounded-2xl border border-slate-200 bg-white/95 p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-slate-800">
              Admin chia thể
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Tạo lesson chia thể và nhập dữ liệu bằng JSON theo từng cấp JLPT.
            </p>
          </div>
          <Link href="/admin" className="btn-soft">
            Về tổng quan
          </Link>
        </div>

        <div className="mt-4">
          <AdminNav active="conjugation" />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={levelHref(LEVEL_ALL)}
            className={`rounded-xl border px-4 py-2 text-sm font-semibold transition ${levelStyle(
              LEVEL_ALL,
              selectedLevel
            )}`}
          >
            <div className="leading-tight">
              <p>Tất cả ({allStats.lessonCount} lesson)</p>
              <p className="text-xs font-medium opacity-80">{allStats.itemCount} mục</p>
            </div>
          </Link>
          {JLPT_LEVELS.map((level) => (
            <Link
              key={level}
              href={levelHref(level)}
              className={`rounded-xl border px-4 py-2 text-sm font-semibold transition ${levelStyle(
                level,
                selectedLevel
              )}`}
            >
              <div className="leading-tight">
                <p>
                  {level} ({levelStats[level].lessonCount} lesson)
                </p>
                <p className="text-xs font-medium opacity-80">
                  {levelStats[level].itemCount} mục
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(310px,1.05fr)_minmax(0,1.95fr)]">
        <aside className="rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-sm">
          <form
            action={createAdminConjugationLessonAction}
            className="space-y-2 rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-sky-50/60 p-3.5"
          >
            <p className="text-sm font-semibold text-slate-700">
              Tạo lesson mới cho {levelText(selectedLevel)}
            </p>
            <input
              name="title"
              placeholder={`Ví dụ: ${createDefaultLevel} - Động từ thể ます`}
              className="input-base"
              maxLength={64}
            />
            {selectedLevel === LEVEL_ALL ? (
              <select name="jlptLevel" defaultValue={createDefaultLevel} className="input-base">
                {JLPT_LEVELS.map((level) => (
                  <option key={`create-${level}`} value={level}>
                    Tạo vào cấp {level}
                  </option>
                ))}
              </select>
            ) : (
              <input type="hidden" name="jlptLevel" value={createDefaultLevel} />
            )}
            <button type="submit" className="btn-primary w-full whitespace-nowrap">
              + Tạo lesson
            </button>
          </form>

          <div className="mt-4 flex items-center justify-between gap-2">
            <h2 className="text-xl font-bold text-slate-800">
              Lesson {levelText(selectedLevel)}
            </h2>
            <span className="chip">{filteredLessons.length}</span>
          </div>

          <div className="mt-3 max-h-[70vh] space-y-2 overflow-y-auto pr-2">
            {filteredLessons.length === 0 ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                Chưa có lesson chia thể ở {levelText(selectedLevel)}.
              </p>
            ) : (
              filteredLessons.map((lesson) => {
                const active = selectedLesson?.id === lesson.id;
                const formDisplayName = lesson.formLabel || lesson.title;
                return (
                  <article
                    key={lesson.id}
                    className={`rounded-xl border p-3 ${
                      active
                        ? "border-blue-300 bg-blue-50"
                        : "border-slate-200 bg-slate-50 hover:border-slate-300"
                    }`}
                  >
                    <Link href={levelHref(selectedLevel, lesson.id)} className="block">
                      <p className="truncate font-semibold text-slate-800" title={formDisplayName}>
                        {formDisplayName}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        {lesson.items.length} mục
                        {lesson.formLabel && lesson.formLabel !== lesson.title
                          ? ` • Lesson: ${lesson.title}`
                          : ""}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Cấp {lesson.jlptLevel}
                        {active ? " • Đang chọn" : ""}
                      </p>
                    </Link>

                    <form action={moveAdminConjugationLessonLevelAction} className="mt-2 flex items-center gap-2">
                      <input type="hidden" name="lessonId" value={lesson.id} />
                      <select
                        name="targetLevel"
                        defaultValue={lesson.jlptLevel}
                        className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                      >
                        {JLPT_LEVELS.map((level) => (
                          <option key={`${lesson.id}-${level}`} value={level}>
                            Chuyển sang {level}
                          </option>
                        ))}
                      </select>
                      <button
                        type="submit"
                        className="rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
                      >
                        Chuyển cấp
                      </button>
                    </form>

                    <form action={deleteAdminConjugationLessonAction} className="mt-2">
                      <input type="hidden" name="lessonId" value={lesson.id} />
                      <button
                        type="submit"
                        className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                      >
                        Xóa lesson
                      </button>
                    </form>
                  </article>
                );
              })
            )}
          </div>
        </aside>

        <div
          key={selectedLesson?.id ?? "no-selected-lesson"}
          className="space-y-5 rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-sm"
        >
          {selectedLesson ? (
            <>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <h3 className="text-lg font-bold text-slate-800">Thông tin lesson</h3>
                <form
                  key={`lesson-info-${selectedLesson.id}`}
                  action={updateAdminConjugationLessonAction}
                  className="mt-3 grid gap-3"
                >
                  <input type="hidden" name="lessonId" value={selectedLesson.id} />
                  <label className="space-y-1">
                    <span className="text-sm font-semibold text-slate-600">Tên lesson</span>
                    <input
                      name="title"
                      defaultValue={selectedLesson.title}
                      className="input-base"
                      maxLength={64}
                      required
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="text-sm font-semibold text-slate-600">Tên thể</span>
                    <input
                      name="formLabel"
                      defaultValue={selectedLesson.formLabel}
                      className="input-base"
                      maxLength={40}
                      placeholder="Ví dụ: Thể て"
                    />
                  </label>

                  <div className="grid gap-3 md:grid-cols-[180px_1fr]">
                    <label className="space-y-1">
                      <span className="text-sm font-semibold text-slate-600">Cấp độ JLPT</span>
                      <select
                        name="jlptLevel"
                        defaultValue={selectedLesson.jlptLevel}
                        className="input-base"
                      >
                        {JLPT_LEVELS.map((level) => (
                          <option key={level} value={level}>
                            {level}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="text-sm font-semibold text-slate-600">Mô tả</span>
                      <input
                        name="description"
                        defaultValue={selectedLesson.description}
                        className="input-base"
                        maxLength={180}
                        placeholder="Ví dụ: Bài luyện chia thể ます / て / ない"
                      />
                    </label>
                  </div>

                  <button type="submit" className="btn-primary w-fit">
                    Lưu thông tin
                  </button>
                </form>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <h3 className="text-lg font-bold text-slate-800">
                  Nhập dữ liệu chia thể bằng JSON
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  Khuyến nghị mỗi item gồm từ gốc + nghĩa + mảng/forms các thể cần học.
                </p>
                <div className="mt-3">
                  <AdminConjugationImportForm
                    key={`import-${selectedLesson.id}`}
                    lessonId={selectedLesson.id}
                    jlptLevel={selectedLevel}
                  />
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-lg font-bold text-slate-800">
                    Danh sách mục chia thể ({selectedLesson.items.length})
                  </h3>
                  <form action={clearAdminConjugationLessonAction}>
                    <input type="hidden" name="lessonId" value={selectedLesson.id} />
                    <button
                      type="submit"
                      className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-semibold text-rose-700 hover:bg-rose-100"
                    >
                      Xóa tất cả
                    </button>
                  </form>
                </div>

                {selectedLesson.items.length === 0 ? (
                  <p className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
                    Lesson này chưa có dữ liệu chia thể.
                  </p>
                ) : (
                  <div className="mt-3 max-h-[560px] space-y-2 overflow-y-auto pr-1">
                    {selectedLesson.items.map((item) => (
                      <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="text-lg font-bold text-slate-800">
                              {item.base}
                              {item.kanji ? ` (${item.kanji})` : ""}
                            </p>
                            <p className="text-sm text-slate-600">
                              {item.reading || "—"} • {item.meaning}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {item.partOfSpeech || "Chưa gán loại từ"}
                              {item.hanviet ? ` • Hán Việt: ${item.hanviet}` : ""}
                            </p>
                            {item.note ? (
                              <p className="mt-1 text-xs text-slate-500">Ghi chú: {item.note}</p>
                            ) : null}
                          </div>

                          <form action={deleteAdminConjugationItemAction}>
                            <input type="hidden" name="lessonId" value={selectedLesson.id} />
                            <input type="hidden" name="itemId" value={item.id} />
                            <button
                              type="submit"
                              className="rounded-md px-2 py-1 text-slate-400 transition hover:bg-rose-100 hover:text-rose-500"
                            >
                              Xóa
                            </button>
                          </form>
                        </div>

                        <div className="mt-2 flex flex-wrap gap-2">
                          {item.forms.length === 0 ? (
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-500">
                              Chưa có thể chia
                            </span>
                          ) : (
                            item.forms.map((form) => (
                              <span
                                key={form.id}
                                className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700"
                              >
                                {form.label}: {form.value}
                              </span>
                            ))
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                Chưa có lesson chia thể nào ở {levelText(selectedLevel)}. Bạn vẫn có thể import JSON để hệ
                thống tự tạo lesson.
              </p>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <h3 className="text-lg font-bold text-slate-800">
                  Nhập dữ liệu chia thể bằng JSON
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  Khi chưa chọn lesson, hệ thống sẽ tự tạo lesson mới từ metadata trong JSON.
                </p>
                <div className="mt-3">
                  <AdminConjugationImportForm lessonId={null} jlptLevel={createDefaultLevel} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
