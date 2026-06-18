"use client";

import { FileUp, ListChecks, Wand2 } from "lucide-react";
import { useActionState, useRef, useState } from "react";

import {
  importGrammarPracticeAction,
  type GrammarPracticeImportState,
} from "@/app/actions/grammar-practice";

const initialState: GrammarPracticeImportState = {
  status: "idle",
  message: "",
};

const sampleGrammarJson = [
  {
    id: "n2_grammar_wake_dewa_nai",
    deckName: "Ngữ pháp N2 căn bản",
    jlptLevel: "N2",
    topic: "Mức độ, nhấn mạnh",
    pattern: "〜わけではない",
    displayPattern: "〜わけではない",
    meaning: {
      vi: "không phải là... / không hẳn là...",
      shortVi: "không phải hoàn toàn là...",
    },
    structure: {
      raw: "V-普通形 / Aい / Aな / N + わけではない",
      forms: [
        {
          label: "Động từ",
          rule: "V-普通形 + わけではない",
          example: "行くわけではない",
        },
      ],
    },
    nuance: {
      vi: "Dùng để phủ định một kết luận quá mức.",
      usage: ["trung dung", "giải thích", "phủ định suy luận quá đà"],
    },
    confusablePatterns: [
      {
        pattern: "〜わけがない",
        meaning: "không thể nào...",
        difference: "〜わけではない phủ định một phần; 〜わけがない phủ định mạnh khả năng xảy ra.",
      },
    ],
    examples: [
      {
        id: "ex_001",
        jp: "日本語が話せるが、完璧なわけではない。",
        jpWithReading: "日本語(にほんご)が話(はな)せるが、完璧(かんぺき)なわけではない。",
        vi: "Tôi nói được tiếng Nhật, nhưng không phải là hoàn hảo.",
        highlight: "完璧なわけではない",
        note: "Phủ định ý nghĩ nói được tiếng Nhật là hoàn hảo.",
      },
      {
        id: "ex_002",
        jp: "高い店が全部おいしいわけではない。",
        jpWithReading: "高(たか)い店(みせ)が全部(ぜんぶ)おいしいわけではない。",
        vi: "Không phải cửa hàng đắt tiền nào cũng ngon.",
        highlight: "全部おいしいわけではない",
      },
    ],
    quiz: [
      {
        id: "q_001",
        type: "meaning_choice",
        skill: "recognition",
        difficulty: 1,
        question: "Câu sau có nghĩa gần nhất là gì?",
        prompt: {
          jp: "高い店が全部おいしいわけではない。",
        },
        options: [
          { id: "A", text: "Tất cả cửa hàng đắt tiền đều ngon." },
          { id: "B", text: "Không phải cửa hàng đắt tiền nào cũng ngon." },
          { id: "C", text: "Cửa hàng đắt tiền chắc chắn không ngon." },
          { id: "D", text: "Cửa hàng này không đắt tiền." },
        ],
        answer: "B",
        explanation: "Mẫu này phủ định một kết luận quá mức.",
      },
    ],
    review: {
      priority: 4,
      recommendedNextReviewDays: [1, 3, 7, 14],
      commonMistakes: [
        "Nhầm 〜わけではない với 〜わけがない.",
        "Hiểu sai thành phủ định hoàn toàn.",
      ],
    },
  },
  {
    id: "n2_grammar_ni_suginai",
    deckName: "Ngữ pháp N2 căn bản",
    jlptLevel: "N2",
    topic: "Mức độ, nhấn mạnh",
    pattern: "〜にすぎない",
    displayPattern: "〜にすぎない",
    meaning: "chỉ là..., không hơn",
    structure: "N / V-辞書形 + にすぎない",
    examples: [
      {
        jp: "それはうわさにすぎない。",
        vi: "Đó chỉ là lời đồn thôi.",
      },
    ],
    quiz: [
      {
        id: "q_001",
        type: "meaning_choice",
        skill: "recognition",
        difficulty: 1,
        question: "「それはうわさにすぎない。」 nghĩa là gì?",
        options: [
          { id: "A", text: "Đó là sự thật chắc chắn." },
          { id: "B", text: "Đó chỉ là lời đồn thôi." },
          { id: "C", text: "Đó là điều không thể xảy ra." },
          { id: "D", text: "Đó là một lời hứa quan trọng." },
        ],
        answer: "B",
        explanation: "〜にすぎない nhấn mạnh rằng sự việc chỉ ở mức đó, không hơn.",
      },
    ],
  },
];

const sampleGrammarQuizDeckJson = {
  id: "n2_grammar_review_quiz_sample",
  deckName: "Quiz ôn ngữ pháp N2 - Mức độ, nhấn mạnh",
  jlptLevel: "N2",
  quizType: "grammar_review",
  topic: "Mức độ, nhấn mạnh",
  estimatedMinutes: 10,
  instructionsVi: "Chọn đáp án đúng nhất. Chú ý phân biệt 〜わけではない và 〜にすぎない.",
  items: [
    {
      id: "q001",
      type: "meaning_choice",
      skill: "recognition",
      difficulty: 1,
      targetPattern: "〜わけではない",
      question: "Câu sau có nghĩa gần nhất là gì?",
      prompt: {
        jp: "高い店が全部おいしいわけではない。",
        jpWithReading: "高(たか)い店(みせ)が全部(ぜんぶ)おいしいわけではない。",
      },
      options: [
        { id: "A", text: "Tất cả cửa hàng đắt tiền đều ngon." },
        { id: "B", text: "Không phải cửa hàng đắt tiền nào cũng ngon." },
        { id: "C", text: "Cửa hàng đắt tiền chắc chắn không ngon." },
        { id: "D", text: "Cửa hàng này không đắt tiền." },
      ],
      answer: "B",
      explanationVi: "〜わけではない dùng để phủ định một kết luận quá mức.",
    },
    {
      id: "q002",
      type: "fill_blank",
      skill: "production",
      difficulty: 2,
      targetPattern: "〜にすぎない",
      question: "Điền phần còn thiếu bằng ngữ pháp phù hợp.",
      prompt: {
        jp: "私の意見は参考＿＿＿＿。",
        jpWithReading: "私(わたし)の意見(いけん)は参考(さんこう)＿＿＿＿。",
        vi: "Ý kiến của tôi chỉ để tham khảo thôi.",
      },
      answer: "にすぎません",
      acceptableAnswers: ["にすぎない", "にすぎません"],
      explanationVi: "参考にすぎません nghĩa là 'chỉ là tham khảo thôi'.",
    },
    {
      id: "q003",
      type: "sentence_reorder",
      skill: "syntax",
      difficulty: 3,
      targetPattern: "〜わけではない",
      question: "Sắp xếp các phần sau thành câu đúng.",
      prompt: {
        vi: "Không phải là tôi không có tiền, nhưng tôi muốn tiết kiệm.",
        parts: ["お金がない", "わけではないが、", "節約したい", "。"],
      },
      answer: ["お金がない", "わけではないが、", "節約したい", "。"],
      explanationVi: "お金がないわけではない nghĩa là 'không phải là không có tiền'.",
    },
  ],
  reviewConfig: {
    shuffleItems: true,
    shuffleOptions: true,
    passScorePercent: 80,
    recommendedNextReviewDays: [1, 3, 7, 14],
  },
};

export function GrammarPracticeImportForm() {
  const [state, formAction, pending] = useActionState(importGrammarPracticeAction, initialState);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [fileLabel, setFileLabel] = useState("");

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <label className="block">
          <span className="text-sm font-black text-[#172033]">Tên mục ngữ pháp</span>
          <input
            name="deckName"
            type="text"
            className="mt-2 h-12 w-full rounded-2xl border border-[#d7e0ef] bg-white px-4 text-sm font-bold text-[#18223b] outline-none transition placeholder:text-[#98a2b3] focus:border-[#22a6a1] focus:ring-4 focus:ring-[#d7f4f1]"
            placeholder="Ví dụ: Ngữ pháp N2 tổng hợp..."
            disabled={pending}
          />
        </label>
        <p className="rounded-2xl border border-[#d7e0ef] bg-[#f8fcff] px-4 py-3 text-xs font-semibold leading-5 text-[#667085]">
          Nếu nhập tên mục ở đây, tất cả mẫu hoặc bộ quiz trong JSON sẽ vào cùng một mục.
        </p>
      </div>

      <textarea
        ref={textareaRef}
        name="rawInput"
        className="min-h-72 max-h-[520px] w-full resize-y overflow-y-auto rounded-2xl border border-[#d7e0ef] bg-white px-4 py-3 font-[var(--font-jp)] text-sm leading-7 text-[#18223b] outline-none transition focus:border-[#22a6a1] focus:ring-4 focus:ring-[#d7f4f1]"
        placeholder="Dán JSON: pattern/title + meaning, hoặc quiz deck có items/questions..."
        disabled={pending}
        required
      />

      <div className="rounded-2xl border border-[#d7e0ef] bg-[#f7fafc] p-3">
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-dashed border-[#bdd2e8] bg-white px-4 py-3 text-sm font-bold text-[#263750] transition hover:bg-[#f3fbfa]">
          <span className="inline-flex items-center gap-2">
            <FileUp className="h-4 w-4 text-[#22a6a1]" />
            Chọn file JSON / TXT
          </span>
          <input
            type="file"
            accept=".json,.txt,application/json,text/plain"
            className="hidden"
            disabled={pending}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (!file || !textareaRef.current) {
                return;
              }
              const reader = new FileReader();
              reader.onload = () => {
                textareaRef.current!.value = typeof reader.result === "string" ? reader.result : "";
                setFileLabel(`${file.name} (${Math.max(1, Math.round(file.size / 1024))} KB)`);
              };
              reader.readAsText(file, "utf-8");
            }}
          />
        </label>
        {fileLabel ? <p className="mt-2 text-xs font-semibold text-[#667085]">{fileLabel}</p> : null}
      </div>

      {state.message ? (
        <p
          className={
            state.status === "error"
              ? "rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700"
              : "rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700"
          }
        >
          {state.message}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          className="inline-flex items-center gap-2 rounded-xl bg-[#123c69] px-4 py-2.5 text-sm font-black text-white shadow-[0_12px_24px_rgba(18,60,105,0.16)] transition hover:bg-[#0f3157] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={pending}
        >
          <FileUp className="h-4 w-4" />
          {pending ? "Đang import..." : "Import ngữ pháp"}
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-xl border border-[#ffd6a8] bg-[#fff7ed] px-4 py-2.5 text-sm font-black text-[#b45b10] transition hover:bg-[#ffedd5]"
          disabled={pending}
          onClick={() => {
            if (!textareaRef.current) {
              return;
            }
            textareaRef.current.value = JSON.stringify(sampleGrammarJson, null, 2);
          }}
        >
          <Wand2 className="h-4 w-4" />
          Mẫu ngữ pháp
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-xl border border-[#c7d2fe] bg-[#eef2ff] px-4 py-2.5 text-sm font-black text-[#4338ca] transition hover:bg-[#e0e7ff]"
          disabled={pending}
          onClick={() => {
            if (!textareaRef.current) {
              return;
            }
            textareaRef.current.value = JSON.stringify(sampleGrammarQuizDeckJson, null, 2);
          }}
        >
          <ListChecks className="h-4 w-4" />
          Mẫu quiz
        </button>
      </div>
    </form>
  );
}
