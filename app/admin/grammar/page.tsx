import Link from "next/link";

import {
  clearAdminGrammarPointsAction,
  createAdminGrammarLessonAction,
  deleteAdminGrammarLessonAction,
  deleteAdminGrammarPointAction,
  uploadAdminGrammarImageAction,
  updateAdminGrammarLessonAction,
} from "@/app/actions/admin-content";
import { AdminGrammarImportForm } from "@/app/components/admin-grammar-import-form";
import { AdminNav } from "@/app/components/admin-nav";
import { requireAdmin } from "@/lib/admin";
import {
  GRAMMAR_LEVELS,
  loadGrammarDataset,
  type GrammarLevel,
} from "@/lib/grammar-dataset";

type SearchParams = Promise<{
  level?: string | string[];
  lesson?: string | string[];
}>;

function pickSingle(value?: string | string[]): string {
  if (!value) {
    return "";
  }
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value;
}

function normalizeLevel(value: string): GrammarLevel {
  const normalized = value.trim().toUpperCase();
  if (normalized === "N1") {
    return "N1";
  }
  if (normalized === "N2") {
    return "N2";
  }
  if (normalized === "N3") {
    return "N3";
  }
  if (normalized === "N4") {
    return "N4";
  }
  return "N5";
}

function levelStyle(level: GrammarLevel, active: GrammarLevel): string {
  if (level !== active) {
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

function levelHref(level: GrammarLevel, lessonId: string | null = null): string {
  const query = new URLSearchParams();
  query.set("level", level);
  if (lessonId) {
    query.set("lesson", lessonId);
  }
  return `/admin/grammar?${query.toString()}`;
}

export default async function AdminGrammarPage(props: { searchParams: SearchParams }) {
  await requireAdmin();

  const params = await props.searchParams;
  const level = normalizeLevel(pickSingle(params.level));
  const requestedLessonId = pickSingle(params.lesson);

  const dataset = await loadGrammarDataset();
  const lessons = dataset.lessons
    .filter((lesson) => lesson.level === level)
    .sort((a, b) => a.lessonNumber - b.lessonNumber);

  const selectedLesson =
    lessons.find((lesson) => lesson.id === requestedLessonId) ?? lessons[0] ?? null;

  const levelCounts = Object.fromEntries(
    GRAMMAR_LEVELS.map((entry) => [
      entry,
      dataset.lessons.filter((lesson) => lesson.level === entry).length,
    ])
  ) as Record<GrammarLevel, number>;

  return (
    <section className="space-y-6 rounded-3xl border border-sky-100 bg-[#d8e5f7] p-6 shadow-[0_8px_28px_rgba(28,78,140,0.08)] [background-image:linear-gradient(rgba(255,255,255,0.3)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.3)_1px,transparent_1px)] [background-size:30px_30px]">
      <div className="rounded-2xl border border-slate-200 bg-white/95 p-6 shadow-sm">
        <h1 className="text-3xl font-bold text-slate-800">Admin ngữ pháp</h1>
        <p className="mt-1 text-sm text-slate-600">
          Tạo bài và import mẫu ngữ pháp để hiện trực tiếp ở trang học.
        </p>
        <div className="mt-4">
          <AdminNav active="grammar" />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {GRAMMAR_LEVELS.map((entry) => (
            <Link
              key={entry}
              href={levelHref(entry)}
              className={`rounded-xl border px-4 py-2 text-sm font-semibold transition ${levelStyle(entry, level)}`}
            >
              {entry} ({levelCounts[entry]})
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[0.95fr_2.05fr]">
        <aside className="rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-sm">
          <form
            action={createAdminGrammarLessonAction}
            className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3"
          >
            <p className="text-sm font-semibold text-slate-700">Tạo bài ngữ pháp {level}</p>
            <input type="hidden" name="level" value={level} />
            <input name="title" className="input-base" placeholder={`Ví dụ: Bài ${level} 1`} />
            <input name="topic" className="input-base" placeholder="Chủ đề (tuỳ chọn)" />
            <input
              name="lessonNumber"
              type="number"
              min={1}
              max={200}
              className="input-base"
              placeholder="Số bài (tuỳ chọn)"
            />
            <button type="submit" className="btn-primary w-full">
              + Tạo bài
            </button>
          </form>

          <h2 className="mt-4 text-xl font-bold text-slate-800">Danh sách bài {level}</h2>
          <div className="mt-3 max-h-[70vh] space-y-2 overflow-y-auto pr-1">
            {lessons.length === 0 ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                Chưa có bài nào ở {level}.
              </p>
            ) : (
              lessons.map((lesson) => {
                const active = selectedLesson?.id === lesson.id;
                return (
                  <article
                    key={lesson.id}
                    className={`rounded-xl border p-3 ${
                      active
                        ? "border-blue-300 bg-blue-50"
                        : "border-slate-200 bg-slate-50 hover:border-slate-300"
                    }`}
                  >
                    <Link href={levelHref(level, lesson.id)} className="block">
                      <p className="font-semibold text-slate-800">
                        Bài {lesson.lessonNumber}: {lesson.title}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">{lesson.pointCount} mẫu</p>
                    </Link>
                    <form action={deleteAdminGrammarLessonAction} className="mt-2">
                      <input type="hidden" name="lessonId" value={lesson.id} />
                      <button
                        type="submit"
                        className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                      >
                        Xoá bài
                      </button>
                    </form>
                  </article>
                );
              })
            )}
          </div>
        </aside>

        <div className="space-y-5 rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-sm">
          {selectedLesson ? (
            <>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <h3 className="text-lg font-bold text-slate-800">Thông tin bài</h3>
                <form action={updateAdminGrammarLessonAction} className="mt-3 grid gap-3">
                  <input type="hidden" name="lessonId" value={selectedLesson.id} />
                  <label className="space-y-1">
                    <span className="text-sm font-semibold text-slate-600">Tên bài</span>
                    <input
                      name="title"
                      defaultValue={selectedLesson.title}
                      className="input-base"
                      required
                    />
                  </label>
                  <div className="grid gap-3 md:grid-cols-[180px_1fr]">
                    <label className="space-y-1">
                      <span className="text-sm font-semibold text-slate-600">Số bài</span>
                      <input
                        name="lessonNumber"
                        type="number"
                        min={1}
                        max={200}
                        defaultValue={selectedLesson.lessonNumber}
                        className="input-base"
                        required
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-sm font-semibold text-slate-600">Chủ đề</span>
                      <input
                        name="topic"
                        defaultValue={selectedLesson.topic || ""}
                        className="input-base"
                      />
                    </label>
                  </div>
                  <button type="submit" className="btn-primary w-fit">
                    Lưu thông tin
                  </button>
                </form>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <h3 className="text-lg font-bold text-slate-800">Import mẫu ngữ pháp</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Hỗ trợ JSON array, JSON-lines. Mỗi object là 1 mẫu.
                </p>
                <div className="mt-3">
                  <AdminGrammarImportForm lessonId={selectedLesson.id} />
                </div>

                <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
                  <h4 className="text-sm font-bold text-slate-700">Upload ảnh trực tiếp</h4>
                  <p className="mt-1 text-xs text-slate-500">
                    Chọn file ảnh ngữ pháp để thêm nhanh vào bài hiện tại.
                  </p>
                  <form action={uploadAdminGrammarImageAction} className="mt-3 grid gap-2">
                    <input type="hidden" name="lessonId" value={selectedLesson.id} />
                    <input
                      name="title"
                      className="input-base"
                      placeholder="Tiêu đề mẫu (tuỳ chọn)"
                    />
                    <input
                      name="meaning"
                      className="input-base"
                      placeholder="Ý nghĩa ngắn (tuỳ chọn)"
                    />
                    <input
                      name="imageFile"
                      type="file"
                      accept="image/*"
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-sky-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-sky-700"
                      required
                    />
                    <button type="submit" className="btn-primary w-fit">
                      Tải ảnh lên bài này
                    </button>
                  </form>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-lg font-bold text-slate-800">
                    Danh sách mẫu ({selectedLesson.points.length})
                  </h3>
                  <form action={clearAdminGrammarPointsAction}>
                    <input type="hidden" name="lessonId" value={selectedLesson.id} />
                    <button
                      type="submit"
                      className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-semibold text-rose-700 hover:bg-rose-100"
                    >
                      Xoá tất cả
                    </button>
                  </form>
                </div>

                {selectedLesson.points.length === 0 ? (
                  <p className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
                    Bài này chưa có mẫu ngữ pháp.
                  </p>
                ) : (
                  <div className="mt-3 max-h-[380px] space-y-2 overflow-y-auto pr-1">
                    {selectedLesson.points.map((point) => (
                      <article
                        key={point.id}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-slate-800">
                              #{point.order} - {point.title}
                            </p>
                            {point.meaning ? (
                              <p className="mt-1 text-sm text-slate-600">{point.meaning}</p>
                            ) : null}
                            {point.image ? (
                              <p className="mt-1 text-xs text-slate-500">Ảnh: {point.image}</p>
                            ) : null}
                          </div>
                          <form action={deleteAdminGrammarPointAction}>
                            <input type="hidden" name="lessonId" value={selectedLesson.id} />
                            <input type="hidden" name="pointId" value={point.id} />
                            <button
                              type="submit"
                              className="rounded-md px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
                            >
                              Xoá
                            </button>
                          </form>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              Chưa có bài nào ở {level}. Tạo bài mới để bắt đầu.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
