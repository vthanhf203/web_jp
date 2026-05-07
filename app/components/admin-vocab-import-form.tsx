"use client";

import { useActionState, useRef } from "react";
import { CloudUpload, FileText, Trash2 } from "lucide-react";

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

const sampleJson = `[
  {"word":"べんきょう","reading":"べんきょう","kanji":"勉強","hanviet":"Miễn Cường","partOfSpeech":"noun","meaning":"Học tập"},
  {"word":"でんしゃ","reading":"でんしゃ","kanji":"電車","hanviet":"Điện Xa","partOfSpeech":"noun","meaning":"Tàu điện"},
  {"word":"ありがとう","reading":"ありがとう","kanji":"","hanviet":"","partOfSpeech":"expression","meaning":"Cảm ơn"}
]`;

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
        className="min-h-36 w-full resize-y rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
        placeholder="Nhập hoặc dán danh sách từ ở đây. Mỗi từ là một object JSON hoặc một dòng text."
        disabled={!hasLesson || pending}
        required
      />

      <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2">
        <p className="text-xs font-bold text-slate-700">Định dạng hỗ trợ</p>
        <p className="mt-1 text-xs text-slate-600">
          JSON array, JSON-lines hoặc text thường. Field chuẩn: word, reading, kanji,
          hanviet, partOfSpeech, meaning.
        </p>
      </div>

      {state.message ? (
        <p
          className={
            state.status === "error"
              ? "rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
              : "rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
          }
        >
          {state.message}
        </p>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <button
          type="submit"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!hasLesson || pending}
        >
          <CloudUpload className="h-4 w-4" aria-hidden="true" />
          {pending ? "Đang thêm..." : "Thêm vào lesson"}
        </button>
        <button
          type="button"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-violet-200 bg-white px-4 text-sm font-bold text-violet-700 hover:bg-violet-50"
          onClick={() => {
            if (textareaRef.current) {
              textareaRef.current.value = sampleJson;
            }
          }}
          disabled={!hasLesson || pending}
        >
          <FileText className="h-4 w-4" aria-hidden="true" />
          Mẫu JSON lesson
        </button>
        <button
          type="button"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-sm font-bold text-slate-600 hover:bg-slate-50"
          onClick={() => {
            if (textareaRef.current) {
              textareaRef.current.value = "";
            }
          }}
          disabled={pending}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          Xóa nhanh
        </button>
      </div>
    </form>
  );
}
