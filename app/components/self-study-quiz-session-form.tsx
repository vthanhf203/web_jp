"use client";

import {
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  Check,
  CheckCircle2,
  Flame,
  RotateCcw,
  Sparkles,
  Target,
  Trophy,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  clearLearningProgress,
  readLearningProgress,
  upsertLearningProgress,
} from "@/app/components/learning-progress-storage";

type QuizQuestionItem = {
  id: string;
  level: string;
  category: string;
  prompt: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctOption: "A" | "B" | "C" | "D";
  explanation: string | null;
  radical: {
    symbol: string;
    name: string;
    meaning: string;
    position: string;
  } | null;
};

type Props = {
  questions: QuizQuestionItem[];
  category: string;
};

type Choice = "A" | "B" | "C" | "D";

const choiceOrder: Choice[] = ["A", "B", "C", "D"];
const FURIGANA_META_PATTERN = /\n?\[\[furigana:([\s\S]*?)\]\]\s*$/;

function deckLabel(category: string): string {
  return category.replace(/^SELF::/, "") || "Tu hoc";
}

function promptClass(prompt: string): string {
  if (prompt.length <= 4) {
    return "text-6xl sm:text-7xl";
  }
  if (prompt.length <= 18) {
    return "text-3xl sm:text-5xl";
  }
  return "text-xl sm:text-2xl";
}

function containsJapanese(text: string): boolean {
  return /[\u3040-\u30ff\u3400-\u9fff]/.test(text);
}

function optionTextClass(text: string): string {
  return containsJapanese(text)
    ? "text-3xl font-black sm:text-4xl"
    : "text-xl font-extrabold sm:text-2xl";
}

function inferReadingFromPrompt(prompt: string): string {
  return prompt.match(/[\u3040-\u30ffー]+/)?.[0] ?? "";
}

function parseExplanation(rawExplanation: string | null): {
  text: string;
  readings: Partial<Record<Choice, string>>;
} {
  const raw = rawExplanation ?? "";
  const match = raw.match(FURIGANA_META_PATTERN);
  if (!match) {
    return { text: raw.trim(), readings: {} };
  }

  try {
    const parsed = JSON.parse(match[1]) as Partial<Record<Choice, unknown>>;
    return {
      text: raw.replace(FURIGANA_META_PATTERN, "").trim(),
      readings: Object.fromEntries(
        choiceOrder
          .map((key) => [key, typeof parsed[key] === "string" ? parsed[key].trim() : ""])
          .filter((entry): entry is [Choice, string] => Boolean(entry[1]))
      ) as Partial<Record<Choice, string>>,
    };
  } catch {
    return { text: raw.replace(FURIGANA_META_PATTERN, "").trim(), readings: {} };
  }
}

function buildQuestionOrder(questions: QuizQuestionItem[]): string[] {
  return questions.map((question) => question.id);
}

function buildOrderedQuestions(
  questions: QuizQuestionItem[],
  questionOrder: string[]
): QuizQuestionItem[] {
  const byId = new Map(questions.map((question) => [question.id, question]));
  const usedIds = new Set<string>();
  const ordered = questionOrder
    .map((id) => {
      const question = byId.get(id);
      if (question) {
        usedIds.add(id);
      }
      return question;
    })
    .filter((question): question is QuizQuestionItem => Boolean(question));
  const missing = questions.filter((question) => !usedIds.has(question.id));
  return [...ordered, ...missing];
}

function normalizeChoiceMap(input: Record<string, string> | undefined): Record<string, Choice | undefined> {
  if (!input) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(input).filter((entry): entry is [string, Choice] =>
      choiceOrder.includes(entry[1] as Choice)
    )
  );
}

function correctAnswerText(question: QuizQuestionItem): string {
  if (question.correctOption === "A") {
    return question.optionA;
  }
  if (question.correctOption === "B") {
    return question.optionB;
  }
  if (question.correctOption === "C") {
    return question.optionC;
  }
  return question.optionD;
}

export function SelfStudyQuizSessionForm({ questions, category }: Props) {
  const restoredProgressRef = useRef(false);
  const [sessionHref, setSessionHref] = useState("");
  const itemSignature = useMemo(
    () => questions.map((question) => question.id).sort().join("|"),
    [questions]
  );
  const [questionOrder, setQuestionOrder] = useState(() => buildQuestionOrder(questions));
  const [index, setIndex] = useState(0);
  const [selectedById, setSelectedById] = useState<Record<string, Choice | undefined>>({});
  const [checkedById, setCheckedById] = useState<Record<string, boolean>>({});

  const activeQuestions = useMemo(
    () => buildOrderedQuestions(questions, questionOrder),
    [questionOrder, questions]
  );
  const current = (activeQuestions[index] ?? activeQuestions[0]) as QuizQuestionItem;
  const selected = selectedById[current.id];
  const checked = Boolean(checkedById[current.id]);
  const totalCount = activeQuestions.length;
  const progress = Math.round(((index + 1) / totalCount) * 100);
  const radical = current.radical;

  const checkedCount = useMemo(
    () => activeQuestions.filter((question) => checkedById[question.id]).length,
    [activeQuestions, checkedById]
  );
  const correctCount = useMemo(
    () =>
      activeQuestions.reduce((sum, question) => {
        const picked = selectedById[question.id];
        return sum + (checkedById[question.id] && picked === question.correctOption ? 1 : 0);
      }, 0),
    [activeQuestions, checkedById, selectedById]
  );
  const wrongItems = useMemo(
    () =>
      activeQuestions.filter((question) => {
        const picked = selectedById[question.id];
        return checkedById[question.id] && picked && picked !== question.correctOption;
      }),
    [activeQuestions, checkedById, selectedById]
  );
  const selectedCount = useMemo(
    () => activeQuestions.filter((question) => Boolean(selectedById[question.id])).length,
    [activeQuestions, selectedById]
  );
  const accuracy = checkedCount > 0 ? Math.round((correctCount / checkedCount) * 100) : 0;

  const options: Record<Choice, string> = {
    A: current.optionA,
    B: current.optionB,
    C: current.optionC,
    D: current.optionD,
  };
  const explanation = parseExplanation(current.explanation);
  const readings: Partial<Record<Choice, string>> = {
    ...explanation.readings,
  };
  const inferredReading = inferReadingFromPrompt(current.prompt);
  if (!readings[current.correctOption] && inferredReading) {
    readings[current.correctOption] = inferredReading;
  }

  useEffect(() => {
    restoredProgressRef.current = false;
    if (typeof window === "undefined") {
      return;
    }

    const href = `${window.location.pathname}${window.location.search}`;
    const defaultOrder = buildQuestionOrder(questions);
    const questionIdSet = new Set(defaultOrder);
    const saved = readLearningProgress(href);
    setSessionHref(href);

    if (saved && saved.itemSignature === itemSignature && saved.totalCount > 0) {
      const savedOrder = (saved.questionOrder ?? []).filter((id) => questionIdSet.has(id));
      const nextOrder = savedOrder.length === questions.length ? savedOrder : defaultOrder;
      setQuestionOrder(nextOrder);
      setSelectedById(normalizeChoiceMap(saved.selectedAnswers));
      setCheckedById(saved.checkedAnswers ?? {});
      setIndex(Math.min(Math.max(0, saved.currentIndex), Math.max(0, nextOrder.length - 1)));
    } else {
      setQuestionOrder(defaultOrder);
      setSelectedById({});
      setCheckedById({});
      setIndex(0);
    }

    restoredProgressRef.current = true;
  }, [itemSignature, questions]);

  useEffect(() => {
    if (!restoredProgressRef.current || !sessionHref || !current || totalCount <= 0) {
      return;
    }
    if (selectedCount === 0 && checkedCount === 0 && index === 0) {
      return;
    }

    upsertLearningProgress({
      id: sessionHref,
      href: sessionHref,
      kind: "quiz",
      title: `Quiz ${deckLabel(category)}`,
      mode: "quiz",
      currentIndex: Math.min(index, Math.max(0, totalCount - 1)),
      totalCount,
      percent: Math.round((selectedCount / totalCount) * 100),
      currentLabel: current.prompt,
      subLabel: correctAnswerText(current),
      hardCount: wrongItems.length,
      itemSignature,
      questionOrder: activeQuestions.map((question) => question.id),
      selectedAnswers: Object.fromEntries(
        Object.entries(selectedById).filter((entry): entry is [string, Choice] => Boolean(entry[1]))
      ),
      checkedAnswers: checkedById,
      updatedAt: Date.now(),
    });
  }, [
    activeQuestions,
    category,
    checkedById,
    checkedCount,
    current,
    index,
    itemSignature,
    selectedById,
    selectedCount,
    sessionHref,
    totalCount,
    wrongItems.length,
  ]);

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className="overflow-hidden rounded-[28px] border border-[#dfe6ff] bg-white shadow-[0_24px_70px_rgba(47,62,149,0.13)]">
        <div className="border-b border-[#eef2ff] bg-[#fbfcff] px-5 py-4 sm:px-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase text-[#6875c7]">
                Quiz nhanh
              </p>
              <h2 className="mt-1 text-xl font-extrabold text-[#111735]">On Quiz Kanji</h2>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#dbe3ff] bg-white px-3 py-2 text-xs font-bold text-[#3d49c6] shadow-[0_8px_18px_rgba(61,73,198,0.08)]">
              <Sparkles className="h-4 w-4" />
              {deckLabel(category)}
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <p className="min-w-max text-sm font-extrabold text-[#111735]">
              Cau {index + 1} / {totalCount}
            </p>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#e5e8f3]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#4458df] via-[#5a6eff] to-[#12c7a2] transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="w-10 text-right text-sm font-extrabold text-[#4458df]">{progress}%</p>
          </div>
        </div>

        <div className="px-5 py-5 sm:px-7">
          <div className="relative min-h-[170px] overflow-hidden rounded-[24px] border border-[#edf1ff] bg-[linear-gradient(135deg,#ffffff_0%,#f9fbff_48%,#eef9ff_100%)] px-5 py-6 text-center">
            <h1
              className={`mx-auto mt-2 max-w-3xl break-words font-black leading-tight text-[#071033] ${promptClass(
                current.prompt
              )}`}
            >
              {current.prompt}
            </h1>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              <span className="rounded-full border border-[#d8dfff] bg-[#f3f5ff] px-3 py-1 text-xs font-bold text-[#4b57d9]">
                {current.level}
              </span>
              <span className="rounded-full border border-[#d7f4ec] bg-[#effcf8] px-3 py-1 text-xs font-bold text-[#0f8f75]">
                {selectedCount}/{totalCount} da chon
              </span>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {choiceOrder.map((key) => {
              const value = options[key];
              const reading = readings[key];
              const picked = selected === key;
              const isCorrect = current.correctOption === key;
              const showCorrect = checked && isCorrect;
              const showWrong = checked && picked && !isCorrect;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    if (checked) {
                      return;
                    }
                    setSelectedById((prev) => ({ ...prev, [current.id]: key }));
                  }}
                  className={`group min-h-[80px] rounded-2xl border px-4 py-2.5 text-left shadow-[0_10px_22px_rgba(17,24,57,0.06)] transition duration-200 ${
                    showCorrect
                      ? "border-[#1ebf93] bg-[#ecfff8] shadow-[0_12px_28px_rgba(30,191,147,0.18)]"
                      : showWrong
                        ? "border-[#f06b88] bg-[#fff0f4] shadow-[0_12px_28px_rgba(240,107,136,0.16)]"
                        : picked
                          ? "border-[#5264ee] bg-[#f4f6ff] shadow-[0_14px_30px_rgba(82,100,238,0.18)]"
                          : "border-[#e2e7f4] bg-white hover:-translate-y-0.5 hover:border-[#bfc9ff] hover:bg-[#fbfcff]"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`grid h-9 w-9 place-items-center rounded-full border text-sm font-black transition ${
                        showCorrect
                          ? "border-[#1ebf93] bg-[#1ebf93] text-white"
                          : showWrong
                            ? "border-[#f06b88] bg-[#f06b88] text-white"
                            : picked
                              ? "border-[#5264ee] bg-[#5264ee] text-white"
                              : "border-[#d7ddec] bg-[#f7f9ff] text-[#576179] group-hover:border-[#5264ee]"
                      }`}
                    >
                      {showCorrect ? <Check className="h-5 w-5" /> : showWrong ? <X className="h-5 w-5" /> : key}
                    </span>
                    <span className="min-w-0 flex-1 break-words leading-snug text-[#141b3d]">
                      <span
                        className={`block min-h-5 text-sm font-bold leading-5 text-[#6b7390] transition-opacity ${
                          checked && reading ? "opacity-100" : "opacity-0"
                        }`}
                        aria-hidden={!(checked && reading)}
                      >
                        {reading || "reading"}
                      </span>
                      <span className={`block ${optionTextClass(value)}`}>{value}</span>
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          <div
            className={`mt-4 min-h-[78px] rounded-2xl border px-4 py-2.5 text-sm transition-colors ${
              checked
                ? "border-[#dfe6ff] bg-[#f8faff] text-[#26345f]"
                : "border-transparent bg-transparent text-transparent"
            }`}
            aria-hidden={!checked}
          >
            <div className={checked ? "flex items-start gap-3 opacity-100" : "flex items-start gap-3 opacity-0"}>
              <span
                className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full ${
                  selected === current.correctOption ? "bg-[#1ebf93] text-white" : "bg-[#f06b88] text-white"
                }`}
              >
                {selected === current.correctOption ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : (
                  <X className="h-5 w-5" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-bold">
                  {selected === current.correctOption ? "Chinh xac." : "Chua dung."} Dap an:{" "}
                  {current.correctOption}.{" "}
                  {readings[current.correctOption] ? (
                    <ruby className="text-lg font-black">
                      {options[current.correctOption]}
                      <rt className="text-xs font-bold text-[#6b7390]">
                        {readings[current.correctOption]}
                      </rt>
                    </ruby>
                  ) : (
                    options[current.correctOption]
                  )}
                </p>
                {explanation.text ? <p className="mt-1 text-[#58617e]">{explanation.text}</p> : null}
                {radical ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-[#c8f2e7] bg-white/80 px-3 py-2 shadow-[0_10px_22px_rgba(18,169,142,0.07)]">
                    <span className="rounded-full bg-[#ecfff8] px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-[#0f8f75]">
                      Bo thu
                    </span>
                    {radical.symbol ? (
                      <span className="grid h-9 min-w-9 place-items-center rounded-xl border border-[#bdece1] bg-[#f7fffc] px-2 text-xl font-black text-[#071033]">
                        {radical.symbol}
                      </span>
                    ) : null}
                    <span className="text-sm font-extrabold text-[#26345f]">
                      {[radical.name, radical.meaning].filter(Boolean).join(" = ") || "Chua co ten bo thu"}
                    </span>
                    {radical.position ? (
                      <span className="rounded-full bg-[#f1f5ff] px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.1em] text-[#64708c]">
                        {radical.position}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)_140px]">
            <button
              type="button"
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#cfd7f6] bg-white px-4 py-3 text-sm font-extrabold text-[#4458df] transition hover:bg-[#f7f9ff] disabled:cursor-not-allowed disabled:opacity-45"
              onClick={() => setIndex((prev) => Math.max(0, prev - 1))}
              disabled={index === 0}
            >
              <ArrowLeft className="h-4 w-4" />
              Cau truoc
            </button>
            <button
              type="button"
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#4256dc] to-[#5c6cff] px-5 py-3 text-sm font-extrabold text-white shadow-[0_16px_34px_rgba(66,86,220,0.32)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_42px_rgba(66,86,220,0.36)] disabled:cursor-not-allowed disabled:opacity-45"
              onClick={() => {
                if (!selected) {
                  return;
                }
                setCheckedById((prev) => ({ ...prev, [current.id]: true }));
              }}
              disabled={!selected || checked}
            >
              <CheckCircle2 className="h-5 w-5" />
              Kiem tra
            </button>
            <button
              type="button"
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#cfd7f6] bg-white px-4 py-3 text-sm font-extrabold text-[#4458df] transition hover:bg-[#f7f9ff] disabled:cursor-not-allowed disabled:opacity-45"
              onClick={() => {
                if (index >= totalCount - 1) {
                  return;
                }
                setIndex((prev) => prev + 1);
              }}
              disabled={index >= totalCount - 1}
            >
              Cau tiep
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

      <aside className="space-y-4">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-1">
          <article className="rounded-2xl border border-[#e2e7f4] bg-white p-4 shadow-[0_14px_34px_rgba(17,24,57,0.07)]">
            <div className="flex items-center justify-between">
              <Target className="h-5 w-5 text-[#3e8df2]" />
              <span className="text-xs font-bold text-[#74809d]">Accuracy</span>
            </div>
            <p className="mt-3 text-3xl font-black text-[#101735]">{accuracy}%</p>
            <div className="mt-3 flex h-7 items-end gap-1">
              {[32, 44, 38, 58, 50, 70, Math.max(18, accuracy)].map((height, itemIndex) => (
                <span
                  key={itemIndex}
                  className="flex-1 rounded-full bg-[#b7d7ff]"
                  style={{ height: `${height}%` }}
                />
              ))}
            </div>
          </article>
          <article className="rounded-2xl border border-[#fde8ca] bg-[#fff9ef] p-4 shadow-[0_14px_34px_rgba(149,91,17,0.07)]">
            <div className="flex items-center justify-between">
              <Flame className="h-5 w-5 text-[#f0822b]" />
              <span className="text-xs font-bold text-[#9a6b38]">Score</span>
            </div>
            <p className="mt-3 text-3xl font-black text-[#101735]">{correctCount}</p>
            <p className="mt-1 text-xs font-semibold text-[#9a6b38]">{wrongItems.length} cau sai</p>
          </article>
          <article className="rounded-2xl border border-[#e5e1ff] bg-[#fbfaff] p-4 shadow-[0_14px_34px_rgba(78,63,149,0.07)]">
            <div className="flex items-center justify-between">
              <BookOpenCheck className="h-5 w-5 text-[#6555e8]" />
              <span className="text-xs font-bold text-[#746f99]">Da hoc</span>
            </div>
            <p className="mt-3 text-3xl font-black text-[#101735]">
              {checkedCount}/{totalCount}
            </p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#e8e6ff]">
              <div
                className="h-full rounded-full bg-[#6555e8] transition-all"
                style={{ width: `${Math.round((checkedCount / totalCount) * 100)}%` }}
              />
            </div>
          </article>
        </div>

        <article className="rounded-2xl border border-[#e2e7f4] bg-white p-4 shadow-[0_14px_34px_rgba(17,24,57,0.07)]">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-[#101735]">Cau can xem lai</h3>
            <Trophy className="h-5 w-5 text-[#e2a638]" />
          </div>
          <div className="mt-3 space-y-2">
            {wrongItems.length > 0 ? (
              wrongItems.slice(0, 4).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setIndex(activeQuestions.findIndex((question) => question.id === item.id))}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-[#f4d5df] bg-[#fff6f8] px-3 py-2 text-left transition hover:bg-[#fff0f4]"
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-[#27304f]">{item.prompt}</span>
                  <span className="text-xs font-black text-[#ef5f85]">{item.level}</span>
                </button>
              ))
            ) : (
              <p className="rounded-xl bg-[#f7f9ff] px-3 py-3 text-sm font-semibold text-[#68758d]">
                Chua co cau sai.
              </p>
            )}
          </div>
        </article>

        <button
          type="button"
          onClick={() => {
            setIndex(0);
            setSelectedById({});
            setCheckedById({});
            if (sessionHref) {
              clearLearningProgress(sessionHref);
            }
          }}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-[#dce3f5] bg-white px-4 py-3 text-sm font-extrabold text-[#4458df] shadow-[0_14px_30px_rgba(17,24,57,0.06)] transition hover:bg-[#f7f9ff]"
        >
          <RotateCcw className="h-4 w-4" />
          Lam lai bo nay
        </button>
      </aside>
    </div>
  );
}
