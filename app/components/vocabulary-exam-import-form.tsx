"use client";

import { FileJson2, FileUp, Upload } from "lucide-react";
import { useActionState, useRef } from "react";

import {
  importVocabularyExamTestsAction,
  type VocabularyExamImportState,
} from "@/app/actions/vocabulary-exam";

const initialState: VocabularyExamImportState = { status: "idle", message: "" };

const sampleJson = [
  {
    id: "vocab-n4-sample-001",
    title: "Đề từ vựng N4 mẫu",
    level: "N4",
    minutes: 20,
    sourceLessons: ["Bài 1"],
    sections: [
      {
        id: "vocabulary-mcq",
        title: "Trắc nghiệm từ vựng",
        kind: "vocabulary",
        questions: [
          {
            id: "q001",
            number: 1,
            sourceLesson: "Bài 1",
            difficulty: "easy",
            prompt: "週末(しゅうまつ)の（　）を確認(かくにん)します。",
            choices: ["予定(よてい)", "味(あじ)", "汗(あせ)", "線(せん)"],
            correctAnswer: "予定(よてい)",
            explanation: "予定(よてい) là kế hoạch hoặc dự định.",
            choiceExplanations: {
              "予定(よてい)": "Đúng. 週末の予定 = kế hoạch cuối tuần.",
              "味(あじ)": "Sai. 味 là vị.",
            },
          },
        ],
      },
    ],
  },
];

export function VocabularyExamImportForm() {
  const [state, formAction, pending] = useActionState(importVocabularyExamTestsAction, initialState);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  return (
    <form action={formAction} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor="vocabulary-exam-json" className="inline-flex items-center gap-2 text-sm font-black text-[#342d4c]">
          <FileJson2 className="h-4 w-4 text-violet-600" />
          JSON đề từ vựng
        </label>
        <button
          type="button"
          onClick={() => {
            if (textareaRef.current) {
              textareaRef.current.value = JSON.stringify(sampleJson, null, 2);
            }
          }}
          className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-black text-violet-700"
        >
          Điền JSON mẫu
        </button>
      </div>
      <textarea
        id="vocabulary-exam-json"
        ref={textareaRef}
        name="rawInput"
        rows={7}
        placeholder="Dán một đề, mảng nhiều đề, hoặc chọn file JSON..."
        className="w-full rounded-2xl border border-[#ddd8ec] bg-[#fbfafc] px-4 py-3 font-mono text-xs leading-5 text-[#342d4c] outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
      />
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#ddd8ec] bg-white px-4 py-2 text-xs font-black text-[#665f78]">
          <FileUp className="h-4 w-4" />
          Chọn file JSON
          <input
            type="file"
            accept=".json,application/json"
            className="sr-only"
            onChange={async (event) => {
              const file = event.currentTarget.files?.[0];
              if (file && textareaRef.current) {
                textareaRef.current.value = await file.text();
              }
            }}
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-full bg-violet-600 px-5 py-2 text-xs font-black text-white shadow-[0_10px_22px_rgba(109,75,217,0.22)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Upload className="h-4 w-4" />
          {pending ? "Đang import..." : "Import đề"}
        </button>
      </div>
      {state.message ? (
        <p
          aria-live="polite"
          className={`rounded-2xl border px-4 py-3 text-sm font-bold ${
            state.status === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
