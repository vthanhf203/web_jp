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
        placeholder='JSON: {"character":"日","meaning":"Mat troi, ngay","onReading":"NICHI, JITSU","kunReading":"hi, bi","strokeCount":4,"jlptLevel":"N5","exampleWord":"日本","exampleMeaning":"Nhat Ban"}'
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
              '{"character":"日","meaning":"Mat troi, ngay","onReading":"NICHI, JITSU","kunReading":"hi, bi, ka","strokeCount":4,"jlptLevel":"N5","exampleWord":"日本","exampleMeaning":"Nhat Ban"},\n{"character":"月","meaning":"Mat trang, thang","onReading":"GETSU, GATSU","kunReading":"tsuki","strokeCount":4,"jlptLevel":"N5","exampleWord":"月曜日","exampleMeaning":"Thu hai"}';
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
