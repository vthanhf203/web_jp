"use client";

import { useActionState, useRef } from "react";

import {
  importAdminKanjiAction,
  type AdminImportState,
} from "@/app/actions/admin-content";

const initialState: AdminImportState = {
  status: "idle",
  message: "",
};

export function AdminKanjiImportForm() {
  const [state, formAction, pending] = useActionState(importAdminKanjiAction, initialState);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  return (
    <form action={formAction} className="space-y-3">
      <textarea
        ref={textareaRef}
        name="rawInput"
        className="min-h-48 w-full resize-y rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-sky-400 focus:ring-3 focus:ring-sky-100"
        placeholder='Ho tro JSON array / JSON object / JSON-lines / text. Field moi: id, character, meaning, onReading[], kunReading[], strokeCount, jlptLevel, order, category, tags[], relatedVocabularies[].'
        disabled={pending}
        required
      />

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
          {pending ? "Dang import..." : "Import Kanji"}
        </button>
        <button
          type="button"
          className="rounded-xl border border-fuchsia-200 bg-fuchsia-50 px-4 py-2 text-sm font-semibold text-fuchsia-700"
          onClick={() => {
            if (!textareaRef.current) {
              return;
            }
            textareaRef.current.value =
              '[\n  {\n    "id": "n5-001",\n    "character": "生",\n    "meaning": "Sinh, song",\n    "onReading": ["セイ", "ショウ"],\n    "kunReading": ["いきる", "うまれる", "なま"],\n    "strokeCount": 5,\n    "jlptLevel": "N5",\n    "order": 12,\n    "category": "life",\n    "tags": ["life", "existence"],\n    "relatedVocabularies": [\n      {\n        "id": "v-001",\n        "word": "学生",\n        "reading": "がくせい",\n        "meaning": "Hoc sinh",\n        "type": "noun",\n        "jlptLevel": "N5",\n        "exampleSentence": "私は学生です。",\n        "exampleMeaning": "Toi la hoc sinh"\n      },\n      {\n        "id": "v-002",\n        "word": "先生",\n        "reading": "せんせい",\n        "meaning": "Giao vien",\n        "type": "noun",\n        "jlptLevel": "N5",\n        "exampleSentence": "先生に聞きます。",\n        "exampleMeaning": "Toi hoi giao vien"\n      }\n    ],\n    "createdAt": "2026-04-18",\n    "updatedAt": "2026-04-18"\n  }\n]';
          }}
          disabled={pending}
        >
          Mau JSON
        </button>
        <button
          type="button"
          className="ml-auto rounded-xl px-3 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-100"
          onClick={() => {
            if (textareaRef.current) {
              textareaRef.current.value = "";
            }
          }}
          disabled={pending}
        >
          Xoa nhap
        </button>
      </div>
    </form>
  );
}
