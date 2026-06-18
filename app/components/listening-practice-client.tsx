"use client";

import { Download, Headphones, Loader2, MoreVertical, Pause, Play, RotateCcw, Sparkles, Volume2 } from "lucide-react";
import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cleanJapaneseSpeechText } from "@/lib/japanese-speech";
import { resolveExpressiveTts } from "@/lib/listening-expression";
import type { ListeningPracticeItem } from "@/lib/listening-practice-store";

type Props = {
  item: ListeningPracticeItem;
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
type ListeningToken = {
  text: string;
  speechStart: number;
  speechEnd: number;
  speakable: boolean;
  kanji?: string;
  reading?: string;
};
type ScriptLine = {
  index: number;
  speakerRole: SpeakerRole;
  speakerLabel: string;
  displayText: string;
  speechText: string;
  speechLength: number;
  tokens: ListeningToken[];
  emotion?: string;
  voice?: string;
  rate?: string;
  pitch?: string;
  volume?: string;
};
type TimelineEntry = {
  lineIndex: number;
  start: number;
  end: number;
  duration: number;
};
type TokenRunState = "idle" | "passed" | "active";
type PracticeMode = "study" | "jlpt";

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

const TOKEN_PATTERN =
  /[\u3400-\u9fff\u3005\u3006\u30f5\u30f6]+[\uff08(][\u3041-\u3096\u30a1-\u30fa\u30fc\u30fb\s]+[\uff09)]|[\u3041-\u3096\u30a1-\u30fa\u30fc]+|[\u30a1-\u30fa\u30fc]+|[\u3400-\u9fff\u3005\u3006\u30f5\u30f6]+|[A-Za-z0-9]+|[^\s]/gu;
const SPEAKABLE_TOKEN_PATTERN = /[\u3040-\u30ff\u3400-\u9fffA-Za-z0-9]/u;
const RUBY_TOKEN_PATTERN =
  /^([\u3400-\u9fff\u3005\u3006\u30f5\u30f6]+)[\uff08(]\s*([\u3041-\u3096\u30a1-\u30fa\u30fc\u30fb\s]+)\s*[\uff09)]$/u;
const INLINE_RUBY_PATTERN =
  /([\u3400-\u9fff\u3005\u3006\u30f5\u30f6]+)[\uff08(]\s*([\u3041-\u3096\u30a1-\u30fa\u30fc\u30fb\s]+)\s*[\uff09)]/gu;

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

function compactSpeechCursorText(value: string): string {
  return cleanJapaneseSpeechText(value).replace(/\s+/g, "");
}

function parseRubyToken(text: string): Pick<ListeningToken, "kanji" | "reading"> | null {
  const match = text.match(RUBY_TOKEN_PATTERN);
  if (!match) {
    return null;
  }

  return {
    kanji: match[1],
    reading: match[2].replace(/\s+/g, ""),
  };
}

function pushListeningToken(tokens: ListeningToken[], text: string, speechCursor: number): number {
  if (!text) {
    return speechCursor;
  }
  const speechText = compactSpeechCursorText(text);
  const speakable = speechText.length > 0 && SPEAKABLE_TOKEN_PATTERN.test(speechText);
  const speechStart = speechCursor;
  const speechEnd = speechCursor + speechText.length;
  const ruby = parseRubyToken(text);
  tokens.push({
    text,
    speechStart,
    speechEnd,
    speakable,
    ...(ruby ?? {}),
  });
  return speechEnd;
}

function buildListeningTokens(text: string): ListeningToken[] {
  const tokens: ListeningToken[] = [];
  let speechCursor = 0;
  let displayCursor = 0;

  for (const match of text.matchAll(TOKEN_PATTERN)) {
    const tokenText = match[0] ?? "";
    const tokenIndex = match.index ?? displayCursor;
    if (tokenIndex > displayCursor) {
      speechCursor = pushListeningToken(tokens, text.slice(displayCursor, tokenIndex), speechCursor);
    }
    speechCursor = pushListeningToken(tokens, tokenText, speechCursor);
    displayCursor = tokenIndex + tokenText.length;
  }

  if (displayCursor < text.length) {
    pushListeningToken(tokens, text.slice(displayCursor), speechCursor);
  }

  return tokens.length > 0
    ? tokens
    : [
        {
          text,
          speechStart: 0,
          speechEnd: compactSpeechCursorText(text).length,
          speakable: true,
          ...(parseRubyToken(text) ?? {}),
        },
      ];
}

function parseSpeakerRole(plainSpeechLine: string): SpeakerRole {
  if (MALE_PLAIN_PREFIX.test(plainSpeechLine)) {
    return "male";
  }
  if (FEMALE_PLAIN_PREFIX.test(plainSpeechLine)) {
    return "female";
  }
  return "none";
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

function removeSpeakerPrefix(text: string, role: SpeakerRole, isDisplay: boolean): string {
  if (role === "male") {
    return text.replace(isDisplay ? MALE_DISPLAY_PREFIX : MALE_PLAIN_PREFIX, "").trim();
  }
  if (role === "female") {
    return text.replace(isDisplay ? FEMALE_DISPLAY_PREFIX : FEMALE_PLAIN_PREFIX, "").trim();
  }
  return text.trim();
}

function buildScriptLinesFromDialogue(
  dialogue?: ListeningPracticeItem["dialogue"]
): ScriptLine[] {
  if (!dialogue || dialogue.length === 0) {
    return [];
  }

  const output: ScriptLine[] = [];
  for (const turn of dialogue) {
    const displaySource = (turn.text || "").trim();
    const speechSource = (turn.textRaw || turn.text || "").trim();
    if (!displaySource || !speechSource) {
      continue;
    }
    const role = parseSpeakerRoleFromDialogueTurn(turn);
    const speakerLabel = role === "male" ? "Nam" : role === "female" ? "Nu" : "";
    const normalizedDisplay = removeSpeakerPrefix(displaySource, role, true) || displaySource;
    const normalizedSpeech = applySpeechPronunciationOverrides(
      cleanJapaneseSpeechText(removeSpeakerPrefix(speechSource, role, false) || speechSource)
    );
    if (!normalizedDisplay || !normalizedSpeech) {
      continue;
    }

    output.push({
      index: output.length,
      speakerRole: role,
      speakerLabel,
      displayText: normalizedDisplay,
      speechText: normalizedSpeech,
      speechLength: compactSpeechCursorText(normalizedSpeech).length,
      tokens: buildListeningTokens(normalizedDisplay),
      emotion: turn.emotion,
      voice: turn.voice,
      rate: turn.rate,
      pitch: turn.pitch,
      volume: turn.volume,
    });
  }

  return output;
}

function buildScriptLines(
  displayScript: string,
  rawScript?: string,
  dialogue?: ListeningPracticeItem["dialogue"]
): ScriptLine[] {
  const fromDialogue = buildScriptLinesFromDialogue(dialogue);
  if (fromDialogue.length > 0) {
    return fromDialogue;
  }

  const displayLines = (displayScript || "").split(/\r?\n/);
  const rawLines = (rawScript || "").split(/\r?\n/);
  const maxCount = Math.max(displayLines.length, rawLines.length);
  const output: ScriptLine[] = [];
  let nextIndex = 0;

  for (let index = 0; index < maxCount; index += 1) {
    const displayLine = (displayLines[index] ?? "").trim();
    const rawLine = (rawLines[index] ?? "").trim();
    const fallbackSpeechLine = cleanJapaneseSpeechText(displayLine);
    const speechLine = (rawLine || fallbackSpeechLine).trim();
    if (!displayLine && !speechLine) {
      continue;
    }

    const plainSpeech = cleanJapaneseSpeechText(speechLine).trim();
    const role = parseSpeakerRole(plainSpeech);
    const speakerLabel = role === "male" ? "Nam" : role === "female" ? "Nu" : "";
    const displayBody = removeSpeakerPrefix(displayLine || speechLine, role, true);
    const speechBody = removeSpeakerPrefix(plainSpeech, role, false);

    const normalizedDisplay = displayBody || displayLine || speechLine;
    const normalizedSpeech = applySpeechPronunciationOverrides(
      cleanJapaneseSpeechText(speechBody || normalizedDisplay)
    );
    if (!normalizedDisplay || !normalizedSpeech) {
      continue;
    }

    output.push({
      index: nextIndex,
      speakerRole: role,
      speakerLabel,
      displayText: normalizedDisplay,
      speechText: normalizedSpeech,
      speechLength: compactSpeechCursorText(normalizedSpeech).length,
      tokens: buildListeningTokens(normalizedDisplay),
    });
    nextIndex += 1;
  }

  return output;
}

function buildTimeline(lines: ScriptLine[], audioDuration: number): TimelineEntry[] {
  const speakableLines = lines.filter((line) => line.speechLength > 0);
  if (speakableLines.length === 0) {
    return [];
  }

  const safeDuration = Number.isFinite(audioDuration) && audioDuration > 0 ? audioDuration : 0;
  const totalWeight = speakableLines.reduce((sum, line) => sum + Math.max(1, line.speechLength), 0);
  let cursor = 0;

  return speakableLines.map((line, idx) => {
    const weight = Math.max(1, line.speechLength);
    const chunkDuration = safeDuration > 0 ? (weight / totalWeight) * safeDuration : 0;
    const start = cursor;
    const end = idx === speakableLines.length - 1 ? safeDuration : cursor + chunkDuration;
    cursor = end;
    return {
      lineIndex: line.index,
      start,
      end,
      duration: Math.max(0, end - start),
    };
  });
}

function tokenIndexFromCharIndex(line: ScriptLine, charIndex: number): number {
  const compactCharIndex = Math.max(0, Math.min(line.speechLength, charIndex));
  const directIndex = line.tokens.findIndex(
    (token) => token.speakable && compactCharIndex >= token.speechStart && compactCharIndex < token.speechEnd
  );
  if (directIndex >= 0) {
    return directIndex;
  }

  for (let index = line.tokens.length - 1; index >= 0; index -= 1) {
    const token = line.tokens[index];
    if (token?.speakable && token.speechStart <= compactCharIndex) {
      return index;
    }
  }

  return line.tokens.findIndex((token) => token.speakable);
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

function cleanExamSpeechText(value: string): string {
  return applySpeechPronunciationOverrides(cleanJapaneseSpeechText(stripInlineRuby(value)))
    .replace(/\s+/g, " ")
    .trim();
}

function buildExamQuestionSegments(
  questions: ListeningPracticeItem["questions"],
  voice: string,
  rate: string,
  pitch: string,
  examMode?: ListeningPracticeItem["examMode"]
): TtsSegmentPayload[] {
  return questions.flatMap((question, questionIndex) => {
    const explicitExamAudio = cleanExamSpeechText(question.examAudioRaw || question.examAudio || "");
    if (explicitExamAudio) {
      return [
        {
          text: explicitExamAudio,
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
      .filter((entry): entry is TtsSegmentPayload => Boolean(entry));

    const questionText = prompt
      ? `問題${questionIndex + 1}。${prompt}`
      : `問題${questionIndex + 1}。`;

    return [
      {
        text: questionText,
        voice,
        rate,
        pitch,
      },
      ...options,
    ];
  });
}

function resolveTokenRunState(
  lineActive: boolean,
  token: ListeningToken,
  tokenIndex: number,
  activeIndex: number
): TokenRunState {
  if (!lineActive || activeIndex < 0) {
    return "idle";
  }

  if (tokenIndex === activeIndex && token.speakable) {
    return "active";
  }
  if (tokenIndex < activeIndex) {
    return "passed";
  }
  return "idle";
}

function ScriptTokenText({ state, token }: { state: TokenRunState; token: ListeningToken }) {
  const kanjiClass =
    state === "active"
      ? "text-[#ff6b00]"
      : state === "passed"
        ? "text-[#155e75]"
        : "";
  if (token.kanji && token.reading) {
    return (
      <ruby className="align-baseline whitespace-nowrap px-0.5 [ruby-position:over]">
        <span className={kanjiClass}>{token.kanji}</span>
        <rt className="pointer-events-none select-none text-[0.58em] font-black leading-none tracking-wide text-[#64748b]">
          {token.reading}
        </rt>
      </ruby>
    );
  }

  return <>{token.text}</>;
}

function speakerTheme(role: SpeakerRole): string {
  if (role === "male") {
    return "border-[#c7ddff] bg-[#f2f7ff]";
  }
  if (role === "female") {
    return "border-[#f3d3ff] bg-[#fcf4ff]";
  }
  return "border-[#d8e2ee] bg-white";
}

function speakerBadgeTheme(role: SpeakerRole): string {
  if (role === "male") {
    return "bg-[#dbe9ff] text-[#224e9a]";
  }
  if (role === "female") {
    return "bg-[#f4dcff] text-[#7e2ba9]";
  }
  return "bg-[#eef3ff] text-[#3554a8]";
}

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "0:00";
  }
  const safeSeconds = Math.floor(Math.max(0, seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = String(safeSeconds % 60).padStart(2, "0");
  return `${minutes}:${remainingSeconds}`;
}

function signedNumber(value: string | undefined): number {
  const parsed = Number.parseInt(value || "0", 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clampNumber(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function formatPlaybackRate(value: number): string {
  return `${Number(value.toFixed(2))}x`;
}

function audioDownloadName(title: string, provider: string): string {
  const safeTitle =
    title
      .normalize("NFKC")
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "bai-nghe";
  return `${safeTitle}.${provider === "gemini" ? "wav" : "mp3"}`;
}

export function ListeningPracticeClient({ item }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const examAudioRef = useRef<HTMLAudioElement | null>(null);
  const scriptContainerRef = useRef<HTMLDivElement | null>(null);
  const lineRefs = useRef(new Map<number, HTMLDivElement>());
  const tickerRef = useRef<number | null>(null);
  const activeLineIndexRef = useRef(-1);
  const scriptLinesRef = useRef<ScriptLine[]>([]);
  const browserSessionRef = useRef(0);
  const browserTimerRef = useRef<number | null>(null);
  const browserStartedAtRef = useRef(0);
  const generatedUrlRef = useRef<string | null>(null);
  const generatedExamUrlRef = useRef<string | null>(null);

  const [practiceMode, setPracticeMode] = useState<PracticeMode>("study");
  const [voice, setVoice] = useState(DEFAULT_MAIN_VOICE);
  const [maleVoice, setMaleVoice] = useState(DEFAULT_MALE_VOICE);
  const [femaleVoice, setFemaleVoice] = useState(DEFAULT_FEMALE_VOICE);
  const [rate, setRate] = useState(item.tts.rate || "-5%");
  const [pitch, setPitch] = useState(item.tts.pitch || "+0Hz");
  const [ttsProvider, setTtsProvider] = useState<"auto" | "edge">(item.tts.provider || "auto");
  const [rolePlayback, setRolePlayback] = useState(true);
  const [expressivePlayback, setExpressivePlayback] = useState(item.tts.expressive !== false);
  const [audioProvider, setAudioProvider] = useState("");
  const [examAudioProvider, setExamAudioProvider] = useState("");
  const [showAudioMenu, setShowAudioMenu] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [audioUrl, setAudioUrl] = useState("");
  const [examAudioUrl, setExamAudioUrl] = useState("");
  const [state, setState] = useState<GenerateState>("idle");
  const [examState, setExamState] = useState<GenerateState>("idle");
  const [error, setError] = useState("");
  const [examError, setExamError] = useState("");
  const [showTranscript, setShowTranscript] = useState(true);
  const [showTranslation, setShowTranslation] = useState(true);
  const [followScript, setFollowScript] = useState(true);
  const [activeLineIndex, setActiveLineIndex] = useState(-1);
  const [activeTokenIndex, setActiveTokenIndex] = useState(-1);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [isPlaybackActive, setIsPlaybackActive] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState(false);

  const scriptLines = useMemo(
    () => buildScriptLines(item.script, item.scriptRaw, item.dialogue),
    [item.dialogue, item.script, item.scriptRaw]
  );
  const translationLines = useMemo(
    () =>
      (item.translation || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean),
    [item.translation]
  );
  const activeScriptLine = useMemo(
    () => scriptLines.find((line) => line.index === activeLineIndex) ?? null,
    [activeLineIndex, scriptLines]
  );
  const hasDialogueMarkers = useMemo(
    () => scriptLines.some((line) => line.speakerRole !== "none"),
    [scriptLines]
  );
  const timeline = useMemo(() => buildTimeline(scriptLines, audioDuration), [scriptLines, audioDuration]);
  const scriptPlan = useMemo(() => {
    const cleanedText = scriptLines.map((line) => line.speechText).join("\n");
    const segments: TtsSegmentPayload[] = scriptLines.map((line) => {
      let segmentVoice = voice;
      if (rolePlayback && line.speakerRole === "male") {
        segmentVoice = maleVoice;
      } else if (rolePlayback && line.speakerRole === "female") {
        segmentVoice = femaleVoice;
      }
      const expression = resolveExpressiveTts(line.speechText, {
        enabled: expressivePlayback,
        emotion: line.emotion,
        baseRate: rate,
        basePitch: pitch,
        baseVolume: item.tts.volume,
        rate: line.rate,
        pitch: line.pitch,
        volume: line.volume,
      });
      return {
        text: line.speechText,
        voice: line.voice || segmentVoice,
        rate: expression.rate,
        pitch: expression.pitch,
        volume: expression.volume,
        emotion: expression.emotion,
      };
    });
    return {
      cleanedText,
      segments,
    };
  }, [expressivePlayback, femaleVoice, item.tts.volume, maleVoice, pitch, rate, rolePlayback, scriptLines, voice]);
  const examPlan = useMemo(() => {
    const questionVoice = voice;
    const instruction = cleanExamSpeechText(
      item.examMode?.instructionRaw ||
        item.examMode?.instruction ||
        "これから、問題を聞きます。会話を聞いて、A、B、C、Dから選んでください。"
    );
    const introSegment: TtsSegmentPayload = {
      text: instruction,
      voice: questionVoice,
      rate,
      pitch,
    };
    const scriptSegments =
      expressivePlayback || (hasDialogueMarkers && rolePlayback)
        ? scriptPlan.segments
        : scriptPlan.cleanedText
          ? [
              {
                text: scriptPlan.cleanedText,
                voice,
                rate,
                pitch,
              },
            ]
          : [];
    const questionSegments = buildExamQuestionSegments(item.questions, questionVoice, rate, pitch, item.examMode);
    const segments = [introSegment, ...scriptSegments, ...questionSegments].filter((segment) =>
      Boolean(segment.text.trim())
    );

    return {
      cleanedText: segments.map((segment) => segment.text).join("\n"),
      segments,
    };
  }, [expressivePlayback, hasDialogueMarkers, item.examMode, item.questions, pitch, rate, rolePlayback, scriptPlan, voice]);

  const clearTicker = useCallback(() => {
    if (tickerRef.current !== null) {
      window.clearInterval(tickerRef.current);
      tickerRef.current = null;
    }
  }, []);

  const clearBrowserTimer = useCallback(() => {
    if (browserTimerRef.current !== null) {
      window.clearInterval(browserTimerRef.current);
      browserTimerRef.current = null;
    }
  }, []);

  const revokeGeneratedAudioUrl = useCallback(() => {
    if (generatedUrlRef.current) {
      URL.revokeObjectURL(generatedUrlRef.current);
      generatedUrlRef.current = null;
    }
  }, []);

  const revokeGeneratedExamAudioUrl = useCallback(() => {
    if (generatedExamUrlRef.current) {
      URL.revokeObjectURL(generatedExamUrlRef.current);
      generatedExamUrlRef.current = null;
    }
  }, []);

  const stopBrowserSpeech = useCallback(
    (resetHighlight = false) => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      setIsPlaybackActive(false);
      browserSessionRef.current += 1;
      clearBrowserTimer();
      if (resetHighlight) {
        setActiveLineIndex(-1);
        setActiveTokenIndex(-1);
      }
    },
    [clearBrowserTimer]
  );

  const syncScriptHighlight = useCallback(
    (currentTimeSec: number) => {
      setAudioCurrentTime(currentTimeSec);
      const playerDuration =
        audioRef.current && Number.isFinite(audioRef.current.duration) && audioRef.current.duration > 0
          ? audioRef.current.duration
          : 0;
      const resolvedDuration = audioDuration > 0 ? audioDuration : playerDuration;
      if (audioDuration <= 0 && resolvedDuration > 0) {
        setAudioDuration(resolvedDuration);
      }

      if (timeline.length === 0 || scriptLines.length === 0 || resolvedDuration <= 0) {
        setActiveLineIndex(-1);
        setActiveTokenIndex(-1);
        return;
      }

      const safeTime = Math.min(Math.max(0, currentTimeSec), resolvedDuration);
      const entry =
        timeline.find((timelineEntry) => safeTime >= timelineEntry.start && safeTime < timelineEntry.end) ??
        timeline[timeline.length - 1];
      if (!entry) {
        setActiveLineIndex(-1);
        setActiveTokenIndex(-1);
        return;
      }

      const line = scriptLines.find((itemLine) => itemLine.index === entry.lineIndex);
      if (!line) {
        setActiveLineIndex(-1);
        setActiveTokenIndex(-1);
        return;
      }

      const lineRatio = entry.duration > 0 ? (safeTime - entry.start) / entry.duration : 0;
      const charIndex = Math.floor(Math.min(0.999, Math.max(0, lineRatio)) * Math.max(1, line.speechLength));
      const tokenIndex = tokenIndexFromCharIndex(line, charIndex);
      setActiveLineIndex(line.index);
      setActiveTokenIndex(tokenIndex);
    },
    [audioDuration, scriptLines, timeline]
  );

  const startTicker = useCallback(() => {
    clearTicker();
    tickerRef.current = window.setInterval(() => {
      const audio = audioRef.current;
      if (!audio) {
        return;
      }
      syncScriptHighlight(audio.currentTime);
    }, 90);
  }, [clearTicker, syncScriptHighlight]);

  const syncFromAudioElement = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
    if (duration > 0) {
      setAudioDuration(duration);
    }
    syncScriptHighlight(audio.currentTime || 0);
  }, [syncScriptHighlight]);

  const handleAudioLoadedMetadata = useCallback(() => {
    syncFromAudioElement();
  }, [syncFromAudioElement]);

  const handleAudioPlay = useCallback(() => {
    stopBrowserSpeech();
    const examAudio = examAudioRef.current;
    if (examAudio) {
      examAudio.pause();
    }
    setIsPlaybackActive(true);
    if (activeLineIndexRef.current < 0 && scriptLinesRef.current.length > 0) {
      const firstLine = scriptLinesRef.current[0];
      setActiveLineIndex(firstLine.index);
      setActiveTokenIndex(tokenIndexFromCharIndex(firstLine, 0));
    }
    syncFromAudioElement();
    startTicker();
  }, [startTicker, stopBrowserSpeech, syncFromAudioElement]);

  const handleExamAudioPlay = useCallback(() => {
    stopBrowserSpeech(true);
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
    }
    clearTicker();
  }, [clearTicker, stopBrowserSpeech]);

  const handleAudioPause = useCallback(() => {
    setIsPlaybackActive(false);
    clearTicker();
    syncFromAudioElement();
  }, [clearTicker, syncFromAudioElement]);

  const handleAudioTimeUpdate = useCallback(() => {
    syncFromAudioElement();
  }, [syncFromAudioElement]);

  const handleAudioEnded = useCallback(() => {
    const audio = audioRef.current;
    setIsPlaybackActive(false);
    clearTicker();
    setActiveLineIndex(-1);
    setActiveTokenIndex(-1);
    if (audio) {
      setAudioCurrentTime(audio.duration || 0);
    }
  }, [clearTicker]);

  useEffect(() => {
    activeLineIndexRef.current = activeLineIndex;
  }, [activeLineIndex]);

  useEffect(() => {
    scriptLinesRef.current = scriptLines;
  }, [scriptLines]);

  useEffect(() => {
    setVoice(DEFAULT_MAIN_VOICE);
    setMaleVoice(DEFAULT_MALE_VOICE);
    setFemaleVoice(DEFAULT_FEMALE_VOICE);
    setRate(item.tts.rate || "-5%");
    setPitch(item.tts.pitch || "+0Hz");
    setTtsProvider(item.tts.provider || "auto");
    setRolePlayback(true);
    setExpressivePlayback(item.tts.expressive !== false);
    setAudioProvider("");
    setExamAudioProvider("");
    setShowAudioMenu(false);
    setPracticeMode("study");
    setAudioUrl("");
    setExamAudioUrl("");
    setError("");
    setExamError("");
    setState("idle");
    setExamState("idle");
    setShowTranscript(true);
    setShowTranslation(true);
    setFollowScript(true);
    setActiveLineIndex(-1);
    setActiveTokenIndex(-1);
    setIsPlaybackActive(false);
    setAudioCurrentTime(0);
    setAudioDuration(0);
    setAnswers({});
    setChecked(false);
    clearTicker();
    stopBrowserSpeech();
    revokeGeneratedAudioUrl();
    revokeGeneratedExamAudioUrl();
  }, [
    clearTicker,
    item.id,
    item.tts.pitch,
    item.tts.provider,
    item.tts.rate,
    item.tts.expressive,
    revokeGeneratedAudioUrl,
    revokeGeneratedExamAudioUrl,
    stopBrowserSpeech,
  ]);

  useEffect(() => {
    return () => {
      clearTicker();
      stopBrowserSpeech();
      revokeGeneratedAudioUrl();
      revokeGeneratedExamAudioUrl();
    };
  }, [clearTicker, revokeGeneratedAudioUrl, revokeGeneratedExamAudioUrl, stopBrowserSpeech]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.playbackRate = playbackRate;
    }
    const examAudio = examAudioRef.current;
    if (examAudio) {
      examAudio.playbackRate = playbackRate;
    }
  }, [audioUrl, examAudioUrl, playbackRate]);

  useEffect(() => {
    if (!audioUrl) {
      return;
    }
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    if (audio.readyState >= 1) {
      syncFromAudioElement();
    }
    if (!audio.paused) {
      startTicker();
    }
  }, [audioUrl, startTicker, syncFromAudioElement]);

  useEffect(() => {
    if (!followScript || !isPlaybackActive || activeLineIndex < 0) {
      return;
    }
    const container = scriptContainerRef.current;
    const activeLineNode = lineRefs.current.get(activeLineIndex);
    if (!container || !activeLineNode) {
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const lineRect = activeLineNode.getBoundingClientRect();
    const currentScrollTop = container.scrollTop;
    const lineTopInContainer = lineRect.top - containerRect.top + currentScrollTop;
    const centerOffset = (container.clientHeight - lineRect.height) / 2;
    const targetScrollTop = lineTopInContainer - centerOffset;
    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
    const nextScrollTop = Math.max(0, Math.min(maxScrollTop, targetScrollTop));

    if (Math.abs(nextScrollTop - currentScrollTop) < 4) {
      return;
    }

    container.scrollTo({
      top: nextScrollTop,
      behavior: "smooth",
    });
  }, [activeLineIndex, followScript, isPlaybackActive]);

  const correctCount = useMemo(() => {
    return item.questions.filter((question) => {
      const current = answers[question.id];
      return isQuestionCorrect(question, current);
    }).length;
  }, [answers, item.questions]);

  const generateAudio = async () => {
    setState("generating");
    setError("");
    setAudioProvider("");
    setShowAudioMenu(false);
    stopBrowserSpeech(true);
    try {
      const useSegments = expressivePlayback || (hasDialogueMarkers && rolePlayback);
      const response = await fetch("/api/listening-tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: scriptPlan.cleanedText,
          voice,
          rate,
          pitch,
          volume: item.tts.volume || "+0%",
          provider: ttsProvider,
          expressive: expressivePlayback,
          context: [
            item.situation || `${item.title}. Hội thoại luyện nghe tiếng Nhật đời thường.`,
            item.tts.performanceDirection,
          ]
            .filter(Boolean)
            .join("\n"),
          segments: useSegments ? scriptPlan.segments : undefined,
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
      setActiveLineIndex(-1);
      setActiveTokenIndex(-1);
      setAudioCurrentTime(0);
      setAudioDuration(0);
    } catch (nextError) {
      setState("error");
      setError(nextError instanceof Error ? nextError.message : "Khong tao duoc audio.");
    }
  };

  const generateExamAudio = async () => {
    if (item.questions.length === 0 || examPlan.segments.length === 0) {
      setExamState("error");
      setExamError("Bai nay chua co cau hoi de tao audio thi JLPT.");
      return;
    }

    setExamState("generating");
    setExamError("");
    setExamAudioProvider("");
    stopBrowserSpeech(true);
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
    }
    clearTicker();

    try {
      const response = await fetch("/api/listening-tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: examPlan.cleanedText,
          voice,
          rate,
          pitch,
          volume: item.tts.volume || "+0%",
          provider: ttsProvider,
          expressive: expressivePlayback,
          context: [
            `${item.situation || item.title}. Đây là bài nghe JLPT; phần hội thoại tự nhiên, phần hướng dẫn và câu hỏi trung tính, rõ ràng.`,
            item.tts.performanceDirection,
          ]
            .filter(Boolean)
            .join("\n"),
          segments: examPlan.segments,
          allowFallbackDemo: false,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string; hint?: string };
        throw new Error([payload.error, payload.hint].filter(Boolean).join(" "));
      }

      const blob = await response.blob();
      setExamAudioProvider(response.headers.get("X-TTS-Provider") || "edge");
      const nextUrl = URL.createObjectURL(blob);
      revokeGeneratedExamAudioUrl();
      generatedExamUrlRef.current = nextUrl;
      setExamAudioUrl(nextUrl);
      setExamState("ready");
    } catch (nextError) {
      setExamState("error");
      setExamError(nextError instanceof Error ? nextError.message : "Khong tao duoc audio thi JLPT.");
    }
  };

  const speakWithBrowser = () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setError("Trinh duyet nay khong ho tro speechSynthesis.");
      setState("error");
      return;
    }

    if (scriptLines.length === 0) {
      setError("Chua co script hop le de doc.");
      setState("error");
      return;
    }

    setShowTranscript(true);
    setError("");
    setState("ready");

    const audio = audioRef.current;
    if (audio) {
      audio.pause();
    }
    clearTicker();

    stopBrowserSpeech();
    setIsPlaybackActive(true);
    const synth = window.speechSynthesis;
    const sessionId = browserSessionRef.current + 1;
    browserSessionRef.current = sessionId;

    const estimatedDuration = scriptLines.reduce((sum, line) => {
      const lineSeconds = Math.max(0.75, line.speechLength / Math.max(2.4, 7 * playbackRate));
      return sum + lineSeconds;
    }, 0);
    setAudioDuration(estimatedDuration);
    setAudioCurrentTime(0);
    browserStartedAtRef.current = performance.now();
    clearBrowserTimer();
    browserTimerRef.current = window.setInterval(() => {
      if (browserSessionRef.current !== sessionId) {
        clearBrowserTimer();
        return;
      }
      const elapsed = (performance.now() - browserStartedAtRef.current) / 1000;
      setAudioCurrentTime(Math.min(estimatedDuration, elapsed));
    }, 90);

    const speakLine = (lineIdx: number) => {
      if (browserSessionRef.current !== sessionId) {
        return;
      }

      const line = scriptLines[lineIdx];
      if (!line) {
        clearBrowserTimer();
        setIsPlaybackActive(false);
        setAudioCurrentTime(estimatedDuration);
        setActiveLineIndex(-1);
        setActiveTokenIndex(-1);
        return;
      }

      setActiveLineIndex(line.index);
      setActiveTokenIndex(tokenIndexFromCharIndex(line, 0));

      const utterance = new SpeechSynthesisUtterance(line.speechText);
      const expression = resolveExpressiveTts(line.speechText, {
        enabled: expressivePlayback,
        emotion: line.emotion,
        baseRate: rate,
        basePitch: pitch,
        baseVolume: item.tts.volume,
        rate: line.rate,
        pitch: line.pitch,
        volume: line.volume,
      });
      utterance.lang = "ja-JP";
      utterance.rate = clampNumber(playbackRate * (1 + signedNumber(expression.rate) / 100), 0.55, 1.8);
      utterance.pitch = clampNumber(1 + signedNumber(expression.pitch) / 30, 0.55, 1.6);
      utterance.volume = clampNumber(1 + signedNumber(expression.volume) / 100, 0.2, 1);

      utterance.onboundary = (event) => {
        if (browserSessionRef.current !== sessionId || typeof event.charIndex !== "number") {
          return;
        }
        const compactIndex = compactSpeechCursorText(line.speechText.slice(0, event.charIndex)).length;
        const tokenIndex = tokenIndexFromCharIndex(line, compactIndex);
        setActiveLineIndex(line.index);
        setActiveTokenIndex(tokenIndex);
      };

      utterance.onend = () => {
        if (browserSessionRef.current !== sessionId) {
          return;
        }
        if (lineIdx >= scriptLines.length - 1) {
          clearBrowserTimer();
          setIsPlaybackActive(false);
          setAudioCurrentTime(estimatedDuration);
          setActiveLineIndex(-1);
          setActiveTokenIndex(-1);
          return;
        }
        window.setTimeout(() => speakLine(lineIdx + 1), 90);
      };

      utterance.onerror = () => {
        if (browserSessionRef.current !== sessionId) {
          return;
        }
        clearBrowserTimer();
        setIsPlaybackActive(false);
      };

      synth.speak(utterance);
    };

    speakLine(0);
  };

  const resetQuiz = () => {
    setAnswers({});
    setChecked(false);
  };

  const enterStudyMode = () => {
    setPracticeMode("study");
    setAnswers({});
    setChecked(false);
  };

  const enterJlptMode = () => {
    setPracticeMode("jlpt");
    setShowTranscript(false);
    setShowTranslation(false);
    setAnswers({});
    setChecked(false);
  };

  const toggleAudioPlayback = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) {
      return;
    }

    if (audio.paused) {
      void audio.play().catch(() => {
        setState("error");
        setError("Khong phat duoc audio. Hay thu tao lai audio hoac dung trinh duyet am thanh.");
      });
      return;
    }

    audio.pause();
  }, [audioUrl]);

  const handleAudioSeek = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const nextTime = Number(event.target.value);
      setAudioCurrentTime(nextTime);
      const audio = audioRef.current;
      if (audio && audioDuration > 0) {
        audio.currentTime = nextTime;
      }
      syncScriptHighlight(nextTime);
    },
    [audioDuration, syncScriptHighlight]
  );

  const audioProgressPercent =
    audioDuration > 0 ? Math.min(100, Math.max(0, (audioCurrentTime / audioDuration) * 100)) : 0;
  const hasAudio = Boolean(audioUrl);
  const downloadName = audioDownloadName(item.title, audioProvider);

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[32px] border border-[#cbd8e7] bg-[#102d55] text-white shadow-[0_24px_60px_rgba(15,45,85,0.18)]">
        <div className="grid gap-6 bg-[radial-gradient(circle_at_top_left,rgba(34,166,161,0.36),transparent_34%),linear-gradient(135deg,#173b6d,#102d55_60%,#0a1f3f)] px-6 py-7 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)] lg:px-8">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-[#aef7ee]">
              <Headphones className="h-4 w-4" />
              Bai nghe chu dong
            </p>
            <h2 className="mt-5 max-w-3xl text-3xl font-black leading-tight md:text-4xl">{item.title}</h2>
            <p className="mt-3 text-sm font-bold uppercase tracking-[0.14em] text-white/75">
              {item.jlptLevel} | {item.topic}
            </p>
            {item.meta ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {item.meta.level ? (
                  <span className="rounded-full border border-white/25 bg-white/12 px-3 py-1 text-xs font-black text-[#dff7ff]">
                    Level: {item.meta.level}
                  </span>
                ) : null}
                {item.meta.type ? (
                  <span className="rounded-full border border-white/25 bg-white/12 px-3 py-1 text-xs font-black text-[#dff7ff]">
                    Dang bai: {item.meta.type}
                  </span>
                ) : null}
                {item.meta.durationEstimate ? (
                  <span className="rounded-full border border-white/25 bg-white/12 px-3 py-1 text-xs font-black text-[#dff7ff]">
                    Do dai: {item.meta.durationEstimate}
                  </span>
                ) : null}
              </div>
            ) : null}
            {item.situation ? (
              <p className="mt-3 max-w-2xl text-sm font-semibold leading-7 text-white/82">
                <span className="font-black text-[#aef7ee]">Tinh huong:</span> {item.situation}
              </p>
            ) : null}
            {item.keyPoint ? (
              <p className="mt-2 max-w-2xl text-sm font-semibold leading-7 text-white/82">
                <span className="font-black text-[#aef7ee]">Can nghe ky:</span> {item.keyPoint}
              </p>
            ) : null}
            {item.translation ? (
              <p className="mt-4 max-w-2xl text-sm font-semibold leading-7 text-white/78">{item.translation}</p>
            ) : null}
          </div>

          <div className="rounded-[26px] border border-white/18 bg-white/10 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.16)] backdrop-blur">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-black uppercase tracking-[0.14em] text-white/68">
                Giong chinh
                <select
                  value={voice}
                  onChange={(event) => setVoice(event.target.value)}
                  className="mt-2 h-11 w-full rounded-2xl border border-white/20 bg-[#0e274a] px-3 text-sm font-black text-white outline-none"
                >
                  {VOICE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              {hasDialogueMarkers ? (
                <label className="text-xs font-black uppercase tracking-[0.14em] text-white/68">
                  Giong nam
                  <select
                    value={maleVoice}
                    onChange={(event) => setMaleVoice(event.target.value)}
                    className="mt-2 h-11 w-full rounded-2xl border border-white/20 bg-[#0e274a] px-3 text-sm font-black text-white outline-none"
                  >
                    {VOICE_OPTIONS.map((option) => (
                      <option key={`male-${option.value}`} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              {hasDialogueMarkers ? (
                <label className="text-xs font-black uppercase tracking-[0.14em] text-white/68">
                  Giong nu
                  <select
                    value={femaleVoice}
                    onChange={(event) => setFemaleVoice(event.target.value)}
                    className="mt-2 h-11 w-full rounded-2xl border border-white/20 bg-[#0e274a] px-3 text-sm font-black text-white outline-none"
                  >
                    {VOICE_OPTIONS.map((option) => (
                      <option key={`female-${option.value}`} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <label className="text-xs font-black uppercase tracking-[0.14em] text-white/68">
                Toc do tao audio
                <select
                  value={rate}
                  onChange={(event) => setRate(event.target.value)}
                  className="mt-2 h-11 w-full rounded-2xl border border-white/20 bg-[#0e274a] px-3 text-sm font-black text-white outline-none"
                >
                  <option value="-15%">Cham ro -15%</option>
                  <option value="-5%">Gan de thi -5%</option>
                  <option value="+0%">Tu nhien 0%</option>
                  <option value="+8%">Nhanh +8%</option>
                </select>
              </label>
              <label className="text-xs font-black uppercase tracking-[0.14em] text-white/68">
                Cao do
                <select
                  value={pitch}
                  onChange={(event) => setPitch(event.target.value)}
                  className="mt-2 h-11 w-full rounded-2xl border border-white/20 bg-[#0e274a] px-3 text-sm font-black text-white outline-none"
                >
                  <option value="-5Hz">Tram -5Hz</option>
                  <option value="+0Hz">Mac dinh 0Hz</option>
                  <option value="+5Hz">Cao +5Hz</option>
                </select>
              </label>
              <label className="text-xs font-black uppercase tracking-[0.14em] text-white/68">
                Cong nghe tao giong
                <select
                  value={ttsProvider}
                  onChange={(event) => setTtsProvider(event.target.value === "edge" ? "edge" : "auto")}
                  className="mt-2 h-11 w-full rounded-2xl border border-white/20 bg-[#0e274a] px-3 text-sm font-black text-white outline-none"
                >
                  <option value="auto">Gemini bieu cam, het quota dung Edge</option>
                  <option value="edge">Chi dung Edge TTS mien phi</option>
                </select>
              </label>
            </div>

            {hasDialogueMarkers ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <label className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/8 px-3 py-2 text-sm font-bold text-white/85">
                  <input
                    type="checkbox"
                    checked={rolePlayback}
                    onChange={(event) => setRolePlayback(event.target.checked)}
                    className="h-4 w-4 rounded border-white/30 bg-transparent"
                  />
                  Phân vai nam/nữ
                </label>
                <label className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/8 px-3 py-2 text-sm font-bold text-white/85">
                  <input
                    type="checkbox"
                    checked={expressivePlayback}
                    onChange={(event) => setExpressivePlayback(event.target.checked)}
                    className="h-4 w-4 rounded border-white/30 bg-transparent"
                  />
                  Biểu cảm theo ngữ cảnh
                </label>
              </div>
            ) : null}

            <button
              type="button"
              onClick={generateAudio}
              disabled={state === "generating"}
              className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#ff6b00] px-5 text-sm font-black text-white transition hover:bg-[#ff8129] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {state === "generating" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
              {state === "generating" ? "Dang tao audio..." : "Tao audio bai nay"}
            </button>

            {state === "ready" ? (
              <p className="mt-3 rounded-2xl border border-emerald-200/30 bg-emerald-300/10 px-3 py-2 text-sm font-bold text-[#aef7ee]">
                Da tao xong audio bang{" "}
                {audioProvider === "gemini"
                  ? "Gemini bieu cam"
                  : audioProvider === "edge-fallback"
                    ? "Edge TTS du phong"
                    : "Edge TTS"}
                .
              </p>
            ) : null}
            {state === "error" ? (
              <p className="mt-3 rounded-2xl border border-rose-200/30 bg-rose-300/10 px-3 py-2 text-sm font-bold text-rose-100">
                {error}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,0.92fr)_minmax(360px,1.08fr)]">
        <article className="overflow-hidden rounded-[30px] border border-[#dfe7f2] bg-white p-4 shadow-[0_22px_60px_rgba(18,60,105,0.10)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[linear-gradient(135deg,#eef5ff,#5b6ee1)] text-white shadow-[0_14px_30px_rgba(78,96,205,0.28)]">
                <Headphones className="h-6 w-6" />
              </span>
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#64748b]">Audio shadowing</p>
                <h3 className="mt-1 text-2xl font-black text-[#0f172a]">Nghe va lap lai</h3>
              </div>
            </div>
            <button
              type="button"
              onClick={speakWithBrowser}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-[#dfe7f2] bg-[#fbfdff] px-4 text-sm font-black text-[#3554a8] shadow-sm transition hover:border-[#bfc9ff] hover:bg-[#f4f7ff]"
            >
              <Volume2 className="h-4 w-4" />
              Trinh duyet am thanh
            </button>
          </div>

          <audio
            ref={audioRef}
            src={audioUrl || undefined}
            preload="metadata"
            className="hidden"
            onLoadedMetadata={handleAudioLoadedMetadata}
            onPlay={handleAudioPlay}
            onPause={handleAudioPause}
            onTimeUpdate={handleAudioTimeUpdate}
            onSeeking={handleAudioTimeUpdate}
            onSeeked={handleAudioTimeUpdate}
            onEnded={handleAudioEnded}
          />

          <div className="mt-5 rounded-[26px] border border-[#edf1f6] bg-[linear-gradient(135deg,#ffffff,#f8fbff_58%,#fff8f1)] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
            <div className="relative flex items-center gap-3 rounded-[22px] border border-[#e3e8f4] bg-white px-3 py-3 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
              <button
                type="button"
                onClick={toggleAudioPlayback}
                disabled={!hasAudio}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,#5568df,#6b7cff)] text-white shadow-[0_12px_22px_rgba(85,104,223,0.28)] transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-45"
                aria-label={isPlaybackActive ? "Tam dung audio" : "Phat audio"}
              >
                {isPlaybackActive ? <Pause className="h-5 w-5 fill-white" /> : <Play className="h-5 w-5 fill-white" />}
              </button>
              <span className="min-w-[78px] text-sm font-black tabular-nums text-[#334155]">
                {formatClock(audioCurrentTime)} / {formatClock(audioDuration)}
              </span>
              <input
                type="range"
                min={0}
                max={audioDuration > 0 ? audioDuration : 0}
                step={0.05}
                value={audioDuration > 0 ? Math.min(audioCurrentTime, audioDuration) : 0}
                onChange={handleAudioSeek}
                disabled={!hasAudio || audioDuration <= 0}
                className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-[#e1e6f0] accent-[#5568df] disabled:cursor-not-allowed disabled:opacity-50"
                style={{
                  background: `linear-gradient(to right, #5568df ${audioProgressPercent}%, #e1e6f0 ${audioProgressPercent}%)`,
                }}
              />
              <Volume2 className="hidden h-5 w-5 text-[#334155] sm:block" />
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setShowAudioMenu((value) => !value)}
                  disabled={!hasAudio}
                  aria-label="Mở tùy chọn audio"
                  aria-expanded={showAudioMenu}
                  className="grid h-9 w-9 place-items-center rounded-full text-[#64748b] transition hover:bg-[#f1f4fa] hover:text-[#334155] disabled:cursor-not-allowed disabled:opacity-35"
                >
                  <MoreVertical className="h-5 w-5" />
                </button>
                {showAudioMenu && hasAudio ? (
                  <div className="absolute right-0 top-11 z-20 min-w-48 rounded-2xl border border-[#dfe6f1] bg-white p-1.5 shadow-[0_18px_42px_rgba(15,23,42,0.16)]">
                    <a
                      href={audioUrl}
                      download={downloadName}
                      onClick={() => setShowAudioMenu(false)}
                      className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-black text-[#334155] transition hover:bg-[#f4f6ff] hover:text-[#4659bd]"
                    >
                      <Download className="h-4 w-4" />
                      Tải audio xuống
                    </a>
                  </div>
                ) : null}
              </div>
            </div>

            {!audioUrl ? (
              <p className="mt-3 rounded-2xl border border-dashed border-[#cbd5e1] bg-white/70 px-4 py-3 text-sm font-semibold leading-6 text-[#64748b]">
                Bam &quot;Tao audio bai nay&quot; de sinh file nghe, hoac dung &quot;Trinh duyet am thanh&quot; de doc thu ngay.
              </p>
            ) : null}

            <div className="mt-4 grid gap-3 sm:grid-cols-[auto_minmax(220px,1fr)] sm:items-center">
              <div className="flex flex-wrap items-center gap-2">
                {[0.8, 1, 1.15].map((speed) => (
                  <button
                    key={speed}
                    type="button"
                    onClick={() => setPlaybackRate(speed)}
                    className={`h-8 rounded-full border px-4 text-xs font-black shadow-sm transition ${
                      playbackRate === speed
                        ? "border-[#5b6ee1] bg-[linear-gradient(135deg,#5b6ee1,#7888ff)] text-white"
                        : "border-[#e0e7f3] bg-white text-[#526070] hover:border-[#bec8ff] hover:bg-[#f7f9ff]"
                    }`}
                  >
                    {speed}x
                  </button>
                ))}
              </div>

              <label className="flex min-w-0 items-center gap-3 rounded-2xl border border-[#e0e7f3] bg-white px-3 py-2 shadow-sm">
                <span className="shrink-0 text-[11px] font-black uppercase tracking-[0.12em] text-[#64748b]">
                  Tùy chỉnh
                </span>
                <input
                  type="range"
                  min={0.5}
                  max={2}
                  step={0.05}
                  value={playbackRate}
                  onChange={(event) => setPlaybackRate(Number(event.target.value))}
                  className="h-2 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-[#e1e6f0] accent-[#5568df]"
                  aria-label="Tùy chỉnh tốc độ phát"
                />
                <button
                  type="button"
                  onClick={() => setPlaybackRate(1)}
                  title="Đặt lại tốc độ 1x"
                  className="min-w-14 rounded-xl bg-[#eef1ff] px-2 py-1 text-center text-xs font-black tabular-nums text-[#4659bd] transition hover:bg-[#e1e6ff]"
                >
                  {formatPlaybackRate(playbackRate)}
                </button>
              </label>
            </div>
          </div>

          <div className="mt-4 rounded-[26px] border border-[#e4eaf4] bg-white p-3 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowTranscript((value) => !value)}
                  className={`inline-flex h-9 items-center rounded-xl border px-4 text-xs font-black transition ${
                    showTranscript
                      ? "border-[#cdd6ff] bg-[#f4f6ff] text-[#3554a8]"
                      : "border-[#e0e7f3] bg-white text-[#526070] hover:bg-[#f8fbff]"
                  }`}
                >
                  {showTranscript ? "An script JP" : "Hien script JP"}
                </button>
                {translationLines.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setShowTranslation((value) => !value)}
                    className={`inline-flex h-9 items-center rounded-xl border px-4 text-xs font-black transition ${
                      showTranslation
                        ? "border-[#cdd6ff] bg-[#f4f6ff] text-[#3554a8]"
                        : "border-[#e0e7f3] bg-white text-[#526070] hover:bg-[#f8fbff]"
                    }`}
                  >
                    {showTranslation ? "An ban dich VI" : "Hien ban dich VI"}
                  </button>
                ) : null}
              </div>
              {showTranscript ? (
                <label className="inline-flex items-center gap-2 text-xs font-bold text-[#526070]">
                  <input
                    type="checkbox"
                    checked={followScript}
                    onChange={(event) => setFollowScript(event.target.checked)}
                    className="h-4 w-4 rounded border-[#cbd5e1] accent-[#5568df]"
                  />
                  Tu dong theo dong dang doc
                </label>
              ) : null}
            </div>

            {showTranscript ? (
              <>
                <div className="mt-3 rounded-[20px] border border-[#ffd9b5] bg-[#fff8f1] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="rounded-full bg-[#ffedd9] px-2.5 py-0.5 text-[11px] font-black text-[#e85f00]">
                      Dang phat
                    </span>
                    {activeScriptLine ? (
                      <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#7c2d12]">
                        Dong {activeScriptLine.index + 1}
                      </span>
                    ) : null}
                  </div>
                  <p className="font-[var(--font-jp)] text-[1.22rem] font-bold leading-[2.05] text-[#111827]">
                    {activeScriptLine ? (
                      activeScriptLine.tokens.map((token, tokenIndex) => {
                        const runState = resolveTokenRunState(true, token, tokenIndex, activeTokenIndex);
                        return (
                          <span
                            key={`realtime-${activeScriptLine.index}-${tokenIndex}-${token.text}`}
                            className={
                              runState === "active"
                                ? "rounded-md bg-[#ffd7b0] px-0.5 text-[#ff6b00]"
                                : runState === "passed"
                                  ? "text-[#155e75]"
                                  : ""
                            }
                          >
                            <ScriptTokenText state={runState} token={token} />
                          </span>
                        );
                      })
                    ) : (
                      <span className="text-sm font-semibold text-[#667085]">
                        Bam play de bat dau hieu ung chay chu.
                      </span>
                    )}
                  </p>
                </div>

                <div ref={scriptContainerRef} className="mt-3 max-h-[430px] space-y-2 overflow-y-auto pr-1">
                  {scriptLines.map((line) => {
                    const lineActive = line.index === activeLineIndex;
                    const lineTranslation = translationLines[line.index];
                    return (
                      <div
                        key={`script-line-${line.index}`}
                        ref={(node) => {
                          if (node) {
                            lineRefs.current.set(line.index, node);
                          } else {
                            lineRefs.current.delete(line.index);
                          }
                        }}
                        className={`rounded-[18px] border px-3 py-2.5 shadow-sm transition ${
                          lineActive
                            ? "border-[#ffc891] bg-[#fff7ef] ring-2 ring-[#ffd7b0]"
                            : speakerTheme(line.speakerRole)
                        }`}
                      >
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-[11px] font-black ${speakerBadgeTheme(
                                line.speakerRole
                              )}`}
                            >
                              {line.speakerLabel || "Noi dung"}
                            </span>
                            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#64748b]">
                              Dong {line.index + 1}
                            </span>
                          </div>
                          {lineActive ? <span className="text-[11px] font-black text-[#ff6b00]">Dang phat</span> : null}
                        </div>
                        <p className="font-[var(--font-jp)] text-[1.2rem] font-semibold leading-[2.05] text-[#111827]">
                          {line.tokens.map((token, tokenIndex) => {
                            const runState = resolveTokenRunState(lineActive, token, tokenIndex, activeTokenIndex);
                            return (
                              <span
                                key={`script-${line.index}-${tokenIndex}-${token.text}`}
                                className={
                                  runState === "active" && !token.kanji
                                    ? "rounded-md bg-[#ffd7b0] px-0.5 text-[#ff6b00]"
                                    : runState === "passed"
                                      ? "text-[#155e75]"
                                      : ""
                                }
                              >
                                <ScriptTokenText state={runState} token={token} />
                              </span>
                            );
                          })}
                        </p>
                        {showTranslation && lineTranslation ? (
                          <p className="mt-1 rounded-xl bg-white/65 px-3 py-2 text-sm font-semibold leading-6 text-[#475569]">
                            {lineTranslation}
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="mt-3 rounded-2xl border border-dashed border-[#d8e2ee] bg-[#f8fbff] px-4 py-4 text-sm font-semibold leading-7 text-[#667085]">
                Script se hien theo tung dong, co phan vai va to mau realtime theo audio.
              </p>
            )}

            {showTranslation && translationLines.length > 0 && !showTranscript ? (
              <div className="mt-3 rounded-2xl border border-[#d5def0] bg-[#f7faff] p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="rounded-full bg-[#e8efff] px-2.5 py-0.5 text-xs font-black text-[#3554a8]">
                    Ban dich tieng Viet
                  </span>
                  <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#64748b]">
                    {translationLines.length} dong
                  </span>
                </div>
                <div className="max-h-[220px] space-y-2 overflow-y-auto pr-1">
                  {translationLines.map((line, index) => (
                    <p
                      key={`vi-line-${index}-${line.slice(0, 20)}`}
                      className="rounded-xl border border-[#dbe6ff] bg-white px-3 py-2 text-sm font-semibold leading-7 text-[#25324a]"
                    >
                      <span className="mr-2 text-xs font-black text-[#64748b]">DONG {index + 1}</span>
                      {line}
                    </p>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-3 flex items-center gap-3 rounded-full border border-[#edf1f6] bg-[#fbfdff] px-3 py-2">
              <span className="text-xs font-black text-[#64748b]">{formatClock(audioCurrentTime)}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#e4e8f2]">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,#5568df,#ff9d4d)] transition-[width]"
                  style={{ width: `${audioProgressPercent}%` }}
                />
              </div>
              <span className="text-xs font-black text-[#64748b]">{formatClock(audioDuration)}</span>
            </div>
          </div>
        </article>

        <article className="rounded-[28px] border border-[#d8e2ee] bg-white p-5 shadow-[0_18px_42px_rgba(18,60,105,0.08)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#ff6b00]">Quiz nghe hieu</p>
              <h3 className="mt-1 text-2xl font-black text-[#111827]">Cau hoi sau bai nghe</h3>
            </div>
            <button
              type="button"
              onClick={resetQuiz}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-[#d8e2ee] bg-[#f8fcff] px-4 text-sm font-black text-[#123c69] transition hover:bg-[#eef7fb]"
            >
              <RotateCcw className="h-4 w-4" />
              Lam lai
            </button>
          </div>

          <div className="mt-4 grid gap-2 rounded-2xl border border-[#edf1f6] bg-[#fbfdff] p-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={enterStudyMode}
              className={`rounded-xl px-4 py-3 text-sm font-black transition ${
                practiceMode === "study"
                  ? "bg-[#123c69] text-white shadow-[0_10px_24px_rgba(18,60,105,0.18)]"
                  : "bg-white text-[#526070] hover:bg-[#f3f7fb]"
              }`}
            >
              Luyen co chu
            </button>
            <button
              type="button"
              onClick={enterJlptMode}
              className={`rounded-xl px-4 py-3 text-sm font-black transition ${
                practiceMode === "jlpt"
                  ? "bg-[#ff6b00] text-white shadow-[0_10px_24px_rgba(255,107,0,0.2)]"
                  : "bg-white text-[#526070] hover:bg-[#fff7ed]"
              }`}
            >
              Thi JLPT: nghe cau hoi + A/B/C/D
            </button>
          </div>

          {item.questions.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-dashed border-[#d8e2ee] bg-[#f8fcff] px-4 py-4 text-sm font-semibold text-[#667085]">
              Bai nay chua co cau hoi. Hay import JSON co truong questions.
            </p>
          ) : practiceMode === "jlpt" ? (
            <div className="mt-4 space-y-4">
              <div className="rounded-[24px] border border-[#ffd3aa] bg-[linear-gradient(135deg,#fff7ed,#fff_46%,#eef7ff)] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-[#b45309]">
                      De thi nghe
                    </p>
                    <h4 className="mt-1 text-xl font-black text-[#111827]">Chi nghe audio, chon A/B/C/D</h4>
                    <p className="mt-2 text-sm font-semibold leading-6 text-[#667085]">
                      {item.examMode?.uiInstructionVi ||
                        "Audio se doc bai nghe, sau do doc tung cau hoi va cac lua chon. Truoc khi kiem tra, app chi hien nut A/B/C/D de tranh nhin dap an."}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={generateExamAudio}
                    disabled={examState === "generating"}
                    className="inline-flex h-11 items-center gap-2 rounded-full bg-[#ff6b00] px-4 text-sm font-black text-white transition hover:bg-[#e85f00] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {examState === "generating" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Volume2 className="h-4 w-4" />
                    )}
                    {examState === "generating" ? "Dang tao audio thi..." : "Tao audio thi JLPT"}
                  </button>
                </div>

                <audio
                  ref={examAudioRef}
                  src={examAudioUrl || undefined}
                  controls
                  preload="metadata"
                  className="mt-4 w-full"
                  onPlay={handleExamAudioPlay}
                />

                {!examAudioUrl ? (
                  <p className="mt-2 text-xs font-bold text-[#8a5a2c]">
                    Bam tao audio thi de nghe de theo format: hoi thoai → cau hoi → A/B/C/D.
                  </p>
                ) : null}
                {examState === "ready" ? (
                  <p className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">
                    Da tao xong audio thi bang{" "}
                    {examAudioProvider === "gemini"
                      ? "Gemini bieu cam"
                      : examAudioProvider === "edge-fallback"
                        ? "Edge TTS du phong"
                        : "Edge TTS"}
                    .
                  </p>
                ) : null}
                {examState === "error" ? (
                  <p className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">
                    {examError}
                  </p>
                ) : null}
              </div>

              {item.questions.map((question, index) => {
                const optionEntries = questionOptionEntries(question, item.examMode);
                return (
                  <section key={question.id} className="rounded-2xl border border-[#edf1f6] bg-[#fbfdff] p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-[#123c69] px-3 py-1 text-xs font-black text-white">
                          Cau {index + 1}
                        </span>
                        {question.questionType ? (
                          <span className="rounded-full bg-[#fff4e5] px-2.5 py-1 text-xs font-black text-[#b75a07]">
                            {question.questionType}
                          </span>
                        ) : null}
                      </div>
                      <span className="text-xs font-black uppercase tracking-[0.14em] text-[#64748b]">
                        Nghe audio de biet noi dung
                      </span>
                    </div>

                    {optionEntries.length > 0 ? (
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {optionEntries.map((entry) => {
                          const selected = answers[question.id] === entry.value;
                          const isCorrect = checked && isQuestionCorrect(question, entry.value);
                          const isWrong = checked && selected && !isQuestionCorrect(question, entry.value);
                          return (
                            <button
                              key={`${question.id}-${entry.label}-${entry.value}`}
                              type="button"
                              onClick={() => {
                                setAnswers((current) => ({ ...current, [question.id]: entry.value }));
                                setChecked(false);
                              }}
                              className={`min-h-20 rounded-2xl border text-2xl font-black transition ${
                                isCorrect
                                  ? "border-[#8ce4bd] bg-[#ecfff5] text-[#087443]"
                                  : isWrong
                                    ? "border-[#fecdd3] bg-[#fff1f2] text-[#be123c]"
                                    : selected
                                      ? "border-[#ff6b00] bg-[#fff3e8] text-[#b45309]"
                                      : "border-[#d8e2ee] bg-white text-[#123c69] hover:bg-[#f8fcff]"
                              }`}
                            >
                              {entry.label}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="mt-3 text-sm font-semibold text-[#667085]">Cau nay khong co options hop le.</p>
                    )}

                    {checked ? (
                      <div className="mt-4 space-y-2 text-sm font-semibold leading-7 text-[#526070]">
                        <p>Dap an: {questionCorrectAnswerLabel(question, item.examMode)}</p>
                        {optionEntries.length > 0 ? (
                          <div className="grid gap-2 sm:grid-cols-2">
                            {optionEntries.map((entry) => (
                              <p
                                key={`review-${question.id}-${entry.label}`}
                                className={`rounded-xl border px-3 py-2 ${
                                  isQuestionCorrect(question, entry.value)
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                    : "border-[#d8e2ee] bg-white text-[#526070]"
                                }`}
                              >
                                <span className="mr-2 font-black">{entry.label}.</span>
                                <span className="font-[var(--font-jp)]">{entry.value}</span>
                              </p>
                            ))}
                          </div>
                        ) : null}
                        {question.explanation ? (
                          <p>
                            <span className="font-black text-[#0f5132]">Giai thich:</span> {question.explanation}
                          </p>
                        ) : null}
                        {question.explanationTraps ? (
                          <p>
                            <span className="font-black text-[#8a3e0d]">Bay sai de nham:</span> {question.explanationTraps}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </section>
                );
              })}
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              {item.questions.map((question, index) => {
                const options = questionOptions(question);
                return (
                  <section key={question.id} className="rounded-2xl border border-[#edf1f6] bg-[#fbfdff] p-4">
                    {(typeof question.level === "number" || question.questionType) ? (
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        {typeof question.level === "number" ? (
                          <span className="rounded-full bg-[#eef3ff] px-2.5 py-1 text-xs font-black text-[#3554a8]">
                            Level {question.level}
                          </span>
                        ) : null}
                        {question.questionType ? (
                          <span className="rounded-full bg-[#fff4e5] px-2.5 py-1 text-xs font-black text-[#b75a07]">
                            {question.questionType}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                    <p className="font-[var(--font-jp)] text-lg font-black leading-8 text-[#111827]">
                      Cau {index + 1}. {question.prompt}
                    </p>
                    {options.length > 0 ? (
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {options.map((option) => {
                          const selected = answers[question.id] === option;
                          const isCorrect = checked && isQuestionCorrect(question, option);
                          const isWrong = checked && selected && !isQuestionCorrect(question, option);
                          return (
                            <button
                              key={`${question.id}-${option}`}
                              type="button"
                              onClick={() => {
                                setAnswers((current) => ({ ...current, [question.id]: option }));
                                setChecked(false);
                              }}
                              className={`rounded-2xl border px-4 py-3 text-left text-sm font-black transition ${
                                isCorrect
                                  ? "border-[#8ce4bd] bg-[#ecfff5] text-[#087443]"
                                  : isWrong
                                    ? "border-[#fecdd3] bg-[#fff1f2] text-[#be123c]"
                                    : selected
                                      ? "border-[#123c69] bg-[#eef6ff] text-[#123c69]"
                                      : "border-[#d8e2ee] bg-white text-[#172033] hover:bg-[#f8fcff]"
                              }`}
                            >
                              {option}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="mt-3 text-sm font-semibold text-[#667085]">Cau nay khong co options hop le.</p>
                    )}
                    {checked ? (
                      <div className="mt-3 text-sm font-semibold leading-7 text-[#526070]">
                        <p>Dap an: {questionCorrectAnswerLabel(question, item.examMode)}</p>
                        {question.explanation ? (
                          <p>
                            <span className="font-black text-[#0f5132]">Giai thich:</span> {question.explanation}
                          </p>
                        ) : null}
                        {question.explanationTraps ? (
                          <p>
                            <span className="font-black text-[#8a3e0d]">Bay sai de nham:</span> {question.explanationTraps}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </section>
                );
              })}
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-bold text-[#667085]">
              {checked
                ? `Ket qua: ${correctCount}/${item.questions.length}`
                : practiceMode === "jlpt"
                  ? "Nghe audio thi, chon A/B/C/D roi bam kiem tra."
                  : "Chon dap an roi bam kiem tra."}
            </p>
            <button
              type="button"
              onClick={() => setChecked(true)}
              disabled={item.questions.length === 0 || Object.keys(answers).length < item.questions.length}
              className="rounded-full bg-[#ff6b00] px-6 py-3 text-sm font-black text-white transition hover:bg-[#e85f00] disabled:cursor-not-allowed disabled:opacity-45"
            >
              Kiem tra
            </button>
          </div>
        </article>
      </section>
    </div>
  );
}

