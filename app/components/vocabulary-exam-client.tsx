"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BookOpenCheck,
  Brain,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Flag,
  GraduationCap,
  LayoutGrid,
  Lightbulb,
  Library,
  ListChecks,
  Play,
  RotateCcw,
  Sparkles,
  Target,
  Trash2,
  Trophy,
  X,
  XCircle,
} from "lucide-react";

import { deleteVocabularyExamTestAction } from "@/app/actions/vocabulary-exam";
import { VocabularyExamImportForm } from "@/app/components/vocabulary-exam-import-form";
import type { VocabularyExamQuestion, VocabularyExamTest } from "@/lib/vocabulary-exam-types";

type SessionMode = "practice" | "exam";
type Screen = "setup" | "quiz" | "result";
type ReviewFilter = "all" | "wrong";

type Props = {
  tests: VocabularyExamTest[];
  importedTestIds: string[];
};

type LastResult = {
  percent: number;
  correct: number;
  total: number;
  finishedAt: string;
};

const resultStorageKey = "jp-lab-vocabulary-exam-last-result";
const countOptions = [10, 20, 30];

function flattenQuestions(test: VocabularyExamTest): VocabularyExamQuestion[] {
  return test.sections.flatMap((section) => section.questions);
}

function shuffled<T>(items: T[]): T[] {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

function lessonKey(label: string): string {
  return label.split(" - ")[0]?.trim() || label.trim();
}

function difficultyLabel(value: string): string {
  if (value === "easy") {
    return "Cơ bản";
  }
  if (value === "normal") {
    return "Vận dụng";
  }
  return value;
}

function difficultyClass(value: string): string {
  return value === "easy"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border-amber-200 bg-amber-50 text-amber-700";
}

function formatTime(totalSeconds: number): string {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function answerIsCorrect(question: VocabularyExamQuestion, answer?: string): boolean {
  return Boolean(answer && answer === question.correctAnswer);
}

function splitDetailedExplanation(explanation: string): {
  overview: string[];
  choiceAnalysis: string[];
  hasAnswerLine: boolean;
} {
  const normalized = explanation.replace(/\r/g, "").trim();
  const [overviewText = "", analysisText = ""] = normalized.split(/Phân tích đáp án\s*:/i, 2);
  return {
    overview: overviewText
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean),
    choiceAnalysis: analysisText
      .replace(/\n/g, " ")
      .split(/(?=\d+\.\s)/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean),
    hasAnswerLine: /(^|\n)Đáp án đúng\s*:/i.test(normalized),
  };
}

function FuriganaText({ text }: { text: string }) {
  const pattern = /([々〆〇ヶ一-龯]+)\(([^()]+)\)/g;
  const parts: ReactNode[] = [];
  let cursor = 0;
  let match = pattern.exec(text);

  while (match) {
    if (match.index > cursor) {
      parts.push(text.slice(cursor, match.index));
    }
    parts.push(
      <ruby key={`${match.index}-${match[0]}`} className="ruby-text">
        {match[1]}
        <rt className="text-[0.52em] font-bold text-[#7b6a9d]">{match[2]}</rt>
      </ruby>
    );
    cursor = match.index + match[0].length;
    match = pattern.exec(text);
  }

  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }

  return <>{parts.length > 0 ? parts : text}</>;
}

function DetailedExplanation({ question }: { question: VocabularyExamQuestion }) {
  const sections = splitDetailedExplanation(question.explanation);
  const supplementalChoices = sections.choiceAnalysis.length === 0
    ? question.choices.filter((choice) => question.choiceExplanations[choice])
    : [];

  return (
    <div className="space-y-3">
      {!sections.hasAnswerLine ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700">Đáp án đúng</p>
          <p className="mt-1 font-[var(--font-jp)] text-base font-black leading-7 text-emerald-800">
            <FuriganaText text={question.correctAnswer} />
          </p>
        </div>
      ) : null}

      {sections.overview.length > 0 ? (
        <div className="space-y-2 rounded-xl border border-violet-100 bg-violet-50/60 p-3">
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-violet-700">
            <Lightbulb className="h-3.5 w-3.5" />
            Giải thích
          </p>
          {sections.overview.map((paragraph, index) => {
            const answerLine = /^Đáp án đúng\s*:/i.test(paragraph);
            return (
              <p
                key={`${index}-${paragraph}`}
                className={`whitespace-pre-line text-sm font-semibold leading-6 ${
                  answerLine
                    ? "rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-900"
                    : "text-[#5e566d]"
                }`}
              >
                <FuriganaText text={paragraph} />
              </p>
            );
          })}
        </div>
      ) : null}

      {sections.choiceAnalysis.length > 0 ? (
        <div>
          <p className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-[#81788f]">
            Phân tích từng lựa chọn
          </p>
          <div className="grid gap-2 md:grid-cols-2">
            {sections.choiceAnalysis.map((analysis, index) => {
              const correctChoice = question.choices[index] === question.correctAnswer;
              return (
                <div
                  key={`${index}-${analysis}`}
                  className={`rounded-xl border px-3 py-2.5 text-sm font-semibold leading-6 ${
                    correctChoice
                      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                      : "border-[#e8e4ef] bg-[#faf9fc] text-[#665f78]"
                  }`}
                >
                  <FuriganaText text={analysis} />
                </div>
              );
            })}
          </div>
        </div>
      ) : supplementalChoices.length > 0 ? (
        <div>
          <p className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-[#81788f]">
            Phân tích từng lựa chọn
          </p>
          <div className="grid gap-2 md:grid-cols-2">
            {supplementalChoices.map((choice) => {
              const correctChoice = choice === question.correctAnswer;
              return (
                <div
                  key={choice}
                  className={`rounded-xl border px-3 py-2.5 ${
                    correctChoice ? "border-emerald-200 bg-emerald-50" : "border-[#e8e4ef] bg-[#faf9fc]"
                  }`}
                >
                  <p className="font-[var(--font-jp)] text-sm font-black leading-6 text-[#342d4c]">
                    <FuriganaText text={choice} />
                  </p>
                  <p className="mt-1 text-xs font-semibold leading-5 text-[#77738b]">
                    <FuriganaText text={question.choiceExplanations[choice] ?? ""} />
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function scoreMessage(percent: number): { title: string; detail: string } {
  if (percent >= 90) {
    return {
      title: "Xuất sắc, vốn từ đang rất chắc!",
      detail: "Bạn đã phân biệt tốt cả nghĩa lẫn cách dùng từ trong ngữ cảnh.",
    };
  }
  if (percent >= 70) {
    return {
      title: "Tiến bộ rất tốt!",
      detail: "Ôn lại vài câu sai là bạn có thể làm chủ trọn bộ từ vựng này.",
    };
  }
  return {
    title: "Đã tìm ra nhóm từ cần ôn",
    detail: "Xem kỹ giải thích từng lựa chọn rồi thử lại các câu sai nhé.",
  };
}

function ModeCard({
  active,
  icon,
  title,
  subtitle,
  accent,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  title: string;
  subtitle: string;
  accent: "violet" | "rose";
  onClick: () => void;
}) {
  const activeClass =
    accent === "violet"
      ? "border-violet-400 bg-violet-50 shadow-[0_16px_36px_rgba(124,58,237,0.15)]"
      : "border-rose-400 bg-rose-50 shadow-[0_16px_36px_rgba(244,63,94,0.13)]";
  const iconClass =
    accent === "violet"
      ? "bg-gradient-to-br from-violet-500 to-indigo-600"
      : "bg-gradient-to-br from-rose-400 to-orange-500";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative overflow-hidden rounded-[24px] border p-4 text-left transition hover:-translate-y-0.5 ${
        active ? activeClass : "border-[#e4e3ef] bg-white hover:border-[#cfc9e8]"
      }`}
    >
      <div className="flex items-start gap-3">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-white shadow-lg ${iconClass}`}>
          {icon}
        </span>
        <span>
          <span className="flex items-center gap-2 text-base font-black text-[#24203a]">
            {title}
            {active ? <CheckCircle2 className="h-4 w-4 text-violet-600" /> : null}
          </span>
          <span className="mt-1 block text-xs font-semibold leading-5 text-[#77738b]">{subtitle}</span>
        </span>
      </div>
    </button>
  );
}

export function VocabularyExamClient({ tests, importedTestIds }: Props) {
  const [selectedTestId, setSelectedTestId] = useState(tests[0]?.id ?? "");
  const test = tests.find((entry) => entry.id === selectedTestId) ?? tests[0];
  const importedIdSet = useMemo(() => new Set(importedTestIds), [importedTestIds]);
  const allQuestions = useMemo(() => (test ? flattenQuestions(test) : []), [test]);
  const lessonEntries = useMemo(
    () =>
      test?.sourceLessons.map((label) => ({
        key: lessonKey(label),
        label,
        count: allQuestions.filter((question) => question.sourceLesson === lessonKey(label)).length,
      })) ?? [],
    [allQuestions, test]
  );

  const [screen, setScreen] = useState<Screen>("setup");
  const [sessionMode, setSessionMode] = useState<SessionMode>("practice");
  const [questionCount, setQuestionCount] = useState(30);
  const [difficulty, setDifficulty] = useState("all");
  const [selectedLessons, setSelectedLessons] = useState<Set<string>>(
    () => new Set(lessonEntries.map((entry) => entry.key))
  );
  const [activeQuestions, setActiveQuestions] = useState<VocabularyExamQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [checkedQuestions, setCheckedQuestions] = useState<Set<string>>(new Set());
  const [flaggedQuestions, setFlaggedQuestions] = useState<Set<string>>(new Set());
  const [currentIndex, setCurrentIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(test?.minutes ? test.minutes * 60 : 0);
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("wrong");
  const [lastResult, setLastResult] = useState<LastResult | null>(null);

  useEffect(() => {
    const raw = window.localStorage.getItem(resultStorageKey);
    if (!raw) {
      return;
    }
    try {
      const timer = window.setTimeout(() => setLastResult(JSON.parse(raw) as LastResult), 0);
      return () => window.clearTimeout(timer);
    } catch {
      window.localStorage.removeItem(resultStorageKey);
    }
  }, []);

  useEffect(() => {
    if (screen !== "quiz" || sessionMode !== "exam") {
      return;
    }
    const timer = window.setInterval(() => {
      setSecondsLeft((value) => Math.max(0, value - 1));
    }, 1000);
    const finishTimer = window.setTimeout(() => setScreen("result"), Math.max(0, secondsLeft) * 1000);

    return () => {
      window.clearInterval(timer);
      window.clearTimeout(finishTimer);
    };
  }, [screen, secondsLeft, sessionMode]);

  const filteredPool = useMemo(
    () =>
      allQuestions.filter(
        (question) =>
          selectedLessons.has(question.sourceLesson) &&
          (difficulty === "all" || question.difficulty === difficulty)
      ),
    [allQuestions, difficulty, selectedLessons]
  );

  const currentQuestion = activeQuestions[currentIndex];
  const answeredCount = activeQuestions.filter((question) => answers[question.id]).length;
  const correctQuestions = activeQuestions.filter((question) => answerIsCorrect(question, answers[question.id]));
  const wrongQuestions = activeQuestions.filter((question) => !answerIsCorrect(question, answers[question.id]));
  const percent =
    activeQuestions.length > 0 ? Math.round((correctQuestions.length / activeQuestions.length) * 100) : 0;
  const scoreCopy = scoreMessage(percent);
  const reviewQuestions = reviewFilter === "wrong" ? wrongQuestions : activeQuestions;
  const requestedQuestionCount = Math.min(questionCount, filteredPool.length);
  const progressPercent =
    activeQuestions.length > 0 ? Math.round(((currentIndex + 1) / activeQuestions.length) * 100) : 0;

  useEffect(() => {
    if (screen !== "result" || activeQuestions.length === 0) {
      return;
    }
    const result: LastResult = {
      percent,
      correct: correctQuestions.length,
      total: activeQuestions.length,
      finishedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(resultStorageKey, JSON.stringify(result));
    const timer = window.setTimeout(() => setLastResult(result), 0);
    return () => window.clearTimeout(timer);
  }, [activeQuestions.length, correctQuestions.length, percent, screen]);

  if (!test) {
    return (
      <section className="rounded-[28px] border border-amber-200 bg-amber-50 p-6 text-sm font-bold text-amber-800">
        Chưa có dữ liệu đề từ vựng.
      </section>
    );
  }

  function toggleLesson(key: string) {
    setSelectedLessons((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        if (next.size > 1) {
          next.delete(key);
        }
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function selectTest(testId: string) {
    const nextTest = tests.find((entry) => entry.id === testId);
    if (!nextTest) {
      return;
    }
    setSelectedTestId(nextTest.id);
    setSelectedLessons(new Set(nextTest.sourceLessons.map(lessonKey)));
    setDifficulty("all");
    setQuestionCount(Math.min(30, flattenQuestions(nextTest).length));
    setAnswers({});
    setCheckedQuestions(new Set());
    setFlaggedQuestions(new Set());
    setActiveQuestions([]);
    setCurrentIndex(0);
    setScreen("setup");
  }

  function beginAttempt(questions?: VocabularyExamQuestion[]) {
    const selected = questions ?? shuffled(filteredPool).slice(0, requestedQuestionCount);
    if (selected.length === 0) {
      return;
    }
    const proportionalSeconds = Math.round((test.minutes * 60 * selected.length) / Math.max(1, allQuestions.length));
    setActiveQuestions(selected);
    setAnswers({});
    setCheckedQuestions(new Set());
    setFlaggedQuestions(new Set());
    setCurrentIndex(0);
    setSecondsLeft(Math.max(300, proportionalSeconds));
    setReviewFilter("wrong");
    setScreen("quiz");
  }

  function selectAnswer(choice: string) {
    if (!currentQuestion || (sessionMode === "practice" && checkedQuestions.has(currentQuestion.id))) {
      return;
    }
    setAnswers((current) => ({ ...current, [currentQuestion.id]: choice }));
  }

  function checkCurrentAnswer() {
    if (!currentQuestion || !answers[currentQuestion.id]) {
      return;
    }
    setCheckedQuestions((current) => new Set(current).add(currentQuestion.id));
  }

  function toggleFlag() {
    if (!currentQuestion) {
      return;
    }
    setFlaggedQuestions((current) => {
      const next = new Set(current);
      if (next.has(currentQuestion.id)) {
        next.delete(currentQuestion.id);
      } else {
        next.add(currentQuestion.id);
      }
      return next;
    });
  }

  function goNext() {
    if (currentIndex >= activeQuestions.length - 1) {
      setScreen("result");
      return;
    }
    setCurrentIndex((value) => value + 1);
  }

  if (screen === "setup") {
    return (
      <section className="mx-auto max-w-[1280px] space-y-5 pb-10">
        <div className="relative overflow-hidden rounded-[32px] border border-violet-200/70 bg-[#21183f] px-5 py-7 text-white shadow-[0_28px_70px_rgba(62,38,120,0.24)] md:px-8 md:py-9">
          <div className="pointer-events-none absolute -right-12 -top-20 h-72 w-72 rounded-full bg-violet-500/30 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-28 left-1/3 h-72 w-72 rounded-full bg-rose-400/20 blur-3xl" />
          <span className="pointer-events-none absolute right-8 top-6 font-[var(--font-jp-serif)] text-8xl font-black text-white/[0.06] md:text-[10rem]">
            語彙
          </span>

          <div className="relative grid gap-7 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-end">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-violet-100 backdrop-blur">
                <Sparkles className="h-3.5 w-3.5 text-amber-300" />
                Vocabulary Challenge
              </div>
              <h1 className="mt-5 max-w-3xl text-3xl font-black tracking-[-0.04em] md:text-5xl">
                Luyện đề từ vựng
                <span className="mt-1 block bg-gradient-to-r from-violet-200 via-white to-rose-200 bg-clip-text text-transparent">
                  hiểu từ trong đúng ngữ cảnh
                </span>
              </h1>
              <p className="mt-4 max-w-2xl text-sm font-semibold leading-7 text-violet-100/80 md:text-base">
                {test.title}. Mỗi câu có furigana và giải thích chi tiết cho cả đáp án đúng lẫn đáp án gây nhiễu.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-black">
                  {test.level}
                </span>
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-black">
                  {allQuestions.length} câu hỏi
                </span>
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-black">
                  {lessonEntries.length} bài học
                </span>
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-black">
                  {tests.length} đề trong kho
                </span>
              </div>
            </div>

            <div className="rounded-[24px] border border-white/15 bg-white/10 p-4 backdrop-blur-xl">
              <div className="flex items-center justify-between gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-amber-300 to-orange-400 text-[#34200f]">
                  <Trophy className="h-5 w-5" />
                </span>
                {lastResult ? (
                  <span className="rounded-full bg-emerald-300/15 px-3 py-1 text-xs font-black text-emerald-200">
                    Lần gần nhất
                  </span>
                ) : null}
              </div>
              {lastResult ? (
                <>
                  <p className="mt-4 text-4xl font-black">{lastResult.percent}%</p>
                  <p className="mt-1 text-sm font-bold text-violet-100/75">
                    {lastResult.correct}/{lastResult.total} câu đúng
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-4 text-lg font-black">Sẵn sàng chinh phục?</p>
                  <p className="mt-1 text-sm font-semibold leading-6 text-violet-100/70">
                    Kết quả gần nhất sẽ được lưu trên thiết bị này.
                  </p>
                </>
              )}
            </div>
          </div>
        </div>

        <section className="rounded-[28px] border border-[#ddd8ec] bg-white p-5 shadow-[0_20px_50px_rgba(56,45,98,0.09)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-indigo-100 text-indigo-700">
                <Library className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-indigo-600">Kho đề từ vựng</p>
                <h2 className="text-lg font-black text-[#24203a]">Chọn đề hoặc import JSON mới</h2>
              </div>
            </div>
            <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-black text-indigo-700">
              {importedTestIds.length} đề đã import
            </span>
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
            <div className="grid content-start gap-3 sm:grid-cols-2">
              {tests.map((entry) => {
                const active = entry.id === test.id;
                const imported = importedIdSet.has(entry.id);
                const total = flattenQuestions(entry).length;
                return (
                  <article
                    key={entry.id}
                    className={`relative overflow-hidden rounded-[22px] border transition ${
                      active
                        ? "border-violet-400 bg-violet-50 shadow-[0_14px_30px_rgba(109,75,217,0.13)]"
                        : "border-[#e4e1ec] bg-[#fbfafc] hover:border-violet-200"
                    }`}
                  >
                    <button type="button" onClick={() => selectTest(entry.id)} className="w-full p-4 text-left">
                      <span className="flex items-start justify-between gap-3">
                        <span className="min-w-0">
                          <span className="line-clamp-2 block text-sm font-black leading-5 text-[#29243c]">{entry.title}</span>
                          <span className="mt-3 flex flex-wrap gap-1.5">
                            <span className="rounded-full bg-white px-2 py-1 text-[11px] font-black text-violet-700">
                              {entry.level}
                            </span>
                            <span className="rounded-full bg-white px-2 py-1 text-[11px] font-black text-[#665f78]">
                              {total} câu
                            </span>
                            <span className="rounded-full bg-white px-2 py-1 text-[11px] font-black text-[#665f78]">
                              {entry.minutes} phút
                            </span>
                          </span>
                        </span>
                        <span
                          className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${
                            active ? "bg-violet-600 text-white" : "border border-[#ddd8ec] bg-white text-transparent"
                          }`}
                        >
                          <Check className="h-4 w-4" />
                        </span>
                      </span>
                    </button>
                    <div className="flex items-center justify-between border-t border-[#e8e5ef] px-4 py-2">
                      <span
                        className={`text-[10px] font-black uppercase tracking-[0.12em] ${
                          imported ? "text-emerald-600" : "text-[#938ba3]"
                        }`}
                      >
                        {imported ? "Đề đã import" : "Đề mặc định"}
                      </span>
                      {imported ? (
                        <form action={deleteVocabularyExamTestAction}>
                          <input type="hidden" name="testId" value={entry.id} />
                          <button
                            type="submit"
                            aria-label={`Xóa ${entry.title}`}
                            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-black text-rose-600 hover:bg-rose-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Xóa
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>

            <details
              className="group rounded-[22px] border border-dashed border-violet-300 bg-[#faf8ff] p-4"
            >
              <summary className="cursor-pointer list-none text-sm font-black text-violet-700">
                <span className="flex items-center justify-between gap-3">
                  Import đề từ vựng bằng JSON
                  <span className="rounded-full bg-violet-100 px-2 py-1 text-[10px] uppercase tracking-[0.12em]">
                    Mở form
                  </span>
                </span>
              </summary>
              <div className="mt-4 border-t border-violet-100 pt-4">
                <VocabularyExamImportForm />
              </div>
            </details>
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-5">
            <section className="rounded-[28px] border border-[#e2dfed] bg-white p-5 shadow-[0_20px_50px_rgba(56,45,98,0.08)]">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-2xl bg-violet-100 text-violet-700">
                  <Brain className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-violet-600">Bước 1</p>
                  <h2 className="text-lg font-black text-[#24203a]">Chọn cách luyện</h2>
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <ModeCard
                  active={sessionMode === "practice"}
                  accent="violet"
                  icon={<Lightbulb className="h-5 w-5" />}
                  title="Luyện tập có hướng dẫn"
                  subtitle="Chọn đáp án, nhấn kiểm tra rồi xem giải thích."
                  onClick={() => setSessionMode("practice")}
                />
                <ModeCard
                  active={sessionMode === "exam"}
                  accent="rose"
                  icon={<Clock3 className="h-5 w-5" />}
                  title="Thi thử tập trung"
                  subtitle="Có đếm giờ, chỉ xem đáp án sau khi nộp bài."
                  onClick={() => setSessionMode("exam")}
                />
              </div>
            </section>

            <section className="rounded-[28px] border border-[#e2dfed] bg-white p-5 shadow-[0_20px_50px_rgba(56,45,98,0.08)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-2xl bg-rose-100 text-rose-600">
                    <BookOpenCheck className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-rose-500">Bước 2</p>
                    <h2 className="text-lg font-black text-[#24203a]">Chọn phạm vi bài học</h2>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedLessons(new Set(lessonEntries.map((entry) => entry.key)))}
                  className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-black text-violet-700"
                >
                  Chọn tất cả
                </button>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {lessonEntries.map((entry, index) => {
                  const active = selectedLessons.has(entry.key);
                  return (
                    <button
                      key={entry.key}
                      type="button"
                      onClick={() => toggleLesson(entry.key)}
                      className={`rounded-[20px] border p-4 text-left transition hover:-translate-y-0.5 ${
                        active
                          ? "border-violet-300 bg-[#faf8ff] shadow-[0_12px_26px_rgba(109,75,217,0.1)]"
                          : "border-[#e8e5ef] bg-[#fbfafc] opacity-65"
                      }`}
                    >
                      <span className="flex items-start gap-3">
                        <span
                          className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm font-black ${
                            active ? "bg-violet-600 text-white" : "bg-[#ece9f2] text-[#817a90]"
                          }`}
                        >
                          {active ? <Check className="h-4 w-4" /> : index + 1}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-black text-[#29243c]">{entry.key}</span>
                          <span className="mt-1 line-clamp-2 block font-[var(--font-jp)] text-xs font-semibold leading-5 text-[#77738b]">
                            <FuriganaText text={entry.label.replace(`${entry.key} - `, "")} />
                          </span>
                          <span className="mt-2 inline-block rounded-full bg-white px-2 py-1 text-[11px] font-black text-violet-600">
                            {entry.count} câu
                          </span>
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          </div>

          <aside className="space-y-5 xl:sticky xl:top-24 xl:self-start">
            <section className="rounded-[28px] border border-[#ddd8ec] bg-gradient-to-b from-white to-[#faf8ff] p-5 shadow-[0_24px_55px_rgba(56,45,98,0.12)]">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-2xl bg-amber-100 text-amber-700">
                  <Target className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-amber-600">Bước 3</p>
                  <h2 className="text-lg font-black text-[#24203a]">Thiết lập đề</h2>
                </div>
              </div>

              <div className="mt-5 space-y-5">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-[#77738b]">Số câu</p>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {countOptions.map((count) => (
                      <button
                        key={count}
                        type="button"
                        onClick={() => setQuestionCount(count)}
                        className={`rounded-xl border px-2 py-2.5 text-sm font-black ${
                          questionCount === count
                            ? "border-violet-500 bg-violet-600 text-white shadow-md"
                            : "border-[#e2dfed] bg-white text-[#665f78]"
                        }`}
                      >
                        {count}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-[#77738b]">Độ khó</p>
                  <div className="mt-2 space-y-2">
                    {[
                      ["all", "Tất cả mức độ"],
                      ["easy", "Cơ bản"],
                      ["normal", "Vận dụng"],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setDifficulty(value)}
                        className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-sm font-black ${
                          difficulty === value
                            ? "border-violet-300 bg-violet-50 text-violet-700"
                            : "border-[#e2dfed] bg-white text-[#665f78]"
                        }`}
                      >
                        {label}
                        {difficulty === value ? <CheckCircle2 className="h-4 w-4" /> : null}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-violet-100 bg-white p-4">
                <div className="flex items-center justify-between text-sm font-black text-[#342d4c]">
                  <span>Đề sẽ tạo</span>
                  <span className="text-violet-700">{requestedQuestionCount} câu</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs font-bold text-[#858094]">
                  <span>{selectedLessons.size} bài đã chọn</span>
                  <span>{sessionMode === "exam" ? "Có đếm giờ" : "Giải thích tức thì"}</span>
                </div>
              </div>

              <button
                type="button"
                disabled={requestedQuestionCount === 0}
                onClick={() => beginAttempt()}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 via-indigo-600 to-violet-600 px-5 py-3.5 text-sm font-black text-white shadow-[0_16px_30px_rgba(99,70,210,0.28)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Play className="h-4 w-4 fill-current" />
                Bắt đầu luyện đề
              </button>
            </section>
          </aside>
        </div>
      </section>
    );
  }

  if (screen === "result") {
    const lessonStats = lessonEntries
      .map((entry) => {
        const questions = activeQuestions.filter((question) => question.sourceLesson === entry.key);
        const correct = questions.filter((question) => answerIsCorrect(question, answers[question.id])).length;
        return { ...entry, total: questions.length, correct };
      })
      .filter((entry) => entry.total > 0);

    return (
      <section className="mx-auto max-w-[1180px] space-y-5 pb-10">
        <div className="relative overflow-hidden rounded-[32px] border border-violet-200 bg-[#21183f] p-5 text-white shadow-[0_28px_70px_rgba(62,38,120,0.24)] md:p-7">
          <div className="pointer-events-none absolute -right-16 -top-24 h-80 w-80 rounded-full bg-violet-500/30 blur-3xl" />
          <div className="relative grid gap-6 md:grid-cols-[230px_minmax(0,1fr)] md:items-center">
            <div className="grid place-items-center">
              <div
                className="grid h-44 w-44 place-items-center rounded-full p-[13px] shadow-[0_18px_45px_rgba(0,0,0,0.2)]"
                style={{
                  background: `conic-gradient(#a78bfa ${percent * 3.6}deg, rgba(255,255,255,0.13) 0deg)`,
                }}
              >
                <div className="grid h-full w-full place-items-center rounded-full bg-[#21183f] text-center">
                  <div>
                    <p className="text-5xl font-black">{percent}%</p>
                    <p className="mt-1 text-xs font-black uppercase tracking-[0.14em] text-violet-200">Độ chính xác</p>
                  </div>
                </div>
              </div>
            </div>
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-black uppercase tracking-[0.14em] text-violet-100">
                <Trophy className="h-4 w-4 text-amber-300" />
                Hoàn thành đề
              </span>
              <h1 className="mt-4 text-3xl font-black tracking-[-0.04em] md:text-4xl">{scoreCopy.title}</h1>
              <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-violet-100/75">{scoreCopy.detail}</p>
              <div className="mt-5 grid max-w-xl grid-cols-3 gap-2">
                <div className="rounded-2xl border border-white/10 bg-white/10 p-3">
                  <p className="text-2xl font-black">{correctQuestions.length}</p>
                  <p className="mt-1 text-[11px] font-black uppercase text-emerald-200">Câu đúng</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/10 p-3">
                  <p className="text-2xl font-black">{wrongQuestions.length}</p>
                  <p className="mt-1 text-[11px] font-black uppercase text-rose-200">Cần ôn</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/10 p-3">
                  <p className="text-2xl font-black">{activeQuestions.length}</p>
                  <p className="mt-1 text-[11px] font-black uppercase text-violet-200">Tổng câu</p>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setScreen("setup")}
                  className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-black"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Chọn đề khác
                </button>
                <button
                  type="button"
                  onClick={() => beginAttempt(wrongQuestions.length > 0 ? shuffled(wrongQuestions) : shuffled(activeQuestions))}
                  className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-black text-violet-700 shadow-lg"
                >
                  <RotateCcw className="h-4 w-4" />
                  Luyện lại câu sai
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[330px_minmax(0,1fr)]">
          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <section className="rounded-[26px] border border-[#e2dfed] bg-white p-5 shadow-[0_18px_45px_rgba(56,45,98,0.08)]">
              <div className="flex items-center gap-2">
                <LayoutGrid className="h-5 w-5 text-violet-600" />
                <h2 className="text-base font-black text-[#29243c]">Kết quả theo bài</h2>
              </div>
              <div className="mt-4 space-y-3">
                {lessonStats.map((entry) => {
                  const lessonPercent = Math.round((entry.correct / entry.total) * 100);
                  return (
                    <div key={entry.key} className="rounded-2xl border border-[#ebe8f2] bg-[#fbfafc] p-3">
                      <div className="flex items-center justify-between gap-3 text-sm font-black text-[#342d4c]">
                        <span>{entry.key}</span>
                        <span className="text-violet-700">
                          {entry.correct}/{entry.total}
                        </span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#ebe8f2]">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500"
                          style={{ width: `${lessonPercent}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </aside>

          <main className="space-y-4">
            <section className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-[#e2dfed] bg-white p-4 shadow-[0_18px_45px_rgba(56,45,98,0.08)]">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-violet-600">Giải thích chi tiết</p>
                <h2 className="mt-1 text-xl font-black text-[#29243c]">
                  {reviewFilter === "wrong" ? `${wrongQuestions.length} câu cần ôn lại` : `${activeQuestions.length} câu đã làm`}
                </h2>
              </div>
              <div className="flex rounded-full border border-[#e2dfed] bg-[#f7f5fb] p-1">
                <button
                  type="button"
                  onClick={() => setReviewFilter("wrong")}
                  className={`rounded-full px-3 py-1.5 text-xs font-black ${
                    reviewFilter === "wrong" ? "bg-white text-rose-600 shadow-sm" : "text-[#817a90]"
                  }`}
                >
                  Câu sai
                </button>
                <button
                  type="button"
                  onClick={() => setReviewFilter("all")}
                  className={`rounded-full px-3 py-1.5 text-xs font-black ${
                    reviewFilter === "all" ? "bg-white text-violet-700 shadow-sm" : "text-[#817a90]"
                  }`}
                >
                  Tất cả
                </button>
              </div>
            </section>

            {reviewQuestions.length > 0 ? (
              reviewQuestions.map((question) => {
                const selectedAnswer = answers[question.id];
                const isCorrect = answerIsCorrect(question, selectedAnswer);
                return (
                  <article
                    key={question.id}
                    className={`overflow-hidden rounded-[26px] border bg-white shadow-[0_14px_38px_rgba(56,45,98,0.07)] ${
                      isCorrect ? "border-emerald-200" : "border-rose-200"
                    }`}
                  >
                    <div
                      className={`flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 ${
                        isCorrect ? "border-emerald-100 bg-emerald-50/70" : "border-rose-100 bg-rose-50/70"
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-[#514967] shadow-sm">
                          Câu {question.number}
                        </span>
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-violet-700 shadow-sm">
                          {question.sourceLesson}
                        </span>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-black ${
                          isCorrect ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                        }`}
                      >
                        {isCorrect ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                        {isCorrect ? "Đúng" : "Cần ôn"}
                      </span>
                    </div>
                    <div className="space-y-4 p-4 md:p-5">
                      <p className="font-[var(--font-jp)] text-lg font-black leading-[2.15] text-[#29243c] md:text-xl">
                        <FuriganaText text={question.prompt} />
                      </p>
                      <div className="grid gap-2 md:grid-cols-2">
                        {question.choices.map((choice) => {
                          const correctChoice = choice === question.correctAnswer;
                          const selectedChoice = choice === selectedAnswer;
                          return (
                            <div
                              key={choice}
                              className={`rounded-2xl border p-3 ${
                                correctChoice
                                  ? "border-emerald-300 bg-emerald-50"
                                  : selectedChoice
                                    ? "border-rose-300 bg-rose-50"
                                    : "border-[#ebe8f2] bg-[#fbfafc]"
                              }`}
                            >
                              <div className="flex items-start gap-2">
                                <span
                                  className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${
                                    correctChoice
                                      ? "bg-emerald-500 text-white"
                                      : selectedChoice
                                        ? "bg-rose-500 text-white"
                                        : "bg-white text-[#938ba3]"
                                  }`}
                                >
                                  {correctChoice ? <Check className="h-3.5 w-3.5" /> : selectedChoice ? <X className="h-3.5 w-3.5" /> : null}
                                </span>
                                <div>
                                  <p className="font-[var(--font-jp)] text-sm font-black leading-7 text-[#342d4c]">
                                    <FuriganaText text={choice} />
                                  </p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="rounded-2xl border border-[#e6e1ef] bg-white p-4">
                        <DetailedExplanation question={question} />
                      </div>
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="rounded-[26px] border border-emerald-200 bg-emerald-50 p-6 text-center">
                <Trophy className="mx-auto h-8 w-8 text-emerald-600" />
                <p className="mt-3 text-lg font-black text-emerald-800">Không có câu sai, quá tốt!</p>
              </div>
            )}
          </main>
        </div>
      </section>
    );
  }

  if (!currentQuestion) {
    return null;
  }

  const selectedAnswer = answers[currentQuestion.id];
  const showFeedback = sessionMode === "practice" && checkedQuestions.has(currentQuestion.id);
  const selectedIsCorrect = answerIsCorrect(currentQuestion, selectedAnswer);

  return (
    <section className="mx-auto max-w-[1360px] space-y-4 pb-10">
      <header className="overflow-hidden rounded-[24px] border border-[#ddd8ec] bg-white shadow-[0_16px_42px_rgba(56,45,98,0.09)]">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-5">
          <button
            type="button"
            onClick={() => setScreen("setup")}
            className="inline-flex items-center gap-2 rounded-full border border-[#e2dfed] bg-white px-3 py-2 text-xs font-black text-[#665f78]"
          >
            <ChevronLeft className="h-4 w-4" />
            Thoát
          </button>
          <div className="text-center">
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-violet-600">
              {sessionMode === "practice" ? "Luyện tập có hướng dẫn" : "Thi thử tập trung"}
            </p>
            <h1 className="mt-0.5 text-sm font-black text-[#29243c] md:text-base">{test.title}</h1>
          </div>
          <div className="flex items-center gap-2">
            {sessionMode === "exam" ? (
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-3 py-2 text-xs font-black ${
                  secondsLeft <= 120
                    ? "border-rose-200 bg-rose-50 text-rose-600"
                    : "border-amber-200 bg-amber-50 text-amber-700"
                }`}
              >
                <Clock3 className="h-4 w-4" />
                {formatTime(secondsLeft)}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => setScreen("result")}
              className="rounded-full bg-violet-600 px-4 py-2 text-xs font-black text-white shadow-md"
            >
              Nộp bài
            </button>
          </div>
        </div>
        <div className="h-1.5 bg-[#eeeaf5]">
          <div
            className="h-full rounded-r-full bg-gradient-to-r from-violet-500 via-indigo-500 to-rose-400 transition-all"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)_270px]">
        <aside className="space-y-3 xl:sticky xl:top-24 xl:self-start">
          <section className="rounded-[24px] border border-[#ddd8ec] bg-[#21183f] p-4 text-white shadow-[0_16px_42px_rgba(56,45,98,0.14)]">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-violet-200">
              <GraduationCap className="h-4 w-4" />
              Tiến độ
            </div>
            <p className="mt-3 text-3xl font-black">
              {currentIndex + 1}
              <span className="text-base text-violet-200">/{activeQuestions.length}</span>
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-white/10 bg-white/10 p-2">
                <p className="text-lg font-black">{answeredCount}</p>
                <p className="text-[10px] font-black uppercase text-violet-200">Đã trả lời</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/10 p-2">
                <p className="text-lg font-black">{flaggedQuestions.size}</p>
                <p className="text-[10px] font-black uppercase text-amber-200">Đánh dấu</p>
              </div>
            </div>
          </section>

          <section className="rounded-[24px] border border-[#ddd8ec] bg-white p-4 shadow-[0_16px_42px_rgba(56,45,98,0.08)]">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[#817a90]">Thông tin câu</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full bg-violet-50 px-3 py-1.5 text-xs font-black text-violet-700">
                {currentQuestion.sourceLesson}
              </span>
              <span className={`rounded-full border px-3 py-1.5 text-xs font-black ${difficultyClass(currentQuestion.difficulty)}`}>
                {difficultyLabel(currentQuestion.difficulty)}
              </span>
            </div>
          </section>
        </aside>

        <main className="overflow-hidden rounded-[28px] border border-[#ddd8ec] bg-white shadow-[0_24px_55px_rgba(56,45,98,0.11)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#ebe8f2] bg-[#fbfafc] px-5 py-3">
            <span className="rounded-full border border-[#e2dfed] bg-white px-3 py-1.5 text-xs font-black text-[#665f78]">
              Câu {currentIndex + 1} / {activeQuestions.length}
            </span>
            <button
              type="button"
              onClick={toggleFlag}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-black ${
                flaggedQuestions.has(currentQuestion.id)
                  ? "border-amber-300 bg-amber-50 text-amber-700"
                  : "border-[#e2dfed] bg-white text-[#77738b]"
              }`}
            >
              <Flag className={`h-4 w-4 ${flaggedQuestions.has(currentQuestion.id) ? "fill-current" : ""}`} />
              Đánh dấu
            </button>
          </div>

          <div className="space-y-5 p-5 md:p-7">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-violet-600">Chọn đáp án đúng nhất</p>
              <p className="mt-4 font-[var(--font-jp)] text-xl font-black leading-[2.25] text-[#29243c] md:text-2xl">
                <FuriganaText text={currentQuestion.prompt} />
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {currentQuestion.choices.map((choice, index) => {
                const chosen = choice === selectedAnswer;
                const correctChoice = choice === currentQuestion.correctAnswer;
                const showCorrect = showFeedback && correctChoice;
                const showWrong = showFeedback && chosen && !correctChoice;
                return (
                  <button
                    key={choice}
                    type="button"
                    onClick={() => selectAnswer(choice)}
                    className={`group min-h-20 rounded-[20px] border p-4 text-left transition hover:-translate-y-0.5 ${
                      showCorrect
                        ? "border-emerald-400 bg-emerald-50 shadow-[0_12px_24px_rgba(16,185,129,0.12)]"
                        : showWrong
                          ? "border-rose-400 bg-rose-50 shadow-[0_12px_24px_rgba(244,63,94,0.1)]"
                          : chosen
                            ? "border-violet-400 bg-violet-50 shadow-[0_12px_24px_rgba(109,75,217,0.12)]"
                            : "border-[#e2dfed] bg-white hover:border-violet-300 hover:bg-[#fbf9ff]"
                    }`}
                  >
                    <span className="flex items-start gap-3">
                      <span
                        className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl text-sm font-black ${
                          showCorrect
                            ? "bg-emerald-500 text-white"
                            : showWrong
                              ? "bg-rose-500 text-white"
                              : chosen
                                ? "bg-violet-600 text-white"
                                : "bg-[#f1eef6] text-[#817a90]"
                        }`}
                      >
                        {showCorrect ? <Check className="h-4 w-4" /> : showWrong ? <X className="h-4 w-4" /> : index + 1}
                      </span>
                      <span className="font-[var(--font-jp)] text-base font-black leading-7 text-[#342d4c] md:text-lg">
                        <FuriganaText text={choice} />
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            {showFeedback ? (
              <section
                className={`overflow-hidden rounded-[22px] border ${
                  selectedIsCorrect ? "border-emerald-200 bg-emerald-50/60" : "border-rose-200 bg-rose-50/60"
                }`}
              >
                <div className="flex items-center gap-3 px-4 py-3">
                  <span
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white ${
                      selectedIsCorrect ? "bg-emerald-500" : "bg-rose-500"
                    }`}
                  >
                    {selectedIsCorrect ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
                  </span>
                  <div className="min-w-0">
                    <p className={`text-sm font-black ${selectedIsCorrect ? "text-emerald-800" : "text-rose-800"}`}>
                      {selectedIsCorrect ? "Chính xác!" : "Chưa đúng, xem kỹ điểm khác nhau nhé."}
                    </p>
                  </div>
                </div>
                <div className="border-t border-white/80 bg-white/70 px-4 py-3">
                  <DetailedExplanation question={currentQuestion} />
                </div>
              </section>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#eeeaf5] pt-5">
              <button
                type="button"
                disabled={currentIndex === 0}
                onClick={() => setCurrentIndex((value) => Math.max(0, value - 1))}
                className="inline-flex items-center gap-2 rounded-full border border-[#e2dfed] bg-white px-4 py-2 text-sm font-black text-[#665f78] disabled:cursor-not-allowed disabled:opacity-35"
              >
                <ChevronLeft className="h-4 w-4" />
                Câu trước
              </button>
              {sessionMode === "practice" && !showFeedback ? (
                <button
                  type="button"
                  disabled={!selectedAnswer}
                  onClick={checkCurrentAnswer}
                  className="inline-flex items-center gap-2 rounded-full bg-violet-600 px-5 py-2.5 text-sm font-black text-white shadow-[0_12px_24px_rgba(109,75,217,0.24)] disabled:cursor-not-allowed disabled:bg-[#c8c2d8] disabled:shadow-none"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Kiểm tra đáp án
                </button>
              ) : (
                <button
                  type="button"
                  onClick={goNext}
                  className="inline-flex items-center gap-2 rounded-full bg-violet-600 px-5 py-2.5 text-sm font-black text-white shadow-[0_12px_24px_rgba(109,75,217,0.24)]"
                >
                  {currentIndex >= activeQuestions.length - 1 ? "Xem kết quả" : "Câu tiếp"}
                  <ChevronRight className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </main>

        <aside className="xl:sticky xl:top-24 xl:self-start">
          <section className="rounded-[24px] border border-[#ddd8ec] bg-white p-4 shadow-[0_16px_42px_rgba(56,45,98,0.08)]">
            <div className="flex items-center gap-2">
              <ListChecks className="h-5 w-5 text-violet-600" />
              <h2 className="text-sm font-black text-[#342d4c]">Phiếu câu hỏi</h2>
            </div>
            <div className="mt-4 grid grid-cols-5 gap-2">
              {activeQuestions.map((question, index) => {
                const active = index === currentIndex;
                const answered = Boolean(answers[question.id]);
                const marked = flaggedQuestions.has(question.id);
                const checked = checkedQuestions.has(question.id);
                const correct = checked && answerIsCorrect(question, answers[question.id]);
                const wrong = checked && !correct;
                return (
                  <button
                    key={question.id}
                    type="button"
                    onClick={() => setCurrentIndex(index)}
                    className={`relative grid h-9 place-items-center rounded-xl text-xs font-black ${
                      active
                        ? "bg-violet-600 text-white shadow-md"
                        : correct
                          ? "bg-emerald-100 text-emerald-700"
                          : wrong
                            ? "bg-rose-100 text-rose-700"
                            : answered
                              ? "bg-violet-100 text-violet-700"
                              : "border border-[#e2dfed] bg-[#fbfafc] text-[#817a90]"
                    }`}
                  >
                    {index + 1}
                    {marked ? <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-amber-400" /> : null}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 space-y-2 border-t border-[#eeeaf5] pt-4 text-xs font-bold text-[#77738b]">
              <p className="flex items-center justify-between">
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-violet-200" />
                  Đã trả lời
                </span>
                <span>{answeredCount}</span>
              </p>
              <p className="flex items-center justify-between">
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                  Đánh dấu
                </span>
                <span>{flaggedQuestions.size}</span>
              </p>
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}
