"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AUDIO_RATE_KEY, AUDIO_VOICE_KEY } from "@/app/components/audio-settings-client";
import { splitJapaneseSpeechText } from "@/lib/japanese-speech";

type Props = {
  text: string;
  className?: string;
  title?: string;
  showStopButton?: boolean;
  profile?: "default" | "jlpt-listening";
  showProgressBar?: boolean;
};

type PlaybackPlan = {
  totalMs: number;
  cumulativeMs: number[];
  rate: number;
};

const preferredVoiceKeywords = [
  "nanami natural",
  "haruka natural",
  "haruka online",
  "nanami online",
  "otoya online",
  "sayaka",
  "aoi",
  "kyoko",
  "natural",
  "microsoft",
  "google",
  "japanese",
  "nihongo",
  "nanami",
  "haruka",
];
const SPEAK_DELAY_MS = 70;
const CLICK_GUARD_MS = 280;
const LONG_TEXT_RATE = 0.88;
const JLPT_LONG_TEXT_RATE = 0.82;
const DEFAULT_PAUSE_MS = 40;
const JLPT_PAUSE_MS = 120;
const CHARS_PER_SECOND_AT_RATE_1 = 7.4;

function playIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-4 w-4">
      <path d="M8 6v12l10-6-10-6Z" />
    </svg>
  );
}

function stopIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-4 w-4">
      <rect x="7" y="7" width="10" height="10" rx="1.6" />
    </svg>
  );
}

function speakerIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-4 w-4"
    >
      <path d="M11 5 6 9H3v6h3l5 4V5Z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 6a8.5 8.5 0 0 1 0 12" />
    </svg>
  );
}

function pickJapaneseVoice(voices: SpeechSynthesisVoice[], preferredName: string): SpeechSynthesisVoice | null {
  const jpVoices = voices.filter((voice) => voice.lang.toLowerCase().startsWith("ja"));
  if (jpVoices.length === 0) {
    return null;
  }

  if (preferredName) {
    const selected = jpVoices.find((voice) => voice.name === preferredName);
    if (selected) {
      return selected;
    }
  }

  const preferred = jpVoices.find((voice) => {
    const lowerName = voice.name.toLowerCase();
    return preferredVoiceKeywords.some((keyword) => lowerName.includes(keyword));
  });

  return preferred ?? jpVoices[0] ?? null;
}

function pickJlptVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const jpVoices = voices.filter((voice) => voice.lang.toLowerCase().startsWith("ja"));
  if (jpVoices.length === 0) {
    return null;
  }

  const jlptVoiceKeywords = [
    "nanami",
    "haruka",
    "natural",
    "online",
    "neural",
    "sayaka",
    "aoi",
    "kyoko",
    "microsoft",
  ];

  const preferred = jpVoices.find((voice) => {
    const lower = voice.name.toLowerCase();
    return jlptVoiceKeywords.some((keyword) => lower.includes(keyword));
  });
  return preferred ?? jpVoices[0] ?? null;
}

function estimateChunkDurationMs(text: string, rate: number): number {
  const compactLength = text.replace(/\s+/g, "").length;
  const raw = (compactLength / Math.max(0.55, CHARS_PER_SECOND_AT_RATE_1 * rate)) * 1000;
  return Math.max(650, Math.round(raw));
}

function buildPlaybackPlan(chunks: string[], rate: number, pauseMs: number): PlaybackPlan {
  const cumulativeMs: number[] = [];
  let elapsed = 0;

  for (let i = 0; i < chunks.length; i += 1) {
    cumulativeMs.push(elapsed);
    const chunkMs = estimateChunkDurationMs(chunks[i] ?? "", rate);
    elapsed += chunkMs;
    if (i < chunks.length - 1) {
      elapsed += Math.max(0, pauseMs);
    }
  }

  return {
    totalMs: Math.max(1000, elapsed),
    cumulativeMs,
    rate,
  };
}

function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function chunkIndexByProgress(plan: PlaybackPlan, percent: number, chunkCount: number): number {
  if (chunkCount <= 1 || plan.totalMs <= 0) {
    return 0;
  }
  const targetMs = Math.round((Math.min(100, Math.max(0, percent)) / 100) * plan.totalMs);
  for (let i = chunkCount - 1; i >= 0; i -= 1) {
    if ((plan.cumulativeMs[i] ?? 0) <= targetMs) {
      return i;
    }
  }
  return 0;
}

export function SpeakJpButton({
  text,
  className = "",
  title = "Phat am",
  showStopButton = false,
  profile = "default",
  showProgressBar = false,
}: Props) {
  const chunks = useMemo(() => splitJapaneseSpeechText(text), [text]);
  const value = chunks.join("\n").trim();
  const lastSpeakRef = useRef<{ text: string; at: number }>({ text: "", at: 0 });
  const speakTimerRef = useRef<number | null>(null);
  const progressTimerRef = useRef<number | null>(null);
  const speakingRef = useRef(false);
  const sessionRef = useRef(0);
  const planRef = useRef<PlaybackPlan | null>(null);
  const currentChunkRef = useRef(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [progress, setProgress] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);

  const pitch = profile === "jlpt-listening" ? 0.92 : 1;
  const pauseMs = profile === "jlpt-listening" ? JLPT_PAUSE_MS : DEFAULT_PAUSE_MS;
  const longTextRateCap = profile === "jlpt-listening" ? JLPT_LONG_TEXT_RATE : LONG_TEXT_RATE;

  const clearProgressTimer = useCallback(() => {
    if (typeof window !== "undefined" && progressTimerRef.current !== null) {
      window.clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  }, []);

  const stopSpeaking = useCallback(
    (resetTimeline = true) => {
      sessionRef.current += 1;
      speakingRef.current = false;
      setIsSpeaking(false);
      clearProgressTimer();

      if (typeof window !== "undefined" && speakTimerRef.current !== null) {
        window.clearTimeout(speakTimerRef.current);
        speakTimerRef.current = null;
      }

      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }

      if (resetTimeline) {
        currentChunkRef.current = 0;
        setElapsedMs(0);
        setProgress(0);
      }
    },
    [clearProgressTimer]
  );

  const startSpeakingFrom = useCallback(
    (startChunk: number) => {
      if (!value || typeof window === "undefined" || !("speechSynthesis" in window)) {
        return;
      }

      const synth = window.speechSynthesis;
      const savedRate = Number(window.localStorage.getItem(AUDIO_RATE_KEY) ?? "0.95");
      const storedRate = Number.isFinite(savedRate) ? Math.min(1.25, Math.max(0.75, savedRate)) : 0.95;
      const rate = value.length > 80 ? Math.min(storedRate, longTextRateCap) : storedRate;
      const preferredVoiceName = window.localStorage.getItem(AUDIO_VOICE_KEY) ?? "";
      const playbackPlan = buildPlaybackPlan(chunks, rate, pauseMs);
      planRef.current = playbackPlan;
      setDurationMs(playbackPlan.totalMs);

      const normalizedChunk = Math.min(Math.max(0, startChunk), Math.max(0, chunks.length - 1));
      currentChunkRef.current = normalizedChunk;
      const baseElapsed = playbackPlan.cumulativeMs[normalizedChunk] ?? 0;
      setElapsedMs(baseElapsed);
      setProgress(Math.round((baseElapsed / Math.max(1, playbackPlan.totalMs)) * 100));

      stopSpeaking(false);

      const currentSession = sessionRef.current + 1;
      sessionRef.current = currentSession;
      speakingRef.current = true;
      setIsSpeaking(true);
      const sessionStartAt = Date.now() - baseElapsed;

      progressTimerRef.current = window.setInterval(() => {
        if (!speakingRef.current || sessionRef.current !== currentSession) {
          return;
        }
        const elapsed = Math.min(playbackPlan.totalMs, Date.now() - sessionStartAt);
        setElapsedMs(elapsed);
        setProgress(Math.min(99, Math.round((elapsed / Math.max(1, playbackPlan.totalMs)) * 100)));
      }, 180);

      speakTimerRef.current = window.setTimeout(() => {
        const selectedVoice =
          profile === "jlpt-listening"
            ? pickJlptVoice(synth.getVoices())
            : pickJapaneseVoice(synth.getVoices(), preferredVoiceName);

        const finishSession = () => {
          speakingRef.current = false;
          setIsSpeaking(false);
          clearProgressTimer();
          setElapsedMs(playbackPlan.totalMs);
          setProgress(100);
        };

        const speakNext = () => {
          if (!speakingRef.current || sessionRef.current !== currentSession) {
            return;
          }

          const idx = currentChunkRef.current;
          const nextText = chunks[idx];
          if (!nextText) {
            finishSession();
            return;
          }

          const utterance = new SpeechSynthesisUtterance(nextText);
          utterance.lang = "ja-JP";
          utterance.rate = rate;
          utterance.pitch = pitch;
          if (selectedVoice) {
            utterance.voice = selectedVoice;
          }

          utterance.onend = () => {
            if (!speakingRef.current || sessionRef.current !== currentSession) {
              return;
            }
            currentChunkRef.current = idx + 1;
            if (currentChunkRef.current >= chunks.length) {
              finishSession();
              return;
            }
            if (pauseMs <= 0) {
              speakNext();
              return;
            }
            window.setTimeout(() => {
              speakNext();
            }, pauseMs);
          };

          utterance.onerror = () => {
            speakingRef.current = false;
            setIsSpeaking(false);
            clearProgressTimer();
          };

          synth.speak(utterance);
        };

        speakNext();
        speakTimerRef.current = null;
      }, SPEAK_DELAY_MS);
    },
    [chunks, clearProgressTimer, longTextRateCap, pauseMs, pitch, profile, stopSpeaking, value]
  );

  useEffect(() => {
    if (typeof window === "undefined" || chunks.length === 0) {
      setDurationMs(0);
      setElapsedMs(0);
      setProgress(0);
      currentChunkRef.current = 0;
      return;
    }
    const savedRate = Number(window.localStorage.getItem(AUDIO_RATE_KEY) ?? "0.95");
    const storedRate = Number.isFinite(savedRate) ? Math.min(1.25, Math.max(0.75, savedRate)) : 0.95;
    const rate = value.length > 80 ? Math.min(storedRate, longTextRateCap) : storedRate;
    const plan = buildPlaybackPlan(chunks, rate, pauseMs);
    planRef.current = plan;
    setDurationMs(plan.totalMs);
    setElapsedMs(0);
    setProgress(0);
    currentChunkRef.current = 0;
  }, [chunks, longTextRateCap, pauseMs, value.length]);

  useEffect(() => {
    return () => {
      stopSpeaking(true);
      clearProgressTimer();
    };
  }, [clearProgressTimer, stopSpeaking]);

  const handleSpeak = useCallback(() => {
    if (!value || typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }

    const now = Date.now();
    if (lastSpeakRef.current.text === value && now - lastSpeakRef.current.at < CLICK_GUARD_MS) {
      return;
    }
    lastSpeakRef.current = { text: value, at: now };
    startSpeakingFrom(currentChunkRef.current);
  }, [startSpeakingFrom, value]);

  const handleSeek = useCallback(
    (nextProgress: number) => {
      if (!value || chunks.length === 0) {
        return;
      }
      const plan = planRef.current ?? buildPlaybackPlan(chunks, 0.95, pauseMs);
      planRef.current = plan;
      const targetProgress = Math.min(100, Math.max(0, Math.round(nextProgress)));
      const targetChunk = chunkIndexByProgress(plan, targetProgress, chunks.length);
      const targetElapsed = Math.round((targetProgress / 100) * plan.totalMs);

      currentChunkRef.current = targetChunk;
      setProgress(targetProgress);
      setElapsedMs(targetElapsed);

      if (isSpeaking) {
        startSpeakingFrom(targetChunk);
      }
    },
    [chunks, isSpeaking, pauseMs, startSpeakingFrom, value]
  );

  if (showStopButton) {
    return (
      <div className={`inline-flex min-w-[220px] flex-col items-end gap-2 ${className}`}>
        <div className="inline-flex items-center gap-2">
          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#cfe0f2] bg-white text-[#123c69] transition hover:bg-[#edf4ff] disabled:cursor-not-allowed disabled:opacity-50"
            title={title}
            aria-label={title}
            onClick={handleSpeak}
            disabled={!value || isSpeaking}
          >
            {playIcon()}
          </button>
          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-600 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-45"
            title="Dung phat am"
            aria-label="Dung phat am"
            onClick={() => stopSpeaking(true)}
            disabled={!isSpeaking}
          >
            {stopIcon()}
          </button>
        </div>
        {showProgressBar ? (
          <div className="w-full space-y-1">
            <div className="flex items-center justify-between text-[11px] font-bold text-[#7a8ca8]">
              <span>{formatTime(elapsedMs)}</span>
              <span>{formatTime(durationMs)}</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={progress}
              onChange={(event) => {
                handleSeek(Number(event.target.value));
              }}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[#ffd3de] accent-[#ff2e63]"
              aria-label="Tua phat am"
            />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-white text-sm text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      title={title}
      aria-label={title}
      onClick={handleSpeak}
      disabled={!value}
    >
      {speakerIcon()}
    </button>
  );
}
