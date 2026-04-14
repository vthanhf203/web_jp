import Link from "next/link";

import { toggleBookmarkAction } from "@/app/actions/personal";
import { addKanjiToReviewAction } from "@/app/actions/study";
import { KanjiDrawSearch } from "@/app/components/kanji-draw-search";
import { SpeakJpButton } from "@/app/components/speak-jp-button";
import {
  JLPT_LEVELS,
  loadAdminVocabLibrary,
  normalizeJlptLevel,
  type JlptLevel,
} from "@/lib/admin-vocab-library";
import { requireUser } from "@/lib/auth";
import { formatTokyoDateTime } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { loadUserPersonalState } from "@/lib/user-personal-data";

type SearchParams = Promise<{
  q?: string | string[];
  level?: string | string[];
  pick?: string | string[];
  selected?: string | string[];
}>;

type RelatedWord = {
  id: string;
  word: string;
  reading: string;
  kanji: string;
  hanviet: string;
  meaning: string;
  sourceLabel: string;
  sourceGroupId?: string;
  sourceType: "admin" | "core";
};

function pickSingle(value?: string | string[]): string {
  if (!value) {
    return "";
  }
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value;
}

function parsePickedIds(rawValue: string): string[] {
  if (!rawValue.trim()) {
    return [];
  }
  return Array.from(
    new Set(
      rawValue
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

function serializePickedIds(ids: string[]): string {
  return Array.from(new Set(ids.map((item) => item.trim()).filter(Boolean))).join(",");
}

function togglePickedId(ids: string[], targetId: string): string[] {
  if (ids.includes(targetId)) {
    return ids.filter((id) => id !== targetId);
  }
  return [...ids, targetId];
}

function buildKanjiLearnHref(options: {
  rawQuery?: string;
  level: JlptLevel | null;
  pickedIds?: string[];
}): string {
  const query = (options.rawQuery ?? "").trim();
  const params = new URLSearchParams();
  if (query) {
    params.set("q", query);
  }
  if (options.level) {
    params.set("level", options.level);
  }
  const picked = serializePickedIds(options.pickedIds ?? []);
  if (picked) {
    params.set("ids", picked);
  }
  const queryString = params.toString();
  if (!queryString) {
    return "/kanji/learn";
  }
  return `/kanji/learn?${queryString}`;
}

function buildKanjiPageHref(options: {
  level: JlptLevel | null;
  rawQuery?: string;
  pickedIds?: string[];
  selectedChar?: string;
}): string {
  const query = (options.rawQuery ?? "").trim();
  const params = new URLSearchParams();
  if (options.level) {
    params.set("level", options.level);
  }
  if (query) {
    params.set("q", query);
  }
  const picked = serializePickedIds(options.pickedIds ?? []);
  if (picked) {
    params.set("pick", picked);
  }
  const selectedChar = (options.selectedChar ?? "").trim();
  if (selectedChar) {
    params.set("selected", selectedChar);
  }
  const queryString = params.toString();
  return queryString ? `/kanji?${queryString}` : "/kanji";
}

function levelStyle(level: JlptLevel, active: JlptLevel | null): string {
  if (level !== active) {
    return "border-slate-200 bg-white/95 text-slate-700 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white";
  }
  if (level === "N5") {
    return "border-emerald-300 bg-emerald-100/95 text-emerald-800";
  }
  if (level === "N4") {
    return "border-blue-300 bg-blue-100/95 text-blue-800";
  }
  if (level === "N3") {
    return "border-amber-300 bg-amber-100/95 text-amber-800";
  }
  if (level === "N2") {
    return "border-orange-300 bg-orange-100/95 text-orange-800";
  }
  return "border-rose-300 bg-rose-100/95 text-rose-800";
}

function allLevelStyle(active: JlptLevel | null): string {
  if (active === null) {
    return "border-violet-300 bg-violet-100/95 text-violet-800";
  }
  return "border-slate-200 bg-white/95 text-slate-700 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white";
}

function chooseSelectedKanji<T extends { character: string; meaning: string }>(
  list: T[],
  rawQuery: string,
  rawSelected: string
): T | null {
  if (list.length === 0) {
    return null;
  }

  const selected = rawSelected.trim();
  if (selected) {
    const exactSelected = list.find((item) => item.character === selected);
    if (exactSelected) {
      return exactSelected;
    }
  }

  const query = rawQuery.trim();
  if (!query) {
    return list[0];
  }

  const exactChar = list.find((item) => item.character === query);
  if (exactChar) {
    return exactChar;
  }

  const exactMeaning = list.find((item) => item.meaning.toLowerCase() === query.toLowerCase());
  if (exactMeaning) {
    return exactMeaning;
  }

  return list[0];
}

function dedupeRelatedWords(items: RelatedWord[]): RelatedWord[] {
  const used = new Set<string>();
  const output: RelatedWord[] = [];

  for (const item of items) {
    const key = `${item.kanji || item.word}|${item.reading}|${item.meaning}|${item.sourceType}`;
    if (used.has(key)) {
      continue;
    }
    used.add(key);
    output.push(item);
  }

  return output;
}

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

export default async function KanjiPage(props: { searchParams: SearchParams }) {
  const user = await requireUser();
  const params = await props.searchParams;
  const rawQuery = pickSingle(params.q);
  const rawSelected = pickSingle(params.selected);
  const rawLevel = pickSingle(params.level).trim();
  const rawPick = pickSingle(params.pick).trim();
  const pickedIds = parsePickedIds(rawPick);
  const selectedLevel = rawLevel ? normalizeJlptLevel(rawLevel) : null;
  const query = rawQuery.trim().toLowerCase();

  const [kanjiList, reviewList, vocabList, adminLibrary, personalState] = await Promise.all([
    prisma.kanji.findMany({
      orderBy: [{ jlptLevel: "asc" }, { character: "asc" }],
    }),
    prisma.review.findMany({
      where: {
        userId: user.id,
        kanjiId: { not: null },
      },
      select: {
        kanjiId: true,
        dueAt: true,
      },
    }),
    prisma.vocab.findMany({
      orderBy: [{ jlptLevel: "asc" }, { word: "asc" }],
    }),
    loadAdminVocabLibrary(),
    loadUserPersonalState(user.id),
  ]);

  const reviewByKanjiId = new Map(
    reviewList
      .filter((review): review is { kanjiId: string; dueAt: Date } => !!review.kanjiId)
      .map((review) => [review.kanjiId, review.dueAt])
  );
  const countByLevel = JLPT_LEVELS.reduce(
    (acc, level) => {
      acc[level] = kanjiList.filter((kanji) => kanji.jlptLevel === level).length;
      return acc;
    },
    {} as Record<JlptLevel, number>
  );
  const levelFilteredKanji = selectedLevel
    ? kanjiList.filter((kanji) => kanji.jlptLevel === selectedLevel)
    : kanjiList;

  const filteredKanji = query
    ? levelFilteredKanji.filter((kanji) => {
        const haystacks = [
          kanji.character,
          kanji.meaning,
          kanji.onReading,
          kanji.kunReading,
          kanji.jlptLevel,
          kanji.exampleWord,
          kanji.exampleMeaning,
        ].map((value) => value.toLowerCase());
        return haystacks.some((value) => value.includes(query));
      })
    : levelFilteredKanji;
  const filteredIds = new Set(filteredKanji.map((item) => item.id));
  const activePickedIds = pickedIds.filter((id) => filteredIds.has(id));
  const pickedIdSet = new Set(activePickedIds);

  const selectedKanji = chooseSelectedKanji(filteredKanji, rawQuery, rawSelected);
  const selectedDueAt = selectedKanji ? reviewByKanjiId.get(selectedKanji.id) : undefined;
  const bookmarkedKeySet = new Set(
    personalState.bookmarks.map((item) => `${item.type}:${item.refId}`)
  );
  const selectedKanjiBookmarked = selectedKanji
    ? bookmarkedKeySet.has(`kanji:${selectedKanji.character}`)
    : false;
  const selectedKanjiPicked = selectedKanji ? pickedIdSet.has(selectedKanji.id) : false;
  const selectedKanjiToggledPickedIds = selectedKanji
    ? togglePickedId(activePickedIds, selectedKanji.id)
    : activePickedIds;
  const selectedFlashcardKanji = filteredKanji.filter((kanji) => pickedIdSet.has(kanji.id));

  const adminRelatedWords: RelatedWord[] = selectedKanji
    ? dedupeRelatedWords(
        adminLibrary.lessons.flatMap((lesson) =>
          lesson.items
            .filter((item) => {
              const sourceText = `${item.kanji} ${item.word}`;
              return sourceText.includes(selectedKanji.character);
            })
            .map((item) => ({
              id: `${lesson.id}-${item.id}`,
              word: item.word,
              reading: item.reading,
              kanji: item.kanji,
              hanviet: item.hanviet,
              meaning: item.meaning,
              sourceLabel: lesson.title,
              sourceGroupId: lesson.id,
              sourceType: "admin" as const,
            }))
        )
      )
    : [];

  const coreRelatedWords: RelatedWord[] = selectedKanji
    ? dedupeRelatedWords(
        vocabList
          .filter((item) => item.word.includes(selectedKanji.character))
          .map((item) => ({
            id: item.id,
            word: item.word,
            reading: item.reading,
            kanji: item.word,
            hanviet: "",
            meaning: item.meaning,
            sourceLabel: item.jlptLevel,
            sourceType: "core" as const,
          }))
      )
    : [];

  const relatedFlashcardHref =
    adminRelatedWords[0]?.sourceGroupId
      ? `/vocab/learn?group=${encodeURIComponent(adminRelatedWords[0].sourceGroupId)}&mode=flashcard`
      : selectedKanji
        ? buildKanjiLearnHref({
            rawQuery: selectedKanji.character,
            level: selectedLevel,
          })
        : "/vocab";
  const allFilteredFlashcardHref = buildKanjiLearnHref({
    rawQuery,
    level: selectedLevel,
  });
  const pickedFlashcardHref = buildKanjiLearnHref({
    level: selectedLevel,
    pickedIds: activePickedIds,
  });

  return (
    <section className="space-y-6">
      <div className="floating-card rounded-3xl border border-blue-100/80 bg-gradient-to-br from-white/96 via-white/93 to-sky-50/90 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="chip">Kanji Explorer</p>
            <h1 className="mt-3 text-3xl font-extrabold text-slate-900 sm:text-4xl">
              Kham pha Kanji theo trinh do JLPT
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600 sm:text-base">
              Loc theo cap do, ve net de tim nhanh, va tao bo flashcard rieng de hoc ngay.
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Link
            href={buildKanjiPageHref({
              level: null,
              rawQuery,
              pickedIds: activePickedIds,
              selectedChar: rawSelected,
            })}
            scroll={false}
            className={`rounded-xl border px-4 py-2 text-sm font-semibold transition ${allLevelStyle(selectedLevel)}`}
          >
            Tat ca ({kanjiList.length})
          </Link>
          {JLPT_LEVELS.map((level) => (
            <Link
              key={level}
              href={buildKanjiPageHref({
                level,
                rawQuery,
                pickedIds: activePickedIds,
              selectedChar: rawSelected,
            })}
            scroll={false}
            className={`rounded-xl border px-4 py-2 text-sm font-semibold transition ${levelStyle(level, selectedLevel)}`}
          >
            {level} ({countByLevel[level]})
          </Link>
        ))}
        </div>
        <p className="mt-3 text-sm text-slate-500">
          Dang hien thi: {selectedLevel ?? "Tat ca"} · {filteredKanji.length} ky tu phu hop
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Link href={allFilteredFlashcardHref} className="btn-primary text-sm">
            Flashcard Kanji dang loc
          </Link>
          <Link
            href={pickedFlashcardHref}
            className={`rounded-xl border px-4 py-2 text-sm font-semibold transition ${
              activePickedIds.length > 0
                ? "border-emerald-300 bg-emerald-100/95 text-emerald-800 hover:-translate-y-0.5 hover:bg-emerald-200"
                : "pointer-events-none cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
            }`}
          >
            Flashcard da chon ({activePickedIds.length})
          </Link>
          {activePickedIds.length > 0 ? (
            <Link
              href={buildKanjiPageHref({
                level: selectedLevel,
                rawQuery,
                selectedChar: rawSelected,
              })}
              scroll={false}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:-translate-y-0.5 hover:bg-slate-50"
            >
              Bo chon
            </Link>
          ) : null}
        </div>
        {selectedFlashcardKanji.length > 0 ? (
          <p className="mt-2 text-xs text-slate-500">
            Da chon: {selectedFlashcardKanji.slice(0, 12).map((item) => item.character).join(" · ")}
            {selectedFlashcardKanji.length > 12 ? ` ... (+${selectedFlashcardKanji.length - 12})` : ""}
          </p>
        ) : null}
      </div>

      <KanjiDrawSearch
        items={levelFilteredKanji.map((kanji) => ({
          character: kanji.character,
          meaning: kanji.meaning,
          onReading: kanji.onReading,
          kunReading: kanji.kunReading,
          jlptLevel: kanji.jlptLevel,
          strokeCount: kanji.strokeCount,
        }))}
        initialQuery={rawQuery}
        level={selectedLevel ?? undefined}
      />

      {selectedKanji ? (
        <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]" id={`kanji-${selectedKanji.id}`}>
          <article className="panel p-5">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                disabled
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-500"
              >
                Xem net ve
              </button>
              <div className="flex items-center gap-2">
                <SpeakJpButton text={selectedKanji.character} className="h-9 w-9 text-base" />
                <Link
                  href={buildKanjiPageHref({
                    level: selectedLevel,
                    rawQuery,
                    pickedIds: selectedKanjiToggledPickedIds,
                    selectedChar: selectedKanji.character,
                  })}
                  scroll={false}
                  className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                    selectedKanjiPicked
                      ? "border-emerald-300 bg-emerald-100 text-emerald-800 hover:-translate-y-0.5 hover:bg-emerald-200"
                      : "border-slate-200 bg-white text-slate-700 hover:-translate-y-0.5 hover:bg-slate-50"
                  }`}
                >
                  {selectedKanjiPicked ? "Bo khoi flashcard" : "+ Them vao flashcard"}
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
                    value={`${selectedKanji.jlptLevel} · ${selectedKanji.strokeCount} net`}
                  />
                  <input type="hidden" name="returnTo" value="/kanji" />
                  <button type="submit" className="btn-soft text-sm">
                    {selectedKanjiBookmarked ? "Bo bookmark" : "Bookmark"}
                  </button>
                </form>
                {selectedDueAt ? (
                  <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                    Da luu de on tap: {formatTokyoDateTime(selectedDueAt)}
                  </p>
                ) : (
                  <form action={addKanjiToReviewAction}>
                    <input type="hidden" name="kanjiId" value={selectedKanji.id} />
                    <button type="submit" className="btn-soft text-sm">
                      + Luu de on tap
                    </button>
                  </form>
                )}
              </div>
            </div>

            <div className="mt-5 flex items-start gap-4">
              <p className="text-7xl font-extrabold text-slate-900">{selectedKanji.character}</p>
              <div>
                <p className="text-4xl font-extrabold text-slate-900">{selectedKanji.meaning}</p>
                <p className="mt-2 text-sm text-slate-500">
                  Trinh do {selectedKanji.jlptLevel} · {selectedKanji.strokeCount} net
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/75 p-4 shadow-inner">
              <p className="text-sm font-semibold text-orange-500">-&gt; Quy tac chuyen am</p>
              <p className="mt-2 text-slate-700">
                Y nghia: <strong>{selectedKanji.meaning}</strong>
              </p>
              <p className="mt-1 text-slate-700">
                So net: <strong>{selectedKanji.strokeCount}</strong>
              </p>
              <p className="mt-1 text-slate-700">
                Am Kun: <strong>{selectedKanji.kunReading || "-"}</strong>
              </p>
              <p className="mt-1 text-slate-700">
                Am On: <strong>{selectedKanji.onReading || "-"}</strong>
              </p>
              <p className="mt-1 text-slate-700">
                Goi y hoc nhanh: <strong>{selectedKanji.exampleWord}</strong> - {selectedKanji.exampleMeaning}
              </p>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href={buildKanjiLearnHref({
                  rawQuery: selectedKanji.character,
                  level: selectedLevel,
                })}
                className="btn-primary text-sm"
              >
                Flashcard chu nay
              </Link>
              <Link href="/dashboard" className="btn-soft text-sm">
                Ve trang hoc
              </Link>
            </div>
          </article>

          <aside className="panel p-5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-2xl font-bold text-orange-500">Tu vung lien quan</h3>
              <Link href={relatedFlashcardHref} className="text-sm font-semibold text-sky-600 hover:text-sky-700">
                Flashcard -&gt;
              </Link>
            </div>

            <p className="mt-2 text-xs text-slate-500">Nguon admin (Mina/Tango/tu upload)</p>
            <div className="mt-2 max-h-[280px] space-y-2 overflow-y-auto pr-1">
              {adminRelatedWords.length === 0 ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                  Chua co tu nao co chua chu {selectedKanji.character} trong kho admin.
                </p>
              ) : (
                adminRelatedWords.slice(0, 20).map((entry) => (
                  <article
                    key={entry.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-slate-200/85 bg-white/95 px-3 py-2 shadow-[0_6px_16px_rgba(15,23,42,0.05)]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-lg font-semibold text-slate-800">
                        {renderWordWithHighlight(entry.kanji || entry.word, selectedKanji.character)}
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
                    <SpeakJpButton text={entry.kanji || entry.word} />
                  </article>
                ))
              )}
            </div>

            <p className="mt-5 text-xs text-slate-500">Tu vung tu CSDL JLPT</p>
            <div className="mt-2 max-h-[180px] space-y-2 overflow-y-auto pr-1">
              {coreRelatedWords.length === 0 ? (
                <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  Chua co muc nao trong bang vocab he thong.
                </p>
              ) : (
                coreRelatedWords.slice(0, 12).map((entry) => (
                  <article
                    key={entry.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-slate-200/85 bg-white/95 px-3 py-2 shadow-[0_6px_16px_rgba(15,23,42,0.05)]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-slate-800">
                        {renderWordWithHighlight(entry.word, selectedKanji.character)}
                        {entry.reading ? (
                          <span className="ml-2 text-sm font-normal text-slate-500">({entry.reading})</span>
                        ) : null}
                      </p>
                      <p className="truncate text-sm text-slate-600">{entry.meaning}</p>
                    </div>
                    <SpeakJpButton text={entry.word} />
                  </article>
                ))
              )}
            </div>
          </aside>
        </div>
      ) : null}

      <div className="panel p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-3xl font-extrabold text-slate-900">Thu vien Kanji ({filteredKanji.length})</h2>
          <p className="text-sm text-slate-500">Bam vao o de mo chi tiet va tu vung lien quan</p>
        </div>

        {filteredKanji.length === 0 ? (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            Khong tim thay kanji phu hop. Thu tu khoa khac hoac ve lai net.
          </p>
        ) : (
          <div className="mt-4 grid gap-2.5 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-10">
            {filteredKanji.map((kanji) => {
              const active = selectedKanji?.id === kanji.id;
              const picked = pickedIdSet.has(kanji.id);
              return (
                <article
                  key={kanji.id}
                  className={`rounded-xl border px-3 py-3 text-center transition ${
                    active
                      ? "border-sky-300 bg-sky-100 shadow-[0_10px_20px_rgba(56,189,248,0.2)]"
                      : picked
                        ? "border-emerald-300 bg-emerald-50 shadow-[0_10px_20px_rgba(16,185,129,0.15)]"
                      : "border-slate-200 bg-white hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <Link
                    href={buildKanjiPageHref({
                      level: selectedLevel,
                      rawQuery,
                      pickedIds: activePickedIds,
                      selectedChar: kanji.character,
                    })}
                    scroll={false}
                    className="block"
                  >
                    <p className="text-[1.7rem] font-bold text-slate-900">{kanji.character}</p>
                    <p className="mt-1 truncate text-xs text-slate-600">{kanji.meaning}</p>
                  </Link>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

