"use client";

import { FileUp, Wand2 } from "lucide-react";
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
    deckName: "Ngu phap N2 can ban",
    jlptLevel: "N2",
    topic: "Muc do, nhan manh",
    pattern: "〜わけではない",
    displayPattern: "〜わけではない",
    meaning: {
      vi: "khong phai la... / khong han la...",
      shortVi: "khong phai hoan toan la...",
    },
    structure: {
      raw: "V-普通形 / Aい / Aな / N + わけではない",
      forms: [
        {
          label: "Dong tu",
          rule: "V-普通形 + わけではない",
          example: "行くわけではない",
        },
      ],
    },
    nuance: {
      vi: "Dung de phu dinh mot ket luan qua muc.",
      usage: ["trung dung", "giai thich", "phu dinh suy luan qua da"],
    },
    confusablePatterns: [
      {
        pattern: "〜わけがない",
        meaning: "khong the nao...",
        difference: "〜わけではない phu dinh mot phan; 〜わけがない phu dinh manh kha nang xay ra.",
      },
    ],
    examples: [
      {
        id: "ex_001",
        jp: "日本語が話せるが、完璧なわけではない。",
        jpWithReading: "日本語(にほんご)が話(はな)せるが、完璧(かんぺき)なわけではない。",
        vi: "Toi noi duoc tieng Nhat, nhung khong phai la hoan hao.",
        highlight: "完璧なわけではない",
        note: "Phu dinh y nghi noi duoc tieng Nhat la hoan hao.",
      },
      {
        id: "ex_002",
        jp: "高い店が全部おいしいわけではない。",
        jpWithReading: "高(たか)い店(みせ)が全部(ぜんぶ)おいしいわけではない。",
        vi: "Khong phai cua hang dat tien nao cung ngon.",
        highlight: "全部おいしいわけではない",
      },
    ],
    quiz: [
      {
        id: "q_001",
        type: "meaning_choice",
        skill: "recognition",
        difficulty: 1,
        question: "Cau sau co nghia gan nhat la gi?",
        prompt: {
          jp: "高い店が全部おいしいわけではない。",
        },
        options: [
          { id: "A", text: "Tat ca cua hang dat tien deu ngon." },
          { id: "B", text: "Khong phai cua hang dat tien nao cung ngon." },
          { id: "C", text: "Cua hang dat tien chac chan khong ngon." },
          { id: "D", text: "Cua hang nay khong dat tien." },
        ],
        answer: "B",
        explanation: "Mau nay phu dinh mot ket luan qua muc.",
      },
    ],
    review: {
      priority: 4,
      recommendedNextReviewDays: [1, 3, 7, 14],
      commonMistakes: [
        "Nham 〜わけではない voi 〜わけがない.",
        "Hieu sai thanh phu dinh hoan toan.",
      ],
    },
  },
  {
    deckName: "Ngu phap N2 can ban",
    jlptLevel: "N2",
    topic: "Muc do, nhan manh",
    pattern: "〜にすぎない",
    meaning: "chi la..., khong hon",
    structure: "N / V-dictionary + ni suginai",
    examples: [
      {
        jp: "それはうわさにすぎない。",
        vi: "Do chi la loi don thoi.",
      },
    ],
  },
];

export function GrammarPracticeImportForm() {
  const [state, formAction, pending] = useActionState(importGrammarPracticeAction, initialState);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [fileLabel, setFileLabel] = useState("");

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <label className="block">
          <span className="text-sm font-black text-[#172033]">Ten muc ngu phap</span>
          <input
            name="deckName"
            type="text"
            className="mt-2 h-12 w-full rounded-2xl border border-[#d7e0ef] bg-white px-4 text-sm font-bold text-[#18223b] outline-none transition placeholder:text-[#98a2b3] focus:border-[#22a6a1] focus:ring-4 focus:ring-[#d7f4f1]"
            placeholder="Vi du: Ngu phap N2 tong hop..."
            disabled={pending}
          />
        </label>
        <p className="rounded-2xl border border-[#d7e0ef] bg-[#f8fcff] px-4 py-3 text-xs font-semibold leading-5 text-[#667085]">
          Neu nhap ten muc o day, tat ca mau trong JSON se vao cung mot muc.
        </p>
      </div>

      <textarea
        ref={textareaRef}
        name="rawInput"
        className="min-h-72 max-h-[520px] w-full resize-y overflow-y-auto rounded-2xl border border-[#d7e0ef] bg-white px-4 py-3 font-[var(--font-jp)] text-sm leading-7 text-[#18223b] outline-none transition focus:border-[#22a6a1] focus:ring-4 focus:ring-[#d7f4f1]"
        placeholder="Dan JSON: pattern/title, meaning, level, examples, notes..."
        disabled={pending}
        required
      />

      <div className="rounded-2xl border border-[#d7e0ef] bg-[#f7fafc] p-3">
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-dashed border-[#bdd2e8] bg-white px-4 py-3 text-sm font-bold text-[#263750] transition hover:bg-[#f3fbfa]">
          <span className="inline-flex items-center gap-2">
            <FileUp className="h-4 w-4 text-[#22a6a1]" />
            Chon file JSON / TXT
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
          {pending ? "Dang import..." : "Import ngu phap"}
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
          Mau JSON
        </button>
      </div>
    </form>
  );
}
