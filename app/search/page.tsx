import Link from "next/link";

import { toggleBookmarkAction } from "@/app/actions/personal";
import {
  JLPT_LEVELS,
  loadAdminVocabLibrary,
  normalizeJlptLevel,
  type JlptLevel,
} from "@/lib/admin-vocab-library";
import { requireUser } from "@/lib/auth";
import { loadGrammarDataset } from "@/lib/grammar-dataset";
import { prisma } from "@/lib/prisma";
import { loadUserPersonalState } from "@/lib/user-personal-data";

type SearchParams = Promise<{
  q?: string | string[];
  level?: string | string[];
  kpage?: string | string[];
  vpage?: string | string[];
  apage?: string | string[];
  gpage?: string | string[];
}>;

type KanjiResult = {
  id: string;
  character: string;
  meaning: string;
  onReading: string;
  kunReading: string;
  jlptLevel: string;
  strokeCount: number;
  exampleWord: string;
  exampleMeaning: string;
  score: number;
};

type VocabResult = {
  id: string;
  word: string;
  reading: string;
  meaning: string;
  jlptLevel: string;
  partOfSpeech: string;
  score: number;
};

type AdminVocabResult = {
  lessonId: string;
  lessonTitle: string;
  level: JlptLevel;
  item: {
    id: string;
    word: string;
    reading: string;
    kanji: string;
    hanviet: string;
    meaning: string;
    partOfSpeech: string;
  };
  score: number;
};

type GrammarResult = {
  lessonId: string;
  lessonTitle: string;
  level: string;
  point: {
    id: string;
    title: string;
    meaning: string;
    content: string;
    usage: string[];
    examples: string[];
    notes: string[];
  };
  score: number;
};

type CategoryCard = {
  id: string;
  title: string;
  subtitle: string;
  tone: string;
  badgeTone: string;
  count: number;
};

const QUICK_QUERIES = ["学校", "べんきょう", "N1 は N2 です", "食べる", "〜ことができます"];

const PAGE_SIZE = {
  kanji: 10,
  vocab: 10,
  admin: 10,
  grammar: 8,
} as const;

type SearchPageState = {
  kanji: number;
  vocab: number;
  admin: number;
  grammar: number;
};

type PageMeta = {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
};

const KANA_DIGRAPH_TO_ROMAJI: Record<string, string> = {
  きゃ: "kya",
  きゅ: "kyu",
  きょ: "kyo",
  ぎゃ: "gya",
  ぎゅ: "gyu",
  ぎょ: "gyo",
  しゃ: "sha",
  しゅ: "shu",
  しょ: "sho",
  じゃ: "ja",
  じゅ: "ju",
  じょ: "jo",
  ちゃ: "cha",
  ちゅ: "chu",
  ちょ: "cho",
  にゃ: "nya",
  にゅ: "nyu",
  にょ: "nyo",
  ひゃ: "hya",
  ひゅ: "hyu",
  ひょ: "hyo",
  びゃ: "bya",
  びゅ: "byu",
  びょ: "byo",
  ぴゃ: "pya",
  ぴゅ: "pyu",
  ぴょ: "pyo",
  みゃ: "mya",
  みゅ: "myu",
  みょ: "myo",
  りゃ: "rya",
  りゅ: "ryu",
  りょ: "ryo",
  でゃ: "dya",
  でゅ: "dyu",
  でょ: "dyo",
  ぢゃ: "ja",
  ぢゅ: "ju",
  ぢょ: "jo",
  うぃ: "wi",
  うぇ: "we",
  うぉ: "wo",
  ふぁ: "fa",
  ふぃ: "fi",
  ふぇ: "fe",
  ふぉ: "fo",
  てぃ: "ti",
  でぃ: "di",
  とぅ: "tu",
  どぅ: "du",
};

const KANA_TO_ROMAJI: Record<string, string> = {
  あ: "a",
  い: "i",
  う: "u",
  え: "e",
  お: "o",
  か: "ka",
  き: "ki",
  く: "ku",
  け: "ke",
  こ: "ko",
  さ: "sa",
  し: "shi",
  す: "su",
  せ: "se",
  そ: "so",
  た: "ta",
  ち: "chi",
  つ: "tsu",
  て: "te",
  と: "to",
  な: "na",
  に: "ni",
  ぬ: "nu",
  ね: "ne",
  の: "no",
  は: "ha",
  ひ: "hi",
  ふ: "fu",
  へ: "he",
  ほ: "ho",
  ま: "ma",
  み: "mi",
  む: "mu",
  め: "me",
  も: "mo",
  や: "ya",
  ゆ: "yu",
  よ: "yo",
  ら: "ra",
  り: "ri",
  る: "ru",
  れ: "re",
  ろ: "ro",
  わ: "wa",
  を: "o",
  ん: "n",
  が: "ga",
  ぎ: "gi",
  ぐ: "gu",
  げ: "ge",
  ご: "go",
  ざ: "za",
  じ: "ji",
  ず: "zu",
  ぜ: "ze",
  ぞ: "zo",
  だ: "da",
  ぢ: "ji",
  づ: "zu",
  で: "de",
  ど: "do",
  ば: "ba",
  び: "bi",
  ぶ: "bu",
  べ: "be",
  ぼ: "bo",
  ぱ: "pa",
  ぴ: "pi",
  ぷ: "pu",
  ぺ: "pe",
  ぽ: "po",
  ゔ: "vu",
  ぁ: "a",
  ぃ: "i",
  ぅ: "u",
  ぇ: "e",
  ぉ: "o",
  ゃ: "ya",
  ゅ: "yu",
  ょ: "yo",
  ゎ: "wa",
};

function pickSingle(value?: string | string[]): string {
  if (!value) {
    return "";
  }
  return Array.isArray(value) ? value[0] ?? "" : value;
}

function katakanaToHiragana(value: string): string {
  return value.replace(/[\u30A1-\u30F6]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0x60)
  );
}

function kanaToRomaji(value: string): string {
  const source = katakanaToHiragana(value.normalize("NFKC").toLowerCase());
  let output = "";

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index] ?? "";
    const next = source[index + 1] ?? "";
    const pair = `${char}${next}`;

    if (char === "っ") {
      const nextPair = `${next}${source[index + 2] ?? ""}`;
      const nextRomaji =
        KANA_DIGRAPH_TO_ROMAJI[nextPair] ??
        KANA_TO_ROMAJI[next] ??
        "";
      if (nextRomaji && /^[a-z]/.test(nextRomaji)) {
        output += nextRomaji[0];
      }
      continue;
    }

    if (char === "ー") {
      const lastVowel = output.match(/[aeiou](?!.*[aeiou])/)?.[0] ?? "";
      output += lastVowel;
      continue;
    }

    if (KANA_DIGRAPH_TO_ROMAJI[pair]) {
      output += KANA_DIGRAPH_TO_ROMAJI[pair];
      index += 1;
      continue;
    }

    if (KANA_TO_ROMAJI[char]) {
      output += KANA_TO_ROMAJI[char];
      continue;
    }

    output += char;
  }

  return output;
}

function toComparableText(value: string): string {
  const normalized = katakanaToHiragana(value.normalize("NFKC").toLowerCase());
  return normalized
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeQuery(rawQuery: string): string[] {
  return toComparableText(rawQuery)
    .split(" ")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isAsciiToken(token: string): boolean {
  return /^[a-z0-9]+$/.test(token);
}

function maxDistanceByLength(token: string): number {
  if (token.length <= 4) {
    return 1;
  }
  if (token.length <= 7) {
    return 2;
  }
  return 3;
}

function boundedLevenshtein(left: string, right: string, maxDistance: number): number {
  if (left === right) {
    return 0;
  }
  if (Math.abs(left.length - right.length) > maxDistance) {
    return maxDistance + 1;
  }

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    let rowMin = row;

    for (let column = 1; column <= right.length; column += 1) {
      const substitutionCost = left[row - 1] === right[column - 1] ? 0 : 1;
      const next = Math.min(
        previous[column] + 1,
        current[column - 1] + 1,
        previous[column - 1] + substitutionCost
      );
      current.push(next);
      if (next < rowMin) {
        rowMin = next;
      }
    }

    if (rowMin > maxDistance) {
      return maxDistance + 1;
    }
    previous = current;
  }

  const distance = previous[right.length];
  return distance > maxDistance ? maxDistance + 1 : distance;
}

function tokenMatchScore(token: string, merged: string, words: string[]): number {
  const directIndex = merged.indexOf(token);
  if (directIndex === 0) {
    return 34;
  }
  if (directIndex > 0) {
    return 24;
  }

  if (!isAsciiToken(token) || token.length < 3) {
    return -1;
  }

  const maxDistance = maxDistanceByLength(token);
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const word of words) {
    if (!isAsciiToken(word)) {
      continue;
    }
    if (word.startsWith(token)) {
      return 20;
    }

    const distance = boundedLevenshtein(token, word, maxDistance);
    if (distance < bestDistance) {
      bestDistance = distance;
    }
    if (bestDistance === 0) {
      return 20;
    }
  }

  if (!Number.isFinite(bestDistance) || bestDistance > maxDistance) {
    return -1;
  }

  return 18 - bestDistance * 5;
}

function buildFieldVariants(fields: string[]): string[] {
  const variants = new Set<string>();

  for (const field of fields) {
    const comparable = toComparableText(field);
    if (comparable) {
      variants.add(comparable);
    }

    const romajiComparable = toComparableText(kanaToRomaji(field));
    if (romajiComparable) {
      variants.add(romajiComparable);
    }
  }

  return [...variants];
}

function scoreByFields(queryComparable: string, queryTokens: string[], fields: string[]): number {
  if (!queryComparable || queryTokens.length === 0) {
    return -1;
  }

  const fieldVariants = buildFieldVariants(fields);
  if (fieldVariants.length === 0) {
    return -1;
  }

  const merged = fieldVariants.join(" ");
  const words = merged.split(" ").filter(Boolean);

  const matchedScores = queryTokens
    .map((token) => tokenMatchScore(token, merged, words))
    .filter((score) => score >= 0);

  const requiredMatches = queryTokens.length <= 2 ? 1 : Math.ceil(queryTokens.length * 0.6);
  if (matchedScores.length < requiredMatches) {
    return -1;
  }

  let bestFieldScore = 36;
  for (const field of fieldVariants) {
    if (field === queryComparable) {
      bestFieldScore = Math.max(bestFieldScore, 250);
      continue;
    }
    if (field.startsWith(queryComparable)) {
      bestFieldScore = Math.max(bestFieldScore, 188);
      continue;
    }
    if (field.includes(queryComparable)) {
      bestFieldScore = Math.max(bestFieldScore, 144);
      continue;
    }
    if (isAsciiToken(queryComparable) && queryComparable.length >= 4) {
      const limit = maxDistanceByLength(queryComparable);
      const distance = boundedLevenshtein(queryComparable, field, limit);
      if (distance <= limit) {
        bestFieldScore = Math.max(bestFieldScore, 120 - distance * 12);
      }
    }
  }

  const tokenBonus = matchedScores.reduce((sum, score) => sum + score, 0);
  const coverageBonus = Math.min(matchedScores.length * 16, 64);
  const lengthBonus = Math.min(queryComparable.length * 2, 32);

  return bestFieldScore + Math.min(tokenBonus, 96) + coverageBonus + lengthBonus;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function parsePositiveInt(raw: string, fallback = 1): number {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return parsed;
}

function paginateItems<T>(items: T[], requestedPage: number, pageSize: number): { items: T[]; meta: PageMeta } {
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = clamp(requestedPage, 1, totalPages);
  const start = (page - 1) * pageSize;
  const pageItems = items.slice(start, start + pageSize);

  return {
    items: pageItems,
    meta: {
      page,
      totalPages,
      totalItems,
      pageSize,
    },
  };
}

function buildPageWindow(current: number, totalPages: number, radius = 2): number[] {
  if (totalPages <= 1) {
    return [1];
  }

  const start = Math.max(1, current - radius);
  const end = Math.min(totalPages, current + radius);
  const pages: number[] = [];
  for (let page = start; page <= end; page += 1) {
    pages.push(page);
  }
  return pages;
}

function buildSearchHref(
  query: string,
  level: JlptLevel | null,
  pages?: Partial<SearchPageState>
): string {
  const params = new URLSearchParams();
  if (query.trim()) {
    params.set("q", query.trim());
  }
  if (level) {
    params.set("level", level);
  }
  if (pages?.kanji && pages.kanji > 1) {
    params.set("kpage", String(pages.kanji));
  }
  if (pages?.vocab && pages.vocab > 1) {
    params.set("vpage", String(pages.vocab));
  }
  if (pages?.admin && pages.admin > 1) {
    params.set("apage", String(pages.admin));
  }
  if (pages?.grammar && pages.grammar > 1) {
    params.set("gpage", String(pages.grammar));
  }
  const queryString = params.toString();
  return queryString ? `/search?${queryString}` : "/search";
}

function buildCategoryCards(counts: {
  kanji: number;
  vocab: number;
  grammar: number;
  admin: number;
}): CategoryCard[] {
  return [
    {
      id: "kanji-results",
      title: "Kanji",
      subtitle: "Tra ký tự, âm đọc, bộ thủ",
      tone: "border-blue-100 bg-blue-50/60",
      badgeTone: "bg-blue-100 text-blue-700",
      count: counts.kanji,
    },
    {
      id: "vocab-results",
      title: "Từ vựng",
      subtitle: "Kho từ vựng hệ thống",
      tone: "border-emerald-100 bg-emerald-50/60",
      badgeTone: "bg-emerald-100 text-emerald-700",
      count: counts.vocab,
    },
    {
      id: "grammar-results",
      title: "Ngữ pháp",
      subtitle: "Mẫu câu và cấu trúc",
      tone: "border-amber-100 bg-amber-50/70",
      badgeTone: "bg-amber-100 text-amber-700",
      count: counts.grammar,
    },
    {
      id: "admin-vocab-results",
      title: "Từ vựng Admin",
      subtitle: "Theo lesson Admin upload",
      tone: "border-violet-100 bg-violet-50/60",
      badgeTone: "bg-violet-100 text-violet-700",
      count: counts.admin,
    },
  ];
}

function withUpdatedPage(
  pages: SearchPageState,
  key: keyof SearchPageState,
  value: number
): SearchPageState {
  return { ...pages, [key]: value } as SearchPageState;
}

function renderPaginationControls(params: {
  query: string;
  level: JlptLevel | null;
  pages: SearchPageState;
  keyName: keyof SearchPageState;
  meta: PageMeta;
}) {
  const { query, level, pages, keyName, meta } = params;
  if (meta.totalPages <= 1) {
    return null;
  }

  const visiblePages = buildPageWindow(meta.page, meta.totalPages, 2);
  const prevPage = Math.max(1, meta.page - 1);
  const nextPage = Math.min(meta.totalPages, meta.page + 1);

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
      <p className="text-xs font-semibold text-slate-500">
        Trang {meta.page}/{meta.totalPages} • {meta.totalItems} kết quả
      </p>
      <nav className="flex items-center gap-1.5">
        {meta.page > 1 ? (
          <Link
            href={buildSearchHref(query, level, withUpdatedPage(pages, keyName, prevPage))}
            className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700"
          >
            ← Trước
          </Link>
        ) : (
          <span className="rounded-lg border border-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-300">
            ← Trước
          </span>
        )}

        {visiblePages[0] && visiblePages[0] > 1 ? (
          <>
            <Link
              href={buildSearchHref(query, level, withUpdatedPage(pages, keyName, 1))}
              className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:border-indigo-300 hover:text-indigo-700"
            >
              1
            </Link>
            {visiblePages[0] > 2 ? <span className="px-0.5 text-xs text-slate-400">…</span> : null}
          </>
        ) : null}

        {visiblePages.map((page) => (
          <Link
            key={page}
            href={buildSearchHref(query, level, withUpdatedPage(pages, keyName, page))}
            aria-current={page === meta.page ? "page" : undefined}
            className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
              page === meta.page
                ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                : "border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-700"
            }`}
          >
            {page}
          </Link>
        ))}

        {visiblePages[visiblePages.length - 1] &&
        visiblePages[visiblePages.length - 1] < meta.totalPages ? (
          <>
            {visiblePages[visiblePages.length - 1] < meta.totalPages - 1 ? (
              <span className="px-0.5 text-xs text-slate-400">…</span>
            ) : null}
            <Link
              href={buildSearchHref(query, level, withUpdatedPage(pages, keyName, meta.totalPages))}
              className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:border-indigo-300 hover:text-indigo-700"
            >
              {meta.totalPages}
            </Link>
          </>
        ) : null}

        {meta.page < meta.totalPages ? (
          <Link
            href={buildSearchHref(query, level, withUpdatedPage(pages, keyName, nextPage))}
            className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700"
          >
            Sau →
          </Link>
        ) : (
          <span className="rounded-lg border border-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-300">
            Sau →
          </span>
        )}
      </nav>
    </div>
  );
}

export default async function GlobalSearchPage(props: { searchParams: SearchParams }) {
  const user = await requireUser();
  const searchParams = await props.searchParams;

  const rawQuery = pickSingle(searchParams.q).trim();
  const levelRaw = pickSingle(searchParams.level).trim();
  const requestedPages: SearchPageState = {
    kanji: parsePositiveInt(pickSingle(searchParams.kpage), 1),
    vocab: parsePositiveInt(pickSingle(searchParams.vpage), 1),
    admin: parsePositiveInt(pickSingle(searchParams.apage), 1),
    grammar: parsePositiveInt(pickSingle(searchParams.gpage), 1),
  };
  const selectedLevel =
    levelRaw && levelRaw.toUpperCase() !== "ALL" ? normalizeJlptLevel(levelRaw) : null;
  const queryComparable = toComparableText(rawQuery);
  const queryTokens = tokenizeQuery(rawQuery);

  const [personalState, kanjiRowsRaw, vocabRowsRaw, adminLibrary, grammarDataset] = await Promise.all([
    loadUserPersonalState(user.id),
    rawQuery
      ? prisma.kanji.findMany({
          where: selectedLevel ? { jlptLevel: selectedLevel } : undefined,
          select: {
            id: true,
            character: true,
            meaning: true,
            onReading: true,
            kunReading: true,
            jlptLevel: true,
            strokeCount: true,
            exampleWord: true,
            exampleMeaning: true,
          },
        })
      : Promise.resolve([]),
    rawQuery
      ? prisma.vocab.findMany({
          where: selectedLevel ? { jlptLevel: selectedLevel } : undefined,
          select: {
            id: true,
            word: true,
            reading: true,
            meaning: true,
            jlptLevel: true,
            partOfSpeech: true,
          },
        })
      : Promise.resolve([]),
    loadAdminVocabLibrary(),
    loadGrammarDataset(),
  ]);

  const bookmarkKeySet = new Set(personalState.bookmarks.map((item) => `${item.type}:${item.refId}`));

  const kanjiRowsAll: KanjiResult[] = rawQuery
    ? kanjiRowsRaw
        .map((row) => {
          const score = scoreByFields(queryComparable, queryTokens, [
            row.character,
            row.meaning,
            row.onReading,
            row.kunReading,
            row.exampleWord,
            row.exampleMeaning,
            row.jlptLevel,
          ]);
          return { ...row, score };
        })
        .filter((row) => row.score >= 0)
        .sort((a, b) => b.score - a.score || a.character.localeCompare(b.character, "ja"))
    : [];

  const vocabRowsAll: VocabResult[] = rawQuery
    ? vocabRowsRaw
        .map((row) => {
          const score = scoreByFields(queryComparable, queryTokens, [
            row.word,
            row.reading,
            row.meaning,
            row.partOfSpeech,
            row.jlptLevel,
          ]);
          return { ...row, score };
        })
        .filter((row) => row.score >= 0)
        .sort((a, b) => b.score - a.score || a.word.localeCompare(b.word, "ja"))
    : [];

  const adminVocabRowsAll: AdminVocabResult[] = rawQuery
    ? adminLibrary.lessons
        .filter((lesson) => (selectedLevel ? lesson.jlptLevel === selectedLevel : true))
        .flatMap((lesson) =>
          lesson.items.map((item) => {
            const score = scoreByFields(queryComparable, queryTokens, [
              item.word,
              item.reading,
              item.kanji,
              item.hanviet,
              item.meaning,
              item.partOfSpeech,
              lesson.title,
              lesson.jlptLevel,
            ]);
            return {
              lessonId: lesson.id,
              lessonTitle: lesson.title,
              level: lesson.jlptLevel,
              item: {
                id: item.id,
                word: item.word,
                reading: item.reading,
                kanji: item.kanji,
                hanviet: item.hanviet,
                meaning: item.meaning,
                partOfSpeech: item.partOfSpeech,
              },
              score,
            };
          })
        )
        .filter((row) => row.score >= 0)
        .sort((a, b) => b.score - a.score || a.item.word.localeCompare(b.item.word, "ja"))
    : [];

  const grammarRowsAll: GrammarResult[] = rawQuery
    ? grammarDataset.lessons
        .filter((lesson) => (selectedLevel ? lesson.level === selectedLevel : true))
        .flatMap((lesson) =>
          lesson.points.map((point) => {
            const score = scoreByFields(queryComparable, queryTokens, [
              point.title,
              point.meaning,
              point.content,
              ...point.usage,
              ...point.examples,
              ...point.notes,
              lesson.title,
              lesson.level,
            ]);
            return {
              lessonId: lesson.id,
              lessonTitle: lesson.title,
              level: lesson.level,
              point: {
                id: point.id,
                title: point.title,
                meaning: point.meaning,
                content: point.content,
                usage: point.usage,
                examples: point.examples,
                notes: point.notes,
              },
              score,
            };
          })
        )
        .filter((row) => row.score >= 0)
        .sort((a, b) => b.score - a.score || a.point.title.localeCompare(b.point.title, "ja"))
    : [];

  const kanjiPagination = paginateItems(kanjiRowsAll, requestedPages.kanji, PAGE_SIZE.kanji);
  const vocabPagination = paginateItems(vocabRowsAll, requestedPages.vocab, PAGE_SIZE.vocab);
  const adminPagination = paginateItems(adminVocabRowsAll, requestedPages.admin, PAGE_SIZE.admin);
  const grammarPagination = paginateItems(grammarRowsAll, requestedPages.grammar, PAGE_SIZE.grammar);

  const activePages: SearchPageState = {
    kanji: kanjiPagination.meta.page,
    vocab: vocabPagination.meta.page,
    admin: adminPagination.meta.page,
    grammar: grammarPagination.meta.page,
  };
  const currentSearchHref = buildSearchHref(rawQuery, selectedLevel, activePages);

  const kanjiRows = kanjiPagination.items;
  const vocabRows = vocabPagination.items;
  const adminVocabRows = adminPagination.items;
  const grammarRows = grammarPagination.items;

  const totalResults =
    kanjiPagination.meta.totalItems +
    vocabPagination.meta.totalItems +
    adminPagination.meta.totalItems +
    grammarPagination.meta.totalItems;

  const categoryCards = buildCategoryCards({
    kanji: kanjiPagination.meta.totalItems,
    vocab: vocabPagination.meta.totalItems,
    grammar: grammarPagination.meta.totalItems,
    admin: adminPagination.meta.totalItems,
  });

  return (
    <section className="mx-auto w-full max-w-[1480px] space-y-6">
      <article className="relative overflow-hidden rounded-[30px] border border-[#dce3ff] bg-[radial-gradient(circle_at_85%_22%,rgba(99,102,241,0.16),transparent_34%),linear-gradient(135deg,#ffffff_0%,#f8fbff_56%,#f1f7ff_100%)] p-6 shadow-[0_20px_48px_rgba(17,24,57,0.08)]">
        <div className="pointer-events-none absolute right-8 top-4 text-[92px] leading-none text-indigo-100">⌕</div>
        <div className="relative">
          <h1 className="text-4xl font-black tracking-tight text-slate-900">Tìm kiếm toàn cục</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Tìm nhanh Kanji, Từ vựng, Ngữ pháp và dữ liệu Admin. Kết quả được ưu tiên theo độ liên quan, không bắt buộc gõ đúng tuyệt đối.
          </p>

          <form className="mt-5 flex flex-wrap items-center gap-2">
            <label className="group relative min-w-[300px] flex-1">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">⌕</span>
              <input
                type="search"
                name="q"
                defaultValue={rawQuery}
                className="h-13 w-full rounded-2xl border border-[#bfd0ff] bg-white/95 pl-11 pr-11 text-[15px] font-semibold text-slate-800 outline-none transition focus:border-[#6378ff] focus:ring-4 focus:ring-[#6378ff22]"
                placeholder="Ví dụ: 学校, べんきょう, benkyou, mẹ mình, N1 は N2 です"
              />
              {rawQuery ? (
                <Link
                  href={buildSearchHref("", selectedLevel)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full px-2 py-1 text-sm text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                >
                  ×
                </Link>
              ) : null}
            </label>

            <select
              name="level"
              defaultValue={selectedLevel ?? "ALL"}
              className="h-13 rounded-2xl border border-[#d6ddf8] bg-white px-3 text-sm font-semibold text-slate-700 outline-none"
            >
              <option value="ALL">Tất cả cấp độ</option>
              {JLPT_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>

            <button
              type="submit"
              className="h-13 rounded-2xl bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-500 px-6 text-sm font-black uppercase tracking-[0.12em] text-white shadow-[0_16px_30px_rgba(79,102,255,0.34)] transition hover:-translate-y-0.5 max-sm:w-full"
            >
              Tìm kiếm
            </button>
          </form>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <span className="font-bold uppercase tracking-[0.12em] text-slate-500">Tìm nhanh:</span>
            {QUICK_QUERIES.map((entry) => (
              <Link
                key={entry}
                href={buildSearchHref(entry, selectedLevel)}
                className="rounded-full border border-[#d5defc] bg-white/90 px-3 py-1.5 font-semibold text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700"
              >
                {entry}
              </Link>
            ))}
          </div>
        </div>
      </article>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {categoryCards.map((card) => (
          <a key={card.id} href={`#${card.id}`} className={`rounded-2xl border p-4 shadow-[0_12px_24px_rgba(17,24,57,0.06)] transition hover:-translate-y-0.5 ${card.tone}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-xl font-black text-slate-900">{card.title}</h2>
                <p className="mt-1 text-sm text-slate-600">{card.subtitle}</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${card.badgeTone}`}>
                {card.count} kết quả
              </span>
            </div>
          </a>
        ))}
      </section>

      {!rawQuery ? (
        <article className="rounded-2xl border border-[#e3e7f6] bg-white/85 p-5 text-sm text-slate-600 shadow-[0_12px_26px_rgba(17,24,57,0.05)]">
          Hỗ trợ tìm theo: Kanji, Hiragana/Katakana, Romaji, nghĩa tiếng Việt (có hoặc không dấu), JLPT và mẫu ngữ pháp.
        </article>
      ) : null}

      {rawQuery && totalResults === 0 ? (
        <article className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
          Không tìm thấy kết quả cho <strong>{rawQuery}</strong>. Thử gõ ngắn hơn, bỏ dấu tiếng Việt, hoặc đổi cấp độ JLPT.
        </article>
      ) : null}

      {rawQuery && totalResults > 0 ? (
        <article className="rounded-2xl border border-[#dbe3ff] bg-white/90 p-4 text-sm text-slate-600">
          Tìm thấy <strong>{totalResults}</strong> kết quả cho <strong>{rawQuery}</strong>
          {selectedLevel ? <span> trong cấp <strong>{selectedLevel}</strong></span> : null}. Thuật toán ưu tiên: exact match → prefix → contains → fuzzy gần đúng.
        </article>
      ) : null}

      {rawQuery ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <section id="kanji-results" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_14px_30px_rgba(17,24,57,0.06)]">
            <h3 className="text-xl font-black text-slate-900">Kanji ({kanjiPagination.meta.totalItems})</h3>
            <div className="mt-3 space-y-2">
              {kanjiPagination.meta.totalItems === 0 ? (
                <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-500">Không có kết quả.</p>
              ) : (
                kanjiRows.map((kanji) => {
                  const refId = kanji.character;
                  const bookmarked = bookmarkKeySet.has(`kanji:${refId}`);
                  return (
                    <article key={kanji.id} className="rounded-xl border border-slate-200 bg-slate-50/85 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          href={`/kanji?q=${encodeURIComponent(kanji.character)}&selected=${encodeURIComponent(kanji.character)}`}
                          className="text-lg font-black text-slate-900"
                        >
                          {kanji.character} - {kanji.meaning}
                        </Link>
                        <form action={toggleBookmarkAction}>
                          <input type="hidden" name="type" value="kanji" />
                          <input type="hidden" name="refId" value={refId} />
                          <input type="hidden" name="title" value={`${kanji.character} - ${kanji.meaning}`} />
                          <input type="hidden" name="subtitle" value={`${kanji.jlptLevel} - ${kanji.strokeCount} nét`} />
                          <input type="hidden" name="returnTo" value={currentSearchHref} />
                          <button type="submit" className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
                            {bookmarked ? "Bỏ bookmark" : "Bookmark"}
                          </button>
                        </form>
                      </div>
                      <p className="mt-1 text-sm text-slate-600">On: {kanji.onReading} | Kun: {kanji.kunReading}</p>
                    </article>
                  );
                })
              )}
            </div>
            {renderPaginationControls({
              query: rawQuery,
              level: selectedLevel,
              pages: activePages,
              keyName: "kanji",
              meta: kanjiPagination.meta,
            })}
          </section>

          <section id="vocab-results" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_14px_30px_rgba(17,24,57,0.06)]">
            <h3 className="text-xl font-black text-slate-900">Từ vựng hệ thống ({vocabPagination.meta.totalItems})</h3>
            <div className="mt-3 space-y-2">
              {vocabPagination.meta.totalItems === 0 ? (
                <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-500">Không có kết quả.</p>
              ) : (
                vocabRows.map((vocab) => {
                  const refId = vocab.id;
                  const bookmarked = bookmarkKeySet.has(`vocab:${refId}`);
                  return (
                    <article key={vocab.id} className="rounded-xl border border-slate-200 bg-slate-50/85 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-base font-black text-slate-900">
                          {vocab.word} {vocab.reading ? <span className="text-slate-500">({vocab.reading})</span> : null}
                        </p>
                        <form action={toggleBookmarkAction}>
                          <input type="hidden" name="type" value="vocab" />
                          <input type="hidden" name="refId" value={refId} />
                          <input type="hidden" name="title" value={`${vocab.word} (${vocab.reading})`} />
                          <input type="hidden" name="subtitle" value={vocab.meaning} />
                          <input type="hidden" name="returnTo" value={currentSearchHref} />
                          <button type="submit" className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
                            {bookmarked ? "Bỏ bookmark" : "Bookmark"}
                          </button>
                        </form>
                      </div>
                      <p className="mt-1 text-sm text-slate-700">{vocab.meaning}</p>
                      <p className="mt-1 text-xs text-slate-500">{vocab.jlptLevel}{vocab.partOfSpeech ? ` | ${vocab.partOfSpeech}` : ""}</p>
                    </article>
                  );
                })
              )}
            </div>
            {renderPaginationControls({
              query: rawQuery,
              level: selectedLevel,
              pages: activePages,
              keyName: "vocab",
              meta: vocabPagination.meta,
            })}
          </section>

          <section id="admin-vocab-results" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_14px_30px_rgba(17,24,57,0.06)]">
            <h3 className="text-xl font-black text-slate-900">Từ vựng Admin ({adminPagination.meta.totalItems})</h3>
            <div className="mt-3 space-y-2">
              {adminPagination.meta.totalItems === 0 ? (
                <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-500">Không có kết quả.</p>
              ) : (
                adminVocabRows.map((row) => (
                  <Link
                    key={`${row.lessonId}-${row.item.id}`}
                    href={`/vocab/group/${row.lessonId}?level=${row.level}`}
                    className="block rounded-xl border border-slate-200 bg-slate-50/85 p-3 transition hover:bg-white"
                  >
                    <p className="text-base font-black text-slate-900">
                      {row.item.kanji || row.item.word}
                      {row.item.reading ? <span className="ml-2 text-slate-500">({row.item.reading})</span> : null}
                    </p>
                    <p className="mt-1 text-sm text-slate-700">{row.item.meaning}</p>
                    <p className="mt-1 text-xs text-slate-500">{row.level} | {row.lessonTitle}</p>
                  </Link>
                ))
              )}
            </div>
            {renderPaginationControls({
              query: rawQuery,
              level: selectedLevel,
              pages: activePages,
              keyName: "admin",
              meta: adminPagination.meta,
            })}
          </section>

          <section id="grammar-results" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_14px_30px_rgba(17,24,57,0.06)]">
            <h3 className="text-xl font-black text-slate-900">Ngữ pháp ({grammarPagination.meta.totalItems})</h3>
            <div className="mt-3 space-y-2">
              {grammarPagination.meta.totalItems === 0 ? (
                <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-500">Không có kết quả.</p>
              ) : (
                grammarRows.map((row) => {
                  const refId = row.point.id;
                  const bookmarked = bookmarkKeySet.has(`grammar:${refId}`);
                  return (
                    <article key={row.point.id} className="rounded-xl border border-slate-200 bg-slate-50/85 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          href={`/grammar?level=${row.level}&lesson=${row.lessonId}&point=${row.point.id}`}
                          className="text-base font-black text-slate-900"
                        >
                          {row.point.title}
                        </Link>
                        <form action={toggleBookmarkAction}>
                          <input type="hidden" name="type" value="grammar" />
                          <input type="hidden" name="refId" value={refId} />
                          <input type="hidden" name="title" value={row.point.title} />
                          <input type="hidden" name="subtitle" value={row.point.meaning} />
                          <input type="hidden" name="returnTo" value={currentSearchHref} />
                          <button type="submit" className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
                            {bookmarked ? "Bỏ bookmark" : "Bookmark"}
                          </button>
                        </form>
                      </div>
                      {row.point.meaning ? <p className="mt-1 text-sm text-slate-700">{row.point.meaning}</p> : null}
                      <p className="mt-1 text-xs text-slate-500">{row.level} | {row.lessonTitle}</p>
                    </article>
                  );
                })
              )}
            </div>
            {renderPaginationControls({
              query: rawQuery,
              level: selectedLevel,
              pages: activePages,
              keyName: "grammar",
              meta: grammarPagination.meta,
            })}
          </section>
        </div>
      ) : null}
    </section>
  );
}
