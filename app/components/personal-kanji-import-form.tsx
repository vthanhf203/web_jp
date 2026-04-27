"use client";

import { useActionState, useRef } from "react";

import {
  clearPersonalKanjiAction,
  deletePersonalKanjiAction,
  importPersonalKanjiAction,
  type PersonalKanjiImportState,
} from "@/app/actions/personal";

const initialState: PersonalKanjiImportState = {
  status: "idle",
  message: "",
};

type PersonalKanjiRow = {
  id: string;
  character: string;
  meaning: string;
  jlptLevel: string;
  relatedWords?: Array<{
    id: string;
    word: string;
    reading: string;
    meaning: string;
  }>;
};

type Props = {
  items?: PersonalKanjiRow[];
};

export function PersonalKanjiImportForm({ items = [] }: Props) {
  const [state, formAction, pending] = useActionState(importPersonalKanjiAction, initialState);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  return (
    <div className="space-y-3">
      <form action={formAction} className="space-y-3">
        <textarea
          ref={textareaRef}
          name="rawInput"
          className="min-h-44 w-full resize-y rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-sky-400 focus:ring-3 focus:ring-sky-100"
          placeholder='Dan JSON Kanji cua ban: [{"character":"\\u4f4e","meaning":"thap","jlptLevel":"N4","strokeHint":"1 net trai, 2 net phai","strokeImage":"/kanji-stroke/raw/abc.jpg","relatedVocabularies":[...]}]'
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
            {pending ? "Đang import..." : "Import JSON cá nhân"}
          </button>

          <button
            type="button"
            className="rounded-xl border border-fuchsia-200 bg-fuchsia-50 px-4 py-2 text-sm font-semibold text-fuchsia-700"
            onClick={() => {
              if (!textareaRef.current) {
                return;
              }
              textareaRef.current.value =
                '[\n  {\n    "character": "\\u4f4e",\n    "meaning": "thấp",\n    "onReading": "\\u30c6\\u30a4",\n    "kunReading": "\\u3072\\u304f.\\u3044, \\u3072\\u304f.\\u3081\\u308b",\n    "strokeCount": 7,\n    "jlptLevel": "N4",\n    "order": 12,\n    "category": "tinh_chat",\n    "strokeHint": "1 (\\u30ce) bên trái, 2 (\\u4E3F) giữa, 3 (\\u6C0F) bên phải",\n    "strokeImage": "/kanji-stroke/raw/example.jpg",\n    "relatedVocabularies": [\n      { "word": "\\u4f4e\\u3044", "reading": "\\u3072\\u304f\\u3044", "meaning": "thấp" },\n      { "word": "\\u4f4e\\u6e29", "reading": "\\u3066\\u3044\\u304a\\u3093", "meaning": "nhiệt độ thấp" },\n      { "word": "\\u6700\\u4f4e", "reading": "\\u3055\\u3044\\u3066\\u3044", "meaning": "thấp nhất" }\n    ]\n  }\n]';
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

      <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Kanji cá nhân đã lưu ({items.length})
          </p>
          <form action={clearPersonalKanjiAction}>
            <button
              type="submit"
              className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
                items.length > 0
                  ? "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                  : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
              }`}
              disabled={items.length === 0 || pending}
            >
              Xóa toàn bộ
            </button>
          </form>
        </div>

        {items.length === 0 ? (
          <p className="rounded-lg bg-white px-3 py-2 text-sm text-slate-500">
            Chưa có Kanji cá nhân nào.
          </p>
        ) : (
          <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
            {items.map((item) => (
              <article
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-lg font-bold text-slate-900">
                    {item.character}{" "}
                    <span className="text-sm font-semibold text-slate-500">{item.jlptLevel}</span>
                  </p>
                  <p className="truncate text-sm text-slate-600">{item.meaning}</p>
                  <p className="mt-1 text-xs font-medium text-slate-500">
                    Từ liên quan: {item.relatedWords?.length ?? 0}
                  </p>
                  {(item.relatedWords?.length ?? 0) > 0 ? (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {(item.relatedWords ?? []).slice(0, 3).map((word) => (
                        <span
                          key={word.id}
                          className="rounded-full bg-sky-50 px-2 py-0.5 text-xs text-sky-700"
                          title={`${word.word}${word.reading ? ` (${word.reading})` : ""} - ${word.meaning}`}
                        >
                          {word.word}
                        </span>
                      ))}
                      {(item.relatedWords?.length ?? 0) > 3 ? (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                          +{(item.relatedWords?.length ?? 0) - 3}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <form action={deletePersonalKanjiAction}>
                  <input type="hidden" name="id" value={item.id} />
                  <button
                    type="submit"
                    className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                    disabled={pending}
                  >
                    Xóa
                  </button>
                </form>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
