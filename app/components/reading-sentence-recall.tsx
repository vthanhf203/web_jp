"use client";

import { ArrowLeft, ArrowRight, CheckCircle2, Lightbulb, RotateCcw, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

import type {
  ReadingRecallCommonMistake,
  ReadingRecallNormalizeRules,
  ReadingRecallScoreBand,
  ReadingRecallSlot,
  ReadingSentenceRecallPractice,
  ReadingSentenceRecallQuestion,
} from "@/lib/reading-practice-store";

type Props = {
  practice: ReadingSentenceRecallPractice;
  textId: string;
};

type AnswerMap = Record<string, string | undefined>;
type CheckedMap = Record<string, boolean | undefined>;
type HintMap = Record<string, number | undefined>;

type RecallResult = {
  score: number;
  correct: boolean;
  label: string;
  message: string;
  matchedSlots: ReadingRecallSlot[];
  missingSlots: ReadingRecallSlot[];
  commonMistake?: ReadingRecallCommonMistake;
};

type FuriganaEntry = {
  text: string;
  reading: string;
};

const RUBY_TEXT_PATTERN =
  /([\u3400-\u9fff\u3005\u3006\u30f5\u30f6]+)[\uff08(]\s*([\u3041-\u3096\u30a1-\u30fa\u30fc\u30fb\s]+)\s*[\uff09)]/gu;
const FURIGANA_TEXT_PATTERN =
  /([\u3400-\u9fff\u3005\u3006\u30f5\u30f6]+)[\uff08(]\s*[\u3041-\u3096\u30a1-\u30fa\u30fc\u30fb\s]+\s*[\uff09)]/gu;
const FALLBACK_SCORE_BANDS: Record<string, ReadingRecallScoreBand> = {
  correct: {
    min: 90,
    label: "Đúng",
    message: "Đúng rồi. Câu của bạn đúng ý và đúng ngữ pháp chính.",
  },
  almostCorrect: {
    min: 75,
    label: "Gần đúng",
    message: "Gần đúng. Câu của bạn đúng ý chính nhưng còn lỗi nhỏ.",
  },
  partial: {
    min: 50,
    label: "Đúng một phần",
    message: "Bạn đã hiểu một phần câu, nhưng còn thiếu thông tin quan trọng.",
  },
  incorrect: {
    min: 0,
    label: "Chưa đúng",
    message: "Chưa đúng. Hãy xem lại gợi ý và thử lại.",
  },
};

function hashText(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededShuffle<T>(items: T[], seedText: string): T[] {
  const output = [...items];
  let seed = hashText(seedText) || 1;
  for (let index = output.length - 1; index > 0; index -= 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const swapIndex = seed % (index + 1);
    [output[index], output[swapIndex]] = [output[swapIndex], output[index]];
  }
  return output;
}

function renderRubyText(text: string) {
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(RUBY_TEXT_PATTERN)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      parts.push(text.slice(cursor, index));
    }
    parts.push(
      <ruby key={`${index}-${match[0]}`} className="whitespace-nowrap px-0.5">
        {match[1]}
        <rt className="text-[0.58em] font-black leading-none tracking-wide text-[#64748b]">{match[2]}</rt>
      </ruby>
    );
    cursor = index + match[0].length;
  }
  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }
  return parts.length > 0 ? parts : text;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractFuriganaMap(text: string): FuriganaEntry[] {
  const entries = Array.from(text.matchAll(RUBY_TEXT_PATTERN))
    .map((match) => ({
      text: match[1] ?? "",
      reading: (match[2] ?? "").replace(/[\s\u3000]/g, ""),
    }))
    .filter((entry) => entry.text && entry.reading);
  return entries.sort((a, b) => b.text.length - a.text.length);
}

function applyFuriganaMap(value: string, entries: FuriganaEntry[]): string {
  return entries.reduce(
    (current, entry) => current.replace(new RegExp(escapeRegExp(entry.text), "gu"), entry.reading),
    value
  );
}

function readingAwareVariants(value: string, entries: FuriganaEntry[]): string[] {
  const readingValue = applyFuriganaMap(value, entries);
  return readingValue === value ? [value] : [value, readingValue];
}

function mergeNormalizeRules(rules?: ReadingRecallNormalizeRules): Required<ReadingRecallNormalizeRules> {
  return {
    ignoreSpaces: rules?.ignoreSpaces ?? true,
    ignorePunctuation: rules?.ignorePunctuation ?? true,
    normalizeFullWidthNumbers: rules?.normalizeFullWidthNumbers ?? true,
    ignoreKanjiHiraganaDifference: rules?.ignoreKanjiHiraganaDifference ?? true,
    allowOptionalSubject: rules?.allowOptionalSubject ?? true,
    caseSensitive: rules?.caseSensitive ?? false,
  };
}

function toHalfWidthNumbers(value: string): string {
  return value.replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0));
}

function normalizeForRecall(value: string, rawRules?: ReadingRecallNormalizeRules): string {
  const rules = mergeNormalizeRules(rawRules);
  let output = value.replace(FURIGANA_TEXT_PATTERN, "$1");
  if (rules.normalizeFullWidthNumbers) {
    output = toHalfWidthNumbers(output);
  }
  if (rules.ignorePunctuation) {
    output = output.replace(/[。、，,「」『』“”"''’`！？!?・.：:；;［\]\[\]｛｝{}（）()]/g, "");
  }
  if (rules.ignoreSpaces) {
    output = output.replace(/[\s\u3000]/g, "");
  }
  if (!rules.caseSensitive) {
    output = output.toLowerCase();
  }
  return output.trim();
}

function normalizePatternForRecall(value: string, rawRules?: ReadingRecallNormalizeRules): string {
  const rules = mergeNormalizeRules(rawRules);
  let output = value;
  if (rules.normalizeFullWidthNumbers) {
    output = toHalfWidthNumbers(output);
  }
  if (rules.ignoreSpaces) {
    output = output.replace(/[\s\u3000]/g, "");
  }
  if (!rules.caseSensitive) {
    output = output.toLowerCase();
  }
  return output;
}

function levenshteinDistance(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const old = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      diagonal = old;
    }
  }
  return previous[b.length] ?? 0;
}

function similarity(a: string, b: string): number {
  if (!a && !b) {
    return 1;
  }
  const maxLength = Math.max(a.length, b.length, 1);
  return 1 - levenshteinDistance(a, b) / maxLength;
}

function answerCandidates(question: ReadingSentenceRecallQuestion, rules?: ReadingRecallNormalizeRules): string[] {
  const furiganaMap = extractFuriganaMap(question.modelAnswer);
  return [question.modelAnswerPlain, question.modelAnswer, ...question.acceptableAnswers]
    .flatMap((candidate) => readingAwareVariants(candidate, furiganaMap))
    .map((candidate) => normalizeForRecall(candidate, rules))
    .filter(Boolean);
}

function fallbackSimilarityScore(
  question: ReadingSentenceRecallQuestion,
  answer: string,
  rules?: ReadingRecallNormalizeRules
): number {
  const normalizedAnswer = normalizeForRecall(answer, rules);
  if (!normalizedAnswer) {
    return 0;
  }
  return Math.round(
    Math.max(...answerCandidates(question, rules).map((candidate) => similarity(normalizedAnswer, candidate)), 0) *
      100
  );
}

function slotMatches(
  slot: ReadingRecallSlot,
  normalizedAnswer: string,
  furiganaMap: FuriganaEntry[],
  rules?: ReadingRecallNormalizeRules
): boolean {
  if (slot.type === "softCheck") {
    return normalizedAnswer.length > 0;
  }

  const acceptedValues = slot.accepted ?? [];
  if (
    acceptedValues.flatMap((accepted) => readingAwareVariants(accepted, furiganaMap)).some((accepted) => {
      const normalizedAccepted = normalizeForRecall(accepted, rules);
      return normalizedAccepted.length > 0 && normalizedAnswer.includes(normalizedAccepted);
    })
  ) {
    return true;
  }

  if (slot.acceptedPattern) {
    try {
      const pattern = normalizePatternForRecall(slot.acceptedPattern, rules);
      return new RegExp(pattern, "u").test(normalizedAnswer);
    } catch {
      return false;
    }
  }

  return false;
}

function detectCommonMistake(
  question: ReadingSentenceRecallQuestion,
  answer: string,
  normalizedAnswer: string,
  rules?: ReadingRecallNormalizeRules
): ReadingRecallCommonMistake | undefined {
  return question.commonMistakes.find((mistake) => {
    if (answer.includes(mistake.pattern)) {
      return true;
    }
    const normalizedPattern = normalizeForRecall(mistake.pattern, rules);
    return normalizedPattern.length > 0 && normalizedAnswer.includes(normalizedPattern);
  });
}

function getPassingScore(question: ReadingSentenceRecallQuestion, practice: ReadingSentenceRecallPractice): number {
  if (typeof question.passingScore === "number") {
    return question.passingScore;
  }
  const mode = question.gradingMode || practice.defaultGradingMode || practice.gradingMode;
  return mode === "semiFlexible" || mode === "slotBased" ? 80 : 96;
}

function getScoreBand(score: number, practice: ReadingSentenceRecallPractice): ReadingRecallScoreBand {
  const bands = Object.values(practice.scoreBands ?? FALLBACK_SCORE_BANDS).sort((a, b) => b.min - a.min);
  return bands.find((band) => score >= band.min) ?? FALLBACK_SCORE_BANDS.incorrect;
}

function getFeedbackMessage(
  resultScore: number,
  question: ReadingSentenceRecallQuestion,
  practice: ReadingSentenceRecallPractice,
  commonMistake?: ReadingRecallCommonMistake
): { label: string; message: string } {
  const band = getScoreBand(resultScore, practice);
  const templates = question.feedbackTemplates ?? {};
  if (commonMistake) {
    const mistakeTemplate = commonMistake.mistakeType ? templates[commonMistake.mistakeType] : "";
    return {
      label: band.label,
      message: commonMistake.message || mistakeTemplate || band.message,
    };
  }
  const templateKey =
    resultScore >= 90 ? "correct" : resultScore >= 75 ? "almostCorrect" : resultScore >= 50 ? "partial" : "incorrect";
  return {
    label: band.label,
    message: templates[templateKey] || band.message,
  };
}

function evaluateAnswer(
  question: ReadingSentenceRecallQuestion,
  answer: string,
  practice: ReadingSentenceRecallPractice
): RecallResult {
  const rules = practice.globalNormalizeRules;
  const normalizedAnswer = normalizeForRecall(answer, rules);
  const passingScore = getPassingScore(question, practice);
  const exactCandidateMatch = answerCandidates(question, rules).some((candidate) => candidate === normalizedAnswer);
  const gradingMode = question.gradingMode || practice.defaultGradingMode || practice.gradingMode;

  if (exactCandidateMatch) {
    const feedback = getFeedbackMessage(100, question, practice);
    return {
      score: 100,
      correct: true,
      label: feedback.label,
      message: feedback.message,
      matchedSlots: question.requiredSlots,
      missingSlots: [],
    };
  }

  if (gradingMode !== "slotBased" || question.requiredSlots.length === 0) {
    const score = fallbackSimilarityScore(question, answer, rules);
    const commonMistake = detectCommonMistake(question, answer, normalizedAnswer, rules);
    const feedback = getFeedbackMessage(score, question, practice, commonMistake);
    return {
      score,
      correct: score >= passingScore,
      label: feedback.label,
      message: feedback.message,
      matchedSlots: [],
      missingSlots: [],
      commonMistake,
    };
  }

  const matchedSlots: ReadingRecallSlot[] = [];
  const missingSlots: ReadingRecallSlot[] = [];
  const totalWeight = question.requiredSlots.reduce((sum, slot) => sum + (slot.weight ?? 1), 0) || 1;
  const furiganaMap = extractFuriganaMap(question.modelAnswer);
  let matchedWeight = 0;

  for (const slot of question.requiredSlots) {
    if (slotMatches(slot, normalizedAnswer, furiganaMap, rules)) {
      matchedSlots.push(slot);
      matchedWeight += slot.weight ?? 1;
    } else {
      missingSlots.push(slot);
    }
  }

  const allRequiredSlotsMatched = missingSlots.length === 0;
  let score = Math.round((matchedWeight / totalWeight) * 100);
  if (question.autoAcceptWhenRequiredSlotsMatch && allRequiredSlotsMatched) {
    score = 100;
  }

  const commonMistake = detectCommonMistake(question, answer, normalizedAnswer, rules);
  const feedback = getFeedbackMessage(score, question, practice, commonMistake);

  return {
    score,
    correct: score >= passingScore,
    label: feedback.label,
    message: feedback.message,
    matchedSlots,
    missingSlots,
    commonMistake,
  };
}

function resultTone(result: RecallResult): "correct" | "almost" | "wrong" {
  if (result.score >= 90) {
    return "correct";
  }
  if (result.score >= 75) {
    return "almost";
  }
  return "wrong";
}

export function ReadingSentenceRecall({ practice, textId }: Props) {
  const [index, setIndex] = useState(0);
  const [answersById, setAnswersById] = useState<AnswerMap>({});
  const [checkedById, setCheckedById] = useState<CheckedMap>({});
  const [hintCountById, setHintCountById] = useState<HintMap>({});

  const questions = useMemo(() => {
    const base = practice.shuffleQuestions
      ? seededShuffle(practice.questions, `${textId}:sentence-recall`)
      : [...practice.questions];
    const limit = practice.totalQuestions ? Math.min(practice.totalQuestions, base.length) : base.length;
    return base.slice(0, limit);
  }, [practice.questions, practice.shuffleQuestions, practice.totalQuestions, textId]);

  const current = questions[index] ?? questions[0];
  if (!current) {
    return null;
  }

  const answer = answersById[current.id] ?? "";
  const checked = Boolean(checkedById[current.id]);
  const result = evaluateAnswer(current, answer, practice);
  const tone = resultTone(result);
  const checkedCount = questions.filter((question) => checkedById[question.id]).length;
  const correctCount = questions.filter((question) =>
    checkedById[question.id]
      ? evaluateAnswer(question, answersById[question.id] ?? "", practice).correct
      : false
  ).length;
  const hintCount = hintCountById[current.id] ?? 0;
  const showSupport = checked || hintCount > 0;
  const visibleHints = current.hints.slice(0, hintCount);

  const handleReset = () => {
    setIndex(0);
    setAnswersById({});
    setCheckedById({});
    setHintCountById({});
  };

  return (
    <section className="rounded-2xl border border-[#d8e2ee] bg-white p-4 shadow-[0_12px_26px_rgba(18,60,105,0.05)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#ff6b00]">Luyện gõ câu Nhật</p>
          <h3 className="mt-1 text-xl font-black text-[#111827]">
            {practice.title || "Việt -> Nhật"} · Câu {index + 1}/{questions.length}
          </h3>
        </div>
        <button
          type="button"
          onClick={handleReset}
          className="inline-flex h-9 items-center gap-2 rounded-full border border-[#d8e2ee] bg-[#f8fcff] px-3 text-xs font-black text-[#123c69] transition hover:bg-[#eef7fb]"
        >
          <RotateCcw className="h-4 w-4" />
          Làm lại
        </button>
      </div>

      <div className="mt-4 rounded-2xl border border-[#edf1f6] bg-[#fbfdff] px-4 py-4">
        <div className="flex flex-wrap items-center gap-2">
          {current.sourceSentenceRef ? (
            <span className="rounded-full bg-[#eef3ff] px-2 py-0.5 text-[11px] font-black text-[#3554a8]">
              {current.sourceSentenceRef}
            </span>
          ) : null}
          {current.difficulty ? (
            <span className="rounded-full bg-[#fff3df] px-2 py-0.5 text-[11px] font-black text-[#9a4f05]">
              {current.difficulty}
            </span>
          ) : null}
          <span className="rounded-full bg-[#e8fbf8] px-2 py-0.5 text-[11px] font-black text-[#108373]">
            {current.points} điểm
          </span>
        </div>
        <p className="mt-3 text-lg font-black leading-8 text-[#111827]">{current.viPrompt}</p>
      </div>

      <textarea
        value={answer}
        onChange={(event) => {
          setAnswersById((currentAnswers) => ({ ...currentAnswers, [current.id]: event.target.value }));
          setCheckedById((currentChecked) => ({ ...currentChecked, [current.id]: false }));
        }}
        className="mt-4 min-h-28 w-full resize-y rounded-2xl border border-[#d8e2ee] bg-white px-4 py-3 font-[var(--font-jp)] text-lg font-bold leading-8 text-[#172033] outline-none transition focus:border-[#22a6a1] focus:ring-4 focus:ring-[#d7f4f1]"
        placeholder="Gõ câu tiếng Nhật ở đây"
      />

      {practice.showHints && showSupport && (current.hints.length > 0 || current.targetGrammar.length > 0 || current.targetVocabulary.length > 0) ? (
        <div className="mt-3 rounded-2xl border border-[#edf1f6] bg-[#fbfdff] px-4 py-3">
          {checked ? (
            <div className="flex flex-wrap gap-2">
              {current.targetGrammar.map((item) => (
                <span key={`grammar-${current.id}-${item}`} className="rounded-full bg-[#fff3df] px-2 py-0.5 text-[11px] font-black text-[#9a4f05]">
                  {item}
                </span>
              ))}
              {current.targetVocabulary.map((item) => (
                <span key={`vocab-${current.id}-${item}`} className="rounded-full bg-[#eef3ff] px-2 py-0.5 text-[11px] font-black text-[#3554a8]">
                  {renderRubyText(item)}
                </span>
              ))}
            </div>
          ) : null}
          {visibleHints.length > 0 ? (
            <ul className={checked ? "mt-3 space-y-1 text-sm font-semibold leading-6 text-[#526070]" : "space-y-1 text-sm font-semibold leading-6 text-[#526070]"}>
              {visibleHints.map((hint) => (
                <li key={`${current.id}-${hint}`}>· {renderRubyText(hint)}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {checked ? (
        <div
          className={`mt-4 rounded-2xl border px-4 py-3 ${
            tone === "correct"
              ? "border-[#b7efd2] bg-[#f0fff7]"
              : tone === "almost"
                ? "border-[#fed7aa] bg-[#fff7ed]"
                : "border-[#fecdd3] bg-[#fff6f7]"
          }`}
        >
          <p
            className={`flex flex-wrap items-center gap-2 text-sm font-black ${
              tone === "correct" ? "text-[#087443]" : tone === "almost" ? "text-[#a15c07]" : "text-[#be123c]"
            }`}
          >
            {result.correct ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
            {result.label} · {result.score}%
          </p>
          <p className="mt-1 text-sm font-semibold leading-6 text-[#526070]">{result.message}</p>
          {result.missingSlots.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="text-xs font-black uppercase tracking-[0.14em] text-[#be123c]">Cần xem lại</span>
              {result.missingSlots.map((slot) => (
                <span key={`${current.id}-missing-${slot.slot}`} className="rounded-full bg-white px-2 py-0.5 text-[11px] font-black text-[#be123c] ring-1 ring-[#fecdd3]">
                  {slot.label}
                </span>
              ))}
            </div>
          ) : null}
          {practice.showAnswerAfterSubmit ? (
            <div className="mt-3 rounded-xl bg-white/70 px-3 py-2">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#64748b]">Đáp án mẫu</p>
              <p className="mt-1 font-[var(--font-jp)] text-base font-black leading-8 text-[#172033]">
                {renderRubyText(current.modelAnswer)}
              </p>
            </div>
          ) : null}
          {current.explanation ? (
            <p className="mt-2 text-sm font-semibold leading-7 text-[#526070]">{renderRubyText(current.explanation)}</p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-bold text-[#667085]">
          Đã kiểm tra {checkedCount}/{questions.length} câu, đạt {correctCount}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setIndex((value) => Math.max(0, value - 1))}
            disabled={index <= 0}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-[#d8e2ee] bg-[#f8fcff] px-4 text-sm font-black text-[#123c69] transition hover:bg-[#eef7fb] disabled:cursor-not-allowed disabled:opacity-45"
          >
            <ArrowLeft className="h-4 w-4" />
            Câu trước
          </button>
          {practice.showHints && current.hints.length > 0 ? (
            <button
              type="button"
              onClick={() =>
                setHintCountById((currentHints) => ({
                  ...currentHints,
                  [current.id]: Math.min(current.hints.length, (currentHints[current.id] ?? 0) + 1),
                }))
              }
              disabled={hintCount >= current.hints.length}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-[#d8e2ee] bg-[#f8fcff] px-4 text-sm font-black text-[#123c69] transition hover:bg-[#eef7fb] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Lightbulb className="h-4 w-4" />
              Gợi ý
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setCheckedById((currentChecked) => ({ ...currentChecked, [current.id]: true }))}
            disabled={!answer.trim()}
            className="inline-flex h-10 items-center rounded-full bg-[#ff6b00] px-5 text-sm font-black text-white transition hover:bg-[#e85f00] disabled:cursor-not-allowed disabled:opacity-45"
          >
            Kiểm tra
          </button>
          <button
            type="button"
            onClick={() => setIndex((value) => Math.min(questions.length - 1, value + 1))}
            disabled={index >= questions.length - 1}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-[#d8e2ee] bg-[#f8fcff] px-4 text-sm font-black text-[#123c69] transition hover:bg-[#eef7fb] disabled:cursor-not-allowed disabled:opacity-45"
          >
            Câu tiếp
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  );
}
