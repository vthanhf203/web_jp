import Link from "next/link";
import { ArrowLeft, Layers3, Sparkles } from "lucide-react";

import { ActionSection } from "@/app/components/action-section";
import { DeckManagerHub } from "@/app/components/deck-manager-hub";
import { VocabCard } from "@/app/components/vocab-card";
import { VocabGridMotion } from "@/app/components/vocab-grid-motion";
import { loadAdminVocabLibrary, normalizeJlptLevel } from "@/lib/admin-vocab-library";
import { requireUser } from "@/lib/auth";
import { loadUserPersonalState } from "@/lib/user-personal-data";
import { loadUserVocabStore } from "@/lib/vocab-store";

type RouteParams = Promise<{
  groupId: string;
}>;

type SearchParams = Promise<{
  level?: string | string[];
  page?: string | string[];
  deck?: string | string[];
}>;

function pickSingle(value?: string | string[]): string {
  if (!value) {
    return "";
  }
  return Array.isArray(value) ? value[0] ?? "" : value;
}

function parsePositivePage(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }
  return Math.floor(parsed);
}

function coveragePercent(hasValue: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  return Math.round((hasValue / total) * 100);
}

function ProgressRing({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  const safe = Math.max(0, Math.min(100, value));
  const sweep = `${safe * 3.6}deg`;

  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white/60 px-3 py-2 shadow-sm ring-1 ring-slate-200/60">
      <div
        className="relative h-12 w-12 rounded-full p-[3px]"
        style={{ background: `conic-gradient(${color} ${sweep}, rgba(203,213,225,0.75) ${sweep})` }}
      >
        <div className="grid h-full w-full place-items-center rounded-full bg-[#f8fafc] font-mono text-xs font-bold text-slate-700">
          {safe}%
        </div>
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      </div>
    </div>
  );
}

export default async function VocabGroupDetailPage(props: {
  params: RouteParams;
  searchParams: SearchParams;
}) {
  const user = await requireUser();

  const params = await props.params;
  const search = await props.searchParams;
  const levelFromQuery = normalizeJlptLevel(pickSingle(search.level));
  const pageFromQuery = parsePositivePage(pickSingle(search.page));
  const deckFromQuery = pickSingle(search.deck).trim();

  const [library, personalState, userStore] = await Promise.all([
    loadAdminVocabLibrary(),
    loadUserPersonalState(user.id),
    loadUserVocabStore(user.id),
  ]);
  const group = library.lessons.find((entry) => entry.id === params.groupId);

  if (!group) {
    return (
      <section className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200/70">
        <h1 className="text-2xl font-bold text-slate-800">Khong tim thay chu de</h1>
        <p className="mt-2 text-slate-600">Chu de co the da bi xoa hoac thay doi.</p>
        <Link href="/vocab" className="btn-primary mt-5">
          Quay lai /vocab
        </Link>
      </section>
    );
  }

  const groupId = group.id;
  const level = normalizeJlptLevel(group.jlptLevel || levelFromQuery);
  const totalWords = group.items.length;
  const withKanji = group.items.filter((item) => item.kanji.trim().length > 0).length;
  const withHanViet = group.items.filter((item) => item.hanviet.trim().length > 0).length;
  const withPos = group.items.filter((item) => item.partOfSpeech.trim().length > 0).length;

  const kanjiCoverage = coveragePercent(withKanji, totalWords);
  const hanvietCoverage = coveragePercent(withHanViet, totalWords);
  const posCoverage = coveragePercent(withPos, totalWords);

  const bookmarkKeySet = new Set(personalState.bookmarks.map((item) => `${item.type}:${item.refId}`));
  const deckOptions = userStore.lessons.map((lesson) => ({
    id: `lesson:${lesson.id}`,
    label: lesson.title,
    count: lesson.items.length,
  }));

  const selectedDeckId =
    deckFromQuery && deckOptions.some((deck) => deck.id === deckFromQuery)
      ? deckFromQuery
      : (deckOptions[0]?.id ?? "");

  const selectedDeckLabel = deckOptions.find((deck) => deck.id === selectedDeckId)?.label ?? "";
  const selectedLessonId = selectedDeckId.startsWith("lesson:") ? selectedDeckId.slice("lesson:".length) : "";
  const selectedLesson = userStore.lessons.find((lesson) => lesson.id === selectedLessonId) ?? null;
  const selectedLessonItems = selectedLesson ? [...selectedLesson.items] : [];

  const deckWordSetMap = new Map<string, Set<string>>();
  for (const lesson of userStore.lessons) {
    deckWordSetMap.set(`lesson:${lesson.id}`, new Set(lesson.items.map((item) => item.word)));
  }
  const selectedDeckWordSet = selectedDeckId ? (deckWordSetMap.get(selectedDeckId) ?? new Set<string>()) : new Set<string>();

  const PAGE_SIZE = 12;
  const totalPages = Math.max(1, Math.ceil(totalWords / PAGE_SIZE));
  const currentPage = Math.min(pageFromQuery, totalPages);
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const pagedItems = group.items.slice(startIndex, startIndex + PAGE_SIZE);

  function pageHref(page: number, deckId: string = selectedDeckId): string {
    const query = new URLSearchParams();
    query.set("level", level);
    query.set("page", String(page));
    if (deckId) {
      query.set("deck", deckId);
    }
    return `/vocab/group/${groupId}?${query.toString()}`;
  }

  function pageVocabHref(page: number, deckId: string = selectedDeckId): string {
    return `${pageHref(page, deckId)}#vocab-list`;
  }

  const deckTabs = deckOptions.map((deck) => ({
    id: deck.id,
    label: deck.label,
    count: deck.count,
    href: `${pageHref(currentPage, deck.id)}#deck-hub`,
    active: deck.id === selectedDeckId,
  }));

  const selectedLessonPreview = selectedLessonItems.map((item) => ({
    id: item.id,
    primary: item.reading || item.word,
    secondary: item.kanji || "",
    meaning: item.meaning,
  }));

  const topicFlashcardHref = `/vocab/learn?group=${groupId}&mode=flashcard`;
  const topicQuizHref = `/vocab/learn?group=${groupId}&mode=quiz`;
  const topicRecallHref = `/vocab/learn?group=${groupId}&mode=recall`;

  return (
    <section className="space-y-8 rounded-3xl bg-[#f8fafc] p-3 sm:p-5">
      <div className="relative overflow-hidden rounded-[1.8rem] bg-white/78 p-6 shadow-sm ring-1 ring-slate-200/70 backdrop-blur-md sm:p-7">
        <div className="pointer-events-none absolute -left-10 top-2 h-32 w-36 rounded-full bg-sky-200/35 blur-3xl" />
        <div className="pointer-events-none absolute -right-10 -top-6 h-36 w-40 rounded-full bg-indigo-200/30 blur-3xl" />

        <div className="relative space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Link
                href={`/vocab?mode=library&level=${level}`}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/85 text-slate-700 shadow-sm ring-1 ring-slate-200/70 transition hover:-translate-y-0.5 hover:bg-sky-50 hover:text-sky-700"
                aria-label="Quay lai"
                title="Quay lai"
              >
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{level} - Chu de admin</p>
              <h1 className="mt-1 text-3xl font-black leading-tight tracking-tight text-slate-900 sm:text-5xl">
                {group.title}
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-500 sm:text-base">
                {group.description || "Nhom tu vung theo trinh do JLPT"}
              </p>
            </div>

            <div className="rounded-2xl bg-white/80 px-4 py-3 text-center shadow-sm ring-1 ring-slate-200/70">
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Level</p>
              <p className="font-mono text-3xl font-bold text-slate-900">{level}</p>
              <p className="font-mono text-xs text-slate-500">{totalWords} tu</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              <Layers3 className="mr-1.5 h-3.5 w-3.5" />
              {totalWords} tu vung
            </span>
            <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              {withKanji} co kanji
            </span>
            <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              {withHanViet} co han viet
            </span>
          </div>

          <div className="flex flex-wrap gap-3">
            <ProgressRing label="Kanji" value={kanjiCoverage} color="#22d3ee" />
            <ProgressRing label="Han Viet" value={hanvietCoverage} color="#a78bfa" />
            <ProgressRing label="POS" value={posCoverage} color="#f59e0b" />
          </div>
        </div>
      </div>

      <DeckManagerHub
        deckTabs={deckTabs}
        createReturnTo={pageHref(currentPage, selectedDeckId)}
        selectedDeckLabel={selectedDeckLabel}
        selectedLessonId={selectedLessonId}
        selectedLessonItemsCount={selectedLessonItems.length}
        selectedLessonPreview={selectedLessonPreview}
        manageHref={selectedLesson ? `/vocab?mode=self&lesson=${selectedLesson.id}` : "/vocab?mode=self"}
      />

      <div id="vocab-list" className="scroll-mt-24 rounded-[1.8rem] bg-white p-6 shadow-sm ring-1 ring-slate-200/70 sm:p-7">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-black tracking-tight text-slate-900">Danh sach tu vung</h2>
            <p className="mt-1 text-sm text-slate-500">
              The trang thai toi gian, khoang trang rong, tap trung vao noi dung hoc.
            </p>
          </div>
          <p className="font-mono text-sm font-bold text-slate-600">
            Trang {currentPage}/{totalPages} - Hien {pagedItems.length}/{totalWords}
          </p>
        </div>

        <div className="mt-6">
          <VocabGridMotion>
            {pagedItems.map((item, index) => {
              const bookmarked = bookmarkKeySet.has(`vocab:${item.id}`);
              const inSelectedDeck = selectedDeckWordSet.has(item.word);
              const itemOrder = startIndex + index + 1;
              return (
                <VocabCard
                  key={item.id}
                  item={item}
                  itemOrder={itemOrder}
                  level={level}
                  returnTo={pageHref(currentPage, selectedDeckId)}
                  selectedDeckId={selectedDeckId}
                  isBookmarked={bookmarked}
                  inSelectedDeck={inSelectedDeck}
                />
              );
            })}
          </VocabGridMotion>
        </div>

        {totalPages > 1 ? (
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <Link
              href={pageVocabHref(Math.max(1, currentPage - 1))}
              aria-label="Trang truoc"
              className={`inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm ring-1 ring-slate-200 ${
                currentPage <= 1 ? "pointer-events-none opacity-45" : "hover:bg-slate-100"
              }`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                <path d="m15 18-6-6 6-6" />
              </svg>
            </Link>

            {Array.from({ length: totalPages }).map((_, index) => {
              const page = index + 1;
              const isActive = page === currentPage;
              const shouldShow = page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1;

              if (!shouldShow) {
                if (page === currentPage - 2 || page === currentPage + 2) {
                  return (
                    <span key={`dots-${page}`} className="px-1 text-slate-400">
                      ...
                    </span>
                  );
                }
                return null;
              }

              return (
                <Link
                  key={page}
                  href={pageVocabHref(page)}
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold shadow-sm ring-1 ring-slate-200 ${
                    isActive ? "bg-sky-100 text-sky-700" : "bg-white text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {page}
                </Link>
              );
            })}

            <Link
              href={pageVocabHref(Math.min(totalPages, currentPage + 1))}
              aria-label="Trang sau"
              className={`inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm ring-1 ring-slate-200 ${
                currentPage >= totalPages ? "pointer-events-none opacity-45" : "hover:bg-slate-100"
              }`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </Link>
          </div>
        ) : null}

        <div className="mt-4 rounded-xl bg-violet-50/80 px-3 py-2 text-xs text-violet-700">
          <Sparkles className="mr-1 inline h-3.5 w-3.5" />
          Meo: Bam phan trang se tu nhay ve khu "Danh sach tu vung" de hoc lien tuc.
        </div>

        <div className="mt-5">
          <ActionSection
            title="Hoc nhanh chu de nay"
            subtitle="Luon mo theo chu de dang xem"
            flashcardHref={topicFlashcardHref}
            quizHref={topicQuizHref}
            recallHref={topicRecallHref}
          />
        </div>
      </div>
    </section>
  );
}






