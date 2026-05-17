import Link from "next/link";
import {
  BookOpenText,
  ChevronLeft,
  ChevronDown,
  Clock3,
  FileText,
  Layers3,
  Trash2,
} from "lucide-react";

import { deleteReadingTextAction } from "@/app/actions/reading-practice";
import { ReadingPlaybackText } from "@/app/components/reading-playback-text";
import { ReadingPostQuiz } from "@/app/components/reading-post-quiz";
import { ReadingSentenceRecall } from "@/app/components/reading-sentence-recall";
import { ReadingTextImportForm } from "@/app/components/reading-text-import-form";
import { SpeakJpButton } from "@/app/components/speak-jp-button";
import { requireUser } from "@/lib/auth";
import {
  DEFAULT_READING_DECK_NAME,
  loadReadingPracticeStore,
  type ReadingTextItem,
} from "@/lib/reading-practice-store";

type SearchParams = Promise<{
  text?: string | string[];
  level?: string | string[];
  deck?: string | string[];
  page?: string | string[];
}>;

const READING_LIBRARY_PAGE_SIZE = 6;

function pickSingle(value?: string | string[]): string {
  if (!value) {
    return "";
  }
  return Array.isArray(value) ? value[0] ?? "" : value;
}

function parsePositiveInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function levelClass(level: string, active: boolean): string {
  if (active) {
    return "border-[#123c69] bg-[#123c69] text-white";
  }
  if (level === "N5") {
    return "border-[#a7e8cf] bg-[#effdf7] text-[#11795e]";
  }
  if (level === "N4") {
    return "border-[#bdd7ff] bg-[#f1f6ff] text-[#2557a7]";
  }
  if (level === "N3") {
    return "border-[#ffe0a8] bg-[#fff8e8] text-[#a35b00]";
  }
  return "border-[#e0e7ef] bg-white text-[#526070]";
}

function getReadingDeckName(item: Pick<ReadingTextItem, "deckName" | "topic">): string {
  return item.deckName?.trim() || item.topic?.trim() || DEFAULT_READING_DECK_NAME;
}

function readingHref({
  level,
  deck,
  text,
  page,
}: {
  level?: string;
  deck?: string;
  text?: string;
  page?: number;
}): string {
  const search = new URLSearchParams();
  if (level && level !== "ALL") {
    search.set("level", level);
  }
  if (deck) {
    search.set("deck", deck);
  }
  if (text) {
    search.set("text", text);
  }
  if (page && page > 1) {
    search.set("page", String(page));
  }
  const query = search.toString();
  return query ? `/self-study/reading?${query}` : "/self-study/reading";
}

function readingDataRoleLabel(role?: string): string {
  const normalized = role?.trim();
  if (!normalized) {
    return "Khác";
  }
  const labels: Record<string, string> = {
    coreReview: "Từ cốt lõi",
    newVocabulary: "Từ mới",
    reviewVocabulary: "Từ ôn lại",
    mainFocus: "Ngữ pháp trọng tâm",
    reviewGrammar: "Ngữ pháp ôn lại",
    naturalExpression: "Cụm tự nhiên",
  };
  return labels[normalized] ?? normalized;
}

function groupVocabularyByRole(vocabulary: ReadingTextItem["vocabulary"]) {
  return Array.from(
    vocabulary.reduce((map, word) => {
      const name = readingDataRoleLabel(word.role);
      const current = map.get(name) ?? {
        name,
        items: [] as ReadingTextItem["vocabulary"],
      };
      current.items.push(word);
      map.set(name, current);
      return map;
    }, new Map<string, { name: string; items: ReadingTextItem["vocabulary"] }>())
  ).map(([, group]) => group);
}

function groupGrammarByRole(grammarItems: ReadingTextItem["grammarCoverage"]) {
  return Array.from(
    grammarItems.reduce((map, grammar) => {
      const name = readingDataRoleLabel(grammar.role);
      const current = map.get(name) ?? {
        name,
        items: [] as ReadingTextItem["grammarCoverage"],
      };
      current.items.push(grammar);
      map.set(name, current);
      return map;
    }, new Map<string, { name: string; items: ReadingTextItem["grammarCoverage"] }>())
  ).map(([, group]) => group);
}

export default async function SelfStudyReadingPage(props: { searchParams: SearchParams }) {
  const user = await requireUser();
  const params = await props.searchParams;
  const requestedTextId = pickSingle(params.text).trim();
  const requestedLevel = pickSingle(params.level).trim().toUpperCase();
  const requestedDeckName = pickSingle(params.deck).trim();
  const requestedLibraryPage = parsePositiveInteger(pickSingle(params.page).trim());

  const store = await loadReadingPracticeStore(user.id);
  const allItems = [...store.items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const levelFilteredItems =
    requestedLevel && requestedLevel !== "ALL"
      ? allItems.filter((item) => item.jlptLevel === requestedLevel)
      : allItems;
  const filteredItems = requestedDeckName
    ? levelFilteredItems.filter((item) => getReadingDeckName(item) === requestedDeckName)
    : levelFilteredItems;
  const libraryPageCount = Math.max(1, Math.ceil(filteredItems.length / READING_LIBRARY_PAGE_SIZE));
  const currentLibraryPage = Math.min(requestedLibraryPage, libraryPageCount);
  const libraryPageStart = (currentLibraryPage - 1) * READING_LIBRARY_PAGE_SIZE;
  const pagedFilteredItems = filteredItems.slice(
    libraryPageStart,
    libraryPageStart + READING_LIBRARY_PAGE_SIZE
  );
  const selectedText =
    filteredItems.find((item) => item.id === requestedTextId) ??
    pagedFilteredItems[0] ??
    null;

  const levelCounts = ["N5", "N4", "N3", "N2", "N1"].map((level) => ({
    level,
    count: allItems.filter((item) => item.jlptLevel === level).length,
  }));
  const deckGroups = Array.from(
    levelFilteredItems.reduce((map, item) => {
      const name = getReadingDeckName(item);
      const current = map.get(name) ?? {
        name,
        count: 0,
        minutes: 0,
      };
      current.count += 1;
      current.minutes += item.estimatedMinutes;
      map.set(name, current);
      return map;
    }, new Map<string, { name: string; count: number; minutes: number }>())
  )
    .map(([, group]) => group)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "vi"));
  const activeDeckMinutes = filteredItems.reduce((sum, item) => sum + item.estimatedMinutes, 0);
  const activeDeckLabel = requestedDeckName || "Tất cả mục";
  const totalWords = allItems.reduce((sum, item) => sum + item.vocabulary.length, 0);
  const selectedVocabularyGroups = selectedText ? groupVocabularyByRole(selectedText.vocabulary) : [];
  const selectedGrammarGroups = selectedText ? groupGrammarByRole(selectedText.grammarCoverage) : [];

  return (
    <section className="mx-auto max-w-[1360px] space-y-6 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            href="/self-study"
            className="grid h-11 w-11 place-items-center rounded-2xl border border-[#d8e2ee] bg-white text-[#123c69] shadow-[0_10px_24px_rgba(18,60,105,0.08)] transition hover:bg-[#f4fbfb]"
            aria-label="Quay lại tự học"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#22a6a1]">
              Tự học đọc hiểu
            </p>
            <h1 className="mt-1 text-3xl font-black text-[#111827]">Luyện đọc văn bản</h1>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={readingHref({ deck: requestedDeckName })}
            className={`rounded-full border px-4 py-2 text-sm font-black transition ${levelClass(
              "ALL",
              !requestedLevel || requestedLevel === "ALL"
            )}`}
          >
            Tất cả ({allItems.length})
          </Link>
          {levelCounts.map((entry) => (
            <Link
              key={entry.level}
              href={readingHref({ level: entry.level, deck: requestedDeckName })}
              className={`rounded-full border px-4 py-2 text-sm font-black transition ${levelClass(
                entry.level,
                requestedLevel === entry.level
              )}`}
            >
              {entry.level} ({entry.count})
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <article className="rounded-2xl border border-[#d8e2ee] bg-white px-5 py-4 shadow-[0_14px_28px_rgba(18,60,105,0.06)]">
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-[#64748b]">
            <Layers3 className="h-4 w-4 text-[#22a6a1]" />
            Bài đọc
          </p>
          <p className="mt-2 text-3xl font-black text-[#111827]">{allItems.length}</p>
        </article>
        <article className="rounded-2xl border border-[#d8e2ee] bg-white px-5 py-4 shadow-[0_14px_28px_rgba(18,60,105,0.06)]">
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-[#64748b]">
            <BookOpenText className="h-4 w-4 text-[#e68a2e]" />
            Từ mới
          </p>
          <p className="mt-2 text-3xl font-black text-[#111827]">{totalWords}</p>
        </article>
        <article className="rounded-2xl border border-[#d8e2ee] bg-white px-5 py-4 shadow-[0_14px_28px_rgba(18,60,105,0.06)]">
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-[#64748b]">
            <Clock3 className="h-4 w-4 text-[#4f7cff]" />
            Bài đang mở
          </p>
          <p className="mt-2 text-3xl font-black text-[#111827]">
            {selectedText ? `${selectedText.estimatedMinutes} phút` : "0 phút"}
          </p>
        </article>
      </div>

      {allItems.length > 0 ? (
        <div className="overflow-hidden rounded-[28px] border border-[#d8e2ee] bg-white shadow-[0_18px_42px_rgba(18,60,105,0.07)]">
          <div className="border-b border-[#e7eef7] bg-[#f7fbfc] px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#22a6a1]">
                  Thư viện chủ đề
                </p>
                <h2 className="mt-1 text-2xl font-black text-[#111827]">Chọn mục và mở bài ngay tại đây</h2>
              </div>
              {requestedDeckName ? (
                <Link
                  href={readingHref({ level: requestedLevel })}
                  className="rounded-full border border-[#cbd8e7] bg-white px-4 py-2 text-sm font-black text-[#123c69] transition hover:bg-[#eef7fb]"
                >
                  Bỏ lọc mục
                </Link>
              ) : null}
            </div>
          </div>

          <div className="grid gap-0 lg:grid-cols-[320px_minmax(0,1fr)]">
            <aside className="border-b border-[#e7eef7] bg-[#fbfdff] p-4 lg:border-b-0 lg:border-r">
              <div className="flex gap-2 overflow-x-auto pb-1 lg:max-h-[430px] lg:flex-col lg:overflow-y-auto lg:pb-0">
                <Link
                  href={readingHref({ level: requestedLevel })}
                  className={
                    !requestedDeckName
                      ? "min-w-[220px] rounded-2xl border border-[#123c69] bg-[#123c69] px-4 py-3 text-white shadow-[0_14px_26px_rgba(18,60,105,0.18)] transition lg:min-w-0"
                      : "min-w-[220px] rounded-2xl border border-[#d8e2ee] bg-white px-4 py-3 text-[#172033] transition hover:border-[#b9c9dc] hover:bg-[#f8fcff] lg:min-w-0"
                  }
                >
                  <span className="block text-sm font-black">Tất cả mục</span>
                  <span className={
                    !requestedDeckName
                      ? "mt-1 block text-xs font-bold text-white/75"
                      : "mt-1 block text-xs font-bold text-[#667085]"
                  }>
                    {levelFilteredItems.length} bài · {levelFilteredItems.reduce((sum, item) => sum + item.estimatedMinutes, 0)} phút
                  </span>
                </Link>
                {deckGroups.map((deck) => {
                  const active = requestedDeckName === deck.name;
                  return (
                    <Link
                      key={deck.name}
                      href={readingHref({ level: requestedLevel, deck: deck.name })}
                      className={
                        active
                          ? "min-w-[220px] rounded-2xl border border-[#123c69] bg-[#123c69] px-4 py-3 text-white shadow-[0_14px_26px_rgba(18,60,105,0.18)] transition lg:min-w-0"
                          : "min-w-[220px] rounded-2xl border border-[#d8e2ee] bg-white px-4 py-3 text-[#172033] transition hover:border-[#b9c9dc] hover:bg-[#f8fcff] lg:min-w-0"
                      }
                    >
                      <span className="block truncate text-sm font-black">{deck.name}</span>
                      <span className={
                        active
                          ? "mt-1 block text-xs font-bold text-white/75"
                          : "mt-1 block text-xs font-bold text-[#667085]"
                      }>
                        {deck.count} bài · {deck.minutes} phút
                      </span>
                    </Link>
                  );
                })}
              </div>
            </aside>

            <div className="p-4 md:p-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[#22a6a1]">
                    Mục đang xem
                  </p>
                  <h3 className="mt-1 text-2xl font-black text-[#111827]">{activeDeckLabel}</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-[#eef3ff] px-3 py-1 text-xs font-black text-[#3554a8]">
                    {filteredItems.length} bài
                  </span>
                  <span className="rounded-full bg-[#fff3df] px-3 py-1 text-xs font-black text-[#b45b10]">
                    {activeDeckMinutes} phút
                  </span>
                </div>
              </div>

              {filteredItems.length > 0 ? (
                <>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {pagedFilteredItems.map((item) => {
                    const active = selectedText?.id === item.id;
                    const href = readingHref({
                      level: requestedLevel,
                      deck: requestedDeckName || getReadingDeckName(item),
                      text: item.id,
                      page: currentLibraryPage,
                    });
                    return (
                      <Link
                        key={item.id}
                        href={href}
                        className={
                          active
                            ? "group rounded-2xl border border-[#22a6a1] bg-white p-4 shadow-[0_0_0_4px_rgba(34,166,161,0.16)] transition hover:-translate-y-0.5 hover:border-[#9fc2df] hover:shadow-[0_16px_28px_rgba(18,60,105,0.09)]"
                            : "group rounded-2xl border border-[#d8e2ee] bg-white p-4 shadow-[0_10px_22px_rgba(18,60,105,0.04)] transition hover:-translate-y-0.5 hover:border-[#9fc2df] hover:shadow-[0_16px_28px_rgba(18,60,105,0.09)]"
                        }
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="rounded-full bg-[#eef3ff] px-2.5 py-1 text-xs font-black text-[#3554a8]">
                            {item.jlptLevel}
                          </span>
                          <span className="text-xs font-bold text-[#667085]">{item.estimatedMinutes} phút</span>
                        </div>
                        <h4 className="mt-3 line-clamp-2 min-h-[3.1rem] font-[var(--font-jp-serif)] text-xl font-black leading-tight text-[#111827]">
                          {item.title}
                        </h4>
                        <p className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-[#667085]">
                          {getReadingDeckName(item)} · {item.topic}
                        </p>
                        <span className="mt-4 inline-flex items-center gap-2 text-sm font-black text-[#123c69]">
                          {active ? "Đang mở" : "Mở bài"}
                          <BookOpenText className="h-4 w-4 transition group-hover:translate-x-0.5" />
                        </span>
                      </Link>
                    );
                  })}
                </div>
                {libraryPageCount > 1 ? (
                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#edf2f7] pt-4">
                    <p className="text-sm font-bold text-[#667085]">
                      Trang {currentLibraryPage}/{libraryPageCount} · {filteredItems.length} bài
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={readingHref({
                          level: requestedLevel,
                          deck: requestedDeckName,
                          page: Math.max(1, currentLibraryPage - 1),
                        })}
                        aria-disabled={currentLibraryPage <= 1}
                        className={
                          currentLibraryPage <= 1
                            ? "pointer-events-none rounded-full border border-[#e5edf5] bg-[#f8fafc] px-4 py-2 text-sm font-black text-[#98a2b3]"
                            : "rounded-full border border-[#cbd8e7] bg-white px-4 py-2 text-sm font-black text-[#123c69] transition hover:bg-[#eef7fb]"
                        }
                      >
                        Trước
                      </Link>
                      {Array.from({ length: libraryPageCount }, (_, index) => index + 1).map((pageNumber) => (
                        <Link
                          key={pageNumber}
                          href={readingHref({
                            level: requestedLevel,
                            deck: requestedDeckName,
                            page: pageNumber,
                          })}
                          className={
                            pageNumber === currentLibraryPage
                              ? "grid h-10 w-10 place-items-center rounded-full bg-[#123c69] text-sm font-black text-white"
                              : "grid h-10 w-10 place-items-center rounded-full border border-[#cbd8e7] bg-white text-sm font-black text-[#123c69] transition hover:bg-[#eef7fb]"
                          }
                        >
                          {pageNumber}
                        </Link>
                      ))}
                      <Link
                        href={readingHref({
                          level: requestedLevel,
                          deck: requestedDeckName,
                          page: Math.min(libraryPageCount, currentLibraryPage + 1),
                        })}
                        aria-disabled={currentLibraryPage >= libraryPageCount}
                        className={
                          currentLibraryPage >= libraryPageCount
                            ? "pointer-events-none rounded-full border border-[#e5edf5] bg-[#f8fafc] px-4 py-2 text-sm font-black text-[#98a2b3]"
                            : "rounded-full border border-[#cbd8e7] bg-white px-4 py-2 text-sm font-black text-[#123c69] transition hover:bg-[#eef7fb]"
                        }
                      >
                        Sau
                      </Link>
                    </div>
                  </div>
                ) : null}
                </>
              ) : (
                <div className="mt-4 rounded-2xl border border-dashed border-[#cbd8e7] bg-[#f8fcff] px-4 py-8 text-center text-sm font-semibold text-[#667085]">
                  Không có bài đọc nào trong bộ lọc hiện tại.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
      <div className="space-y-5">
        <article className="overflow-hidden rounded-[28px] border border-[#d8e2ee] bg-white shadow-[0_18px_42px_rgba(18,60,105,0.08)]">
          {selectedText ? (
            <>
              <div className="border-b border-[#e6edf5] bg-[#f8fcff] px-6 py-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-[#e8fbf8] px-3 py-1 text-xs font-black text-[#108373]">
                        {selectedText.jlptLevel}
                      </span>
                      <span className="rounded-full bg-[#eef3ff] px-3 py-1 text-xs font-black text-[#3554a8]">
                        {getReadingDeckName(selectedText)}
                      </span>
                      <span className="rounded-full bg-[#fff3df] px-3 py-1 text-xs font-black text-[#b45b10]">
                        {selectedText.topic}
                      </span>
                      <span className="rounded-full bg-[#eef3ff] px-3 py-1 text-xs font-black text-[#3554a8]">
                        {selectedText.difficulty}
                      </span>
                    </div>
                    <h2 className="mt-3 font-[var(--font-jp-serif)] text-4xl font-black text-[#111827]">
                      {selectedText.title}
                    </h2>
                  </div>
                  <div className="flex items-start gap-2">
                    <form action={deleteReadingTextAction}>
                      <input type="hidden" name="textId" value={selectedText.id} />
                      <button
                        type="submit"
                        className="grid h-11 w-11 place-items-center rounded-full border border-rose-200 bg-rose-50 text-rose-600 transition hover:bg-rose-100"
                        aria-label="Xóa bài đọc"
                        title="Xóa bài đọc"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </form>
                  </div>
                </div>
              </div>

              <div className="space-y-5 px-6 py-6">
                <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.72fr)_minmax(320px,0.96fr)]">
                  <ReadingPlaybackText paragraphs={selectedText.paragraphs} />

                  <div className="space-y-3">
                    <h3 className="text-xl font-black text-[#111827]">Dữ liệu trong bài</h3>

                    <details open className="group rounded-2xl border border-[#d8e2ee] bg-white">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm font-black text-[#172033] transition hover:bg-[#f8fcff] [&::-webkit-details-marker]:hidden">
                        <span>Từ vựng dùng trong bài</span>
                        <span className="inline-flex items-center gap-2 text-xs font-black text-[#667085]">
                          {selectedText.vocabulary.length} từ
                          <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
                        </span>
                      </summary>
                      <div className="max-h-[420px] space-y-3 overflow-y-auto border-t border-[#edf1f6] px-3 py-3 md:max-h-[500px] xl:max-h-[560px]">
                        {selectedText.vocabulary.length > 0 ? (
                          selectedVocabularyGroups.map((group) => (
                            <section key={group.name} className="space-y-2">
                              <div className="flex items-center justify-between gap-2 px-1">
                                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#22a6a1]">
                                  {group.name}
                                </p>
                                <span className="rounded-full bg-[#eef3ff] px-2 py-0.5 text-[11px] font-black text-[#3554a8]">
                                  {group.items.length}
                                </span>
                              </div>
                              {group.items.map((word, index) => (
                                <div
                                  key={`${word.word}-${word.meaning}-${index}`}
                                  className="flex items-start justify-between gap-3 rounded-2xl border border-[#edf1f6] bg-[#fbfdff] px-3 py-2"
                                >
                                  <div className="min-w-0">
                                    <p className="font-[var(--font-jp)] text-lg font-black text-[#111827]">
                                      {word.word}
                                    </p>
                                    <p className="text-xs font-bold leading-5 text-[#667085]">
                                      {word.reading ? `${word.reading} - ` : ""}{word.meaning}
                                    </p>
                                    <div className="mt-1 flex flex-wrap gap-1">
                                      {word.hanviet ? (
                                        <span className="rounded-full bg-[#fff3df] px-2 py-0.5 text-[11px] font-black text-[#9a4f05]">
                                          Hán Việt: {word.hanviet}
                                        </span>
                                      ) : null}
                                      {word.partOfSpeech ? (
                                        <span className="rounded-full bg-[#eef3ff] px-2 py-0.5 text-[11px] font-black text-[#3554a8]">
                                          {word.partOfSpeech}
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>
                                  <SpeakJpButton text={word.word} title="Phát âm từ" />
                                </div>
                              ))}
                            </section>
                          ))
                        ) : (
                          <p className="rounded-2xl border border-dashed border-[#cbd8e7] bg-[#f8fcff] px-3 py-4 text-sm font-semibold text-[#667085]">
                            Bài này chưa có danh sách từ vựng. Nếu JSON có vocabularyCoverage, hãy import lại để hệ thống lưu phần này.
                          </p>
                        )}
                      </div>
                    </details>

                    <details open className="group rounded-2xl border border-[#d8e2ee] bg-white">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm font-black text-[#172033] transition hover:bg-[#f8fcff] [&::-webkit-details-marker]:hidden">
                        <span>Ngữ pháp dùng trong bài</span>
                        <span className="inline-flex items-center gap-2 text-xs font-black text-[#667085]">
                          {selectedText.grammarCoverage.length} mẫu
                          <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
                        </span>
                      </summary>
                      <div className="max-h-[420px] space-y-3 overflow-y-auto border-t border-[#edf1f6] px-3 py-3 md:max-h-[500px] xl:max-h-[560px]">
                        {selectedText.grammarCoverage.length > 0 ? (
                          selectedGrammarGroups.map((group) => (
                            <section key={group.name} className="space-y-2">
                              <div className="flex items-center justify-between gap-2 px-1">
                                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#e68a2e]">
                                  {group.name}
                                </p>
                                <span className="rounded-full bg-[#fff3df] px-2 py-0.5 text-[11px] font-black text-[#9a4f05]">
                                  {group.items.length}
                                </span>
                              </div>
                              {group.items.map((grammar, index) => (
                                <article
                                  key={`${grammar.pattern}-${index}`}
                                  className="rounded-2xl border border-[#edf1f6] bg-[#fbfdff] px-3 py-3"
                                >
                                  <div className="flex flex-wrap items-start justify-between gap-2">
                                    <p className="font-[var(--font-jp)] text-base font-black text-[#111827]">
                                      {grammar.pattern}
                                    </p>
                                    {grammar.level ? (
                                      <span className="rounded-full bg-[#eef3ff] px-2 py-0.5 text-[11px] font-black text-[#3554a8]">
                                        {grammar.level}
                                      </span>
                                    ) : null}
                                  </div>
                                  {grammar.meaning ? (
                                    <p className="mt-1 text-sm font-semibold leading-6 text-[#526070]">
                                      {grammar.meaning}
                                    </p>
                                  ) : null}
                                  <div className="mt-2 flex flex-wrap gap-1">
                                    {grammar.frequency ? (
                                      <span className="rounded-full bg-[#e8fbf8] px-2 py-0.5 text-[11px] font-black text-[#108373]">
                                        {grammar.frequency} lần
                                      </span>
                                    ) : null}
                                    {grammar.source ? (
                                      <span className="rounded-full bg-[#f3f4f6] px-2 py-0.5 text-[11px] font-black text-[#667085]">
                                        {grammar.source}
                                      </span>
                                    ) : null}
                                  </div>
                                  {grammar.examples.length > 0 ? (
                                    <div className="mt-2 space-y-2 rounded-xl bg-white px-3 py-2">
                                      {grammar.examples.slice(0, 2).map((example, exampleIndex) => (
                                        <div key={`${grammar.pattern}-example-${exampleIndex}`}>
                                          <p className="font-[var(--font-jp)] text-sm font-bold leading-6 text-[#172033]">
                                            {example.sentenceRef ? `${example.sentenceRef}: ` : ""}{example.sentence}
                                          </p>
                                          {example.vi ? (
                                            <p className="mt-0.5 text-xs font-semibold leading-5 text-[#667085]">
                                              {example.vi}
                                            </p>
                                          ) : null}
                                        </div>
                                      ))}
                                      {grammar.examples.length > 2 ? (
                                        <p className="text-xs font-bold text-[#667085]">
                                          +{grammar.examples.length - 2} ví dụ nữa
                                        </p>
                                      ) : null}
                                    </div>
                                  ) : null}
                                </article>
                              ))}
                            </section>
                          ))
                        ) : (
                          <p className="rounded-2xl border border-dashed border-[#cbd8e7] bg-[#f8fcff] px-3 py-4 text-sm font-semibold text-[#667085]">
                            Bài này chưa có danh sách ngữ pháp. Nếu JSON có grammarCoverage, hãy import lại để hệ thống lưu phần này.
                          </p>
                        )}
                      </div>
                    </details>
                  </div>
                </div>

                <div className="rounded-2xl border border-[#d7efe7] bg-[#f3fff9] px-5 py-4">
                  <h3 className="text-sm font-black uppercase tracking-[0.14em] text-[#256055]">
                    Bản dịch tiếng Việt
                  </h3>
                  {selectedText.translation ? (
                    <p className="mt-2 whitespace-pre-line text-base leading-8 text-[#245447]">
                      {selectedText.translation}
                    </p>
                  ) : (
                    <p className="mt-2 text-sm leading-7 text-[#537f73]">
                      Chưa có bản dịch cho bài này. Bạn có thể import lại JSON có trường dịch để hiển thị ở đây.
                    </p>
                  )}
                </div>

                {selectedText.postReadingQuiz?.questions.length ? (
                  <ReadingPostQuiz quiz={selectedText.postReadingQuiz} textId={selectedText.id} />
                ) : null}

                {selectedText.sentenceRecallPractice?.questions.length ? (
                  <ReadingSentenceRecall
                    practice={selectedText.sentenceRecallPractice}
                    textId={selectedText.id}
                  />
                ) : null}
              </div>
            </>
          ) : (
            <div className="p-8">
              <div className="grid min-h-[320px] place-items-center rounded-3xl border border-dashed border-[#cbd8e7] bg-[#f8fcff] text-center">
                <div className="max-w-md px-6">
                  <FileText className="mx-auto h-12 w-12 text-[#22a6a1]" />
                  <h2 className="mt-4 text-2xl font-black text-[#111827]">Chưa có bài đọc</h2>
                  <p className="mt-2 text-sm leading-6 text-[#667085]">
                    Hãy import JSON ở cuối trang để tạo kho bài đọc riêng của bạn.
                  </p>
                </div>
              </div>
            </div>
          )}
        </article>


      </div>

      <div className="rounded-[24px] border border-[#d8e2ee] bg-white p-5 shadow-[0_18px_42px_rgba(18,60,105,0.08)]">
        <h2 className="text-xl font-black text-[#111827]">Import JSON văn bản</h2>
        <p className="mt-1 text-sm text-[#667085]">
          Dán JSON hoặc tải file để thêm/cập nhật bài đọc. Hỗ trợ cả dữ liệu có trường dịch tiếng Việt.
        </p>
        <div className="mt-4">
          <ReadingTextImportForm />
        </div>
      </div>
    </section>
  );
}
