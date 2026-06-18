import "server-only";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type GrammarPracticeStructureForm = {
  label: string;
  rule: string;
  example?: string;
};

export type GrammarPracticeStructure = {
  raw: string;
  forms: GrammarPracticeStructureForm[];
};

export type GrammarPracticeNuance = {
  vi: string;
  usage: string[];
};

export type GrammarPracticeConfusablePattern = {
  pattern: string;
  meaning: string;
  difference?: string;
};

export type GrammarPracticeExample = {
  id?: string;
  jp: string;
  jpWithReading?: string;
  vi: string;
  highlight?: string;
  note?: string;
};

export type GrammarPracticeQuizPrompt = {
  jp?: string;
  jpWithReading?: string;
  vi?: string;
  highlight?: string;
  parts: string[];
};

export type GrammarPracticeQuizOption = {
  id: string;
  text: string;
};

export type GrammarPracticeQuizPairItem = {
  id: string;
  text: string;
};

export type GrammarPracticeQuizPairs = {
  left: GrammarPracticeQuizPairItem[];
  right: GrammarPracticeQuizPairItem[];
};

export type GrammarPracticeQuizFullSentence = {
  jp?: string;
  jpWithReading?: string;
  vi?: string;
};

export type GrammarPracticeQuizItem = {
  id: string;
  type: string;
  skill?: string;
  difficulty?: number;
  targetPattern?: string;
  question: string;
  prompt?: GrammarPracticeQuizPrompt;
  options: GrammarPracticeQuizOption[];
  acceptedAnswers: string[];
  answer: string;
  answerParts: string[];
  answerMap: Record<string, string>;
  explanation?: string;
  wrongAnswerExplanations: Record<string, string>;
  fullSentence?: GrammarPracticeQuizFullSentence;
  pairs?: GrammarPracticeQuizPairs;
};

export type GrammarPracticeReview = {
  priority?: number;
  recommendedNextReviewDays: number[];
  commonMistakes: string[];
};

export type GrammarPracticeItem = {
  id: string;
  pattern: string;
  displayPattern?: string;
  meaning: string;
  meaningShort?: string;
  deckName: string;
  jlptLevel: string;
  topic: string;
  structure?: string;
  structureDetail?: GrammarPracticeStructure;
  nuance?: string;
  nuanceUsage: string[];
  confusablePatterns: GrammarPracticeConfusablePattern[];
  notes: string[];
  examples: GrammarPracticeExample[];
  distractors: string[];
  quiz: GrammarPracticeQuizItem[];
  review?: GrammarPracticeReview;
  createdAt: string;
  updatedAt: string;
};

export const DEFAULT_GRAMMAR_DECK_NAME = "Chưa phân loại";

export type GrammarPracticeQuizWeakPointRule = {
  condition: string;
  messageVi: string;
};

export type GrammarPracticeQuizReviewConfig = {
  shuffleItems: boolean;
  shuffleOptions: boolean;
  passScorePercent: number;
  recommendedNextReviewDays: number[];
  weakPointRules: GrammarPracticeQuizWeakPointRule[];
};

export type GrammarPracticeQuizDeck = {
  id: string;
  deckName: string;
  jlptLevel: string;
  quizType?: string;
  topic: string;
  estimatedMinutes?: number;
  sourceGrammarIds: string[];
  instructionsVi?: string;
  items: GrammarPracticeQuizItem[];
  reviewConfig: GrammarPracticeQuizReviewConfig;
  createdAt: string;
  updatedAt: string;
};

export type GrammarPracticeStore = {
  updatedAt: string;
  items: GrammarPracticeItem[];
  quizDecks: GrammarPracticeQuizDeck[];
};

function getStoreKey(userId: string): string {
  return `user_grammar_practice_store:${userId}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeNestedString(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "";
  }
  const obj = value as Record<string, unknown>;
  const keys = [
    "text",
    "value",
    "content",
    "vi",
    "vn",
    "translation",
    "meaning",
    "shortVi",
    "jp",
    "ja",
    "raw",
  ];
  for (const key of keys) {
    const parsed = normalizeString(obj[key]);
    if (parsed) {
      return parsed;
    }
  }
  return "";
}

function pickString(source: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = normalizeString(source[key]);
    if (value) {
      return value;
    }
    const nested = normalizeNestedString(source[key]);
    if (nested) {
      return nested;
    }
  }
  return "";
}

function normalizeLevel(value: unknown): string {
  const text = normalizeString(value).toUpperCase();
  if (["N1", "N2", "N3", "N4", "N5"].includes(text)) {
    return text;
  }
  const matched = text.match(/N[1-5]/g);
  if (matched && matched.length > 0) {
    return matched[0] ?? "N5";
  }
  return "N5";
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .map((entry) => (typeof entry === "string" ? normalizeString(entry) : normalizeNestedString(entry)))
          .filter(Boolean)
      )
    );
  }
  if (typeof value === "string") {
    return Array.from(
      new Set(
        value
          .split(/\r?\n|\|/)
          .map((entry) => entry.trim())
          .filter(Boolean)
      )
    );
  }
  return [];
}

function normalizeOptionalNumber(value: unknown): number | undefined {
  const numeric = typeof value === "number" ? value : Number(normalizeString(value));
  return Number.isFinite(numeric) ? numeric : undefined;
}

function normalizeNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const output = new Set<number>();
  for (const entry of value) {
    const parsed = normalizeOptionalNumber(entry);
    if (typeof parsed === "number") {
      output.add(parsed);
    }
  }
  return Array.from(output.values());
}

function normalizeStructureForm(value: unknown): GrammarPracticeStructureForm | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const label = pickString(raw, ["label", "name", "title"]);
  const rule = pickString(raw, ["rule", "pattern", "form"]);
  if (!label || !rule) {
    return null;
  }
  return {
    label,
    rule,
    example: pickString(raw, ["example", "sample"]) || undefined,
  };
}

function normalizeStructureDetail(value: unknown): GrammarPracticeStructure | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  const normalizedRaw = pickString(raw, ["raw", "text", "value", "pattern"]);
  const forms = Array.isArray(raw.forms)
    ? raw.forms
        .map((entry) => normalizeStructureForm(entry))
        .filter((entry): entry is GrammarPracticeStructureForm => Boolean(entry))
    : [];
  if (!normalizedRaw && forms.length === 0) {
    return undefined;
  }
  return {
    raw: normalizedRaw,
    forms,
  };
}

function normalizeNuanceDetail(value: unknown): GrammarPracticeNuance | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  const vi = pickString(raw, ["vi", "meaning", "text", "content"]);
  const usage = normalizeStringArray(raw.usage ?? raw.tags ?? raw.hints);
  if (!vi && usage.length === 0) {
    return undefined;
  }
  return { vi, usage };
}

function normalizeConfusablePattern(value: unknown): GrammarPracticeConfusablePattern | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const pattern = pickString(raw, ["pattern", "title", "name"]);
  const meaning = pickString(raw, ["meaning", "vi", "translation"]);
  if (!pattern || !meaning) {
    return null;
  }
  return {
    pattern,
    meaning,
    difference: pickString(raw, ["difference", "note", "distinction"]) || undefined,
  };
}

function normalizeConfusablePatterns(value: unknown): GrammarPracticeConfusablePattern[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => normalizeConfusablePattern(entry))
    .filter((entry): entry is GrammarPracticeConfusablePattern => Boolean(entry));
}

function splitExampleLine(value: string): GrammarPracticeExample | null {
  const text = value.trim();
  if (!text) {
    return null;
  }
  const separatorIndex = text.lastIndexOf(" - ");
  if (separatorIndex < 0) {
    return {
      jp: text,
      vi: "",
    };
  }
  return {
    jp: text.slice(0, separatorIndex).trim(),
    vi: text.slice(separatorIndex + 3).trim(),
  };
}

function normalizeExample(value: unknown): GrammarPracticeExample | null {
  if (typeof value === "string") {
    return splitExampleLine(value);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const jp = pickString(raw, ["jp", "ja", "japanese", "sentence", "text", "example"]);
  const vi = pickString(raw, ["vi", "vn", "translation", "meaning"]);
  if (!jp && !vi) {
    return null;
  }
  return {
    id: pickString(raw, ["id"]) || undefined,
    jp,
    jpWithReading: pickString(raw, ["jpWithReading", "japaneseWithReading", "jpFurigana"]) || undefined,
    vi,
    highlight: pickString(raw, ["highlight", "target", "focus"]) || undefined,
    note: pickString(raw, ["note", "memo", "hint"]),
  };
}

function normalizeExamples(value: unknown): GrammarPracticeExample[] {
  if (typeof value === "string") {
    return value
      .split(/\r?\n/)
      .map((line) => splitExampleLine(line))
      .filter((entry): entry is GrammarPracticeExample => Boolean(entry));
  }
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => normalizeExample(entry))
    .filter((entry): entry is GrammarPracticeExample => Boolean(entry));
}

function normalizeQuizPrompt(value: unknown): GrammarPracticeQuizPrompt | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  const parts = normalizeStringArray(raw.parts);
  const prompt: GrammarPracticeQuizPrompt = {
    jp: pickString(raw, ["jp", "ja"]) || undefined,
    jpWithReading: pickString(raw, ["jpWithReading", "japaneseWithReading"]) || undefined,
    vi: pickString(raw, ["vi", "vn", "translation"]) || undefined,
    highlight: pickString(raw, ["highlight", "target", "focus"]) || undefined,
    parts,
  };
  if (!prompt.jp && !prompt.jpWithReading && !prompt.vi && prompt.parts.length === 0) {
    return undefined;
  }
  return prompt;
}

function normalizeQuizOption(value: unknown, index: number): GrammarPracticeQuizOption | null {
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) {
      return null;
    }
    return {
      id: String.fromCharCode(65 + index),
      text,
    };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const text = pickString(raw, ["text", "value", "label", "option"]);
  if (!text) {
    return null;
  }
  return {
    id: pickString(raw, ["id", "key"]) || String.fromCharCode(65 + index),
    text,
  };
}

function normalizeQuizOptions(value: unknown): GrammarPracticeQuizOption[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry, index) => normalizeQuizOption(entry, index))
    .filter((entry): entry is GrammarPracticeQuizOption => Boolean(entry));
}

function normalizeWrongAnswerExplanations(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const output: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const text = normalizeString(raw);
    if (key && text) {
      output[key] = text;
    }
  }
  return output;
}

function normalizeAnswerParts(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : normalizeNestedString(entry)))
    .filter(Boolean);
}

function normalizeAnswerMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const output: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const text = typeof raw === "string" ? raw.trim() : normalizeNestedString(raw);
    if (key && text) {
      output[key] = text;
    }
  }
  return output;
}

function normalizeQuizAnswer(value: unknown): {
  answer: string;
  answerParts: string[];
  answerMap: Record<string, string>;
} {
  if (typeof value === "string") {
    return {
      answer: value.trim(),
      answerParts: [],
      answerMap: {},
    };
  }

  const answerParts = normalizeAnswerParts(value);
  if (answerParts.length > 0) {
    return {
      answer: answerParts.join(""),
      answerParts,
      answerMap: {},
    };
  }

  const answerMap = normalizeAnswerMap(value);
  if (Object.keys(answerMap).length > 0) {
    return {
      answer: Object.entries(answerMap)
        .map(([key, mapped]) => `${key}:${mapped}`)
        .join("|"),
      answerParts: [],
      answerMap,
    };
  }

  return {
    answer: "",
    answerParts: [],
    answerMap: {},
  };
}

function normalizeQuizPairItem(value: unknown): GrammarPracticeQuizPairItem | null {
  if (typeof value === "string") {
    const text = value.trim();
    return text ? { id: text, text } : null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const text = pickString(raw, ["text", "value", "label", "content"]);
  if (!text) {
    return null;
  }
  return {
    id: pickString(raw, ["id", "key"]) || text,
    text,
  };
}

function normalizeQuizPairs(value: unknown): GrammarPracticeQuizPairs | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  const left = Array.isArray(raw.left)
    ? raw.left.map((entry) => normalizeQuizPairItem(entry)).filter((entry): entry is GrammarPracticeQuizPairItem => Boolean(entry))
    : [];
  const right = Array.isArray(raw.right)
    ? raw.right.map((entry) => normalizeQuizPairItem(entry)).filter((entry): entry is GrammarPracticeQuizPairItem => Boolean(entry))
    : [];
  if (left.length === 0 || right.length === 0) {
    return undefined;
  }
  return { left, right };
}

function normalizeQuizFullSentence(value: unknown): GrammarPracticeQuizFullSentence | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  const fullSentence = {
    jp: pickString(raw, ["jp", "ja"]) || undefined,
    jpWithReading: pickString(raw, ["jpWithReading", "japaneseWithReading"]) || undefined,
    vi: pickString(raw, ["vi", "vn", "translation"]) || undefined,
  };
  return fullSentence.jp || fullSentence.jpWithReading || fullSentence.vi ? fullSentence : undefined;
}

function normalizeQuizItem(value: unknown, index: number): GrammarPracticeQuizItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const question = pickString(raw, ["question", "title", "promptText"]);
  const normalizedAnswer = normalizeQuizAnswer(raw.answer ?? raw.correctAnswer ?? raw.correctOption);
  if (!question || !normalizedAnswer.answer) {
    return null;
  }
  return {
    id: pickString(raw, ["id"]) || `q-${index + 1}`,
    type: pickString(raw, ["type"]) || "multiple_choice",
    skill: pickString(raw, ["skill"]) || undefined,
    difficulty: normalizeOptionalNumber(raw.difficulty),
    targetPattern: pickString(raw, ["targetPattern", "pattern", "grammar"]) || undefined,
    question,
    prompt: normalizeQuizPrompt(raw.prompt),
    options: normalizeQuizOptions(raw.options),
    acceptedAnswers: normalizeStringArray(raw.acceptedAnswers ?? raw.acceptableAnswers),
    answer: normalizedAnswer.answer,
    answerParts: normalizedAnswer.answerParts,
    answerMap: normalizedAnswer.answerMap,
    explanation: pickString(raw, ["explanation", "explanationVi", "note", "reason"]) || undefined,
    wrongAnswerExplanations: normalizeWrongAnswerExplanations(raw.wrongAnswerExplanations),
    fullSentence: normalizeQuizFullSentence(raw.fullSentence),
    pairs: normalizeQuizPairs(raw.pairs),
  };
}

function normalizeQuizItems(value: unknown): GrammarPracticeQuizItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry, index) => normalizeQuizItem(entry, index))
    .filter((entry): entry is GrammarPracticeQuizItem => Boolean(entry));
}

function normalizeReview(value: unknown): GrammarPracticeReview | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  const priority = normalizeOptionalNumber(raw.priority);
  const recommendedNextReviewDays = normalizeNumberArray(raw.recommendedNextReviewDays);
  const commonMistakes = normalizeStringArray(raw.commonMistakes);
  if (
    typeof priority === "undefined" &&
    recommendedNextReviewDays.length === 0 &&
    commonMistakes.length === 0
  ) {
    return undefined;
  }
  return {
    priority,
    recommendedNextReviewDays,
    commonMistakes,
  };
}

function normalizeWeakPointRule(value: unknown): GrammarPracticeQuizWeakPointRule | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const condition = pickString(raw, ["condition", "rule", "when"]);
  const messageVi = pickString(raw, ["messageVi", "message", "vi"]);
  if (!condition || !messageVi) {
    return null;
  }
  return { condition, messageVi };
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  const text = normalizeString(value).toLowerCase();
  if (["true", "1", "yes", "co", "có"].includes(text)) {
    return true;
  }
  if (["false", "0", "no", "khong", "không"].includes(text)) {
    return false;
  }
  return fallback;
}

function normalizeQuizReviewConfig(value: unknown): GrammarPracticeQuizReviewConfig {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const passScorePercent = normalizeOptionalNumber(raw.passScorePercent ?? raw.passPercent ?? raw.passScore) ?? 80;
  const weakPointRules = Array.isArray(raw.weakPointRules)
    ? raw.weakPointRules
        .map((entry) => normalizeWeakPointRule(entry))
        .filter((entry): entry is GrammarPracticeQuizWeakPointRule => Boolean(entry))
    : [];

  return {
    shuffleItems: normalizeBoolean(raw.shuffleItems, true),
    shuffleOptions: normalizeBoolean(raw.shuffleOptions, true),
    passScorePercent: Math.min(100, Math.max(0, passScorePercent)),
    recommendedNextReviewDays: normalizeNumberArray(raw.recommendedNextReviewDays),
    weakPointRules,
  };
}

function isQuizDeckLike(raw: Record<string, unknown>): boolean {
  const list = raw.items ?? raw.questions ?? raw.quizItems;
  if (!Array.isArray(list) || list.length === 0) {
    return false;
  }
  if (normalizeString(raw.quizType) || normalizeString(raw.instructionsVi) || raw.reviewConfig) {
    return true;
  }
  return list.some(
    (entry) =>
      Boolean(entry) &&
      typeof entry === "object" &&
      !Array.isArray(entry) &&
      Boolean(pickString(entry as Record<string, unknown>, ["question", "promptText"]))
  );
}

function normalizeQuizDeck(value: unknown): GrammarPracticeQuizDeck | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  if (!isQuizDeckLike(raw)) {
    return null;
  }
  const list = raw.items ?? raw.questions ?? raw.quizItems;
  const items = normalizeQuizItems(list);
  if (items.length === 0) {
    return null;
  }
  const now = nowIso();
  const deckName = pickString(raw, ["deckName", "deck", "title", "name", "collection"]) || "Quiz ôn ngữ pháp";
  const topic = pickString(raw, ["topic", "category", "theme"]) || "Tổng hợp";
  return {
    id: pickString(raw, ["id"]) || crypto.randomUUID(),
    deckName,
    jlptLevel: normalizeLevel(raw.jlptLevel ?? raw.level ?? raw.jlpt),
    quizType: pickString(raw, ["quizType", "type"]) || undefined,
    topic,
    estimatedMinutes: normalizeOptionalNumber(raw.estimatedMinutes ?? raw.minutes),
    sourceGrammarIds: normalizeStringArray(raw.sourceGrammarIds ?? raw.grammarIds ?? raw.patternIds),
    instructionsVi: pickString(raw, ["instructionsVi", "instructions", "description", "guide"]) || undefined,
    items,
    reviewConfig: normalizeQuizReviewConfig(raw.reviewConfig),
    createdAt: normalizeString(raw.createdAt) || now,
    updatedAt: normalizeString(raw.updatedAt) || now,
  };
}

function normalizeItem(value: unknown): GrammarPracticeItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const pattern = pickString(raw, ["pattern", "title", "grammar", "mau", "structureName"]);
  const meaning = pickString(raw, ["meaning", "vi", "vn", "translation", "explain"]);
  if (!pattern || !meaning) {
    return null;
  }

  const topic = pickString(raw, ["topic", "category", "theme"]) || "Tổng hợp";
  const now = nowIso();
  const structureDetail = normalizeStructureDetail(raw.structure);
  const nuanceDetail = normalizeNuanceDetail(raw.nuance);
  const confusablePatterns = normalizeConfusablePatterns(raw.confusablePatterns ?? raw.confusable ?? raw.compare);
  const quizItems = normalizeQuizItems(raw.quiz ?? raw.questions);
  const review = normalizeReview(raw.review);
  const explicitNotes = normalizeStringArray(raw.notes ?? raw.note ?? raw.memo ?? raw.tips);
  const reviewNotes = review?.commonMistakes ?? [];
  const meaningShort =
    (raw.meaning && typeof raw.meaning === "object" && !Array.isArray(raw.meaning)
      ? pickString(raw.meaning as Record<string, unknown>, ["shortVi", "short", "summary"])
      : "") || undefined;

  return {
    id: pickString(raw, ["id"]) || crypto.randomUUID(),
    pattern,
    displayPattern: pickString(raw, ["displayPattern", "patternDisplay"]) || undefined,
    meaning,
    meaningShort,
    deckName:
      pickString(raw, ["deckName", "deck", "collection", "groupName", "group"]) ||
      topic ||
      DEFAULT_GRAMMAR_DECK_NAME,
    jlptLevel: normalizeLevel(raw.jlptLevel ?? raw.level ?? raw.jlpt),
    topic,
    structure:
      structureDetail?.raw || pickString(raw, ["structure", "form", "cauTruc", "template"]) || undefined,
    structureDetail,
    nuance: nuanceDetail?.vi || pickString(raw, ["nuance", "noteSimple", "register", "style"]) || undefined,
    nuanceUsage: nuanceDetail?.usage ?? [],
    confusablePatterns,
    notes: Array.from(new Set([...explicitNotes, ...reviewNotes])),
    examples: normalizeExamples(raw.examples ?? raw.example ?? raw.samples),
    distractors:
      normalizeStringArray(raw.distractors ?? raw.wrongAnswers ?? raw.confusers).length > 0
        ? normalizeStringArray(raw.distractors ?? raw.wrongAnswers ?? raw.confusers)
        : confusablePatterns.map((entry) => entry.meaning),
    quiz: quizItems,
    review,
    createdAt: normalizeString(raw.createdAt) || now,
    updatedAt: normalizeString(raw.updatedAt) || now,
  };
}

function normalizeStore(value: unknown): GrammarPracticeStore {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      updatedAt: "",
      items: [],
      quizDecks: [],
    };
  }

  const raw = value as Partial<GrammarPracticeStore>;
  const items = Array.isArray(raw.items)
    ? raw.items
        .map((entry) => normalizeItem(entry))
        .filter((entry): entry is GrammarPracticeItem => Boolean(entry))
    : [];
  const quizDecks = Array.isArray(raw.quizDecks)
    ? raw.quizDecks
        .map((entry) => normalizeQuizDeck(entry))
        .filter((entry): entry is GrammarPracticeQuizDeck => Boolean(entry))
    : [];

  return {
    updatedAt: normalizeString(raw.updatedAt),
    items: items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    quizDecks: quizDecks.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };
}

export async function loadGrammarPracticeStore(userId: string): Promise<GrammarPracticeStore> {
  try {
    const record = await prisma.appData.findUnique({
      where: { key: getStoreKey(userId) },
      select: { value: true },
    });
    return normalizeStore(record?.value);
  } catch {
    return { updatedAt: "", items: [], quizDecks: [] };
  }
}

export async function saveGrammarPracticeStore(userId: string, store: GrammarPracticeStore) {
  const payload: GrammarPracticeStore = {
    updatedAt: nowIso(),
    items: store.items,
    quizDecks: store.quizDecks,
  };

  await prisma.appData.upsert({
    where: { key: getStoreKey(userId) },
    create: {
      key: getStoreKey(userId),
      value: payload as unknown as Prisma.InputJsonValue,
    },
    update: {
      value: payload as unknown as Prisma.InputJsonValue,
    },
  });
}

export function normalizeGrammarPracticeJsonRows(input: unknown): GrammarPracticeItem[] {
  if (Array.isArray(input)) {
    return input
      .map((entry) => normalizeItem(entry))
      .filter((entry): entry is GrammarPracticeItem => Boolean(entry));
  }
  if (input && typeof input === "object" && !Array.isArray(input)) {
    const raw = input as Record<string, unknown>;
    if (isQuizDeckLike(raw)) {
      return [];
    }
    const list = raw.items ?? raw.data ?? raw.grammar ?? raw.points ?? raw.patterns;
    if (Array.isArray(list)) {
      return list
        .map((entry) => normalizeItem(entry))
        .filter((entry): entry is GrammarPracticeItem => Boolean(entry));
    }
    const single = normalizeItem(raw);
    return single ? [single] : [];
  }
  return [];
}

export function normalizeGrammarPracticeQuizDeckJsonRows(input: unknown): GrammarPracticeQuizDeck[] {
  if (Array.isArray(input)) {
    return input
      .map((entry) => normalizeQuizDeck(entry))
      .filter((entry): entry is GrammarPracticeQuizDeck => Boolean(entry));
  }
  if (input && typeof input === "object" && !Array.isArray(input)) {
    const raw = input as Record<string, unknown>;
    const list = raw.quizDecks ?? raw.decks ?? raw.quizDeck ?? raw.deck;
    if (Array.isArray(list)) {
      return list
        .map((entry) => normalizeQuizDeck(entry))
        .filter((entry): entry is GrammarPracticeQuizDeck => Boolean(entry));
    }
    const single = normalizeQuizDeck(raw);
    return single ? [single] : [];
  }
  return [];
}
