import {
  type ListeningPracticeItem,
  normalizeListeningJsonRows,
} from "@/lib/listening-practice-store";

export type ImportedListeningText = Omit<ListeningPracticeItem, "createdAt" | "updatedAt"> & {
  id?: string;
};

function toImportedRow(item: ListeningPracticeItem): ImportedListeningText {
  return {
    id: item.id,
    title: item.title,
    deckName: item.deckName,
    jlptLevel: item.jlptLevel,
    topic: item.topic,
    difficulty: item.difficulty,
    estimatedMinutes: item.estimatedMinutes,
    script: item.script,
    scriptRaw: item.scriptRaw,
    translation: item.translation,
    tts: item.tts,
    questions: item.questions,
  };
}

function parseJsonInput(rawInput: string): ImportedListeningText[] {
  const parsed = JSON.parse(rawInput) as unknown;
  return normalizeListeningJsonRows(parsed).map((entry) => toImportedRow(entry));
}

function parseJsonLinesInput(rawInput: string): ImportedListeningText[] {
  const output: ImportedListeningText[] = [];
  for (const line of rawInput.split(/\r?\n/)) {
    const clean = line.trim().replace(/,+$/, "");
    if (!clean.startsWith("{")) {
      continue;
    }
    try {
      const parsed = JSON.parse(clean) as unknown;
      output.push(...normalizeListeningJsonRows(parsed).map((entry) => toImportedRow(entry)));
    } catch {
      // Skip malformed row.
    }
  }
  return output;
}

export function parseListeningTextInput(rawInput: string): ImportedListeningText[] {
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
    // Fall through to json-lines parsing.
  }

  return parseJsonLinesInput(text);
}
