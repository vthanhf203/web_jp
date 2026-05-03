import { QuizOption } from "@prisma/client";

export type ImportedQuizRow = {
  level: string;
  category: string;
  prompt: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctOption: QuizOption;
  explanation: string;
  optionReadings: Partial<Record<QuizOption, string>>;
};

const OPTION_KEYS = [QuizOption.A, QuizOption.B, QuizOption.C, QuizOption.D] as const;

function normalizeText(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function normalizeLevel(value: unknown): string {
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

function normalizeQuizOption(value: unknown): QuizOption {
  const normalized = normalizeText(value).toUpperCase();
  if (normalized === "A") {
    return QuizOption.A;
  }
  if (normalized === "B") {
    return QuizOption.B;
  }
  if (normalized === "C") {
    return QuizOption.C;
  }
  if (normalized === "D") {
    return QuizOption.D;
  }
  return QuizOption.A;
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

function optionTextFromValue(value: unknown): string {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return pickString(value as Record<string, unknown>, [
      "text",
      "label",
      "value",
      "kanji",
      "word",
      "answer",
      "content",
    ]);
  }
  return normalizeText(value);
}

function optionReadingFromValue(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "";
  }
  return pickString(value as Record<string, unknown>, [
    "reading",
    "furigana",
    "kana",
    "yomi",
    "ruby",
  ]);
}

function optionReadingsFromObject(source: Record<string, unknown>): Partial<Record<QuizOption, string>> {
  const output: Partial<Record<QuizOption, string>> = {};
  const keyedSource = source.optionReadings ?? source.readings ?? source.furigana;

  if (keyedSource && typeof keyedSource === "object" && !Array.isArray(keyedSource)) {
    const keyed = keyedSource as Record<string, unknown>;
    const pairs: Array<[QuizOption, string[]]> = [
      [QuizOption.A, ["A", "a", "optionA", "option_a"]],
      [QuizOption.B, ["B", "b", "optionB", "option_b"]],
      [QuizOption.C, ["C", "c", "optionC", "option_c"]],
      [QuizOption.D, ["D", "d", "optionD", "option_d"]],
    ];
    for (const [option, keys] of pairs) {
      const reading = pickString(keyed, keys);
      if (reading) {
        output[option] = reading;
      }
    }
  }

  const directPairs: Array<[QuizOption, string[]]> = [
    [QuizOption.A, ["optionAReading", "readingA", "furiganaA", "aReading", "option_a_reading"]],
    [QuizOption.B, ["optionBReading", "readingB", "furiganaB", "bReading", "option_b_reading"]],
    [QuizOption.C, ["optionCReading", "readingC", "furiganaC", "cReading", "option_c_reading"]],
    [QuizOption.D, ["optionDReading", "readingD", "furiganaD", "dReading", "option_d_reading"]],
  ];
  for (const [option, keys] of directPairs) {
    const reading = pickString(source, keys);
    if (reading) {
      output[option] = reading;
    }
  }

  return output;
}

function optionsFromObject(source: Record<string, unknown>): {
  options: [string, string, string, string];
  readings: Partial<Record<QuizOption, string>>;
} {
  const optionArray = source.options;
  if (Array.isArray(optionArray) && optionArray.length >= 4) {
    const readings: Partial<Record<QuizOption, string>> = {};
    for (let index = 0; index < 4; index += 1) {
      const reading = optionReadingFromValue(optionArray[index]);
      if (reading) {
        readings[OPTION_KEYS[index]] = reading;
      }
    }
    return {
      options: [
        optionTextFromValue(optionArray[0]),
        optionTextFromValue(optionArray[1]),
        optionTextFromValue(optionArray[2]),
        optionTextFromValue(optionArray[3]),
      ],
      readings: {
        ...optionReadingsFromObject(source),
        ...readings,
      },
    };
  }

  return {
    options: [
      pickString(source, ["optionA", "a", "answerA", "option_a"]),
      pickString(source, ["optionB", "b", "answerB", "option_b"]),
      pickString(source, ["optionC", "c", "answerC", "option_c"]),
      pickString(source, ["optionD", "d", "answerD", "option_d"]),
    ],
    readings: optionReadingsFromObject(source),
  };
}

function rowFromObject(source: Record<string, unknown>): ImportedQuizRow | null {
  const prompt = pickString(source, ["prompt", "question", "cauHoi", "content"]);
  const category = pickString(source, ["category", "topic", "type"]) || "Tong hop";
  const { options, readings } = optionsFromObject(source);
  const [optionA, optionB, optionC, optionD] = options;
  const correctOption = normalizeQuizOption(
    source.correctOption ?? source.correct ?? source.answer ?? source.key
  );
  const explanation = pickString(source, ["explanation", "explain", "note", "reason"]);

  if (!prompt || !optionA || !optionB || !optionC || !optionD) {
    return null;
  }

  return {
    level: normalizeLevel(source.level ?? source.jlptLevel ?? source.jlpt),
    category,
    prompt,
    optionA,
    optionB,
    optionC,
    optionD,
    correctOption,
    explanation,
    optionReadings: readings,
  };
}

function parseLineByDelimiter(line: string): string[] {
  const delimiters = ["\t", "|", ";", ","];
  for (const delimiter of delimiters) {
    if (line.includes(delimiter)) {
      return line.split(delimiter).map((item) => item.trim());
    }
  }
  return [line.trim()];
}

function rowFromLine(line: string): ImportedQuizRow | null {
  const clean = line.trim();
  if (!clean) {
    return null;
  }

  const parts = parseLineByDelimiter(clean).filter(Boolean);
  if (parts.length < 8) {
    return null;
  }

  const [
    level,
    category,
    prompt,
    optionA,
    optionB,
    optionC,
    optionD,
    correctOption,
    ...rest
  ] = parts;

  if (!prompt || !optionA || !optionB || !optionC || !optionD) {
    return null;
  }

  return {
    level: normalizeLevel(level),
    category: category || "Tong hop",
    prompt,
    optionA,
    optionB,
    optionC,
    optionD,
    correctOption: normalizeQuizOption(correctOption),
    explanation: rest.join(" - "),
    optionReadings: {},
  };
}

function parseJsonInput(rawInput: string): ImportedQuizRow[] {
  const parsed = JSON.parse(rawInput) as unknown;

  if (Array.isArray(parsed)) {
    return parsed
      .map((entry) =>
        entry && typeof entry === "object"
          ? rowFromObject(entry as Record<string, unknown>)
          : null
      )
      .filter((entry): entry is ImportedQuizRow => !!entry);
  }

  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    const list = obj.items ?? obj.questions ?? obj.data;
    if (Array.isArray(list)) {
      return list
        .map((entry) =>
          entry && typeof entry === "object"
            ? rowFromObject(entry as Record<string, unknown>)
            : null
        )
        .filter((entry): entry is ImportedQuizRow => !!entry);
    }

    const single = rowFromObject(obj);
    if (single) {
      return [single];
    }
  }

  return [];
}

function parseJsonLinesInput(rawInput: string): ImportedQuizRow[] {
  const lines = rawInput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("{") && line.includes("}"));

  const output: ImportedQuizRow[] = [];
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
      // Skip invalid row.
    }
  }
  return output;
}

function parseTextInput(rawInput: string): ImportedQuizRow[] {
  return rawInput
    .split(/\r?\n/)
    .map((line) => rowFromLine(line))
    .filter((entry): entry is ImportedQuizRow => !!entry);
}

export function parseQuizInput(rawInput: string): ImportedQuizRow[] {
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
