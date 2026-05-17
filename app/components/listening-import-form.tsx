"use client";

import { FileUp, Wand2 } from "lucide-react";
import { useActionState, useRef, useState } from "react";

import {
  importListeningTextsAction,
  type ListeningImportState,
} from "@/app/actions/listening-practice";

const initialState: ListeningImportState = {
  status: "idle",
  message: "",
};

const sampleListeningJson = [
  {
    deckName: "Nghe N5 đời sống",
    title: "宿題を忘れました",
    jlptLevel: "N5",
    topic: "学校 / 宿題 / 先生に話す",
    difficulty: "N5 - trung bình",
    estimatedMinutes: 5,
    meta: {
      level: "N5",
      type: "課題理解",
      duration_estimate: "約1分",
    },
    situation: "Một nam sinh và một nữ sinh đang nói chuyện trước giờ học. Nam sinh có một vấn đề về bài tập.",
    key_point: "Cần nghe xem nam sinh quên gì, vì sao lo lắng, và cuối cùng cậu ấy sẽ làm gì.",
    scriptRaw:
      "これから、学校で男の人と女の人が話しています。\n\n女の人：田中さん、おはよう。今日の宿題、持ってきましたか。\n男の人：あ、おはよう。うーん、宿題はしました。でも、ノートを家に忘れました。\n女の人：え、本当ですか。先生は今日、宿題を見ますよ。\n男の人：そうですね。ちょっと困りました。朝、急いで家を出ましたから。\n女の人：じゃあ、先生に話したほうがいいですよ。\n男の人：はい。授業の前に先生のところへ行きます。\n女の人：私のノートも見せますから、大丈夫ですよ。\n男の人：ありがとう。でも、まず先生に話します。次から気をつけます。",
    script:
      "これから、学校(がっこう)で男(おとこ)の人(ひと)と女(おんな)の人(ひと)が話(はな)しています。\n\n女(おんな)の人(ひと)：田中(たなか)さん、おはよう。今日(きょう)の宿題(しゅくだい)、持(も)ってきましたか。\n男(おとこ)の人(ひと)：あ、おはよう。うーん、宿題(しゅくだい)はしました。でも、ノートを家(いえ)に忘(わす)れました。\n女(おんな)の人(ひと)：え、本当(ほんとう)ですか。先生(せんせい)は今日(きょう)、宿題(しゅくだい)を見(み)ますよ。\n男(おとこ)の人(ひと)：そうですね。ちょっと困(こま)りました。朝(あさ)、急(いそ)いで家(いえ)を出(で)ましたから。\n女(おんな)の人(ひと)：じゃあ、先生(せんせい)に話(はな)したほうがいいですよ。\n男(おとこ)の人(ひと)：はい。授業(じゅぎょう)の前(まえ)に先生(せんせい)のところへ行(い)きます。\n女(おんな)の人(ひと)：私(わたし)のノートも見(み)せますから、大丈夫(だいじょうぶ)ですよ。\n男(おとこ)の人(ひと)：ありがとう。でも、まず先生(せんせい)に話(はな)します。次(つぎ)から気(き)をつけます。",
    translation:
      "Sau đây là cuộc hội thoại ở trường giữa một bạn nam và một bạn nữ. Bạn nam đã làm bài tập nhưng quên vở ở nhà. Vì hôm nay giáo viên sẽ kiểm tra bài tập nên bạn nam quyết định sẽ nói chuyện với giáo viên trước giờ học.",
    tts: {
      voice: "ja-JP-NanamiNeural",
      rate: "-5%",
      pitch: "+0Hz",
    },
    questions: [
      {
        id: "q1",
        level: 1,
        questionType: "事実確認",
        type: "multipleChoice",
        prompt: "男(おとこ)の人(ひと)は、何(なに)を忘(わす)れましたか。",
        options: ["宿題(しゅくだい)", "ノート", "教科書(きょうかしょ)", "かばん"],
        correctAnswer: "ノート",
        explanation: {
          correct: "Đáp án đúng là ノート. Bạn nam nói: 宿題はしました。でも、ノートを家に忘れました。",
          traps: "宿題 là bẫy vì bạn nam đã làm bài tập rồi, không phải quên làm. 教科書 và かばん không được nói trong bài.",
        },
      },
      {
        id: "q2",
        level: 2,
        questionType: "推論",
        type: "multipleChoice",
        prompt: "男(おとこ)の人(ひと)は、どうして困(こま)っていますか。",
        options: [
          "先生(せんせい)が今日(きょう)、宿題(しゅくだい)を見(み)るから",
          "宿題(しゅくだい)を全然(ぜんぜん)しなかったから",
          "学校(がっこう)に遅(おく)れたから",
          "女(おんな)の人(ひと)のノートをなくしたから",
        ],
        correctAnswer: "先生(せんせい)が今日(きょう)、宿題(しゅくだい)を見(み)るから",
        explanation: {
          correct: "Đáp án đúng vì hôm nay giáo viên sẽ xem bài tập, trong khi bạn nam quên vở ở nhà.",
          traps: "宿題を全然しなかった là sai vì bạn nam đã làm bài tập. Các đáp án còn lại không có trong bài.",
        },
      },
      {
        id: "q3",
        level: 3,
        questionType: "要旨・結果理解",
        type: "multipleChoice",
        prompt: "男(おとこ)の人(ひと)は、最後(さいご)にどうしますか。",
        options: [
          "授業(じゅぎょう)の前(まえ)に先生(せんせい)に話(はな)します",
          "女(おんな)の人(ひと)のノートを先生(せんせい)に出(だ)します",
          "家(いえ)へノートを取(と)りに帰(かえ)ります",
          "今日(きょう)の授業(じゅぎょう)を休(やす)みます",
        ],
        correctAnswer: "授業(じゅぎょう)の前(まえ)に先生(せんせい)に話(はな)します",
        explanation: {
          correct: "Đáp án đúng vì cuối bài bạn nam nói: まず先生に話します。",
          traps: "Bạn nam không nói sẽ nộp vở của bạn nữ, không về nhà lấy vở, và cũng không nghỉ học.",
        },
      },
    ],
  },
];

export function ListeningImportForm() {
  const [state, formAction, pending] = useActionState(importListeningTextsAction, initialState);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [fileLabel, setFileLabel] = useState("");

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <label className="block">
          <span className="text-sm font-black text-[#172033]">Tên mục bài nghe</span>
          <input
            name="deckName"
            type="text"
            className="mt-2 h-12 w-full rounded-2xl border border-[#d7e0ef] bg-white px-4 text-sm font-bold text-[#18223b] outline-none transition placeholder:text-[#98a2b3] focus:border-[#22a6a1] focus:ring-4 focus:ring-[#d7f4f1]"
            placeholder="Ví dụ: Bài 1, Nghe N5 đời sống..."
            disabled={pending}
          />
        </label>
        <p className="rounded-2xl border border-[#d7e0ef] bg-[#f8fcff] px-4 py-3 text-xs font-semibold leading-5 text-[#667085]">
          Nếu nhập tên mục ở đây, tất cả bài trong JSON sẽ được đưa vào mục này.
        </p>
      </div>

      <textarea
        ref={textareaRef}
        name="rawInput"
        className="min-h-72 max-h-[520px] w-full resize-y overflow-y-auto rounded-2xl border border-[#d7e0ef] bg-white px-4 py-3 font-[var(--font-jp)] text-sm leading-7 text-[#18223b] outline-none transition focus:border-[#22a6a1] focus:ring-4 focus:ring-[#d7f4f1]"
        placeholder="Dán JSON bài nghe: title, scriptRaw (không furigana), script (có furigana), meta/situation/key_point, tts, questions..."
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
          {pending ? "Đang import..." : "Import bài nghe"}
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-xl border border-[#ffd6a8] bg-[#fff7ed] px-4 py-2.5 text-sm font-black text-[#b45b10] transition hover:bg-[#ffedd5]"
          disabled={pending}
          onClick={() => {
            if (!textareaRef.current) {
              return;
            }
            textareaRef.current.value = JSON.stringify(sampleListeningJson, null, 2);
          }}
        >
          <Wand2 className="h-4 w-4" />
          Mẫu JSON
        </button>
      </div>
    </form>
  );
}
