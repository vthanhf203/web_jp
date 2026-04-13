"use client";

import { useActionState, useRef } from "react";

import {
  importVocabAction,
  type VocabImportState,
} from "@/app/actions/vocab-manager";

const initialState: VocabImportState = {
  status: "idle",
  message: "",
};

type Props = {
  lessonId: string | null;
};

export function VocabImportForm({ lessonId }: Props) {
  const [state, formAction, pending] = useActionState(importVocabAction, initialState);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const hasLesson = Boolean(lessonId);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="lessonId" value={lessonId ?? ""} />
      <textarea
        ref={textareaRef}
        name="rawInput"
        className="min-h-58 w-full resize-y rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-sky-400 focus:ring-3 focus:ring-sky-100"
        placeholder="Dan danh sach tu vung vao day (JSON line, text, tab, pipe...)."
        disabled={!hasLesson || pending}
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

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          className="inline-flex items-center rounded-xl bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!hasLesson || pending}
        >
          {pending ? "Dang nhap..." : "Nhap du lieu vao he thong"}
        </button>
        <button
          type="button"
          className="inline-flex items-center rounded-xl border border-fuchsia-200 bg-fuchsia-50 px-4 py-2.5 text-sm font-semibold text-fuchsia-600"
          onClick={() => {
            if (!textareaRef.current) {
              return;
            }
            textareaRef.current.value =
              '{"word":"勉強","reading":"べんきょう","kanji":"勉強","hanviet":"Miễn Cường","meaning":"Học tập"},\n{"word":"図書館","reading":"としょかん","kanji":"図書館","hanviet":"Đồ Thư Quán","meaning":"Thư viện"}';
          }}
          disabled={!hasLesson || pending}
        >
          AI Format
        </button>
        <button
          type="button"
          className="ml-auto inline-flex items-center rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-500 hover:bg-slate-100"
          onClick={() => {
            if (textareaRef.current) {
              textareaRef.current.value = "";
            }
          }}
          disabled={pending}
        >
          Bo nhap
        </button>
      </div>
    </form>
  );
}
