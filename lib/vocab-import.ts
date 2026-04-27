export type ImportedVocabRow = {
  word: string;
  reading: string;
  kanji: string;
  hanviet: string;
  partOfSpeech: string;
  meaning: string;
};

export type ImportedVocabLessonBundle = {
  lessons: Array<{
    key: string;
    title: string;
    jlptLevel?: string;
    rows: ImportedVocabRow[];
  }>;
  groups: string[];
};

import { formatVocabLabel } from "@/lib/vietnamese-labels";

function normalizeText(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function pickString(source: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = normalizeText(source[key]);
    if (value) {
      return value;
    }
  }
  return "";
}

function hasKanjiChars(value: string): boolean {
  return /[\u4e00-\u9fff]/.test(value);
}

function looksLikePartOfSpeech(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  const posKeywords = [
    "noun",
    "verb",
    "adjective",
    "adverb",
    "pronoun",
    "danh tu",
    "dong tu",
    "tinh tu",
    "pho tu",
    "tro tu",
    "lien tu",
    "cam than",
    "cum tu",
    "n",
    "v",
    "adj",
    "adv",
    "exp",
  ];

  return posKeywords.some((keyword) => normalized === keyword || normalized.includes(keyword));
}

function rowFromObject(source: Record<string, unknown>): ImportedVocabRow | null {
  const word = pickString(source, ["word", "japanese", "jp", "term", "text", "kana"]);
  const kanji = pickString(source, ["kanji", "surface", "hantu", "hanTu", "hanzi"]);
  const reading = pickString(source, ["reading", "hiragana", "yomi", "furigana"]);
  const hanviet = pickString(source, ["hanviet", "han_viet", "hanViet", "sinoVietnamese"]);
  const meaning = pickString(source, ["meaning", "translation", "vi", "vn", "nghia"]);
  const partOfSpeech = pickString(source, ["partOfSpeech", "type", "pos", "grammarType"]);

  const resolvedWord = word || kanji;
  if (!resolvedWord || !meaning) {
    return null;
  }

  const resolvedKanji = kanji || (hasKanjiChars(resolvedWord) ? resolvedWord : "");

  return {
    word: resolvedWord,
    reading: reading || resolvedWord,
    kanji: resolvedKanji,
    hanviet,
    partOfSpeech,
    meaning,
  };
}

function parseLineByDelimiter(line: string): string[] {
  const delimiters = ["\t", "|", ";", " - ", ","];
  for (const delimiter of delimiters) {
    if (line.includes(delimiter)) {
      return line
        .split(delimiter)
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }
  return [line.trim()];
}

function rowFromLine(line: string): ImportedVocabRow | null {
  const cleanLine = line.trim();
  if (!cleanLine) {
    return null;
  }

  const parts = parseLineByDelimiter(cleanLine);
  if (parts.length < 2) {
    return null;
  }

  if (parts.length === 2) {
    const word = parts[0];
    return {
      word,
      reading: word,
      kanji: hasKanjiChars(word) ? word : "",
      hanviet: "",
      partOfSpeech: "",
      meaning: parts[1],
    };
  }

  if (parts.length === 3) {
    const word = parts[0];
    return {
      word,
      reading: parts[1],
      kanji: hasKanjiChars(word) ? word : "",
      hanviet: "",
      partOfSpeech: "",
      meaning: parts[2],
    };
  }

  if (parts.length === 4) {
    const word = parts[0];
    const third = parts[2];
    return {
      word,
      reading: parts[1],
      kanji: hasKanjiChars(word) ? word : "",
      hanviet: looksLikePartOfSpeech(third) ? "" : third,
      partOfSpeech: looksLikePartOfSpeech(third) ? third : "",
      meaning: parts[3],
    };
  }

  if (parts.length === 5) {
    return {
      word: parts[0],
      reading: parts[1],
      kanji: parts[2],
      hanviet: parts[3],
      partOfSpeech: "",
      meaning: parts[4],
    };
  }

  return {
    word: parts[0],
    reading: parts[1],
    kanji: parts[2],
    hanviet: parts[3],
    partOfSpeech: parts[4],
    meaning: parts.slice(5).join(" - "),
  };
}

function parseJsonInput(rawInput: string): ImportedVocabRow[] {
  const parsed = JSON.parse(rawInput) as unknown;

  if (Array.isArray(parsed)) {
    return parsed
      .map((item) =>
        item && typeof item === "object"
          ? rowFromObject(item as Record<string, unknown>)
          : null
      )
      .filter((item): item is ImportedVocabRow => !!item);
  }

  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    const listCandidate = obj.items ?? obj.vocab ?? obj.words ?? obj.data;
    if (Array.isArray(listCandidate)) {
      return listCandidate
        .map((item) =>
          item && typeof item === "object"
            ? rowFromObject(item as Record<string, unknown>)
            : null
        )
        .filter((item): item is ImportedVocabRow => !!item);
    }
  }

  return [];
}

function normalizeBundleTitle(rawKey: string): string {
  const key = rawKey.trim();
  if (!key) {
    return "Lesson";
  }
  return formatVocabLabel(key);
}

function lessonRowsFromUnknown(input: unknown): ImportedVocabRow[] {
  if (Array.isArray(input)) {
    return input
      .map((item) =>
        item && typeof item === "object"
          ? rowFromObject(item as Record<string, unknown>)
          : null
      )
      .filter((item): item is ImportedVocabRow => !!item);
  }

  if (input && typeof input === "object") {
    const source = input as Record<string, unknown>;
    const listCandidate = source.items ?? source.vocab ?? source.words ?? source.data ?? [];
    if (Array.isArray(listCandidate)) {
      return listCandidate
        .map((item) =>
          item && typeof item === "object"
            ? rowFromObject(item as Record<string, unknown>)
            : null
        )
        .filter((item): item is ImportedVocabRow => !!item);
    }
  }

  return [];
}

function parseLessonTokens(rawLesson: unknown): string[] {
  if (typeof rawLesson !== "string") {
    return [];
  }

  return rawLesson
    .split(/[,\|;/]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function normalizeLessonKey(rawKey: string): string {
  return rawKey
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

export function parseVocabLessonBundleInput(rawInput: string): ImportedVocabLessonBundle {
  const text = rawInput.trim();
  if (!text) {
    return { lessons: [], groups: [] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return { lessons: [], groups: [] };
  }

  if (!parsed || typeof parsed !== "object") {
    return { lessons: [], groups: [] };
  }

  if (Array.isArray(parsed)) {
    const lessons: ImportedVocabLessonBundle["lessons"] = [];
    const groups: string[] = [];
    const lessonBuckets = new Map<
      string,
      { key: string; title: string; jlptLevel?: string; rows: ImportedVocabRow[] }
    >();

    for (let index = 0; index < parsed.length; index += 1) {
      const node = parsed[index];
      if (!node || typeof node !== "object") {
        continue;
      }

      const source = node as Record<string, unknown>;
      const rows = lessonRowsFromUnknown(source);
      if (rows.length === 0) {
        continue;
      }

      const groupKey =
        normalizeText(source.categoryKey) ||
        normalizeText(source.groupKey) ||
        normalizeText(source.key) ||
        normalizeText(source.id);
      const groupTitle =
        normalizeText(source.categoryName) ||
        normalizeText(source.title) ||
        normalizeText(source.lessonTitle) ||
        normalizeText(source.name);
      const fallbackKey = groupKey || groupTitle || `lesson_${index + 1}`;
      const bucketKey = normalizeLessonKey(fallbackKey);
      const title = normalizeBundleTitle(groupTitle || fallbackKey);
      const jlptLevel = normalizeText(source.jlptLevel) || normalizeText(source.level);

      if (groupKey) {
        groups.push(groupKey);
      }

      const existing = lessonBuckets.get(bucketKey);
      if (existing) {
        existing.rows.push(...rows.map((row) => ({ ...row })));
        if (!existing.jlptLevel && jlptLevel) {
          existing.jlptLevel = jlptLevel;
        }
        continue;
      }

      lessonBuckets.set(bucketKey, {
        key: bucketKey,
        title,
        jlptLevel: jlptLevel || undefined,
        rows: rows.map((row) => ({ ...row })),
      });
    }

    lessons.push(...Array.from(lessonBuckets.values()));
    return { lessons, groups };
  }

  const root = parsed as Record<string, unknown>;
  const groups = Array.isArray(root.groups)
    ? root.groups.filter(
        (item): item is string => typeof item === "string" && item.trim().length > 0
      )
    : [];

  const lessons: ImportedVocabLessonBundle["lessons"] = [];
  const lessonsNode = root.lessons;

  if (lessonsNode && typeof lessonsNode === "object" && !Array.isArray(lessonsNode)) {
    const lessonRecord = lessonsNode as Record<string, unknown>;
    for (const [lessonKey, lessonValue] of Object.entries(lessonRecord)) {
      const rows = lessonRowsFromUnknown(lessonValue);
      if (rows.length === 0) {
        continue;
      }

      let jlptLevel = "";
      if (lessonValue && typeof lessonValue === "object" && !Array.isArray(lessonValue)) {
        const valueObj = lessonValue as Record<string, unknown>;
        jlptLevel =
          normalizeText(valueObj.jlptLevel) ||
          normalizeText(valueObj.level) ||
          normalizeText(root.jlptLevel) ||
          normalizeText(root.level);
      } else {
        jlptLevel = normalizeText(root.jlptLevel) || normalizeText(root.level);
      }

      lessons.push({
        key: lessonKey,
        title: normalizeBundleTitle(lessonKey),
        jlptLevel: jlptLevel || undefined,
        rows,
      });
    }
  } else if (Array.isArray(lessonsNode)) {
    for (let index = 0; index < lessonsNode.length; index += 1) {
      const lessonNode = lessonsNode[index];
      if (!lessonNode || typeof lessonNode !== "object") {
        continue;
      }

      const lessonObj = lessonNode as Record<string, unknown>;
      const rows = lessonRowsFromUnknown(lessonObj);
      if (rows.length === 0) {
        continue;
      }

      const rawTitle =
        normalizeText(lessonObj.title) ||
        normalizeText(lessonObj.lessonTitle) ||
        normalizeText(lessonObj.name) ||
        normalizeText(lessonObj.id) ||
        `Lesson ${index + 1}`;

      const jlptLevel =
        normalizeText(lessonObj.jlptLevel) ||
        normalizeText(lessonObj.level) ||
        normalizeText(root.jlptLevel) ||
        normalizeText(root.level);

      lessons.push({
        key: `lesson_${index + 1}`,
        title: normalizeBundleTitle(rawTitle),
        jlptLevel: jlptLevel || undefined,
        rows,
      });
    }
  } else {
    // Support structure grouped by category:
    // { "xung_ho_chao_hoi": [ {..., lesson: "bai_1"} ], ... }
    const groupedEntries = Object.entries(root).filter(
      ([key, value]) => key !== "groups" && Array.isArray(value)
    );
    if (groupedEntries.length > 0) {
      const lessonBuckets = new Map<
        string,
        { key: string; title: string; jlptLevel?: string; rows: ImportedVocabRow[] }
      >();

      for (const [groupKey, groupValue] of groupedEntries) {
        const groupRows = Array.isArray(groupValue) ? groupValue : [];
        for (const entry of groupRows) {
          if (!entry || typeof entry !== "object") {
            continue;
          }

          const source = entry as Record<string, unknown>;
          const row = rowFromObject(source);
          if (!row) {
            continue;
          }

          const jlptLevel =
            normalizeText(source.jlptLevel) ||
            normalizeText(source.level) ||
            normalizeText(root.jlptLevel) ||
            normalizeText(root.level);

          const lessonTokens = parseLessonTokens(
            source.lesson ?? source.lessonId ?? source.bai ?? source.deck
          );
          const targetLessonTokens = lessonTokens.length > 0 ? lessonTokens : [groupKey];

          for (const token of targetLessonTokens) {
            const bucketKey = normalizeLessonKey(token);
            const existing = lessonBuckets.get(bucketKey);
            if (existing) {
              existing.rows.push({ ...row });
              if (!existing.jlptLevel && jlptLevel) {
                existing.jlptLevel = jlptLevel;
              }
              continue;
            }

            lessonBuckets.set(bucketKey, {
              key: bucketKey,
              title: normalizeBundleTitle(token),
              jlptLevel: jlptLevel || undefined,
              rows: [{ ...row }],
            });
          }
        }
      }

      lessons.push(...Array.from(lessonBuckets.values()));
    }
  }

  if (lessons.length === 0) {
    const directRows = lessonRowsFromUnknown(root);
    if (directRows.length > 0) {
      lessons.push({
        key: "lesson_1",
        title: "Lesson 1",
        jlptLevel: normalizeText(root.jlptLevel) || normalizeText(root.level) || undefined,
        rows: directRows,
      });
    }
  }

  return { lessons, groups };
}

function parseJsonLinesInput(rawInput: string): ImportedVocabRow[] {
  const objectLines = rawInput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("{") && line.includes("}"));

  if (objectLines.length === 0) {
    return [];
  }

  const rows: ImportedVocabRow[] = [];
  for (const line of objectLines) {
    const normalizedLine = line.replace(/,+\s*$/, "");
    try {
      const parsed = JSON.parse(normalizedLine) as unknown;
      if (parsed && typeof parsed === "object") {
        const row = rowFromObject(parsed as Record<string, unknown>);
        if (row) {
          rows.push(row);
        }
      }
    } catch {
      // Skip invalid line.
    }
  }

  return rows;
}

function parseTextInput(rawInput: string): ImportedVocabRow[] {
  return rawInput
    .split(/\r?\n/)
    .map((line) => rowFromLine(line))
    .filter((item): item is ImportedVocabRow => !!item);
}

export function parseVocabInput(rawInput: string): ImportedVocabRow[] {
  const text = rawInput.trim();
  if (!text) {
    return [];
  }

  try {
    const fromJson = parseJsonInput(text);
    if (fromJson.length > 0) {
      return fromJson;
    }
  } catch {
    // Fall back to json-lines parser.
  }

  const fromJsonLines = parseJsonLinesInput(text);
  if (fromJsonLines.length > 0) {
    return fromJsonLines;
  }

  return parseTextInput(text);
}
