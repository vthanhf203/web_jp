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
    id: "reading-n5-003",
    deckName: "Bai doc gia dinh",
    title: "\u5BB6\u65CF(\u304B\u305E\u304F)\u3068\u306E\u77ED(\u307F\u3058\u304B)\u3044\u65C5(\u305F\u3073)",
    jlptLevel: "N5-N4",
    topic: "Gia dinh / Du lich / Doi song hang ngay",
    difficulty: "Trung binh",
    estimatedMinutes: 8,
    paragraphs: [
      {
        jp: "\u4ECA(\u3044\u307E)\u3001\u79C1\u306F\u65E5\u672C\u8A9E\u3092\u52C9\u5F37\u3057\u3066\u3044\u307E\u3059\u3002\u5148\u9031\u306E\u65E5\u66DC\u65E5\u3001\u5BB6\u65CF(\u304B\u305E\u304F)\u3068\u77ED(\u307F\u3058\u304B)\u3044\u65C5(\u305F\u3073)\u306B\u884C\u304D\u307E\u3057\u305F\u3002",
        vi: "Bay gio toi dang hoc tieng Nhat. Chu nhat tuan truoc, toi da di mot chuyen du lich ngan voi gia dinh.",
      },
      {
        jp: "\u671D\u3001\u7236\u306E\u4F1A\u793E(\u304B\u3044\u3057\u3083)\u304B\u3089\u96FB\u8A71\u304C\u6765(\u304D)\u307E\u3057\u305F\u3002\u7236\u306F\u5C11\u3057\u8A71(\u306F\u306A)\u3057\u3066\u304B\u3089\u3001\u3059\u3050\u306B\u8ECA(\u304F\u308B\u307E)\u3092\u904B\u8EE2\u3057\u307E\u3057\u305F\u3002",
        vi: "Buoi sang, co dien thoai tu cong ty cua bo goi den. Bo noi chuyen mot chut roi nhanh chong lai xe.",
      },
      {
        jp: "\u5BFA\u306E\u524D\u306B\u306F\u9AD8(\u305F\u304B)\u3044\u9580(\u3082\u3093)\u304C\u3042\u308A\u307E\u3057\u305F\u3002\u9580\u306E\u5916(\u305D\u3068)\u306B\u306F\u5927(\u304A\u304A)\u304D\u3044\u7530(\u305F)\u3093\u307C\u3068\u5C0F(\u3061\u3044)\u3055\u3044\u5BB6(\u3044\u3048)\u304C\u898B\u3048\u307E\u3057\u305F\u3002",
        vi: "Truoc chua co mot chiec cong cao. Ben ngoai cong co the nhin thay ruong lon va nhung ngoi nha nho.",
      },
    ],
    translation:
      "Bay gio toi dang hoc tieng Nhat. Chu nhat tuan truoc, toi da di mot chuyen du lich ngan voi gia dinh.\n\nBuoi sang, co dien thoai tu cong ty cua bo goi den. Bo noi chuyen mot chut roi nhanh chong lai xe.\n\nTruoc chua co mot chiec cong cao. Ben ngoai cong co the nhin thay ruong lon va nhung ngoi nha nho.",
    vocabulary: [
      {
        word: "\u4ECA(\u3044\u307E)",
        meaning: "bay gio",
        hanviet: "Kim",
      },
      {
        word: "\u5BB6\u65CF(\u304B\u305E\u304F)",
        meaning: "gia dinh",
        hanviet: "Gia toc",
      },
      {
        word: "\u65C5(\u305F\u3073)",
        meaning: "chuyen di / du lich",
        hanviet: "Lu",
      },
    ],
    grammarCoverage: [
      {
        pattern: "\u301C\u3066\u3044\u307E\u3059",
        meaning: "dang lam (hanh dong dang dien ra)",
        level: "N5",
        role: "Mo ta hanh dong hien tai",
        examples: [
          {
            paragraphIndex: 0,
            sentence: "\u4ECA(\u3044\u307E)\u3001\u79C1\u306F\u65E5\u672C\u8A9E\u3092\u52C9\u5F37\u3057\u3066\u3044\u307E\u3059\u3002",
            vi: "Bay gio toi dang hoc tieng Nhat.",
          },
        ],
      },
      {
        pattern: "\u301C\u3066\u304B\u3089",
        meaning: "sau khi lam A thi lam B",
        level: "N5",
        role: "Noi 2 hanh dong theo thu tu",
        examples: [
          {
            paragraphIndex: 1,
            sentence:
              "\u7236\u306F\u5C11\u3057\u8A71(\u306F\u306A)\u3057\u3066\u304B\u3089\u3001\u3059\u3050\u306B\u8ECA(\u304F\u308B\u307E)\u3092\u904B\u8EE2\u3057\u307E\u3057\u305F\u3002",
            vi: "Bo noi chuyen mot chut roi nhanh chong lai xe.",
          },
        ],
      },
      {
        pattern: "\u301C\u306B\u306F",
        meaning: "nhan manh dia diem/chu de: o ... thi co ...",
        level: "N4",
        role: "Neu boi canh vi tri",
        examples: [
          {
            paragraphIndex: 2,
            sentence: "\u5BFA\u306E\u524D\u306B\u306F\u9AD8(\u305F\u304B)\u3044\u9580(\u3082\u3093)\u304C\u3042\u308A\u307E\u3057\u305F\u3002",
            vi: "Truoc chua co mot chiec cong cao.",
          },
        ],
      },
    ],
    questions: [],
    postReadingQuiz: {
      mode: "afterReading",
      showAnswerImmediately: false,
      shuffleQuestions: true,
      shuffleOptions: true,
      passingScore: 70,
      totalQuestions: 3,
      questionTypes: [
        "readingComprehension",
        "grammarInContext",
        "trueFalse",
      ],
      questions: [
        {
          id: "q001",
          type: "multipleChoice",
          skill: "readingComprehension",
          difficulty: "easy",
          points: 1,
          prompt: "\u4ECA\u671D(\u3051\u3055)\u3001\u5916(\u305D\u3068)\u306F\u3069\u3046\u3067\u3057\u305F\u304B\u3002",
          options: [
            "\u96E8(\u3042\u3081)\u304C\u964D(\u3075)\u3063\u3066\u3044\u307E\u3057\u305F",
            "\u96EA(\u3086\u304D)\u304C\u964D(\u3075)\u3063\u3066\u3044\u307E\u3057\u305F",
            "\u3068\u3066\u3082\u6691(\u3042\u3064)\u304B\u3063\u305F\u3067\u3059",
            "\u98A8(\u304B\u305C)\u304C\u3042\u308A\u307E\u305B\u3093\u3067\u3057\u305F",
          ],
          correctAnswer: "\u96E8(\u3042\u3081)\u304C\u964D(\u3075)\u3063\u3066\u3044\u307E\u3057\u305F",
          explanation: "\u672C\u6587(\u307B\u3093\u3076\u3093)\u306B\u300C\u96E8(\u3042\u3081)\u304C\u964D(\u3075)\u3063\u3066\u3044\u307E\u3057\u305F\u300D\u3068\u3042\u308A\u307E\u3059\u3002",
          paragraphRef: 0,
          sentenceRef: "P1-S2",
        },
        {
          id: "q002",
          type: "trueFalse",
          skill: "readingComprehension",
          difficulty: "easy",
          points: 1,
          prompt: "\u79C1(\u308F\u305F\u3057)\u306F\u5BB6(\u3044\u3048)\u306B\u5098(\u304B\u3055)\u304C\u3042\u308A\u307E\u3057\u305F\u3002",
          options: ["true", "false"],
          correctAnswer: false,
          explanation: "\u672C\u6587(\u307B\u3093\u3076\u3093)\u3067\u306F\u300C\u5098(\u304B\u3055)\u304C\u3042\u308A\u307E\u305B\u3093\u3067\u3057\u305F\u300D\u3068\u3042\u308A\u307E\u3059\u3002",
          paragraphRef: 1,
          sentenceRef: "P2-S2",
        },
        {
          id: "q003",
          type: "grammarChoice",
          skill: "grammarInContext",
          difficulty: "normal",
          points: 1,
          prompt: "\u300C\u9ED2(\u304F\u308D)\u3044\u5098(\u304B\u3055)\u306E\u307B\u3046\u304C\u4E08\u592B(\u3058\u3087\u3046\u3076)\u305D\u3046\u3067\u3057\u305F\u300D\u306E\u610F\u5473(\u3044\u307F)\u306F\u3069\u308C\u3067\u3059\u304B\u3002",
          options: [
            "Chiec o mau den trong chac hon",
            "Chiec o mau trang trong chac hon",
            "Chiec o mau den re nhat",
            "Chiec o mau den khong chac",
          ],
          correctAnswer: "Chiec o mau den trong chac hon",
          explanation: "N\u306E\u307B\u3046\u304C Adj \u3067\u3059 = N thi ... hon.",
          paragraphRef: 2,
          sentenceRef: "P3-S3",
          grammarPattern: "N\u306E\u307B\u3046\u304C Adj \u3067\u3059",
        },
      ],
    },
    sentenceRecallPractice: {
      mode: "viToJp",
      title: "Luyen nho cau Viet -> Nhat",
      description:
        "Nhin cau tieng Viet va go lai cau tieng Nhat. Cham theo y chinh, ngu phap, tu khoa va tro tu quan trong.",
      showAfter: "postReadingQuiz",
      shuffleQuestions: true,
      showHints: true,
      showAnswerAfterSubmit: true,
      gradingMode: "slotBased",
      defaultGradingMode: "slotBased",
      globalNormalizeRules: {
        ignoreSpaces: true,
        ignorePunctuation: true,
        normalizeFullWidthNumbers: true,
        ignoreKanjiHiraganaDifference: true,
        allowOptionalSubject: true,
        caseSensitive: false,
      },
      scoreBands: {
        correct: {
          min: 90,
          label: "Dung",
          message: "Dung roi.",
        },
        almostCorrect: {
          min: 75,
          label: "Gan dung",
          message: "Gan dung, sua them 1-2 cho.",
        },
        partial: {
          min: 50,
          label: "Mot phan",
          message: "Dung mot phan, con thieu y.",
        },
        incorrect: {
          min: 0,
          label: "Chua dung",
          message: "Thu lai va xem goi y.",
        },
      },
      totalQuestions: 2,
      questions: [
        {
          id: "sr001",
          sourceSentenceRef: "P1-S1",
          difficulty: "easy",
          skill: "sentenceRecall",
          viPrompt: "Sang nay, toi day luc 7 gio ruoi.",
          modelAnswer:
            "\u4ECA\u671D(\u3051\u3055)\u3001\u79C1(\u308F\u305F\u3057)\u306F7\u6642\u534A(\u3057\u3061\u3058\u306F\u3093)\u306B\u8D77(\u304A)\u304D\u307E\u3057\u305F\u3002",
          modelAnswerPlain: "\u4ECA\u671D\u3001\u79C1\u306F7\u6642\u534A\u306B\u8D77\u304D\u307E\u3057\u305F\u3002",
          acceptableAnswers: [
            "\u4ECA\u671D\u3001\u79C1\u306F7\u6642\u534A\u306B\u8D77\u304D\u307E\u3057\u305F\u3002",
            "\u79C1\u306F\u4ECA\u671D7\u6642\u534A\u306B\u8D77\u304D\u307E\u3057\u305F\u3002",
          ],
          targetGrammar: ["N\uff08chi thoi gian\uff09\u306b V\u307E\u3059"],
          targetVocabulary: [
            "\u4ECA\u671D(\u3051\u3055)",
            "\u79C1(\u308F\u305F\u3057)",
            "7\u6642\u534A(\u3057\u3061\u3058\u306F\u3093)",
            "\u8D77(\u304A)\u304D\u307E\u3059",
          ],
          hints: [
            "Dung \u306b sau thoi gian cu the.",
            "7 gio ruoi = 7\u6642\u534A(\u3057\u3061\u3058\u306F\u3093).",
          ],
          explanation:
            "Voi thoi gian cu the nhu 7\u6642\u534A, dung \u306b: 7\u6642\u534A\u306B\u8D77\u304D\u307E\u3057\u305F\u3002",
          points: 1,
          gradingMode: "slotBased",
          passingScore: 80,
          autoAcceptWhenRequiredSlotsMatch: true,
          requiredSlots: [
            {
              slot: "timeExpression",
              label: "sang nay",
              weight: 15,
              accepted: ["\u4ECA\u671D", "\u3051\u3055"],
            },
            {
              slot: "targetTime",
              label: "7 gio ruoi",
              weight: 25,
              accepted: [
                "7\u6642\u534A",
                "\uFF17\u6642\u534A",
                "7\u3058\u306F\u3093",
                "\u3057\u3061\u3058\u306F\u3093",
                "\u4E03\u6642\u534A",
              ],
            },
            {
              slot: "timeParticle",
              label: "tro tu \u306b sau thoi gian",
              weight: 20,
              acceptedPattern:
                "(7\u6642\u534A|\uFF17\u6642\u534A|7\u3058\u306F\u3093|\u3057\u3061\u3058\u306F\u3093|\u4E03\u6642\u534A)\u306B",
            },
            {
              slot: "verb",
              label: "day",
              weight: 25,
              accepted: ["\u8D77\u304D\u307E\u3057\u305F", "\u304A\u304D\u307E\u3057\u305F"],
            },
            {
              slot: "sentenceNaturalness",
              label: "cau tu nhien",
              weight: 15,
              type: "softCheck",
            },
          ],
          optionalSlots: [
            {
              slot: "subject",
              label: "toi",
              weight: 0,
              accepted: ["\u79C1", "\u308F\u305F\u3057"],
              note: "Co the luoc bo neu cau van ro nghia.",
            },
          ],
          minorDifferencesToIgnore: [
            "kanji_vs_hiragana",
            "spaces",
            "punctuation",
            "full_width_half_width_numbers",
            "optional_subject",
          ],
          commonMistakes: [
            {
              pattern: "8\u3058\u306F\u3093",
              mistakeType: "wrongKeyInfo",
              message: "8\u3058\u306F\u3093 = 8 gio ruoi. De la 7 gio ruoi.",
            },
            {
              pattern: "7\u3058\u306F\u3093\u3067",
              mistakeType: "wrongParticle",
              message:
                "Voi thoi gian cu the, dung \u306b: 7\u6642\u534A\u306B\u8D77\u304D\u307E\u3057\u305F.",
            },
          ],
          feedbackTemplates: {
            correct: "Dung roi. Cau cua ban dung y va dung ngu phap chinh.",
            almostCorrect: "Gan dung. Con vai loi nho.",
            partial: "Dung mot phan, con thieu thong tin quan trong.",
            incorrect: "Chua dung. Hay xem goi y va thu lai.",
            wrongKeyInfo: "Cau dung cau truc nhung sai thong tin chinh.",
            wrongParticle: "Y dung nhung tro tu chua dung.",
          },
        },
        {
          id: "sr002",
          sourceSentenceRef: "P1-S2",
          difficulty: "normal",
          skill: "sentenceRecall",
          viPrompt: "Khi nhin ra ngoai, troi dang mua.",
          modelAnswer:
            "\u5916(\u305D\u3068)\u3092\u898B(\u307F)\u308B\u3068\u3001\u96E8(\u3042\u3081)\u304C\u964D(\u3075)\u3063\u3066\u3044\u307E\u3057\u305F\u3002",
          modelAnswerPlain: "\u5916\u3092\u898B\u308B\u3068\u3001\u96E8\u304C\u964D\u3063\u3066\u3044\u307E\u3057\u305F\u3002",
          acceptableAnswers: [
            "\u5916\u3092\u898B\u308B\u3068\u3001\u96E8\u304C\u964D\u3063\u3066\u3044\u307E\u3057\u305F\u3002",
            "\u5916\u3092\u898B\u305F\u3089\u3001\u96E8\u304C\u964D\u3063\u3066\u3044\u307E\u3057\u305F\u3002",
          ],
          targetGrammar: ["V\u308B\u3068", "V\u3066\u3044\u307E\u3059"],
          targetVocabulary: [
            "\u5916(\u305D\u3068)",
            "\u898B(\u307F)\u307E\u3059",
            "\u96E8(\u3042\u3081)",
            "\u964D(\u3075)\u308A\u307E\u3059",
          ],
          hints: [
            "Khi nhin ra ngoai = \u5916\u3092\u898B\u308B\u3068.",
            "Troi dang mua = \u96E8\u304C\u964D\u3063\u3066\u3044\u307E\u3057\u305F.",
          ],
          explanation:
            "\u96E8\u304C\u964D\u3063\u3066\u3044\u307E\u3057\u305F dien ta trang thai dang mua tai thoi diem do.",
          points: 2,
          gradingMode: "slotBased",
          passingScore: 80,
          autoAcceptWhenRequiredSlotsMatch: true,
          requiredSlots: [
            {
              slot: "outside",
              label: "ben ngoai",
              weight: 15,
              accepted: ["\u5916", "\u305D\u3068"],
            },
            {
              slot: "look",
              label: "nhin",
              weight: 20,
              accepted: [
                "\u898B\u308B",
                "\u898B\u305F\u3089",
                "\u307F\u308B",
                "\u307F\u305F\u3089",
              ],
            },
            {
              slot: "rain",
              label: "mua",
              weight: 20,
              accepted: ["\u96E8", "\u3042\u3081"],
            },
            {
              slot: "rainingState",
              label: "dang mua",
              weight: 30,
              accepted: [
                "\u964D\u3063\u3066\u3044\u307E\u3057\u305F",
                "\u3075\u3063\u3066\u3044\u307E\u3057\u305F",
              ],
            },
            {
              slot: "sentenceNaturalness",
              label: "cau tu nhien",
              weight: 15,
              type: "softCheck",
            },
          ],
          optionalSlots: [],
          minorDifferencesToIgnore: [
            "kanji_vs_hiragana",
            "spaces",
            "punctuation",
          ],
          commonMistakes: [
            {
              pattern: "\u964D\u308A\u307E\u3057\u305F",
              mistakeType: "tenseAspect",
              message:
                "\u964D\u308A\u307E\u3057\u305F = da mua. De la dang mua, nen dung \u964D\u3063\u3066\u3044\u307E\u3057\u305F.",
            },
          ],
          feedbackTemplates: {
            correct:
              "Dung roi. Cau cua ban dien ta dung 'khi nhin ra ngoai thi troi dang mua'.",
            almostCorrect: "Gan dung. Kiem tra lai dang tiep dien \u964D\u3063\u3066\u3044\u307E\u3057\u305F.",
            partial: "Dung mot phan, con thieu thong tin quan trong.",
            incorrect:
              "Chua dung. Hay dung mau \u5916\u3092\u898B\u308B\u3068\u3001\u96E8\u304C\u964D\u3063\u3066\u3044\u307E\u3057\u305F.",
            wrongKeyInfo: "Cau thieu thong tin quan trong nhu \u5916 hoac \u96E8.",
            wrongParticle: "Y dung nhung tro tu chua tu nhien.",
          },
        },
      ],
    },
    createdAt: "2026-05-14T03:07:17.181Z",
    updatedAt: "2026-05-14T03:08:01.995Z",
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
          <span className="text-sm font-black text-[#172033]">Ten muc bai doc</span>
          <input
            name="deckName"
            type="text"
            className="mt-2 h-12 w-full rounded-2xl border border-[#d7e0ef] bg-white px-4 text-sm font-bold text-[#18223b] outline-none transition placeholder:text-[#98a2b3] focus:border-[#22a6a1] focus:ring-4 focus:ring-[#d7f4f1]"
            placeholder="Vi du: Bai 1, Doi song hang ngay, Du lich N5..."
            disabled={pending}
          />
        </label>
        <p className="rounded-2xl border border-[#d7e0ef] bg-[#f8fcff] px-4 py-3 text-xs font-semibold leading-5 text-[#667085]">
          Nhap ten muc o day thi moi bai trong JSON se duoc dua vao dung muc nay.
        </p>
      </div>

      <textarea
        ref={textareaRef}
        name="rawInput"
        className="min-h-72 max-h-[520px] w-full resize-y overflow-y-auto rounded-2xl border border-[#d7e0ef] bg-white px-4 py-3 font-[var(--font-jp)] text-sm leading-7 text-[#18223b] outline-none transition focus:border-[#22a6a1] focus:ring-4 focus:ring-[#d7f4f1]"
        placeholder="Dan JSON bai doc day du (chuan agent): title, paragraphs, vocabulary, grammarCoverage, postReadingQuiz, sentenceRecallPractice..."
        disabled={pending}
        required
      />

      <div className="rounded-2xl border border-[#d7e0ef] bg-[#f7fafc] p-3">
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-dashed border-[#bdd2e8] bg-white px-4 py-3 text-sm font-bold text-[#263750] transition hover:bg-[#f3fbfa]">
          <span className="inline-flex items-center gap-2">
            <FileUp className="h-4 w-4 text-[#22a6a1]" />
            Chon file JSON / TXT
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
          {pending ? "Dang import..." : "Import bai doc"}
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
          Mau JSON chuan agent
        </button>
      </div>
    </form>
  );
}
