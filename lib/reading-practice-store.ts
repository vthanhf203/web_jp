import "server-only";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type ReadingVocabularyItem = {
  word: string;
  reading: string;
  meaning: string;
  hanviet?: string;
  partOfSpeech?: string;
  role?: string;
};

export type ReadingQuestionItem = {
  prompt: string;
  answer: string;
};

export type ReadingPostReadingQuizQuestion = {
  id: string;
  type: string;
  skill?: string;
  difficulty?: string;
  points: number;
  prompt: string;
  options: string[];
  correctAnswer: string | boolean;
  explanation?: string;
  paragraphRef?: number;
  sentenceRef?: string;
  grammarPattern?: string;
  targetWord?: string;
};

export type ReadingPostReadingQuiz = {
  mode?: string;
  showAnswerImmediately: boolean;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  passingScore: number;
  totalQuestions?: number;
  questionTypes: string[];
  questions: ReadingPostReadingQuizQuestion[];
};

export type ReadingRecallNormalizeRules = {
  ignoreSpaces?: boolean;
  ignorePunctuation?: boolean;
  normalizeFullWidthNumbers?: boolean;
  ignoreKanjiHiraganaDifference?: boolean;
  allowOptionalSubject?: boolean;
  caseSensitive?: boolean;
};

export type ReadingRecallScoreBand = {
  min: number;
  label: string;
  message: string;
};

export type ReadingRecallSlot = {
  slot: string;
  label: string;
  weight?: number;
  accepted?: string[];
  acceptedPattern?: string;
  type?: string;
  note?: string;
};

export type ReadingRecallCommonMistake = {
  pattern: string;
  mistakeType?: string;
  message: string;
};

export type ReadingRecallFeedbackTemplates = Record<string, string>;

export type ReadingSentenceRecallQuestion = {
  id: string;
  sourceSentenceRef?: string;
  difficulty?: string;
  skill?: string;
  viPrompt: string;
  modelAnswer: string;
  modelAnswerPlain: string;
  acceptableAnswers: string[];
  targetGrammar: string[];
  targetVocabulary: string[];
  hints: string[];
  explanation?: string;
  points: number;
  gradingMode?: string;
  passingScore?: number;
  autoAcceptWhenRequiredSlotsMatch?: boolean;
  requiredSlots: ReadingRecallSlot[];
  optionalSlots: ReadingRecallSlot[];
  minorDifferencesToIgnore: string[];
  commonMistakes: ReadingRecallCommonMistake[];
  feedbackTemplates: ReadingRecallFeedbackTemplates;
};

export type ReadingSentenceRecallPractice = {
  mode?: string;
  title: string;
  description?: string;
  showAfter?: string;
  shuffleQuestions: boolean;
  showHints: boolean;
  showAnswerAfterSubmit: boolean;
  gradingMode: string;
  defaultGradingMode?: string;
  globalNormalizeRules?: ReadingRecallNormalizeRules;
  scoreBands?: Record<string, ReadingRecallScoreBand>;
  totalQuestions?: number;
  questions: ReadingSentenceRecallQuestion[];
};

export type ReadingGrammarExample = {
  paragraphIndex?: number;
  sentenceRef?: string;
  sentence: string;
  vi?: string;
};

export type ReadingGrammarCoverageItem = {
  pattern: string;
  meaning: string;
  level?: string;
  source?: string;
  role?: string;
  frequency?: number;
  examples: ReadingGrammarExample[];
};

export const DEFAULT_READING_DECK_NAME = "Chưa phân loại";

export type ReadingTextItem = {
  id: string;
  title: string;
  deckName: string;
  jlptLevel: string;
  topic: string;
  difficulty: string;
  estimatedMinutes: number;
  paragraphs: string[];
  translation: string;
  vocabulary: ReadingVocabularyItem[];
  grammarCoverage: ReadingGrammarCoverageItem[];
  questions: ReadingQuestionItem[];
  postReadingQuiz?: ReadingPostReadingQuiz;
  sentenceRecallPractice?: ReadingSentenceRecallPractice;
  createdAt: string;
  updatedAt: string;
};

export type ReadingPracticeStore = {
  updatedAt: string;
  items: ReadingTextItem[];
};

function getStoreKey(userId: string): string {
  return `user_reading_practice_store:${userId}`;
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
  const keys = ["vi", "vn", "text", "value", "translation", "meaning", "dich", "dịch", "content"];
  for (const key of keys) {
    const parsed = normalizeString(obj[key]);
    if (parsed) {
      return parsed;
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

function normalizeMinutes(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(normalizeString(value));
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 3;
  }
  return Math.min(60, Math.max(1, Math.round(numeric)));
}

function normalizeOptionalNumber(value: unknown): number | undefined {
  const numeric = typeof value === "number" ? value : Number(normalizeString(value));
  return Number.isFinite(numeric) ? numeric : undefined;
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => normalizeString(entry)).filter(Boolean);
}

function normalizeStringListOrSingle(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeString(entry)).filter(Boolean);
  }
  const single = normalizeString(value);
  return single ? [single] : [];
}

function normalizeParagraphs(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === "string") {
          return normalizeString(entry);
        }
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
          return "";
        }
        const raw = entry as Record<string, unknown>;
        if (Array.isArray(raw.sentences)) {
          return raw.sentences
            .map((sentence) => {
              if (typeof sentence === "string") {
                return normalizeString(sentence);
              }
              if (!sentence || typeof sentence !== "object" || Array.isArray(sentence)) {
                return "";
              }
              const sentenceRaw = sentence as Record<string, unknown>;
              return normalizeString(sentenceRaw.jp ?? sentenceRaw.ja ?? sentenceRaw.text ?? sentenceRaw.sentence);
            })
            .filter(Boolean)
            .join("");
        }
        return (
          normalizeString(raw.jp ?? raw.ja ?? raw.text ?? raw.paragraph ?? raw.content) ||
          normalizeNestedString(raw.jp) ||
          normalizeNestedString(raw.text)
        );
      })
      .filter(Boolean);
  }

  const text = normalizeString(value);
  if (!text) {
    return [];
  }
  return text
    .split(/\n{2,}|\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function splitWordAndReading(input: string): { word: string; reading: string } {
  const clean = normalizeString(input);
  const matched = clean.match(/^(.+?)\s*[（(]([^（）()]+)[）)]$/);
  if (!matched) {
    return { word: clean, reading: "" };
  }
  return {
    word: normalizeString(matched[1]),
    reading: normalizeString(matched[2]),
  };
}

function normalizeVocabularyItem(input: unknown): ReadingVocabularyItem | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  const raw = input as Record<string, unknown>;
  const wordInput = normalizeString(raw.word ?? raw.term ?? raw.text);
  const split = splitWordAndReading(wordInput);
  const meaning =
    normalizeString(raw.meaning ?? raw.vi ?? raw.translation) ||
    normalizeNestedString(raw.meaning) ||
    normalizeNestedString(raw.translation);
  if (!split.word || !meaning) {
    return null;
  }
  return {
    word: split.word,
    reading: normalizeString(raw.reading ?? raw.kana ?? raw.furigana ?? raw.yomi) || split.reading,
    meaning,
    hanviet: normalizeString(raw.hanviet ?? raw.hanViet ?? raw.han_viet),
    partOfSpeech: normalizeString(raw.partOfSpeech ?? raw.pos ?? raw.type),
    role: normalizeString(raw.role),
  };
}

function normalizeVocabularyList(input: unknown): ReadingVocabularyItem[] {
  if (!Array.isArray(input)) {
    return [];
  }
  return input
    .map((entry) => normalizeVocabularyItem(entry))
    .filter((entry): entry is ReadingVocabularyItem => Boolean(entry));
}

function normalizeVocabularyCoverage(input: unknown): ReadingVocabularyItem[] {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return [];
  }
  const raw = input as Record<string, unknown>;
  return [
    ...normalizeVocabularyList(raw.coreVocabulary),
    ...normalizeVocabularyList(raw.newVocabulary),
    ...normalizeVocabularyList(raw.reviewVocabulary),
    ...normalizeVocabularyList(raw.items),
  ];
}

function mergeVocabularyItems(...groups: ReadingVocabularyItem[][]): ReadingVocabularyItem[] {
  const output = new Map<string, ReadingVocabularyItem>();
  for (const group of groups) {
    for (const item of group) {
      const key = `${item.word}\u0000${item.meaning}`;
      output.set(key, { ...output.get(key), ...item });
    }
  }
  return Array.from(output.values());
}

function normalizeGrammarExample(input: unknown): ReadingGrammarExample | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  const raw = input as Record<string, unknown>;
  const sentence =
    normalizeString(raw.sentence ?? raw.jp ?? raw.ja ?? raw.text ?? raw.example) ||
    normalizeNestedString(raw.sentence);
  if (!sentence) {
    return null;
  }
  return {
    paragraphIndex: normalizeOptionalNumber(raw.paragraphIndex),
    sentenceRef: normalizeString(raw.sentenceRef ?? raw.ref),
    sentence,
    vi:
      normalizeString(raw.vi ?? raw.vn ?? raw.translation ?? raw.meaning) ||
      normalizeNestedString(raw.translation),
  };
}

function normalizeGrammarCoverageItem(input: unknown): ReadingGrammarCoverageItem | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  const raw = input as Record<string, unknown>;
  const pattern = normalizeString(raw.pattern ?? raw.name ?? raw.title ?? raw.grammar);
  const meaning =
    normalizeString(raw.meaning ?? raw.vi ?? raw.translation ?? raw.explanation) ||
    normalizeNestedString(raw.meaning) ||
    normalizeNestedString(raw.translation);
  if (!pattern) {
    return null;
  }
  return {
    pattern,
    meaning,
    level: normalizeString(raw.level ?? raw.jlptLevel),
    source: normalizeString(raw.source),
    role: normalizeString(raw.role),
    frequency: normalizeOptionalNumber(raw.frequency),
    examples: Array.isArray(raw.examples)
      ? raw.examples
          .map((entry) => normalizeGrammarExample(entry))
          .filter((entry): entry is ReadingGrammarExample => Boolean(entry))
      : [],
  };
}

function normalizeGrammarCoverage(input: unknown): ReadingGrammarCoverageItem[] {
  if (!Array.isArray(input)) {
    return [];
  }
  return input
    .map((entry) => normalizeGrammarCoverageItem(entry))
    .filter((entry): entry is ReadingGrammarCoverageItem => Boolean(entry));
}

function normalizeQuestionItem(input: unknown): ReadingQuestionItem | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  const raw = input as Record<string, unknown>;
  const prompt =
    normalizeString(raw.prompt ?? raw.question ?? raw.q) ||
    normalizeNestedString(raw.prompt) ||
    normalizeNestedString(raw.question);
  const answer =
    normalizeString(raw.answer ?? raw.a ?? raw.explanation) ||
    normalizeNestedString(raw.answer) ||
    normalizeNestedString(raw.explanation);
  if (!prompt) {
    return null;
  }
  return {
    prompt,
    answer,
  };
}

function normalizeBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  const text = normalizeString(value).toLowerCase();
  if (["true", "1", "yes", "y", "dung", "đúng"].includes(text)) {
    return true;
  }
  if (["false", "0", "no", "n", "sai"].includes(text)) {
    return false;
  }
  return fallback;
}

function normalizePostQuizQuestion(input: unknown, index: number): ReadingPostReadingQuizQuestion | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  const raw = input as Record<string, unknown>;
  const prompt =
    normalizeString(raw.prompt ?? raw.question ?? raw.q) ||
    normalizeNestedString(raw.prompt) ||
    normalizeNestedString(raw.question);
  const correctRaw = raw.correctAnswer ?? raw.answer ?? raw.correct ?? raw.a;
  if (!prompt || typeof correctRaw === "undefined") {
    return null;
  }
  const type = normalizeString(raw.type) || "multipleChoice";
  const isTrueFalse = type.toLowerCase().includes("truefalse") || typeof correctRaw === "boolean";
  const correctAnswer = isTrueFalse ? normalizeBoolean(correctRaw) : normalizeString(correctRaw);
  const options = Array.isArray(raw.options)
    ? raw.options.map((option) => normalizeString(option)).filter(Boolean)
    : isTrueFalse
      ? ["true", "false"]
      : [];

  return {
    id: normalizeString(raw.id) || `q-${index + 1}`,
    type,
    skill: normalizeString(raw.skill),
    difficulty: normalizeString(raw.difficulty),
    points: normalizeOptionalNumber(raw.points) ?? 1,
    prompt,
    options,
    correctAnswer,
    explanation:
      normalizeString(raw.explanation ?? raw.explain ?? raw.reason) ||
      normalizeNestedString(raw.explanation),
    paragraphRef: normalizeOptionalNumber(raw.paragraphRef ?? raw.paragraphIndex),
    sentenceRef: normalizeString(raw.sentenceRef ?? raw.ref),
    grammarPattern: normalizeString(raw.grammarPattern),
    targetWord: normalizeString(raw.targetWord),
  };
}

function postQuizFromLegacyQuestions(input: unknown): ReadingPostReadingQuiz | undefined {
  if (!Array.isArray(input)) {
    return undefined;
  }
  const questions = input
    .map<ReadingPostReadingQuizQuestion | null>((entry, index) => {
      const legacy = normalizeQuestionItem(entry);
      if (!legacy) {
        return null;
      }
      return {
        id: `legacy-${index + 1}`,
        type: "shortAnswer",
        points: 1,
        prompt: legacy.prompt,
        options: [] as string[],
        correctAnswer: legacy.answer,
        explanation: legacy.answer,
      } satisfies ReadingPostReadingQuizQuestion;
    })
    .filter((entry): entry is ReadingPostReadingQuizQuestion => Boolean(entry));
  if (questions.length === 0) {
    return undefined;
  }
  return {
    mode: "afterReading",
    showAnswerImmediately: true,
    shuffleQuestions: false,
    shuffleOptions: false,
    passingScore: 70,
    totalQuestions: questions.length,
    questionTypes: ["shortAnswer"],
    questions,
  };
}

function normalizePostReadingQuiz(input: unknown, legacyQuestions?: unknown): ReadingPostReadingQuiz | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return postQuizFromLegacyQuestions(legacyQuestions);
  }
  const raw = input as Record<string, unknown>;
  const questions = Array.isArray(raw.questions)
    ? raw.questions
        .map((entry, index) => normalizePostQuizQuestion(entry, index))
        .filter((entry): entry is ReadingPostReadingQuizQuestion => Boolean(entry))
    : [];
  if (questions.length === 0) {
    return postQuizFromLegacyQuestions(legacyQuestions);
  }
  const rawTypes = Array.isArray(raw.questionTypes)
    ? raw.questionTypes.map((entry) => normalizeString(entry)).filter(Boolean)
    : [];
  return {
    mode: normalizeString(raw.mode) || "afterReading",
    showAnswerImmediately: normalizeBoolean(raw.showAnswerImmediately, false),
    shuffleQuestions: normalizeBoolean(raw.shuffleQuestions, false),
    shuffleOptions: normalizeBoolean(raw.shuffleOptions, false),
    passingScore: normalizeOptionalNumber(raw.passingScore) ?? 70,
    totalQuestions: normalizeOptionalNumber(raw.totalQuestions),
    questionTypes: rawTypes.length > 0 ? rawTypes : Array.from(new Set(questions.map((question) => question.type))),
    questions,
  };
}

function normalizeRecallSlot(input: unknown, index: number): ReadingRecallSlot | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  const raw = input as Record<string, unknown>;
  const slot = normalizeString(raw.slot ?? raw.id ?? raw.name) || `slot-${index + 1}`;
  const label = normalizeString(raw.label ?? raw.title ?? raw.name) || slot;
  return {
    slot,
    label,
    weight: normalizeOptionalNumber(raw.weight),
    accepted: normalizeStringListOrSingle(raw.accepted ?? raw.answers ?? raw.values),
    acceptedPattern: normalizeString(raw.acceptedPattern ?? raw.pattern),
    type: normalizeString(raw.type),
    note: normalizeString(raw.note),
  };
}

function normalizeRecallSlots(input: unknown): ReadingRecallSlot[] {
  if (!Array.isArray(input)) {
    return [];
  }
  return input
    .map((entry, index) => normalizeRecallSlot(entry, index))
    .filter((entry): entry is ReadingRecallSlot => Boolean(entry));
}

function normalizeRecallCommonMistake(input: unknown): ReadingRecallCommonMistake | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  const raw = input as Record<string, unknown>;
  const pattern = normalizeString(raw.pattern ?? raw.value ?? raw.match);
  const message = normalizeString(raw.message ?? raw.feedback ?? raw.explanation);
  if (!pattern || !message) {
    return null;
  }
  return {
    pattern,
    mistakeType: normalizeString(raw.mistakeType ?? raw.type),
    message,
  };
}

function normalizeRecallCommonMistakes(input: unknown): ReadingRecallCommonMistake[] {
  if (!Array.isArray(input)) {
    return [];
  }
  return input
    .map((entry) => normalizeRecallCommonMistake(entry))
    .filter((entry): entry is ReadingRecallCommonMistake => Boolean(entry));
}

function normalizeRecallFeedbackTemplates(input: unknown): ReadingRecallFeedbackTemplates {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }
  const output: ReadingRecallFeedbackTemplates = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const text = normalizeString(value);
    if (key && text) {
      output[key] = text;
    }
  }
  return output;
}

function normalizeRecallNormalizeRules(input: unknown): ReadingRecallNormalizeRules | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return undefined;
  }
  const raw = input as Record<string, unknown>;
  return {
    ignoreSpaces: normalizeBoolean(raw.ignoreSpaces, true),
    ignorePunctuation: normalizeBoolean(raw.ignorePunctuation, true),
    normalizeFullWidthNumbers: normalizeBoolean(raw.normalizeFullWidthNumbers, true),
    ignoreKanjiHiraganaDifference: normalizeBoolean(raw.ignoreKanjiHiraganaDifference, true),
    allowOptionalSubject: normalizeBoolean(raw.allowOptionalSubject, true),
    caseSensitive: normalizeBoolean(raw.caseSensitive, false),
  };
}

function normalizeRecallScoreBand(input: unknown, key: string): ReadingRecallScoreBand | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  const raw = input as Record<string, unknown>;
  const min = normalizeOptionalNumber(raw.min);
  const label = normalizeString(raw.label) || key;
  const message = normalizeString(raw.message);
  if (typeof min === "undefined") {
    return null;
  }
  return {
    min,
    label,
    message,
  };
}

function normalizeRecallScoreBands(input: unknown): Record<string, ReadingRecallScoreBand> | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return undefined;
  }
  const output: Record<string, ReadingRecallScoreBand> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const band = normalizeRecallScoreBand(value, key);
    if (band) {
      output[key] = band;
    }
  }
  return Object.keys(output).length > 0 ? output : undefined;
}

function normalizeSentenceRecallQuestion(input: unknown, index: number): ReadingSentenceRecallQuestion | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  const raw = input as Record<string, unknown>;
  const viPrompt =
    normalizeString(raw.viPrompt ?? raw.prompt ?? raw.vi ?? raw.question) ||
    normalizeNestedString(raw.viPrompt) ||
    normalizeNestedString(raw.prompt);
  const modelAnswer =
    normalizeString(raw.modelAnswer ?? raw.answer ?? raw.jp ?? raw.ja) ||
    normalizeNestedString(raw.modelAnswer);
  if (!viPrompt || !modelAnswer) {
    return null;
  }
  const acceptableAnswers = normalizeStringList(raw.acceptableAnswers);
  const modelAnswerPlain = normalizeString(raw.modelAnswerPlain ?? raw.plainAnswer) || modelAnswer;
  return {
    id: normalizeString(raw.id) || `sr-${index + 1}`,
    sourceSentenceRef: normalizeString(raw.sourceSentenceRef ?? raw.sentenceRef ?? raw.ref),
    difficulty: normalizeString(raw.difficulty),
    skill: normalizeString(raw.skill),
    viPrompt,
    modelAnswer,
    modelAnswerPlain,
    acceptableAnswers,
    targetGrammar: normalizeStringList(raw.targetGrammar),
    targetVocabulary: normalizeStringList(raw.targetVocabulary),
    hints: normalizeStringList(raw.hints),
    explanation:
      normalizeString(raw.explanation ?? raw.explain ?? raw.reason) ||
      normalizeNestedString(raw.explanation),
    points: normalizeOptionalNumber(raw.points) ?? 1,
    gradingMode: normalizeString(raw.gradingMode),
    passingScore: normalizeOptionalNumber(raw.passingScore),
    autoAcceptWhenRequiredSlotsMatch: normalizeBoolean(raw.autoAcceptWhenRequiredSlotsMatch, false),
    requiredSlots: normalizeRecallSlots(raw.requiredSlots),
    optionalSlots: normalizeRecallSlots(raw.optionalSlots),
    minorDifferencesToIgnore: normalizeStringList(raw.minorDifferencesToIgnore),
    commonMistakes: normalizeRecallCommonMistakes(raw.commonMistakes),
    feedbackTemplates: normalizeRecallFeedbackTemplates(raw.feedbackTemplates),
  };
}

function normalizeSentenceRecallPractice(input: unknown): ReadingSentenceRecallPractice | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return undefined;
  }
  const raw = input as Record<string, unknown>;
  const questions = Array.isArray(raw.questions)
    ? raw.questions
        .map((entry, index) => normalizeSentenceRecallQuestion(entry, index))
        .filter((entry): entry is ReadingSentenceRecallQuestion => Boolean(entry))
    : [];
  if (questions.length === 0) {
    return undefined;
  }
  return {
    mode: normalizeString(raw.mode) || "viToJp",
    title: normalizeString(raw.title) || "Luyện nhớ câu Việt -> Nhật",
    description: normalizeString(raw.description),
    showAfter: normalizeString(raw.showAfter),
    shuffleQuestions: normalizeBoolean(raw.shuffleQuestions, false),
    showHints: normalizeBoolean(raw.showHints, true),
    showAnswerAfterSubmit: normalizeBoolean(raw.showAnswerAfterSubmit, true),
    gradingMode: normalizeString(raw.gradingMode ?? raw.defaultGradingMode) || "semiFlexible",
    defaultGradingMode: normalizeString(raw.defaultGradingMode ?? raw.gradingMode),
    globalNormalizeRules: normalizeRecallNormalizeRules(raw.globalNormalizeRules),
    scoreBands: normalizeRecallScoreBands(raw.scoreBands),
    totalQuestions: normalizeOptionalNumber(raw.totalQuestions),
    questions,
  };
}

function normalizeReadingText(input: unknown): ReadingTextItem | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }

  const raw = input as Partial<ReadingTextItem> & Record<string, unknown>;
  const title = normalizeString(raw.title ?? raw.name);
  const paragraphs = normalizeParagraphs(raw.paragraphs ?? raw.content ?? raw.text ?? raw.body);
  if (!title || paragraphs.length === 0) {
    return null;
  }

  const now = nowIso();
  const topic = normalizeString(raw.topic ?? raw.category ?? raw.theme) || "Tổng hợp";
  const deckName =
    normalizeString(raw.deckName ?? raw.deck ?? raw.collection ?? raw.groupName ?? raw.group) ||
    topic ||
    DEFAULT_READING_DECK_NAME;

  return {
    id: normalizeString(raw.id) || crypto.randomUUID(),
    title,
    deckName,
    jlptLevel: normalizeLevel(raw.jlptLevel ?? raw.level ?? raw.jlpt),
    topic,
    difficulty: normalizeString(raw.difficulty ?? raw.length) || "Ngắn",
    estimatedMinutes: normalizeMinutes(raw.estimatedMinutes ?? raw.minutes ?? raw.duration),
    paragraphs,
    translation:
      normalizeString(raw.translation ?? raw.meaning ?? raw.vi) ||
      normalizeNestedString(raw.translation) ||
      normalizeNestedString(raw.meaning),
    vocabulary: mergeVocabularyItems(
      normalizeVocabularyList(raw.vocabulary ?? raw.words),
      normalizeVocabularyCoverage(raw.vocabularyCoverage)
    ),
    grammarCoverage: normalizeGrammarCoverage(raw.grammarCoverage ?? raw.grammar),
    questions: Array.isArray(raw.questions)
      ? (raw.questions as unknown[])
          .map((entry) => normalizeQuestionItem(entry))
          .filter((entry): entry is ReadingQuestionItem => Boolean(entry))
      : [],
    postReadingQuiz: normalizePostReadingQuiz(raw.postReadingQuiz ?? raw.readingQuiz, raw.questions),
    sentenceRecallPractice: normalizeSentenceRecallPractice(
      raw.sentenceRecallPractice ?? raw.recallPractice ?? raw.viToJpPractice
    ),
    createdAt: normalizeString(raw.createdAt) || now,
    updatedAt: normalizeString(raw.updatedAt) || now,
  };
}

function normalizeStore(input: unknown): ReadingPracticeStore {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { updatedAt: "", items: [] };
  }

  const raw = input as Partial<ReadingPracticeStore>;
  const items = Array.isArray(raw.items)
    ? raw.items
        .map((entry) => normalizeReadingText(entry))
        .filter((entry): entry is ReadingTextItem => Boolean(entry))
    : [];

  return {
    updatedAt: normalizeString(raw.updatedAt),
    items: items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };
}

export async function loadReadingPracticeStore(userId: string): Promise<ReadingPracticeStore> {
  try {
    const record = await prisma.appData.findUnique({
      where: { key: getStoreKey(userId) },
      select: { value: true },
    });
    return normalizeStore(record?.value);
  } catch {
    return { updatedAt: "", items: [] };
  }
}

export async function saveReadingPracticeStore(userId: string, store: ReadingPracticeStore) {
  const payload: ReadingPracticeStore = {
    updatedAt: nowIso(),
    items: store.items,
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
