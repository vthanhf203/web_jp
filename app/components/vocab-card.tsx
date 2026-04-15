"use client";

import { useOptimistic, useTransition } from "react";

import { toggleBookmarkAction } from "@/app/actions/personal";
import {
  addLibraryVocabToReviewAction,
  removeLibraryVocabFromReviewAction,
} from "@/app/actions/study";
import { SpeakJpButton } from "@/app/components/speak-jp-button";
import type { LessonItem } from "@/lib/vocab-store";
import { CheckCircle2, Loader2, Plus, Trash2 } from "lucide-react";

type Props = {
  item: LessonItem;
  itemOrder: number;
  level: string;
  returnTo: string;
  selectedDeckId: string;
  isBookmarked: boolean;
  inSelectedDeck: boolean;
};

function BookmarkIcon({ active }: { active: boolean }) {
  if (active) {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
        <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z" />
    </svg>
  );
}

export function VocabCard({
  item,
  itemOrder,
  level,
  returnTo,
  selectedDeckId,
  isBookmarked,
  inSelectedDeck,
}: Props) {
  const primaryText = item.reading || item.word || "-";
  const kanjiText = item.kanji || (item.reading ? item.word : "");
  const speakText = item.reading || item.kanji || item.word;
  const hanvietText = item.hanviet?.trim() || "-";
  const posText = item.partOfSpeech?.trim() || "-";
  const kanjiTag = item.kanji?.trim() || "-";

  const [optimisticInDeck, setOptimisticInDeck] = useOptimistic(
    inSelectedDeck,
    (_current, next: boolean) => next
  );
  const [isPending, startTransition] = useTransition();

  async function toggleDeckMembership(nextInDeck: boolean) {
    if (!selectedDeckId || isPending) {
      return;
    }

    const previous = optimisticInDeck;
    setOptimisticInDeck(nextInDeck);

    const payload = new FormData();
    payload.set("word", item.word);
    payload.set("reading", item.reading);
    payload.set("kanji", item.kanji);
    payload.set("hanviet", item.hanviet);
    payload.set("meaning", item.meaning);
    payload.set("jlptLevel", level);
    payload.set("partOfSpeech", item.partOfSpeech || "-");
    payload.set("sourceId", item.id);
    payload.set("targetDeck", selectedDeckId);
    payload.set("returnTo", returnTo);

    startTransition(async () => {
      try {
        const result = nextInDeck
          ? await addLibraryVocabToReviewAction(payload)
          : await removeLibraryVocabFromReviewAction(payload);

        if (!result?.ok) {
          setOptimisticInDeck(previous);
        }
      } catch {
        setOptimisticInDeck(previous);
      }
    });
  }

  const deckButtonClass = optimisticInDeck
    ? "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
    : "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100";

  return (
    <article className="group relative flex h-full min-h-[240px] flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white p-5 shadow-[0_8px_20px_rgba(15,23,42,0.05)] transition hover:border-sky-200 hover:shadow-[0_14px_28px_rgba(37,99,235,0.12)]">
      {isBookmarked ? (
        <div className="absolute left-4 top-4 inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 shadow-[0_0_14px_rgba(16,185,129,0.25)]">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Da thuoc
        </div>
      ) : null}

      <div className="absolute right-4 top-4 flex items-center gap-2">
        <span className="inline-flex h-8 items-center rounded-full bg-slate-100 px-2.5 text-xs font-semibold text-slate-500">
          #{itemOrder}
        </span>
      </div>

      <div className="absolute right-4 top-14 flex items-center gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
        <SpeakJpButton
          text={speakText}
          title={`Phat am tu ${itemOrder}`}
          className="h-8 w-8 border-slate-200 text-slate-500 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
        />
        <form action={toggleBookmarkAction}>
          <input type="hidden" name="type" value="vocab" />
          <input type="hidden" name="refId" value={item.id} />
          <input
            type="hidden"
            name="title"
            value={`${item.reading || item.word}${item.kanji ? ` (${item.kanji})` : ""}`}
          />
          <input type="hidden" name="subtitle" value={item.meaning} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <button
            type="submit"
            className={`inline-flex h-8 w-8 items-center justify-center rounded-full border transition ${
              isBookmarked
                ? "border-amber-200 bg-amber-50 text-amber-600 hover:bg-amber-100"
                : "border-slate-200 bg-white text-slate-500 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
            }`}
            title={isBookmarked ? "Da luu" : "Luu tu nay"}
            aria-label={isBookmarked ? "Da luu" : "Luu tu nay"}
          >
            <BookmarkIcon active={isBookmarked} />
          </button>
        </form>
      </div>

      <div className="pr-24 pt-2">
        <p className="text-[1.85rem] font-black leading-tight text-slate-900">{primaryText}</p>
        <p className="mt-1 min-h-6 text-[1rem] font-medium text-slate-400">{kanjiText || " "}</p>
      </div>

      <p className="mt-3 text-[1.3rem] font-semibold leading-tight text-slate-800">{item.meaning}</p>

      <div className="mt-auto space-y-3 pt-5">
        <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
          <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-blue-700">
            <span className="text-[10px]">KJ</span>
            <span>{kanjiTag}</span>
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-700">
            <span className="text-[10px]">HV</span>
            <span>{hanvietText}</span>
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-700">
            <span className="text-[10px]">POS</span>
            <span>{posText}</span>
          </span>
        </div>

        {!selectedDeckId ? (
          <p className="text-xs font-semibold text-amber-700">Tao bo flashcard truoc de them nhanh</p>
        ) : optimisticInDeck ? (
          <p className="text-xs font-semibold text-emerald-700">Da trong flashcard dang chon</p>
        ) : (
          <p className="text-xs font-semibold text-blue-700">Bam dau cong de them vao flashcard</p>
        )}
      </div>

      <button
        type="button"
        disabled={!selectedDeckId || isPending}
        onClick={() => void toggleDeckMembership(!optimisticInDeck)}
        title={
          !selectedDeckId
            ? "Tao flashcard truoc"
            : optimisticInDeck
              ? "Xoa khoi flashcard"
              : "Them vao flashcard"
        }
        aria-label={
          !selectedDeckId
            ? "Tao flashcard truoc"
            : optimisticInDeck
              ? "Xoa khoi flashcard"
              : "Them vao flashcard"
        }
        className={`absolute bottom-4 right-4 inline-flex h-9 w-9 items-center justify-center rounded-full border shadow-sm transition ${deckButtonClass} ${
          !selectedDeckId || isPending ? "cursor-not-allowed opacity-50" : "hover:scale-105"
        }`}
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : optimisticInDeck ? (
          <Trash2 className="h-4 w-4" />
        ) : (
          <Plus className="h-4 w-4" />
        )}
      </button>
    </article>
  );
}
