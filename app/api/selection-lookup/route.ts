import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { loadAdminVocabLibrary, JLPT_LEVELS, type JlptLevel } from "@/lib/admin-vocab-library";
import { loadAdminKanjiMetadata } from "@/lib/kanji-metadata";
import { buildJapaneseLookupTextCandidates, normalizeJapaneseLookupText } from "@/lib/japanese-lookup-text";
import { loadOpenJapaneseDictionary, searchOpenJapaneseDictionary } from "@/lib/open-japanese-dictionary";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LookupItem = {
  id: string;
  kind: "vocab" | "kanji" | "dictionary-word" | "dictionary-kanji";
  title: string;
  reading: string;
  meaning: string;
  meta: string[];
  source: string;
  rank: number;
};

type FileRelatedWord = {
  id: string;
  word: string;
  reading: string;
  kanji: string;
  hanviet: string;
  meaning: string;
  type: string;
  jlptLevel: string;
  sourceLabel: string;
};

type FileKanjiEntry = {
  id: string;
  character: string;
  relatedWords: FileRelatedWord[];
};

const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 12;
const ADMIN_KANJI_METADATA_FILE = path.join(process.cwd(), "data", "admin-kanji-metadata.json");
const JAPANESE_TEXT_PATTERN = /[\u3040-\u30ff\u3400-\u9fff]/u;
const KANJI_TEXT_PATTERN = /[\u3400-\u9fff々〆ヵヶ]/u;
const EDGE_PUNCTUATION_PATTERN =
  /^[\s、。！？!?「」『』（）()\[\]【】〈〉《》"'“”‘’…・:：;；,.，]+|[\s、。！？!?「」『』（）()\[\]【】〈〉《》"'“”‘’…・:：;；,.，]+$/gu;

const GODAN_NEGATIVE_ENDINGS: Array<[string, string]> = [
  ["わない", "う"],
  ["かない", "く"],
  ["がない", "ぐ"],
  ["さない", "す"],
  ["たない", "つ"],
  ["なない", "ぬ"],
  ["ばない", "ぶ"],
  ["まない", "む"],
  ["らない", "る"],
];

const MASU_STEM_ENDINGS: Array<[string, string]> = [
  ["い", "う"],
  ["き", "く"],
  ["ぎ", "ぐ"],
  ["し", "す"],
  ["ち", "つ"],
  ["に", "ぬ"],
  ["び", "ぶ"],
  ["み", "む"],
  ["り", "る"],
];
const TRAILING_PARTICLE_ENDINGS = [
  "から",
  "まで",
  "より",
  "など",
  "には",
  "では",
  "とは",
  "は",
  "が",
  "を",
  "に",
  "へ",
  "で",
  "と",
  "も",
  "の",
];

function parseLimit(value: string | null): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_LIMIT;
  }
  return Math.min(MAX_LIMIT, Math.max(1, parsed));
}

function normalizeQuery(value: string): string {
  return normalizeJapaneseLookupText(value).replace(EDGE_PUNCTUATION_PATTERN, "").trim();
}

function normalizeComparableText(value: string): string {
  return normalizeQuery(value).toLowerCase();
}

function uniquePush(values: string[], value: string): void {
  const normalized = normalizeQuery(value);
  if (!normalized || values.includes(normalized)) {
    return;
  }
  values.push(normalized);
}

function addMasuStemCandidates(values: string[], stem: string): void {
  if (!stem) {
    return;
  }

  uniquePush(values, `${stem}る`);

  for (const [stemEnding, dictionaryEnding] of MASU_STEM_ENDINGS) {
    if (stem.endsWith(stemEnding)) {
      uniquePush(values, `${stem.slice(0, -stemEnding.length)}${dictionaryEnding}`);
    }
  }
}

function buildLookupCandidates(query: string): string[] {
  const candidates: string[] = [];
  const normalized = normalizeQuery(query);
  uniquePush(candidates, normalized);

  if (!normalized) {
    return candidates;
  }

  for (const particleEnding of TRAILING_PARTICLE_ENDINGS) {
    if (normalized.length > particleEnding.length && normalized.endsWith(particleEnding)) {
      const withoutParticle = normalized.slice(0, -particleEnding.length);
      if (withoutParticle.length >= 2 || KANJI_TEXT_PATTERN.test(withoutParticle)) {
        uniquePush(candidates, withoutParticle);
      }
    }
  }

  if (normalized.endsWith("ない")) {
    const ichidanStem = normalized.slice(0, -"ない".length);
    uniquePush(candidates, `${ichidanStem}る`);

    for (const [negativeEnding, dictionaryEnding] of GODAN_NEGATIVE_ENDINGS) {
      if (normalized.endsWith(negativeEnding)) {
        uniquePush(candidates, `${normalized.slice(0, -negativeEnding.length)}${dictionaryEnding}`);
      }
    }
  }

  if (normalized.endsWith("なかった")) {
    const ichidanStem = normalized.slice(0, -"なかった".length);
    uniquePush(candidates, `${ichidanStem}る`);

    for (const [negativeEnding, dictionaryEnding] of GODAN_NEGATIVE_ENDINGS) {
      const pastNegativeEnding = negativeEnding.replace("ない", "なかった");
      if (normalized.endsWith(pastNegativeEnding)) {
        uniquePush(candidates, `${normalized.slice(0, -pastNegativeEnding.length)}${dictionaryEnding}`);
      }
    }
  }

  for (const suffix of ["ました", "ません", "ます", "たい"]) {
    if (normalized.endsWith(suffix)) {
      addMasuStemCandidates(candidates, normalized.slice(0, -suffix.length));
    }
  }

  return candidates.slice(0, 12);
}

function rankByFields(fields: string[], candidates: string[]): number | null {
  let bestRank: number | null = null;

  candidates.forEach((candidate, candidateIndex) => {
    const normalizedCandidate = normalizeComparableText(candidate);
    if (!normalizedCandidate) {
      return;
    }

    for (const field of fields) {
      const normalizedField = normalizeComparableText(field);
      if (!normalizedField) {
        continue;
      }

      let fieldRank: number | null = null;
      if (normalizedField === normalizedCandidate) {
        fieldRank = 0;
      } else if (normalizedField.startsWith(normalizedCandidate)) {
        fieldRank = 2;
      } else if (normalizedCandidate.length >= 2 && normalizedField.includes(normalizedCandidate)) {
        fieldRank = 4;
      }

      if (fieldRank === null) {
        continue;
      }

      const rank = candidateIndex * 10 + fieldRank;
      bestRank = bestRank === null ? rank : Math.min(bestRank, rank);
    }
  });

  return bestRank;
}

function levelRank(level: string): number {
  const normalized = level.toUpperCase() as JlptLevel;
  const index = JLPT_LEVELS.indexOf(normalized);
  return index >= 0 ? index : 99;
}

function cleanMeta(values: Array<string | undefined | null>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean)
    )
  );
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeFileRelatedWord(input: unknown): FileRelatedWord | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const raw = input as Record<string, unknown>;
  const word = cleanString(raw.word);
  const kanji = cleanString(raw.kanji);
  const reading = cleanString(raw.reading);
  const meaning = cleanString(raw.meaning);
  if ((!word && !kanji) || !meaning) {
    return null;
  }

  return {
    id: cleanString(raw.id) || `${word || kanji}:${reading}`,
    word: word || kanji,
    reading,
    kanji,
    hanviet: cleanString(raw.hanviet),
    meaning,
    type: cleanString(raw.type),
    jlptLevel: cleanString(raw.jlptLevel),
    sourceLabel: cleanString(raw.sourceLabel) || "Kanji JSON",
  };
}

function normalizeFileKanjiEntry(input: unknown): FileKanjiEntry | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const raw = input as Record<string, unknown>;
  const character = cleanString(raw.character);
  if (!character) {
    return null;
  }

  return {
    id: cleanString(raw.id) || character,
    character,
    relatedWords: Array.isArray(raw.relatedWords)
      ? raw.relatedWords
          .map((item) => normalizeFileRelatedWord(item))
          .filter((item): item is FileRelatedWord => !!item)
      : [],
  };
}

async function loadFileKanjiEntries(): Promise<FileKanjiEntry[]> {
  try {
    const raw = await readFile(ADMIN_KANJI_METADATA_FILE, "utf8");
    const parsed = JSON.parse(raw) as { entries?: unknown };
    if (!Array.isArray(parsed.entries)) {
      return [];
    }
    return parsed.entries
      .map((entry) => normalizeFileKanjiEntry(entry))
      .filter((entry): entry is FileKanjiEntry => !!entry);
  } catch {
    return [];
  }
}

function dedupeItems(items: LookupItem[]): LookupItem[] {
  const seen = new Set<string>();
  const output: LookupItem[] = [];

  for (const item of items) {
    const key = `${item.kind}:${item.title}:${item.reading}:${item.meaning}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(item);
  }

  return output;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawQuery = url.searchParams.get("q") ?? "";
  const queryInputs = buildJapaneseLookupTextCandidates(rawQuery)
    .map((candidate) => normalizeQuery(candidate))
    .filter((candidate) => candidate.length > 0 && candidate.length <= 40);
  const query = queryInputs[0] ?? normalizeQuery(rawQuery);
  const limit = parseLimit(url.searchParams.get("limit"));

  if (!query || !JAPANESE_TEXT_PATTERN.test(query) || query.length > 40) {
    return NextResponse.json({ query, candidates: [], items: [] });
  }

  const candidates = Array.from(new Set(queryInputs.flatMap((candidate) => buildLookupCandidates(candidate)))).slice(
    0,
    18
  );
  const [vocabRows, kanjiRows, adminLibrary, kanjiMetadata, fileKanjiEntries, openDictionary] = await Promise.all([
    prisma.vocab.findMany({
      select: {
        id: true,
        word: true,
        reading: true,
        meaning: true,
        jlptLevel: true,
        partOfSpeech: true,
      },
    }),
    prisma.kanji.findMany({
      select: {
        id: true,
        character: true,
        meaning: true,
        onReading: true,
        kunReading: true,
        jlptLevel: true,
        strokeCount: true,
      },
    }),
    loadAdminVocabLibrary(),
    loadAdminKanjiMetadata(),
    loadFileKanjiEntries(),
    loadOpenJapaneseDictionary(),
  ]);

  const items: LookupItem[] = [];

  for (const row of vocabRows) {
    const rank = rankByFields([row.word, row.reading], candidates);
    if (rank === null) {
      continue;
    }
    items.push({
      id: `db-vocab-${row.id}`,
      kind: "vocab",
      title: row.word,
      reading: row.reading,
      meaning: row.meaning,
      meta: cleanMeta([row.jlptLevel, row.partOfSpeech, "Từ vựng hệ thống"]),
      source: "Vocab",
      rank,
    });
  }

  for (const lesson of adminLibrary.lessons) {
    for (const item of lesson.items) {
      const rank = rankByFields([item.word, item.reading, item.kanji], candidates);
      if (rank === null) {
        continue;
      }
      items.push({
        id: `admin-vocab-${lesson.id}-${item.id}`,
        kind: "vocab",
        title: item.word || item.kanji,
        reading: item.reading,
        meaning: item.meaning,
        meta: cleanMeta([lesson.jlptLevel, item.partOfSpeech, item.hanviet, lesson.title]),
        source: "Kho vocab",
        rank: rank + levelRank(lesson.jlptLevel),
      });
    }
  }

  for (const entry of kanjiMetadata.entries) {
    for (const relatedWord of entry.relatedWords) {
      const rank = rankByFields([relatedWord.word, relatedWord.reading, relatedWord.kanji], candidates);
      if (rank === null) {
        continue;
      }
      items.push({
        id: `kanji-related-${entry.id}-${relatedWord.id}`,
        kind: "vocab",
        title: relatedWord.word || relatedWord.kanji,
        reading: relatedWord.reading,
        meaning: relatedWord.meaning,
        meta: cleanMeta([
          relatedWord.jlptLevel,
          relatedWord.type,
          relatedWord.hanviet,
          relatedWord.sourceLabel,
          `${entry.character} liên quan`,
        ]),
        source: "Từ liên quan kanji",
        rank: rank + levelRank(relatedWord.jlptLevel),
      });
    }
  }

  for (const entry of fileKanjiEntries) {
    for (const relatedWord of entry.relatedWords) {
      const rank = rankByFields([relatedWord.word, relatedWord.reading, relatedWord.kanji], candidates);
      if (rank === null) {
        continue;
      }
      items.push({
        id: `file-kanji-related-${entry.id}-${relatedWord.id}`,
        kind: "vocab",
        title: relatedWord.word || relatedWord.kanji,
        reading: relatedWord.reading,
        meaning: relatedWord.meaning,
        meta: cleanMeta([
          relatedWord.jlptLevel,
          relatedWord.type,
          relatedWord.hanviet,
          relatedWord.sourceLabel,
          `${entry.character} liên quan`,
        ]),
        source: "Từ liên quan kanji",
        rank: rank + levelRank(relatedWord.jlptLevel),
      });
    }
  }

  if (KANJI_TEXT_PATTERN.test(query)) {
    for (const row of kanjiRows) {
      const rank = rankByFields([row.character, row.onReading, row.kunReading], candidates);
      if (rank === null) {
        continue;
      }
      items.push({
        id: `db-kanji-${row.id}`,
        kind: "kanji",
        title: row.character,
        reading: cleanMeta([row.onReading, row.kunReading]).join(" / "),
        meaning: row.meaning,
        meta: cleanMeta([row.jlptLevel, `${row.strokeCount} nét`, "Kanji hệ thống"]),
        source: "Kanji",
        rank: rank + 1,
      });
    }
  }

  candidates.forEach((candidate, candidateIndex) => {
    const result = searchOpenJapaneseDictionary(openDictionary, candidate, {
      kind: candidate.length === 1 && KANJI_TEXT_PATTERN.test(candidate) ? "all" : "word",
      limit: 4,
    });

    for (const word of result.words) {
      items.push({
        id: `dict-word-${word.id}`,
        kind: "dictionary-word",
        title: word.word,
        reading: word.reading,
        meaning: word.meanings.slice(0, 3).join("; "),
        meta: cleanMeta([word.jlptLevel, word.partsOfSpeech.slice(0, 2).join(", "), word.common ? "common" : ""]),
        source: "JMdict",
        rank: 40 + candidateIndex * 10,
      });
    }

    for (const kanji of result.kanji) {
      items.push({
        id: `dict-kanji-${kanji.id}`,
        kind: "dictionary-kanji",
        title: kanji.character,
        reading: cleanMeta([
          kanji.onReadings.slice(0, 3).join(", "),
          kanji.kunReadings.slice(0, 3).join(", "),
        ]).join(" / "),
        meaning: kanji.meanings.slice(0, 4).join("; "),
        meta: cleanMeta([kanji.jlptLevel, kanji.strokeCount ? `${kanji.strokeCount} nét` : "", "KANJIDIC2"]),
        source: "KANJIDIC2",
        rank: 45 + candidateIndex * 10,
      });
    }
  });

  const sorted = dedupeItems(items)
    .sort((left, right) => left.rank - right.rank || left.title.localeCompare(right.title, "ja"))
    .slice(0, limit)
    .map(({ rank: _rank, ...item }) => item);

  return NextResponse.json(
    {
      query,
      candidates,
      items: sorted,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
