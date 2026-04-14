"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { addKanjiToReviewAction } from "@/app/actions/study";
import {
  AUDIO_AUTOPLAY_KEY,
  AUDIO_RATE_KEY,
  AUDIO_VOICE_KEY,
} from "@/app/components/audio-settings-client";

type StudyKanjiItem = {
  id: string;
  character: string;
  meaning: string;
  onReading: string;
  kunReading: string;
  strokeCount: number;
  exampleWord: string;
  exampleMeaning: string;
  jlptLevel: string;
};

type Props = {
  title: string;
  backHref: string;
  items: StudyKanjiItem[];
};

type Direction = "jp-vi" | "vi-jp";

const preferredJaVoiceKeywords = [
  "haruka online",
  "nanami online",
  "otoya online",
  "natural",
  "microsoft",
  "google",
  "nanami",
  "keita",
  "otoya",
  "kyoko",
  "japanese",
  "nihongo",
  "haruka",
  "sayaka",
];

function hasJapaneseChars(value: string): boolean {
  return /[\u3040-\u30ff\u4e00-\u9fff]/.test(value);
}

function pickJapaneseVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const jaVoices = voices.filter((voice) => voice.lang.toLowerCase().startsWith("ja"));
  if (jaVoices.length === 0) {
    return null;
  }

  const preferred = jaVoices.find((voice) => {
    const name = voice.name.toLowerCase();
    return preferredJaVoiceKeywords.some((keyword) => name.includes(keyword));
  });

  return preferred ?? jaVoices[0] ?? null;
}

function isSpaceKey(event: KeyboardEvent): boolean {
  return event.key === " " || event.key === "Space" || event.key === "Spacebar" || event.code === "Space";
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tagName = target.tagName;
  if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") {
    return true;
  }
  return target.isContentEditable;
}

function shuffleIndices(length: number): number[] {
  const indices = Array.from({ length }, (_, index) => index);
  for (let i = indices.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices;
}

export function KanjiStudyClient({ title, backHref, items }: Props) {
  const [order, setOrder] = useState<number[]>(() => items.map((_, index) => index));
  const [isShuffled, setIsShuffled] = useState(false);
  const [index, setIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [knownCount, setKnownCount] = useState(0);
  const [unknownCount, setUnknownCount] = useState(0);
  const [direction, setDirection] = useState<Direction>("jp-vi");
  const [speechVoices, setSpeechVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedJaVoiceName, setSelectedJaVoiceName] = useState(() => {
    if (typeof window === "undefined") {
      return "";
    }
    return window.localStorage.getItem(AUDIO_VOICE_KEY) ?? "";
  });
  const [autoPlay, setAutoPlay] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.localStorage.getItem(AUDIO_AUTOPLAY_KEY) === "1";
  });

  const flashRef = useRef<HTMLDivElement | null>(null);
  const addDeckFormRef = useRef<HTMLFormElement | null>(null);

  const current = items[order[index]];
  const progressPercent = ((index + 1) / items.length) * 100;

  const japaneseVoices = useMemo(
    () => speechVoices.filter((voice) => voice.lang.toLowerCase().startsWith("ja")),
    [speechVoices]
  );
  const defaultJaVoice = useMemo(() => pickJapaneseVoice(japaneseVoices), [japaneseVoices]);
  const effectiveJaVoiceName = useMemo(() => {
    const hasSelected = japaneseVoices.some((voice) => voice.name === selectedJaVoiceName);
    if (hasSelected) {
      return selectedJaVoiceName;
    }
    return defaultJaVoice?.name ?? "";
  }, [defaultJaVoice, japaneseVoices, selectedJaVoiceName]);
  const selectedJaVoice = useMemo(() => {
    if (!effectiveJaVoiceName) {
      return null;
    }
    return japaneseVoices.find((voice) => voice.name === effectiveJaVoiceName) ?? null;
  }, [effectiveJaVoiceName, japaneseVoices]);

  const jpFrontMain = current.character;
  const jpFrontSub = [
    current.onReading ? `On: ${current.onReading}` : "",
    current.kunReading ? `Kun: ${current.kunReading}` : "",
  ]
    .filter(Boolean)
    .join(" | ");

  const jpBackMain = current.meaning;
  const jpBackSub = [
    current.character ? `Kanji: ${current.character}` : "",
    `${current.jlptLevel} - ${current.strokeCount} net`,
    current.exampleWord
      ? `Vi du: ${current.exampleWord}${current.exampleMeaning ? ` - ${current.exampleMeaning}` : ""}`
      : "",
  ]
    .filter(Boolean)
    .join(" | ");

  const viFrontMain = current.meaning;
  const viFrontSub = `${current.jlptLevel} - ${current.strokeCount} net`;
  const viBackMain = current.character;
  const viBackSub = [
    current.onReading ? `On: ${current.onReading}` : "",
    current.kunReading ? `Kun: ${current.kunReading}` : "",
    current.exampleWord
      ? `Vi du: ${current.exampleWord}${current.exampleMeaning ? ` - ${current.exampleMeaning}` : ""}`
      : "",
  ]
    .filter(Boolean)
    .join(" | ");

  const frontMain = direction === "jp-vi" ? jpFrontMain : viFrontMain;
  const frontSub = direction === "jp-vi" ? jpFrontSub : viFrontSub;
  const backMain = direction === "jp-vi" ? jpBackMain : viBackMain;
  const backSub = direction === "jp-vi" ? jpBackSub : viBackSub;

  const shownMain = isFlipped ? backMain : frontMain;
  const shownSub = isFlipped ? backSub : frontSub;

  const focusFlashcardArea = useCallback(() => {
    flashRef.current?.focus();
  }, []);

  const resetPerCard = useCallback(() => {
    setIsFlipped(false);
  }, []);

  const goNext = useCallback(() => {
    setIndex((prev) => (prev + 1) % items.length);
    resetPerCard();
  }, [items.length, resetPerCard]);

  const goPrev = useCallback(() => {
    setIndex((prev) => (prev - 1 + items.length) % items.length);
    resetPerCard();
  }, [items.length, resetPerCard]);

  const flipCard = useCallback(() => {
    setIsFlipped((prev) => !prev);
  }, []);

  const markCard = useCallback(
    (isKnown: boolean) => {
      if (isKnown) {
        setKnownCount((prev) => prev + 1);
      } else {
        setUnknownCount((prev) => prev + 1);
      }
      goNext();
    },
    [goNext]
  );

  const changeJaVoice = useCallback((voiceName: string) => {
    setSelectedJaVoiceName(voiceName);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(AUDIO_VOICE_KEY, voiceName);
    }
  }, []);

  const speakCurrent = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }

    const jpCandidate =
      [current.character, current.exampleWord, current.onReading, current.kunReading].find((value) =>
        hasJapaneseChars(value)
      ) ?? "";

    const viCandidate = current.meaning.trim();
    const text = (direction === "jp-vi" ? jpCandidate || viCandidate : viCandidate || jpCandidate).trim();
    if (!text) {
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = hasJapaneseChars(text) ? "ja-JP" : "vi-VN";
    const storedRate = Number(
      typeof window !== "undefined" ? window.localStorage.getItem(AUDIO_RATE_KEY) ?? "0.95" : "0.95"
    );
    utterance.rate = Number.isFinite(storedRate) ? Math.min(1.25, Math.max(0.75, storedRate)) : 0.95;
    utterance.pitch = 1;

    if (utterance.lang === "ja-JP") {
      const chosenVoice = selectedJaVoice ?? pickJapaneseVoice(speechVoices);
      if (chosenVoice) {
        utterance.voice = chosenVoice;
        const lowerName = chosenVoice.name.toLowerCase();
        if (lowerName.includes("online") || lowerName.includes("natural")) {
          utterance.rate = 0.96;
        }
      }
    }

    window.speechSynthesis.speak(utterance);
  }, [
    current.character,
    current.exampleWord,
    current.kunReading,
    current.meaning,
    current.onReading,
    direction,
    selectedJaVoice,
    speechVoices,
  ]);

  const submitAddToDeck = useCallback(() => {
    addDeckFormRef.current?.requestSubmit();
  }, []);

  function toggleShuffle() {
    if (isShuffled) {
      setOrder(items.map((_, idx) => idx));
      setIsShuffled(false);
      setIndex(0);
      resetPerCard();
      return;
    }
    setOrder(shuffleIndices(items.length));
    setIsShuffled(true);
    setIndex(0);
    resetPerCard();
  }

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }

    const loadVoices = () => {
      setSpeechVoices(window.speechSynthesis.getVoices());
    };

    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);

    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const readAutoPlay = () => setAutoPlay(window.localStorage.getItem(AUDIO_AUTOPLAY_KEY) === "1");
    readAutoPlay();
    window.addEventListener("focus", readAutoPlay);
    return () => window.removeEventListener("focus", readAutoPlay);
  }, []);

  useEffect(() => {
    if (!autoPlay) {
      return;
    }
    const timer = window.setTimeout(() => {
      speakCurrent();
    }, 120);
    return () => window.clearTimeout(timer);
  }, [autoPlay, index, speakCurrent]);

  useEffect(() => {
    focusFlashcardArea();

    function onKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();
      if (isSpaceKey(event)) {
        event.preventDefault();
        event.stopPropagation();
        flipCard();
        focusFlashcardArea();
        return;
      }
      if (key === "arrowleft") {
        event.preventDefault();
        goPrev();
        focusFlashcardArea();
        return;
      }
      if (key === "arrowright") {
        event.preventDefault();
        goNext();
        focusFlashcardArea();
        return;
      }
      if (key === "z") {
        event.preventDefault();
        markCard(true);
        focusFlashcardArea();
        return;
      }
      if (key === "x") {
        event.preventDefault();
        markCard(false);
        focusFlashcardArea();
        return;
      }
      if (key === "r") {
        event.preventDefault();
        speakCurrent();
        focusFlashcardArea();
        return;
      }
      if (key === "c") {
        event.preventDefault();
        submitAddToDeck();
        focusFlashcardArea();
      }
    }

    document.addEventListener("keydown", onKeyDown, { capture: true });
    return () => document.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [
    flipCard,
    focusFlashcardArea,
    goNext,
    goPrev,
    markCard,
    speakCurrent,
    submitAddToDeck,
  ]);

  const detailHref = `/kanji?q=${encodeURIComponent(current.character)}#kanji-${current.id}`;

  return (
    <section className="mx-auto w-full max-w-[980px] rounded-2xl border border-slate-300 bg-[#2f3c66] text-slate-100 shadow-[0_24px_60px_rgba(15,23,42,0.55)]">
      <div className="relative border-b border-slate-500/20 px-4 py-4">
        <div className="flex items-center justify-between text-slate-300">
          <Link href={detailHref} className="inline-flex items-center gap-2 text-xl">
            <span className="text-lg">[]</span>
            <span>Xem chi tiet</span>
          </Link>
          <Link href={backHref} className="text-3xl leading-none text-slate-400 hover:text-white">
            x
          </Link>
        </div>

        <div
          role="button"
          ref={flashRef}
          tabIndex={0}
          className="relative mt-4 min-h-[360px] cursor-pointer select-none rounded-xl outline-none"
          onClick={flipCard}
          onMouseDown={() => focusFlashcardArea()}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              flipCard();
            }
          }}
        >
          <button
            type="button"
            className="absolute left-0 top-1/2 inline-flex h-14 w-14 -translate-y-1/2 items-center justify-center rounded-full bg-slate-600/55 text-4xl text-slate-200"
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => {
              event.stopPropagation();
              goPrev();
              focusFlashcardArea();
            }}
            aria-label="The truoc"
          >
            {"<"}
          </button>

          <button
            type="button"
            className="absolute right-0 top-1/2 inline-flex h-14 w-14 -translate-y-1/2 items-center justify-center rounded-full bg-slate-600/55 text-4xl text-slate-200"
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => {
              event.stopPropagation();
              goNext();
              focusFlashcardArea();
            }}
            aria-label="The sau"
          >
            {">"}
          </button>

          <div className="mx-auto flex min-h-[340px] max-w-3xl flex-col items-center justify-center px-16 text-center">
            <p className="text-sm uppercase tracking-[0.24em] text-slate-300">
              {direction === "jp-vi" ? "JP -> VI" : "VI -> JP"}
            </p>
            <p
              className={`mt-4 font-semibold text-white ${
                shownMain.length > 24 ? "text-5xl sm:text-6xl" : "text-7xl sm:text-8xl"
              }`}
            >
              {shownMain}
            </p>
            {shownSub ? <p className="mt-4 text-3xl text-slate-300">{shownSub}</p> : null}
          </div>
        </div>
      </div>

      <div className="border-y border-slate-500/35 bg-[#44517a] px-4 py-3 text-3xl text-slate-200">
        Phim tat: <span className="rounded-md bg-slate-500/55 px-2 py-0.5">Space</span> lat
        <span className="ml-2 rounded-md bg-slate-500/55 px-2 py-0.5">Z</span> biet
        <span className="ml-2 rounded-md bg-slate-500/55 px-2 py-0.5">X</span> chua biet
        <span className="ml-2 rounded-md bg-slate-500/55 px-2 py-0.5">C</span> luu on tap
        <span className="ml-2 rounded-md bg-slate-500/55 px-2 py-0.5">R</span> phat am
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#1f2848] px-5 py-4">
        <form ref={addDeckFormRef} action={addKanjiToReviewAction}>
          <input type="hidden" name="kanjiId" value={current.id} />
          <button
            type="submit"
            onMouseDown={(event) => event.preventDefault()}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-500 bg-slate-700 text-3xl text-slate-200"
            title="Luu de on tap"
          >
            +
          </button>
        </form>

        <div className="flex items-center gap-6">
          <button
            type="button"
            onClick={() => markCard(false)}
            onMouseDown={(event) => event.preventDefault()}
            className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-rose-600 text-5xl font-bold"
            aria-label="Khong biet"
          >
            x
          </button>
          <span className="text-4xl font-semibold">
            {index + 1} / {items.length}
          </span>
          <button
            type="button"
            onClick={() => markCard(true)}
            onMouseDown={(event) => event.preventDefault()}
            className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-600 text-5xl font-bold"
            aria-label="Biet"
          >
            v
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-lg">
          <button
            type="button"
            className="rounded-full bg-slate-700 px-4 py-2 font-semibold text-slate-200"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setDirection((prev) => (prev === "jp-vi" ? "vi-jp" : "jp-vi"));
              setIsFlipped(false);
              focusFlashcardArea();
            }}
          >
            {direction === "jp-vi" ? "JP->VI" : "VI->JP"}
          </button>

          <button
            type="button"
            className="rounded-full bg-slate-700 px-4 py-2 font-semibold text-slate-200"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setIsFlipped(false);
              focusFlashcardArea();
            }}
          >
            Lat lai
          </button>

          <button
            type="button"
            className="rounded-full bg-slate-700 px-4 py-2 font-semibold text-slate-200"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              toggleShuffle();
              focusFlashcardArea();
            }}
          >
            {isShuffled ? "Thu tu goc" : "Dao"}
          </button>

          <button
            type="button"
            className="rounded-full bg-slate-700 px-4 py-2 font-semibold text-slate-200"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              speakCurrent();
              focusFlashcardArea();
            }}
          >
            Loa
          </button>

          {japaneseVoices.length > 0 ? (
            <select
              value={effectiveJaVoiceName}
              onChange={(event) => changeJaVoice(event.target.value)}
              className="rounded-full bg-slate-700 px-3 py-2 text-sm text-slate-200 outline-none"
            >
              {japaneseVoices.map((voice) => (
                <option key={voice.name} value={voice.name}>
                  {voice.name}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </div>

      <div className="h-2 rounded-b-2xl bg-slate-700/70">
        <div
          className="h-2 rounded-b-2xl bg-emerald-400 transition-all"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div className="px-5 py-3 text-sm text-slate-300">
        Biet: {knownCount} | Chua biet: {unknownCount} | Chu de: {title}
      </div>
    </section>
  );
}

