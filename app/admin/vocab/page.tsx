import Link from "next/link";

import {
  clearAdminVocabLessonAction,
  createAdminVocabLessonAction,
  deleteAdminVocabItemAction,
  deleteAdminVocabLessonAction,
  updateAdminVocabItemAction,
  updateAdminVocabLessonAction,
} from "@/app/actions/admin-vocab";
import { AdminNav } from "@/app/components/admin-nav";
import { AdminVocabImportForm } from "@/app/components/admin-vocab-import-form";
import { requireAdmin } from "@/lib/admin";
import {
  JLPT_LEVELS,
  loadAdminVocabLibrary,
  normalizeJlptLevel,
  type JlptLevel,
} from "@/lib/admin-vocab-library";

type SearchParams = Promise<{
  lesson?: string | string[];
  edit?: string | string[];
  level?: string | string[];
}>;

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

export default async function AdminVocabPage(props: { searchParams: SearchParams }) {
  await requireAdmin();

  const params = await props.searchParams;
  const library = await loadAdminVocabLibrary();
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

  const levelCounts = Object.fromEntries(
    JLPT_LEVELS.map((level) => [level, lessons.filter((lesson) => lesson.jlptLevel === level).length])
  ) as Record<JlptLevel, number>;

  return (
    <section className="space-y-6 rounded-3xl border border-sky-100 bg-[#d8e5f7] p-6 shadow-[0_8px_28px_rgba(28,78,140,0.08)] [background-image:linear-gradient(rgba(255,255,255,0.3)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.3)_1px,transparent_1px)] [background-size:30px_30px]">
      <div className="rounded-2xl border border-slate-200 bg-white/95 p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-slate-800">Admin vocab library</h1>
            <p className="mt-1 text-sm text-slate-600">Quan ly kho tu vung theo cap do N5-N1 cho toan bo user.</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/vocab" className="btn-soft">
              Ve trang hoc
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
              {level} ({levelCounts[level]})
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[0.95fr_2.05fr]">
        <aside className="rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-sm">
          <form action={createAdminVocabLessonAction} className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-sm font-semibold text-slate-700">Tao lesson moi cho {selectedLevel}</p>
            <input
              name="title"
              placeholder={`Vi du: ${selectedLevel} Bai 1`}
              className="input-base"
              maxLength={64}
            />
            <input type="hidden" name="jlptLevel" value={selectedLevel} />
            <button type="submit" className="btn-primary w-full">
              + Tao lesson
            </button>
          </form>

          <h2 className="mt-4 text-xl font-bold text-slate-800">Danh sach lesson {selectedLevel}</h2>
          <div className="mt-3 max-h-[70vh] space-y-2 overflow-y-auto pr-1">
            {filteredLessons.length === 0 ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                Chua co lesson nao o {selectedLevel}.
              </p>
            ) : (
              filteredLessons.map((lesson) => {
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
                    <Link href={levelHref(selectedLevel, lesson.id)} className="block">
                      <p className="font-semibold text-slate-800">{lesson.title}</p>
                      <p className="mt-1 text-sm text-slate-500">{lesson.items.length} tu vung</p>
                    </Link>
                    <form action={deleteAdminVocabLessonAction} className="mt-2">
                      <input type="hidden" name="lessonId" value={lesson.id} />
                      <button
                        type="submit"
                        className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                      >
                        Xoa lesson
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
                <h3 className="text-lg font-bold text-slate-800">Thong tin lesson</h3>
                <form action={updateAdminVocabLessonAction} className="mt-3 grid gap-3">
                  <input type="hidden" name="lessonId" value={selectedLesson.id} />
                  <label className="space-y-1">
                    <span className="text-sm font-semibold text-slate-600">Ten lesson</span>
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
                      <span className="text-sm font-semibold text-slate-600">Cap do JLPT</span>
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
                      <span className="text-sm font-semibold text-slate-600">Mo ta</span>
                      <input
                        name="description"
                        defaultValue={selectedLesson.description}
                        className="input-base"
                        maxLength={180}
                        placeholder="Mo ta ngan cho bo tu vung"
                      />
                    </label>
                  </div>
                  <button type="submit" className="btn-primary w-fit">
                    Luu thong tin
                  </button>
                </form>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <h3 className="text-lg font-bold text-slate-800">Nhap tu vung vao lesson</h3>
                <p className="mt-1 text-sm text-slate-600">Ho tro JSON, text thuong, tab, pipe...</p>
                <div className="mt-3">
                  <AdminVocabImportForm lessonId={selectedLesson.id} />
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-lg font-bold text-slate-800">Danh sach tu ({items.length})</h3>
                  <form action={clearAdminVocabLessonAction}>
                    <input type="hidden" name="lessonId" value={selectedLesson.id} />
                    <button
                      type="submit"
                      className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-semibold text-rose-700 hover:bg-rose-100"
                    >
                      Xoa tat ca
                    </button>
                  </form>
                </div>

                {items.length === 0 ? (
                  <p className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
                    Lesson nay chua co tu vung.
                  </p>
                ) : (
                  <div className="mt-3 max-h-[380px] space-y-2 overflow-x-auto overflow-y-auto pr-1">
                    <div className="grid min-w-[960px] grid-cols-[1fr_1fr_1fr_1fr_0.8fr_1.2fr_auto] items-center gap-3 rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <span>Word</span>
                      <span>Reading</span>
                      <span>Kanji</span>
                      <span>Han Viet</span>
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
                                  Luu
                                </button>
                                <Link
                                  href={levelHref(selectedLevel, selectedLesson.id)}
                                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500"
                                >
                                  Huy
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
                                    Xoa
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
              Chua co lesson nao o {selectedLevel}. Tao lesson moi de bat dau.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
