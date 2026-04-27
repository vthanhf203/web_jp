"use client";

import { useActionState, useRef } from "react";

import {
  importAdminConjugationItemsAction,
  type AdminConjugationImportState,
} from "@/app/actions/admin-conjugation";

const initialState: AdminConjugationImportState = {
  status: "idle",
  message: "",
};

type Props = {
  lessonId: string | null;
};

export function AdminConjugationImportForm({ lessonId }: Props) {
  const [state, formAction, pending] = useActionState(
    importAdminConjugationItemsAction,
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
        placeholder='Ho tro JSON array va JSON bai hoc (lesson + rules + items). Vi du: {"lesson":14,"form":"te_form","form_label":"The て","items":[...]}'
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
          {pending ? "Dang nap..." : "Nhap JSON chia the"}
        </button>
        <button
          type="button"
          className="rounded-xl border border-fuchsia-200 bg-fuchsia-50 px-4 py-2 text-sm font-semibold text-fuchsia-700"
          onClick={() => {
            if (!textareaRef.current) {
              return;
            }
            textareaRef.current.value =
              '{\n  "lesson": 14,\n  "title": "第１４課",\n  "type": "conjugation",\n  "form": "te_form",\n  "form_label": "Thể て",\n  "description": "Thể て của động từ",\n  "rules": [\n    {\n      "rule_id": "group1_ki_to_ite",\n      "group": 1,\n      "pattern": "V きます → V いて"\n    },\n    {\n      "rule_id": "group2_masu_to_te",\n      "group": 2,\n      "pattern": "V ます → V て"\n    }\n  ],\n  "items": [\n    {\n      "id": "l14_te_001",\n      "group": 1,\n      "rule_id": "group1_ki_to_ite",\n      "masu_form": "かきます",\n      "te_form": "かいて",\n      "meaning_vi": "viết"\n    },\n    {\n      "id": "l14_te_005",\n      "group": 2,\n      "rule_id": "group2_masu_to_te",\n      "masu_form": "たべます",\n      "te_form": "たべて",\n      "meaning_vi": "ăn"\n    }\n  ]\n}';
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
