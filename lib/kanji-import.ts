type ParsedKanjiInput = {
  id: string;
  character: string;
  meaning: string;
  onReading: string;
  kunReading: string;
  strokeCount: number;
  jlptLevel: string;
  order: number | null;
  category: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  exampleWord: string;
  exampleMeaning: string;
  relatedWords: ParsedKanjiLinkedWord[];
  relatedWordsProvided: boolean;
  metadataProvided: boolean;
};

type ParsedKanjiLinkedWord = {
  id: string;
  word: string;
  reading: string;
  kanji: string;
  hanviet: string;
  meaning: string;
  type: string;
  jlptLevel: string;
  exampleSentence: string;
  exampleMeaning: string;
  note: string;
  sourceLabel: string;
};

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

function joinTextArray(values: string[]): string {
  return values
    .map((item) => item.trim())
    .filter(Boolean)
    .join(", ");
}

function pickStringOrArray(source: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const raw = source[key];
    if (typeof raw === "string") {
      const value = normalizeText(raw);
      if (value) {
        return value;
      }
      continue;
    }
    if (Array.isArray(raw)) {
      const values = raw
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean);
      if (values.length > 0) {
        return joinTextArray(values);
      }
    }
  }
  return "";
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[;,|]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function parseNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(1, Math.floor(value));
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.max(1, Math.floor(parsed));
    }
  }
  return 1;
}

function parseOptionalOrder(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = Math.floor(value);
    return parsed >= 1 ? parsed : null;
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      const rounded = Math.floor(parsed);
      return rounded >= 1 ? rounded : null;
    }
  }
  return null;
}

function resolveDate(value: unknown, fallback: string): string {
  const text = normalizeText(value);
  return text || fallback;
}

function normalizeJlpt(value: unknown): string {
  const normalized = normalizeText(value).toUpperCase();
  if (normalized === "N1") {
    return "N1";
  }
  if (normalized === "N2") {
    return "N2";
  }
  if (normalized === "N3") {
    return "N3";
  }
  if (normalized === "N4") {
    return "N4";
  }
  return "N5";
}

function resolveRelatedJlptLevel(rawLevel: unknown, fallbackLevel?: string): string {
  const raw = normalizeText(rawLevel);
  if (raw) {
    return normalizeJlpt(raw);
  }
  const fallback = normalizeText(fallbackLevel);
  if (fallback) {
    return normalizeJlpt(fallback);
  }
  return "";
}

function normalizeRelatedWordObject(
  source: Record<string, unknown>,
  fallbackJlptLevel?: string
): ParsedKanjiLinkedWord | null {
  const word = pickString(source, ["word", "surface", "text", "vocab"]);
  const kanji = pickString(source, ["kanji", "character", "wordKanji"]);
  const inferredKanji = /[\u4e00-\u9fff]/.test(word) ? word : "";
  const resolvedKanji = kanji || inferredKanji;
  const meaning = pickString(source, ["meaning", "nghia", "translation", "vi"]);
  if (!word && !resolvedKanji) {
    return null;
  }
  if (!meaning) {
    return null;
  }

  return {
    id: pickString(source, ["id"]) || crypto.randomUUID(),
    word: word || resolvedKanji,
    reading: pickString(source, ["reading", "kana", "hiragana"]),
    kanji: resolvedKanji,
    hanviet: pickString(source, ["hanviet", "hanViet", "sinoVietnamese"]),
    meaning,
    type: pickString(source, ["type", "partOfSpeech", "pos"]),
    jlptLevel: resolveRelatedJlptLevel(
      source.jlptLevel ?? source.level ?? source.jlpt,
      fallbackJlptLevel
    ),
    exampleSentence: pickString(source, ["exampleSentence", "sentence", "example"]),
    exampleMeaning: pickString(source, ["exampleMeaning", "exampleTranslation", "sentenceMeaning"]),
    note: pickString(source, ["note", "memo", "ghiChu"]),
    sourceLabel: pickString(source, ["sourceLabel", "source", "lesson", "group"]) || "Kanji JSON",
  };
}

function parseRelatedWordString(value: string, fallbackJlptLevel?: string): ParsedKanjiLinkedWord | null {
  const text = value.trim();
  if (!text) {
    return null;
  }

  if (text.startsWith("{") && text.endsWith("}")) {
    try {
      const parsed = JSON.parse(text) as unknown;
      if (parsed && typeof parsed === "object") {
        return normalizeRelatedWordObject(parsed as Record<string, unknown>, fallbackJlptLevel);
      }
    } catch {
      // Fall through to text parsing.
    }
  }

  const parts = text
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    const [
      first,
      second,
      third,
      fourth,
      fifth,
      sixth,
      seventh,
      eighth,
      ninth,
      tenth,
      eleventh,
    ] = parts;
    const hasMeaningOnly = parts.length === 2;
    return {
      id: crypto.randomUUID(),
      word: first,
      reading: hasMeaningOnly ? "" : second ?? "",
      kanji: hasMeaningOnly ? "" : third ?? "",
      hanviet: hasMeaningOnly ? "" : fourth ?? "",
      meaning: hasMeaningOnly ? second : fifth ?? "",
      type: hasMeaningOnly ? "" : seventh ?? "",
      jlptLevel: hasMeaningOnly
        ? resolveRelatedJlptLevel("", fallbackJlptLevel)
        : resolveRelatedJlptLevel(sixth, fallbackJlptLevel),
      exampleSentence: hasMeaningOnly ? "" : eighth ?? "",
      exampleMeaning: hasMeaningOnly ? "" : ninth ?? "",
      note: hasMeaningOnly ? "" : tenth ?? "",
      sourceLabel: hasMeaningOnly ? "Kanji JSON" : eleventh ?? "Kanji JSON",
    };
  }

  const simpleParts = text
    .split(/\s*-\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (simpleParts.length >= 2) {
    return {
      id: crypto.randomUUID(),
      word: simpleParts[0],
      reading: "",
      kanji: "",
      hanviet: "",
      meaning: simpleParts.slice(1).join(" - "),
      type: "",
      jlptLevel: resolveRelatedJlptLevel("", fallbackJlptLevel),
      exampleSentence: "",
      exampleMeaning: "",
      note: "",
      sourceLabel: "Kanji JSON",
    };
  }

  return null;
}

function parseRelatedWords(source: Record<string, unknown>, fallbackJlptLevel?: string): {
  provided: boolean;
  words: ParsedKanjiLinkedWord[];
} {
  const keys = [
    "relatedWords",
    "relatedVocab",
    "relatedVocabulary",
    "relatedVocabularies",
    "relatedVocabularyList",
    "vocab",
    "words",
    "kanjiWords",
    "studyWords",
    "kanjiVocab",
  ];
  const matchedKey = keys.find((key) => Object.prototype.hasOwnProperty.call(source, key));
  if (!matchedKey) {
    return {
      provided: false,
      words: [],
    };
  }

  const rawValue = source[matchedKey];
  const words: ParsedKanjiLinkedWord[] = [];

  const pushWord = (word: ParsedKanjiLinkedWord | null) => {
    if (!word) {
      return;
    }
    words.push(word);
  };

  if (Array.isArray(rawValue)) {
    for (const entry of rawValue) {
      if (typeof entry === "string") {
        pushWord(parseRelatedWordString(entry, fallbackJlptLevel));
        continue;
      }
      if (entry && typeof entry === "object") {
        pushWord(normalizeRelatedWordObject(entry as Record<string, unknown>, fallbackJlptLevel));
      }
    }
  } else if (typeof rawValue === "string") {
    const trimmed = rawValue.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (Array.isArray(parsed)) {
          for (const entry of parsed) {
            if (typeof entry === "string") {
              pushWord(parseRelatedWordString(entry, fallbackJlptLevel));
            } else if (entry && typeof entry === "object") {
              pushWord(normalizeRelatedWordObject(entry as Record<string, unknown>, fallbackJlptLevel));
            }
          }
        }
      } catch {
        // Fall through to plain text parsing.
      }
    }

    if (words.length === 0) {
      const lines = trimmed
        .split(/\r?\n|;/)
        .map((item) => item.trim())
        .filter(Boolean);
      for (const line of lines) {
        pushWord(parseRelatedWordString(line, fallbackJlptLevel));
      }
    }
  }

  const unique = new Map<string, ParsedKanjiLinkedWord>();
  for (const entry of words) {
    const key = `${entry.kanji || entry.word}|${entry.reading}|${entry.meaning}`;
    if (!unique.has(key)) {
      unique.set(key, entry);
    }
  }

  return {
    provided: true,
    words: Array.from(unique.values()),
  };
}

function rowFromObject(source: Record<string, unknown>): ParsedKanjiInput | null {
  const character = pickString(source, ["character", "kanji", "word", "chu", "text"]);
  const meaning = pickString(source, ["meaning", "nghia", "translation", "vi"]);
  if (!character || !meaning) {
    return null;
  }
  const jlptLevel = normalizeJlpt(source.jlptLevel ?? source.level ?? source.jlpt);
  const related = parseRelatedWords(source, jlptLevel);
  const nowIso = new Date().toISOString();
  const tags = parseStringArray(source.tags);
  const order = parseOptionalOrder(source.order ?? source.sequence ?? source.sortOrder);
  const id = pickString(source, ["id"]) || `kanji-${character}`;
  const createdAt = resolveDate(source.createdAt, nowIso);
  const updatedAt = resolveDate(source.updatedAt, createdAt);
  const exampleWordFromRelated = related.words[0]?.kanji || related.words[0]?.word || "";
  const exampleMeaningFromRelated = related.words[0]?.meaning || "";
  const hasExtraMetadata =
    Object.prototype.hasOwnProperty.call(source, "id") ||
    Object.prototype.hasOwnProperty.call(source, "order") ||
    Object.prototype.hasOwnProperty.call(source, "sequence") ||
    Object.prototype.hasOwnProperty.call(source, "sortOrder") ||
    Object.prototype.hasOwnProperty.call(source, "category") ||
    Object.prototype.hasOwnProperty.call(source, "tags") ||
    Object.prototype.hasOwnProperty.call(source, "createdAt") ||
    Object.prototype.hasOwnProperty.call(source, "updatedAt");

  return {
    id,
    character,
    meaning,
    onReading: pickStringOrArray(source, ["onReading", "on", "onyomi"]),
    kunReading: pickStringOrArray(source, ["kunReading", "kun", "kunyomi"]),
    strokeCount: parseNumber(source.strokeCount ?? source.strokes ?? source.net),
    jlptLevel,
    order,
    category: pickString(source, ["category", "group", "theme"]),
    tags,
    createdAt,
    updatedAt,
    exampleWord:
      pickString(source, ["exampleWord", "example", "tuViDu"]) || exampleWordFromRelated,
    exampleMeaning:
      pickString(source, ["exampleMeaning", "exampleNghia", "viDuNghia"]) ||
      exampleMeaningFromRelated,
    relatedWords: related.words,
    relatedWordsProvided: related.provided,
    metadataProvided: hasExtraMetadata || related.provided,
  };
}

function rowFromLine(line: string): ParsedKanjiInput | null {
  const parts = line
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);

  if (parts.length < 2) {
    return null;
  }

  const jlptLevel = normalizeJlpt(parts[5] ?? "N5");

  return {
    id: `kanji-${parts[0]}`,
    character: parts[0],
    meaning: parts[1],
    onReading: parts[2] ?? "",
    kunReading: parts[3] ?? "",
    strokeCount: parseNumber(parts[4] ?? 1),
    jlptLevel,
    order: null,
    category: "",
    tags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    exampleWord: parts[6] ?? "",
    exampleMeaning: parts[7] ?? "",
    relatedWords: (() => {
      const rawRelated = parts[8] ?? "";
      if (!rawRelated) {
        return [];
      }
      return rawRelated
        .split(";")
        .map((item) => parseRelatedWordString(item, jlptLevel))
        .filter((item): item is ParsedKanjiLinkedWord => !!item);
    })(),
    relatedWordsProvided: Boolean(parts[8]),
    metadataProvided: Boolean(parts[8]),
  };
}

function parseJsonAttempt(rawInput: string): unknown | null {
  const text = rawInput.trim();
  if (!text) {
    return null;
  }

  const candidates = new Set<string>();
  const pushCandidate = (candidate: string) => {
    const normalized = candidate.trim();
    if (!normalized) {
      return;
    }
    candidates.add(normalized);
    candidates.add(normalized.replace(/,\s*([}\]])/g, "$1"));
  };

  pushCandidate(text);

  const lastBraceIndex = text.lastIndexOf("}");
  if (lastBraceIndex >= 0) {
    pushCandidate(text.slice(0, lastBraceIndex + 1));
  }

  // Common copy/paste mistake: object payload with an extra trailing "]".
  if (text.startsWith("{") && text.endsWith("]") && lastBraceIndex >= 0) {
    pushCandidate(text.slice(0, lastBraceIndex + 1));
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as unknown;
    } catch {
      // Try next candidate.
    }
  }

  return null;
}

function extractTopLevelJsonObjects(rawInput: string): Record<string, unknown>[] {
  const text = rawInput.trim();
  if (!text) {
    return [];
  }

  const output: Record<string, unknown>[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escape) {
        escape = false;
      } else if (char === "\\") {
        escape = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") {
      if (depth === 0) {
        start = index;
      }
      depth += 1;
      continue;
    }

    if (char === "}") {
      if (depth <= 0) {
        continue;
      }
      depth -= 1;
      if (depth === 0 && start >= 0) {
        const chunk = text.slice(start, index + 1);
        try {
          const parsed = JSON.parse(chunk) as unknown;
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            output.push(parsed as Record<string, unknown>);
          }
        } catch {
          // Skip invalid chunk.
        }
        start = -1;
      }
    }
  }

  return output;
}

function parseJsonInput(rawInput: string): ParsedKanjiInput[] {
  const parsed = parseJsonAttempt(rawInput);
  if (!parsed) {
    const chunks = extractTopLevelJsonObjects(rawInput);
    if (chunks.length > 0) {
      return chunks
        .map((entry) => rowFromObject(entry))
        .filter((entry): entry is ParsedKanjiInput => !!entry);
    }
    return [];
  }

  if (Array.isArray(parsed)) {
    return parsed
      .map((entry) =>
        entry && typeof entry === "object"
          ? rowFromObject(entry as Record<string, unknown>)
          : null
      )
      .filter((entry): entry is ParsedKanjiInput => !!entry);
  }

  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    const list = obj.items ?? obj.kanji ?? obj.data;
    if (Array.isArray(list)) {
      return list
        .map((entry) =>
          entry && typeof entry === "object"
            ? rowFromObject(entry as Record<string, unknown>)
            : null
        )
        .filter((entry): entry is ParsedKanjiInput => !!entry);
    }

    const singleRow = rowFromObject(obj);
    if (singleRow) {
      return [singleRow];
    }
  }

  return [];
}

function parseJsonLinesInput(rawInput: string): ParsedKanjiInput[] {
  const lines = rawInput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("{") && line.includes("}"));

  const output: ParsedKanjiInput[] = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line.replace(/,+\s*$/, "")) as unknown;
      if (parsed && typeof parsed === "object") {
        const row = rowFromObject(parsed as Record<string, unknown>);
        if (row) {
          output.push(row);
        }
      }
    } catch {
      // Skip invalid line.
    }
  }
  return output;
}

function parseTextInput(rawInput: string): ParsedKanjiInput[] {
  return rawInput
    .split(/\r?\n/)
    .map((line) => rowFromLine(line))
    .filter((entry): entry is ParsedKanjiInput => !!entry);
}

function sanitizeRawInput(rawInput: string): string {
  const text = rawInput.trim();
  if (!text) {
    return "";
  }

  return text
    .replace(/^\s*```(?:json)?\s*$/gim, "")
    .replace(/^\s*```\s*$/gim, "")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .trim();
}

export function parseKanjiInput(rawInput: string): ParsedKanjiInput[] {
  const text = sanitizeRawInput(rawInput);
  if (!text) {
    return [];
  }

  try {
    const fromJson = parseJsonInput(text);
    if (fromJson.length > 0) {
      return fromJson;
    }
  } catch {
    // Fall through.
  }

  const fromJsonLines = parseJsonLinesInput(text);
  if (fromJsonLines.length > 0) {
    return fromJsonLines;
  }

  return parseTextInput(text);
}

export type ImportedKanjiRow = ParsedKanjiInput;
export type ImportedKanjiLinkedWord = ParsedKanjiLinkedWord;
