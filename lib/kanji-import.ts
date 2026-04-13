type ParsedKanjiInput = {
  character: string;
  meaning: string;
  onReading: string;
  kunReading: string;
  strokeCount: number;
  jlptLevel: string;
  exampleWord: string;
  exampleMeaning: string;
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

function rowFromObject(source: Record<string, unknown>): ParsedKanjiInput | null {
  const character = pickString(source, ["character", "kanji", "word", "chu", "text"]);
  const meaning = pickString(source, ["meaning", "nghia", "translation", "vi"]);
  if (!character || !meaning) {
    return null;
  }

  return {
    character,
    meaning,
    onReading: pickString(source, ["onReading", "on", "onyomi"]),
    kunReading: pickString(source, ["kunReading", "kun", "kunyomi"]),
    strokeCount: parseNumber(source.strokeCount ?? source.strokes ?? source.net),
    jlptLevel: normalizeJlpt(source.jlptLevel ?? source.level ?? source.jlpt),
    exampleWord: pickString(source, ["exampleWord", "example", "tuViDu"]),
    exampleMeaning: pickString(source, ["exampleMeaning", "exampleNghia", "viDuNghia"]),
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

  return {
    character: parts[0],
    meaning: parts[1],
    onReading: parts[2] ?? "",
    kunReading: parts[3] ?? "",
    strokeCount: parseNumber(parts[4] ?? 1),
    jlptLevel: normalizeJlpt(parts[5] ?? "N5"),
    exampleWord: parts[6] ?? "",
    exampleMeaning: parts[7] ?? "",
  };
}

function parseJsonInput(rawInput: string): ParsedKanjiInput[] {
  const parsed = JSON.parse(rawInput) as unknown;

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

export function parseKanjiInput(rawInput: string): ParsedKanjiInput[] {
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
    // Fall through.
  }

  const fromJsonLines = parseJsonLinesInput(text);
  if (fromJsonLines.length > 0) {
    return fromJsonLines;
  }

  return parseTextInput(text);
}

export type ImportedKanjiRow = ParsedKanjiInput;
