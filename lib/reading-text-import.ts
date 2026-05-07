import type { ReadingTextItem } from "@/lib/reading-practice-store";

export type ImportedReadingText = Omit<ReadingTextItem, "id" | "createdAt" | "updatedAt"> & {
  id?: string;
};

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeLevel(value: unknown): string {
  const text = normalizeText(value).toUpperCase();
  if (["N1", "N2", "N3", "N4", "N5"].includes(text)) {
    return text;
  }
  const matched = text.match(/N[1-5]/g);
  if (matched && matched.length > 0) {
    return matched[0] ?? "N5";
  }
  return "N5";
}

function normalizeMinutes(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(normalizeText(value));
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 3;
  }
  return Math.min(60, Math.max(1, Math.round(numeric)));
}

function normalizeParagraphBlock(value: unknown): { paragraphs: string[]; paragraphTranslations: string[] } {
  if (Array.isArray(value)) {
    const paragraphs: string[] = [];
    const paragraphTranslations: string[] = [];
    for (const entry of value) {
      if (typeof entry === "string") {
        const row = normalizeText(entry);
        if (row) {
          paragraphs.push(row);
        }
        continue;
      }
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        continue;
      }
      const row = entry as Record<string, unknown>;
      const jp = pickString(row, ["jp", "ja", "text", "sentence", "paragraph", "content"]);
      const vi = pickString(row, ["vi", "vn", "translation", "meaning", "dich"]);
      if (jp) {
        paragraphs.push(jp);
      }
      if (vi) {
        paragraphTranslations.push(vi);
      }
    }
    return { paragraphs, paragraphTranslations };
  }

  const text = normalizeText(value);
  if (!text) {
    return { paragraphs: [], paragraphTranslations: [] };
  }
  return {
    paragraphs: text
      .split(/\n{2,}|\r?\n/)
      .map((entry) => entry.trim())
      .filter(Boolean),
    paragraphTranslations: [],
  };
}

function splitWordAndReading(input: string): { word: string; reading: string } {
  const clean = normalizeText(input);
  const matched = clean.match(/^(.+?)\s*[（(]([^（）()]+)[）)]$/);
  if (!matched) {
    return { word: clean, reading: "" };
  }
  return {
    word: normalizeText(matched[1]),
    reading: normalizeText(matched[2]),
  };
}

function pickNestedString(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "";
  }
  const obj = value as Record<string, unknown>;
  const nestedKeys = [
    "vi",
    "vn",
    "text",
    "value",
    "translation",
    "meaning",
    "dich",
    "dịch",
    "nghia",
    "nghĩa",
    "content",
  ];
  for (const key of nestedKeys) {
    const nested = normalizeText(obj[key]);
    if (nested) {
      return nested;
    }
  }
  return "";
}

function pickString(source: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const raw = source[key];
    const value = normalizeText(raw);
    if (value) {
      return value;
    }
    const nested = pickNestedString(raw);
    if (nested) {
      return nested;
    }
  }
  return "";
}

function vocabularyFromValue(value: unknown): ImportedReadingText["vocabulary"] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return null;
      }
      const raw = entry as Record<string, unknown>;
      const wordInput = pickString(raw, ["word", "term", "text", "kanji"]);
      const split = splitWordAndReading(wordInput);
      const readingValue = pickString(raw, ["reading", "kana", "furigana", "yomi"]) || split.reading;
      const meaning = pickString(raw, [
        "meaning",
        "vi",
        "vn",
        "translation",
        "translationVi",
        "translationVN",
        "dich",
        "dịch",
        "nghia",
        "nghĩa",
      ]);
      if (!split.word || !meaning) {
        return null;
      }
      return {
        word: split.word,
        reading: readingValue,
        meaning,
      };
    })
    .filter((entry): entry is ImportedReadingText["vocabulary"][number] => Boolean(entry));
}

function questionsFromValue(value: unknown): ImportedReadingText["questions"] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => {
      if (typeof entry === "string") {
        return { prompt: entry.trim(), answer: "" };
      }
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return null;
      }
      const raw = entry as Record<string, unknown>;
      const prompt = pickString(raw, ["prompt", "question", "q", "cauHoi", "câuHỏi"]);
      if (!prompt) {
        return null;
      }
      return {
        prompt,
        answer: pickString(raw, ["answer", "a", "explanation", "giaiThich", "giảiThích"]),
      };
    })
    .filter((entry): entry is ImportedReadingText["questions"][number] => Boolean(entry));
}

function rowFromObject(source: Record<string, unknown>): ImportedReadingText | null {
  const title = pickString(source, ["title", "name", "heading"]);
  const normalizedParagraphs = normalizeParagraphBlock(
    source.paragraphs ??
      source.content ??
      source.text ??
      source.body ??
      source.passage ??
      source.reading
  );
  const paragraphs = normalizedParagraphs.paragraphs;
  if (!title || paragraphs.length === 0) {
    return null;
  }

  return {
    id: pickString(source, ["id"]),
    title,
    jlptLevel: normalizeLevel(source.jlptLevel ?? source.level ?? source.jlpt),
    topic: pickString(source, ["topic", "category", "theme", "chuDe", "chủĐề"]) || "Tổng hợp",
    difficulty: pickString(source, ["difficulty", "length", "doKho", "độKhó"]) || "Ngắn",
    estimatedMinutes: normalizeMinutes(source.estimatedMinutes ?? source.minutes ?? source.duration),
    paragraphs,
    translation:
      pickString(source, [
        "translation",
        "translations",
        "translated",
        "meaning",
        "vi",
        "vn",
        "translationVi",
        "translationVN",
        "dich",
        "dịch",
        "banDich",
        "bảnDịch",
      ]) || normalizedParagraphs.paragraphTranslations.join("\n\n"),
    vocabulary: vocabularyFromValue(source.vocabulary ?? source.words ?? source.vocab),
    questions: questionsFromValue(source.questions ?? source.quiz),
  };
}

function parseJsonInput(rawInput: string): ImportedReadingText[] {
  const parsed = JSON.parse(rawInput) as unknown;
  if (Array.isArray(parsed)) {
    return parsed
      .map((entry) =>
        entry && typeof entry === "object" && !Array.isArray(entry)
          ? rowFromObject(entry as Record<string, unknown>)
          : null
      )
      .filter((entry): entry is ImportedReadingText => Boolean(entry));
  }

  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>;
    const list = obj.items ?? obj.texts ?? obj.readings ?? obj.data;
    if (Array.isArray(list)) {
      return list
        .map((entry) =>
          entry && typeof entry === "object" && !Array.isArray(entry)
            ? rowFromObject(entry as Record<string, unknown>)
            : null
        )
        .filter((entry): entry is ImportedReadingText => Boolean(entry));
    }

    const single = rowFromObject(obj);
    return single ? [single] : [];
  }

  return [];
}

function parseJsonLinesInput(rawInput: string): ImportedReadingText[] {
  const output: ImportedReadingText[] = [];
  for (const line of rawInput.split(/\r?\n/)) {
    const clean = line.trim().replace(/,+$/, "");
    if (!clean.startsWith("{")) {
      continue;
    }
    try {
      const parsed = JSON.parse(clean) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const row = rowFromObject(parsed as Record<string, unknown>);
        if (row) {
          output.push(row);
        }
      }
    } catch {
      // Ignore malformed JSON-lines rows.
    }
  }
  return output;
}

export function parseReadingTextInput(rawInput: string): ImportedReadingText[] {
  const text = rawInput.trim();
  if (!text) {
    return [];
  }

  try {
    const rows = parseJsonInput(text);
    if (rows.length > 0) {
      return rows;
    }
  } catch {
    // Fall through to JSON-lines.
  }

  return parseJsonLinesInput(text);
}
