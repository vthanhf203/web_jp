import "server-only";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type {
  VocabularyExamQuestion,
  VocabularyExamSection,
  VocabularyExamStore,
  VocabularyExamTest,
} from "@/lib/vocabulary-exam-types";

function storeKey(userId: string): string {
  return `user_vocabulary_exam_store:${userId}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function text(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return "";
}

function positiveNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(text(value), 10);
  return Number.isFinite(parsed) ? Math.max(1, Math.round(parsed)) : fallback;
}

function stringList(value: unknown, limit = 50): string[] {
  return Array.isArray(value) ? value.map(text).filter(Boolean).slice(0, limit) : [];
}

function normalizeChoice(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") {
    return text(value);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "";
  }
  const raw = value as { label?: unknown; text?: unknown; value?: unknown };
  return text(raw.label) || text(raw.text) || text(raw.value);
}

function normalizeChoiceExplanations(value: unknown): Partial<Record<string, string>> {
  if (Array.isArray(value)) {
    return Object.fromEntries(
      value
        .map((entry) => {
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            return ["", ""] as const;
          }
          const raw = entry as { choice?: unknown; explanation?: unknown };
          return [text(raw.choice), text(raw.explanation)] as const;
        })
        .filter(([choice, explanation]) => choice && explanation)
    );
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, explanation]) => [key.trim(), text(explanation)] as const)
      .filter(([key, explanation]) => key && explanation)
  );
}

function normalizeQuestion(value: unknown, fallbackNumber: number, fallbackLesson: string): VocabularyExamQuestion | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const raw = value as {
    id?: unknown;
    number?: unknown;
    type?: unknown;
    targetWord?: unknown;
    sourceLesson?: unknown;
    difficulty?: unknown;
    prompt?: unknown;
    choices?: unknown;
    options?: unknown;
    correctAnswer?: unknown;
    answer?: unknown;
    explanation?: unknown;
    choiceExplanations?: unknown;
  };
  const prompt = text(raw.prompt);
  const choicesSource = Array.isArray(raw.choices) ? raw.choices : Array.isArray(raw.options) ? raw.options : [];
  const choices = choicesSource.map(normalizeChoice).filter(Boolean).slice(0, 12);
  const correctAnswer = text(raw.correctAnswer) || text(raw.answer);

  if (!prompt || choices.length < 2 || !correctAnswer || !choices.includes(correctAnswer)) {
    return null;
  }

  return {
    id: text(raw.id) || crypto.randomUUID(),
    number: positiveNumber(raw.number, fallbackNumber),
    type: text(raw.type) || "vocabularyContext",
    targetWord: text(raw.targetWord) || undefined,
    sourceLesson: text(raw.sourceLesson) || fallbackLesson,
    difficulty: text(raw.difficulty) || "normal",
    prompt,
    choices,
    correctAnswer,
    explanation: text(raw.explanation),
    choiceExplanations: normalizeChoiceExplanations(raw.choiceExplanations),
  };
}

function normalizeSection(value: unknown, index: number, numberOffset: number): VocabularyExamSection | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const raw = value as {
    id?: unknown;
    title?: unknown;
    kind?: unknown;
    description?: unknown;
    questions?: unknown;
  };
  const title = text(raw.title) || `Phần ${index + 1}`;
  const questions = (Array.isArray(raw.questions) ? raw.questions : [])
    .map((question, questionIndex) => normalizeQuestion(question, numberOffset + questionIndex + 1, title))
    .filter((question): question is VocabularyExamQuestion => Boolean(question))
    .slice(0, 500);

  if (questions.length === 0) {
    return null;
  }

  return {
    id: text(raw.id) || `vocabulary-${index + 1}`,
    title,
    kind: text(raw.kind) || "vocabulary",
    description: text(raw.description),
    questions,
  };
}

function normalizeTest(value: unknown): VocabularyExamTest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const raw = value as {
    id?: unknown;
    title?: unknown;
    level?: unknown;
    minutes?: unknown;
    tags?: unknown;
    questionMode?: unknown;
    sourceLessons?: unknown;
    furiganaPolicy?: unknown;
    sections?: unknown;
    questions?: unknown;
    createdAt?: unknown;
    updatedAt?: unknown;
  };
  const title = text(raw.title);
  if (!title) {
    return null;
  }

  const sectionSources = Array.isArray(raw.sections)
    ? raw.sections
    : Array.isArray(raw.questions)
      ? [{ id: "vocabulary-mcq", title: "Trắc nghiệm từ vựng", kind: "vocabulary", questions: raw.questions }]
      : [];
  let numberOffset = 0;
  const sections = sectionSources
    .map((section, index) => {
      const normalized = normalizeSection(section, index, numberOffset);
      numberOffset += normalized?.questions.length ?? 0;
      return normalized;
    })
    .filter((section): section is VocabularyExamSection => Boolean(section));

  if (sections.length === 0) {
    return null;
  }

  const lessonFallback = Array.from(
    new Set(sections.flatMap((section) => section.questions.map((question) => question.sourceLesson)))
  );
  const rawPolicy =
    raw.furiganaPolicy && typeof raw.furiganaPolicy === "object" && !Array.isArray(raw.furiganaPolicy)
      ? (raw.furiganaPolicy as { prompt?: unknown; choices?: unknown; explanation?: unknown })
      : null;
  const now = nowIso();

  return {
    id: text(raw.id) || crypto.randomUUID(),
    title,
    level: text(raw.level) || "N4",
    minutes: positiveNumber(raw.minutes, 30),
    tags: stringList(raw.tags, 20),
    questionMode: text(raw.questionMode) || "multipleChoiceOnly",
    sourceLessons: stringList(raw.sourceLessons).length > 0 ? stringList(raw.sourceLessons) : lessonFallback,
    furiganaPolicy: rawPolicy
      ? {
          prompt: text(rawPolicy.prompt) || undefined,
          choices: text(rawPolicy.choices) || undefined,
          explanation: text(rawPolicy.explanation) || undefined,
        }
      : undefined,
    sections,
    createdAt: text(raw.createdAt) || now,
    updatedAt: text(raw.updatedAt) || now,
  };
}

function normalizeStore(value: unknown): VocabularyExamStore {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { updatedAt: "", tests: [] };
  }
  const raw = value as { updatedAt?: unknown; tests?: unknown };
  const tests = (Array.isArray(raw.tests) ? raw.tests : [])
    .map(normalizeTest)
    .filter((test): test is VocabularyExamTest => Boolean(test))
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  return { updatedAt: text(raw.updatedAt), tests };
}

export function parseVocabularyExamInput(rawInput: string): VocabularyExamTest[] {
  const parsed = JSON.parse(rawInput) as unknown;
  const rows = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { tests?: unknown }).tests)
      ? (parsed as { tests: unknown[] }).tests
      : [parsed];
  return rows.map(normalizeTest).filter((test): test is VocabularyExamTest => Boolean(test));
}

export async function loadVocabularyExamStore(userId: string): Promise<VocabularyExamStore> {
  try {
    const record = await prisma.appData.findUnique({
      where: { key: storeKey(userId) },
      select: { value: true },
    });
    return normalizeStore(record?.value);
  } catch {
    return { updatedAt: "", tests: [] };
  }
}

export async function saveVocabularyExamStore(userId: string, store: VocabularyExamStore) {
  const payload: VocabularyExamStore = { updatedAt: nowIso(), tests: store.tests };
  await prisma.appData.upsert({
    where: { key: storeKey(userId) },
    create: { key: storeKey(userId), value: payload as unknown as Prisma.InputJsonValue },
    update: { value: payload as unknown as Prisma.InputJsonValue },
  });
}
