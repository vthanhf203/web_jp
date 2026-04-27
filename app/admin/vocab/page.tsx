import Link from "next/link";

import {
  clearAdminVocabLessonAction,
  createAdminVocabLessonAction,
  deleteAdminVocabImportHistoryAction,
  deleteAdminVocabItemAction,
  deleteAdminVocabLessonAction,
  rollbackAdminVocabImportAction,
  updateAdminVocabItemAction,
  updateAdminVocabLessonAction,
} from "@/app/actions/admin-vocab";
import { AdminNav } from "@/app/components/admin-nav";
import { AdminVocabImportForm } from "@/app/components/admin-vocab-import-form";
import { AdminVocabLessonBundleImportForm } from "@/app/components/admin-vocab-lesson-bundle-import-form";
import { AdminVocabScrollRestore } from "@/app/components/admin-vocab-scroll-restore";
import { AdminVocabSyncForm } from "@/app/components/admin-vocab-sync-form";
import { requireAdmin } from "@/lib/admin";
import {
  JLPT_LEVELS,
  loadAdminVocabLibrary,
  loadAdminVocabImportHistory,
  normalizeJlptLevel,
  type JlptLevel,
} from "@/lib/admin-vocab-library";

type SearchParams = Promise<{
  lesson?: string | string[];
  edit?: string | string[];
  level?: string | string[];
}>;

type ExportLevel = JlptLevel | "ALL";

function pickSingle(value?: string | string[]): string | null {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function levelStyle(level: JlptLevel, active: JlptLevel): string {
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

function levelHref(level: JlptLevel, lessonId: string | null = null): string {
  const query = new URLSearchParams();
  query.set("level", level);
  if (lessonId) {
    query.set("lesson", lessonId);
  }
  return `/admin/vocab?${query.toString()}`;
}

function buildVocabPrintHref(level: ExportLevel, lessonId?: string): string {
  const query = new URLSearchParams();
  query.set("level", level);
  if (lessonId) {
    query.set("lesson", lessonId);
  }
  return `/admin/vocab/print?${query.toString()}`;
}

function formatDateTime(value: string): string {
  try {
    return new Intl.DateTimeFormat("vi-VN", {
      dateStyle: "short",
      timeStyle: "medium",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export default async function AdminVocabPage(props: { searchParams: SearchParams }) {
  await requireAdmin();

  const params = await props.searchParams;
  const [library, importHistory] = await Promise.all([
    loadAdminVocabLibrary(),
    loadAdminVocabImportHistory(),
  ]);
  const lessons = [...library.lessons].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const selectedLevel = normalizeJlptLevel(pickSingle(params.level));
  const filteredLessons = lessons.filter((lesson) => lesson.jlptLevel === selectedLevel);
  const requestedLessonId = pickSingle(params.lesson);
  const selectedLesson =
    filteredLessons.find((lesson) => lesson.id === requestedLessonId) ??
    filteredLessons[0] ??
    null;

  const editItemId = pickSingle(params.edit);
  const items = selectedLesson ? [...selectedLesson.items] : [];

  const levelStats = Object.fromEntries(
    JLPT_LEVELS.map((level) => {
      const lessonsInLevel = lessons.filter((lesson) => lesson.jlptLevel === level);
      return [
        level,
        {
          lessonCount: lessonsInLevel.length,
          vocabCount: lessonsInLevel.reduce((sum, lesson) => sum + lesson.items.length, 0),
        },
      ];
    })
  ) as Record<JlptLevel, { lessonCount: number; vocabCount: number }>;

  const aggregateRows = filteredLessons
    .flatMap((lesson) =>
      lesson.items.map((item) => ({
        id: item.id,
        topic: lesson.title,
        level: lesson.jlptLevel,
        word: item.word,
        kanji: item.kanji,
        hanviet: item.hanviet,
        meaning: item.meaning,
      }))
    )
    .sort((a, b) => {
      const topicCompare = a.topic.localeCompare(b.topic, "vi", { sensitivity: "base" });
      if (topicCompare !== 0) {
        return topicCompare;
      }
      return a.word.localeCompare(b.word, "ja", { sensitivity: "base" });
    });
  const aggregatePreviewRows = aggregateRows.slice(0, 240);
  const aggregateIsTruncated = aggregateRows.length > aggregatePreviewRows.length;

  return (
    <section className="space-y-6 rounded-3xl border border-sky-100 bg-[#d8e5f7] p-6 shadow-[0_8px_28px_rgba(28,78,140,0.08)] [background-image:linear-gradient(rgba(255,255,255,0.3)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.3)_1px,transparent_1px)] [background-size:30px_30px]">
      <AdminVocabScrollRestore />
      <div className="rounded-2xl border border-slate-200 bg-white/95 p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-slate-800">Admin vocab library</h1>
            <p className="mt-1 text-sm text-slate-600">Quản lý kho từ vựng theo cấp độ N5-N1 cho toàn bộ user.</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/vocab" className="btn-soft">
              Về trang học
            </Link>
          </div>
        </div>

        <div className="mt-4">
          <AdminNav active="vocab" />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {JLPT_LEVELS.map((level) => (
            <Link
              key={level}
              href={levelHref(level)}
              className={`rounded-xl border px-4 py-2 text-sm font-semibold transition ${levelStyle(level, selectedLevel)}`}
            >
              <div className="leading-tight">
                <p>
                  {level} ({levelStats[level].lessonCount} lesson)
                </p>
                <p className="text-xs font-medium opacity-80">{levelStats[level].vocabCount} từ vựng</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(310px,1.08fr)_minmax(0,1.92fr)]">
        <aside className="rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-sm">
          <form
            action={createAdminVocabLessonAction}
            className="space-y-2 rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-sky-50/60 p-3.5"
          >
            <p className="text-sm font-semibold text-slate-700">Tạo lesson mới cho {selectedLevel}</p>
            <input
              name="title"
              placeholder={`Ví dụ: ${selectedLevel} Bài 1`}
              className="input-base"
              maxLength={64}
            />
            <input type="hidden" name="jlptLevel" value={selectedLevel} />
            <button type="submit" className="btn-primary w-full whitespace-nowrap">
              + Tạo lesson
            </button>
          </form>

          <div className="mt-4 flex items-center justify-between gap-2">
            <h2 className="text-xl font-bold text-slate-800">Danh sách lesson {selectedLevel}</h2>
            <span className="chip">{filteredLessons.length} lesson</span>
          </div>
          <div
            className="mt-3 max-h-[70vh] space-y-2 overflow-y-auto pr-2"
            data-scroll-restore-key="admin-vocab-lesson-list"
          >
            {filteredLessons.length === 0 ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                Chưa có lesson nào ở {selectedLevel}.
              </p>
            ) : (
              filteredLessons.map((lesson) => {
                const active = selectedLesson?.id === lesson.id;
                return (
                  <article
                    key={lesson.id}
                    className={`rounded-xl border p-3 transition ${
                      active
                        ? "border-sky-300 bg-gradient-to-r from-sky-50 to-white shadow-[0_12px_26px_rgba(37,99,235,0.14)]"
                        : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white"
                    }`}
                  >
                    <Link href={levelHref(selectedLevel, lesson.id)} className="block rounded-lg">
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 truncate text-base font-semibold text-slate-800" title={lesson.title}>
                          {lesson.title}
                        </p>
                        <span className="shrink-0 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700">
                          {lesson.items.length} từ
                        </span>
                      </div>
                      <p className="mt-1 text-xs font-medium text-slate-500">
                        Cấp {lesson.jlptLevel}
                        {active ? " • Đang chọn" : ""}
                      </p>
                    </Link>
                    <form action={deleteAdminVocabLessonAction} className="mt-2">
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

        <div className="space-y-5 rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-sm">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-lg font-bold text-slate-800">Import JSON tự tạo lesson</h3>
            <p className="mt-1 text-sm text-slate-600">
              Hỗ trợ 3 dạng JSON: <code>lessons</code>, object theo chủ đề, hoặc mảng{" "}
              <code>[{"{ categoryKey, categoryName, items }"}]</code> để tạo/cập nhật nhiều lesson cùng lúc.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Lesson mới mặc định sẽ vào cấp {selectedLevel} (có thể ghi đè bằng <code>jlptLevel</code> trong JSON).
            </p>
            <div className="mt-3">
              <AdminVocabLessonBundleImportForm defaultJlptLevel={selectedLevel} />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Lịch sử import JSON</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Xem các lần import gần đây và hoàn tác khi lỡ nhập nhầm.
                </p>
              </div>
              <span className="chip">{importHistory.length} lần</span>
            </div>

            {importHistory.length === 0 ? (
              <p className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
                Chưa có lịch sử import.
              </p>
            ) : (
              <div
                className="mt-3 max-h-[320px] space-y-2 overflow-y-auto pr-1"
                data-scroll-restore-key="admin-vocab-import-history"
              >
                {importHistory.map((entry) => (
                  <article key={entry.id} className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">
                          {entry.source === "bundle" ? "Import nhiều lesson" : "Import vào lesson"}
                        </p>
                        <p className="text-xs text-slate-500">{formatDateTime(entry.createdAt)}</p>
                      </div>
                      {entry.rolledBackAt ? (
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                          Đã hoàn tác
                        </span>
                      ) : (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                          Đang hiệu lực
                        </span>
                      )}
                    </div>

                    <p className="mt-2 text-xs text-slate-600">
                      {entry.importedRows} từ • {entry.lessonChanges.length} lesson bị tác động
                      {entry.createdLessonIds.length > 0
                        ? ` • ${entry.createdLessonIds.length} lesson mới`
                        : ""}
                      {entry.noKanjiCount > 0 ? ` • ${entry.noKanjiCount} từ chưa có kanji` : ""}
                    </p>

                    <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                      Lesson:{" "}
                      {entry.lessonChanges.map((change) => `${change.lessonTitle} (${change.jlptLevel})`).join(", ")}
                    </p>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {!entry.rolledBackAt ? (
                        <form action={rollbackAdminVocabImportAction}>
                          <input type="hidden" name="entryId" value={entry.id} />
                          <button
                            type="submit"
                            className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-700 transition hover:bg-orange-100"
                          >
                            Hoàn tác import này
                          </button>
                        </form>
                      ) : null}

                      <form action={deleteAdminVocabImportHistoryAction}>
                        <input type="hidden" name="entryId" value={entry.id} />
                        <button
                          type="submit"
                          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
                        >
                          Xóa log
                        </button>
                      </form>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>

          {selectedLesson ? (
            <>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <h3 className="text-lg font-bold text-slate-800">Thông tin lesson</h3>
                <form action={updateAdminVocabLessonAction} className="mt-3 grid gap-3">
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
                        placeholder="Mô tả ngắn cho bộ từ vựng"
                      />
                    </label>
                  </div>
                  <button type="submit" className="btn-primary w-fit">
                    Lưu thông tin
                  </button>
                </form>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <h3 className="text-lg font-bold text-slate-800">Nhập từ vựng vào lesson</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Khung này chỉ nhập vào lesson đang mở (JSON mảng 1 lesson), hỗ trợ thêm text thường, tab, pipe...
                </p>
                <div className="mt-3">
                  <AdminVocabImportForm lessonId={selectedLesson.id} />
                </div>
                <div className="mt-4">
                  <p className="text-sm font-semibold text-slate-700">Sync từ URL/API</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Dán URL JSON, hệ thống sẽ parse và nạp vào lesson hiện tại.
                  </p>
                  <div className="mt-2">
                    <AdminVocabSyncForm lessonId={selectedLesson.id} />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-lg font-bold text-slate-800">Danh sách từ ({items.length})</h3>
                  <form action={clearAdminVocabLessonAction}>
                    <input type="hidden" name="lessonId" value={selectedLesson.id} />
                    <button
                      type="submit"
                      className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-semibold text-rose-700 hover:bg-rose-100"
                    >
                      Xóa tất cả
                    </button>
                  </form>
                </div>

                {items.length === 0 ? (
                  <p className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
                    Lesson này chưa có từ vựng.
                  </p>
                ) : (
                  <div
                    className="mt-3 max-h-[380px] space-y-2 overflow-x-auto overflow-y-auto pr-1"
                    data-scroll-restore-key="admin-vocab-item-list"
                  >
                    <div className="grid min-w-[960px] grid-cols-[1fr_1fr_1fr_1fr_0.8fr_1.2fr_auto] items-center gap-3 rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <span>Word</span>
                      <span>Reading</span>
                      <span>Kanji</span>
                      <span>Hán Việt</span>
                      <span className="text-center">POS</span>
                      <span>Meaning</span>
                      <span className="text-right">Action</span>
                    </div>
                    {items.map((item) => {
                      const isEditing = editItemId === item.id;
                      return (
                        <div
                          key={item.id}
                          className="grid min-w-[960px] grid-cols-[1fr_1fr_1fr_1fr_0.8fr_1.2fr_auto] items-center gap-3 rounded-lg bg-white px-3 py-2"
                        >
                          {isEditing ? (
                            <form
                              action={updateAdminVocabItemAction}
                              className="col-span-7 grid grid-cols-[1fr_1fr_1fr_1fr_0.8fr_1.2fr_auto] items-center gap-3"
                            >
                              <input type="hidden" name="lessonId" value={selectedLesson.id} />
                              <input type="hidden" name="itemId" value={item.id} />
                              <input
                                name="word"
                                defaultValue={item.word}
                                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
                                required
                              />
                              <input
                                name="reading"
                                defaultValue={item.reading}
                                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                              />
                              <input
                                name="kanji"
                                defaultValue={item.kanji || ""}
                                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                              />
                              <input
                                name="hanviet"
                                defaultValue={item.hanviet || ""}
                                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                              />
                              <input
                                name="partOfSpeech"
                                defaultValue={item.partOfSpeech || ""}
                                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                              />
                              <input
                                name="meaning"
                                defaultValue={item.meaning}
                                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                                required
                              />
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="submit"
                                  className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700"
                                >
                                  Lưu
                                </button>
                                <Link
                                  href={levelHref(selectedLevel, selectedLesson.id)}
                                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500"
                                >
                                  Hủy
                                </Link>
                              </div>
                            </form>
                          ) : (
                            <>
                              <p className="font-semibold text-slate-800">{item.word}</p>
                              <p className="text-slate-600">{item.reading || "-"}</p>
                              <p className="text-slate-600">{item.kanji || "-"}</p>
                              <p className="text-slate-600">{item.hanviet || "-"}</p>
                              <p className="text-center text-slate-500">{item.partOfSpeech || "-"}</p>
                              <p className="text-slate-700">{item.meaning}</p>
                              <div className="flex items-center justify-end gap-2">
                                <Link
                                  href={`/admin/vocab?level=${selectedLevel}&lesson=${selectedLesson.id}&edit=${item.id}`}
                                  className="rounded-md px-2 py-1 text-slate-400 transition hover:bg-slate-200 hover:text-slate-600"
                                >
                                  Edit
                                </Link>
                                <form action={deleteAdminVocabItemAction}>
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
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          ) : (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              Chưa có lesson nào ở {selectedLevel}. Tạo lesson mới để bắt đầu.
            </p>
          )}

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-800">
                  Tổng hợp từ vựng theo chủ đề ({selectedLevel})
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  Gồm các cột: từ, nghĩa, Hán Việt, Kanji và chủ đề (lesson).
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {selectedLesson ? (
                  <Link
                    href={buildVocabPrintHref(selectedLevel, selectedLesson.id)}
                    target="_blank"
                    className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100"
                  >
                    Xuất PDF chủ đề: {selectedLesson.title}
                  </Link>
                ) : null}
                <Link
                  href={buildVocabPrintHref(selectedLevel)}
                  target="_blank"
                  className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-100"
                >
                  Xuất PDF {selectedLevel}
                </Link>
                <Link
                  href={buildVocabPrintHref("ALL")}
                  target="_blank"
                  className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
                >
                  Xuất PDF tất cả cấp
                </Link>
              </div>
            </div>

            {aggregateRows.length === 0 ? (
              <p className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
                Chưa có dữ liệu từ vựng ở {selectedLevel}.
              </p>
            ) : (
              <div className="mt-3 max-h-[440px] overflow-auto rounded-lg border border-slate-200 bg-white">
                <table className="min-w-[880px] table-auto border-collapse text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
                    <tr>
                      <th className="border-b border-slate-200 px-3 py-2 text-left">Từ</th>
                      <th className="border-b border-slate-200 px-3 py-2 text-left">Kanji</th>
                      <th className="border-b border-slate-200 px-3 py-2 text-left">Hán Việt</th>
                      <th className="border-b border-slate-200 px-3 py-2 text-left">Nghĩa</th>
                      <th className="border-b border-slate-200 px-3 py-2 text-left">Chủ đề</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aggregatePreviewRows.map((row) => (
                      <tr key={`${row.topic}-${row.id}`} className="odd:bg-white even:bg-slate-50/60">
                        <td className="border-b border-slate-100 px-3 py-2 font-semibold text-slate-800">
                          {row.word}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-2 text-slate-700">
                          {row.kanji || "-"}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-2 text-slate-700">
                          {row.hanviet || "-"}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-2 text-slate-700">
                          {row.meaning}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-2 text-slate-600">
                          {row.topic}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="mt-2 text-xs text-slate-500">
              Hiển thị {aggregatePreviewRows.length}/{aggregateRows.length} từ.
              {aggregateIsTruncated ? " Bảng preview đã giới hạn để trang không bị nặng." : ""}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
