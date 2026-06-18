"use client";

import { ArrowRight, CheckCircle2, ListChecks, RotateCcw, Undo2 } from "lucide-react";
import { useMemo, useState } from "react";

import type {
  GrammarPracticeQuizDeck,
  GrammarPracticeQuizItem,
  GrammarPracticeQuizOption,
} from "@/lib/grammar-practice-store";

function normalizeAnswer(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, "").toLowerCase();
}

function seededNumber(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function seededShuffle<T>(list: T[], seed: string): T[] {
  const output = [...list];
  for (let index = output.length - 1; index > 0; index -= 1) {
    const swapIndex = seededNumber(`${seed}:${index}`) % (index + 1);
    [output[index], output[swapIndex]] = [output[swapIndex], output[index]];
  }
  return output;
}

function optionIsCorrect(question: GrammarPracticeQuizItem, option: GrammarPracticeQuizOption): boolean {
  const answer = normalizeAnswer(question.answer);
  return normalizeAnswer(option.id) === answer || normalizeAnswer(option.text) === answer;
}

function answerLabel(question: GrammarPracticeQuizItem): string {
  if (question.options.length > 0) {
    const matched = question.options.find((option) => optionIsCorrect(question, option));
    if (matched) {
      return `${matched.id}. ${matched.text}`;
    }
  }
  if (question.answerParts.length > 0) {
    return question.answerParts.join("");
  }
  if (Object.keys(question.answerMap).length > 0) {
    return Object.entries(question.answerMap)
      .map(([left, right]) => `${left} → ${right}`)
      .join(" / ");
  }
  return question.answer;
}

function questionParts(question: GrammarPracticeQuizItem): string[] {
  return question.prompt?.parts.length ? question.prompt.parts : question.answerParts;
}

function promptLines(question: GrammarPracticeQuizItem): string[] {
  return [question.prompt?.jpWithReading, question.prompt?.jp, question.prompt?.vi].filter(
    (entry): entry is string => Boolean(entry)
  );
}

function uniqueDeckLevels(decks: GrammarPracticeQuizDeck[]): string[] {
  return Array.from(new Set(decks.map((deck) => deck.jlptLevel).filter(Boolean)));
}

export function GrammarReviewQuizClient({ decks }: { decks: GrammarPracticeQuizDeck[] }) {
  const [selectedDeckId, setSelectedDeckId] = useState(decks[0]?.id ?? "");
  const [levelFilter, setLevelFilter] = useState("ALL");
  const [sessionSeed, setSessionSeed] = useState(1);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selectedOptionId, setSelectedOptionId] = useState("");
  const [textAnswer, setTextAnswer] = useState("");
  const [orderedIndexes, setOrderedIndexes] = useState<number[]>([]);
  const [pairAnswers, setPairAnswers] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState(false);
  const [lastCorrect, setLastCorrect] = useState<boolean | null>(null);
  const [score, setScore] = useState(0);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [finished, setFinished] = useState(false);

  const filteredDecks = useMemo(
    () => (levelFilter === "ALL" ? decks : decks.filter((deck) => deck.jlptLevel === levelFilter)),
    [decks, levelFilter]
  );
  const selectedDeck = filteredDecks.find((deck) => deck.id === selectedDeckId) ?? filteredDecks[0] ?? decks[0];
  const questions = useMemo(() => {
    if (!selectedDeck) {
      return [];
    }
    return selectedDeck.reviewConfig.shuffleItems
      ? seededShuffle(selectedDeck.items, `${selectedDeck.id}:${sessionSeed}:questions`)
      : [...selectedDeck.items];
  }, [selectedDeck, sessionSeed]);
  const activeQuestion = questions[questionIndex] ?? null;
  const activeOptions = useMemo(() => {
    if (!activeQuestion) {
      return [];
    }
    return selectedDeck?.reviewConfig.shuffleOptions
      ? seededShuffle(activeQuestion.options, `${selectedDeck.id}:${sessionSeed}:${activeQuestion.id}:options`)
      : activeQuestion.options;
  }, [activeQuestion, selectedDeck, sessionSeed]);
  const levels = useMemo(() => uniqueDeckLevels(decks), [decks]);
  const percent = answeredCount > 0 ? Math.round((score / answeredCount) * 100) : 0;
  const passScore = selectedDeck?.reviewConfig.passScorePercent ?? 80;
  const parts = activeQuestion ? questionParts(activeQuestion) : [];
  const activePairs = activeQuestion?.pairs;
  const orderedParts = orderedIndexes.map((index) => parts[index] ?? "");

  function resetAnswerState() {
    setSelectedOptionId("");
    setTextAnswer("");
    setOrderedIndexes([]);
    setPairAnswers({});
    setChecked(false);
    setLastCorrect(null);
  }

  function resetSession(deckId = selectedDeck?.id ?? "") {
    if (deckId) {
      setSelectedDeckId(deckId);
    }
    setSessionSeed((value) => value + 1);
    setQuestionIndex(0);
    setScore(0);
    setAnsweredCount(0);
    setFinished(false);
    resetAnswerState();
  }

  function checkCurrentAnswer(): boolean {
    if (!activeQuestion) {
      return false;
    }

    if (activeQuestion.options.length > 0) {
      const picked = activeQuestion.options.find((option) => option.id === selectedOptionId);
      return picked ? optionIsCorrect(activeQuestion, picked) : false;
    }

    if (activeQuestion.pairs && Object.keys(activeQuestion.answerMap).length > 0) {
      return Object.entries(activeQuestion.answerMap).every(([leftId, rightId]) => pairAnswers[leftId] === rightId);
    }

    if (activeQuestion.answerParts.length > 0) {
      const expected = activeQuestion.answerParts.map(normalizeAnswer);
      const actual = orderedParts.map(normalizeAnswer);
      return expected.length === actual.length && expected.every((part, index) => part === actual[index]);
    }

    const accepted = [activeQuestion.answer, ...activeQuestion.acceptedAnswers].map(normalizeAnswer);
    return accepted.includes(normalizeAnswer(textAnswer));
  }

  function canCheck(): boolean {
    if (!activeQuestion || checked) {
      return false;
    }
    if (activeQuestion.options.length > 0) {
      return Boolean(selectedOptionId);
    }
    if (activeQuestion.pairs && Object.keys(activeQuestion.answerMap).length > 0) {
      return Object.keys(activeQuestion.answerMap).every((leftId) => Boolean(pairAnswers[leftId]));
    }
    if (activeQuestion.answerParts.length > 0) {
      return orderedIndexes.length === activeQuestion.answerParts.length;
    }
    return textAnswer.trim().length > 0;
  }

  function submitAnswer() {
    if (!canCheck()) {
      return;
    }
    const correct = checkCurrentAnswer();
    setChecked(true);
    setLastCorrect(correct);
    setAnsweredCount((value) => value + 1);
    if (correct) {
      setScore((value) => value + 1);
    }
  }

  function goNext() {
    if (questionIndex >= questions.length - 1) {
      setFinished(true);
      return;
    }
    setQuestionIndex((value) => value + 1);
    resetAnswerState();
  }

  if (decks.length === 0) {
    return (
      <article className="rounded-[24px] border border-dashed border-[#cbd8e7] bg-white p-6 text-sm font-semibold text-[#667085]">
        Chưa có bộ quiz ngữ pháp. Hãy import JSON dạng deck quiz để bắt đầu ôn.
      </article>
    );
  }

  if (!selectedDeck || questions.length === 0) {
    return (
      <article className="rounded-[24px] border border-dashed border-[#cbd8e7] bg-white p-6 text-sm font-semibold text-[#667085]">
        Bộ lọc hiện tại chưa có câu quiz.
      </article>
    );
  }

  if (finished) {
    const passed = percent >= passScore;
    return (
      <article className="rounded-[24px] border border-[#d8e2ee] bg-white p-5 shadow-[0_18px_42px_rgba(18,60,105,0.08)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#22a6a1]">Kết quả quiz</p>
            <h3 className="mt-1 text-2xl font-black text-[#111827]">{selectedDeck.deckName}</h3>
          </div>
          <span
            className={`rounded-full px-4 py-2 text-sm font-black ${
              passed ? "bg-emerald-50 text-emerald-700" : "bg-orange-50 text-orange-700"
            }`}
          >
            {score}/{questions.length} câu · {percent}%
          </span>
        </div>
        <p className="mt-4 text-sm font-semibold text-[#445169]">
          {passed ? "Đạt mục tiêu ôn tập." : `Chưa đạt mốc ${passScore}%, làm lại một lượt nữa nhé.`}
        </p>
        {selectedDeck.reviewConfig.weakPointRules.length > 0 ? (
          <div className="mt-4 rounded-2xl border border-[#e7edf6] bg-[#fbfdff] p-4">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-[#667085]">Gợi ý ôn lại</p>
            <div className="mt-2 space-y-2">
              {selectedDeck.reviewConfig.weakPointRules.slice(0, 3).map((rule) => (
                <p key={rule.condition} className="text-sm font-semibold text-[#445169]">
                  {rule.messageVi}
                </p>
              ))}
            </div>
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => resetSession(selectedDeck.id)}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#123c69] px-4 py-2.5 text-sm font-black text-white transition hover:bg-[#0f3157]"
        >
          <RotateCcw className="h-4 w-4" />
          Làm lại quiz
        </button>
      </article>
    );
  }

  return (
    <article className="rounded-[24px] border border-[#d8e2ee] bg-white p-5 shadow-[0_18px_42px_rgba(18,60,105,0.08)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-[#22a6a1]">
            <ListChecks className="h-4 w-4" />
            Quiz ôn ngữ pháp
          </p>
          <h3 className="mt-1 text-2xl font-black text-[#111827]">{selectedDeck.deckName}</h3>
          {selectedDeck.instructionsVi ? (
            <p className="mt-1 max-w-4xl text-sm font-semibold leading-6 text-[#526070]">
              {selectedDeck.instructionsVi}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs font-black">
          <span className="rounded-full bg-[#eef3ff] px-3 py-1 text-[#3554a8]">
            Câu {questionIndex + 1}/{questions.length}
          </span>
          <span className="rounded-full bg-[#e8fbf8] px-3 py-1 text-[#108373]">
            Đúng: {score}/{answeredCount}
          </span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setLevelFilter("ALL");
            resetSession(decks[0]?.id ?? "");
          }}
          className={`rounded-full border px-3 py-1.5 text-xs font-black transition ${
            levelFilter === "ALL" ? "border-[#123c69] bg-[#123c69] text-white" : "border-[#d8e2ee] text-[#526070]"
          }`}
        >
          Tất cả
        </button>
        {levels.map((level) => (
          <button
            key={level}
            type="button"
            onClick={() => {
              const firstDeck = decks.find((deck) => deck.jlptLevel === level);
              setLevelFilter(level);
              resetSession(firstDeck?.id ?? "");
            }}
            className={`rounded-full border px-3 py-1.5 text-xs font-black transition ${
              levelFilter === level ? "border-[#123c69] bg-[#123c69] text-white" : "border-[#d8e2ee] text-[#526070]"
            }`}
          >
            {level}
          </button>
        ))}
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {filteredDecks.map((deck) => (
          <button
            key={deck.id}
            type="button"
            onClick={() => resetSession(deck.id)}
            className={`shrink-0 rounded-full border px-4 py-2 text-sm font-black transition ${
              deck.id === selectedDeck.id
                ? "border-[#22a6a1] bg-[#dffaf2] text-[#0c735d]"
                : "border-[#d8e2ee] bg-white text-[#526070] hover:bg-[#f8fcff]"
            }`}
          >
            {deck.deckName} ({deck.items.length})
          </button>
        ))}
      </div>

      {activeQuestion ? (
        <div className="mt-5 rounded-2xl border border-[#d8e2ee] bg-[#f8fcff] p-4">
          <div className="flex flex-wrap gap-2 text-[11px] font-black uppercase tracking-[0.1em]">
            <span className="rounded-full bg-white px-2.5 py-1 text-[#667085]">{activeQuestion.type}</span>
            {activeQuestion.skill ? (
              <span className="rounded-full bg-white px-2.5 py-1 text-[#667085]">{activeQuestion.skill}</span>
            ) : null}
            {activeQuestion.targetPattern ? (
              <span className="inline-flex max-w-full items-center rounded-full bg-[#fff8e8] px-4 py-1.5 font-[var(--font-jp)] text-sm font-black normal-case leading-snug tracking-normal text-[#8a4b00] md:text-base">
                {activeQuestion.targetPattern}
              </span>
            ) : null}
          </div>
          <h4 className="mt-3 text-xl font-black text-[#111827]">{activeQuestion.question}</h4>
          {promptLines(activeQuestion).length > 0 ? (
            <div className="mt-3 space-y-1">
              {promptLines(activeQuestion).map((line) => (
                <p key={line} className="font-[var(--font-jp)] text-base font-bold leading-7 text-[#263750]">
                  {line}
                </p>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {activeQuestion?.options.length ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {activeOptions.map((option) => {
            const selected = selectedOptionId === option.id;
            const correct = checked && optionIsCorrect(activeQuestion, option);
            const wrong = checked && selected && !correct;
            return (
              <button
                key={option.id}
                type="button"
                disabled={checked}
                onClick={() => setSelectedOptionId(option.id)}
                className={`rounded-2xl border px-4 py-3 text-left text-sm font-bold transition disabled:cursor-default ${
                  correct
                    ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                    : wrong
                      ? "border-rose-300 bg-rose-50 text-rose-800"
                      : selected
                        ? "border-[#22a6a1] bg-[#e8fbf8] text-[#0c735d]"
                        : "border-[#d8e2ee] bg-white text-[#172033] hover:border-[#9fc2df] hover:bg-[#f8fcff]"
                }`}
              >
                <span className="mr-2 font-black text-[#123c69]">{option.id}.</span>
                {option.text}
              </button>
            );
          })}
        </div>
      ) : activePairs ? (
        <div className="mt-4 space-y-3">
          {activePairs.left.map((left) => (
            <label
              key={left.id}
              className="grid gap-2 rounded-2xl border border-[#d8e2ee] bg-white p-3 md:grid-cols-[minmax(0,1fr)_280px] md:items-center"
            >
              <span className="font-[var(--font-jp)] text-sm font-black text-[#172033]">{left.text}</span>
              <select
                value={pairAnswers[left.id] ?? ""}
                disabled={checked}
                onChange={(event) => setPairAnswers((value) => ({ ...value, [left.id]: event.target.value }))}
                className="h-11 rounded-xl border border-[#d8e2ee] bg-white px-3 text-sm font-bold text-[#172033] outline-none focus:border-[#22a6a1] focus:ring-4 focus:ring-[#d7f4f1]"
              >
                <option value="">Chọn nghĩa</option>
                {activePairs.right.map((right) => (
                  <option key={right.id} value={right.id}>
                    {right.id}. {right.text}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      ) : activeQuestion && parts.length > 0 ? (
        <div className="mt-4 space-y-3">
          <div className="min-h-14 rounded-2xl border border-[#d8e2ee] bg-white p-3">
            {orderedParts.length > 0 ? (
              <p className="font-[var(--font-jp)] text-base font-black text-[#172033]">{orderedParts.join("")}</p>
            ) : (
              <p className="text-sm font-semibold text-[#98a2b3]">Chọn các mảnh câu theo đúng thứ tự.</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {parts.map((part, index) => (
              <button
                key={`${part}-${index}`}
                type="button"
                disabled={checked || orderedIndexes.includes(index)}
                onClick={() => setOrderedIndexes((value) => [...value, index])}
                className="rounded-xl border border-[#d8e2ee] bg-white px-3 py-2 font-[var(--font-jp)] text-sm font-black text-[#172033] transition hover:bg-[#f8fcff] disabled:opacity-45"
              >
                {part}
              </button>
            ))}
            <button
              type="button"
              disabled={checked || orderedIndexes.length === 0}
              onClick={() => setOrderedIndexes((value) => value.slice(0, -1))}
              className="inline-flex items-center gap-1 rounded-xl border border-[#ffd6a8] bg-[#fff7ed] px-3 py-2 text-sm font-black text-[#b45b10] disabled:opacity-45"
            >
              <Undo2 className="h-4 w-4" />
              Lùi
            </button>
          </div>
        </div>
      ) : (
        <input
          value={textAnswer}
          disabled={checked}
          onChange={(event) => setTextAnswer(event.target.value)}
          className="mt-4 h-12 w-full rounded-2xl border border-[#d8e2ee] bg-white px-4 font-[var(--font-jp)] text-sm font-bold text-[#172033] outline-none focus:border-[#22a6a1] focus:ring-4 focus:ring-[#d7f4f1]"
          placeholder="Nhập đáp án"
        />
      )}

      <div
        className={`mt-4 min-h-[132px] rounded-2xl border p-4 transition-colors ${
          checked && activeQuestion ? "border-[#d8e2ee] bg-[#fbfdff]" : "border-transparent bg-transparent"
        }`}
      >
        {checked && activeQuestion ? (
          <>
            <p className={lastCorrect ? "text-sm font-black text-emerald-700" : "text-sm font-black text-rose-700"}>
              {lastCorrect ? "Đúng rồi!" : "Chưa đúng."} Đáp án: {answerLabel(activeQuestion)}
            </p>
            {activeQuestion.explanation ? (
              <p className="mt-2 text-sm font-semibold leading-6 text-[#445169]">
                <span className="font-black text-[#263750]">Giải thích:</span> {activeQuestion.explanation}
              </p>
            ) : null}
            {activeQuestion.fullSentence ? (
              <div className="mt-3 rounded-xl border border-[#e7edf6] bg-white p-3">
                {activeQuestion.fullSentence.jpWithReading || activeQuestion.fullSentence.jp ? (
                  <p className="font-[var(--font-jp)] text-sm font-black text-[#111827]">
                    {activeQuestion.fullSentence.jpWithReading || activeQuestion.fullSentence.jp}
                  </p>
                ) : null}
                {activeQuestion.fullSentence.vi ? (
                  <p className="mt-1 text-sm font-semibold text-[#667085]">{activeQuestion.fullSentence.vi}</p>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {!checked ? (
          <button
            type="button"
            disabled={!canCheck()}
            onClick={submitAnswer}
            className="inline-flex items-center gap-2 rounded-xl bg-[#123c69] px-4 py-2.5 text-sm font-black text-white transition hover:bg-[#0f3157] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CheckCircle2 className="h-4 w-4" />
            Chấm câu này
          </button>
        ) : (
          <button
            type="button"
            onClick={goNext}
            className="inline-flex items-center gap-2 rounded-xl bg-[#123c69] px-4 py-2.5 text-sm font-black text-white transition hover:bg-[#0f3157]"
          >
            {questionIndex >= questions.length - 1 ? "Xem kết quả" : "Câu tiếp theo"}
            <ArrowRight className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={() => resetSession(selectedDeck.id)}
          className="inline-flex items-center gap-2 rounded-xl border border-[#d8e2ee] bg-white px-4 py-2.5 text-sm font-black text-[#526070] transition hover:bg-[#f8fcff]"
        >
          <RotateCcw className="h-4 w-4" />
          Làm lại bộ này
        </button>
      </div>
    </article>
  );
}
