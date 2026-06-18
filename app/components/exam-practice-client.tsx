"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import {
  BookOpenText,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  Flag,
  Home,
  Library,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react";

import { deleteExamPracticeTestAction } from "@/app/actions/exam-practice";
import { ExamImportForm } from "@/app/components/exam-import-form";
import type {
  ExamPracticeQuestion,
  ExamPracticeSection,
  ExamPracticeSectionKind,
  ExamPracticeTest,
} from "@/lib/exam-practice-types";

type ScreenMode = "library" | "exam" | "result" | "mistakes";

type FlatQuestion = {
  question: ExamPracticeQuestion;
  section: ExamPracticeSection;
};

type Props = {
  tests: ExamPracticeTest[];
};

const demoTests: ExamPracticeTest[] = [
  {
    id: "demo-jtest-n5-n4-001",
    title: "J.TEST-style N5-N4 Test 01",
    level: "N5-N4",
    minutes: 45,
    tags: ["文法・語彙", "読解", "漢字", "短文作成"],
    status: "new",
    createdAt: "2026-05-28T00:00:00.000Z",
    updatedAt: "2026-05-28T00:00:00.000Z",
    sections: [
      {
        id: "grammar",
        title: "Phần 1: 文法・語彙問題",
        label: "文法・語彙問題",
        kind: "grammar",
        questions: [
          {
            id: "demo-q001",
            number: 1,
            type: "blank",
            prompt: "つぎのえきで、でんしゃ（　）おります。",
            choices: [
              { id: "1", label: "で" },
              { id: "2", label: "へ" },
              { id: "3", label: "を" },
              { id: "4", label: "と" },
            ],
            correctAnswer: "を",
            explanation: "おりる dùng を với phương tiện/nơi rời khỏi.",
          },
          {
            id: "demo-q002",
            number: 2,
            type: "blank",
            prompt: "わたしは、ねる（　）まえに、本を読みます。",
            choices: [
              { id: "1", label: "ない" },
              { id: "2", label: "る" },
              { id: "3", label: "て" },
              { id: "4", label: "た" },
            ],
            correctAnswer: "る",
          },
        ],
      },
      {
        id: "reading",
        title: "Phần 2: 読解問題",
        label: "読解問題",
        kind: "reading",
        questions: [
          {
            id: "demo-q026",
            number: 26,
            type: "reading",
            passage:
              "わたしは日曜日に友だちと映画を見ました。映画のあと、レストランで昼ごはんを食べました。",
            prompt: "わたしは、だれと映画を見ましたか。",
            choices: [
              { id: "1", label: "友だちと" },
              { id: "2", label: "家族と" },
              { id: "3", label: "先生と" },
              { id: "4", label: "一人で" },
            ],
            correctAnswer: "友だちと",
          },
        ],
      },
      {
        id: "kanji",
        title: "Phần 3: 漢字問題",
        label: "漢字問題",
        kind: "kanji",
        questions: [
          {
            id: "demo-q036",
            number: 36,
            type: "kanjiReading",
            prompt: "病院",
            choices: [
              { id: "1", label: "おわり" },
              { id: "2", label: "は" },
              { id: "3", label: "びょういん" },
              { id: "4", label: "おります" },
            ],
            correctAnswer: "びょういん",
          },
        ],
      },
      {
        id: "sentence",
        title: "Phần 4: 短文作成問題",
        label: "短文作成問題",
        kind: "sentence",
        questions: [
          {
            id: "demo-q046",
            number: 46,
            type: "sentenceOrder",
            instruction: "次の言葉を正しい順番に並べて、文を作ってください。",
            prompt: "わたしは、【 1. 5本　2. ボールペンを　3. ノートを　4. 2さつ 】買いました。",
            viPrompt: "Tôi đã mua 2 quyển vở và 5 cây bút bi.",
            tokens: ["5本", "ボールペンを", "ノートを", "2さつ"],
            correctAnswer: "ノートを 2さつ ボールペンを 5本",
            explanation: "Số lượng thường đặt sau danh từ được đếm.",
          },
        ],
      },
    ],
  },
];

function totalQuestions(test: ExamPracticeTest): number {
  return test.sections.reduce((sum, section) => sum + section.questions.length, 0);
}

function flattenQuestions(test: ExamPracticeTest): FlatQuestion[] {
  return test.sections.flatMap((section) =>
    section.questions.map((question) => ({
      question,
      section,
    }))
  );
}

function kindAccent(kind: ExamPracticeSectionKind): string {
  if (kind === "grammar") {
    return "bg-[#eee9ff] text-[#6d4bd9]";
  }
  if (kind === "reading") {
    return "bg-[#eaf3ff] text-[#1c5d99]";
  }
  if (kind === "kanji") {
    return "bg-[#fff0df] text-[#b65315]";
  }
  return "bg-[#ecfdf8] text-[#0f766e]";
}

function promptClass(kind: ExamPracticeSectionKind): string {
  if (kind === "kanji") {
    return "text-3xl md:text-5xl";
  }
  if (kind === "sentence") {
    return "text-lg md:text-xl";
  }
  return "text-xl md:text-2xl";
}

function choiceTextClass(kind: ExamPracticeSectionKind): string {
  if (kind === "kanji") {
    return "text-2xl md:text-3xl";
  }
  return "text-xl md:text-2xl";
}

function renderTextWithTarget(text: string, target?: string): ReactNode {
  const needle = target?.trim();
  if (!needle) {
    return text;
  }

  const parts: ReactNode[] = [];
  let cursor = 0;
  let index = text.indexOf(needle);

  while (index >= 0) {
    if (index > cursor) {
      parts.push(text.slice(cursor, index));
    }
    parts.push(
      <span
        key={`${needle}-${index}`}
        className="rounded-[0.18em] bg-[#fff7ed] px-1 underline decoration-[#f97316] decoration-[0.16em] underline-offset-[0.18em]"
      >
        {needle}
      </span>
    );
    cursor = index + needle.length;
    index = text.indexOf(needle, cursor);
  }

  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }

  return parts.length > 0 ? parts : text;
}

function normalizeAnswer(value: string): string {
  return value.replace(/[、。,.]/g, "").replace(/\s+/g, " ").trim();
}

function isAnswerCorrect(question: ExamPracticeQuestion, answer: string): boolean {
  if (!question.correctAnswer) {
    return false;
  }
  const expected = normalizeAnswer(question.correctAnswer);
  const selectedChoice = question.choices?.find((choice) => choice.id === answer);
  const actual = normalizeAnswer(selectedChoice?.label ?? answer);
  return actual === expected || answer === expected || actual.replace(/\s+/g, "") === expected.replace(/\s+/g, "");
}

function sectionScore(section: ExamPracticeSection, answers: Record<string, string>) {
  return section.questions.reduce(
    (score, question) => score + (isAnswerCorrect(question, answers[question.id] ?? "") ? 1 : 0),
    0
  );
}

function SectionSummary({ section, active }: { section: ExamPracticeSection; active: boolean }) {
  return (
    <div
      className={`rounded-2xl border px-3 py-3 ${
        active ? "border-[#7c5bd6] bg-[#f6f2ff]" : "border-[#e3eaf4] bg-white"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`grid h-8 w-8 place-items-center rounded-xl text-xs font-black ${kindAccent(section.kind)}`}>
          {section.questions[0]?.number ?? 1}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-[#111827]">{section.label}</p>
          <p className="text-xs font-bold text-[#667085]">{section.questions.length} câu</p>
        </div>
      </div>
    </div>
  );
}

export function ExamPracticeClient({ tests }: Props) {
  const visibleTests = tests.length > 0 ? tests : demoTests;
  const importedTestIds = useMemo(() => new Set(tests.map((test) => test.id)), [tests]);
  const [selectedTestId, setSelectedTestId] = useState(visibleTests[0]?.id ?? "");
  const [mode, setMode] = useState<ScreenMode>("library");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [sentenceAnswers, setSentenceAnswers] = useState<Record<string, string[]>>({});
  const [flagged, setFlagged] = useState<Set<string>>(new Set());

  const selectedTest = visibleTests.find((test) => test.id === selectedTestId) ?? visibleTests[0];
  const selectedTestIsImported = selectedTest ? importedTestIds.has(selectedTest.id) : false;
  const flatQuestions = useMemo(() => flattenQuestions(selectedTest), [selectedTest]);
  const current = flatQuestions[Math.min(currentIndex, Math.max(0, flatQuestions.length - 1))];
  const currentQuestion = current?.question;
  const currentSection = current?.section;
  const answeredCount = flatQuestions.filter(({ question }) => Boolean(answers[question.id])).length;
  const scoredQuestions = flatQuestions.filter(({ question }) => question.correctAnswer);
  const correctCount = scoredQuestions.reduce(
    (score, { question }) => score + (isAnswerCorrect(question, answers[question.id] ?? "") ? 1 : 0),
    0
  );
  const wrongQuestions = scoredQuestions.filter(
    ({ question }) => answers[question.id] && !isAnswerCorrect(question, answers[question.id])
  );
  const currentSentenceAnswer = currentQuestion ? sentenceAnswers[currentQuestion.id] ?? [] : [];
  const availableTokens =
    currentQuestion?.tokens?.filter((token) => !currentSentenceAnswer.includes(token)) ?? [];

  function startTest(testId: string) {
    setSelectedTestId(testId);
    setCurrentIndex(0);
    setMode("exam");
  }

  function resetAttempt() {
    setCurrentIndex(0);
    setAnswers({});
    setSentenceAnswers({});
    setFlagged(new Set());
    setMode("exam");
  }

  function chooseAnswer(question: ExamPracticeQuestion, answer: string) {
    setAnswers((currentAnswers) => ({
      ...currentAnswers,
      [question.id]: answer,
    }));
  }

  function addToken(question: ExamPracticeQuestion, token: string) {
    const existing = sentenceAnswers[question.id] ?? [];
    if (existing.includes(token)) {
      return;
    }

    const next = [...existing, token];
    setSentenceAnswers((currentAnswers) => ({
      ...currentAnswers,
      [question.id]: next,
    }));
    setAnswers((currentAnswers) => ({
      ...currentAnswers,
      [question.id]: next.join(" "),
    }));
  }

  function removeToken(question: ExamPracticeQuestion, token: string) {
    const next = currentSentenceAnswer.filter((item) => item !== token);
    setSentenceAnswers((currentAnswers) => ({
      ...currentAnswers,
      [question.id]: next,
    }));
    setAnswers((currentAnswers) => ({
      ...currentAnswers,
      [question.id]: next.join(" "),
    }));
  }

  function resetSentence(question: ExamPracticeQuestion) {
    setSentenceAnswers((currentAnswers) => ({
      ...currentAnswers,
      [question.id]: [],
    }));
    chooseAnswer(question, "");
  }

  function toggleFlag(questionId: string) {
    setFlagged((currentFlags) => {
      const next = new Set(currentFlags);
      if (next.has(questionId)) {
        next.delete(questionId);
      } else {
        next.add(questionId);
      }
      return next;
    });
  }

  if (mode === "library") {
    return (
      <section className="mx-auto max-w-[1360px] space-y-5 pb-10">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[28px] border border-[#d8e2ee] bg-white px-5 py-4 shadow-[0_18px_42px_rgba(18,60,105,0.08)]">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#6d4bd9]">Luyện Đề</p>
            <h1 className="mt-1 text-2xl font-black tracking-[-0.03em] text-[#111827] md:text-3xl">
              Thư viện đề thi
            </h1>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#dcd3ff] bg-[#f6f2ff] px-4 py-2 text-sm font-black text-[#6d4bd9]">
            <Library className="h-4 w-4" />
            {visibleTests.length} đề
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[390px_minmax(0,1fr)]">
          <aside className="rounded-[28px] border border-[#d8e2ee] bg-white p-4 shadow-[0_18px_42px_rgba(18,60,105,0.08)]">
            <div className="flex items-center gap-2">
              <BookOpenText className="h-5 w-5 text-[#123c69]" />
              <h2 className="text-lg font-black text-[#111827]">Danh sách đề</h2>
            </div>
            <div className="mt-4 space-y-3">
              {visibleTests.map((test) => {
                const active = test.id === selectedTest.id;
                return (
                  <button
                    key={test.id}
                    type="button"
                    onClick={() => setSelectedTestId(test.id)}
                    className={`w-full rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 ${
                      active
                        ? "border-[#7c5bd6] bg-[#f8f5ff] shadow-[0_12px_26px_rgba(109,75,217,0.12)]"
                        : "border-[#e3eaf4] bg-white hover:border-[#c7d3e5]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-base font-black leading-snug text-[#111827]">{test.title}</h3>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <span className="rounded-full bg-[#eaf3ff] px-2.5 py-1 text-[11px] font-black text-[#1c5d99]">
                            {test.level}
                          </span>
                          <span className="rounded-full bg-[#eefaf6] px-2.5 py-1 text-[11px] font-black text-[#0f766e]">
                            {totalQuestions(test)} câu
                          </span>
                          <span className="rounded-full bg-[#fff7ed] px-2.5 py-1 text-[11px] font-black text-[#9a3412]">
                            {test.minutes} phút
                          </span>
                        </div>
                      </div>
                      {test.lastScore ? (
                        <span className="rounded-full bg-[#fff7ed] px-2 py-1 text-xs font-black text-[#9a3412]">
                          {test.lastScore}%
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-3 text-xs font-bold leading-5 text-[#667085]">
                      {test.tags.length > 0 ? test.tags.join(" / ") : "文法・語彙 / 読解 / 漢字 / 短文作成"}
                    </p>
                  </button>
                );
              })}
            </div>
          </aside>

          <main className="space-y-4">
            <section className="rounded-[28px] border border-[#d8e2ee] bg-white p-5 shadow-[0_18px_42px_rgba(18,60,105,0.08)]">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[#6d4bd9]">Chi tiết đề</p>
                  <h2 className="mt-2 text-2xl font-black tracking-[-0.02em] text-[#111827]">
                    {selectedTest.title}
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-[#667085]">
                    Khi bấm làm bài, màn hình sẽ chuyển sang chế độ tập trung, chỉ còn câu hỏi,
                    danh sách phần và phiếu đáp án gọn bên cạnh.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedTestIsImported ? (
                    <form action={deleteExamPracticeTestAction}>
                      <input type="hidden" name="testId" value={selectedTest.id} />
                      <button
                        type="submit"
                        className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-black text-rose-600 transition hover:bg-rose-100"
                      >
                        <Trash2 className="h-4 w-4" />
                        Xóa đề
                      </button>
                    </form>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => startTest(selectedTest.id)}
                    className="rounded-full bg-[#6d4bd9] px-6 py-3 text-sm font-black text-white shadow-[0_14px_24px_rgba(109,75,217,0.24)] transition hover:bg-[#5b3bc3]"
                  >
                    Làm bài
                  </button>
                </div>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-4">
                {selectedTest.sections.map((section) => (
                  <SectionSummary key={section.id} section={section} active={false} />
                ))}
              </div>
            </section>

            <section className="rounded-[28px] border border-[#d8e2ee] bg-white p-5 shadow-[0_18px_42px_rgba(18,60,105,0.08)]">
              <div className="mb-4 flex items-center gap-2">
                <Upload className="h-5 w-5 text-[#6d4bd9]" />
                <h2 className="text-lg font-black text-[#111827]">Import đề bằng JSON</h2>
              </div>
              <ExamImportForm />
            </section>
          </main>
        </div>
      </section>
    );
  }

  if (mode === "result") {
    const percent = scoredQuestions.length > 0 ? Math.round((correctCount / scoredQuestions.length) * 100) : 0;

    return (
      <section className="mx-auto max-w-[980px] space-y-4 pb-10">
        <div className="rounded-[28px] border border-[#d8e2ee] bg-white p-5 shadow-[0_18px_42px_rgba(18,60,105,0.08)]">
          <button
            type="button"
            onClick={() => setMode("library")}
            className="inline-flex items-center gap-2 rounded-full border border-[#d8e2ee] px-3 py-1.5 text-sm font-black text-[#123c69]"
          >
            <Home className="h-4 w-4" />
            Về thư viện
          </button>
          <div className="mt-6 grid gap-5 md:grid-cols-[260px_minmax(0,1fr)]">
            <div className="grid place-items-center rounded-[28px] border border-[#e3eaf4] bg-[#fbfdff] p-6">
              <div className="grid h-40 w-40 place-items-center rounded-full border-[12px] border-[#54b978] bg-white text-center">
                <div>
                  <p className="text-xs font-black uppercase text-[#667085]">Điểm</p>
                  <p className="text-4xl font-black text-[#111827]">{correctCount}</p>
                  <p className="text-sm font-black text-[#0f766e]">/{scoredQuestions.length || totalQuestions(selectedTest)}</p>
                </div>
              </div>
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#6d4bd9]">Kết quả bài thi</p>
              <h1 className="mt-2 text-3xl font-black text-[#111827]">{selectedTest.title}</h1>
              <p className="mt-2 text-sm font-bold text-[#667085]">Tỉ lệ đúng: {percent}%</p>
              <div className="mt-5 space-y-3">
                {selectedTest.sections.map((section) => {
                  const score = sectionScore(section, answers);
                  const total = section.questions.filter((question) => question.correctAnswer).length || section.questions.length;
                  return (
                    <div key={section.id} className="rounded-2xl border border-[#e3eaf4] bg-white px-4 py-3">
                      <div className="flex items-center justify-between gap-3 text-sm font-black text-[#111827]">
                        <span>{section.label}</span>
                        <span>{score} / {total}</span>
                      </div>
                      <div className="mt-2 h-2 rounded-full bg-[#eef2f7]">
                        <div
                          className="h-full rounded-full bg-[#6d4bd9]"
                          style={{ width: `${Math.round((score / Math.max(1, total)) * 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setMode("mistakes")}
                  className="rounded-full border border-[#dcd3ff] bg-[#f6f2ff] px-5 py-2 text-sm font-black text-[#6d4bd9]"
                >
                  Ôn lại câu sai
                </button>
                <button
                  type="button"
                  onClick={resetAttempt}
                  className="rounded-full bg-[#6d4bd9] px-5 py-2 text-sm font-black text-white"
                >
                  Làm lại bài thi
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (mode === "mistakes") {
    return (
      <section className="mx-auto max-w-[980px] space-y-4 pb-10">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[28px] border border-[#d8e2ee] bg-white p-5 shadow-[0_18px_42px_rgba(18,60,105,0.08)]">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#6d4bd9]">Ôn lại câu sai</p>
            <h1 className="mt-1 text-2xl font-black text-[#111827]">{wrongQuestions.length} câu cần xem lại</h1>
          </div>
          <button
            type="button"
            onClick={() => setMode("result")}
            className="rounded-full border border-[#d8e2ee] px-4 py-2 text-sm font-black text-[#123c69]"
          >
            Quay lại kết quả
          </button>
        </div>
        <div className="space-y-3">
          {wrongQuestions.length > 0 ? (
            wrongQuestions.map(({ question, section }) => {
              const userAnswer = answers[question.id] ?? "";
              const selectedChoice = question.choices?.find((choice) => choice.id === userAnswer);
              return (
                <article key={question.id} className="rounded-[24px] border border-rose-200 bg-white p-4 shadow-[0_12px_28px_rgba(18,60,105,0.06)]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs font-black ${kindAccent(section.kind)}`}>
                      Câu {question.number} · {section.label}
                    </span>
                    <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-black text-rose-600">Sai</span>
                  </div>
                  {question.instruction ? (
                    <p className="mt-3 font-[var(--font-jp)] text-sm font-black text-[#6d4bd9]">{question.instruction}</p>
                  ) : null}
                  <p className="mt-3 whitespace-pre-line font-[var(--font-jp)] text-lg font-black text-[#111827]">
                    {renderTextWithTarget(question.prompt, question.target)}
                  </p>
                  {question.viPrompt ? (
                    <p className="mt-2 rounded-xl border border-[#e3eaf4] bg-[#fbfdff] px-3 py-2 text-sm font-bold text-[#667085]">
                      Nghĩa tham khảo: {question.viPrompt}
                    </p>
                  ) : null}
                  <div className="mt-3 grid gap-2 text-sm font-bold text-[#526070]">
                    <p>Bạn chọn: <span className="text-rose-600">{selectedChoice?.label ?? (userAnswer || "Chưa chọn")}</span></p>
                    <p>Đáp án đúng: <span className="text-[#0f766e]">{question.correctAnswer}</span></p>
                    {question.explanation ? <p>Giải thích: {question.explanation}</p> : null}
                  </div>
                </article>
              );
            })
          ) : (
            <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 p-5 text-sm font-black text-emerald-700">
              Không có câu sai trong những câu có đáp án.
            </div>
          )}
        </div>
      </section>
    );
  }

  if (!current || !currentQuestion || !currentSection) {
    return null;
  }

  return (
    <section className="mx-auto max-w-[1360px] space-y-4 pb-8">
      <header className="rounded-[24px] border border-[#d8e2ee] bg-white px-4 py-3 shadow-[0_14px_32px_rgba(18,60,105,0.08)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setMode("library")}
            className="inline-flex items-center gap-2 rounded-full border border-[#d8e2ee] px-3 py-1.5 text-sm font-black text-[#123c69]"
          >
            <ChevronLeft className="h-4 w-4" />
            Thư viện
          </button>
          <div className="text-center">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#6d4bd9]">{selectedTest.title}</p>
            <h1 className="text-lg font-black text-[#111827]">{currentSection.title}</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-[#fee2bc] bg-[#fff7ed] px-3 py-1.5 text-xs font-black text-[#9a3412]">
              <Clock3 className="h-4 w-4" />
              {selectedTest.minutes}:00
            </span>
            <button
              type="button"
              onClick={() => setMode("result")}
              className="rounded-full bg-[#6d4bd9] px-4 py-2 text-xs font-black text-white"
            >
              Nộp bài
            </button>
          </div>
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-[210px_minmax(0,1fr)_260px]">
        <aside className="space-y-2 xl:sticky xl:top-24 xl:self-start">
          <p className="px-1 text-xs font-black uppercase tracking-[0.14em] text-[#667085]">Danh sách phần</p>
          {selectedTest.sections.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => {
                const nextIndex = flatQuestions.findIndex((item) => item.section.id === section.id);
                setCurrentIndex(Math.max(0, nextIndex));
              }}
              className="w-full text-left"
            >
              <SectionSummary section={section} active={section.id === currentSection.id} />
            </button>
          ))}
        </aside>

        <main className="overflow-hidden rounded-[24px] border border-[#d8e2ee] bg-white shadow-[0_18px_42px_rgba(18,60,105,0.08)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e7eef7] bg-[#fbfdff] px-5 py-3">
            <span className="rounded-full border border-[#d8e2ee] bg-white px-3 py-1.5 text-xs font-black text-[#123c69]">
              Câu {currentIndex + 1} / {flatQuestions.length}
            </span>
            <button
              type="button"
              onClick={() => toggleFlag(currentQuestion.id)}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-black ${
                flagged.has(currentQuestion.id)
                  ? "border-[#f59e0b] bg-[#fff7ed] text-[#9a3412]"
                  : "border-[#d8e2ee] bg-white text-[#123c69]"
              }`}
            >
              <Flag className="h-4 w-4" />
              Đánh dấu
            </button>
          </div>

          <div className="space-y-4 p-5">
            {currentQuestion.passage ? (
              <section className="rounded-2xl border border-[#d8e2ee] bg-[#fbfdff] p-4">
                <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-[#123c69]">
                  <FileText className="h-4 w-4 text-[#6d4bd9]" />
                  Bài đọc
                </div>
                <p className="font-[var(--font-jp)] text-base font-bold leading-8 text-[#111827]">
                  {currentQuestion.passage}
                </p>
              </section>
            ) : null}

            <section className="rounded-2xl border border-[#d8e2ee] bg-white p-4">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#667085]">
                Câu hỏi
              </p>
              {currentQuestion.instruction ? (
                <p className="mt-2 font-[var(--font-jp)] text-sm font-black leading-6 text-[#6d4bd9]">
                  {currentQuestion.instruction}
                </p>
              ) : null}
              <p className={`mt-2 whitespace-pre-line font-[var(--font-jp)] font-black leading-snug text-[#111827] ${promptClass(currentSection.kind)}`}>
                {renderTextWithTarget(currentQuestion.prompt, currentQuestion.target)}
              </p>
            </section>

            {currentQuestion.choices?.length ? (
              <div className="grid gap-2 md:grid-cols-2">
                {currentQuestion.choices.map((choice, index) => {
                  const active = answers[currentQuestion.id] === choice.id;
                  return (
                    <button
                      key={choice.id}
                      type="button"
                      onClick={() => chooseAnswer(currentQuestion, choice.id)}
                      className={`rounded-2xl border px-4 py-3 text-left transition hover:-translate-y-0.5 ${
                        active
                          ? "border-[#7c5bd6] bg-[#f6f2ff] shadow-[0_12px_24px_rgba(109,75,217,0.12)]"
                          : "border-[#d8e2ee] bg-white hover:border-[#c7d3e5]"
                      }`}
                    >
                      <span className="flex items-start gap-3">
                        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-black ${active ? "bg-[#6d4bd9] text-white" : "bg-[#eef4ff] text-[#123c69]"}`}>
                          {index + 1}
                        </span>
                        <span>
                          <span className={`block font-[var(--font-jp)] font-black leading-snug text-[#111827] ${choiceTextClass(currentSection.kind)}`}>
                            {choice.label}
                          </span>
                          {choice.sub ? <span className="mt-1 block text-sm font-bold text-[#667085]">{choice.sub}</span> : null}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}

            {currentQuestion.tokens?.length ? (
              <div className="space-y-3">
                <div className="rounded-2xl border border-[#d8e2ee] bg-[#fbfdff] p-4">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-[#667085]">Câu trả lời của bạn</p>
                  <div className="mt-2 flex min-h-[58px] flex-wrap items-center gap-2 rounded-xl border border-dashed border-[#c7d3e5] bg-white p-2">
                    {currentSentenceAnswer.length > 0 ? (
                      currentSentenceAnswer.map((token) => (
                        <button
                          key={token}
                          type="button"
                          onClick={() => removeToken(currentQuestion, token)}
                          className="rounded-full bg-[#6d4bd9] px-3 py-1.5 font-[var(--font-jp)] text-sm font-black text-white"
                        >
                          {token}
                        </button>
                      ))
                    ) : (
                      <span className="text-sm font-bold text-[#98a2b3]">Chọn các mảnh từ bên dưới...</span>
                    )}
                  </div>
                </div>
                <div className="rounded-2xl border border-[#d8e2ee] bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-[#667085]">Mảnh từ</p>
                    <button
                      type="button"
                      onClick={() => resetSentence(currentQuestion)}
                      className="inline-flex items-center gap-1 rounded-full border border-[#d8e2ee] px-3 py-1 text-xs font-black text-[#123c69]"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Xóa
                    </button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {availableTokens.map((token) => (
                      <button
                        key={token}
                        type="button"
                        onClick={() => addToken(currentQuestion, token)}
                        className="rounded-xl border border-[#d8e2ee] bg-[#fbfdff] px-4 py-2 font-[var(--font-jp)] text-sm font-black text-[#111827]"
                      >
                        {token}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#edf2f7] pt-4">
              <button
                type="button"
                onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))}
                disabled={currentIndex === 0}
                className="inline-flex items-center gap-2 rounded-full border border-[#d8e2ee] px-4 py-2 text-sm font-black text-[#123c69] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
                Câu trước
              </button>
              <button
                type="button"
                onClick={() => setCurrentIndex((index) => Math.min(flatQuestions.length - 1, index + 1))}
                disabled={currentIndex >= flatQuestions.length - 1}
                className="inline-flex items-center gap-2 rounded-full bg-[#6d4bd9] px-5 py-2 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Câu tiếp
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </main>

        <aside className="xl:sticky xl:top-24 xl:self-start">
          <section className="rounded-[24px] border border-[#d8e2ee] bg-white p-4 shadow-[0_18px_42px_rgba(18,60,105,0.08)]">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[#6d4bd9]">Điều hướng câu hỏi</p>
            <div className="mt-3 grid grid-cols-5 gap-1.5">
              {flatQuestions.map(({ question }, index) => {
                const active = index === currentIndex;
                const answered = Boolean(answers[question.id]);
                const marked = flagged.has(question.id);
                return (
                  <button
                    key={question.id}
                    type="button"
                    onClick={() => setCurrentIndex(index)}
                    className={`relative grid h-9 place-items-center rounded-xl text-xs font-black transition ${
                      active
                        ? "bg-[#6d4bd9] text-white"
                        : answered
                          ? "bg-[#dff8ef] text-[#0f766e]"
                          : "border border-[#d8e2ee] bg-[#fbfdff] text-[#526070]"
                    }`}
                  >
                    {question.number || index + 1}
                    {marked ? <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-[#f59e0b]" /> : null}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 grid gap-2 text-xs font-black text-[#526070]">
              <span className="inline-flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-[#0f766e]" />
                Đã trả lời: {answeredCount}/{flatQuestions.length}
              </span>
              <span className="inline-flex items-center gap-2">
                <Flag className="h-4 w-4 text-[#f59e0b]" />
                Đánh dấu: {flagged.size}
              </span>
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}
