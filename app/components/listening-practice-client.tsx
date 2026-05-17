"use client";

import { Headphones, Loader2, RotateCcw, Sparkles, Volume2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cleanJapaneseSpeechText } from "@/lib/japanese-speech";
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
};
type TimelineEntry = {
  lineIndex: number;
  start: number;
  end: number;
  duration: number;
};
type TokenRunState = "idle" | "passed" | "active";

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
const VOICE_VALUE_SET = new Set(VOICE_OPTIONS.map((option) => option.value));

const TOKEN_PATTERN =
  /[\u3400-\u9fff\u3005\u3006\u30f5\u30f6]+[\uff08(][\u3041-\u3096\u30a1-\u30fa\u30fc\u30fb\s]+[\uff09)]|[\u3041-\u3096\u30a1-\u30fa\u30fc]+|[\u30a1-\u30fa\u30fc]+|[\u3400-\u9fff\u3005\u3006\u30f5\u30f6]+|[A-Za-z0-9]+|[^\s]/gu;
const SPEAKABLE_TOKEN_PATTERN = /[\u3040-\u30ff\u3400-\u9fffA-Za-z0-9]/u;
const RUBY_TOKEN_PATTERN =
  /^([\u3400-\u9fff\u3005\u3006\u30f5\u30f6]+)[\uff08(]\s*([\u3041-\u3096\u30a1-\u30fa\u30fc\u30fb\s]+)\s*[\uff09)]$/u;
const INLINE_RUBY_PATTERN =
  /([\u3400-\u9fff\u3005\u3006\u30f5\u30f6]+)[\uff08(]\s*([\u3041-\u3096\u30a1-\u30fa\u30fc\u30fb\s]+)\s*[\uff09)]/gu;

const FURI_PART = "(?:[\\uff08(][^\\uff09)]+[\\uff09)])?";
const MALE_PLAIN_PREFIX = /^(?:男の人|男|男性|おとこのひと)\s*[：:]\s*/u;
const FEMALE_PLAIN_PREFIX = /^(?:女の人|女|女性|おんなのひと)\s*[：:]\s*/u;
const MALE_DISPLAY_PREFIX = new RegExp(
  `^(?:男${FURI_PART}の人${FURI_PART}|男|男性|おとこのひと)\\s*[：:]\\s*`,
  "u"
);
const FEMALE_DISPLAY_PREFIX = new RegExp(
  `^(?:女${FURI_PART}の人${FURI_PART}|女|女性|おんなのひと)\\s*[：:]\\s*`,
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

function resolveVoiceValue(value: string | undefined, fallback: string): string {
  return value && VOICE_VALUE_SET.has(value) ? value : fallback;
}

function stripInlineRuby(value: string): string {
  return value.replace(INLINE_RUBY_PATTERN, "$1");
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

function removeSpeakerPrefix(text: string, role: SpeakerRole, isDisplay: boolean): string {
  if (role === "male") {
    return text.replace(isDisplay ? MALE_DISPLAY_PREFIX : MALE_PLAIN_PREFIX, "").trim();
  }
  if (role === "female") {
    return text.replace(isDisplay ? FEMALE_DISPLAY_PREFIX : FEMALE_PLAIN_PREFIX, "").trim();
  }
  return text.trim();
}

function buildScriptLines(displayScript: string, rawScript?: string): ScriptLine[] {
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

function questionAnswerLabel(value: string | boolean): string {
  if (typeof value === "boolean") {
    return value ? "Dung" : "Sai";
  }
  return value;
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

export function ListeningPracticeClient({ item }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lineRefs = useRef(new Map<number, HTMLDivElement>());
  const tickerRef = useRef<number | null>(null);
  const activeLineIndexRef = useRef(-1);
  const scriptLinesRef = useRef<ScriptLine[]>([]);
  const browserSessionRef = useRef(0);
  const browserTimerRef = useRef<number | null>(null);
  const browserStartedAtRef = useRef(0);
  const generatedUrlRef = useRef<string | null>(null);

  const [voice, setVoice] = useState(resolveVoiceValue(item.tts.voice, DEFAULT_MAIN_VOICE));
  const [maleVoice, setMaleVoice] = useState(DEFAULT_MALE_VOICE);
  const [femaleVoice, setFemaleVoice] = useState(DEFAULT_FEMALE_VOICE);
  const [rate, setRate] = useState(item.tts.rate || "-5%");
  const [pitch, setPitch] = useState(item.tts.pitch || "+0Hz");
  const [rolePlayback, setRolePlayback] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [audioUrl, setAudioUrl] = useState("");
  const [state, setState] = useState<GenerateState>("idle");
  const [error, setError] = useState("");
  const [showTranscript, setShowTranscript] = useState(true);
  const [showTranslation, setShowTranslation] = useState(true);
  const [followScript, setFollowScript] = useState(true);
  const [activeLineIndex, setActiveLineIndex] = useState(-1);
  const [activeTokenIndex, setActiveTokenIndex] = useState(-1);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState(false);

  const scriptLines = useMemo(() => buildScriptLines(item.script, item.scriptRaw), [item.script, item.scriptRaw]);
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
      return {
        text: line.speechText,
        voice: segmentVoice,
        rate,
        pitch,
      };
    });
    return {
      cleanedText,
      segments,
    };
  }, [scriptLines, voice, maleVoice, femaleVoice, rolePlayback, rate, pitch]);

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

  const stopBrowserSpeech = useCallback(
    (resetHighlight = false) => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
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
    if (activeLineIndexRef.current < 0 && scriptLinesRef.current.length > 0) {
      const firstLine = scriptLinesRef.current[0];
      setActiveLineIndex(firstLine.index);
      setActiveTokenIndex(tokenIndexFromCharIndex(firstLine, 0));
    }
    syncFromAudioElement();
    startTicker();
  }, [startTicker, stopBrowserSpeech, syncFromAudioElement]);

  const handleAudioPause = useCallback(() => {
    clearTicker();
    syncFromAudioElement();
  }, [clearTicker, syncFromAudioElement]);

  const handleAudioTimeUpdate = useCallback(() => {
    syncFromAudioElement();
  }, [syncFromAudioElement]);

  const handleAudioEnded = useCallback(() => {
    const audio = audioRef.current;
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
    setVoice(resolveVoiceValue(item.tts.voice, DEFAULT_MAIN_VOICE));
    setMaleVoice(DEFAULT_MALE_VOICE);
    setFemaleVoice(DEFAULT_FEMALE_VOICE);
    setRate(item.tts.rate || "-5%");
    setPitch(item.tts.pitch || "+0Hz");
    setRolePlayback(true);
    setAudioUrl("");
    setError("");
    setState("idle");
    setShowTranscript(true);
    setShowTranslation(true);
    setFollowScript(true);
    setActiveLineIndex(-1);
    setActiveTokenIndex(-1);
    setAudioCurrentTime(0);
    setAudioDuration(0);
    setAnswers({});
    setChecked(false);
    clearTicker();
    stopBrowserSpeech();
    revokeGeneratedAudioUrl();
  }, [clearTicker, item.id, item.tts.pitch, item.tts.rate, item.tts.voice, revokeGeneratedAudioUrl, stopBrowserSpeech]);

  useEffect(() => {
    return () => {
      clearTicker();
      stopBrowserSpeech();
      revokeGeneratedAudioUrl();
    };
  }, [clearTicker, revokeGeneratedAudioUrl, stopBrowserSpeech]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    audio.playbackRate = playbackRate;
  }, [audioUrl, playbackRate]);

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
    if (!followScript || activeLineIndex < 0) {
      return;
    }
    lineRefs.current.get(activeLineIndex)?.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "nearest",
    });
  }, [activeLineIndex, followScript]);

  const correctCount = useMemo(() => {
    return item.questions.filter((question) => {
      const current = answers[question.id];
      return isQuestionCorrect(question, current);
    }).length;
  }, [answers, item.questions]);

  const generateAudio = async () => {
    setState("generating");
    setError("");
    stopBrowserSpeech(true);
    try {
      const useSegments = hasDialogueMarkers && rolePlayback;
      const response = await fetch("/api/listening-tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: scriptPlan.cleanedText,
          voice,
          rate,
          pitch,
          segments: useSegments ? scriptPlan.segments : undefined,
          allowFallbackDemo: false,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string; hint?: string };
        throw new Error([payload.error, payload.hint].filter(Boolean).join(" "));
      }

      const blob = await response.blob();
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
        setAudioCurrentTime(estimatedDuration);
        setActiveLineIndex(-1);
        setActiveTokenIndex(-1);
        return;
      }

      setActiveLineIndex(line.index);
      setActiveTokenIndex(tokenIndexFromCharIndex(line, 0));

      const utterance = new SpeechSynthesisUtterance(line.speechText);
      utterance.lang = "ja-JP";
      utterance.rate = playbackRate;
      utterance.pitch = 1;

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
      };

      synth.speak(utterance);
    };

    speakLine(0);
  };

  const resetQuiz = () => {
    setAnswers({});
    setChecked(false);
  };

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
            </div>

            {hasDialogueMarkers ? (
              <label className="mt-3 flex items-center gap-2 text-sm font-bold text-white/85">
                <input
                  type="checkbox"
                  checked={rolePlayback}
                  onChange={(event) => setRolePlayback(event.target.checked)}
                  className="h-4 w-4 rounded border-white/30 bg-transparent"
                />
                Bat phan vai nam/nu theo dong hoi thoai
              </label>
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
                Da tao xong audio.
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
        <article className="rounded-[28px] border border-[#d8e2ee] bg-white p-5 shadow-[0_18px_42px_rgba(18,60,105,0.08)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#22a6a1]">Audio</p>
              <h3 className="mt-1 text-2xl font-black text-[#111827]">Nghe va lap lai</h3>
            </div>
            <button
              type="button"
              onClick={speakWithBrowser}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-[#d8e2ee] bg-[#f8fcff] px-4 text-sm font-black text-[#123c69] transition hover:bg-[#eef7fb]"
            >
              <Volume2 className="h-4 w-4" />
              Fallback browser
            </button>
          </div>

          <audio
            ref={audioRef}
            src={audioUrl || undefined}
            controls
            preload="metadata"
            className="mt-5 w-full"
            onLoadedMetadata={handleAudioLoadedMetadata}
            onPlay={handleAudioPlay}
            onPause={handleAudioPause}
            onTimeUpdate={handleAudioTimeUpdate}
            onSeeking={handleAudioTimeUpdate}
            onSeeked={handleAudioTimeUpdate}
            onEnded={handleAudioEnded}
          />

          {!audioUrl ? (
            <p className="mt-3 text-sm font-semibold leading-6 text-[#667085]">
              Bam "Tao audio bai nay" de sinh file nghe tu script.
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {[0.8, 1, 1.15].map((speed) => (
              <button
                key={speed}
                type="button"
                onClick={() => setPlaybackRate(speed)}
                className={`rounded-full border px-4 py-2 text-sm font-black transition ${
                  playbackRate === speed
                    ? "border-[#123c69] bg-[#123c69] text-white"
                    : "border-[#d8e2ee] bg-white text-[#526070] hover:bg-[#f8fcff]"
                }`}
              >
                {speed}x
              </button>
            ))}
          </div>

          <div className="mt-5 rounded-2xl border border-[#edf1f6] bg-[#fbfdff] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowTranscript((value) => !value)}
                  className="inline-flex h-9 items-center rounded-full border border-[#d8e2ee] bg-white px-4 text-sm font-black text-[#123c69] transition hover:bg-[#eef7fb]"
                >
                  {showTranscript ? "An script JP" : "Hien script JP"}
                </button>
                {translationLines.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setShowTranslation((value) => !value)}
                    className="inline-flex h-9 items-center rounded-full border border-[#d8e2ee] bg-white px-4 text-sm font-black text-[#123c69] transition hover:bg-[#eef7fb]"
                  >
                    {showTranslation ? "An ban dich VI" : "Hien ban dich VI"}
                  </button>
                ) : null}
              </div>
              {showTranscript && (
                <label className="inline-flex items-center gap-2 text-xs font-bold text-[#526070]">
                  <input
                    type="checkbox"
                    checked={followScript}
                    onChange={(event) => setFollowScript(event.target.checked)}
                    className="h-4 w-4 rounded border-[#d8e2ee]"
                  />
                  Tu dong theo dong dang doc
                </label>
              )}
            </div>

            {showTranscript ? (
              <>
                <div className="mt-3 rounded-2xl border border-[#ffe2c5] bg-[#fff8f1] px-3 py-2">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="rounded-full bg-[#ffedd9] px-2.5 py-0.5 text-xs font-black text-[#b45309]">
                      Dang noi realtime
                    </span>
                    {activeScriptLine ? (
                      <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#7c2d12]">
                        Dong {activeScriptLine.index + 1}
                      </span>
                    ) : null}
                  </div>
                  <p className="font-[var(--font-jp)] text-[1.35rem] font-bold leading-[2.2] text-[#111827]">
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

                <div className="mt-3 max-h-[460px] space-y-2 overflow-y-auto pr-1">
                {scriptLines.map((line) => {
                  const lineActive = line.index === activeLineIndex;
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
                      className={`rounded-2xl border px-3 py-2 transition ${speakerTheme(line.speakerRole)} ${
                        lineActive ? "ring-2 ring-[#ffb070]" : ""
                      }`}
                    >
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-black ${speakerBadgeTheme(line.speakerRole)}`}>
                            {line.speakerLabel || "Noi dung"}
                          </span>
                          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#64748b]">
                            Dong {line.index + 1}
                          </span>
                        </div>
                        {lineActive ? <span className="text-[11px] font-black text-[#ff6b00]">Dang phat</span> : null}
                      </div>
                      <p className="font-[var(--font-jp)] text-[1.28rem] font-semibold leading-[2.2] text-[#111827]">
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
                    </div>
                  );
                })}
                </div>
              </>
            ) : (
              <p className="mt-3 text-sm font-semibold leading-7 text-[#667085]">
                Script se hien theo tung dong, co phan vai va to mau realtime theo audio.
              </p>
            )}

            {showTranslation && translationLines.length > 0 ? (
              <div className="mt-3 rounded-2xl border border-[#d5def0] bg-[#f7faff] p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="rounded-full bg-[#e8efff] px-2.5 py-0.5 text-xs font-black text-[#3554a8]">
                    Ban dich tieng Viet
                  </span>
                  <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#64748b]">
                    {translationLines.length} dong
                  </span>
                </div>
                {translationLines.length > 1 ? (
                  <div className="max-h-[240px] space-y-2 overflow-y-auto pr-1">
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
                ) : (
                  <p className="text-sm font-semibold leading-7 text-[#25324a]">{translationLines[0]}</p>
                )}
              </div>
            ) : null}

            {audioDuration > 0 ? (
              <p className="mt-3 text-xs font-semibold text-[#667085]">
                {audioDuration > 0
                  ? `Tien do: ${audioCurrentTime.toFixed(1)}s / ${audioDuration.toFixed(1)}s`
                  : "Dang tai metadata audio..."}
              </p>
            ) : null}
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

          {item.questions.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-dashed border-[#d8e2ee] bg-[#f8fcff] px-4 py-4 text-sm font-semibold text-[#667085]">
              Bai nay chua co cau hoi. Hay import JSON co truong questions.
            </p>
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
                        <p>Dap an: {questionAnswerLabel(question.correctAnswer)}</p>
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
