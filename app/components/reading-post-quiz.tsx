"use client";

import { ArrowLeft, ArrowRight, CheckCircle2, Circle, RotateCcw, Trophy, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

import { SpeakJpButton } from "@/app/components/speak-jp-button";
import type { ReadingPostReadingQuiz, ReadingPostReadingQuizQuestion } from "@/lib/reading-practice-store";

type Props = {
  quiz: ReadingPostReadingQuiz;
  textId: string;
};

type AnswerMap = Record<string, string | undefined>;
type CheckedMap = Record<string, boolean | undefined>;

const RUBY_TEXT_PATTERN =
  /([\u3400-\u9fff\u3005\u3006\u30f5\u30f6]+)[\uff08(]\s*([\u3041-\u3096\u30a1-\u30fa\u30fc\u30fb\s]+)\s*[\uff09)]/gu;
const HAS_JAPANESE_PATTERN = /[\u3040-\u30ff\u3400-\u9fff]/u;

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

function answerToValue(answer: string | boolean): string {
  return typeof answer === "boolean" ? String(answer) : answer.trim();
}

function answerLabel(value: string): string {
  if (value === "true") {
    return "Đúng";
  }
  if (value === "false") {
    return "Sai";
  }
  return value;
}

function normalizeAnswer(value: string | boolean | undefined): string {
  if (typeof value === "boolean") {
    return String(value);
  }
  return (value ?? "").trim().toLowerCase();
}

function optionSpeechText(option: string): string {
  const label = answerLabel(option);
  return label
    .replace(
      /([\u3400-\u9fff\u3005\u3006\u30f5\u30f6]+)[\uff08(]\s*([\u3041-\u3096\u30a1-\u30fa\u30fc\u30fb\s]+)\s*[\uff09)]/gu,
      "$1"
    )
    .replace(/\s+/g, " ")
    .trim();
}

function shouldShowSpeakButton(option: string): boolean {
  return HAS_JAPANESE_PATTERN.test(optionSpeechText(option));
}

function questionOptions(question: ReadingPostReadingQuizQuestion): string[] {
  if (question.options.length > 0) {
    return question.options.map(answerToValue);
  }
  if (typeof question.correctAnswer === "boolean" || question.type.toLowerCase().includes("truefalse")) {
    return ["true", "false"];
  }
  return [];
}

function questionTag(question: ReadingPostReadingQuizQuestion): string {
  if (question.skill) {
    return question.skill;
  }
  if (question.grammarPattern) {
    return question.grammarPattern;
  }
  if (question.targetWord) {
    return question.targetWord;
  }
  return question.type;
}

function isAnswerCorrect(question: ReadingPostReadingQuizQuestion, answer: string | undefined): boolean {
  return normalizeAnswer(answer) === normalizeAnswer(question.correctAnswer);
}

export function ReadingPostQuiz({ quiz, textId }: Props) {
  const [index, setIndex] = useState(0);
  const [selectedById, setSelectedById] = useState<AnswerMap>({});
  const [checkedById, setCheckedById] = useState<CheckedMap>({});

  const orderedQuestions = useMemo(() => {
    const limit = quiz.totalQuestions ? Math.min(quiz.totalQuestions, quiz.questions.length) : quiz.questions.length;
    const base = quiz.shuffleQuestions
      ? seededShuffle(quiz.questions, `${textId}:questions`)
      : [...quiz.questions];
    return base.slice(0, limit);
  }, [quiz.questions, quiz.shuffleQuestions, quiz.totalQuestions, textId]);

  const optionByQuestionId = useMemo(() => {
    return Object.fromEntries(
      orderedQuestions.map((question) => {
        const options = questionOptions(question);
        return [
          question.id,
          quiz.shuffleOptions ? seededShuffle(options, `${textId}:${question.id}:options`) : options,
        ];
      })
    ) as Record<string, string[]>;
  }, [orderedQuestions, quiz.shuffleOptions, textId]);

  const current = orderedQuestions[index] ?? orderedQuestions[0];
  const selected = current ? selectedById[current.id] : undefined;
  const checked = current ? Boolean(checkedById[current.id]) : false;
  const options = current ? optionByQuestionId[current.id] ?? [] : [];
  const total = orderedQuestions.length;
  const checkedCount = orderedQuestions.filter((question) => checkedById[question.id]).length;
  const correctCount = orderedQuestions.filter((question) => checkedById[question.id] && isAnswerCorrect(question, selectedById[question.id])).length;
  const score = checkedCount > 0 ? Math.round((correctCount / checkedCount) * 100) : 0;
  const passed = checkedCount === total && score >= quiz.passingScore;

  if (!current) {
    return null;
  }

  const handleSelect = (value: string) => {
    setSelectedById((currentAnswers) => ({ ...currentAnswers, [current.id]: value }));
    if (quiz.showAnswerImmediately) {
      setCheckedById((currentChecked) => ({ ...currentChecked, [current.id]: true }));
    }
  };

  const handleCheck = () => {
    if (!selected) {
      return;
    }
    setCheckedById((currentChecked) => ({ ...currentChecked, [current.id]: true }));
  };

  const handleReset = () => {
    setIndex(0);
    setSelectedById({});
    setCheckedById({});
  };

  const currentCorrect = isAnswerCorrect(current, selected);
  const correctAnswer = answerLabel(answerToValue(current.correctAnswer));

  return (
    <section className="rounded-2xl border border-[#d8e2ee] bg-white p-4 shadow-[0_12px_26px_rgba(18,60,105,0.05)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#22a6a1]">Quiz sau bài đọc</p>
          <h3 className="mt-1 text-xl font-black text-[#111827]">
            Câu {index + 1}/{total}
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-black ${passed ? "bg-[#e8fbf1] text-[#087443]" : "bg-[#eef3ff] text-[#3554a8]"}`}>
            {score}% / đạt {quiz.passingScore}%
          </span>
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex h-9 items-center gap-2 rounded-full border border-[#d8e2ee] bg-[#f8fcff] px-3 text-xs font-black text-[#123c69] transition hover:bg-[#eef7fb]"
          >
            <RotateCcw className="h-4 w-4" />
            Làm lại
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-[#edf1f6] bg-[#fbfdff] px-4 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-[#eef3ff] px-2 py-0.5 text-[11px] font-black text-[#3554a8]">
            {questionTag(current)}
          </span>
          {current.difficulty ? (
            <span className="rounded-full bg-[#fff3df] px-2 py-0.5 text-[11px] font-black text-[#9a4f05]">
              {current.difficulty}
            </span>
          ) : null}
          {current.sentenceRef ? (
            <span className="rounded-full bg-[#f3f4f6] px-2 py-0.5 text-[11px] font-black text-[#667085]">
              {current.sentenceRef}
            </span>
          ) : null}
        </div>
        <p className="mt-3 font-[var(--font-jp)] text-lg font-black leading-8 text-[#111827]">
          {renderRubyText(current.prompt)}
        </p>
      </div>

      {options.length > 0 ? (
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {options.map((option) => {
            const isSelected = selected === option;
            const isCorrectOption = normalizeAnswer(option) === normalizeAnswer(current.correctAnswer);
            const showCorrect = checked && isCorrectOption;
            const showWrong = checked && isSelected && !isCorrectOption;
            const speakText = optionSpeechText(option);
            const canSpeak = shouldShowSpeakButton(option);
            return (
              <div key={`${current.id}-${option}`} className="flex min-h-14 items-stretch gap-2">
                <button
                  type="button"
                  onClick={() => handleSelect(option)}
                  className={`flex flex-1 items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left text-sm font-black transition ${
                    showCorrect
                      ? "border-[#34c759] bg-[#ecfff4] text-[#087443]"
                      : showWrong
                        ? "border-[#fda4af] bg-[#fff1f2] text-[#be123c]"
                        : isSelected
                          ? "border-[#123c69] bg-[#eef7ff] text-[#123c69]"
                          : "border-[#d8e2ee] bg-white text-[#172033] hover:border-[#9dc3f5]"
                  }`}
                >
                  <span className="font-[var(--font-jp)] leading-7">{renderRubyText(answerLabel(option))}</span>
                  {showCorrect ? (
                    <CheckCircle2 className="h-5 w-5 shrink-0" />
                  ) : showWrong ? (
                    <XCircle className="h-5 w-5 shrink-0" />
                  ) : (
                    <Circle className="h-5 w-5 shrink-0 text-[#aab7c8]" />
                  )}
                </button>
                {canSpeak ? (
                  <div className="flex items-center">
                    <SpeakJpButton
                      text={speakText}
                      title="Phat am dap an"
                      className="h-10 w-10 border-[#cbd8e7] bg-[#f8fcff] text-[#123c69] hover:bg-[#ecf4ff]"
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <input
          value={selected ?? ""}
          onChange={(event) => handleSelect(event.target.value)}
          className="mt-4 h-12 w-full rounded-2xl border border-[#d8e2ee] bg-white px-4 text-sm font-bold text-[#172033] outline-none focus:border-[#22a6a1] focus:ring-4 focus:ring-[#d7f4f1]"
          placeholder="Nhập đáp án"
        />
      )}

      {checked ? (
        <div className={`mt-4 rounded-2xl border px-4 py-3 ${currentCorrect ? "border-[#b7efd2] bg-[#f0fff7]" : "border-[#fecdd3] bg-[#fff6f7]"}`}>
          <p className={`text-sm font-black ${currentCorrect ? "text-[#087443]" : "text-[#be123c]"}`}>
            {currentCorrect ? "Đúng rồi" : `Chưa đúng. Đáp án: ${correctAnswer}`}
          </p>
          {current.explanation ? (
            <p className="mt-1 font-[var(--font-jp)] text-sm font-semibold leading-7 text-[#526070]">
              {renderRubyText(current.explanation)}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-bold text-[#667085]">
          Đã kiểm tra {checkedCount}/{total} câu, đúng {correctCount}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setIndex((value) => Math.max(0, value - 1))}
            disabled={index <= 0}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-[#d8e2ee] bg-[#f8fcff] px-5 text-sm font-black text-[#123c69] transition hover:bg-[#eef7fb] disabled:cursor-not-allowed disabled:opacity-45"
          >
            <ArrowLeft className="h-4 w-4" />
            Câu trước
          </button>
          <button
            type="button"
            onClick={handleCheck}
            disabled={!selected || checked}
            className="inline-flex h-10 items-center rounded-full bg-[#ff6b00] px-5 text-sm font-black text-white transition hover:bg-[#e85f00] disabled:cursor-not-allowed disabled:opacity-45"
          >
            Kiểm tra
          </button>
          <button
            type="button"
            onClick={() => setIndex((value) => Math.min(total - 1, value + 1))}
            disabled={index >= total - 1}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-[#d8e2ee] bg-[#f8fcff] px-5 text-sm font-black text-[#123c69] transition hover:bg-[#eef7fb] disabled:cursor-not-allowed disabled:opacity-45"
          >
            Câu tiếp
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {checkedCount === total ? (
        <div className="mt-4 flex items-center gap-2 rounded-2xl bg-[#f8fcff] px-4 py-3 text-sm font-black text-[#123c69]">
          <Trophy className="h-5 w-5 text-[#ff9f1c]" />
          {passed ? "Đã đạt mục tiêu bài đọc." : "Chưa đạt mục tiêu, làm lại một lượt nữa nhé."}
        </div>
      ) : null}
    </section>
  );
}
