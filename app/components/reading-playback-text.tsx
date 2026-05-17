"use client";

import { Loader2, Pause, Play, Square, Volume2 } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

const TOKEN_PATTERN =
  /[\u3400-\u9fff\u3005\u3006\u30f5\u30f6]+[\uff08(][\u3041-\u3096\u30a1-\u30fa\u30fc\u30fb\s]+[\uff09)]|[\u3041-\u3096\u30a1-\u30fa\u30fc]+|[\u30a1-\u30fa\u30fc]+|[\u3400-\u9fff\u3005\u3006\u30f5\u30f6]+|[A-Za-z0-9]+|[^\s]/gu;
const SPEAKABLE_TOKEN_PATTERN = /[\u3040-\u30ff\u3400-\u9fffA-Za-z0-9]/u;
const RUBY_TOKEN_PATTERN =
  /^([\u3400-\u9fff\u3005\u3006\u30f5\u30f6]+)[\uff08(]\s*([\u3041-\u3096\u30a1-\u30fa\u30fc\u30fb\s]+)\s*[\uff09)]$/u;
const INLINE_RUBY_PATTERN =
  /([\u3400-\u9fff\u3005\u3006\u30f5\u30f6]+)[\uff08(]\s*([\u3041-\u3096\u30a1-\u30fa\u30fc\u30fb\s]+)\s*[\uff09)]/gu;
const SENTENCE_BOUNDARY_PATTERN = /[^。！？!?]+[。！？!?]?/gu;

const PLAYBACK_SYNC_INTERVAL_MS = 160;

type Props = {
  paragraphs: string[];
};

type TokenRunState = "idle" | "passed" | "active";

type ReadingToken = {
  text: string;
  speechStart: number;
  speechEnd: number;
  speakable: boolean;
  kanji?: string;
  reading?: string;
};

type ReadingSentence = {
  id: string;
  paragraphIndex: number;
  sentenceIndex: number;
  displayText: string;
  speechText: string;
  speechLength: number;
  tokens: ReadingToken[];
};

type TimelineEntry = {
  sentenceIndex: number;
  start: number;
  end: number;
  duration: number;
};

type PlaybackSnapshot = {
  currentTimeTick: number;
  durationTick: number;
  sentenceIndex: number;
  tokenIndex: number;
};

function createPlaybackSnapshot(): PlaybackSnapshot {
  return {
    currentTimeTick: -1,
    durationTick: -1,
    sentenceIndex: -2,
    tokenIndex: -2,
  };
}

function quantizePlaybackTime(seconds: number): number {
  return Math.round(seconds * 10) / 10;
}

function toReadableRate(value: number): string {
  return `${value.toFixed(2)}x`;
}

function formatClock(seconds: number): string {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function stripInlineRubyForSpeech(value: string): string {
  return value
    .replace(INLINE_RUBY_PATTERN, "$1")
    .replace(/[ \t\u3000]+/g, " ")
    .replace(/\r/g, "")
    .trim();
}

function compactSpeechCursorText(value: string): string {
  return stripInlineRubyForSpeech(value).replace(/\s+/g, "");
}

function parseRubyToken(text: string): Pick<ReadingToken, "kanji" | "reading"> | null {
  const match = text.match(RUBY_TOKEN_PATTERN);
  if (!match) {
    return null;
  }
  return {
    kanji: match[1],
    reading: match[2].replace(/\s+/g, ""),
  };
}

function pushToken(tokens: ReadingToken[], text: string, speechCursor: number): number {
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

function buildTokens(text: string): ReadingToken[] {
  const tokens: ReadingToken[] = [];
  let speechCursor = 0;
  let displayCursor = 0;

  for (const match of text.matchAll(TOKEN_PATTERN)) {
    const tokenText = match[0] ?? "";
    const tokenIndex = match.index ?? displayCursor;
    if (tokenIndex > displayCursor) {
      speechCursor = pushToken(tokens, text.slice(displayCursor, tokenIndex), speechCursor);
    }
    speechCursor = pushToken(tokens, tokenText, speechCursor);
    displayCursor = tokenIndex + tokenText.length;
  }

  if (displayCursor < text.length) {
    pushToken(tokens, text.slice(displayCursor), speechCursor);
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

function buildReadingSentences(paragraphs: string[]): ReadingSentence[] {
  const output: ReadingSentence[] = [];
  let sentenceCursor = 0;
  for (let paragraphIndex = 0; paragraphIndex < paragraphs.length; paragraphIndex += 1) {
    const paragraph = (paragraphs[paragraphIndex] ?? "").trim();
    if (!paragraph) {
      continue;
    }
    const sentenceParts = paragraph.match(SENTENCE_BOUNDARY_PATTERN) ?? [paragraph];
    for (const rawSentence of sentenceParts) {
      const displayText = rawSentence.trim();
      if (!displayText) {
        continue;
      }
      const speechText = stripInlineRubyForSpeech(displayText);
      if (!speechText) {
        continue;
      }
      output.push({
        id: `${paragraphIndex}-${sentenceCursor}`,
        paragraphIndex,
        sentenceIndex: sentenceCursor,
        displayText,
        speechText,
        speechLength: compactSpeechCursorText(speechText).length,
        tokens: buildTokens(displayText),
      });
      sentenceCursor += 1;
    }
  }
  return output;
}

function buildTimeline(sentences: ReadingSentence[], audioDuration: number): TimelineEntry[] {
  const speakableSentences = sentences.filter((sentence) => sentence.speechLength > 0);
  if (speakableSentences.length === 0) {
    return [];
  }

  const safeDuration = Number.isFinite(audioDuration) && audioDuration > 0 ? audioDuration : 0;
  const totalWeight = speakableSentences.reduce((sum, sentence) => sum + Math.max(1, sentence.speechLength), 0);
  let cursor = 0;

  return speakableSentences.map((sentence, idx) => {
    const weight = Math.max(1, sentence.speechLength);
    const chunkDuration = safeDuration > 0 ? (weight / totalWeight) * safeDuration : 0;
    const start = cursor;
    const end = idx === speakableSentences.length - 1 ? safeDuration : cursor + chunkDuration;
    cursor = end;
    return {
      sentenceIndex: sentence.sentenceIndex,
      start,
      end,
      duration: Math.max(0, end - start),
    };
  });
}

function tokenIndexFromCharIndex(sentence: ReadingSentence, charIndex: number): number {
  const compactCharIndex = Math.max(0, Math.min(sentence.speechLength, charIndex));
  const directIndex = sentence.tokens.findIndex(
    (token) =>
      token.speakable && compactCharIndex >= token.speechStart && compactCharIndex < token.speechEnd
  );
  if (directIndex >= 0) {
    return directIndex;
  }

  for (let index = sentence.tokens.length - 1; index >= 0; index -= 1) {
    const token = sentence.tokens[index];
    if (token?.speakable && token.speechStart <= compactCharIndex) {
      return index;
    }
  }

  return sentence.tokens.findIndex((token) => token.speakable);
}

function resolveTokenRunState(
  lineActive: boolean,
  token: ReadingToken,
  tokenIndex: number,
  activeIndex: number,
  showTrace: boolean
): TokenRunState {
  if (!showTrace || !lineActive || activeIndex < 0) {
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

const ReadingTokenText = memo(function ReadingTokenText({ state, token }: { state: TokenRunState; token: ReadingToken }) {
  const kanjiClass =
    state === "active"
      ? "text-[#ff6b00]"
      : state === "passed"
        ? "text-[#123c69]"
        : "text-[#111827]";

  if (token.kanji && token.reading) {
    return (
      <ruby className="align-baseline whitespace-nowrap px-0.5 [ruby-position:over]">
        <span className={`${kanjiClass} transition-colors duration-100`}>{token.kanji}</span>
        <rt className="pointer-events-none select-none text-[0.5em] font-black leading-none tracking-wide text-[#64748b]">
          {token.reading}
        </rt>
      </ruby>
    );
  }

  return <span className={`${kanjiClass} transition-colors duration-100`}>{token.text}</span>;
});

export function ReadingPlaybackText({ paragraphs }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const textContainerRef = useRef<HTMLDivElement | null>(null);
  const sentenceRefs = useRef(new Map<number, HTMLSpanElement>());
  const tickerRef = useRef<number | null>(null);
  const generatedUrlRef = useRef<string | null>(null);
  const playRequestRef = useRef(0);
  const playbackSnapshotRef = useRef(createPlaybackSnapshot());
  const lastScrolledSentenceRef = useRef(-1);

  const [audioUrl, setAudioUrl] = useState("");
  const [state, setState] = useState<"idle" | "generating" | "ready" | "error">("idle");
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState(false);
  const [showTrace, setShowTrace] = useState(true);
  const [followText, setFollowText] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(0.95);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [activeSentenceIndex, setActiveSentenceIndex] = useState(-1);
  const [activeTokenIndex, setActiveTokenIndex] = useState(-1);

  const sentences = useMemo(() => buildReadingSentences(paragraphs), [paragraphs]);
  const timeline = useMemo(() => buildTimeline(sentences, audioDuration), [sentences, audioDuration]);
  const rawText = useMemo(() => sentences.map((sentence) => sentence.speechText).join("\n"), [sentences]);

  const clearTicker = useCallback(() => {
    if (tickerRef.current !== null) {
      window.clearInterval(tickerRef.current);
      tickerRef.current = null;
    }
  }, []);

  const revokeGeneratedAudio = useCallback(() => {
    if (generatedUrlRef.current) {
      URL.revokeObjectURL(generatedUrlRef.current);
      generatedUrlRef.current = null;
    }
  }, []);

  const syncHighlight = useCallback(
    (currentTimeSec: number) => {
      const roundedCurrentTime = quantizePlaybackTime(currentTimeSec);
      const snapshot = playbackSnapshotRef.current;
      if (snapshot.currentTimeTick !== roundedCurrentTime) {
        snapshot.currentTimeTick = roundedCurrentTime;
        setAudioCurrentTime(roundedCurrentTime);
      }

      const player = audioRef.current;
      const playerDuration =
        player && Number.isFinite(player.duration) && player.duration > 0 ? player.duration : 0;
      const resolvedDuration = audioDuration > 0 ? audioDuration : playerDuration;
      const roundedDuration = quantizePlaybackTime(resolvedDuration);
      if (resolvedDuration > 0 && snapshot.durationTick !== roundedDuration) {
        snapshot.durationTick = roundedDuration;
        setAudioDuration(resolvedDuration);
      }

      const effectiveTimeline =
        resolvedDuration > 0 && Math.abs(resolvedDuration - audioDuration) > 0.05
          ? buildTimeline(sentences, resolvedDuration)
          : timeline;

      if (effectiveTimeline.length === 0 || resolvedDuration <= 0) {
        if (snapshot.sentenceIndex !== -1) {
          snapshot.sentenceIndex = -1;
          setActiveSentenceIndex(-1);
        }
        if (snapshot.tokenIndex !== -1) {
          snapshot.tokenIndex = -1;
          setActiveTokenIndex(-1);
        }
        return;
      }

      const safeTime = Math.min(Math.max(0, currentTimeSec), resolvedDuration);
      const entry =
        effectiveTimeline.find((segment) => safeTime >= segment.start && safeTime < segment.end) ??
        effectiveTimeline[effectiveTimeline.length - 1];
      if (!entry) {
        if (snapshot.sentenceIndex !== -1) {
          snapshot.sentenceIndex = -1;
          setActiveSentenceIndex(-1);
        }
        if (snapshot.tokenIndex !== -1) {
          snapshot.tokenIndex = -1;
          setActiveTokenIndex(-1);
        }
        return;
      }

      const sentence = sentences.find((line) => line.sentenceIndex === entry.sentenceIndex);
      if (!sentence) {
        if (snapshot.sentenceIndex !== -1) {
          snapshot.sentenceIndex = -1;
          setActiveSentenceIndex(-1);
        }
        if (snapshot.tokenIndex !== -1) {
          snapshot.tokenIndex = -1;
          setActiveTokenIndex(-1);
        }
        return;
      }

      const lineRatio = entry.duration > 0 ? (safeTime - entry.start) / entry.duration : 0;
      const charIndex = Math.floor(Math.min(0.999, Math.max(0, lineRatio)) * Math.max(1, sentence.speechLength));
      const tokenIndex = tokenIndexFromCharIndex(sentence, charIndex);
      if (snapshot.sentenceIndex !== sentence.sentenceIndex) {
        snapshot.sentenceIndex = sentence.sentenceIndex;
        setActiveSentenceIndex(sentence.sentenceIndex);
      }
      if (snapshot.tokenIndex !== tokenIndex) {
        snapshot.tokenIndex = tokenIndex;
        setActiveTokenIndex(tokenIndex);
      }
    },
    [audioDuration, sentences, timeline]
  );

  const startTicker = useCallback(() => {
    clearTicker();
    tickerRef.current = window.setInterval(() => {
      const audio = audioRef.current;
      if (!audio) {
        return;
      }
      syncHighlight(audio.currentTime || 0);
    }, PLAYBACK_SYNC_INTERVAL_MS);
  }, [clearTicker, syncHighlight]);

  const syncFromAudioElement = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    syncHighlight(audio.currentTime || 0);
  }, [syncHighlight]);

  const generateAudioIfNeeded = useCallback(async () => {
    if (audioUrl) {
      return audioUrl;
    }
    if (!rawText.trim()) {
      throw new Error("Chua co noi dung de doc.");
    }

    setState("generating");
    setError("");
    const response = await fetch("/api/listening-tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: rawText,
        voice: "ja-JP-NanamiNeural",
        rate: "-5%",
        pitch: "+0Hz",
        allowFallbackDemo: false,
      }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string; hint?: string };
      throw new Error([payload.error, payload.hint].filter(Boolean).join(" "));
    }

    const blob = await response.blob();
    const nextUrl = URL.createObjectURL(blob);
    revokeGeneratedAudio();
    generatedUrlRef.current = nextUrl;
    playbackSnapshotRef.current = createPlaybackSnapshot();
    lastScrolledSentenceRef.current = -1;
    setAudioUrl(nextUrl);
    setState("ready");
    setAudioCurrentTime(0);
    setAudioDuration(0);
    setActiveSentenceIndex(-1);
    setActiveTokenIndex(-1);
    return nextUrl;
  }, [audioUrl, rawText, revokeGeneratedAudio]);

  const handlePlay = useCallback(async () => {
    const requestId = playRequestRef.current + 1;
    playRequestRef.current = requestId;

    try {
      setError("");
      const resolvedUrl = await generateAudioIfNeeded();
      if (playRequestRef.current !== requestId) {
        return;
      }

      const audio = audioRef.current;
      if (!audio) {
        return;
      }
      if (audio.currentSrc !== resolvedUrl && audio.src !== resolvedUrl) {
        audio.src = resolvedUrl;
      }
      audio.playbackRate = playbackRate;
      await audio.play();
      if (playRequestRef.current !== requestId) {
        audio.pause();
        return;
      }
      setPlaying(true);
      startTicker();
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "";
      if (message.includes("interrupted by a new load request")) {
        return;
      }
      setState("error");
      setPlaying(false);
      setError(message || "Khong tao duoc audio doc bai.");
    }
  }, [generateAudioIfNeeded, playbackRate, startTicker]);

  const handlePause = useCallback(() => {
    playRequestRef.current += 1;
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    audio.pause();
    setPlaying(false);
    clearTicker();
    syncFromAudioElement();
  }, [clearTicker, syncFromAudioElement]);

  const handleStop = useCallback(() => {
    playRequestRef.current += 1;
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    audio.pause();
    audio.currentTime = 0;
    playbackSnapshotRef.current = createPlaybackSnapshot();
    lastScrolledSentenceRef.current = -1;
    setPlaying(false);
    clearTicker();
    setAudioCurrentTime(0);
    setActiveSentenceIndex(-1);
    setActiveTokenIndex(-1);
  }, [clearTicker]);

  const handleSeek = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const audio = audioRef.current;
      if (!audio) {
        return;
      }
      const nextValue = Number(event.target.value);
      audio.currentTime = nextValue;
      lastScrolledSentenceRef.current = -1;
      syncHighlight(nextValue);
    },
    [syncHighlight]
  );

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    audio.playbackRate = playbackRate;
  }, [audioUrl, playbackRate]);

  useEffect(() => {
    if (!followText || activeSentenceIndex < 0) {
      return;
    }
    if (lastScrolledSentenceRef.current === activeSentenceIndex) {
      return;
    }

    const container = textContainerRef.current;
    const sentence = sentenceRefs.current.get(activeSentenceIndex);
    if (!container || !sentence) {
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const sentenceRect = sentence.getBoundingClientRect();
    const padding = 64;
    let nextScrollTop: number | null = null;

    if (sentenceRect.top < containerRect.top + padding) {
      nextScrollTop = container.scrollTop + sentenceRect.top - containerRect.top - padding;
    } else if (sentenceRect.bottom > containerRect.bottom - padding) {
      nextScrollTop = container.scrollTop + sentenceRect.bottom - containerRect.bottom + padding;
    }

    if (nextScrollTop !== null) {
      lastScrolledSentenceRef.current = activeSentenceIndex;
      container.scrollTo({
        top: Math.max(0, nextScrollTop),
        behavior: "smooth",
      });
    }
  }, [activeSentenceIndex, followText]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    const onPlay = () => {
      setPlaying(true);
      startTicker();
    };
    const onPause = () => {
      setPlaying(false);
      clearTicker();
      syncFromAudioElement();
    };
    const onLoadedMetadata = () => syncFromAudioElement();
    const onEnded = () => {
      playbackSnapshotRef.current = createPlaybackSnapshot();
      setPlaying(false);
      clearTicker();
      setActiveSentenceIndex(-1);
      setActiveTokenIndex(-1);
      setAudioCurrentTime(audio.duration || 0);
    };

    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("ended", onEnded);
    };
  }, [clearTicker, startTicker, syncFromAudioElement]);

  useEffect(() => {
    playRequestRef.current += 1;
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      audio.removeAttribute("src");
      audio.load();
    }
    playbackSnapshotRef.current = createPlaybackSnapshot();
    lastScrolledSentenceRef.current = -1;
    clearTicker();
    revokeGeneratedAudio();
    setAudioUrl("");
    setState("idle");
    setError("");
    setPlaying(false);
    setAudioCurrentTime(0);
    setAudioDuration(0);
    setActiveSentenceIndex(-1);
    setActiveTokenIndex(-1);
  }, [clearTicker, rawText, revokeGeneratedAudio]);

  useEffect(() => {
    return () => {
      clearTicker();
      revokeGeneratedAudio();
    };
  }, [clearTicker, revokeGeneratedAudio]);

  const activeSentenceOrder = useMemo(() => {
    if (activeSentenceIndex < 0) {
      return 0;
    }
    const found = sentences.findIndex((sentence) => sentence.sentenceIndex === activeSentenceIndex);
    return found >= 0 ? found + 1 : 0;
  }, [activeSentenceIndex, sentences]);

  return (
    <section className="rounded-[28px] border border-[#d8e2ee] bg-[#f8fcff] p-5">
      <audio ref={audioRef} preload="metadata" />

      <div className="rounded-3xl border border-[#d4e1ef] bg-white px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={playing ? handlePause : handlePlay}
            disabled={state === "generating"}
            className="inline-flex h-12 items-center gap-2 rounded-full bg-[#123c69] px-6 text-base font-black text-white transition hover:bg-[#19538f] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {state === "generating" ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : playing ? (
              <Pause className="h-5 w-5" />
            ) : (
              <Play className="h-5 w-5" />
            )}
            {state === "generating" ? "Đang tạo..." : playing ? "Tạm dừng" : "Đọc bài"}
          </button>

          <button
            type="button"
            onClick={handleStop}
            className="inline-flex h-12 items-center gap-2 rounded-full border border-[#f2c6d3] bg-[#fff5f8] px-5 text-base font-black text-[#cf4a79] transition hover:bg-[#ffe9ef]"
          >
            <Square className="h-4 w-4" />
            Dừng
          </button>

          <button
            type="button"
            onClick={() => setShowTrace((prev) => !prev)}
            className="inline-flex h-12 items-center gap-2 rounded-full border border-[#cbd8e7] bg-[#f8fcff] px-5 text-base font-black text-[#123c69] transition hover:bg-[#eef6ff]"
          >
            <Volume2 className="h-4 w-4" />
            {showTrace ? "Ẩn vết đọc" : "Hiện vết đọc"}
          </button>

          <label className="ml-auto flex min-w-[280px] items-center gap-3 rounded-full border border-[#cbd8e7] bg-[#f8fcff] px-4 py-2 text-base font-black text-[#123c69]">
            Tốc độ {toReadableRate(playbackRate)}
            <input
              type="range"
              min={0.75}
              max={1.35}
              step={0.05}
              value={playbackRate}
              onChange={(event) => setPlaybackRate(Number(event.target.value))}
              className="h-2 flex-1 accent-[#ff6b00]"
            />
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm font-black text-[#526070]">
          <span className="uppercase tracking-[0.16em] text-[#667085]">
            Câu {Math.max(1, activeSentenceOrder)}/{Math.max(1, sentences.length)}
          </span>
          <span>
            {formatClock(audioCurrentTime)} / ~{formatClock(audioDuration)}
          </span>
          <label className="ml-auto inline-flex items-center gap-2 text-sm font-bold text-[#526070]">
            <input
              type="checkbox"
              checked={followText}
              onChange={(event) => setFollowText(event.target.checked)}
              className="h-4 w-4 rounded border-[#b8c7db]"
            />
            Tự chạy theo câu đang đọc
          </label>
        </div>

        <input
          type="range"
          min={0}
          max={Math.max(audioDuration, 0.001)}
          step={0.01}
          value={Math.min(audioCurrentTime, Math.max(audioDuration, 0.001))}
          onChange={handleSeek}
          className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-full bg-[#d8e2ee] accent-[#22a6a1]"
        />

        <p className="mt-3 text-sm font-semibold text-[#526070]">
          Giọng đang dùng: <span className="font-black text-[#123c69]">Nanami (chuẩn bài nghe)</span>. Tô màu chạy theo thời gian để tránh nhấp nháy furigana.
        </p>

        {error ? (
          <p className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">
            {error}
          </p>
        ) : null}
      </div>

      <div
        ref={textContainerRef}
        className="mt-4 max-h-[480px] overflow-y-auto rounded-3xl border border-[#d8e2ee] bg-white px-5 py-4 font-[var(--font-jp)] text-[19px] font-black leading-[1.92] text-[#111827] md:text-[22px]"
      >
        {sentences.length > 0 ? (
          sentences.map((sentence, sentenceIdx) => {
            const lineActive = sentence.sentenceIndex === activeSentenceIndex;
            const nextSentence = sentences[sentenceIdx + 1];
            const isParagraphEnd =
              !nextSentence || nextSentence.paragraphIndex !== sentence.paragraphIndex;
            return (
              <span
                key={sentence.id}
                ref={(node) => {
                  if (node) {
                    sentenceRefs.current.set(sentence.sentenceIndex, node);
                  } else {
                    sentenceRefs.current.delete(sentence.sentenceIndex);
                  }
                }}
                className="inline"
              >
                {sentence.tokens.map((token, tokenIndex) => (
                  <ReadingTokenText
                    key={`${sentence.id}-${tokenIndex}-${token.text}`}
                    token={token}
                    state={resolveTokenRunState(
                      lineActive,
                      token,
                      tokenIndex,
                      activeTokenIndex,
                      showTrace
                    )}
                  />
                ))}
                {isParagraphEnd ? <br /> : " "}
              </span>
            );
          })
        ) : (
          <p className="text-base font-semibold text-[#667085]">Chưa có dữ liệu bài đọc.</p>
        )}
      </div>
    </section>
  );
}
