"use client";

import { Headphones, Loader2, RotateCcw, Trophy, Volume2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cleanJapaneseSpeechText } from "@/lib/japanese-speech";
import { resolveExpressiveTts } from "@/lib/listening-expression";
import type { ListeningPracticeItem } from "@/lib/listening-practice-store";

type Props = {
  deckName: string;
  items: ListeningPracticeItem[];
};

type GenerateState = "idle" | "generating" | "ready" | "error";
type SpeakerRole = "male" | "female" | "none";
type TtsSegmentPayload = {
  text: string;
  voice: string;
  rate: string;
  pitch: string;
  volume?: string;
  emotion?: string;
};
type DeckQuestion = {
  id: string;
  item: ListeningPracticeItem;
  itemIndex: number;
  question: ListeningPracticeItem["questions"][number];
  questionIndex: number;
  globalIndex: number;
};

const VOICE_OPTIONS = [
  { value: "ja-JP-NanamiNeural", label: "Nanami (nu, mem)" },
  { value: "ja-JP-AoiNeural", label: "Aoi (nu, sang)" },
  { value: "ja-JP-ShioriNeural", label: "Shiori (nu, ro)" },
  { value: "ja-JP-MayuNeural", label: "Mayu (nu, de nghe)" },
  { value: "ja-JP-KeitaNeural", label: "Keita (nam, ro)" },
  { value: "ja-JP-DaichiNeural", label: "Daichi (nam, dam)" },
  { value: "ja-JP-NaokiNeural", label: "Naoki (nam, tu nhien)" },
  { value: "ja-JP-MasaruMultilingualNeural", label: "Masaru (nam, da ngon ngu)" },
];

const DEFAULT_MAIN_VOICE = "ja-JP-NanamiNeural";
const DEFAULT_MALE_VOICE = "ja-JP-KeitaNeural";
const DEFAULT_FEMALE_VOICE = "ja-JP-NanamiNeural";
const EXAM_CHOICE_LABELS = ["A", "B", "C", "D"] as const;
const EXAM_CHOICE_SPEECH_LABELS = ["エー", "ビー", "シー", "ディー"] as const;
const INLINE_RUBY_PATTERN =
  /([\u3400-\u9fff\u3005\u3006\u30f5\u30f6]+)[\uff08(]\s*([\u3041-\u3096\u30a1-\u30fa\u30fc\u30fb\s]+)\s*[\uff09)]/gu;
const PROBLEM_LABEL_PATTERN = /^問題\s*[0-9０-９一二三四五六七八九十]+(?:番)?[。．、,]?\s*/u;
const FURI_PART = "(?:[\\uff08(][^\\uff09)]+[\\uff09)])?";
const MALE_PLAIN_PREFIX = /^(?:男の人|男|男性|おとこのひと)\s*[：:]\s*/u;
const FEMALE_PLAIN_PREFIX = /^(?:女の人|女|女性|おんなのひと|駅の人|駅員|店の人|店員)\s*[：:]\s*/u;
const MALE_DISPLAY_PREFIX = new RegExp(
  `^(?:男${FURI_PART}の人${FURI_PART}|男|男性|おとこのひと)\\s*[：:]\\s*`,
  "u"
);
const FEMALE_DISPLAY_PREFIX = new RegExp(
  `^(?:女${FURI_PART}の人${FURI_PART}|女|女性|おんなのひと|駅${FURI_PART}の人${FURI_PART}|駅員|店${FURI_PART}の人${FURI_PART}|店員)\\s*[：:]\\s*`,
  "u"
);

function compactRubyReading(_match: string, _kanji: string, reading: string): string {
  return reading.replace(/\s+/g, "");
}

function stripInlineRuby(value: string): string {
  return value.replace(INLINE_RUBY_PATTERN, compactRubyReading);
}

function applySpeechPronunciationOverrides(value: string): string {
  return value
    .replace(/今何時/gu, "いまなんじ")
    .replace(/何時(?=\s*(?:に|から|まで|です|でしょう|ごろ|頃|の))/gu, "なんじ");
}

function cleanExamSpeechText(value: string): string {
  return applySpeechPronunciationOverrides(cleanJapaneseSpeechText(stripInlineRuby(value)))
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeBooleanLabel(value: string): boolean | null {
  const text = value.trim().toLowerCase();
  if (["true", "1", "yes", "y", "dung"].includes(text)) {
    return true;
  }
  if (["false", "0", "no", "n", "sai"].includes(text)) {
    return false;
  }
  return null;
}

function parseSpeakerRoleFromDialogueTurn(
  turn: NonNullable<ListeningPracticeItem["dialogue"]>[number]
): SpeakerRole {
  const gender = (turn.speakerGender || "").toLowerCase();
  if (gender.includes("female") || gender.includes("woman") || /女|おんな/u.test(gender)) {
    return "female";
  }
  if (gender.includes("male") || gender.includes("man") || /男|おとこ/u.test(gender)) {
    return "male";
  }

  const display = `${turn.displayName || ""} ${turn.speakerRole || ""} ${turn.speakerKey || ""}`.trim();
  if (/男|おとこ|男性/u.test(display)) {
    return "male";
  }
  if (/女|おんな|女性/u.test(display)) {
    return "female";
  }
  return "none";
}

function parseSpeakerRole(text: string): SpeakerRole {
  if (MALE_PLAIN_PREFIX.test(text)) {
    return "male";
  }
  if (FEMALE_PLAIN_PREFIX.test(text)) {
    return "female";
  }
  return "none";
}

function removeSpeakerPrefix(text: string, role: SpeakerRole, isDisplay: boolean): string {
  if (role === "male") {
    return text.replace(isDisplay ? MALE_DISPLAY_PREFIX : MALE_PLAIN_PREFIX, "").trim();
  }
  if (role === "female") {
    return text.replace(isDisplay ? FEMALE_DISPLAY_PREFIX : FEMALE_PLAIN_PREFIX, "").trim();
  }
  return text.trim();
}

function voiceForRole(role: SpeakerRole, mainVoice: string, maleVoice: string, femaleVoice: string): string {
  if (role === "male") {
    return maleVoice;
  }
  if (role === "female") {
    return femaleVoice;
  }
  return mainVoice;
}

function buildItemScriptSegments(
  item: ListeningPracticeItem,
  mainVoice: string,
  maleVoice: string,
  femaleVoice: string,
  rate: string,
  pitch: string,
  expressive: boolean
): TtsSegmentPayload[] {
  if (item.dialogue?.length) {
    return item.dialogue
      .map((turn) => {
        const role = parseSpeakerRoleFromDialogueTurn(turn);
        const source = (turn.textRaw || turn.text || "").trim();
        const text = cleanExamSpeechText(removeSpeakerPrefix(source, role, false) || source);
        const expression = resolveExpressiveTts(text, {
          enabled: expressive,
          emotion: turn.emotion,
          baseRate: rate,
          basePitch: pitch,
          baseVolume: item.tts.volume,
          rate: turn.rate,
          pitch: turn.pitch,
          volume: turn.volume,
        });
        return text
          ? {
              text,
              voice: turn.voice || voiceForRole(role, mainVoice, maleVoice, femaleVoice),
              rate: expression.rate,
              pitch: expression.pitch,
              volume: expression.volume,
              emotion: expression.emotion,
            }
          : null;
      })
      .filter((segment): segment is NonNullable<typeof segment> => Boolean(segment));
  }

  return (item.scriptRaw || item.script)
    .split(/\r?\n/)
    .map((line) => {
      const source = line.trim();
      const role = parseSpeakerRole(source);
      const text = cleanExamSpeechText(removeSpeakerPrefix(source, role, false) || source);
      if (!text) {
        return null;
      }
      const expression = resolveExpressiveTts(text, {
        enabled: expressive,
        baseRate: rate,
        basePitch: pitch,
        baseVolume: item.tts.volume,
      });
      return {
        text,
        voice: voiceForRole(role, mainVoice, maleVoice, femaleVoice),
        rate: expression.rate,
        pitch: expression.pitch,
        volume: expression.volume,
        emotion: expression.emotion,
      };
    })
    .filter((segment): segment is NonNullable<typeof segment> => Boolean(segment));
}

function questionOptions(question: ListeningPracticeItem["questions"][number]): string[] {
  if (question.options.length > 0) {
    return question.options;
  }
  if (typeof question.correctAnswer === "boolean") {
    return ["Dung", "Sai"];
  }
  return [];
}

function examChoiceLabel(index: number): string {
  return EXAM_CHOICE_LABELS[index] ?? String(index + 1);
}

function examChoiceSpeechLabel(index: number): string {
  return EXAM_CHOICE_SPEECH_LABELS[index] ?? String(index + 1);
}

function questionOptionEntries(
  question: ListeningPracticeItem["questions"][number],
  examMode?: ListeningPracticeItem["examMode"]
) {
  const labels = question.optionLabels?.length
    ? question.optionLabels
    : examMode?.labels.length
      ? examMode.labels
      : EXAM_CHOICE_LABELS;
  const audioLabels = question.audioChoiceLabels?.length
    ? question.audioChoiceLabels
    : examMode?.audioChoiceLabels.length
      ? examMode.audioChoiceLabels
      : [];
  return questionOptions(question)
    .slice(0, EXAM_CHOICE_LABELS.length)
    .map((option, index) => ({
      label: labels[index] ?? examChoiceLabel(index),
      speechLabel:
        audioLabels[index] ??
        examMode?.labelMap?.[labels[index] ?? ""] ??
        examChoiceSpeechLabel(index),
      value: option,
    }));
}

function buildQuestionSegments(
  question: ListeningPracticeItem["questions"][number],
  questionNumber: number,
  voice: string,
  rate: string,
  pitch: string,
  examMode?: ListeningPracticeItem["examMode"]
): TtsSegmentPayload[] {
  const explicitExamAudio = cleanExamSpeechText(question.examAudioRaw || question.examAudio || "");
  if (explicitExamAudio) {
    return [
      {
        text: `問題${questionNumber}。${explicitExamAudio.replace(PROBLEM_LABEL_PATTERN, "")}`,
        voice,
        rate,
        pitch,
      },
    ];
  }

  const prompt = cleanExamSpeechText(question.promptRaw || question.prompt);
  const options = questionOptionEntries(question, examMode)
    .map((entry) => {
      const optionText = cleanExamSpeechText(entry.value);
      return optionText
        ? {
            text: `${entry.speechLabel}、${optionText}`,
            voice,
            rate,
            pitch,
          }
        : null;
    })
    .filter((segment): segment is TtsSegmentPayload => Boolean(segment));

  return [
    {
      text: prompt ? `問題${questionNumber}。${prompt}` : `問題${questionNumber}。`,
      voice,
      rate,
      pitch,
    },
    ...options,
  ];
}

function questionAnswerLabel(value: string | boolean): string {
  if (typeof value === "boolean") {
    return value ? "Dung" : "Sai";
  }
  return value;
}

function questionCorrectAnswerLabel(
  question: ListeningPracticeItem["questions"][number],
  examMode?: ListeningPracticeItem["examMode"]
): string {
  if (typeof question.correctAnswer === "boolean") {
    return questionAnswerLabel(question.correctAnswer);
  }

  const matchingEntry = questionOptionEntries(question, examMode).find((entry) => entry.value === question.correctAnswer);
  return matchingEntry
    ? `${matchingEntry.label} - ${matchingEntry.value}`
    : questionAnswerLabel(question.correctAnswer);
}

function isQuestionCorrect(
  question: ListeningPracticeItem["questions"][number],
  selectedValue: string | undefined
): boolean {
  if (!selectedValue) {
    return false;
  }
  if (typeof question.correctAnswer === "boolean") {
    const parsed = normalizeBooleanLabel(selectedValue);
    return parsed === question.correctAnswer;
  }
  return selectedValue === question.correctAnswer;
}

function buildDeckQuestions(items: ListeningPracticeItem[]): DeckQuestion[] {
  const output: DeckQuestion[] = [];
  for (const [itemIndex, item] of items.entries()) {
    for (const [questionIndex, question] of item.questions.entries()) {
      output.push({
        id: `${item.id}:${question.id || questionIndex}`,
        item,
        itemIndex,
        question,
        questionIndex,
        globalIndex: output.length,
      });
    }
  }
  return output;
}

export function ListeningDeckExamClient({ deckName, items }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const generatedUrlRef = useRef<string | null>(null);
  const deckKey = useMemo(() => items.map((item) => item.id).join("|"), [items]);
  const [voice, setVoice] = useState(DEFAULT_MAIN_VOICE);
  const [maleVoice, setMaleVoice] = useState(DEFAULT_MALE_VOICE);
  const [femaleVoice, setFemaleVoice] = useState(DEFAULT_FEMALE_VOICE);
  const [rate, setRate] = useState(items[0]?.tts.rate || "-5%");
  const [pitch, setPitch] = useState(items[0]?.tts.pitch || "+0Hz");
  const [ttsProvider, setTtsProvider] = useState<"auto" | "edge">(items[0]?.tts.provider || "auto");
  const [expressivePlayback, setExpressivePlayback] = useState(items[0]?.tts.expressive !== false);
  const [audioProvider, setAudioProvider] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [state, setState] = useState<GenerateState>("idle");
  const [error, setError] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState(false);

  const questions = useMemo(() => buildDeckQuestions(items), [items]);
  const correctCount = useMemo(
    () => questions.filter((entry) => isQuestionCorrect(entry.question, answers[entry.id])).length,
    [answers, questions]
  );
  const deckPlan = useMemo(() => {
    const instruction = cleanExamSpeechText(
      items[0]?.examMode?.instructionRaw ||
        items[0]?.examMode?.instruction ||
        "これから、問題を聞きます。会話を聞いて、A、B、C、Dから選んでください。"
    );
    let questionNumber = 1;
    const segments: TtsSegmentPayload[] = instruction
      ? [
          {
            text: instruction,
            voice,
            rate,
            pitch,
          },
        ]
      : [];

    for (const [itemIndex, item] of items.entries()) {
      const scriptSegments = buildItemScriptSegments(item, voice, maleVoice, femaleVoice, rate, pitch, expressivePlayback);
      if (scriptSegments.length === 0 || item.questions.length === 0) {
        continue;
      }
      segments.push({
        text: `問題${itemIndex + 1}。`,
        voice,
        rate,
        pitch,
      });
      segments.push(...scriptSegments);
      for (const question of item.questions) {
        segments.push(...buildQuestionSegments(question, questionNumber, voice, rate, pitch, item.examMode));
        questionNumber += 1;
      }
    }

    return {
      cleanedText: segments.map((segment) => segment.text).join("\n"),
      segments,
    };
  }, [expressivePlayback, femaleVoice, items, maleVoice, pitch, rate, voice]);

  const revokeGeneratedAudioUrl = useCallback(() => {
    if (generatedUrlRef.current) {
      URL.revokeObjectURL(generatedUrlRef.current);
      generatedUrlRef.current = null;
    }
  }, []);

  useEffect(() => {
    setRate(items[0]?.tts.rate || "-5%");
    setPitch(items[0]?.tts.pitch || "+0Hz");
    setTtsProvider(items[0]?.tts.provider || "auto");
    setExpressivePlayback(items[0]?.tts.expressive !== false);
    setAudioProvider("");
    setAudioUrl("");
    setState("idle");
    setError("");
    setAnswers({});
    setChecked(false);
    revokeGeneratedAudioUrl();
  }, [deckKey, items, revokeGeneratedAudioUrl]);

  useEffect(() => {
    return () => {
      revokeGeneratedAudioUrl();
    };
  }, [revokeGeneratedAudioUrl]);

  const generateDeckAudio = async () => {
    if (questions.length === 0 || deckPlan.segments.length === 0) {
      setState("error");
      setError("Deck nay chua co cau hoi/script hop le de tao audio.");
      return;
    }

    setState("generating");
    setError("");
    setAudioProvider("");
    try {
      const response = await fetch("/api/listening-tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: deckPlan.cleanedText,
          voice,
          rate,
          pitch,
          volume: items[0]?.tts.volume || "+0%",
          provider: ttsProvider,
          expressive: expressivePlayback,
          context: [
            "Một bộ bài nghe JLPT tiếng Nhật gồm nhiều tình huống đời thường. Hội thoại cần tự nhiên và tiết chế; phần hướng dẫn, số câu và đáp án được đọc trung tính, rõ ràng.",
            ...items.map((item) => item.tts.performanceDirection).filter(Boolean),
          ].join("\n"),
          segments: deckPlan.segments,
          allowFallbackDemo: false,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string; hint?: string };
        throw new Error([payload.error, payload.hint].filter(Boolean).join(" "));
      }

      const blob = await response.blob();
      setAudioProvider(response.headers.get("X-TTS-Provider") || "edge");
      const nextUrl = URL.createObjectURL(blob);
      revokeGeneratedAudioUrl();
      generatedUrlRef.current = nextUrl;
      setAudioUrl(nextUrl);
      setState("ready");
    } catch (nextError) {
      setState("error");
      setError(nextError instanceof Error ? nextError.message : "Khong tao duoc audio ca bo.");
    }
  };

  const resetDeckExam = () => {
    setAnswers({});
    setChecked(false);
  };

  if (items.length < 2 || questions.length === 0) {
    return null;
  }

  return (
    <article className="overflow-hidden rounded-[30px] border border-[#ffd3aa] bg-white shadow-[0_20px_48px_rgba(255,107,0,0.1)]">
      <div className="bg-[linear-gradient(135deg,#fff7ed,#fff_46%,#eef7ff)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-[#ffedd5] px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-[#b45309]">
              <Headphones className="h-4 w-4" />
              Lam ca bo JLPT mini
            </p>
            <h3 className="mt-3 text-2xl font-black text-[#111827]">{deckName}</h3>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-[#667085]">
              App se ghep tung hoi thoai ngan thanh mot audio de: hoi thoai 1 → cau hoi 1 → hoi thoai 2 → cau hoi 2.
              Truoc khi cham, phan dap an chi hien A/B/C/D de giong luc thi.
            </p>
          </div>
          <div className="grid gap-2 text-right text-sm font-black text-[#123c69] sm:grid-cols-2">
            <span className="rounded-2xl border border-[#d8e2ee] bg-white px-4 py-3">{items.length} hoi thoai</span>
            <span className="rounded-2xl border border-[#d8e2ee] bg-white px-4 py-3">{questions.length} cau hoi</span>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-5">
          <label className="text-xs font-black uppercase tracking-[0.14em] text-[#64748b]">
            Giong chinh
            <select
              value={voice}
              onChange={(event) => setVoice(event.target.value)}
              className="mt-2 h-11 w-full rounded-2xl border border-[#d8e2ee] bg-white px-3 text-sm font-black text-[#172033] outline-none"
            >
              {VOICE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-black uppercase tracking-[0.14em] text-[#64748b]">
            Giong nam
            <select
              value={maleVoice}
              onChange={(event) => setMaleVoice(event.target.value)}
              className="mt-2 h-11 w-full rounded-2xl border border-[#d8e2ee] bg-white px-3 text-sm font-black text-[#172033] outline-none"
            >
              {VOICE_OPTIONS.map((option) => (
                <option key={`male-${option.value}`} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-black uppercase tracking-[0.14em] text-[#64748b]">
            Giong nu
            <select
              value={femaleVoice}
              onChange={(event) => setFemaleVoice(event.target.value)}
              className="mt-2 h-11 w-full rounded-2xl border border-[#d8e2ee] bg-white px-3 text-sm font-black text-[#172033] outline-none"
            >
              {VOICE_OPTIONS.map((option) => (
                <option key={`female-${option.value}`} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-black uppercase tracking-[0.14em] text-[#64748b]">
            Toc do
            <select
              value={rate}
              onChange={(event) => setRate(event.target.value)}
              className="mt-2 h-11 w-full rounded-2xl border border-[#d8e2ee] bg-white px-3 text-sm font-black text-[#172033] outline-none"
            >
              <option value="-15%">Cham ro -15%</option>
              <option value="-5%">Gan de thi -5%</option>
              <option value="+0%">Tu nhien 0%</option>
              <option value="+8%">Nhanh +8%</option>
            </select>
          </label>
          <label className="text-xs font-black uppercase tracking-[0.14em] text-[#64748b]">
            Cong nghe tao giong
            <select
              value={ttsProvider}
              onChange={(event) => setTtsProvider(event.target.value === "edge" ? "edge" : "auto")}
              className="mt-2 h-11 w-full rounded-2xl border border-[#d8e2ee] bg-white px-3 text-sm font-black text-[#172033] outline-none"
            >
              <option value="auto">Gemini → Edge du phong</option>
              <option value="edge">Chi Edge TTS</option>
            </select>
          </label>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <label className="flex h-11 items-center gap-2 rounded-full border border-[#d8e2ee] bg-white px-4 text-sm font-black text-[#123c69]">
            <input
              type="checkbox"
              checked={expressivePlayback}
              onChange={(event) => setExpressivePlayback(event.target.checked)}
              className="h-4 w-4 rounded border-[#b7c7da]"
            />
            Biểu cảm theo ngữ cảnh
          </label>
          <button
            type="button"
            onClick={generateDeckAudio}
            disabled={state === "generating"}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-[#ff6b00] px-5 text-sm font-black text-white transition hover:bg-[#e85f00] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {state === "generating" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Volume2 className="h-4 w-4" />}
            {state === "generating" ? "Dang tao audio ca bo..." : "Tao audio ca bo"}
          </button>
          <button
            type="button"
            onClick={resetDeckExam}
            className="inline-flex h-11 items-center gap-2 rounded-full border border-[#d8e2ee] bg-white px-4 text-sm font-black text-[#123c69] transition hover:bg-[#f8fcff]"
          >
            <RotateCcw className="h-4 w-4" />
            Lam lai dap an
          </button>
        </div>

        <audio ref={audioRef} src={audioUrl || undefined} controls preload="metadata" className="mt-4 w-full" />

        {state === "ready" ? (
          <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">
            Da tao xong audio ca bo bang{" "}
            {audioProvider === "gemini"
              ? "Gemini bieu cam"
              : audioProvider === "edge-fallback"
                ? "Edge TTS du phong"
                : "Edge TTS"}
            .
          </p>
        ) : null}
        {state === "error" ? (
          <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">
            {error}
          </p>
        ) : null}
      </div>

      <div className="space-y-3 p-5">
        {questions.map((entry) => {
          const optionEntries = questionOptionEntries(entry.question, entry.item.examMode);
          return (
            <section key={entry.id} className="rounded-2xl border border-[#edf1f6] bg-[#fbfdff] p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="rounded-full bg-[#123c69] px-3 py-1 text-xs font-black text-white">
                    Cau {entry.globalIndex + 1}
                  </span>
                  <p className="mt-2 text-sm font-black text-[#111827]">{entry.item.title}</p>
                </div>
                <span className="text-xs font-black uppercase tracking-[0.14em] text-[#64748b]">
                  Hoi thoai {entry.itemIndex + 1}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {optionEntries.map((option) => {
                  const selected = answers[entry.id] === option.value;
                  const isCorrect = checked && isQuestionCorrect(entry.question, option.value);
                  const isWrong = checked && selected && !isQuestionCorrect(entry.question, option.value);
                  return (
                    <button
                      key={`${entry.id}-${option.label}-${option.value}`}
                      type="button"
                      onClick={() => {
                        setAnswers((current) => ({ ...current, [entry.id]: option.value }));
                        setChecked(false);
                      }}
                      className={`min-h-16 rounded-2xl border text-2xl font-black transition ${
                        isCorrect
                          ? "border-[#8ce4bd] bg-[#ecfff5] text-[#087443]"
                          : isWrong
                            ? "border-[#fecdd3] bg-[#fff1f2] text-[#be123c]"
                            : selected
                              ? "border-[#ff6b00] bg-[#fff3e8] text-[#b45309]"
                              : "border-[#d8e2ee] bg-white text-[#123c69] hover:bg-[#f8fcff]"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>

              {checked ? (
                <div className="mt-4 space-y-2 text-sm font-semibold leading-7 text-[#526070]">
                  <p className="font-[var(--font-jp)] text-base font-black text-[#111827]">
                    {entry.question.prompt}
                  </p>
                  <p>Dap an: {questionCorrectAnswerLabel(entry.question, entry.item.examMode)}</p>
                  {optionEntries.length > 0 ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {optionEntries.map((option) => (
                        <p
                          key={`review-${entry.id}-${option.label}`}
                          className={`rounded-xl border px-3 py-2 ${
                            isQuestionCorrect(entry.question, option.value)
                              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                              : "border-[#d8e2ee] bg-white text-[#526070]"
                          }`}
                        >
                          <span className="mr-2 font-black">{option.label}.</span>
                          <span className="font-[var(--font-jp)]">{option.value}</span>
                        </p>
                      ))}
                    </div>
                  ) : null}
                  {entry.question.explanation ? (
                    <p>
                      <span className="font-black text-[#0f5132]">Giai thich:</span> {entry.question.explanation}
                    </p>
                  ) : null}
                  {entry.question.explanationTraps ? (
                    <p>
                      <span className="font-black text-[#8a3e0d]">Bay sai de nham:</span>{" "}
                      {entry.question.explanationTraps}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </section>
          );
        })}

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#edf1f6] bg-white px-4 py-3">
          <p className="inline-flex items-center gap-2 text-sm font-black text-[#667085]">
            <Trophy className="h-4 w-4 text-[#ff6b00]" />
            {checked ? `Ket qua ca bo: ${correctCount}/${questions.length}` : "Nghe audio, chon A/B/C/D roi cham."}
          </p>
          <button
            type="button"
            onClick={() => setChecked(true)}
            disabled={Object.keys(answers).length < questions.length}
            className="rounded-full bg-[#123c69] px-6 py-3 text-sm font-black text-white transition hover:bg-[#0f3157] disabled:cursor-not-allowed disabled:opacity-45"
          >
            Cham ca bo
          </button>
        </div>
      </div>
    </article>
  );
}
