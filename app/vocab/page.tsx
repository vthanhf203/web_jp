import Link from "next/link";

import {
  clearVocabLessonAction,
  createVocabLessonAction,
  deleteVocabLessonAction,
  deleteVocabItemAction,
  renameVocabLessonAction,
  updateVocabItemAction,
} from "@/app/actions/vocab-manager";
import { VocabImportForm } from "@/app/components/vocab-import-form";
import { requireUser } from "@/lib/auth";
import {
  JLPT_LEVELS,
  loadAdminVocabLibrary,
  normalizeJlptLevel,
  type JlptLevel,
} from "@/lib/admin-vocab-library";
import { loadUserVocabStore } from "@/lib/vocab-store";

type SearchParams = Promise<{
  lesson?: string | string[];
  edit?: string | string[];
  editLesson?: string | string[];
  level?: string | string[];
  mode?: string | string[];
}>;

function pickSingle(value?: string | string[]): string | null {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

const levelMeta: Record<
  JlptLevel,
  {
    jpLabel: string;
    colorBar: string;
    buttonActive: string;
    cardShell: string;
    cardInner: string;
    cardBottom: string;
  }
> = {
  N5: {
    jpLabel: "日本語能力試験 N5",
    colorBar: "bg-blue-500",
    buttonActive: "border-blue-300 bg-blue-100 text-blue-800",
    cardShell: "border-[#9ca3af] bg-[#facc15]",
    cardInner: "bg-[#f5f0dc]",
    cardBottom: "bg-emerald-600 text-white",
  },
  N4: {
    jpLabel: "日本語能力試験 N4",
    colorBar: "bg-emerald-500",
    buttonActive: "border-emerald-300 bg-emerald-100 text-emerald-800",
    cardShell: "border-[#9ca3af] bg-[#9333ea]",
    cardInner: "bg-[#e9ddf5]",
    cardBottom: "bg-emerald-600 text-white",
  },
  N3: {
    jpLabel: "日本語能力試験 N3",
    colorBar: "bg-amber-500",
    buttonActive: "border-amber-300 bg-amber-100 text-amber-800",
    cardShell: "border-[#9ca3af] bg-[#f59e0b]",
    cardInner: "bg-[#f8ead1]",
    cardBottom: "bg-amber-700 text-white",
  },
  N2: {
    jpLabel: "日本語能力試験 N2",
    colorBar: "bg-orange-500",
    buttonActive: "border-orange-300 bg-orange-100 text-orange-800",
    cardShell: "border-[#9ca3af] bg-[#f97316]",
    cardInner: "bg-[#ffe2cf]",
    cardBottom: "bg-orange-700 text-white",
  },
  N1: {
    jpLabel: "日本語能力試験 N1",
    colorBar: "bg-rose-500",
    buttonActive: "border-rose-300 bg-rose-100 text-rose-800",
    cardShell: "border-[#9ca3af] bg-[#ef4444]",
    cardInner: "bg-[#fde0e0]",
    cardBottom: "bg-rose-700 text-white",
  },
};

export default async function VocabPage(props: { searchParams: SearchParams }) {
  const user = await requireUser();
  const params = await props.searchParams;
  const store = await loadUserVocabStore(user.id);
  const adminLibrary = await loadAdminVocabLibrary();
  const lessons = [...store.lessons].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt)
  );
  const adminLessons = [...adminLibrary.lessons].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt)
  );

  const requestedLessonId = pickSingle(params.lesson);
  const editItemId = pickSingle(params.edit);
  const editLessonId = pickSingle(params.editLesson);
  const requestedMode = pickSingle(params.mode);
  const activeMode: "library" | "self" =
    requestedMode === "self" || requestedMode === "library"
      ? requestedMode
      : requestedLessonId || editItemId || editLessonId
        ? "self"
        : "library";
  const selectedLevel = normalizeJlptLevel(pickSingle(params.level));
  const selectedLessonId =
    (requestedLessonId && lessons.some((lesson) => lesson.id === requestedLessonId)
      ? requestedLessonId
      : lessons[0]?.id) ?? null;

  const selectedLesson = selectedLessonId
    ? lessons.find((lesson) => lesson.id === selectedLessonId) ?? null
    : null;

  const items = selectedLesson ? [...selectedLesson.items] : [];
  const filteredAdminLessons = adminLessons.filter(
    (lesson) => normalizeJlptLevel(lesson.jlptLevel) === selectedLevel
  );
  const normalizedPersonalLessonTitles = new Set(
    lessons.map((lesson) => lesson.title.trim().toLowerCase())
  );
  const completedTopicCount = filteredAdminLessons.filter((lesson) =>
    normalizedPersonalLessonTitles.has(lesson.title.trim().toLowerCase())
  ).length;
  const topicProgressPercent =
    filteredAdminLessons.length === 0
      ? 0
      : Math.round((completedTopicCount / filteredAdminLessons.length) * 100);
  const totalByLevel = JLPT_LEVELS.map((level) => ({
    level,
    lessonCount: adminLessons.filter(
      (lesson) => normalizeJlptLevel(lesson.jlptLevel) === level
    ).length,
    vocabCount: adminLessons
      .filter((lesson) => normalizeJlptLevel(lesson.jlptLevel) === level)
      .reduce((sum, lesson) => sum + lesson.items.length, 0),
  }));

  function levelHref(level: JlptLevel): string {
    const query = new URLSearchParams();
    query.set("mode", "library");
    query.set("level", level);
    return `/vocab?${query.toString()}`;
  }

  function topicHref(level: JlptLevel, groupId: string): string {
    const query = new URLSearchParams();
    query.set("mode", "library");
    query.set("level", level);
    return `/vocab/group/${groupId}?${query.toString()}`;
  }

  function selfHref(options?: {
    lessonId?: string | null;
    editItemId?: string | null;
    editLessonId?: string | null;
  }): string {
    const query = new URLSearchParams();
    query.set("mode", "self");
    const lessonId = options?.lessonId ?? selectedLessonId;
    if (lessonId) {
      query.set("lesson", lessonId);
    }
    const targetEditItemId = options?.editItemId ?? null;
    const targetEditLessonId = options?.editLessonId ?? null;
    if (targetEditItemId) {
      query.set("edit", targetEditItemId);
    }
    if (targetEditLessonId) {
      query.set("editLesson", targetEditLessonId);
    }
    return `/vocab?${query.toString()}`;
  }

  function levelBadgeClass(level: JlptLevel, active: JlptLevel): string {
    if (level !== active) {
      return "border-slate-200 bg-white text-slate-700 hover:bg-slate-50";
    }
    return levelMeta[level].buttonActive;
  }

  const studyLessonId =
    selectedLesson && selectedLesson.items.length > 0 ? selectedLesson.id : null;

  return (
    <section className="space-y-7 rounded-3xl border border-sky-100 bg-[#d8e5f7] p-7 shadow-[0_8px_28px_rgba(28,78,140,0.08)] [background-image:linear-gradient(rgba(255,255,255,0.3)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.3)_1px,transparent_1px)] [background-size:30px_30px]">
      <div className="rounded-2xl border border-slate-200 bg-white/95 p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-extrabold text-slate-800">Trang Tu Vung</h1>
            <p className="mt-1 text-sm text-slate-600">
              Chon cach hoc ban muon: kham pha kho tu vung hoac tu hoc ca nhan.
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Link
            href={levelHref(selectedLevel)}
            className={`rounded-2xl border px-4 py-4 transition ${
              activeMode === "library"
                ? "border-blue-300 bg-blue-50 shadow-sm"
                : "border-slate-200 bg-white hover:bg-slate-50"
            }`}
          >
            <p className="text-lg font-bold text-slate-800">Kho tu vung admin</p>
            <p className="mt-1 text-sm text-slate-600">
              Xem cac chu de N5-N1 da duoc admin cap nhat.
            </p>
          </Link>
          <Link
            href={selfHref()}
            className={`rounded-2xl border px-4 py-4 transition ${
              activeMode === "self"
                ? "border-emerald-300 bg-emerald-50 shadow-sm"
                : "border-slate-200 bg-white hover:bg-slate-50"
            }`}
          >
            <p className="text-lg font-bold text-slate-800">Tu hoc ca nhan</p>
            <p className="mt-1 text-sm text-slate-600">
              Tao bai rieng, nhap JSON va hoc theo 3 che do.
            </p>
          </Link>
        </div>
      </div>

      <div
        className={`rounded-2xl border border-slate-200 bg-white/95 p-7 shadow-sm ${
          activeMode === "self" ? "" : "hidden"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[2rem] font-bold text-slate-800">Danh sach bai</h1>
          <form action={createVocabLessonAction}>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-lg font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <span className="text-2xl leading-none">+</span>
              <span>Tao bai moi</span>
            </button>
          </form>
        </div>

        {lessons.length === 0 ? (
          <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            Chua co bai hoc nao. Bam &quot;Tao bai moi&quot; de bat dau nhap tu
            vung.
          </p>
        ) : (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {lessons.map((lesson) => {
              const isActive = selectedLessonId === lesson.id;
              const isEditingLesson = editLessonId === lesson.id;
              return (
                <article
                  key={lesson.id}
                  className={`rounded-2xl border-2 px-5 py-4 transition ${
                    isActive
                      ? "border-blue-400 bg-blue-50 shadow-[0_0_0_2px_rgba(59,130,246,0.12)]"
                      : "border-slate-200 bg-slate-50 hover:border-slate-300"
                  }`}
                >
                  {isEditingLesson ? (
                    <form action={renameVocabLessonAction} className="space-y-2">
                      <input type="hidden" name="lessonId" value={lesson.id} />
                      <input
                        name="title"
                        defaultValue={lesson.title}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base font-semibold text-slate-800"
                        required
                        maxLength={64}
                      />
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="submit"
                          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700"
                        >
                          Luu ten
                        </button>
                        <Link
                          href={selfHref({ lessonId: lesson.id })}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500"
                        >
                          Huy
                        </Link>
                      </div>
                    </form>
                  ) : (
                    <Link href={selfHref({ lessonId: lesson.id })} className="block">
                      <p className="text-2xl font-bold text-slate-800">{lesson.title}</p>
                      <p className="mt-2 text-base font-semibold text-blue-500">
                        {lesson.items.length} tu vung
                      </p>
                    </Link>
                  )}

                  <div className="mt-3 flex items-center justify-between gap-2">
                    <Link
                      href={selfHref({ lessonId: lesson.id, editLessonId: lesson.id })}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      Sua ten
                    </Link>
                    <form action={deleteVocabLessonAction}>
                      <input type="hidden" name="lessonId" value={lesson.id} />
                      <button
                        type="submit"
                        className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-100"
                      >
                        Xoa bai
                      </button>
                    </form>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <div
        className={`rounded-2xl border border-slate-200 bg-white/95 p-7 shadow-sm ${
          activeMode === "self" ? "" : "hidden"
        }`}
      >
        <div className="mb-4 flex items-center gap-2">
          <h2 className="text-[2rem] font-bold text-slate-800">Nhap tu vung (JSON)</h2>
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 text-sm text-slate-400">
            ?
          </span>
        </div>
        <VocabImportForm lessonId={selectedLessonId} />
      </div>

      <div
        className={`rounded-2xl border border-slate-200 bg-white/95 p-7 shadow-sm ${
          activeMode === "library" ? "" : "hidden"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="inline bg-blue-500/85 px-2 text-[2.3rem] font-extrabold leading-tight text-slate-900">
              Hoc Ban Chat - Khong Hoc Vet
            </h2>
            <p className="mt-3 text-[1.35rem] text-slate-700">
              Khong chi la nghia cua tu ma la cach dung dung cua tu trong cau vi du.
            </p>
            <p className="mt-1 text-[1.35rem] text-slate-700">
              Website nay giup ban nam duoc Kanji, am Han Viet va nho lau hon bang flashcard.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {totalByLevel.map((entry) => (
            <Link
              key={entry.level}
              href={levelHref(entry.level)}
              className={`rounded-xl border px-4 py-3 transition ${levelBadgeClass(
                entry.level,
                selectedLevel
              )}`}
            >
              <p className="text-lg font-bold">{entry.level}</p>
              <p className="text-xs opacity-80">{levelMeta[entry.level].jpLabel}</p>
              <p className="mt-1 text-xs font-semibold">
                {entry.lessonCount} nhom · {entry.vocabCount} tu
              </p>
            </Link>
          ))}
        </div>

        <div className="mt-8 flex items-center gap-3">
          <span className={`h-12 w-1 rounded-full ${levelMeta[selectedLevel].colorBar}`} />
          <div>
            <h3 className="text-5xl font-extrabold text-slate-900">{selectedLevel}</h3>
            <p className="text-2xl text-slate-500">{levelMeta[selectedLevel].jpLabel}</p>
          </div>
        </div>
        <p className="mt-2 text-sm text-slate-500">{filteredAdminLessons.length} chu de</p>

        <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-xl text-slate-700">
            <p className="font-semibold">Tien do hoc</p>
            <p>
              {completedTopicCount}/{filteredAdminLessons.length} chu de
            </p>
          </div>
          <div className="mt-2 h-3 rounded-full bg-slate-200">
            <div
              className="h-3 rounded-full bg-emerald-500 transition-all"
              style={{ width: `${topicProgressPercent}%` }}
            />
          </div>
          <p className="mt-2 text-right text-sm text-slate-500">{topicProgressPercent}% hoan thanh</p>
        </div>

        {filteredAdminLessons.length === 0 ? (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            Chua co nhom tu vung nao cho {selectedLevel}. Admin co the them tai /admin/vocab.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {filteredAdminLessons.map((lesson) => (
              <Link
                key={lesson.id}
                href={topicHref(selectedLevel, lesson.id)}
                className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 transition hover:border-slate-300 hover:bg-white"
              >
                <div className="min-w-0">
                  <p className="truncate text-2xl font-bold text-slate-800">{lesson.title}</p>
                  <p className="mt-1 truncate text-lg text-slate-600">
                    {lesson.description || "Chu de tu vung"}{" "}
                    <span className="text-slate-400">({lesson.items.length} tu)</span>
                  </p>
                </div>
                <span className="text-3xl font-bold text-slate-400">{">"}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div
        className={`rounded-2xl border border-slate-200 bg-white/95 p-7 shadow-sm ${
          activeMode === "self" ? "" : "hidden"
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[2rem] font-bold text-slate-800">
            Danh sach tu vung ({items.length})
          </h2>
          {selectedLessonId ? (
            <form action={clearVocabLessonAction}>
              <input type="hidden" name="lessonId" value={selectedLessonId} />
              <button
                type="submit"
                className="inline-flex items-center gap-2 text-xl font-semibold text-rose-500 transition hover:text-rose-600"
              >
                <span>🗑</span>
                <span>Xoa tat ca</span>
              </button>
            </form>
          ) : null}
        </div>

        {selectedLessonId === null ? (
          <p className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Chon hoac tao mot bai hoc de nhap du lieu.
          </p>
        ) : items.length === 0 ? (
          <p className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Bai nay chua co tu vung nao.
          </p>
        ) : (
          <div className="mt-5 max-h-[380px] overflow-x-auto overflow-y-auto pr-1">
            <div className="space-y-2">
              <div className="grid min-w-[960px] grid-cols-[1fr_1fr_1fr_1fr_0.8fr_1.2fr_auto] items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
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
                    className="grid min-w-[960px] grid-cols-[1fr_1fr_1fr_1fr_0.8fr_1.2fr_auto] items-center gap-3 rounded-xl bg-slate-100 px-3 py-3"
                  >
                    {isEditing ? (
                      <form
                        action={updateVocabItemAction}
                        className="col-span-7 grid grid-cols-[1fr_1fr_1fr_1fr_0.8fr_1.2fr_auto] items-center gap-3"
                      >
                        <input type="hidden" name="lessonId" value={selectedLessonId} />
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
                          required
                        />
                        <input
                          name="kanji"
                          defaultValue={item.kanji ?? ""}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                        />
                        <input
                          name="hanviet"
                          defaultValue={item.hanviet ?? ""}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                        />
                        <input
                          name="partOfSpeech"
                          defaultValue={item.partOfSpeech ?? ""}
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
                            className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700"
                          >
                            Luu
                          </button>
                          <Link
                            href={selfHref({ lessonId: selectedLessonId })}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-500"
                          >
                            Huy
                          </Link>
                        </div>
                      </form>
                    ) : (
                      <>
                        <p className="text-sm font-semibold text-slate-800">{item.word}</p>
                        <p className="text-sm text-slate-700">{item.reading}</p>
                        <p className="text-sm text-slate-700">{item.kanji || "-"}</p>
                        <p className="text-sm text-slate-700">{item.hanviet || "-"}</p>
                        <p className="text-center text-sm text-blue-500">
                          {item.partOfSpeech || "-"}
                        </p>
                        <p className="text-sm text-slate-700">{item.meaning}</p>
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={selfHref({
                              lessonId: selectedLessonId,
                              editItemId: item.id,
                            })}
                            className="rounded-md px-2 py-1 text-slate-400 transition hover:bg-slate-200 hover:text-slate-600"
                          >
                            ✎
                          </Link>
                          <form action={deleteVocabItemAction}>
                            <input type="hidden" name="lessonId" value={selectedLessonId} />
                            <input type="hidden" name="itemId" value={item.id} />
                            <button
                              type="submit"
                              className="rounded-md px-2 py-1 text-slate-400 transition hover:bg-rose-100 hover:text-rose-500"
                            >
                              ✕
                            </button>
                          </form>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div
        className={`rounded-2xl border border-slate-200 bg-white/95 p-7 shadow-sm ${
          activeMode === "self" ? "" : "hidden"
        }`}
      >
        <h2 className="text-[2rem] font-bold text-slate-800">Chon che do hoc</h2>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <article className="rounded-2xl border border-blue-200 bg-blue-50/80 p-6">
            <p className="text-4xl">📚</p>
            <h3 className="mt-3 text-3xl font-bold text-blue-700">Flashcard</h3>
            <p className="mt-3 text-xl leading-relaxed text-blue-700/90">
              Lat the de xem dap an. Phu hop de lam quen voi tu vung moi.
            </p>
            <Link
              href={
                studyLessonId
                  ? `/vocab/learn?lesson=${studyLessonId}&mode=flashcard`
                  : "#"
              }
              className={`mt-6 inline-flex w-full items-center justify-center rounded-xl px-5 py-3 text-xl font-semibold text-white transition ${
                studyLessonId
                  ? "bg-blue-600 hover:bg-blue-700"
                  : "pointer-events-none cursor-not-allowed bg-slate-300"
              }`}
            >
              Bat dau Flashcard
            </Link>
          </article>

          <article className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-6">
            <p className="text-4xl">🎯</p>
            <h3 className="mt-3 text-3xl font-bold text-emerald-700">Trac nghiem</h3>
            <p className="mt-3 text-xl leading-relaxed text-emerald-700/90">
              Xem tu vung, chon cach doc. Kiem tra nhanh kien thuc.
            </p>
            <Link
              href={
                studyLessonId
                  ? `/vocab/learn?lesson=${studyLessonId}&mode=quiz`
                  : "#"
              }
              className={`mt-6 inline-flex w-full items-center justify-center rounded-xl px-5 py-3 text-xl font-semibold text-white transition ${
                studyLessonId
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : "pointer-events-none cursor-not-allowed bg-slate-300"
              }`}
            >
              Bat dau Trac nghiem
            </Link>
          </article>

          <article className="rounded-2xl border border-orange-200 bg-orange-50/80 p-6">
            <p className="text-4xl">⚡</p>
            <h3 className="mt-3 text-3xl font-bold text-orange-700">Nhoi nhet</h3>
            <p className="mt-3 text-xl leading-relaxed text-orange-700/90">
              Go dap an de ghi nho sau hon. Danh cho nguoi muon thu thach.
            </p>
            <Link
              href={
                studyLessonId
                  ? `/vocab/learn?lesson=${studyLessonId}&mode=recall`
                  : "#"
              }
              className={`mt-6 inline-flex w-full items-center justify-center rounded-xl px-5 py-3 text-xl font-semibold text-white transition ${
                studyLessonId
                  ? "bg-orange-600 hover:bg-orange-700"
                  : "pointer-events-none cursor-not-allowed bg-slate-300"
              }`}
            >
              Bat dau Nhoi nhet
            </Link>
          </article>
        </div>

        {!studyLessonId ? (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            Hay chon mot bai ca nhan co du lieu truoc khi hoc.
          </p>
        ) : null}
      </div>
    </section>
  );
}
