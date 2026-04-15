import Link from "next/link";
import {
  ArrowLeft,
  BookMarked,
  Bookmark,
  CircleDashed,
  Layers3,
  Plus,
  Sparkles,
  Wand2,
} from "lucide-react";

import { toggleBookmarkAction } from "@/app/actions/personal";
import { SpeakJpButton } from "@/app/components/speak-jp-button";

type KanjiDetailItem = {
  id: string;
  character: string;
  meaning: string;
  onReading: string;
  kunReading: string;
  jlptLevel: string;
  strokeCount: number;
  exampleWord: string;
  exampleMeaning: string;
};

type RelatedWord = {
  id: string;
  word: string;
  reading: string;
  kanji: string;
  hanviet: string;
  meaning: string;
  sourceLabel: string;
};

type Props = {
  selectedKanji: KanjiDetailItem;
  selectedDueAt?: Date;
  selectedKanjiBookmarked: boolean;
  selectedKanjiPicked: boolean;
  togglePickedHref: string;
  returnToHref: string;
  selectedFlashcardHref: string;
  relatedFlashcardHref: string;
  adminRelatedWords: RelatedWord[];
  coreRelatedWords: RelatedWord[];
};

function renderWordWithHighlight(word: string, targetChar: string) {
  if (!targetChar || !word.includes(targetChar)) {
    return word;
  }

  const chunks = word.split(targetChar);
  return (
    <>
      {chunks.map((chunk, index) => (
        <span key={`chunk-${index}`}>
          {chunk}
          {index < chunks.length - 1 ? (
            <span className="font-extrabold text-sky-600">{targetChar}</span>
          ) : null}
        </span>
      ))}
    </>
  );
}

function tokenizeReadings(value: string): string[] {
  return value
    .split(/[\u3001\u30fb,]/)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .slice(0, 10);
}

function readingPills(value: string, tone: "on" | "kun") {
  const parts = tokenizeReadings(value);
  if (parts.length === 0) {
    return (
      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
        -
      </span>
    );
  }

  const toneClass =
    tone === "on"
      ? "bg-sky-100/90 text-sky-800 shadow-[0_8px_18px_rgba(14,165,233,0.22)]"
      : "bg-orange-100/90 text-orange-800 shadow-[0_8px_18px_rgba(249,115,22,0.2)]";

  return parts.map((segment) => (
    <span
      key={`${tone}-${segment}`}
      className={`rounded-full px-3 py-1 text-xs font-semibold transition-all duration-300 hover:-translate-y-0.5 ${toneClass}`}
    >
      {segment}
    </span>
  ));
}

function relatedWordRow(entry: RelatedWord, selectedChar: string) {
  const displayedWord = entry.kanji || entry.word;
  return (
    <article
      key={entry.id}
      className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50/85 px-3 py-2.5 shadow-[0_10px_20px_rgba(15,23,42,0.05)]"
    >
      <div className="min-w-0">
        <p className="truncate text-base font-semibold text-slate-800">
          {renderWordWithHighlight(displayedWord, selectedChar)}
          {entry.reading ? (
            <span className="ml-2 text-sm font-normal text-slate-500">({entry.reading})</span>
          ) : null}
        </p>
        <p className="truncate text-sm text-slate-600">
          {entry.hanviet ? `${entry.hanviet.toUpperCase()} - ` : ""}
          {entry.meaning}
        </p>
        <p className="truncate text-[11px] text-slate-400">{entry.sourceLabel}</p>
      </div>
      <SpeakJpButton text={displayedWord} />
    </article>
  );
}

export function KanjiDetail({
  selectedKanji,
  selectedKanjiBookmarked,
  selectedKanjiPicked,
  togglePickedHref,
  returnToHref,
  relatedFlashcardHref,
  adminRelatedWords,
  coreRelatedWords,
}: Props) {
  return (
    <section className="grid gap-5 lg:grid-cols-[1.5fr_0.9fr]" id={`kanji-${selectedKanji.id}`}>
      <article className="relative overflow-hidden rounded-3xl bg-white/84 p-5 shadow-[0_20px_50px_rgba(15,23,42,0.08)] backdrop-blur-md sm:p-6">
        <div className="pointer-events-none absolute -left-12 top-0 h-40 w-40 rounded-full bg-cyan-200/35 blur-3xl" />
        <div className="pointer-events-none absolute -right-8 bottom-0 h-36 w-36 rounded-full bg-indigo-200/35 blur-3xl" />

        <div className="relative flex flex-wrap items-center justify-between gap-2">
          <Link
            href={returnToHref}
            scroll={false}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-slate-600 shadow-[0_8px_20px_rgba(15,23,42,0.08)] transition-all duration-300 hover:-translate-y-0.5 hover:text-slate-900"
            aria-label="Quay lai"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>

          <div className="flex flex-wrap items-center gap-2">
            <SpeakJpButton text={selectedKanji.character} className="h-10 w-10 text-base" />
            <Link
              href={togglePickedHref}
              scroll={false}
              className={`inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-all duration-300 ${
                selectedKanjiPicked
                  ? "bg-emerald-100 text-emerald-700 shadow-[0_8px_18px_rgba(16,185,129,0.2)]"
                  : "bg-white text-slate-700 shadow-[0_8px_18px_rgba(15,23,42,0.08)] hover:-translate-y-0.5"
              }`}
            >
              <Plus className="h-3.5 w-3.5" />
              {selectedKanjiPicked ? "Da them" : "Flashcard"}
            </Link>

            <form action={toggleBookmarkAction}>
              <input type="hidden" name="type" value="kanji" />
              <input type="hidden" name="refId" value={selectedKanji.character} />
              <input
                type="hidden"
                name="title"
                value={`${selectedKanji.character} - ${selectedKanji.meaning}`}
              />
              <input
                type="hidden"
                name="subtitle"
                value={`${selectedKanji.jlptLevel} - ${selectedKanji.strokeCount} net`}
              />
              <input type="hidden" name="returnTo" value={returnToHref} />
              <button
                type="submit"
                className="inline-flex h-10 items-center gap-1.5 rounded-full bg-white px-3 text-xs font-semibold text-slate-700 shadow-[0_8px_18px_rgba(15,23,42,0.08)] transition-all duration-300 hover:-translate-y-0.5"
              >
                {selectedKanjiBookmarked ? (
                  <>
                    <BookMarked className="h-3.5 w-3.5 text-amber-600" />
                    Bo bookmark
                  </>
                ) : (
                  <>
                    <Bookmark className="h-3.5 w-3.5" />
                    Bookmark
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        <div className="relative mt-5 grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
          <article className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-cyan-50/90 via-white/95 to-indigo-50/70 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.1)] sm:p-6">
            <div className="pointer-events-none absolute -left-10 -top-12 h-28 w-28 rounded-full bg-cyan-200/40 blur-2xl" />
            <div className="pointer-events-none absolute -right-12 top-6 h-24 w-24 rounded-full bg-indigo-200/35 blur-2xl" />

            <div className="relative rounded-3xl bg-white/70 p-4 shadow-[0_14px_28px_rgba(15,23,42,0.08)]">
              <p className="font-kanji-art text-[6.6rem] leading-none text-slate-900 sm:text-[7.6rem]">
                {selectedKanji.character}
              </p>
              <p className="mt-2 text-5xl font-extrabold tracking-tight text-slate-950">{selectedKanji.meaning}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold">
                <span className="rounded-full bg-sky-100 px-3 py-1 text-sky-800">{selectedKanji.jlptLevel}</span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">Kanji Deep Dive</span>
              </div>
            </div>

            <div className="relative mt-5 rounded-2xl bg-white/80 p-4 shadow-[0_10px_22px_rgba(15,23,42,0.08)]">
              <h3 className="text-[12px] font-semibold uppercase tracking-[0.32em] text-slate-400">
                Am On / Kun
              </h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-sky-50/90 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-700/80">On-yomi</p>
                  <div className="mt-2 flex flex-wrap gap-2">{readingPills(selectedKanji.onReading, "on")}</div>
                </div>
                <div className="rounded-xl bg-orange-50/90 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-700/80">
                    Kun-yomi
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">{readingPills(selectedKanji.kunReading, "kun")}</div>
                </div>
              </div>
            </div>
          </article>

          <div className="flex flex-col gap-4">
            <article className="relative overflow-hidden rounded-3xl bg-slate-50/92 p-4 shadow-[0_14px_34px_rgba(15,23,42,0.08)]">
              <div className="pointer-events-none absolute -right-12 -top-8 h-24 w-24 rounded-full bg-cyan-100/70 blur-2xl" />
              <div className="mt-4 rounded-2xl bg-white/85 p-4 shadow-[0_10px_20px_rgba(15,23,42,0.06)]">
                <p className="inline-flex items-center gap-1 text-sm font-bold text-orange-500">
                  <Sparkles className="h-4 w-4" />
                  Goi y hoc nhanh
                </p>
                <p className="mt-2 text-sm text-slate-700">
                  <strong>{selectedKanji.exampleWord}</strong> - {selectedKanji.exampleMeaning}
                </p>
              </div>
            </article>
          </div>
        </div>
      </article>

      <aside>
        <article className="relative overflow-hidden rounded-3xl bg-white/84 p-5 shadow-[0_18px_44px_rgba(15,23,42,0.08)] backdrop-blur-md">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xl font-black text-orange-500">Tu vung lien quan</h3>
            <Link href={relatedFlashcardHref} className="text-sm font-bold text-sky-600 hover:text-sky-700">
              Flashcard -&gt;
            </Link>
          </div>

          <div className="mt-3 rounded-2xl bg-slate-50/80 p-3">
            <p className="mb-2 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              <Layers3 className="h-3.5 w-3.5" />
              Nguon admin
            </p>
            <div className="max-h-[230px] space-y-2 overflow-y-auto pr-1">
              {adminRelatedWords.length === 0 ? (
                <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-700">
                  Chua co tu nao chua chu {selectedKanji.character}.
                </p>
              ) : (
                adminRelatedWords.slice(0, 20).map((entry) =>
                  relatedWordRow(entry, selectedKanji.character)
                )
              )}
            </div>
          </div>

          <div className="mt-3 rounded-2xl bg-slate-50/80 p-3">
            <p className="mb-2 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              <CircleDashed className="h-3.5 w-3.5" />
              Tu vung he thong
            </p>
            <div className="max-h-[180px] space-y-2 overflow-y-auto pr-1">
              {coreRelatedWords.length === 0 ? (
                <p className="rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-600">
                  Chua co muc nao trong CSDL vocab he thong.
                </p>
              ) : (
                coreRelatedWords.slice(0, 12).map((entry) =>
                  relatedWordRow(entry, selectedKanji.character)
                )
              )}
            </div>
          </div>

          <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-violet-100 px-3 py-1.5 text-xs font-semibold text-violet-700">
            <Wand2 className="h-3.5 w-3.5" />
            Nhan de nghe va hoc nhanh
          </div>
        </article>
      </aside>
    </section>
  );
}

