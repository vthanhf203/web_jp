"use client";

import { useMemo, useState } from "react";

import type { GrammarPracticeItem } from "@/lib/grammar-practice-store";

type QuizMode = "pattern_to_meaning" | "meaning_to_pattern";

type QuizRound = {
  item: GrammarPracticeItem;
  prompt: string;
  answer: string;
  options: string[];
  mode: QuizMode;
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

function poolValue(item: GrammarPracticeItem, mode: QuizMode): string {
  return mode === "pattern_to_meaning" ? item.meaning : item.pattern;
}

function buildRound(items: GrammarPracticeItem[], mode: QuizMode, excludeId: string | null): QuizRound | null {
  if (items.length === 0) {
    return null;
  }

  const candidates = items.length > 1 && excludeId ? items.filter((item) => item.id !== excludeId) : items;
  const picked = candidates[Math.floor(Math.random() * candidates.length)] ?? items[0];
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
    options: options.length > 0 ? options : [answer],
    mode,
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

  const round = useMemo(() => buildRound(items, mode, excludeId), [items, mode, cursor, excludeId]);
  const accuracy = attempts > 0 ? Math.round((score / attempts) * 100) : 0;

  if (!round) {
    return (
      <article className="rounded-[24px] border border-dashed border-[#cbd8e7] bg-white p-6 text-sm font-semibold text-[#667085]">
        Chua co du lieu ngu phap de luyen.
      </article>
    );
  }

  return (
    <article className="rounded-[24px] border border-[#d8e2ee] bg-white p-5 shadow-[0_18px_42px_rgba(18,60,105,0.08)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-full border border-[#d8e2ee] bg-white p-1">
          <button
            type="button"
            onClick={() => {
              setMode("pattern_to_meaning");
              setCursor((value) => value + 1);
              setExcludeId(null);
              setSelectedOption("");
              setCorrect(null);
            }}
            className={`rounded-full px-3 py-1.5 text-xs font-black transition ${
              mode === "pattern_to_meaning" ? "bg-[#123c69] text-white" : "text-[#526070] hover:bg-[#f3f6fb]"
            }`}
          >
            Mau -&gt; Nghia
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("meaning_to_pattern");
              setCursor((value) => value + 1);
              setExcludeId(null);
              setSelectedOption("");
              setCorrect(null);
            }}
            className={`rounded-full px-3 py-1.5 text-xs font-black transition ${
              mode === "meaning_to_pattern" ? "bg-[#123c69] text-white" : "text-[#526070] hover:bg-[#f3f6fb]"
            }`}
          >
            Nghia -&gt; Mau
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs font-black">
          <span className="rounded-full bg-[#e8fbf8] px-3 py-1 text-[#108373]">Dung: {score}/{attempts}</span>
          <span className="rounded-full bg-[#eef3ff] px-3 py-1 text-[#3554a8]">Chinh xac: {accuracy}%</span>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-[#d8e2ee] bg-[#f8fcff] px-4 py-4">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-[#667085]">
          {round.mode === "pattern_to_meaning" ? "Chon nghia dung cho mau" : "Chon mau ngu phap dung"}
        </p>
        <h3 className="mt-2 font-[var(--font-jp)] text-3xl font-black text-[#111827]">{round.prompt}</h3>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {round.options.map((option) => (
          <button
            key={option}
            type="button"
            disabled={correct !== null}
            onClick={() => {
              if (correct !== null) {
                return;
              }
              const isCorrect = normalizeValue(option) === normalizeValue(round.answer);
              setSelectedOption(option);
              setCorrect(isCorrect);
              setAttempts((value) => value + 1);
              if (isCorrect) {
                setScore((value) => value + 1);
              }
            }}
            className={`rounded-2xl border px-4 py-3 text-left text-sm font-bold transition disabled:cursor-default ${optionClass(option, selectedOption, round.answer)}`}
          >
            {option}
          </button>
        ))}
      </div>

      {correct !== null ? (
        <div className="mt-4 space-y-3 rounded-2xl border border-[#d8e2ee] bg-[#fbfdff] px-4 py-4">
          <p className={correct ? "text-sm font-black text-emerald-700" : "text-sm font-black text-rose-700"}>
            {correct ? "Dung roi!" : "Chua dung."} Dap an: {round.answer}
          </p>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-[#e7edf6] bg-white px-3 py-3">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-[#667085]">Mau</p>
              <p className="mt-1 font-[var(--font-jp)] text-xl font-black text-[#111827]">
                {round.item.displayPattern || round.item.pattern}
              </p>
            </div>
            <div className="rounded-xl border border-[#e7edf6] bg-white px-3 py-3">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-[#667085]">Nghia</p>
              <p className="mt-1 text-base font-black text-[#111827]">
                {round.item.meaning}
                {round.item.meaningShort ? ` (${round.item.meaningShort})` : ""}
              </p>
            </div>
          </div>

          {round.item.structure ? (
            <p className="text-sm font-semibold text-[#445169]">
              <span className="font-black text-[#263750]">Cau truc:</span> {round.item.structure}
            </p>
          ) : null}

          {round.item.nuance ? (
            <p className="text-sm font-semibold text-[#445169]">
              <span className="font-black text-[#263750]">Sac thai:</span> {round.item.nuance}
            </p>
          ) : null}

          {round.item.examples.length > 0 ? (
            <div className="space-y-2 rounded-xl border border-[#e7edf6] bg-white px-3 py-3">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-[#667085]">Vi du</p>
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
              <p className="text-xs font-black uppercase tracking-[0.12em] text-[#667085]">Ghi chu</p>
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
            Cau tiep theo
          </button>
        </div>
      ) : null}
    </article>
  );
}
