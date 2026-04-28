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

const SAMPLE_JSON = `{
  "lesson_id": "nai_form",
  "lesson_number": 2,
  "lesson_title": "Thể ない",
  "level": "N5",
  "sections": [
    {
      "section_id": "nai_form",
      "section_type": "conjugation",
      "section_title": "Thể ない",
      "form_key": "nai_form",
      "form_label": "ない形",
      "description": "Động từ đi với ない được gọi là thể ない.",
      "group_descriptions": [
        {
          "group": 1,
          "group_name": "Nhóm 1",
          "description": "Động từ nhóm 1 đổi âm hàng i trước ます sang hàng a rồi thêm ない.",
          "general_rule": "V iます → V aない",
          "special_rule": "V います → V わない"
        }
      ],
      "rules": [
        {
          "rule_id": "nai_group1_i_to_wa",
          "group": 1,
          "pattern": "V います → V わない",
          "note": "Trường hợp đặc biệt."
        }
      ],
      "items": [
        {
          "id": "nai_001",
          "group": 1,
          "rule_id": "nai_group1_i_to_wa",
          "masu_form": "あいます",
          "nai_form": "あわない",
          "meaning_vi": "gặp"
        }
      ]
    }
  ]
}`;

type Props = {
  lessonId: string | null;
  jlptLevel: string;
};

export function AdminConjugationImportForm({ lessonId, jlptLevel }: Props) {
  const [state, formAction, pending] = useActionState(
    importAdminConjugationItemsAction,
    initialState
  );
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="lessonId" value={lessonId ?? ""} />
      <input type="hidden" name="jlptLevel" value={jlptLevel} />
      <textarea
        ref={textareaRef}
        name="rawInput"
        className="min-h-52 w-full resize-y rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-sky-400 focus:ring-3 focus:ring-sky-100"
        placeholder='Hỗ trợ JSON dạng bài học đầy đủ: lesson + sections + group_descriptions + rules + items.'
        disabled={pending}
        required
      />
      <p className="text-xs text-slate-500">
        Hệ thống tự dò theo thể (<code>form_key</code>/<code>form label</code>): chưa có thì tạo
        lesson mới, có rồi thì nhập vào lesson đó.
      </p>

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
          {pending ? "Đang nạp..." : "Nhập JSON chia thể"}
        </button>
        <button
          type="button"
          className="rounded-xl border border-fuchsia-200 bg-fuchsia-50 px-4 py-2 text-sm font-semibold text-fuchsia-700"
          onClick={() => {
            if (!textareaRef.current) {
              return;
            }
            textareaRef.current.value = SAMPLE_JSON;
          }}
          disabled={pending}
        >
          Mẫu JSON
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
          Xóa nhập
        </button>
      </div>
    </form>
  );
}
