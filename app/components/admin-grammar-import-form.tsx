"use client";

import { useActionState, useRef } from "react";

import {
  importAdminGrammarPointsAction,
  type AdminImportState,
} from "@/app/actions/admin-content";

const initialState: AdminImportState = {
  status: "idle",
  message: "",
};

type Props = {
  lessonId: string | null;
};

export function AdminGrammarImportForm({ lessonId }: Props) {
  const [state, formAction, pending] = useActionState(
    importAdminGrammarPointsAction,
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
        className="min-h-48 w-full resize-y rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-sky-400 focus:ring-3 focus:ring-sky-100"
        placeholder='Ho tro JSON array / JSON-lines. Field chuan: title (hoac pattern), meaning_vi (hoac meaning), meaning_simple, structure[], usage[], examples[] (string hoac {jp,kana,vi}), notes[], image. Khong can tags/related.'
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
          {pending ? "Dang import..." : "Import vao bai"}
        </button>
        <button
          type="button"
          className="rounded-xl border border-fuchsia-200 bg-fuchsia-50 px-4 py-2 text-sm font-semibold text-fuchsia-700"
          onClick={() => {
            if (!textareaRef.current) {
              return;
            }
            textareaRef.current.value =
              '[\n  {\n    "title":"N1 は N2 です",\n    "pattern":"N1 は N2 です",\n    "meaning_vi":"N1 la N2",\n    "meaning_simple":"Dung de gioi thieu hoac dinh nghia N1.",\n    "structure":["N1 は N2 です"],\n    "usage":["Dung trong cau khang dinh lich su."],\n    "examples":[\n      {"jp":"わたしは がくせいです。","kana":"わたしは がくせいです。","vi":"Toi la sinh vien."},\n      {"jp":"たなかさんは せんせいです。","vi":"Anh Tanaka la giao vien."}\n    ],\n    "notes":["Tro tu は doc la wa."],\n    "image":"/grammar-images/n5/lesson-01/n1-ha-n2-desu.png"\n  }\n]';
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
