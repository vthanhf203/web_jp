"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { submitQuizAction } from "@/app/actions/quiz";

type QuizQuestionItem = {
  id: string;
  level: string;
  category: string;
  prompt: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
};

type Props = {
  questions: QuizQuestionItem[];
  examMode: boolean;
  examMinutes: number;
};

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function QuizSessionForm({ questions, examMode, examMinutes }: Props) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(examMinutes * 60);
  const [submittedByTimer, setSubmittedByTimer] = useState(false);

  const progress = useMemo(() => {
    if (!examMode) {
      return 100;
    }
    const total = Math.max(1, examMinutes * 60);
    return Math.max(0, Math.min(100, Math.round((remainingSeconds / total) * 100)));
  }, [examMinutes, examMode, remainingSeconds]);

  useEffect(() => {
    if (!examMode) {
      return;
    }
    setRemainingSeconds(examMinutes * 60);
    setSubmittedByTimer(false);
  }, [examMinutes, examMode, questions.length]);

  useEffect(() => {
    if (!examMode || submittedByTimer) {
      return;
    }

    if (remainingSeconds <= 0) {
      setSubmittedByTimer(true);
      formRef.current?.requestSubmit();
      return;
    }

    const timer = window.setTimeout(() => {
      setRemainingSeconds((prev) => prev - 1);
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [examMode, remainingSeconds, submittedByTimer]);

  return (
    <form ref={formRef} action={submitQuizAction} className="space-y-4">
      {examMode ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-amber-900">Che do thi thu dang chay</p>
            <p className="text-lg font-bold text-amber-700">{formatTime(Math.max(0, remainingSeconds))}</p>
          </div>
          <div className="mt-2 h-2 rounded-full bg-amber-100">
            <div
              className="h-2 rounded-full bg-gradient-to-r from-amber-400 to-rose-500 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      ) : null}

      {questions.map((question, index) => (
        <article key={question.id} className="panel p-5">
          <input type="hidden" name="questionIds" value={question.id} />
          <div className="mb-3">
            <span className="chip">{question.level}</span>
            <p className="mt-2 text-base font-semibold text-slate-800">
              Cau {index + 1}. {question.prompt}
            </p>
          </div>

          <div className="space-y-2 text-sm">
            {(
              [
                ["A", question.optionA],
                ["B", question.optionB],
                ["C", question.optionC],
                ["D", question.optionD],
              ] as const
            ).map(([key, value]) => (
              <label
                key={key}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
              >
                <input type="radio" name={`q_${question.id}`} value={key} />
                <span>
                  <strong>{key}.</strong> {value}
                </span>
              </label>
            ))}
          </div>
        </article>
      ))}

      <button type="submit" className="btn-primary">
        {examMode ? "Nop bai thi thu" : "Cham diem quiz"}
      </button>
    </form>
  );
}


