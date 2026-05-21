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
    deckName: "Nghe N5 đời sống ở Nhật - Nhà ga và đồ quên",
    title: "電車に傘を忘れました",
    jlptLevel: "N5",
    topic: "駅 / 忘れ物 / 傘 / 駅員に話す",
    difficulty: "N5 - trung bình khá",
    estimatedMinutes: 6,
    meta: {
      level: "N5",
      type: "聴解・課題理解",
      duration_estimate: "約1分",
      questionCount: 3,
      supportsStudyMode: true,
      supportsExamMode: true,
      examDisplayRule: "Trong chế độ thi, chỉ hiển thị A/B/C/D. Không hiển thị nội dung câu hỏi và lựa chọn trước khi nghe audio.",
      choiceDisplayStyle: "ABCD",
      choiceAudioStyle: "JLPT_NUMBERED",
    },
    situation: "Một nam sinh nói chuyện với một nữ nhân viên nhà ga vì đã để quên ô trên tàu.",
    key_point: "Cần nghe xem nam sinh quên gì, cái ô có đặc điểm gì, hiện đang ở đâu và cuối cùng nam sinh quyết định làm gì.",
    examMode: {
      enabled: true,
      instructionRaw: "問題を聞いて、正しい答えを一つ選んでください。",
      instruction: "問題(もんだい)を聞(き)いて、正(ただ)しい答(こた)えを一(ひと)つ選(えら)んでください。",
      uiInstructionVi: "Chỉ nghe audio, sau đó chọn A/B/C/D. App không hiển thị nội dung đáp án để tránh nhìn thấy trước.",
      displayOnlyLabels: true,
      labels: ["A", "B", "C", "D"],
      audioChoiceLabels: ["1番", "2番", "3番", "4番"],
      labelMap: {
        A: "1番",
        B: "2番",
        C: "3番",
        D: "4番",
      },
    },
    scriptRaw:
      "これから、駅で男の人と女の人が話しています。\n\n男の人：すみません。電車に傘を忘れました。\n女の人：はい。どんな傘ですか。\n男の人：黒い傘です。小さい白いシールがあります。\n女の人：シールに名前がありますか。\n男の人：はい。田中です。さっきの電車の中に忘れました。\n女の人：ちょっと待ってください。あ、同じ傘が名古屋駅にありますよ。\n男の人：そうですか。今から取りに行ってもいいですか。\n女の人：今日はもう遅いですから、明日の朝、行ってください。\n男の人：わかりました。明日の朝、名古屋駅へ行きます。今日はコンビニで安い傘を買います。",
    script:
      "これから、駅(えき)で男(おとこ)の人(ひと)と女(おんな)の人(ひと)が話(はな)しています。\n\n男(おとこ)の人(ひと)：すみません。電車(でんしゃ)に傘(かさ)を忘(わす)れました。\n女(おんな)の人(ひと)：はい。どんな傘(かさ)ですか。\n男(おとこ)の人(ひと)：黒(くろ)い傘(かさ)です。小(ちい)さい白(しろ)いシールがあります。\n女(おんな)の人(ひと)：シールに名前(なまえ)がありますか。\n男(おとこ)の人(ひと)：はい。田中(たなか)です。さっきの電車(でんしゃ)の中(なか)に忘(わす)れました。\n女(おんな)の人(ひと)：ちょっと待(ま)ってください。あ、同(おな)じ傘(かさ)が名古屋駅(なごやえき)にありますよ。\n男(おとこ)の人(ひと)：そうですか。今(いま)から取(と)りに行(い)ってもいいですか。\n女(おんな)の人(ひと)：今日(きょう)はもう遅(おそ)いですから、明日(あした)の朝(あさ)、行(い)ってください。\n男(おとこ)の人(ひと)：わかりました。明日(あした)の朝(あさ)、名古屋駅(なごやえき)へ行(い)きます。今日(きょう)はコンビニで安(やす)い傘(かさ)を買(か)います。",
    translation:
      "Người dẫn: Sau đây, một nam sinh và một nữ nhân viên nhà ga đang nói chuyện ở nhà ga.\n\nNam sinh: Xin lỗi. Tôi đã để quên ô trên tàu.\nNữ nhân viên nhà ga: Vâng. Đó là chiếc ô như thế nào?\nNam sinh: Là chiếc ô màu đen. Có một miếng dán nhỏ màu trắng.\nNữ nhân viên nhà ga: Trên miếng dán có tên không?\nNam sinh: Có. Là Tanaka. Tôi đã để quên trong chuyến tàu lúc nãy.\nNữ nhân viên nhà ga: Xin hãy đợi một chút. À, có một chiếc ô giống như vậy ở ga Nagoya đấy.\nNam sinh: Vậy à. Bây giờ tôi đi lấy có được không?\nNữ nhân viên nhà ga: Hôm nay đã muộn rồi, nên sáng mai hãy đi.\nNam sinh: Tôi hiểu rồi. Sáng mai tôi sẽ đến ga Nagoya. Hôm nay tôi sẽ mua một chiếc ô rẻ ở cửa hàng tiện lợi.",
    scriptTranslation: [
      {
        speaker: "narrator",
        jp: "これから、駅で男の人と女の人が話しています。",
        vi: "Sau đây, một nam sinh và một nữ nhân viên nhà ga đang nói chuyện ở nhà ga.",
      },
      {
        speaker: "男の人",
        jp: "すみません。電車に傘を忘れました。",
        vi: "Xin lỗi. Tôi đã để quên ô trên tàu.",
      },
      {
        speaker: "女の人",
        jp: "はい。どんな傘ですか。",
        vi: "Vâng. Đó là chiếc ô như thế nào?",
      },
      {
        speaker: "男の人",
        jp: "わかりました。明日の朝、名古屋駅へ行きます。今日はコンビニで安い傘を買います。",
        vi: "Tôi hiểu rồi. Sáng mai tôi sẽ đến ga Nagoya. Hôm nay tôi sẽ mua một chiếc ô rẻ ở cửa hàng tiện lợi.",
      },
    ],
    tts: {
      rate: "-5%",
      pitch: "+0Hz",
      pauseBetweenTurnsMs: 600,
      pauseBetweenQuestionAndChoicesMs: 700,
      pauseBetweenChoicesMs: 500,
    },
    questions: [
      {
        id: "q1",
        level: 1,
        questionType: "事実確認",
        type: "multipleChoice",
        examDisplayMode: "labelsOnly",
        promptRaw: "男の人は、何を忘れましたか。",
        prompt: "男(おとこ)の人(ひと)は、何(なに)を忘(わす)れましたか。",
        examAudioRaw: "問題1。男の人は、何を忘れましたか。1番、傘です。2番、かばんです。3番、ノートです。4番、財布です。",
        examAudio: "問題(もんだい)1。男(おとこ)の人(ひと)は、何(なに)を忘(わす)れましたか。1番(ばん)、傘(かさ)です。2番(ばん)、かばんです。3番(ばん)、ノートです。4番(ばん)、財布(さいふ)です。",
        options: ["傘(かさ)", "かばん", "ノート", "財布(さいふ)"],
        optionLabels: ["A", "B", "C", "D"],
        audioChoiceLabels: ["1番", "2番", "3番", "4番"],
        correctAnswer: "傘(かさ)",
        correctOptionLabel: "A",
        correctAudioChoiceLabel: "1番",
        explanation: {
          correct: "Đáp án đúng là A. Nam sinh nói: 電車(でんしゃ)に傘(かさ)を忘(わす)れました。",
          traps: "かばん, ノート, 財布(さいふ) đều không phải đồ bị quên trong bài.",
        },
      },
      {
        id: "q2",
        level: 1,
        questionType: "詳細理解",
        type: "multipleChoice",
        examDisplayMode: "labelsOnly",
        promptRaw: "傘は、何色ですか。",
        prompt: "傘(かさ)は、何色(なにいろ)ですか。",
        examAudioRaw: "問題2。傘は、何色ですか。1番、黒いです。2番、白いです。3番、青いです。4番、赤いです。",
        examAudio: "問題(もんだい)2。傘(かさ)は、何色(なにいろ)ですか。1番(ばん)、黒(くろ)いです。2番(ばん)、白(しろ)いです。3番(ばん)、青(あお)いです。4番(ばん)、赤(あか)いです。",
        options: ["黒(くろ)いです", "白(しろ)いです", "青(あお)いです", "赤(あか)いです"],
        optionLabels: ["A", "B", "C", "D"],
        audioChoiceLabels: ["1番", "2番", "3番", "4番"],
        correctAnswer: "黒(くろ)いです",
        correctOptionLabel: "A",
        correctAudioChoiceLabel: "1番",
        explanation: {
          correct: "Đáp án đúng là A. Nam sinh nói: 黒(くろ)い傘(かさ)です。",
          traps: "白(しろ)い là bẫy vì miếng dán màu trắng, không phải chiếc ô màu trắng.",
        },
      },
      {
        id: "q3",
        level: 3,
        questionType: "要旨・結果理解",
        type: "multipleChoice",
        examDisplayMode: "labelsOnly",
        promptRaw: "男の人は、最後にどうしますか。",
        prompt: "男(おとこ)の人(ひと)は、最後(さいご)にどうしますか。",
        examAudioRaw:
          "問題3。男の人は、最後にどうしますか。1番、明日の朝、名古屋駅へ行きます。そして、今日はコンビニで傘を買います。2番、今日、名古屋駅へ行って、傘を取ります。3番、今日、家へ帰って、傘を探します。4番、駅の人に傘を家まで持ってきてもらいます。",
        examAudio:
          "問題(もんだい)3。男(おとこ)の人(ひと)は、最後(さいご)にどうしますか。1番(ばん)、明日(あした)の朝(あさ)、名古屋駅(なごやえき)へ行(い)きます。そして、今日(きょう)はコンビニで傘(かさ)を買(か)います。2番(ばん)、今日(きょう)、名古屋駅(なごやえき)へ行(い)って、傘(かさ)を取(と)ります。3番(ばん)、今日(きょう)、家(いえ)へ帰(かえ)って、傘(かさ)を探(さが)します。4番(ばん)、駅(えき)の人(ひと)に傘(かさ)を家(いえ)まで持(も)ってきてもらいます。",
        options: [
          "明日(あした)の朝(あさ)、名古屋駅(なごやえき)へ行(い)きます。そして、今日(きょう)はコンビニで傘(かさ)を買(か)います",
          "今日(きょう)、名古屋駅(なごやえき)へ行(い)って、傘(かさ)を取(と)ります",
          "今日(きょう)、家(いえ)へ帰(かえ)って、傘(かさ)を探(さが)します",
          "駅(えき)の人(ひと)に傘(かさ)を家(いえ)まで持(も)ってきてもらいます",
        ],
        optionLabels: ["A", "B", "C", "D"],
        audioChoiceLabels: ["1番", "2番", "3番", "4番"],
        correctAnswer:
          "明日(あした)の朝(あさ)、名古屋駅(なごやえき)へ行(い)きます。そして、今日(きょう)はコンビニで傘(かさ)を買(か)います",
        correctOptionLabel: "A",
        correctAudioChoiceLabel: "1番",
        explanation: {
          correct: "Đáp án đúng là A. Cuối bài nam sinh nói sẽ sáng mai đến ga Nagoya và hôm nay mua tạm ô ở combini.",
          traps: "B sai thời gian vì không phải hôm nay đi lấy. C và D không có trong bài.",
        },
      },
    ],
    answerKey: [
      {
        questionId: "q1",
        correctOptionLabel: "A",
        correctAudioChoiceLabel: "1番",
        correctAnswer: "傘(かさ)",
      },
      {
        questionId: "q2",
        correctOptionLabel: "A",
        correctAudioChoiceLabel: "1番",
        correctAnswer: "黒(くろ)いです",
      },
      {
        questionId: "q3",
        correctOptionLabel: "A",
        correctAudioChoiceLabel: "1番",
        correctAnswer:
          "明日(あした)の朝(あさ)、名古屋駅(なごやえき)へ行(い)きます。そして、今日(きょう)はコンビニで傘(かさ)を買(か)います",
      },
    ],
    usefulExpressions: [
      {
        expression: "電車(でんしゃ)に傘(かさ)を忘(わす)れました",
        meaning: "Tôi đã để quên ô trên tàu",
        note: "Dùng に để chỉ nơi để quên đồ.",
      },
      {
        expression: "取(と)りに行(い)ってもいいですか",
        meaning: "Tôi đi lấy có được không?",
        note: "〜てもいいですか dùng để xin phép.",
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
