"use client";

import { useActionState, useRef } from "react";

import {
  importAdminVocabItemsAction,
  type AdminImportState,
} from "@/app/actions/admin-vocab";

const initialState: AdminImportState = {
  status: "idle",
  message: "",
};

type Props = {
  lessonId: string | null;
};

export function AdminVocabImportForm({ lessonId }: Props) {
  const [state, formAction, pending] = useActionState(
    importAdminVocabItemsAction,
    initialState
  );
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const hasLesson = Boolean(lessonId);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="lessonId" value={lessonId ?? ""} />
      <textarea
        ref={textareaRef}
        name="rawInput"
        className="min-h-52 w-full resize-y rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-sky-400 focus:ring-3 focus:ring-sky-100"
        placeholder="Paste JSON line hoac text (word, reading, kanji, hanviet, meaning). Neu word chi la hiragana/katakana thi nen co field kanji de lien ket trang Kanji."
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

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!hasLesson || pending}
        >
          {pending ? "Dang nhap..." : "Nhap vao kho admin"}
        </button>
        <button
          type="button"
          className="rounded-xl border border-fuchsia-200 bg-fuchsia-50 px-4 py-2 text-sm font-semibold text-fuchsia-700"
          onClick={() => {
            if (!textareaRef.current) {
              return;
            }
            textareaRef.current.value =
              '{"word":"勉強","reading":"べんきょう","kanji":"勉強","hanviet":"Miễn Cường","meaning":"Học tập"},\n{"word":"電車","reading":"でんしゃ","kanji":"電車","hanviet":"Điện Xa","meaning":"Tàu điện"}';
          }}
          disabled={!hasLesson || pending}
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
