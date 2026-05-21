import "server-only";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type ListeningQuestion = {
  id: string;
  type: string;
  questionType?: string;
  level?: number;
  examDisplayMode?: string;
  promptRaw?: string;
  prompt: string;
  examAudioRaw?: string;
  examAudio?: string;
  options: string[];
  optionLabels?: string[];
  audioChoiceLabels?: string[];
  correctAnswer: string | boolean;
  correctOptionLabel?: string;
  correctAudioChoiceLabel?: string;
  explanation?: string;
  explanationTraps?: string;
  points: number;
};

export type ListeningTtsConfig = {
  voice: string;
  passageVoice?: string;
  questionVoice?: string;
  rate: string;
  pitch: string;
  pauseBetweenTurnsMs?: number;
  pauseBetweenQuestionAndChoicesMs?: number;
  pauseBetweenChoicesMs?: number;
};

export type ListeningExamModeConfig = {
  enabled: boolean;
  instructionRaw?: string;
  instruction?: string;
  uiInstructionVi?: string;
  displayOnlyLabels: boolean;
  labels: string[];
  audioChoiceLabels: string[];
  labelMap?: Record<string, string>;
};

export type ListeningScriptTranslationLine = {
  speaker?: string;
  jp: string;
  vi: string;
};

export type ListeningDialogueTurn = {
  turn: number;
  speakerKey?: string;
  speakerGender?: string;
  speakerRole?: string;
  displayName?: string;
  text: string;
  textRaw?: string;
  translationVi?: string;
};

export type ListeningAnswerKeyEntry = {
  questionId: string;
  correctOptionLabel?: string;
  correctAudioChoiceLabel?: string;
  correctAnswer: string;
};

export type ListeningUsefulExpression = {
  expression: string;
  meaning: string;
  note?: string;
};

export const DEFAULT_LISTENING_DECK_NAME = "Chua phan loai";

export type ListeningPracticeItem = {
  id: string;
  title: string;
  deckName: string;
  jlptLevel: string;
  topic: string;
  situation?: string;
  keyPoint?: string;
  meta?: {
    level?: string;
    type?: string;
    durationEstimate?: string;
    questionCount?: number;
    supportsStudyMode?: boolean;
    supportsExamMode?: boolean;
    examDisplayRule?: string;
    choiceDisplayStyle?: string;
    choiceAudioStyle?: string;
  };
  difficulty: string;
  estimatedMinutes: number;
  examMode?: ListeningExamModeConfig;
  script: string;
  scriptRaw?: string;
  dialogue?: ListeningDialogueTurn[];
  translation?: string;
  scriptTranslation?: ListeningScriptTranslationLine[];
  tts: ListeningTtsConfig;
  questions: ListeningQuestion[];
  answerKey?: ListeningAnswerKeyEntry[];
  usefulExpressions?: ListeningUsefulExpression[];
  createdAt: string;
  updatedAt: string;
};

export type ListeningPracticeStore = {
  updatedAt: string;
  items: ListeningPracticeItem[];
};

function getStoreKey(userId: string): string {
  return `user_listening_practice_store:${userId}`;
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
  const keys = ["text", "value", "content", "message", "correct", "vi", "vn"];
  for (const key of keys) {
    const parsed = normalizeString(obj[key]);
    if (parsed) {
      return parsed;
    }
  }
  return "";
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => normalizeString(entry)).filter(Boolean);
}

function normalizeStringRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .map(([key, entry]) => [key.trim(), normalizeString(entry)] as const)
    .filter(([key, entry]) => Boolean(key && entry));
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function normalizeOptionalNumber(value: unknown): number | undefined {
  const numeric = typeof value === "number" ? value : Number(normalizeString(value));
  return Number.isFinite(numeric) ? numeric : undefined;
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
  const numeric = normalizeOptionalNumber(value);
  if (!numeric || numeric <= 0) {
    return 3;
  }
  return Math.min(60, Math.max(1, Math.round(numeric)));
}

function normalizeBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  const text = normalizeString(value).toLowerCase();
  if (["true", "1", "yes", "y", "dung", "dung."].includes(text)) {
    return true;
  }
  if (["false", "0", "no", "n", "sai"].includes(text)) {
    return false;
  }
  return fallback;
}

function normalizeQuestion(input: unknown, index: number): ListeningQuestion | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  const raw = input as Record<string, unknown>;
  const prompt = normalizeString(raw.prompt ?? raw.question ?? raw.q);
  const type = normalizeString(raw.type) || "multipleChoice";
  const correctRaw = raw.correctAnswer ?? raw.answer ?? raw.correct;
  if (!prompt || typeof correctRaw === "undefined") {
    return null;
  }

  const isTrueFalse = type.toLowerCase().includes("truefalse") || typeof correctRaw === "boolean";
  const options = Array.isArray(raw.options)
    ? raw.options.map((entry) => normalizeString(entry)).filter(Boolean)
    : isTrueFalse
      ? ["true", "false"]
      : [];

  const explanationRaw = raw.explanation ?? raw.reason ?? raw.note;
  const explanation = normalizeString(explanationRaw) || normalizeNestedString(explanationRaw);
  const explanationTraps =
    explanationRaw && typeof explanationRaw === "object" && !Array.isArray(explanationRaw)
      ? normalizeString((explanationRaw as Record<string, unknown>).traps)
      : "";

  return {
    id: normalizeString(raw.id) || `q-${index + 1}`,
    type,
    questionType: normalizeString(raw.questionType ?? raw.skill ?? raw.category) || undefined,
    level: normalizeOptionalNumber(raw.level),
    examDisplayMode: normalizeString(raw.examDisplayMode) || undefined,
    promptRaw: normalizeString(raw.promptRaw ?? raw.rawPrompt) || undefined,
    prompt,
    examAudioRaw: normalizeString(raw.examAudioRaw ?? raw.rawExamAudio) || undefined,
    examAudio: normalizeString(raw.examAudio) || undefined,
    options,
    optionLabels: normalizeStringList(raw.optionLabels ?? raw.labels),
    audioChoiceLabels: normalizeStringList(raw.audioChoiceLabels ?? raw.choiceAudioLabels),
    correctAnswer: isTrueFalse ? normalizeBoolean(correctRaw) : normalizeString(correctRaw),
    correctOptionLabel: normalizeString(raw.correctOptionLabel ?? raw.correctLabel) || undefined,
    correctAudioChoiceLabel: normalizeString(raw.correctAudioChoiceLabel) || undefined,
    explanation: explanation || undefined,
    explanationTraps: explanationTraps || undefined,
    points: normalizeOptionalNumber(raw.points) ?? 1,
  };
}

function normalizeTtsConfig(input: unknown): ListeningTtsConfig {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      voice: "ja-JP-NanamiNeural",
      rate: "-5%",
      pitch: "+0Hz",
    };
  }
  const raw = input as Record<string, unknown>;
  const passageVoice = normalizeString(raw.passageVoice);
  const questionVoice = normalizeString(raw.questionVoice);
  return {
    voice: normalizeString(raw.voice) || passageVoice || "ja-JP-NanamiNeural",
    passageVoice: passageVoice || undefined,
    questionVoice: questionVoice || undefined,
    rate: normalizeString(raw.rate) || "-5%",
    pitch: normalizeString(raw.pitch) || "+0Hz",
    pauseBetweenTurnsMs: normalizeOptionalNumber(raw.pauseBetweenTurnsMs),
    pauseBetweenQuestionAndChoicesMs: normalizeOptionalNumber(raw.pauseBetweenQuestionAndChoicesMs),
    pauseBetweenChoicesMs: normalizeOptionalNumber(raw.pauseBetweenChoicesMs),
  };
}

function normalizeExamModeConfig(input: unknown): ListeningExamModeConfig | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return undefined;
  }
  const raw = input as Record<string, unknown>;
  const labels = normalizeStringList(raw.labels);
  const audioChoiceLabels = normalizeStringList(raw.audioChoiceLabels);
  const hasConfig =
    typeof raw.enabled !== "undefined" ||
    labels.length > 0 ||
    audioChoiceLabels.length > 0 ||
    normalizeString(raw.instructionRaw ?? raw.instruction);
  if (!hasConfig) {
    return undefined;
  }

  return {
    enabled: normalizeBoolean(raw.enabled, true),
    instructionRaw: normalizeString(raw.instructionRaw) || undefined,
    instruction: normalizeString(raw.instruction) || undefined,
    uiInstructionVi: normalizeString(raw.uiInstructionVi ?? raw.uiInstruction) || undefined,
    displayOnlyLabels: normalizeBoolean(raw.displayOnlyLabels, true),
    labels,
    audioChoiceLabels,
    labelMap: normalizeStringRecord(raw.labelMap),
  };
}

function normalizeScriptTranslation(input: unknown): ListeningScriptTranslationLine[] | undefined {
  if (!Array.isArray(input)) {
    return undefined;
  }
  const rows = input
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return null;
      }
      const raw = entry as Record<string, unknown>;
      const jp = normalizeString(raw.jp ?? raw.ja ?? raw.text);
      const vi = normalizeString(raw.vi ?? raw.vn ?? raw.translation ?? raw.meaning);
      if (!jp && !vi) {
        return null;
      }
      const speaker = normalizeString(raw.speaker ?? raw.role);
      return {
        ...(speaker ? { speaker } : {}),
        jp,
        vi,
      } satisfies ListeningScriptTranslationLine;
    })
    .filter((entry): entry is ListeningScriptTranslationLine => Boolean(entry));
  return rows.length > 0 ? rows : undefined;
}

function normalizeDialogue(input: unknown): ListeningDialogueTurn[] | undefined {
  if (!Array.isArray(input)) {
    return undefined;
  }
  const rows = input
    .map((entry, index) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return null;
      }
      const raw = entry as Record<string, unknown>;
      const textRaw = normalizeString(raw.textRaw ?? raw.rawText ?? raw.raw);
      const text = normalizeString(raw.text ?? raw.jp ?? raw.line ?? textRaw);
      if (!text) {
        return null;
      }
      const turn = normalizeOptionalNumber(raw.turn) ?? index;
      const speakerKey = normalizeString(raw.speakerKey ?? raw.speaker_id ?? raw.speakerId);
      const speakerGender = normalizeString(raw.speakerGender ?? raw.gender);
      const speakerRole = normalizeString(raw.speakerRole ?? raw.role);
      const displayName = normalizeString(raw.displayName ?? raw.speaker ?? raw.name);
      const translationVi = normalizeString(raw.translationVi ?? raw.vi ?? raw.translation);

      return {
        turn,
        ...(speakerKey ? { speakerKey } : {}),
        ...(speakerGender ? { speakerGender } : {}),
        ...(speakerRole ? { speakerRole } : {}),
        ...(displayName ? { displayName } : {}),
        text,
        ...(textRaw ? { textRaw } : {}),
        ...(translationVi ? { translationVi } : {}),
      } satisfies ListeningDialogueTurn;
    })
    .filter((entry): entry is ListeningDialogueTurn => Boolean(entry))
    .sort((left, right) => left.turn - right.turn);

  return rows.length > 0 ? rows : undefined;
}

function normalizeAnswerKey(input: unknown): ListeningAnswerKeyEntry[] | undefined {
  if (!Array.isArray(input)) {
    return undefined;
  }
  const rows = input
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return null;
      }
      const raw = entry as Record<string, unknown>;
      const questionId = normalizeString(raw.questionId ?? raw.id);
      const correctAnswer = normalizeString(raw.correctAnswer ?? raw.answer);
      if (!questionId || !correctAnswer) {
        return null;
      }
      const correctOptionLabel = normalizeString(raw.correctOptionLabel);
      const correctAudioChoiceLabel = normalizeString(raw.correctAudioChoiceLabel);
      return {
        questionId,
        ...(correctOptionLabel ? { correctOptionLabel } : {}),
        ...(correctAudioChoiceLabel ? { correctAudioChoiceLabel } : {}),
        correctAnswer,
      } satisfies ListeningAnswerKeyEntry;
    })
    .filter((entry): entry is ListeningAnswerKeyEntry => Boolean(entry));
  return rows.length > 0 ? rows : undefined;
}

function normalizeUsefulExpressions(input: unknown): ListeningUsefulExpression[] | undefined {
  if (!Array.isArray(input)) {
    return undefined;
  }
  const rows = input
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return null;
      }
      const raw = entry as Record<string, unknown>;
      const expression = normalizeString(raw.expression ?? raw.jp ?? raw.text);
      const meaning = normalizeString(raw.meaning ?? raw.vi ?? raw.vn);
      if (!expression || !meaning) {
        return null;
      }
      const note = normalizeString(raw.note);
      return {
        expression,
        meaning,
        ...(note ? { note } : {}),
      } satisfies ListeningUsefulExpression;
    })
    .filter((entry): entry is ListeningUsefulExpression => Boolean(entry));
  return rows.length > 0 ? rows : undefined;
}

function normalizeListeningItem(input: unknown): ListeningPracticeItem | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  const raw = input as Record<string, unknown>;
  const title = normalizeString(raw.title ?? raw.name);
  const scriptRaw = normalizeString(raw.scriptRaw ?? raw.rawScript ?? raw.speechScript);
  const script = normalizeString(raw.script ?? raw.content ?? raw.text ?? raw.transcript ?? scriptRaw);
  if (!title || !script) {
    return null;
  }

  const questions = Array.isArray(raw.questions)
    ? raw.questions
        .map((entry, index) => normalizeQuestion(entry, index))
        .filter((entry): entry is ListeningQuestion => Boolean(entry))
    : [];

  const now = nowIso();
  const topic = normalizeString(raw.topic ?? raw.category ?? raw.theme) || "Tong hop";
  const metaInput = raw.meta && typeof raw.meta === "object" && !Array.isArray(raw.meta) ? raw.meta : null;
  const metaRaw = metaInput as Record<string, unknown> | null;
  const metaLevel = normalizeString(metaRaw?.level);
  const metaType = normalizeString(metaRaw?.type);
  const metaDurationEstimate = normalizeString(metaRaw?.duration_estimate ?? metaRaw?.durationEstimate);
  const metaQuestionCount = normalizeOptionalNumber(metaRaw?.questionCount);
  const metaSupportsStudyMode =
    typeof metaRaw?.supportsStudyMode !== "undefined"
      ? normalizeBoolean(metaRaw.supportsStudyMode)
      : undefined;
  const metaSupportsExamMode =
    typeof metaRaw?.supportsExamMode !== "undefined"
      ? normalizeBoolean(metaRaw.supportsExamMode)
      : undefined;
  const metaExamDisplayRule = normalizeString(metaRaw?.examDisplayRule);
  const metaChoiceDisplayStyle = normalizeString(metaRaw?.choiceDisplayStyle);
  const metaChoiceAudioStyle = normalizeString(metaRaw?.choiceAudioStyle);
  const hasMeta = Boolean(
    metaLevel ||
      metaType ||
      metaDurationEstimate ||
      metaQuestionCount ||
      typeof metaSupportsStudyMode !== "undefined" ||
      typeof metaSupportsExamMode !== "undefined" ||
      metaExamDisplayRule ||
      metaChoiceDisplayStyle ||
      metaChoiceAudioStyle
  );

  return {
    id: normalizeString(raw.id) || crypto.randomUUID(),
    title,
    deckName:
      normalizeString(raw.deckName ?? raw.deck ?? raw.collection ?? raw.groupName ?? raw.group) ||
      topic ||
      DEFAULT_LISTENING_DECK_NAME,
    jlptLevel: normalizeLevel(raw.jlptLevel ?? raw.level ?? raw.jlpt),
    topic,
    situation: normalizeString(raw.situation) || undefined,
    keyPoint: normalizeString(raw.keyPoint ?? raw.key_point ?? raw.keypoint) || undefined,
    meta: hasMeta
      ? {
          level: metaLevel || undefined,
          type: metaType || undefined,
          durationEstimate: metaDurationEstimate || undefined,
          questionCount: metaQuestionCount,
          supportsStudyMode: metaSupportsStudyMode,
          supportsExamMode: metaSupportsExamMode,
          examDisplayRule: metaExamDisplayRule || undefined,
          choiceDisplayStyle: metaChoiceDisplayStyle || undefined,
          choiceAudioStyle: metaChoiceAudioStyle || undefined,
        }
      : undefined,
    difficulty: normalizeString(raw.difficulty ?? raw.length) || "Trung binh",
    estimatedMinutes: normalizeMinutes(raw.estimatedMinutes ?? raw.minutes ?? raw.duration),
    examMode: normalizeExamModeConfig(raw.examMode),
    script,
    scriptRaw: scriptRaw || undefined,
    dialogue: normalizeDialogue(raw.dialogue),
    translation: normalizeString(raw.translation ?? raw.vi ?? raw.meaning),
    scriptTranslation: normalizeScriptTranslation(raw.scriptTranslation),
    tts: normalizeTtsConfig(raw.tts),
    questions,
    answerKey: normalizeAnswerKey(raw.answerKey),
    usefulExpressions: normalizeUsefulExpressions(raw.usefulExpressions),
    createdAt: normalizeString(raw.createdAt) || now,
    updatedAt: normalizeString(raw.updatedAt) || now,
  };
}

function normalizeStore(input: unknown): ListeningPracticeStore {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      updatedAt: "",
      items: [],
    };
  }

  const raw = input as Partial<ListeningPracticeStore>;
  const items = Array.isArray(raw.items)
    ? raw.items
        .map((entry) => normalizeListeningItem(entry))
        .filter((entry): entry is ListeningPracticeItem => Boolean(entry))
    : [];

  return {
    updatedAt: normalizeString(raw.updatedAt),
    items: items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };
}

export async function loadListeningPracticeStore(userId: string): Promise<ListeningPracticeStore> {
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

export async function saveListeningPracticeStore(userId: string, store: ListeningPracticeStore) {
  const payload: ListeningPracticeStore = {
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

export function normalizeListeningJsonRows(input: unknown): ListeningPracticeItem[] {
  if (Array.isArray(input)) {
    return input
      .map((entry) => normalizeListeningItem(entry))
      .filter((entry): entry is ListeningPracticeItem => Boolean(entry));
  }
  if (input && typeof input === "object" && !Array.isArray(input)) {
    const raw = input as Record<string, unknown>;
    const list = raw.items ?? raw.data ?? raw.lessons ?? raw.listening ?? raw.audios;
    if (Array.isArray(list)) {
      return list
        .map((entry) => normalizeListeningItem(entry))
        .filter((entry): entry is ListeningPracticeItem => Boolean(entry));
    }
    const single = normalizeListeningItem(raw);
    return single ? [single] : [];
  }
  return [];
}
