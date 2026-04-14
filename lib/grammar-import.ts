import type { GrammarPoint } from "@/lib/grammar-dataset";

export type ImportedGrammarPoint = Omit<GrammarPoint, "id" | "order">;

function normalizeText(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function normalizeLooseText(value: unknown): string {
  const text = normalizeText(value);
  if (text) {
    return text;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const line = normalizeText(entry);
      if (line) {
        return line;
      }
    }
  }
  return "";
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeText(entry))
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/\r?\n|\|/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
}

function pickString(source: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = normalizeLooseText(source[key]);
    if (value) {
      return value;
    }
  }
  return "";
}

function normalizeExample(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (!value || typeof value !== "object") {
    return "";
  }

  const source = value as Record<string, unknown>;
  const jp = pickString(source, ["jp", "japanese", "ja", "sentence"]);
  const kana = pickString(source, ["kana", "reading", "furigana"]);
  const vi = pickString(source, ["vi", "meaning", "translation"]);

  if (jp && kana) {
    const hasKanaInSentence = jp.includes(`(${kana})`) || jp.includes(`（${kana}）`);
    const jpWithKana = hasKanaInSentence ? jp : `${jp}（${kana}）`;
    if (vi) {
      return `${jpWithKana} - ${vi}`;
    }
    return jpWithKana;
  }

  if (jp && vi) {
    return `${jp} - ${vi}`;
  }
  if (jp) {
    return jp;
  }
  return vi;
}

function normalizeExamples(value: unknown): string[] {
  if (!Array.isArray(value)) {
    if (typeof value === "string") {
      return value
        .split(/\r?\n|\|/)
        .map((entry) => entry.trim())
        .filter(Boolean);
    }
    return [];
  }

  return value.map((entry) => normalizeExample(entry)).filter(Boolean);
}

function pointFromObject(source: Record<string, unknown>): ImportedGrammarPoint | null {
  const title = pickString(source, ["title", "pattern", "mau", "structure"]);
  if (!title) {
    return null;
  }

  const meaning = pickString(source, [
    "meaning",
    "meaning_vi",
    "nghia",
    "translation",
    "vi",
  ]);
  const simpleMeaning = pickString(source, ["meaning_simple", "simple", "explain"]);
  const structureLines = normalizeStringArray(source.structure ?? source.structures);
  const usageLines = normalizeStringArray(source.usage ?? source.use ?? source.howToUse);
  const noteLines = normalizeStringArray(source.notes ?? source.note ?? source.memo);
  const mergedUsage: string[] = [];
  if (simpleMeaning && simpleMeaning !== meaning) {
    mergedUsage.push(`Giai thich: ${simpleMeaning}`);
  }
  mergedUsage.push(...structureLines.map((line) => `Cau truc: ${line}`));
  mergedUsage.push(...usageLines);

  return {
    title,
    meaning,
    usage: mergedUsage,
    examples: normalizeExamples(source.examples ?? source.example ?? source.sample),
    notes: noteLines,
    content: pickString(source, ["content", "raw", "text", "meaning_simple"]),
    image: pickString(source, ["image", "imageUrl", "img"]),
  };
}

function pointFromLine(line: string): ImportedGrammarPoint | null {
  const text = line.trim();
  if (!text) {
    return null;
  }

  const parts = text
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);

  if (parts.length < 2) {
    return null;
  }

  return {
    title: parts[0],
    meaning: parts[1],
    usage: parts[2] ? [parts[2]] : [],
    examples: parts[3] ? [parts[3]] : [],
    notes: parts[4] ? [parts[4]] : [],
    content: "",
    image: parts[5] || "",
  };
}

function parseJsonInput(rawInput: string): ImportedGrammarPoint[] {
  const parsed = JSON.parse(rawInput) as unknown;

  if (Array.isArray(parsed)) {
    return parsed
      .map((entry) =>
        entry && typeof entry === "object"
          ? pointFromObject(entry as Record<string, unknown>)
          : null
      )
      .filter((entry): entry is ImportedGrammarPoint => !!entry);
  }

  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    const list = obj.points ?? obj.items ?? obj.data;
    if (Array.isArray(list)) {
      return list
        .map((entry) =>
          entry && typeof entry === "object"
            ? pointFromObject(entry as Record<string, unknown>)
            : null
        )
        .filter((entry): entry is ImportedGrammarPoint => !!entry);
    }

    const single = pointFromObject(obj);
    if (single) {
      return [single];
    }
  }

  return [];
}

function parseJsonLinesInput(rawInput: string): ImportedGrammarPoint[] {
  const lines = rawInput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("{") && line.includes("}"));

  const output: ImportedGrammarPoint[] = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line.replace(/,+\s*$/, "")) as unknown;
      if (parsed && typeof parsed === "object") {
        const point = pointFromObject(parsed as Record<string, unknown>);
        if (point) {
          output.push(point);
        }
      }
    } catch {
      // Skip invalid row.
    }
  }
  return output;
}

function parseTextInput(rawInput: string): ImportedGrammarPoint[] {
  return rawInput
    .split(/\r?\n/)
    .map((line) => pointFromLine(line))
    .filter((entry): entry is ImportedGrammarPoint => !!entry);
}

export function parseGrammarInput(rawInput: string): ImportedGrammarPoint[] {
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
    // Fall through to JSON lines / plain text.
  }

  const fromJsonLines = parseJsonLinesInput(text);
  if (fromJsonLines.length > 0) {
    return fromJsonLines;
  }

  return parseTextInput(text);
}
