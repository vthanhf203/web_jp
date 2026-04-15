"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Plus, Sparkles, X } from "lucide-react";

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
  const [previewPage, setPreviewPage] = useState(1);

  const hasDeck = deckTabs.length > 0;
  const canStudy = Boolean(selectedLessonId);
  const previewTotalPages = Math.max(1, Math.ceil(selectedLessonPreview.length / PREVIEW_PAGE_SIZE));

  const previewRows = useMemo(() => {
    const start = (previewPage - 1) * PREVIEW_PAGE_SIZE;
    return selectedLessonPreview.slice(start, start + PREVIEW_PAGE_SIZE);
  }, [previewPage, selectedLessonPreview]);

  useEffect(() => {
    setPreviewPage(1);
  }, [selectedLessonId]);

  useEffect(() => {
    setPreviewPage((current) => Math.min(current, previewTotalPages));
  }, [previewTotalPages]);

  return (
    <section id="deck-hub" className="scroll-mt-24 rounded-[1.8rem] bg-white p-6 shadow-sm ring-1 ring-slate-200/70 md:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-slate-900">Deck Manager</h2>
          <p className="mt-1 text-sm text-slate-500">Chon bo, them tu, va hoc ngay trong mot command center.</p>
        </div>

        <div className="flex items-center gap-2">
          {selectedDeckLabel ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
              <Sparkles className="h-3.5 w-3.5" />
              Dang chon: {selectedDeckLabel}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => setShowCreate((current) => !current)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-700 shadow-sm transition hover:scale-105 hover:bg-sky-100 hover:text-sky-700"
            aria-label="Tao bo flashcard moi"
            title="Tao bo flashcard moi"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {showCreate ? (
        <form action={createVocabLessonAction} className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl bg-slate-50 p-3">
          <input
            name="title"
            required
            maxLength={64}
            placeholder="Nhap ten flashcard..."
            className="min-w-[200px] flex-1 rounded-xl bg-white px-3 py-2 text-sm text-slate-700 outline-none ring-1 ring-slate-200 focus:ring-sky-300"
          />
          <input type="hidden" name="returnTo" value={createReturnTo} />
          <button
            type="submit"
            className="rounded-xl bg-gradient-to-r from-sky-500 to-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(59,130,246,0.25)] transition hover:-translate-y-0.5"
          >
            Tao bo moi
          </button>
        </form>
      ) : null}

      {hasDeck ? (
        <div className="mt-5 space-y-3">
          <button
            type="button"
            onClick={() => setShowDeckTabs((current) => !current)}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-sky-200 hover:text-sky-700"
          >
            {showDeckTabs ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {showDeckTabs ? "An danh sach bo" : "Hien danh sach bo"}
          </button>

          {showDeckTabs ? (
            <div className="overflow-x-auto pb-1">
              <div className="flex min-w-max gap-2">
                {deckTabs.map((deck) => (
                  <Link
                    key={deck.id}
                    href={deck.href}
                    className={`min-w-[190px] rounded-2xl px-4 py-3 text-left transition ${
                      deck.active
                        ? "bg-sky-100 text-sky-900 shadow-[0_10px_20px_rgba(56,189,248,0.2)]"
                        : "bg-slate-50 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <p className="truncate text-sm font-bold">{deck.label}</p>
                    <p className="text-xs text-slate-500">{deck.count} tu</p>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          Chua co bo flashcard. Bam dau cong de tao bo dau tien.
        </p>
      )}

      {canStudy ? (
        <div className="mt-5 space-y-4">
          <div className="rounded-2xl bg-slate-50 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-700">{selectedDeckLabel}</p>
              <Link href={manageHref} className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100">
                Quan ly bo nay
              </Link>
            </div>
            <p className="mt-1 text-xs text-slate-500">{selectedLessonItemsCount} tu trong bo</p>
          </div>

          <button
            type="button"
            onClick={() => setShowDeckPreview((current) => !current)}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-sky-200 hover:text-sky-700"
          >
            {showDeckPreview ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {showDeckPreview ? "An danh sach tu trong bo" : "Hien danh sach tu trong bo"}
          </button>

          {showDeckPreview ? (
            previewRows.length > 0 ? (
              <div className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {previewRows.map((row) => (
                    <div key={row.id} className="relative rounded-xl bg-slate-50 px-3 py-2">
                      <form action={deleteVocabItemAction} className="absolute right-2 top-2">
                        <input type="hidden" name="lessonId" value={selectedLessonId} />
                        <input type="hidden" name="itemId" value={row.id} />
                        <button
                          type="submit"
                          className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white text-slate-500 ring-1 ring-slate-200 transition hover:bg-rose-50 hover:text-rose-600 hover:ring-rose-200"
                          title="Xoa tu nay khoi bo"
                          aria-label="Xoa tu nay khoi bo"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </form>
                      <p className="truncate text-sm font-bold text-slate-800">{row.primary}</p>
                      <p className="truncate text-xs text-slate-500">{row.secondary || "-"}</p>
                      <p className="truncate text-sm text-slate-700">{row.meaning}</p>
                    </div>
                  ))}
                </div>

                {previewTotalPages > 1 ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200/70">
                    <p className="text-xs font-semibold text-slate-600">
                      Trang {previewPage}/{previewTotalPages} · {selectedLessonPreview.length} tu
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={previewPage <= 1}
                        onClick={() => setPreviewPage((current) => Math.max(1, current - 1))}
                        className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        Truoc
                      </button>
                      <button
                        type="button"
                        disabled={previewPage >= previewTotalPages}
                        onClick={() =>
                          setPreviewPage((current) => Math.min(previewTotalPages, current + 1))
                        }
                        className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        Sau
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Bo nay chua co tu nao. Bam dau cong tren tung the de them nhanh.
              </p>
            )
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
