"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Sparkles, SlidersHorizontal } from "lucide-react";

type HeaderTab = {
  key: string;
  label: string;
  count: number;
  href: string;
  active: boolean;
};

type Props = {
  tabs: HeaderTab[];
  selectedLabel: string;
  filteredCount: number;
  roadmapHref: string;
  worksheetHref: string;
  allFlashcardHref: string;
  allQuizHref: string;
  pickedFlashcardHref: string;
  pickedQuizHref: string;
  pickedRelatedVocabFlashcardHref: string;
  pickedRelatedVocabQuizHref: string;
  clearPickedHref?: string;
  pickedCount: number;
  pickedPreview?: string;
};

export function KanjiExplorerHeader({
  tabs,
  selectedLabel,
  filteredCount,
  roadmapHref,
  worksheetHref,
  allFlashcardHref,
  allQuizHref,
  pickedFlashcardHref,
  pickedQuizHref,
  pickedRelatedVocabFlashcardHref,
  pickedRelatedVocabQuizHref,
  clearPickedHref,
  pickedCount,
  pickedPreview,
}: Props) {
  return (
    <div className="relative overflow-hidden rounded-[2.5rem] bg-white/60 p-5 shadow-[0_20px_50px_rgba(0,0,0,0.05)] backdrop-blur-2xl sm:p-7">
      <div className="pointer-events-none absolute right-[-72px] top-[-92px] h-72 w-72 rounded-full bg-[radial-gradient(circle_at_center,rgba(167,139,250,0.2)_0%,rgba(110,231,183,0.14)_42%,rgba(255,255,255,0)_72%)]" />

      <div className="relative">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500 shadow-[0_6px_18px_rgba(15,23,42,0.07)]">
          <Sparkles className="h-3.5 w-3.5 text-violet-500/70" />
          V1.2 Premium
        </div>

        <h1 className="mt-4 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-700 bg-clip-text text-3xl font-bold tracking-tight text-transparent sm:text-[2.1rem]">
          Khám phá Kanji theo trình độ JLPT
        </h1>
        <p className="mt-2 inline-flex max-w-3xl items-center gap-2 text-sm font-medium text-slate-400 sm:text-[15px]">
          <SlidersHorizontal className="h-4 w-4 text-slate-500/70" />
          Lọc theo cấp độ, vẽ nét để tìm nhanh, và tạo bộ flashcard riêng để học ngay.
        </p>
      </div>

      <div className="relative mt-5 grid gap-4 2xl:grid-cols-[minmax(0,1fr)_auto] 2xl:items-end">
        <div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(88px,1fr))] gap-2 rounded-2xl bg-white/72 p-2 shadow-[0_12px_26px_rgba(15,23,42,0.08)]">
            {tabs.map((tab) => (
              <div key={tab.key} className="relative">
                {tab.active ? (
                  <motion.span
                    layoutId="kanji-level-indicator"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    className="absolute inset-0 rounded-xl bg-gradient-to-br from-violet-200/85 to-cyan-200/85 shadow-[0_10px_20px_rgba(14,165,233,0.25)]"
                  />
                ) : null}
                <Link
                  href={tab.href}
                  scroll={false}
                  className={`relative z-10 flex h-full flex-col rounded-xl px-3 py-2.5 transition-all duration-300 ${
                    tab.active ? "text-slate-900" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <span className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.18em]">
                    {tab.label}
                  </span>
                  <span className="mt-1 text-[10px] font-semibold tracking-wide text-slate-500">
                    {tab.count} ký tự
                  </span>
                </Link>
              </div>
            ))}
          </div>
          <p className="mt-3 text-sm font-medium text-slate-500">
            Đang hiển thị: <span className="font-semibold text-slate-700">{selectedLabel}</span> · {filteredCount} ký
            tự phù hợp
          </p>
        </div>

        <div className="inline-flex flex-wrap items-center justify-end gap-2 rounded-2xl bg-white/74 p-2 shadow-[0_12px_26px_rgba(15,23,42,0.08)]">
          <Link
            href={roadmapHref}
            className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-700 transition-all duration-300 hover:-translate-y-0.5 hover:bg-slate-200"
          >
            Lộ trình
          </Link>
          <Link
            href={worksheetHref}
            className="rounded-full bg-amber-100 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-amber-800 transition-all duration-300 hover:-translate-y-0.5 hover:bg-amber-200"
          >
            In PDF
          </Link>
          <Link
            href={allFlashcardHref}
            className="pulse-shadow rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white transition-all duration-300 hover:-translate-y-0.5 hover:bg-emerald-500"
          >
            Flashcard
          </Link>
          <Link
            href={allQuizHref}
            className="rounded-full bg-sky-600 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white transition-all duration-300 hover:-translate-y-0.5 hover:bg-sky-500"
          >
            Trắc nghiệm
          </Link>
          <Link
            href={pickedFlashcardHref}
            className={`rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition-all duration-300 ${
              pickedCount > 0
                ? "bg-emerald-100 text-emerald-700 hover:-translate-y-0.5 hover:bg-emerald-200"
                : "pointer-events-none cursor-not-allowed bg-slate-100 text-slate-400"
            }`}
          >
            Đã chọn ({pickedCount})
          </Link>
          <Link
            href={pickedQuizHref}
            className={`rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition-all duration-300 ${
              pickedCount > 0
                ? "bg-sky-100 text-sky-700 hover:-translate-y-0.5 hover:bg-sky-200"
                : "pointer-events-none cursor-not-allowed bg-slate-100 text-slate-400"
            }`}
          >
            Quiz đã chọn
          </Link>
          <Link
            href={pickedRelatedVocabFlashcardHref}
            className={`rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition-all duration-300 ${
              pickedCount > 0
                ? "bg-orange-100 text-orange-700 hover:-translate-y-0.5 hover:bg-orange-200"
                : "pointer-events-none cursor-not-allowed bg-slate-100 text-slate-400"
            }`}
          >
            Từ liên quan
          </Link>
          <Link
            href={pickedRelatedVocabQuizHref}
            className={`rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition-all duration-300 ${
              pickedCount > 0
                ? "bg-amber-100 text-amber-800 hover:-translate-y-0.5 hover:bg-amber-200"
                : "pointer-events-none cursor-not-allowed bg-slate-100 text-slate-400"
            }`}
          >
            Quiz từ liên quan
          </Link>
          {pickedCount > 0 && clearPickedHref ? (
            <Link
              href={clearPickedHref}
              scroll={false}
              className="rounded-full bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600 shadow-[0_8px_16px_rgba(15,23,42,0.08)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-slate-50"
            >
              Bỏ chọn
            </Link>
          ) : null}
        </div>
      </div>

      {pickedCount > 0 && pickedPreview ? (
        <p className="relative mt-3 text-xs text-slate-500">{pickedPreview}</p>
      ) : null}
    </div>
  );
}
