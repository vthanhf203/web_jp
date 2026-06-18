"use client";

import { useMemo, useState } from "react";

import type { GrammarPracticeItem, GrammarPracticeQuizItem } from "@/lib/grammar-practice-store";

type QuizMode = "pattern_to_meaning" | "meaning_to_pattern" | "custom_quiz";

type QuizRoundOption = {
  id: string;
  text: string;
};

type QuizRound = {
  item: GrammarPracticeItem;
  prompt: string;
  answer: string;
  answerLabel: string;
  options: QuizRoundOption[];
  mode: QuizMode;
  promptLines: string[];
  explanation?: string;
  wrongAnswerExplanations: Record<string, string>;
};

function normalizeValue(value: string): string {
  return value.trim().toLowerCase();
}

function shuffleList<T>(list: T[]): T[] {
  const output = [...list];
  for (let i = output.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [output[i], output[j]] = [output[j], output[i]];
  }
  return output;
}

function uniqueValues(values: string[]): string[] {
  const map = new Map<string, string>();
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }
    const key = normalizeValue(trimmed);
    if (!map.has(key)) {
      map.set(key, trimmed);
    }
  }
  return Array.from(map.values());
}

function pickFromList<T>(list: T[], cursor: number): T | undefined {
  if (list.length === 0) {
    return undefined;
  }
  return list[(Math.floor(Math.random() * list.length) + cursor) % list.length];
}

function poolValue(item: GrammarPracticeItem, mode: QuizMode): string {
  return mode === "pattern_to_meaning" ? item.meaning : item.pattern;
}

function quizPromptLines(quiz: GrammarPracticeQuizItem): string[] {
  return uniqueValues([quiz.prompt?.jpWithReading || "", quiz.prompt?.jp || "", quiz.prompt?.vi || ""]);
}

function resolveQuizAnswer(quiz: GrammarPracticeQuizItem): { answer: string; answerLabel: string } {
  const normalizedAnswer = normalizeValue(quiz.answer);
  const matchedOption = quiz.options.find(
    (option) => normalizeValue(option.id) === normalizedAnswer || normalizeValue(option.text) === normalizedAnswer
  );
  if (matchedOption) {
    return {
      answer: matchedOption.text,
      answerLabel: `${matchedOption.id}. ${matchedOption.text}`,
    };
  }
  return {
    answer: quiz.answer,
    answerLabel: quiz.answer,
  };
}

function buildCustomQuizRound(items: GrammarPracticeItem[], excludeId: string | null, cursor: number): QuizRound | null {
  const itemsWithQuiz = items.filter((item) => item.quiz.length > 0);
  if (itemsWithQuiz.length === 0) {
    return null;
  }

  const candidates =
    itemsWithQuiz.length > 1 && excludeId ? itemsWithQuiz.filter((item) => item.id !== excludeId) : itemsWithQuiz;
  const picked = pickFromList(candidates, cursor) ?? itemsWithQuiz[0];
  const quiz = picked ? pickFromList(picked.quiz, cursor + 1) : undefined;
  if (!picked || !quiz) {
    return null;
  }

  const resolvedAnswer = resolveQuizAnswer(quiz);
  const options =
    quiz.options.length > 0
      ? shuffleList(quiz.options.map((option) => ({ id: option.id, text: option.text })))
      : [{ id: "A", text: resolvedAnswer.answer }];

  return {
    item: picked,
    prompt: quiz.question,
    answer: resolvedAnswer.answer,
    answerLabel: resolvedAnswer.answerLabel,
    options,
    mode: "custom_quiz",
    promptLines: quizPromptLines(quiz),
    explanation: quiz.explanation,
    wrongAnswerExplanations: quiz.wrongAnswerExplanations,
  };
}

function buildRound(items: GrammarPracticeItem[], mode: QuizMode, excludeId: string | null, cursor: number): QuizRound | null {
  if (mode === "custom_quiz") {
    return buildCustomQuizRound(items, excludeId, cursor);
  }

  if (items.length === 0) {
    return null;
  }

  const candidates = items.length > 1 && excludeId ? items.filter((item) => item.id !== excludeId) : items;
  const picked = pickFromList(candidates, cursor) ?? items[0];
  if (!picked) {
    return null;
  }

  const answer = poolValue(picked, mode);
  const sharedPool = items.map((item) => poolValue(item, mode));
  const distractorPool = mode === "pattern_to_meaning" ? [...sharedPool, ...picked.distractors] : sharedPool;
  const filteredDistractors = uniqueValues(distractorPool).filter(
    (entry) => normalizeValue(entry) !== normalizeValue(answer)
  );
  const options = shuffleList(uniqueValues([answer, ...shuffleList(filteredDistractors).slice(0, 3)]));

  return {
    item: picked,
    prompt: mode === "pattern_to_meaning" ? picked.displayPattern || picked.pattern : picked.meaning,
    answer,
    answerLabel: answer,
    options: (options.length > 0 ? options : [answer]).map((option, index) => ({
      id: String.fromCharCode(65 + index),
      text: option,
    })),
    mode,
    promptLines: [],
    wrongAnswerExplanations: {},
  };
}

function optionClass(option: string, selected: string, answer: string): string {
  if (!selected) {
    return "border-[#d8e2ee] bg-white text-[#172033] hover:border-[#9fc2df] hover:bg-[#f8fcff]";
  }
  const normalizedOption = normalizeValue(option);
  const normalizedSelected = normalizeValue(selected);
  const normalizedAnswer = normalizeValue(answer);
  if (normalizedOption === normalizedAnswer) {
    return "border-emerald-300 bg-emerald-50 text-emerald-800";
  }
  if (normalizedOption === normalizedSelected && normalizedOption !== normalizedAnswer) {
    return "border-rose-300 bg-rose-50 text-rose-800";
  }
  return "border-[#e5e7eb] bg-[#f8fafc] text-[#8b94a8]";
}

export function GrammarPracticeClient({ items }: { items: GrammarPracticeItem[] }) {
  const [mode, setMode] = useState<QuizMode>("pattern_to_meaning");
  const [cursor, setCursor] = useState(0);
  const [excludeId, setExcludeId] = useState<string | null>(null);
  const [selectedOption, setSelectedOption] = useState("");
  const [correct, setCorrect] = useState<boolean | null>(null);
  const [score, setScore] = useState(0);
  const [attempts, setAttempts] = useState(0);

  const round = useMemo(() => buildRound(items, mode, excludeId, cursor), [items, mode, cursor, excludeId]);
  const accuracy = attempts > 0 ? Math.round((score / attempts) * 100) : 0;
  const customQuizCount = useMemo(() => items.reduce((sum, item) => sum + item.quiz.length, 0), [items]);
  const selectedRoundOption = round?.options.find((option) => normalizeValue(option.text) === normalizeValue(selectedOption));
  const selectedWrongExplanation =
    correct === false && selectedRoundOption ? round?.wrongAnswerExplanations[selectedRoundOption.id] : "";

  function resetRound(nextMode: QuizMode) {
    setMode(nextMode);
    setCursor((value) => value + 1);
    setExcludeId(null);
    setSelectedOption("");
    setCorrect(null);
  }

  if (!round) {
    return (
      <article className="rounded-[24px] border border-dashed border-[#cbd8e7] bg-white p-6 text-sm font-semibold text-[#667085]">
        Chưa có dữ liệu ngữ pháp để luyện.
      </article>
    );
  }

  return (
    <article className="rounded-[24px] border border-[#d8e2ee] bg-white p-5 shadow-[0_18px_42px_rgba(18,60,105,0.08)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-full border border-[#d8e2ee] bg-white p-1">
          <button
            type="button"
            onClick={() => resetRound("pattern_to_meaning")}
            className={`rounded-full px-3 py-1.5 text-xs font-black transition ${
              mode === "pattern_to_meaning" ? "bg-[#123c69] text-white" : "text-[#526070] hover:bg-[#f3f6fb]"
            }`}
          >
            Mẫu -&gt; Nghĩa
          </button>
          <button
            type="button"
            onClick={() => resetRound("meaning_to_pattern")}
            className={`rounded-full px-3 py-1.5 text-xs font-black transition ${
              mode === "meaning_to_pattern" ? "bg-[#123c69] text-white" : "text-[#526070] hover:bg-[#f3f6fb]"
            }`}
          >
            Nghĩa -&gt; Mẫu
          </button>
          <button
            type="button"
            disabled={customQuizCount === 0}
            onClick={() => resetRound("custom_quiz")}
            className={`rounded-full px-3 py-1.5 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${
              mode === "custom_quiz" ? "bg-[#123c69] text-white" : "text-[#526070] hover:bg-[#f3f6fb]"
            }`}
          >
            Quiz JSON
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs font-black">
          <span className="rounded-full bg-[#e8fbf8] px-3 py-1 text-[#108373]">Đúng: {score}/{attempts}</span>
          <span className="rounded-full bg-[#eef3ff] px-3 py-1 text-[#3554a8]">Chính xác: {accuracy}%</span>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-[#d8e2ee] bg-[#f8fcff] px-4 py-4">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-[#667085]">
          {round.mode === "pattern_to_meaning"
            ? "Chọn nghĩa đúng cho mẫu"
            : round.mode === "meaning_to_pattern"
              ? "Chọn mẫu ngữ pháp đúng"
              : "Chọn đáp án đúng"}
        </p>
        <h3 className="mt-2 font-[var(--font-jp)] text-3xl font-black text-[#111827]">{round.prompt}</h3>
        {round.promptLines.length > 0 ? (
          <div className="mt-3 space-y-1">
            {round.promptLines.map((line) => (
              <p key={line} className="font-[var(--font-jp)] text-sm font-bold text-[#445169]">
                {line}
              </p>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {round.options.map((option) => (
          <button
            key={`${option.id}:${option.text}`}
            type="button"
            disabled={correct !== null}
            onClick={() => {
              if (correct !== null) {
                return;
              }
              const isCorrect = normalizeValue(option.text) === normalizeValue(round.answer);
              setSelectedOption(option.text);
              setCorrect(isCorrect);
              setAttempts((value) => value + 1);
              if (isCorrect) {
                setScore((value) => value + 1);
              }
            }}
            className={`rounded-2xl border px-4 py-3 text-left text-sm font-bold transition disabled:cursor-default ${optionClass(option.text, selectedOption, round.answer)}`}
          >
            {round.mode === "custom_quiz" ? <span className="mr-2 font-black text-[#123c69]">{option.id}.</span> : null}
            {option.text}
          </button>
        ))}
      </div>

      {correct !== null ? (
        <div className="mt-4 space-y-3 rounded-2xl border border-[#d8e2ee] bg-[#fbfdff] px-4 py-4">
          <p className={correct ? "text-sm font-black text-emerald-700" : "text-sm font-black text-rose-700"}>
            {correct ? "Đúng rồi!" : "Chưa đúng."} Đáp án: {round.answerLabel}
          </p>
          {round.explanation ? (
            <p className="text-sm font-semibold text-[#445169]">
              <span className="font-black text-[#263750]">Giải thích:</span> {round.explanation}
            </p>
          ) : null}
          {selectedWrongExplanation ? (
            <p className="text-sm font-semibold text-[#8a4b10]">
              <span className="font-black">Vì sao sai:</span> {selectedWrongExplanation}
            </p>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-[#e7edf6] bg-white px-3 py-3">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-[#667085]">Mẫu</p>
              <p className="mt-1 font-[var(--font-jp)] text-xl font-black text-[#111827]">
                {round.item.displayPattern || round.item.pattern}
              </p>
            </div>
            <div className="rounded-xl border border-[#e7edf6] bg-white px-3 py-3">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-[#667085]">Nghĩa</p>
              <p className="mt-1 text-base font-black text-[#111827]">
                {round.item.meaning}
                {round.item.meaningShort ? ` (${round.item.meaningShort})` : ""}
              </p>
            </div>
          </div>

          {round.item.structure ? (
            <p className="text-sm font-semibold text-[#445169]">
              <span className="font-black text-[#263750]">Cấu trúc:</span> {round.item.structure}
            </p>
          ) : null}

          {round.item.nuance ? (
            <p className="text-sm font-semibold text-[#445169]">
              <span className="font-black text-[#263750]">Sắc thái:</span> {round.item.nuance}
            </p>
          ) : null}

          {round.item.examples.length > 0 ? (
            <div className="space-y-2 rounded-xl border border-[#e7edf6] bg-white px-3 py-3">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-[#667085]">Ví dụ</p>
              {round.item.examples.slice(0, 2).map((example, index) => (
                <div key={`${round.item.id}-example-${index}`}>
                  <p className="font-[var(--font-jp)] text-sm font-black text-[#111827]">
                    {example.jpWithReading || example.jp}
                  </p>
                  {example.vi ? (
                    <p className="mt-0.5 text-xs font-semibold leading-5 text-[#667085]">{example.vi}</p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          {round.item.notes.length > 0 ? (
            <div className="space-y-1 rounded-xl border border-[#e7edf6] bg-white px-3 py-3">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-[#667085]">Ghi chú</p>
              {round.item.notes.slice(0, 2).map((note, index) => (
                <p key={`${round.item.id}-note-${index}`} className="text-sm font-semibold text-[#445169]">
                  - {note}
                </p>
              ))}
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => {
              setExcludeId(round.item.id);
              setCursor((value) => value + 1);
              setSelectedOption("");
              setCorrect(null);
            }}
            className="inline-flex items-center rounded-xl bg-[#123c69] px-4 py-2.5 text-sm font-black text-white transition hover:bg-[#0f3157]"
          >
            Câu tiếp theo
          </button>
        </div>
      ) : null}
    </article>
  );
}
