export type ImportedVocabRow = {
  word: string;
  reading: string;
  kanji: string;
  hanviet: string;
  partOfSpeech: string;
  meaning: string;
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
  const word = pickString(source, [
    "word",
    "japanese",
    "jp",
    "term",
    "text",
    "kana",
  ]);
  const kanji = pickString(source, [
    "kanji",
    "surface",
    "hantu",
    "hanTu",
    "hanzi",
  ]);
  const reading = pickString(source, ["reading", "hiragana", "yomi", "furigana"]);
  const hanviet = pickString(source, ["hanviet", "han_viet", "hanViet", "sinoVietnamese"]);
  const meaning = pickString(source, ["meaning", "translation", "vi", "vn", "nghia"]);
  const partOfSpeech = pickString(source, [
    "partOfSpeech",
    "type",
    "pos",
    "grammarType",
  ]);

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
