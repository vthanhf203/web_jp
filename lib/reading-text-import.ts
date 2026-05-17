import {
  DEFAULT_READING_DECK_NAME,
  type ReadingGrammarCoverageItem,
  type ReadingGrammarExample,
  type ReadingPostReadingQuiz,
  type ReadingPostReadingQuizQuestion,
  type ReadingRecallCommonMistake,
  type ReadingRecallFeedbackTemplates,
  type ReadingRecallNormalizeRules,
  type ReadingRecallScoreBand,
  type ReadingRecallSlot,
  type ReadingSentenceRecallPractice,
  type ReadingSentenceRecallQuestion,
  type ReadingTextItem,
  type ReadingVocabularyItem,
} from "@/lib/reading-practice-store";

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

function normalizeOptionalNumber(value: unknown): number | undefined {
  const numeric = typeof value === "number" ? value : Number(normalizeText(value));
  return Number.isFinite(numeric) ? numeric : undefined;
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => normalizeText(entry)).filter(Boolean);
}

function normalizeStringListOrSingle(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeText(entry)).filter(Boolean);
  }
  const single = normalizeText(value);
  return single ? [single] : [];
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
      if (Array.isArray(row.sentences)) {
        const jp = row.sentences
          .map((sentence) => {
            if (typeof sentence === "string") {
              return normalizeText(sentence);
            }
            if (!sentence || typeof sentence !== "object" || Array.isArray(sentence)) {
              return "";
            }
            return pickString(sentence as Record<string, unknown>, ["jp", "ja", "text", "sentence"]);
          })
          .filter(Boolean)
          .join("");
        const vi = row.sentences
          .map((sentence) => {
            if (!sentence || typeof sentence !== "object" || Array.isArray(sentence)) {
              return "";
            }
            return pickString(sentence as Record<string, unknown>, ["vi", "vn", "translation", "meaning"]);
          })
          .filter(Boolean)
          .join(" ");
        if (jp) {
          paragraphs.push(jp);
        }
        if (vi) {
          paragraphTranslations.push(vi);
        }
        continue;
      }
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

function vocabularyFromValue(value: unknown): ReadingVocabularyItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const output: ReadingVocabularyItem[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
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
      "d?ch",
      "nghia",
      "ngh?a",
    ]);
    if (!split.word || !meaning) {
      continue;
    }
    output.push({
      word: split.word,
      reading: readingValue,
      meaning,
      hanviet: pickString(raw, ["hanviet", "hanViet", "han_viet"]),
      partOfSpeech: pickString(raw, ["partOfSpeech", "pos", "type"]),
      role: pickString(raw, ["role"]),
    });
  }
  return output;
}

function vocabularyFromCoverage(value: unknown): ReadingVocabularyItem[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }
  const raw = value as Record<string, unknown>;
  return [
    ...vocabularyFromValue(raw.coreVocabulary),
    ...vocabularyFromValue(raw.newVocabulary),
    ...vocabularyFromValue(raw.reviewVocabulary),
    ...vocabularyFromValue(raw.items),
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

function grammarExamplesFromValue(value: unknown): ReadingGrammarExample[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const output: ReadingGrammarExample[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }
    const raw = entry as Record<string, unknown>;
    const sentence = pickString(raw, ["sentence", "jp", "ja", "text", "example"]);
    if (!sentence) {
      continue;
    }
    output.push({
      paragraphIndex: normalizeOptionalNumber(raw.paragraphIndex),
      sentenceRef: pickString(raw, ["sentenceRef", "ref"]),
      sentence,
      vi: pickString(raw, ["vi", "vn", "translation", "meaning"]),
    });
  }
  return output;
}

function grammarCoverageFromValue(value: unknown): ReadingGrammarCoverageItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const output: ReadingGrammarCoverageItem[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }
    const raw = entry as Record<string, unknown>;
    const pattern = pickString(raw, ["pattern", "name", "title", "grammar"]);
    if (!pattern) {
      continue;
    }
    output.push({
      pattern,
      meaning: pickString(raw, ["meaning", "vi", "vn", "translation", "explanation"]),
      level: pickString(raw, ["level", "jlptLevel"]),
      source: pickString(raw, ["source"]),
      role: pickString(raw, ["role"]),
      frequency: normalizeOptionalNumber(raw.frequency),
      examples: grammarExamplesFromValue(raw.examples),
    });
  }
  return output;
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

function normalizeBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  const text = normalizeText(value).toLowerCase();
  if (["true", "1", "yes", "y", "dung", "đúng"].includes(text)) {
    return true;
  }
  if (["false", "0", "no", "n", "sai"].includes(text)) {
    return false;
  }
  return fallback;
}

function postQuizQuestionFromValue(value: unknown, index: number): ReadingPostReadingQuizQuestion | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const prompt = pickString(raw, ["prompt", "question", "q", "cauHoi", "câuHỏi"]);
  const correctRaw = raw.correctAnswer ?? raw.answer ?? raw.correct ?? raw.a;
  if (!prompt || typeof correctRaw === "undefined") {
    return null;
  }
  const type = pickString(raw, ["type"]) || "multipleChoice";
  const isTrueFalse = type.toLowerCase().includes("truefalse") || typeof correctRaw === "boolean";
  const correctAnswer = isTrueFalse ? normalizeBoolean(correctRaw) : normalizeText(correctRaw);
  const options = Array.isArray(raw.options)
    ? raw.options.map((option) => normalizeText(option)).filter(Boolean)
    : isTrueFalse
      ? ["true", "false"]
      : [];

  return {
    id: pickString(raw, ["id"]) || `q-${index + 1}`,
    type,
    skill: pickString(raw, ["skill"]),
    difficulty: pickString(raw, ["difficulty"]),
    points: normalizeOptionalNumber(raw.points) ?? 1,
    prompt,
    options,
    correctAnswer,
    explanation: pickString(raw, ["explanation", "explain", "reason"]),
    paragraphRef: normalizeOptionalNumber(raw.paragraphRef ?? raw.paragraphIndex),
    sentenceRef: pickString(raw, ["sentenceRef", "ref"]),
    grammarPattern: pickString(raw, ["grammarPattern"]),
    targetWord: pickString(raw, ["targetWord"]),
  };
}

function postQuizFromValue(value: unknown): ReadingPostReadingQuiz | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  const questions = Array.isArray(raw.questions)
    ? raw.questions
        .map((entry, index) => postQuizQuestionFromValue(entry, index))
        .filter((entry): entry is ReadingPostReadingQuizQuestion => Boolean(entry))
    : [];
  if (questions.length === 0) {
    return undefined;
  }
  const questionTypes = Array.isArray(raw.questionTypes)
    ? raw.questionTypes.map((entry) => normalizeText(entry)).filter(Boolean)
    : [];
  return {
    mode: pickString(raw, ["mode"]) || "afterReading",
    showAnswerImmediately: normalizeBoolean(raw.showAnswerImmediately, false),
    shuffleQuestions: normalizeBoolean(raw.shuffleQuestions, false),
    shuffleOptions: normalizeBoolean(raw.shuffleOptions, false),
    passingScore: normalizeOptionalNumber(raw.passingScore) ?? 70,
    totalQuestions: normalizeOptionalNumber(raw.totalQuestions),
    questionTypes:
      questionTypes.length > 0 ? questionTypes : Array.from(new Set(questions.map((question) => question.type))),
    questions,
  };
}

function recallSlotFromValue(value: unknown, index: number): ReadingRecallSlot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const slot = pickString(raw, ["slot", "id", "name"]) || `slot-${index + 1}`;
  return {
    slot,
    label: pickString(raw, ["label", "title", "name"]) || slot,
    weight: normalizeOptionalNumber(raw.weight),
    accepted: normalizeStringListOrSingle(raw.accepted ?? raw.answers ?? raw.values),
    acceptedPattern: pickString(raw, ["acceptedPattern", "pattern"]),
    type: pickString(raw, ["type"]),
    note: pickString(raw, ["note"]),
  };
}

function recallSlotsFromValue(value: unknown): ReadingRecallSlot[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry, index) => recallSlotFromValue(entry, index))
    .filter((entry): entry is ReadingRecallSlot => Boolean(entry));
}

function recallCommonMistakeFromValue(value: unknown): ReadingRecallCommonMistake | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const pattern = pickString(raw, ["pattern", "value", "match"]);
  const message = pickString(raw, ["message", "feedback", "explanation"]);
  if (!pattern || !message) {
    return null;
  }
  return {
    pattern,
    mistakeType: pickString(raw, ["mistakeType", "type"]),
    message,
  };
}

function recallCommonMistakesFromValue(value: unknown): ReadingRecallCommonMistake[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => recallCommonMistakeFromValue(entry))
    .filter((entry): entry is ReadingRecallCommonMistake => Boolean(entry));
}

function recallFeedbackTemplatesFromValue(value: unknown): ReadingRecallFeedbackTemplates {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const output: ReadingRecallFeedbackTemplates = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const text = normalizeText(raw);
    if (key && text) {
      output[key] = text;
    }
  }
  return output;
}

function recallNormalizeRulesFromValue(value: unknown): ReadingRecallNormalizeRules | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  return {
    ignoreSpaces: normalizeBoolean(raw.ignoreSpaces, true),
    ignorePunctuation: normalizeBoolean(raw.ignorePunctuation, true),
    normalizeFullWidthNumbers: normalizeBoolean(raw.normalizeFullWidthNumbers, true),
    ignoreKanjiHiraganaDifference: normalizeBoolean(raw.ignoreKanjiHiraganaDifference, true),
    allowOptionalSubject: normalizeBoolean(raw.allowOptionalSubject, true),
    caseSensitive: normalizeBoolean(raw.caseSensitive, false),
  };
}

function recallScoreBandFromValue(value: unknown, key: string): ReadingRecallScoreBand | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const min = normalizeOptionalNumber(raw.min);
  if (typeof min === "undefined") {
    return null;
  }
  return {
    min,
    label: pickString(raw, ["label"]) || key,
    message: pickString(raw, ["message"]),
  };
}

function recallScoreBandsFromValue(value: unknown): Record<string, ReadingRecallScoreBand> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const output: Record<string, ReadingRecallScoreBand> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const band = recallScoreBandFromValue(raw, key);
    if (band) {
      output[key] = band;
    }
  }
  return Object.keys(output).length > 0 ? output : undefined;
}

function sentenceRecallQuestionFromValue(value: unknown, index: number): ReadingSentenceRecallQuestion | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const viPrompt = pickString(raw, ["viPrompt", "prompt", "vi", "question"]);
  const modelAnswer = pickString(raw, ["modelAnswer", "answer", "jp", "ja"]);
  if (!viPrompt || !modelAnswer) {
    return null;
  }
  return {
    id: pickString(raw, ["id"]) || `sr-${index + 1}`,
    sourceSentenceRef: pickString(raw, ["sourceSentenceRef", "sentenceRef", "ref"]),
    difficulty: pickString(raw, ["difficulty"]),
    skill: pickString(raw, ["skill"]),
    viPrompt,
    modelAnswer,
    modelAnswerPlain: pickString(raw, ["modelAnswerPlain", "plainAnswer"]) || modelAnswer,
    acceptableAnswers: normalizeStringList(raw.acceptableAnswers),
    targetGrammar: normalizeStringList(raw.targetGrammar),
    targetVocabulary: normalizeStringList(raw.targetVocabulary),
    hints: normalizeStringList(raw.hints),
    explanation: pickString(raw, ["explanation", "explain", "reason"]),
    points: normalizeOptionalNumber(raw.points) ?? 1,
    gradingMode: pickString(raw, ["gradingMode"]),
    passingScore: normalizeOptionalNumber(raw.passingScore),
    autoAcceptWhenRequiredSlotsMatch: normalizeBoolean(raw.autoAcceptWhenRequiredSlotsMatch, false),
    requiredSlots: recallSlotsFromValue(raw.requiredSlots),
    optionalSlots: recallSlotsFromValue(raw.optionalSlots),
    minorDifferencesToIgnore: normalizeStringList(raw.minorDifferencesToIgnore),
    commonMistakes: recallCommonMistakesFromValue(raw.commonMistakes),
    feedbackTemplates: recallFeedbackTemplatesFromValue(raw.feedbackTemplates),
  };
}

function sentenceRecallPracticeFromValue(value: unknown): ReadingSentenceRecallPractice | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  const questions = Array.isArray(raw.questions)
    ? raw.questions
        .map((entry, index) => sentenceRecallQuestionFromValue(entry, index))
        .filter((entry): entry is ReadingSentenceRecallQuestion => Boolean(entry))
    : [];
  if (questions.length === 0) {
    return undefined;
  }
  return {
    mode: pickString(raw, ["mode"]) || "viToJp",
    title: pickString(raw, ["title"]) || "Luyện nhớ câu Việt -> Nhật",
    description: pickString(raw, ["description"]),
    showAfter: pickString(raw, ["showAfter"]),
    shuffleQuestions: normalizeBoolean(raw.shuffleQuestions, false),
    showHints: normalizeBoolean(raw.showHints, true),
    showAnswerAfterSubmit: normalizeBoolean(raw.showAnswerAfterSubmit, true),
    gradingMode: pickString(raw, ["gradingMode", "defaultGradingMode"]) || "semiFlexible",
    defaultGradingMode: pickString(raw, ["defaultGradingMode", "gradingMode"]),
    globalNormalizeRules: recallNormalizeRulesFromValue(raw.globalNormalizeRules),
    scoreBands: recallScoreBandsFromValue(raw.scoreBands),
    totalQuestions: normalizeOptionalNumber(raw.totalQuestions),
    questions,
  };
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

  const topic =
    pickString(source, ["topic", "category", "theme", "chuDe", "chủĐề"]) || "Tổng hợp";
  const deckName =
    pickString(source, [
      "deckName",
      "deck",
      "collection",
      "groupName",
      "group",
      "categoryName",
      "topicName",
    ]) ||
    topic ||
    DEFAULT_READING_DECK_NAME;

  return {
    id: pickString(source, ["id"]),
    title,
    deckName,
    jlptLevel: normalizeLevel(source.jlptLevel ?? source.level ?? source.jlpt),
    topic,
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
    vocabulary: mergeVocabularyItems(
      vocabularyFromValue(source.vocabulary ?? source.words ?? source.vocab),
      vocabularyFromCoverage(source.vocabularyCoverage)
    ),
    grammarCoverage: grammarCoverageFromValue(
      source.grammarCoverage ?? source.grammar ?? source.grammarPoints
    ),
    questions: questionsFromValue(source.questions ?? source.quiz),
    postReadingQuiz: postQuizFromValue(source.postReadingQuiz ?? source.readingQuiz),
    sentenceRecallPractice: sentenceRecallPracticeFromValue(
      source.sentenceRecallPractice ?? source.recallPractice ?? source.viToJpPractice
    ),
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
