"use client";

import { useActionState, useRef, useState } from "react";

import {
  importAdminQuizQuestionsAction,
  type AdminQuizImportState,
} from "@/app/actions/admin-quiz";

const initialState: AdminQuizImportState = {
  status: "idle",
  message: "",
};

export function AdminQuizImportForm() {
  const [state, formAction, pending] = useActionState(
    importAdminQuizQuestionsAction,
    initialState
  );
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [fileLabel, setFileLabel] = useState("");

  return (
    <form action={formAction} className="space-y-3">
      <textarea
        ref={textareaRef}
        name="rawInput"
        className="min-h-52 w-full resize-y rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-sky-400 focus:ring-3 focus:ring-sky-100"
        placeholder="JSON hoac CSV: level,category,prompt,optionA,optionB,optionC,optionD,correctOption,explanation"
        disabled={pending}
        required
      />

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <p className="text-xs font-semibold text-slate-600">Upload file bai tap</p>
        <p className="mt-1 text-xs text-slate-500">Ho tro .json, .txt, .csv. Chon file se tu do vao o tren.</p>
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
              const content = typeof reader.result === "string" ? reader.result : "";
              textareaRef.current!.value = content;
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
          {pending ? "Đang upload..." : "Upload bài tập"}
        </button>
        <button
          type="button"
          className="rounded-xl border border-fuchsia-200 bg-fuchsia-50 px-4 py-2 text-sm font-semibold text-fuchsia-700"
          onClick={() => {
            if (!textareaRef.current) {
              return;
            }
            textareaRef.current.value =
              '{"level":"N5","category":"Ngữ pháp","prompt":"N1 wa N2 desu nghĩa là gì?","optionA":"N1 là N2","optionB":"N1 không phải N2","optionC":"N1 và N2","optionD":"N1 sẽ là N2","correctOption":"A","explanation":"Mẫu câu định nghĩa cơ bản."},\n{"level":"N5","category":"Từ vựng","prompt":"Benkyou là gì?","optionA":"Ăn cơm","optionB":"Học tập","optionC":"Đi chơi","optionD":"Ngủ","correctOption":"B","explanation":"Benkyou = học tập."}';
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
            setFileLabel("");
          }}
          disabled={pending}
        >
          Xóa nhập
        </button>
      </div>
    </form>
  );
}
