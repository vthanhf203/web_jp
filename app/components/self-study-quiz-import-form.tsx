"use client";

import { useActionState, useRef, useState } from "react";

import {
  importSelfStudyQuizAction,
  type SelfStudyQuizImportState,
} from "@/app/actions/self-study-quiz";

const initialState: SelfStudyQuizImportState = {
  status: "idle",
  message: "",
};

const sampleQuizJson = [
  {
    level: "N5",
    prompt: "えいが nghĩa là gì?",
    options: [
      { text: "映画", furigana: "えいが" },
      { text: "母", furigana: "はは" },
      { text: "長い", furigana: "ながい" },
      { text: "映す", furigana: "うつす" },
    ],
    correctOption: "A",
    explanation: "えいが = 映画 (phim).",
  },
];

export function SelfStudyQuizImportForm() {
  const [state, formAction, pending] = useActionState(importSelfStudyQuizAction, initialState);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [fileLabel, setFileLabel] = useState("");

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[200px_minmax(0,1fr)] sm:items-center">
        <label htmlFor="deckName" className="text-sm font-semibold text-slate-700">
          Ten bo quiz
        </label>
        <input
          id="deckName"
          name="deckName"
          defaultValue="Tu hoc"
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-400 focus:ring-3 focus:ring-sky-100"
          disabled={pending}
          required
        />
      </div>

      <textarea
        ref={textareaRef}
        name="rawInput"
        className="min-h-52 w-full resize-y rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-sky-400 focus:ring-3 focus:ring-sky-100"
        placeholder='JSON: prompt + options[{ "text": "映画", "furigana": "えいが" }] + correctOption + explanation'
        disabled={pending}
        required
      />

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <p className="text-xs font-semibold text-slate-600">Upload file</p>
        <p className="mt-1 text-xs text-slate-500">Ho tro .json, .txt, .csv.</p>
        <input
          type="file"
          accept=".json,.txt,.csv,text/plain,application/json,text/csv"
          className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-sky-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-sky-700"
          disabled={pending}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (!file || !textareaRef.current) {
              return;
            }
            const reader = new FileReader();
            reader.onload = () => {
              textareaRef.current!.value = typeof reader.result === "string" ? reader.result : "";
              setFileLabel(`${file.name} (${Math.round(file.size / 1024)} KB)`);
            };
            reader.readAsText(file, "utf-8");
          }}
        />
        {fileLabel ? <p className="mt-1 text-xs text-slate-500">{fileLabel}</p> : null}
      </div>

      {state.message ? (
        <p
          className={
            state.status === "error"
              ? "rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
              : "rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
          }
        >
          {state.message}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={pending}
        >
          {pending ? "Dang import..." : "Import bo quiz"}
        </button>
        <button
          type="button"
          className="rounded-xl border border-fuchsia-200 bg-fuchsia-50 px-4 py-2 text-sm font-semibold text-fuchsia-700"
          onClick={() => {
            if (!textareaRef.current) {
              return;
            }
            textareaRef.current.value = JSON.stringify(sampleQuizJson, null, 2);
          }}
          disabled={pending}
        >
          Mau JSON
        </button>
      </div>
    </form>
  );
}

