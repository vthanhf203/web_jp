"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import {
  importAdminVocabLessonBundleAction,
  type AdminImportState,
} from "@/app/actions/admin-vocab";

const initialState: AdminImportState = {
  status: "idle",
  message: "",
};

type Props = {
  defaultJlptLevel: string;
};

export function AdminVocabLessonBundleImportForm({ defaultJlptLevel }: Props) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    importAdminVocabLessonBundleAction,
    initialState
  );
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (state.status === "success") {
      router.refresh();
    }
  }, [router, state.status]);

  return (
    <form action={formAction} className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
      <input type="hidden" name="defaultJlptLevel" value={defaultJlptLevel} />
      <textarea
        ref={textareaRef}
        name="rawInput"
        className="min-h-52 w-full resize-y rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-sky-400 focus:ring-3 focus:ring-sky-100"
        placeholder='Dán JSON dạng { "lessons": { "bai_1": [ ... ] } }, dạng theo chủ đề { "xung_ho_chao_hoi": [ ... ], ... }, hoặc mảng [{ "categoryKey":"...", "categoryName":"...", "items":[...] }]. Mẹo: field "word" nên là tiếng Nhật (hiragana/katakana/kanji), không dùng romaji.'
        required
        disabled={pending}
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
          {pending ? "Đang nhập..." : "Nhập JSON tạo lesson"}
        </button>
        <button
          type="button"
          className="rounded-xl border border-fuchsia-200 bg-fuchsia-50 px-4 py-2 text-sm font-semibold text-fuchsia-700"
          onClick={() => {
            if (!textareaRef.current) {
              return;
            }
            textareaRef.current.value =
              '[\n  {\n    "categoryKey": "xung_ho_chao_hoi",\n    "categoryName": "Xưng hô & chào hỏi",\n    "items": [\n      {\n        "word": "わたし",\n        "reading": "わたし",\n        "kanji": "私",\n        "hanviet": "tư",\n        "partOfSpeech": "pronoun",\n        "meaning": "Tôi"\n      }\n    ]\n  },\n  {\n    "categoryKey": "truong_hoc_hoc_tap",\n    "categoryName": "Trường học & học tập",\n    "items": [\n      {\n        "word": "ほん",\n        "reading": "ほん",\n        "kanji": "本",\n        "hanviet": "bản",\n        "partOfSpeech": "noun",\n        "meaning": "Sách"\n      },\n      {\n        "word": "コーヒー",\n        "reading": "コーヒー",\n        "kanji": "",\n        "hanviet": "",\n        "partOfSpeech": "noun",\n        "meaning": "Cà phê"\n      }\n    ]\n  }\n]';
          }}
          disabled={pending}
        >
          Mẫu JSON category[]
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
