"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { ArrowRightLeft, Pencil, Save, Trash2, X } from "lucide-react";

import {
  deleteAdminVocabItemAction,
  moveAdminVocabItemTopicAction,
  updateAdminVocabItemInlineAction,
} from "@/app/actions/admin-vocab";

type AdminVocabItem = {
  id: string;
  word: string;
  reading: string;
  kanji: string;
  hanviet: string;
  partOfSpeech: string;
  meaning: string;
  createdAt: string;
  updatedAt: string;
};

type MoveLessonOption = {
  id: string;
  title: string;
  jlptLevel: string;
};

type Props = {
  items: AdminVocabItem[];
  selectedLevel: string;
  selectedLessonId: string;
  sameLevelMoveLessons: MoveLessonOption[];
  crossLevelMoveLessons: MoveLessonOption[];
};

export function AdminVocabItemsTable({
  items,
  selectedLevel,
  selectedLessonId,
  sameLevelMoveLessons,
  crossLevelMoveLessons,
}: Props) {
  const [localItems, setLocalItems] = useState<AdminVocabItem[]>(items);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setLocalItems(items);
    setEditingId(null);
    setPendingId(null);
    setErrorText("");
  }, [items, selectedLessonId]);

  const hasMoveTargets =
    sameLevelMoveLessons.length > 0 || crossLevelMoveLessons.length > 0;

  const defaultMoveTargetId =
    sameLevelMoveLessons[0]?.id || crossLevelMoveLessons[0]?.id || "";

  function startEdit(itemId: string) {
    setErrorText("");
    setEditingId(itemId);
  }

  function cancelEdit() {
    setErrorText("");
    setEditingId(null);
    setPendingId(null);
  }

  function handleSave(event: FormEvent<HTMLFormElement>, itemId: string) {
    event.preventDefault();
    setErrorText("");

    const formData = new FormData(event.currentTarget);
    setPendingId(itemId);

    startTransition(async () => {
      try {
        const result = await updateAdminVocabItemInlineAction(formData);
        if (!result.ok) {
          setErrorText(result.message);
          return;
        }

        setLocalItems((current) =>
          current.map((entry) =>
            entry.id === itemId
              ? {
                  ...entry,
                  ...result.item,
                }
              : entry
          )
        );
        setEditingId(null);
      } catch {
        setErrorText("Lưu thất bại. Vui lòng thử lại.");
      } finally {
        setPendingId(null);
      }
    });
  }

  if (localItems.length === 0) {
    return (
      <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
        Lesson này chưa có từ vựng.
      </p>
    );
  }

  return (
    <>
      <div
        className="overflow-hidden rounded-lg border border-slate-200 bg-white"
        data-scroll-restore-key="admin-vocab-item-list"
      >
        <div className="max-h-[420px] overflow-auto">
          <table className="min-w-[1280px] w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="w-10 border-b border-slate-200 px-3 py-3 text-left">
                  <input type="checkbox" className="h-4 w-4 rounded border-slate-300" aria-label="Chọn tất cả" />
                </th>
                <th className="border-b border-slate-200 px-3 py-3 text-left">Từ</th>
                <th className="border-b border-slate-200 px-3 py-3 text-left">Reading</th>
                <th className="border-b border-slate-200 px-3 py-3 text-left">Kanji</th>
                <th className="border-b border-slate-200 px-3 py-3 text-left">Hán Việt</th>
                <th className="border-b border-slate-200 px-3 py-3 text-left">Nghĩa</th>
                <th className="border-b border-slate-200 px-3 py-3 text-left">POS</th>
                <th className="border-b border-slate-200 px-3 py-3 text-left">Category</th>
                <th className="border-b border-slate-200 px-3 py-3 text-center">Trạng thái</th>
                <th className="border-b border-slate-200 px-3 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {localItems.map((item) => {
                const isEditing = editingId === item.id;
                const isSaving = isPending && pendingId === item.id;
                const approved = Boolean((item.kanji || "").trim());

                if (isEditing) {
                  return (
                    <tr key={item.id} id={`item-${item.id}`} className="border-b border-slate-100">
                      <td colSpan={10} className="bg-blue-50/40 px-3 py-3">
                        <form
                          onSubmit={(event) => handleSave(event, item.id)}
                          className="grid gap-2 xl:grid-cols-[1fr_1fr_1fr_1fr_0.8fr_1.2fr_auto]"
                        >
                          <input type="hidden" name="lessonId" value={selectedLessonId} />
                          <input type="hidden" name="itemId" value={item.id} />
                          <input
                            name="word"
                            defaultValue={item.word}
                            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
                            required
                          />
                          <input
                            name="reading"
                            defaultValue={item.reading}
                            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
                          />
                          <input
                            name="kanji"
                            defaultValue={item.kanji || ""}
                            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
                          />
                          <input
                            name="hanviet"
                            defaultValue={item.hanviet || ""}
                            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
                          />
                          <input
                            name="partOfSpeech"
                            defaultValue={item.partOfSpeech || ""}
                            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
                          />
                          <input
                            name="meaning"
                            defaultValue={item.meaning}
                            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
                            required
                          />
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="submit"
                              disabled={isSaving}
                              className="grid h-9 w-9 place-items-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                              aria-label="Lưu"
                              title="Lưu"
                            >
                              <Save className="h-4 w-4" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 bg-white text-slate-500"
                              aria-label="Hủy"
                              title="Hủy"
                            >
                              <X className="h-4 w-4" aria-hidden="true" />
                            </button>
                          </div>
                        </form>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={item.id} id={`item-${item.id}`} className="border-b border-slate-100 last:border-b-0">
                    <td className="px-3 py-3">
                      <input type="checkbox" className="h-4 w-4 rounded border-slate-300" aria-label={`Chọn ${item.word}`} />
                    </td>
                    <td className="px-3 py-3 font-bold text-slate-800">{item.word}</td>
                    <td className="px-3 py-3 text-slate-600">{item.reading || "-"}</td>
                    <td className="px-3 py-3 text-slate-700">{item.kanji || "-"}</td>
                    <td className="px-3 py-3 text-slate-600">{item.hanviet || "-"}</td>
                    <td className="px-3 py-3 text-slate-700">{item.meaning}</td>
                    <td className="px-3 py-3 text-slate-600">{item.partOfSpeech || "-"}</td>
                    <td className="px-3 py-3 text-slate-600">{selectedLevel} - Tổng hợp</td>
                    <td className="px-3 py-3 text-center">
                      <span
                        className={`rounded-md border px-2 py-1 text-xs font-bold ${
                          approved
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-orange-200 bg-orange-50 text-orange-700"
                        }`}
                      >
                        {approved ? "Đã duyệt" : "Chờ duyệt"}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {hasMoveTargets ? (
                          <form action={moveAdminVocabItemTopicAction} className="flex items-center gap-1">
                            <input type="hidden" name="sourceLessonId" value={selectedLessonId} />
                            <input type="hidden" name="itemId" value={item.id} />
                            <input type="hidden" name="currentLevel" value={selectedLevel} />
                            <input type="hidden" name="returnLessonId" value={selectedLessonId} />
                            <select
                              name="targetLessonId"
                              className="h-8 max-w-[150px] rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-600"
                              defaultValue={defaultMoveTargetId}
                              aria-label="Chọn lesson chuyển đến"
                            >
                              {sameLevelMoveLessons.length > 0 ? (
                                <optgroup label={`Cùng cấp ${selectedLevel}`}>
                                  {sameLevelMoveLessons.map((lesson) => (
                                    <option key={`same-${lesson.id}`} value={lesson.id}>
                                      {lesson.title}
                                    </option>
                                  ))}
                                </optgroup>
                              ) : null}
                              {crossLevelMoveLessons.length > 0 ? (
                                <optgroup label="Khác cấp JLPT">
                                  {crossLevelMoveLessons.map((lesson) => (
                                    <option key={`cross-${lesson.id}`} value={lesson.id}>
                                      [{lesson.jlptLevel}] {lesson.title}
                                    </option>
                                  ))}
                                </optgroup>
                              ) : null}
                            </select>
                            <button
                              type="submit"
                              className="grid h-8 w-8 place-items-center rounded-md border border-blue-200 bg-blue-50 text-blue-700"
                              aria-label="Chuyển lesson"
                              title="Chuyển lesson"
                            >
                              <ArrowRightLeft className="h-4 w-4" aria-hidden="true" />
                            </button>
                          </form>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => startEdit(item.id)}
                          className="grid h-8 w-8 place-items-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                          aria-label="Sửa"
                          title="Sửa"
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <form action={deleteAdminVocabItemAction}>
                          <input type="hidden" name="lessonId" value={selectedLessonId} />
                          <input type="hidden" name="itemId" value={item.id} />
                          <button
                            type="submit"
                            className="grid h-8 w-8 place-items-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-rose-50 hover:text-rose-600"
                            aria-label="Xóa"
                            title="Xóa"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
        <span>Hiển thị 1-{localItems.length} trong {localItems.length} từ</span>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((page) => (
            <button
              key={page}
              type="button"
              className={`grid h-8 w-8 place-items-center rounded-md border text-xs font-bold ${
                page === 1
                  ? "border-blue-300 bg-blue-50 text-blue-700"
                  : "border-slate-200 bg-white text-slate-600"
              }`}
            >
              {page}
            </button>
          ))}
        </div>
      </div>

      {errorText ? (
        <p className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
          {errorText}
        </p>
      ) : null}
    </>
  );
}
