"use client";

import { FileUp, Wand2 } from "lucide-react";
import { useActionState, useRef } from "react";

import { importExamPracticeTestsAction, type ExamPracticeImportState } from "@/app/actions/exam-practice";

const initialState: ExamPracticeImportState = {
  status: "idle",
  message: "",
};

const sampleExamJson = [
  {
    id: "jtest-style-n5-n4-001",
    title: "J.TEST-style N5-N4 Test 01",
    level: "N5-N4",
    minutes: 45,
    tags: ["文法・語彙", "読解", "漢字", "短文作成"],
    sections: [
      {
        id: "grammar",
        title: "Phần 1: 文法・語彙問題",
        kind: "grammar",
        questions: [
          {
            id: "q001",
            number: 1,
            type: "blank",
            prompt: "つぎのえきで、でんしゃ（　）おります。",
            choices: ["で", "へ", "を", "と"],
            correctAnswer: "を",
            explanation: "おりる dùng を với phương tiện/nơi rời khỏi.",
          },
          {
            id: "q002",
            number: 2,
            type: "blank",
            prompt: "わたしは、ねる（　）まえに、本を読みます。",
            choices: ["ない", "る", "て", "た"],
            correctAnswer: "る",
          },
        ],
      },
      {
        id: "reading",
        title: "Phần 2: 読解問題",
        kind: "reading",
        questions: [
          {
            id: "q026",
            number: 26,
            type: "reading",
            passage:
              "わたしは日曜日に友だちと映画を見ました。映画のあと、レストランで昼ごはんを食べました。",
            prompt: "わたしは、だれと映画を見ましたか。",
            choices: ["友だちと", "家族と", "先生と", "一人で"],
            correctAnswer: "友だちと",
          },
        ],
      },
      {
        id: "kanji",
        title: "Phần 3: 漢字問題",
        kind: "kanji",
        questions: [
          {
            id: "q036",
            number: 36,
            type: "kanjiReading",
            prompt: "病院",
            choices: ["おわり", "は", "びょういん", "おります"],
            correctAnswer: "びょういん",
          },
        ],
      },
      {
        id: "sentence",
        title: "Phần 4: 短文作成問題",
        kind: "sentence",
        questions: [
          {
            id: "q046",
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

export function ExamImportForm() {
  const [state, formAction, pending] = useActionState(importExamPracticeTestsAction, initialState);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  return (
    <form action={formAction} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor="exam-practice-json" className="text-sm font-black text-[#172033]">
          JSON đề thi
        </label>
        <button
          type="button"
          onClick={() => {
            if (textareaRef.current) {
              textareaRef.current.value = JSON.stringify(sampleExamJson, null, 2);
            }
          }}
          className="inline-flex items-center gap-2 rounded-full border border-[#dcd3ff] bg-[#f6f2ff] px-3 py-1.5 text-xs font-black text-[#6d4bd9] transition hover:bg-[#efe8ff]"
        >
          <Wand2 className="h-3.5 w-3.5" />
          Điền mẫu
        </button>
      </div>

      <textarea
        id="exam-practice-json"
        ref={textareaRef}
        name="rawInput"
        rows={8}
        placeholder="Dán JSON đề vào đây. Hỗ trợ 1 đề hoặc mảng nhiều đề."
        className="w-full rounded-2xl border border-[#d8e2ee] bg-[#fbfdff] px-4 py-3 font-mono text-sm text-[#111827] outline-none transition focus:border-[#7c5bd6]"
      />

      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#d8e2ee] bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-[#123c69] transition hover:bg-[#f4fbfb]">
          <FileUp className="h-4 w-4" />
          Chọn file JSON
          <input
            type="file"
            accept=".json,application/json"
            className="sr-only"
            onChange={async (event) => {
              const file = event.currentTarget.files?.[0];
              if (!file || !textareaRef.current) {
                return;
              }
              textareaRef.current.value = await file.text();
            }}
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-[#6d4bd9] px-5 py-2 text-xs font-black uppercase tracking-[0.12em] text-white transition hover:bg-[#5b3bc3] disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {pending ? "Đang import..." : "Import đề"}
        </button>
      </div>

      {state.message ? (
        <p
          className={
            state.status === "success"
              ? "rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700"
              : "rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700"
          }
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
