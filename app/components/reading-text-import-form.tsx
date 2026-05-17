"use client";

import { FileUp, Wand2 } from "lucide-react";
import { useActionState, useRef, useState } from "react";

import {
  importReadingTextsAction,
  type ReadingTextImportState,
} from "@/app/actions/reading-practice";

const initialState: ReadingTextImportState = {
  status: "idle",
  message: "",
};

const sampleReadingJson = [
  {
    deckName: "Bài đọc gia đình",
    title: "家族(かぞく)との短(みじか)い旅(たび)",
    jlptLevel: "N5-N4",
    topic: "Gia đình / Du lịch / Đời sống hằng ngày",
    difficulty: "Trung bình",
    estimatedMinutes: 8,
    paragraphs: [
      {
        jp: "今(いま)、私は日本語を勉強しています。先週の日曜日、家族(かぞく)と短(みじか)い旅(たび)に行きました。",
        vi: "Bây giờ tôi đang học tiếng Nhật. Chủ nhật tuần trước, tôi đã đi một chuyến du lịch ngắn với gia đình.",
      },
      {
        jp: "朝、父の会社(かいしゃ)から電話が来(き)ました。父は少し話(はな)してから、すぐに車(くるま)を運転しました。",
        vi: "Buổi sáng, có điện thoại từ công ty của bố gọi đến. Bố nói chuyện một chút rồi nhanh chóng lái xe.",
      },
      {
        jp: "寺の前には高(たか)い門(もん)がありました。門の外(そと)には大(おお)きい田(た)んぼと小(ちい)さい家(いえ)が見えました。",
        vi: "Trước chùa có một chiếc cổng cao. Bên ngoài cổng có thể nhìn thấy ruộng lớn và những ngôi nhà nhỏ.",
      },
    ],
    vocabulary: [
      {
        word: "今(いま)",
        meaning: "bây giờ",
        hanviet: "Kim",
      },
      {
        word: "家族(かぞく)",
        meaning: "gia đình",
        hanviet: "Gia tộc",
      },
      {
        word: "旅(たび)",
        meaning: "chuyến đi / du lịch",
        hanviet: "Lữ",
      },
    ],
    questions: [
      {
        prompt: "誰と短(みじか)い旅(たび)に行きましたか。",
        answer: "家族(かぞく)と行きました。",
      },
    ],
  },
];

export function ReadingTextImportForm() {
  const [state, formAction, pending] = useActionState(importReadingTextsAction, initialState);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [fileLabel, setFileLabel] = useState("");

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <label className="block">
          <span className="text-sm font-black text-[#172033]">Tên mục bài đọc</span>
          <input
            name="deckName"
            type="text"
            className="mt-2 h-12 w-full rounded-2xl border border-[#d7e0ef] bg-white px-4 text-sm font-bold text-[#18223b] outline-none transition placeholder:text-[#98a2b3] focus:border-[#22a6a1] focus:ring-4 focus:ring-[#d7f4f1]"
            placeholder="Ví dụ: Bài 1, Đời sống hằng ngày, Du lịch N5..."
            disabled={pending}
          />
        </label>
        <p className="rounded-2xl border border-[#d7e0ef] bg-[#f8fcff] px-4 py-3 text-xs font-semibold leading-5 text-[#667085]">
          Nhập tên mục ở đây thì mọi bài trong JSON sẽ được đưa vào đúng mục này.
        </p>
      </div>

      <textarea
        ref={textareaRef}
        name="rawInput"
        className="min-h-72 max-h-[520px] w-full resize-y overflow-y-auto rounded-2xl border border-[#d7e0ef] bg-white px-4 py-3 font-[var(--font-jp)] text-sm leading-7 text-[#18223b] outline-none transition focus:border-[#22a6a1] focus:ring-4 focus:ring-[#d7f4f1]"
        placeholder="Dán JSON bài đọc: title, jlptLevel, topic, paragraphs[{ jp, vi }], vocabulary, questions..."
        disabled={pending}
        required
      />

      <div className="rounded-2xl border border-[#d7e0ef] bg-[#f7fafc] p-3">
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-dashed border-[#bdd2e8] bg-white px-4 py-3 text-sm font-bold text-[#263750] transition hover:bg-[#f3fbfa]">
          <span className="inline-flex items-center gap-2">
            <FileUp className="h-4 w-4 text-[#22a6a1]" />
            Chọn file JSON / TXT
          </span>
          <input
            type="file"
            accept=".json,.txt,application/json,text/plain"
            className="hidden"
            disabled={pending}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (!file || !textareaRef.current) {
                return;
              }
              const reader = new FileReader();
              reader.onload = () => {
                textareaRef.current!.value = typeof reader.result === "string" ? reader.result : "";
                setFileLabel(`${file.name} (${Math.max(1, Math.round(file.size / 1024))} KB)`);
              };
              reader.readAsText(file, "utf-8");
            }}
          />
        </label>
        {fileLabel ? <p className="mt-2 text-xs font-semibold text-[#667085]">{fileLabel}</p> : null}
      </div>

      {state.message ? (
        <p
          className={
            state.status === "error"
              ? "rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700"
              : "rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700"
          }
        >
          {state.message}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          className="inline-flex items-center gap-2 rounded-xl bg-[#123c69] px-4 py-2.5 text-sm font-black text-white shadow-[0_12px_24px_rgba(18,60,105,0.16)] transition hover:bg-[#0f3157] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={pending}
        >
          <FileUp className="h-4 w-4" />
          {pending ? "Đang import..." : "Import bài đọc"}
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-xl border border-[#ffd6a8] bg-[#fff7ed] px-4 py-2.5 text-sm font-black text-[#b45b10] transition hover:bg-[#ffedd5]"
          disabled={pending}
          onClick={() => {
            if (!textareaRef.current) {
              return;
            }
            textareaRef.current.value = JSON.stringify(sampleReadingJson, null, 2);
          }}
        >
          <Wand2 className="h-4 w-4" />
          Mẫu JSON
        </button>
      </div>
    </form>
  );
}
