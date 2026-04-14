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
};

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

function optionsFromObject(source: Record<string, unknown>): [string, string, string, string] {
  const optionArray = source.options;
  if (Array.isArray(optionArray) && optionArray.length >= 4) {
    return [
      normalizeText(optionArray[0]),
      normalizeText(optionArray[1]),
      normalizeText(optionArray[2]),
      normalizeText(optionArray[3]),
    ];
  }

  return [
    pickString(source, ["optionA", "a", "answerA", "option_a"]),
    pickString(source, ["optionB", "b", "answerB", "option_b"]),
    pickString(source, ["optionC", "c", "answerC", "option_c"]),
    pickString(source, ["optionD", "d", "answerD", "option_d"]),
  ];
}

function rowFromObject(source: Record<string, unknown>): ImportedQuizRow | null {
  const prompt = pickString(source, ["prompt", "question", "cauHoi", "content"]);
  const category = pickString(source, ["category", "topic", "type"]) || "Tong hop";
  const [optionA, optionB, optionC, optionD] = optionsFromObject(source);
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

