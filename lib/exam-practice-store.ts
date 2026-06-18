import "server-only";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type {
  ExamPracticeChoice,
  ExamPracticeQuestion,
  ExamPracticeSection,
  ExamPracticeSectionKind,
  ExamPracticeStore,
  ExamPracticeTest,
} from "@/lib/exam-practice-types";

const SECTION_KIND_FALLBACKS: ExamPracticeSectionKind[] = ["grammar", "reading", "kanji", "sentence"];

function getStoreKey(userId: string): string {
  return `user_exam_practice_store:${userId}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeString(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return "";
}

function normalizeNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(1, Math.round(value));
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return Math.max(1, parsed);
    }
  }
  return fallback;
}

function normalizeTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeString(item)).filter(Boolean).slice(0, 12);
  }
  const raw = normalizeString(value);
  return raw ? raw.split(/[,\n/]+/).map((item) => item.trim()).filter(Boolean).slice(0, 12) : [];
}

function normalizeChoice(value: unknown, index: number): ExamPracticeChoice | null {
  if (typeof value === "string") {
    return { id: String(index + 1), label: value };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const raw = value as Partial<ExamPracticeChoice> & { text?: unknown; value?: unknown; meaning?: unknown };
  const marker = normalizeString(raw.label);
  const text = normalizeString(raw.text) || normalizeString(raw.value);
  const label = text || marker;
  if (!label) {
    return null;
  }

  return {
    id: normalizeString(raw.id) || (text && marker ? marker : String(index + 1)),
    label,
    sub: normalizeString(raw.sub) || normalizeString(raw.meaning) || undefined,
  };
}

function normalizeTokenEntry(value: unknown, index: number): { id: string; text: string } | null {
  if (typeof value === "string") {
    const text = normalizeString(value);
    return text ? { id: String(index + 1), text } : null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const raw = value as { id?: unknown; index?: unknown; label?: unknown; text?: unknown; value?: unknown };
  const text = normalizeString(raw.text) || normalizeString(raw.value) || normalizeString(raw.label);
  if (!text) {
    return null;
  }

  return {
    id:
      normalizeString(raw.id) ||
      normalizeString(raw.label) ||
      (typeof raw.index === "number" && Number.isFinite(raw.index) ? String(raw.index) : normalizeString(raw.index)) ||
      String(index + 1),
    text,
  };
}

function normalizePassageText(value: unknown): string {
  if (typeof value === "string") {
    return normalizeString(value);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "";
  }

  const raw = value as {
    jp?: unknown;
    jpDisplay?: unknown;
    jpRaw?: unknown;
    paragraphs?: unknown;
    passage?: unknown;
    tableData?: unknown;
    text?: unknown;
  };

  if (Array.isArray(raw.paragraphs)) {
    return raw.paragraphs
      .map((paragraph) => {
        if (typeof paragraph === "string") {
          return normalizeString(paragraph);
        }
        if (!paragraph || typeof paragraph !== "object" || Array.isArray(paragraph)) {
          return "";
        }

        const row = paragraph as { jp?: unknown; jpDisplay?: unknown; jpRaw?: unknown; text?: unknown };
        return (
          normalizeString(row.jpDisplay) ||
          normalizeString(row.jp) ||
          normalizeString(row.jpRaw) ||
          normalizeString(row.text)
        );
      })
      .filter(Boolean)
      .join("\n\n");
  }

  const mainText =
    normalizeString(raw.jpDisplay) ||
    normalizeString(raw.jp) ||
    normalizeString(raw.jpRaw) ||
    normalizeString(raw.passage) ||
    normalizeString(raw.text);

  if (!raw.tableData || typeof raw.tableData !== "object" || Array.isArray(raw.tableData)) {
    return mainText;
  }

  const table = raw.tableData as { headers?: unknown; rows?: unknown };
  const headers = Array.isArray(table.headers) ? table.headers.map((item) => normalizeString(item)).filter(Boolean) : [];
  const rows = Array.isArray(table.rows)
    ? table.rows
        .map((row) =>
          Array.isArray(row)
            ? row.map((cell) => normalizeString(cell)).filter(Boolean).join(" | ")
            : normalizeString(row)
        )
        .filter(Boolean)
    : [];
  const tableText = [headers.length > 0 ? headers.join(" | ") : "", ...rows].filter(Boolean).join("\n");
  return [mainText, tableText].filter(Boolean).join("\n\n");
}

function normalizeInstruction(...values: unknown[]): string {
  return values.map((value) => normalizeString(value)).filter(Boolean).join("\n");
}

function normalizeOrderChoice(value: unknown, chunks: { id: string; text: string }[], index: number): ExamPracticeChoice | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const raw = value as { label?: unknown; order?: unknown };
  const order = Array.isArray(raw.order) ? raw.order.map((item) => normalizeString(item)).filter(Boolean) : [];
  if (order.length === 0) {
    return null;
  }

  const label = normalizeString(raw.label) || String.fromCharCode(65 + index);
  const orderedText = order
    .map((item) => chunks.find((chunk) => chunk.id === item || chunk.text === item)?.text || item)
    .join(" / ");

  return {
    id: label,
    label: order.join(" -> "),
    sub: orderedText || undefined,
  };
}

function normalizeQuestion(
  value: unknown,
  fallbackNumber: number,
  context: { instruction?: string; passage?: string } = {}
): ExamPracticeQuestion | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const raw = value as Partial<ExamPracticeQuestion> & {
    answer?: unknown;
    blankNumber?: unknown;
    correct?: unknown;
    correctChoice?: unknown;
    correctChoiceLabel?: unknown;
    correctOrder?: unknown;
    explanationVi?: unknown;
    fullSentence?: unknown;
    instructionJa?: unknown;
    instructionJp?: unknown;
    instructionVi?: unknown;
    meaning?: unknown;
    modelAnswer?: unknown;
    modelAnswerDisplay?: unknown;
    modelAnswerRaw?: unknown;
    options?: unknown;
    orderChoices?: unknown;
    promptDisplay?: unknown;
    promptRaw?: unknown;
    promptVi?: unknown;
    sentenceDisplay?: unknown;
    sentenceRaw?: unknown;
    target?: unknown;
    targetText?: unknown;
    text?: unknown;
    vi?: unknown;
    viTranslation?: unknown;
    chunks?: unknown;
    fixedTextBefore?: unknown;
  };

  const type = normalizeString(raw.type) || "multipleChoice";
  const sentence = normalizeString(raw.sentenceDisplay) || normalizeString(raw.sentenceRaw);
  const chunkEntries = Array.isArray(raw.chunks)
    ? raw.chunks
        .map((chunk, index) => normalizeTokenEntry(chunk, index))
        .filter((chunk): chunk is { id: string; text: string } => Boolean(chunk))
    : [];
  const chunkPrompt = chunkEntries.length
    ? `${normalizeString(raw.fixedTextBefore)} ${chunkEntries
        .map((chunk) => `${chunk.id}. ${chunk.text}`)
        .join("　")}`.trim()
    : "";
  const basePrompt =
    normalizeString(raw.promptDisplay) ||
    normalizeString(raw.prompt) ||
    normalizeString(raw.promptRaw) ||
    normalizeString(raw.text);
  const isSentenceOrder = type.toLowerCase().includes("sentence");
  const promptParts = [
    isSentenceOrder && chunkPrompt ? `【 ${chunkPrompt} 】` : basePrompt,
    !isSentenceOrder && sentence && sentence !== basePrompt ? sentence : "",
  ].filter(Boolean);
  const prompt =
    promptParts.join("\n") ||
    (typeof raw.blankNumber !== "undefined" ? `（${normalizeString(raw.blankNumber)}）` : "") ||
    (isSentenceOrder ? "下の語句を正しい順番に並べてください。" : sentence) ||
    normalizeString(raw.instructionJp) ||
    normalizeString(raw.instructionJa) ||
    normalizeString(raw.instruction);
  if (!prompt) {
    return null;
  }

  const tokenEntries = Array.isArray(raw.tokens)
    ? raw.tokens
        .map((token, index) => normalizeTokenEntry(token, index))
        .filter((token): token is { id: string; text: string } => Boolean(token))
    : [];
  const effectiveTokenEntries = tokenEntries.length > 0 ? tokenEntries : chunkEntries;
  const choicesSource = Array.isArray(raw.choices)
    ? raw.choices
    : Array.isArray(raw.options)
      ? raw.options
      : [];
  const directChoices = choicesSource
    .map((choice, index) => normalizeChoice(choice, index))
    .filter((choice): choice is ExamPracticeChoice => Boolean(choice));
  const orderChoices = Array.isArray(raw.orderChoices)
    ? raw.orderChoices
        .map((choice, index) => normalizeOrderChoice(choice, effectiveTokenEntries, index))
        .filter((choice): choice is ExamPracticeChoice => Boolean(choice))
    : [];
  const choices = directChoices.length > 0 ? directChoices : orderChoices;
  const tokens = tokenEntries.length > 0 || orderChoices.length > 0 ? tokenEntries.map((token) => token.text) : chunkEntries.map((chunk) => chunk.text);
  const answerSlots = normalizeNumber(raw.answerSlots, 0);
  const correctChoice = normalizeString(raw.correctChoice) || normalizeString(raw.correctChoiceLabel);
  const correctChoiceAnswer = correctChoice
    ? choices.find((choice) => choice.id === correctChoice || choice.label === correctChoice)?.label || correctChoice
    : "";
  const correctOrder = Array.isArray(raw.correctOrder)
    ? raw.correctOrder.map((item) => normalizeString(item)).filter(Boolean)
    : [];
  const orderedAnswer =
    correctOrder.length > 0
      ? correctOrder
          .map((item) => effectiveTokenEntries.find((token) => token.id === item || token.text === item)?.text || item)
          .join(" ")
      : "";
  const orderChoiceAnswer = orderChoices.length > 0 ? correctChoiceAnswer : "";
  const modelAnswer =
    normalizeString(raw.modelAnswerDisplay) ||
    normalizeString(raw.modelAnswerRaw) ||
    normalizeString(raw.modelAnswer);
  const fullSentence = normalizeString(raw.fullSentence);
  const explanation = [
    normalizeString(raw.explanation) || normalizeString(raw.explanationVi),
    fullSentence ? `Câu đầy đủ: ${fullSentence}` : "",
    modelAnswer ? `Đáp án mẫu: ${modelAnswer}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    id: normalizeString(raw.id) || crypto.randomUUID(),
    number: normalizeNumber(raw.number, fallbackNumber),
    type,
    prompt,
    instruction:
      normalizeInstruction(raw.instruction, raw.instructionJa, raw.instructionJp, raw.instructionVi) ||
      context.instruction ||
      undefined,
    target: normalizeString(raw.target) || normalizeString(raw.targetText) || undefined,
    viPrompt:
      normalizeString(raw.viPrompt) ||
      normalizeString(raw.promptVi) ||
      normalizeString(raw.vi) ||
      normalizeString(raw.viTranslation) ||
      normalizeString(raw.meaning) ||
      undefined,
    passage: normalizeString(raw.passage) || context.passage || undefined,
    choices: choices.length > 0 ? choices : undefined,
    tokens: tokens.length > 0 ? tokens : undefined,
    answerSlots: answerSlots > 0 ? answerSlots : undefined,
    correctAnswer:
      orderChoiceAnswer ||
      orderedAnswer ||
      normalizeString(raw.correctAnswer) ||
      normalizeString(raw.answer) ||
      normalizeString(raw.correct) ||
      correctChoiceAnswer ||
      undefined,
    explanation: explanation || undefined,
  };
}

function normalizeSectionKind(value: unknown, index: number): ExamPracticeSectionKind {
  const raw = normalizeString(value).toLowerCase();
  if (raw === "grammarvocabulary" || raw.includes("grammar") || raw.includes("vocabulary")) {
    return "grammar";
  }
  if (raw === "sentenceordering" || raw.includes("sentence")) {
    return "sentence";
  }
  if (raw.includes("kanji")) {
    return "kanji";
  }
  if (raw === "grammar" || raw.includes("văn") || raw.includes("文法") || raw.includes("語彙")) {
    return "grammar";
  }
  if (raw === "reading" || raw.includes("đọc") || raw.includes("読解")) {
    return "reading";
  }
  if (raw === "kanji" || raw.includes("漢字")) {
    return "kanji";
  }
  if (raw === "sentence" || raw.includes("câu") || raw.includes("短文")) {
    return "sentence";
  }
  return SECTION_KIND_FALLBACKS[index] ?? "grammar";
}

function sectionLabel(kind: ExamPracticeSectionKind): string {
  if (kind === "grammar") {
    return "文法・語彙問題";
  }
  if (kind === "reading") {
    return "読解問題";
  }
  if (kind === "kanji") {
    return "漢字問題";
  }
  return "短文作成問題";
}

function normalizeSection(value: unknown, index: number, numberOffset: number): ExamPracticeSection | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const raw = value as Partial<ExamPracticeSection> & {
    groups?: unknown;
    instruction?: unknown;
    instructionJa?: unknown;
    instructionJp?: unknown;
    instructionVi?: unknown;
    materials?: unknown;
    name?: unknown;
    problemGroups?: unknown;
    passages?: unknown;
    passage?: unknown;
    titleJa?: unknown;
  };
  const sectionInstruction = normalizeInstruction(
    raw.instruction,
    raw.instructionJa,
    raw.instructionJp,
    raw.instructionVi
  );
  const directQuestions = Array.isArray(raw.questions)
    ? raw.questions.map((question) => ({ instruction: sectionInstruction, passage: "", question }))
    : [];
  const sectionGroups = Array.isArray(raw.groups)
    ? raw.groups
    : Array.isArray(raw.problemGroups)
      ? raw.problemGroups
      : [];
  const groupQuestions = sectionGroups.flatMap((group) => {
        if (!group || typeof group !== "object" || Array.isArray(group)) {
          return [];
        }

        const row = group as {
          instruction?: unknown;
          instructionJa?: unknown;
          instructionJp?: unknown;
          instructionVi?: unknown;
          materials?: unknown;
          passage?: unknown;
          passages?: unknown;
          questions?: unknown;
        };
        const instruction = normalizeInstruction(
          row.instruction,
          row.instructionJa,
          row.instructionJp,
          row.instructionVi
        ) || sectionInstruction;
        const groupPassage = normalizePassageText(row.passage);
        const questions = Array.isArray(row.questions) ? row.questions : [];
        const directGroupQuestions = questions.map((question) => ({ instruction, passage: groupPassage, question }));
        const nestedPassages = [
          ...(Array.isArray(row.passages) ? row.passages : []),
          ...(Array.isArray(row.materials) ? row.materials : []),
        ];
        const nestedPassageQuestions = nestedPassages.flatMap((passage) => {
          if (!passage || typeof passage !== "object" || Array.isArray(passage)) {
            return [];
          }

          const passageText = normalizePassageText(passage);
          const passageQuestions = Array.isArray((passage as { questions?: unknown }).questions)
            ? (passage as { questions: unknown[] }).questions
            : [];
          return passageQuestions.map((question) => ({ instruction, passage: passageText, question }));
        });
        return [...directGroupQuestions, ...nestedPassageQuestions];
      });
  const sectionPassageSources = [
    ...(Array.isArray(raw.passages) ? raw.passages : []),
    ...(Array.isArray(raw.materials) ? raw.materials : []),
  ];
  const passageQuestions = sectionPassageSources.flatMap((passage) => {
        if (!passage || typeof passage !== "object" || Array.isArray(passage)) {
          return [];
        }

        const passageText = normalizePassageText(passage);
        const questions = Array.isArray((passage as { questions?: unknown }).questions)
          ? (passage as { questions: unknown[] }).questions
          : [];
        return questions.map((question) => ({ instruction: sectionInstruction, passage: passageText, question }));
      });
  const questionsSource = [...directQuestions, ...groupQuestions, ...passageQuestions];
  const kind = normalizeSectionKind(raw.kind || raw.id || raw.title || raw.label || raw.name, index);
  const questions = questionsSource
    .map((item, questionIndex) =>
      normalizeQuestion(item.question, numberOffset + questionIndex + 1, {
        instruction: item.instruction || undefined,
        passage: item.passage || undefined,
      })
    )
    .filter((question): question is ExamPracticeQuestion => Boolean(question))
    .map((question, questionIndex) => ({
      ...question,
      number: question.number || numberOffset + questionIndex + 1,
    }));

  if (questions.length === 0) {
    return null;
  }

  return {
    id: normalizeString(raw.id) || kind,
    title: normalizeString(raw.title) || normalizeString(raw.label) || normalizeString(raw.titleJa) || sectionLabel(kind),
    label: normalizeString(raw.label) || normalizeString(raw.titleJa) || sectionLabel(kind),
    kind,
    questions,
  };
}

function normalizeTest(value: unknown): ExamPracticeTest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const raw = value as Partial<ExamPracticeTest> & { deckName?: unknown; estimatedMinutes?: unknown };
  const title = normalizeString(raw.title) || normalizeString(raw.deckName);
  if (!title) {
    return null;
  }

  const sectionSources = Array.isArray(raw.sections) ? raw.sections : [];
  let numberOffset = 0;
  const sections = sectionSources
    .map((section, index) => {
      const normalized = normalizeSection(section, index, numberOffset);
      numberOffset += normalized?.questions.length ?? 0;
      return normalized;
    })
    .filter((section): section is ExamPracticeSection => Boolean(section));

  if (sections.length === 0 && Array.isArray((raw as { questions?: unknown }).questions)) {
    const fallbackSection = normalizeSection(
      {
        id: "grammar",
        title: "文法・語彙問題",
        kind: "grammar",
        questions: (raw as { questions?: unknown }).questions,
      },
      0,
      0
    );
    if (fallbackSection) {
      sections.push(fallbackSection);
    }
  }

  if (sections.length === 0) {
    return null;
  }

  const now = nowIso();

  return {
    id: normalizeString(raw.id) || crypto.randomUUID(),
    title,
    level: normalizeString(raw.level) || "N5-N4",
    minutes: normalizeNumber(raw.minutes ?? raw.estimatedMinutes, 45),
    tags: normalizeTags(raw.tags),
    status: raw.status === "done" || raw.status === "review" || raw.status === "new" ? raw.status : "new",
    lastScore: typeof raw.lastScore === "number" ? raw.lastScore : undefined,
    sections,
    createdAt: normalizeString(raw.createdAt) || now,
    updatedAt: normalizeString(raw.updatedAt) || now,
  };
}

function normalizeStore(value: unknown): ExamPracticeStore {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { updatedAt: "", tests: [] };
  }

  const raw = value as Partial<ExamPracticeStore>;
  const tests = Array.isArray(raw.tests)
    ? raw.tests.map((test) => normalizeTest(test)).filter((test): test is ExamPracticeTest => Boolean(test))
    : [];

  return {
    updatedAt: normalizeString(raw.updatedAt),
    tests: tests.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };
}

export function parseExamPracticeInput(rawInput: string): ExamPracticeTest[] {
  const parsed = JSON.parse(rawInput) as unknown;
  const rows = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { tests?: unknown }).tests)
      ? (parsed as { tests: unknown[] }).tests
      : [parsed];

  return rows.map((row) => normalizeTest(row)).filter((test): test is ExamPracticeTest => Boolean(test));
}

export async function loadExamPracticeStore(userId: string): Promise<ExamPracticeStore> {
  try {
    const record = await prisma.appData.findUnique({
      where: { key: getStoreKey(userId) },
      select: { value: true },
    });
    return normalizeStore(record?.value);
  } catch {
    return { updatedAt: "", tests: [] };
  }
}

export async function saveExamPracticeStore(userId: string, store: ExamPracticeStore) {
  const payload: ExamPracticeStore = {
    updatedAt: nowIso(),
    tests: store.tests,
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
