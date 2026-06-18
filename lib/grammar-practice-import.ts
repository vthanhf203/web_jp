import {
  normalizeGrammarPracticeJsonRows,
  normalizeGrammarPracticeQuizDeckJsonRows,
  type GrammarPracticeItem,
  type GrammarPracticeQuizDeck,
} from "@/lib/grammar-practice-store";

export type ImportedGrammarPracticeItem = Omit<GrammarPracticeItem, "createdAt" | "updatedAt"> & {
  id?: string;
};

export type ImportedGrammarPracticeQuizDeck = Omit<GrammarPracticeQuizDeck, "createdAt" | "updatedAt"> & {
  id?: string;
};

function toImportedRow(item: GrammarPracticeItem): ImportedGrammarPracticeItem {
  return {
    id: item.id,
    pattern: item.pattern,
    displayPattern: item.displayPattern,
    meaning: item.meaning,
    meaningShort: item.meaningShort,
    deckName: item.deckName,
    jlptLevel: item.jlptLevel,
    topic: item.topic,
    structure: item.structure,
    structureDetail: item.structureDetail,
    nuance: item.nuance,
    nuanceUsage: item.nuanceUsage,
    confusablePatterns: item.confusablePatterns,
    notes: item.notes,
    examples: item.examples,
    distractors: item.distractors,
    quiz: item.quiz,
    review: item.review,
  };
}

function toImportedQuizDeck(deck: GrammarPracticeQuizDeck): ImportedGrammarPracticeQuizDeck {
  return {
    id: deck.id,
    deckName: deck.deckName,
    jlptLevel: deck.jlptLevel,
    quizType: deck.quizType,
    topic: deck.topic,
    estimatedMinutes: deck.estimatedMinutes,
    sourceGrammarIds: deck.sourceGrammarIds,
    instructionsVi: deck.instructionsVi,
    items: deck.items,
    reviewConfig: deck.reviewConfig,
  };
}

function parseJsonInput(rawInput: string): ImportedGrammarPracticeItem[] {
  const parsed = JSON.parse(rawInput) as unknown;
  return normalizeGrammarPracticeJsonRows(parsed).map((entry) => toImportedRow(entry));
}

function parseQuizDeckJsonInput(rawInput: string): ImportedGrammarPracticeQuizDeck[] {
  const parsed = JSON.parse(rawInput) as unknown;
  return normalizeGrammarPracticeQuizDeckJsonRows(parsed).map((entry) => toImportedQuizDeck(entry));
}

function parseJsonLinesInput(rawInput: string): ImportedGrammarPracticeItem[] {
  const output: ImportedGrammarPracticeItem[] = [];
  for (const line of rawInput.split(/\r?\n/)) {
    const clean = line.trim().replace(/,+$/, "");
    if (!clean.startsWith("{")) {
      continue;
    }
    try {
      const parsed = JSON.parse(clean) as unknown;
      output.push(...normalizeGrammarPracticeJsonRows(parsed).map((entry) => toImportedRow(entry)));
    } catch {
      // Skip malformed row.
    }
  }
  return output;
}

function parseQuizDeckJsonLinesInput(rawInput: string): ImportedGrammarPracticeQuizDeck[] {
  const output: ImportedGrammarPracticeQuizDeck[] = [];
  for (const line of rawInput.split(/\r?\n/)) {
    const clean = line.trim().replace(/,+$/, "");
    if (!clean.startsWith("{")) {
      continue;
    }
    try {
      const parsed = JSON.parse(clean) as unknown;
      output.push(...normalizeGrammarPracticeQuizDeckJsonRows(parsed).map((entry) => toImportedQuizDeck(entry)));
    } catch {
      // Skip malformed row.
    }
  }
  return output;
}

export function parseGrammarPracticeInput(rawInput: string): ImportedGrammarPracticeItem[] {
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

export function parseGrammarPracticeQuizDeckInput(rawInput: string): ImportedGrammarPracticeQuizDeck[] {
  const text = rawInput.trim();
  if (!text) {
    return [];
  }

  try {
    const rows = parseQuizDeckJsonInput(text);
    if (rows.length > 0) {
      return rows;
    }
  } catch {
    // Fall through to json-lines parsing.
  }

  return parseQuizDeckJsonLinesInput(text);
}
