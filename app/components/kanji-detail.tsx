import Image from "next/image";
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
  strokeHint?: string;
  strokeImage?: string;
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
  jsonRelatedWords: RelatedWord[];
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
        <p className="break-words text-xl font-bold leading-tight text-slate-800 sm:text-2xl">
          {renderWordWithHighlight(displayedWord, selectedChar)}
          {entry.reading ? (
            <span className="ml-2 text-base font-medium text-slate-500">({entry.reading})</span>
          ) : null}
        </p>
        <p className="break-words text-sm text-slate-600">
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
  jsonRelatedWords,
  adminRelatedWords,
  coreRelatedWords,
}: Props) {
  return (
    <section
      className="grid min-w-0 gap-5 scroll-mt-28 lg:scroll-mt-36 xl:grid-cols-[minmax(520px,1.2fr)_minmax(420px,0.8fr)]"
      id={`kanji-${selectedKanji.id}`}
    >
      <article className="relative min-w-0 overflow-hidden rounded-3xl bg-white/84 p-5 shadow-[0_20px_50px_rgba(15,23,42,0.08)] backdrop-blur-md sm:p-6">
        <div className="pointer-events-none absolute -left-12 top-0 h-40 w-40 rounded-full bg-cyan-200/35 blur-3xl" />
        <div className="pointer-events-none absolute -right-8 bottom-0 h-36 w-36 rounded-full bg-indigo-200/35 blur-3xl" />

        <div className="relative flex flex-wrap items-center justify-between gap-2">
          <Link
            href={returnToHref}
            scroll={false}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-slate-600 shadow-[0_8px_20px_rgba(15,23,42,0.08)] transition-all duration-300 hover:-translate-y-0.5 hover:text-slate-900"
            aria-label="Quay lại"
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
              {selectedKanjiPicked ? "Đã thêm" : "Flashcard"}
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
                value={`${selectedKanji.jlptLevel} - ${selectedKanji.strokeCount} nét`}
              />
              <input type="hidden" name="returnTo" value={returnToHref} />
              <button
                type="submit"
                className="inline-flex h-10 items-center gap-1.5 rounded-full bg-white px-3 text-xs font-semibold text-slate-700 shadow-[0_8px_18px_rgba(15,23,42,0.08)] transition-all duration-300 hover:-translate-y-0.5"
              >
                {selectedKanjiBookmarked ? (
                  <>
                    <BookMarked className="h-3.5 w-3.5 text-amber-600" />
                    Bỏ bookmark
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

        <div className="relative mt-5 grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(220px,0.42fr)]">
          <article className="relative min-w-0 overflow-hidden rounded-3xl bg-gradient-to-br from-cyan-50/90 via-white/95 to-indigo-50/70 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.1)] sm:p-6">
            <div className="pointer-events-none absolute -left-10 -top-12 h-28 w-28 rounded-full bg-cyan-200/40 blur-2xl" />
            <div className="pointer-events-none absolute -right-12 top-6 h-24 w-24 rounded-full bg-indigo-200/35 blur-2xl" />

            <div className="relative rounded-3xl bg-white/70 p-4 shadow-[0_14px_28px_rgba(15,23,42,0.08)]">
              <p className="font-kanji-art text-[6.6rem] leading-none text-slate-900 sm:text-[7.6rem]">
                {selectedKanji.character}
              </p>
              <p className="mt-2 break-words text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
                {selectedKanji.meaning}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold">
                <span className="rounded-full bg-sky-100 px-3 py-1 text-sky-800">{selectedKanji.jlptLevel}</span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">Kanji Deep Dive</span>
              </div>
            </div>

            <div className="relative mt-5 rounded-2xl bg-white/80 p-4 shadow-[0_10px_22px_rgba(15,23,42,0.08)]">
              <h3 className="text-[12px] font-semibold uppercase tracking-[0.32em] text-slate-400">
                Âm On / Kun
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

            <div className="relative mt-4 rounded-2xl bg-white/80 p-4 shadow-[0_10px_22px_rgba(15,23,42,0.08)]">
              <h3 className="text-[12px] font-semibold uppercase tracking-[0.32em] text-slate-400">
                Hướng dẫn nét viết
              </h3>
              {selectedKanji.strokeImage?.trim() ? (
                <Image
                  src={selectedKanji.strokeImage}
                  alt={`Hướng dẫn nét cho ${selectedKanji.character}`}
                  width={1200}
                  height={900}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white object-contain"
                />
              ) : null}
              {selectedKanji.strokeHint?.trim() ? (
                <p className="mt-2 text-sm leading-6 text-slate-700">{selectedKanji.strokeHint}</p>
              ) : (
                <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-700">
                  Chưa có dữ liệu hướng dẫn nét (strokeHint) trong JSON cho chữ này.
                </p>
              )}
            </div>
          </article>

          <div className="min-w-0 flex flex-col gap-4">
            <article className="relative overflow-hidden rounded-3xl bg-slate-50/92 p-4 shadow-[0_14px_34px_rgba(15,23,42,0.08)]">
              <div className="pointer-events-none absolute -right-12 -top-8 h-24 w-24 rounded-full bg-cyan-100/70 blur-2xl" />
              <div className="mt-4 rounded-2xl bg-white/85 p-4 shadow-[0_10px_20px_rgba(15,23,42,0.06)]">
                <p className="inline-flex items-center gap-1 text-sm font-bold text-orange-500">
                  <Sparkles className="h-4 w-4" />
                  Gợi ý học nhanh
                </p>
                <p className="mt-2 text-sm text-slate-700">
                  <strong>{selectedKanji.exampleWord}</strong> - {selectedKanji.exampleMeaning}
                </p>
              </div>
            </article>
          </div>
        </div>
      </article>

      <aside className="min-w-0">
        <article className="relative overflow-hidden rounded-3xl bg-white/84 p-5 shadow-[0_18px_44px_rgba(15,23,42,0.08)] backdrop-blur-md">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xl font-black text-orange-500">Từ vựng liên quan</h3>
            <Link href={relatedFlashcardHref} className="text-sm font-bold text-sky-600 hover:text-sky-700">
              Flashcard -&gt;
            </Link>
          </div>

          <div className="mt-3 rounded-2xl bg-slate-50/80 p-3">
            <p className="mb-2 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              <Layers3 className="h-3.5 w-3.5" />
              Từ JSON Kanji
            </p>
            <div className="max-h-[200px] space-y-2 overflow-y-auto pr-1">
              {jsonRelatedWords.length === 0 ? (
                <p className="rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-600">
                  Chưa có từ nào từ trường relatedVocabularies cho chữ {selectedKanji.character}.
                </p>
              ) : (
                jsonRelatedWords.slice(0, 20).map((entry) => relatedWordRow(entry, selectedKanji.character))
              )}
            </div>
          </div>

          <div className="mt-3 rounded-2xl bg-slate-50/80 p-3">
            <p className="mb-2 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              <Layers3 className="h-3.5 w-3.5" />
              Nguồn admin upload
            </p>
            <div className="max-h-[230px] space-y-2 overflow-y-auto pr-1">
              {adminRelatedWords.length === 0 ? (
                <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-700">
                  Chưa có từ nào trong thư viện admin có chữ {selectedKanji.character}.
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
              Từ vựng hệ thống
            </p>
            <div className="max-h-[180px] space-y-2 overflow-y-auto pr-1">
              {coreRelatedWords.length === 0 ? (
                <p className="rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-600">
                  Chưa có mục nào trong CSDL vocab hệ thống.
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
            Nhấn để nghe và học nhanh
          </div>
        </article>
      </aside>
    </section>
  );
}



