"use client";

import { FileUp, Wand2 } from "lucide-react";
import { useActionState, useRef } from "react";

import {
  importReadingVocabTextsAction,
  type ReadingVocabImportState,
} from "@/app/actions/reading-vocab-import";

const initialState: ReadingVocabImportState = {
  status: "idle",
  message: "",
};

const sampleReadingVocabJson = [
  {
    id: "reading-vocab-sample-001",
    deckName: "Tu vung qua bai doc",
    title: "電車(でんしゃ)が遅(おく)れた日(ひ)",
    jlptLevel: "N5-N4",
    topic: "Doi song / Tau dien",
    difficulty: "Trung binh",
    estimatedMinutes: 8,
    paragraphs: [
      {
        jp: "駅(えき)に着(つ)くと、人(ひと)がたくさん待(ま)っていました。",
        vi: "Khi den ga, co rat nhieu nguoi dang doi.",
      },
      {
        jp: "電光掲示板(でんこうけいじばん)には「事故(じこ)のため、電車(でんしゃ)が遅(おく)れています」と書(か)いてありました。",
        vi: "Tren bang dien tu co ghi: vi tai nan nen tau dang bi tre.",
      },
    ],
    vocabulary: [
      {
        word: "駅",
        reading: "えき",
        meaning: "nha ga",
        role: "reviewVocabulary",
      },
      {
        word: "電光掲示板",
        reading: "でんこうけいじばん",
        meaning: "bang thong bao dien tu",
        role: "newVocabulary",
      },
      {
        word: "遅れる",
        reading: "おくれる",
        meaning: "bi tre / den muon",
        role: "newVocabulary",
      },
    ],
  },
];

export function ReadingVocabImportForm() {
  const [state, formAction, pending] = useActionState(importReadingVocabTextsAction, initialState);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="reading-vocab-deck-name" className="text-sm font-black text-[#123c69]">
          Ten bo rieng
        </label>
        <input
          id="reading-vocab-deck-name"
          name="deckName"
          type="text"
          placeholder="Vi du: Doc N5-N4 - di muon"
          className="mt-2 w-full rounded-2xl border border-[#d8e2ee] bg-white px-4 py-3 text-sm font-semibold text-[#111827] outline-none transition focus:border-[#22a6a1]"
        />
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="reading-vocab-json" className="text-sm font-black text-[#123c69]">
            JSON bai doc cho kho tu vung rieng
          </label>
          <button
            type="button"
            onClick={() => {
              if (textareaRef.current) {
                textareaRef.current.value = JSON.stringify(sampleReadingVocabJson, null, 2);
              }
            }}
            className="inline-flex items-center gap-2 rounded-full border border-[#cfeee9] bg-[#eefcf8] px-3 py-1.5 text-xs font-black text-[#0f766e] transition hover:bg-[#ddf7f1]"
          >
            <Wand2 className="h-3.5 w-3.5" />
            Dien mau
          </button>
        </div>

        <textarea
          id="reading-vocab-json"
          ref={textareaRef}
          name="rawInput"
          rows={12}
          placeholder="Dan JSON bai doc vao day. Du lieu nay chi luu trong muc Tu vung bai doc."
          className="mt-2 w-full rounded-2xl border border-[#d8e2ee] bg-[#fbfdff] px-4 py-3 font-mono text-sm text-[#111827] outline-none transition focus:border-[#22a6a1]"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#d8e2ee] bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-[#123c69] transition hover:bg-[#f4fbfb]">
          <FileUp className="h-4 w-4" />
          Chon file JSON
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
          className="rounded-full bg-[#14635d] px-5 py-2 text-xs font-black uppercase tracking-[0.12em] text-white transition hover:bg-[#104f4a] disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {pending ? "Dang import..." : "Import vao muc rieng"}
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
