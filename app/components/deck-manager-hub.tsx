"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  BookMarked,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Plus,
  Settings2,
  Sparkles,
  X,
} from "lucide-react";

import { createVocabLessonAction, deleteVocabItemAction } from "@/app/actions/vocab-manager";

type DeckTab = {
  id: string;
  label: string;
  count: number;
  href: string;
  active: boolean;
};

type PreviewItem = {
  id: string;
  primary: string;
  secondary: string;
  meaning: string;
};

type Props = {
  deckTabs: DeckTab[];
  createReturnTo: string;
  selectedDeckLabel: string;
  selectedLessonId: string;
  selectedLessonItemsCount: number;
  selectedLessonPreview: PreviewItem[];
  manageHref: string;
};

export function DeckManagerHub({
  deckTabs,
  createReturnTo,
  selectedDeckLabel,
  selectedLessonId,
  selectedLessonItemsCount,
  selectedLessonPreview,
  manageHref,
}: Props) {
  const PREVIEW_PAGE_SIZE = 8;
  const [showCreate, setShowCreate] = useState(deckTabs.length === 0);
  const [showDeckTabs, setShowDeckTabs] = useState(true);
  const [showDeckPreview, setShowDeckPreview] = useState(true);
  const [previewPageByLesson, setPreviewPageByLesson] = useState<Record<string, number>>({});

  const hasDeck = deckTabs.length > 0;
  const canStudy = Boolean(selectedLessonId);
  const previewTotalPages = Math.max(1, Math.ceil(selectedLessonPreview.length / PREVIEW_PAGE_SIZE));
  const previewPageRaw = selectedLessonId ? (previewPageByLesson[selectedLessonId] ?? 1) : 1;
  const previewPage = Math.min(Math.max(1, previewPageRaw), previewTotalPages);

  const previewRows = useMemo(() => {
    const start = (previewPage - 1) * PREVIEW_PAGE_SIZE;
    return selectedLessonPreview.slice(start, start + PREVIEW_PAGE_SIZE);
  }, [previewPage, selectedLessonPreview]);

  function updatePreviewPage(nextPageFactory: (currentPage: number) => number) {
    if (!selectedLessonId) {
      return;
    }
    setPreviewPageByLesson((currentMap) => {
      const currentPage = Math.min(Math.max(1, currentMap[selectedLessonId] ?? 1), previewTotalPages);
      const nextPage = Math.min(Math.max(1, nextPageFactory(currentPage)), previewTotalPages);
      if (nextPage === currentPage) {
        return currentMap;
      }
      return { ...currentMap, [selectedLessonId]: nextPage };
    });
  }

  return (
    <section
      id="deck-hub"
      className="scroll-mt-24 rounded-[2rem] border border-[#d2d9e3] bg-[#e8eef5] p-4 shadow-[0_18px_34px_rgba(111,127,151,0.28)] sm:p-5 lg:p-6"
    >
      <div className="rounded-[1.6rem] border border-[#dde4ee] bg-[#f7f9fc] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-3xl font-black tracking-tight text-[#17223d]">Deck Manager</h2>
            <p className="mt-1 text-sm font-medium text-[#5f6f8e]">
              Chọn bộ, thêm từ, và học ngay trong một command center.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {selectedDeckLabel ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#cce5d6] bg-[#eaf6ee] px-3 py-1 text-xs font-bold text-[#29945d] shadow-[0_3px_8px_rgba(48,143,94,0.15)]">
                <Sparkles className="h-3.5 w-3.5" />
                Đang chọn: {selectedDeckLabel}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => setShowCreate((current) => !current)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#d5dde8] bg-[#f9fbfe] text-[#596b85] shadow-sm transition hover:border-[#bfd2ea] hover:bg-[#eef4fb] hover:text-[#346fbf]"
              aria-label="Tạo bộ flashcard mới"
              title="Tạo bộ flashcard mới"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>

        {showCreate ? (
          <form
            action={createVocabLessonAction}
            className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-[#dde4ed] bg-[#f8fbff] p-3"
          >
            <input
              name="title"
              required
              maxLength={64}
              placeholder="Nhập tên flashcard..."
              className="min-w-[200px] flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-sky-300"
            />
            <input type="hidden" name="returnTo" value={createReturnTo} />
            <button type="submit" className="rounded-xl bg-[#3f7ed8] px-4 py-2 text-sm font-semibold text-white shadow-[0_6px_14px_rgba(63,126,216,0.28)] transition hover:bg-[#356fc4]">
              Tạo bộ mới
            </button>
          </form>
        ) : null}

        {hasDeck ? (
          <div className="mt-4 space-y-3">
            <button
              type="button"
              onClick={() => setShowDeckTabs((current) => !current)}
              className="inline-flex items-center gap-2 rounded-full border border-[#d8e0ea] bg-[#f7f9fc] px-3 py-1.5 text-xs font-bold text-[#4d6281] transition hover:border-[#c2d5ea] hover:text-[#2f68b7]"
            >
              {showDeckTabs ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {showDeckTabs ? "Ẩn danh sách bộ" : "Hiện danh sách bộ"}
            </button>

            {showDeckTabs ? (
              <div className="overflow-x-auto pb-1">
                <div className="flex min-w-max gap-2 pb-2">
                  {deckTabs.map((deck) => (
                    <Link
                      key={deck.id}
                      href={deck.href}
                      className={`group relative min-w-[140px] rounded-xl border px-3 py-2.5 text-left transition ${
                        deck.active
                          ? "border-[#68a0ec] bg-[#eaf2ff] text-[#2b66bf] shadow-[0_6px_12px_rgba(104,160,236,0.2)]"
                          : "border-[#dfe5ed] bg-[#f9fbfe] text-[#526583] hover:border-[#cdd8e8] hover:bg-white"
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <span
                          className={`inline-flex h-6 w-6 items-center justify-center rounded-full ${
                            deck.active ? "bg-[#3d86e5] text-white" : "bg-[#ebf0f6] text-[#6f87a7]"
                          }`}
                        >
                          <CalendarDays className="h-3.5 w-3.5" />
                        </span>
                        <div>
                          <p className="truncate text-sm font-extrabold">{deck.label}</p>
                          <p className="text-xs font-semibold text-slate-500">{deck.count} từ</p>
                        </div>
                      </div>
                      {deck.active ? (
                        <span className="absolute inset-x-7 bottom-0 h-[3px] translate-y-[8px] rounded-full bg-[#2e7edf]" />
                      ) : null}
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
            Chưa có bộ flashcard. Bấm dấu cộng để tạo bộ đầu tiên.
          </p>
        )}

        {canStudy ? (
          <div className="mt-4 space-y-3">
            <div className="rounded-2xl border border-[#d5deea] bg-[#dde5f1] px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="grid h-8 w-8 place-items-center rounded-xl bg-[#3e84df] text-white shadow-[0_6px_12px_rgba(62,132,223,0.24)]">
                    <BookMarked className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="truncate text-base font-black text-[#203558]">{selectedDeckLabel}</p>
                    <p className="text-xs font-semibold text-[#546a89]">{selectedLessonItemsCount} từ trong bộ</p>
                  </div>
                </div>
                <Link
                  href={manageHref}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#d8e0eb] bg-[#f9fbfe] px-3 py-1.5 text-xs font-bold text-[#326ebd] shadow-sm transition hover:bg-[#f0f5fc]"
                >
                  <Settings2 className="h-3.5 w-3.5" />
                  Quản lý bộ này
                </Link>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowDeckPreview((current) => !current)}
              className="inline-flex items-center gap-2 rounded-full border border-[#d8e0ea] bg-[#f7f9fc] px-3 py-1.5 text-xs font-bold text-[#4d6281] transition hover:border-[#c2d5ea] hover:text-[#2f68b7]"
            >
              {showDeckPreview ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {showDeckPreview ? "Ẩn danh sách từ trong bộ" : "Hiện danh sách từ trong bộ"}
            </button>

            {showDeckPreview ? (
              previewRows.length > 0 ? (
                <div className="overflow-hidden rounded-2xl border border-[#d9e1ec] bg-[#fbfcfe]">
                  <div className="grid gap-2 border-b border-[#dce4ef] bg-[#f2f5fa] p-3 sm:grid-cols-2 lg:grid-cols-4">
                    {previewRows.map((row) => (
                      <div key={row.id} className="relative rounded-xl border border-[#e2e7ef] bg-white px-3 py-2.5 shadow-[0_1px_2px_rgba(88,106,134,0.08)]">
                        <form action={deleteVocabItemAction} className="absolute right-2 top-2">
                          <input type="hidden" name="lessonId" value={selectedLessonId} />
                          <input type="hidden" name="itemId" value={row.id} />
                          <button
                            type="submit"
                            className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[#d7dfea] bg-white text-[#6d7f99] transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                            title="Xóa từ này khỏi bộ"
                            aria-label="Xóa từ này khỏi bộ"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </form>
                        <p className="truncate pr-6 text-sm font-extrabold text-[#1f2f4d]">{row.primary}</p>
                        <p className="truncate text-[11px] font-semibold text-[#6a7d9c]">{row.secondary || "-"}</p>
                        <p className="truncate text-sm font-medium text-[#273a5d]">{row.meaning}</p>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 bg-[#fdfefe] px-3 py-2.5">
                    <p className="text-xs font-semibold text-[#607390]">
                      Trang {previewPage}/{previewTotalPages} - {selectedLessonPreview.length} từ
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={previewPage <= 1}
                        onClick={() => updatePreviewPage((current) => current - 1)}
                        className="rounded-full border border-[#d8dfeb] bg-[#f8fafd] px-3 py-1 text-xs font-bold text-[#5a6d87] transition hover:bg-[#eef3fa] disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        Trước
                      </button>
                      <button
                        type="button"
                        disabled={previewPage >= previewTotalPages}
                        onClick={() => updatePreviewPage((current) => current + 1)}
                        className="rounded-full bg-[#326ec0] px-3 py-1 text-xs font-bold text-white transition hover:bg-[#2d61a8] disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        Sau
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
                  Bộ này chưa có từ nào. Bấm dấu cộng trên từng thẻ để thêm nhanh.
                </p>
              )
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
