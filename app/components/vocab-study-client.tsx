"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  AUDIO_AUTOPLAY_KEY,
  AUDIO_RATE_KEY,
  AUDIO_VOICE_KEY,
} from "@/app/components/audio-settings-client";

export type StudyMode = "flashcard" | "quiz" | "recall";
type FlashcardPromptMode = "jp_to_vi" | "vi_to_jp" | "kanji_to_answer";

type StudyItem = {
  id: string;
  word: string;
  reading: string;
  kanji: string;
  hanviet: string;
  meaning: string;
};

type Props = {
  lessonTitle: string;
  mode: StudyMode;
  items: StudyItem[];
};

const HARD_ITEMS_PAGE_SIZE = 8;

function hasJapaneseChars(value: string): boolean {
  return /[\u3040-\u30ff\u4e00-\u9fff]/.test(value);
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

function pickJapaneseVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const jaVoices = voices.filter((voice) => voice.lang.toLowerCase().startsWith("ja"));
  if (jaVoices.length === 0) {
    return null;
  }

  const byPreference = jaVoices.find((voice) => {
    const name = voice.name.toLowerCase();
    return preferredJaVoiceKeywords.some((keyword) => name.includes(keyword));
  });

  if (byPreference) {
    return byPreference;
  }

  return jaVoices[0] ?? null;
}

function shuffleIndices(length: number): number[] {
  const indices = Array.from({ length }, (_, index) => index);
  for (let i = indices.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices;
}

function normalizeInput(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, "");
}

function displayJapanese(item: StudyItem): string {
  return item.kanji || item.word;
}

function displayReadingMain(item: StudyItem): string {
  return item.reading || item.word || item.kanji;
}

function shouldShowReadingHint(item: StudyItem): boolean {
  const main = displayJapanese(item).trim();
  const reading = item.reading.trim();
  return main.length > 0 && reading.length > 0 && main !== reading;
}

function makeQuizOptions(items: StudyItem[], current: StudyItem): StudyItem[] {
  const others = items
    .filter((item) => item.id !== current.id);
  const distractors = shuffleIndices(others.length).slice(0, 3).map((index) => others[index]);
  const options = [...distractors, current];

  for (let i = options.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }

  return options;
}

function ModeTitle({ mode }: { mode: StudyMode }) {
  if (mode === "flashcard") {
    return <span>Flashcard</span>;
  }
  if (mode === "quiz") {
    return <span>Trac nghiem</span>;
  }
  return <span>Nhoi nhet</span>;
}

export function VocabStudyClient({ lessonTitle, mode, items }: Props) {
  const [order, setOrder] = useState<number[]>(() => items.map((_, index) => index));
  const [isShuffled, setIsShuffled] = useState(false);
  const [index, setIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);
  const [hardItemIds, setHardItemIds] = useState<string[]>([]);
  const [isHardReview, setIsHardReview] = useState(false);
  const [showHardPanel, setShowHardPanel] = useState(true);
  const [hardPage, setHardPage] = useState(1);

  const [isFlipped, setIsFlipped] = useState(false);
  const [flashPromptMode, setFlashPromptMode] = useState<FlashcardPromptMode>("jp_to_vi");

  const [selectedOptionId, setSelectedOptionId] = useState("");
  const [checkedQuiz, setCheckedQuiz] = useState(false);
  const [quizCorrect, setQuizCorrect] = useState(false);

  const [recallInput, setRecallInput] = useState("");
  const [hintCount, setHintCount] = useState(0);
  const [recallMessage, setRecallMessage] = useState("");
  const [recallSuccess, setRecallSuccess] = useState(false);
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
  const flashcardAreaRef = useRef<HTMLDivElement | null>(null);

  const hardIdSet = useMemo(() => new Set(hardItemIds), [hardItemIds]);
  const hardOrder = useMemo(
    () =>
      order.filter((orderIndex) => {
        const target = items[orderIndex];
        return target ? hardIdSet.has(target.id) : false;
      }),
    [hardIdSet, items, order]
  );
  const activeOrder = isHardReview && hardOrder.length > 0 ? hardOrder : order;
  const activeCount = activeOrder.length;
  const currentOrderIndex = activeOrder[index] ?? activeOrder[0] ?? 0;
  const current = items[currentOrderIndex] ?? items[0];
  const hardItems = useMemo(() => {
    const map = new Map(items.map((item) => [item.id, item]));
    return hardItemIds.map((id) => map.get(id)).filter((item): item is StudyItem => !!item);
  }, [hardItemIds, items]);
  const hardTotalPages = Math.max(1, Math.ceil(hardItems.length / HARD_ITEMS_PAGE_SIZE));
  const hardPageSafe = Math.min(hardPage, hardTotalPages);
  const hardPageItems = useMemo(() => {
    const start = (hardPageSafe - 1) * HARD_ITEMS_PAGE_SIZE;
    return hardItems.slice(start, start + HARD_ITEMS_PAGE_SIZE);
  }, [hardItems, hardPageSafe]);
  const currentDisplayWord = displayJapanese(current);
  const quizOptions = useMemo(() => makeQuizOptions(items, current), [items, current]);
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

  const resetPerQuestionState = useCallback(() => {
    setIsFlipped(false);
    setSelectedOptionId("");
    setCheckedQuiz(false);
    setQuizCorrect(false);
    setRecallInput("");
    setHintCount(0);
    setRecallMessage("");
    setRecallSuccess(false);
  }, []);

  const progressPercent =
    activeCount > 0 ? ((index + 1) / activeCount) * 100 : 0;

  const goNext = useCallback(() => {
    setIndex((prev) => {
      if (activeCount <= 0) {
        return 0;
      }
      return (prev + 1) % activeCount;
    });
    resetPerQuestionState();
  }, [activeCount, resetPerQuestionState]);

  const goPrev = useCallback(() => {
    setIndex((prev) => {
      if (activeCount <= 0) {
        return 0;
      }
      return (prev - 1 + activeCount) % activeCount;
    });
    resetPerQuestionState();
  }, [activeCount, resetPerQuestionState]);

  useEffect(() => {
    setIndex((prev) => {
      if (activeCount <= 0) {
        return 0;
      }
      if (prev >= activeCount) {
        return 0;
      }
      return prev;
    });
  }, [activeCount]);

  useEffect(() => {
    if (isHardReview && hardOrder.length === 0) {
      setIsHardReview(false);
    }
  }, [hardOrder.length, isHardReview]);

  useEffect(() => {
    setHardPage((prev) => Math.max(1, Math.min(prev, hardTotalPages)));
  }, [hardTotalPages]);

  const markFlashcard = useCallback((isCorrect: boolean) => {
    if (isCorrect) {
      setCorrectCount((prev) => prev + 1);
    } else {
      setWrongCount((prev) => prev + 1);
      setHardItemIds((prev) => (prev.includes(current.id) ? prev : [...prev, current.id]));
    }
    goNext();
  }, [current.id, goNext]);

  const flipCard = useCallback(() => {
    setIsFlipped((prev) => !prev);
  }, []);

  const focusFlashcardArea = useCallback(() => {
    flashcardAreaRef.current?.focus();
  }, []);

  const changeFlashPromptMode = useCallback(
    (nextMode: FlashcardPromptMode) => {
      setFlashPromptMode(nextMode);
      setIsFlipped(false);
      focusFlashcardArea();
    },
    [focusFlashcardArea]
  );

  const toggleHardReview = useCallback(() => {
    if (hardOrder.length === 0) {
      return;
    }
    setIsHardReview((prev) => !prev);
    setIndex(0);
    resetPerQuestionState();
    focusFlashcardArea();
  }, [focusFlashcardArea, hardOrder.length, resetPerQuestionState]);

  const removeHardItem = useCallback((itemId: string) => {
    setHardItemIds((prev) => prev.filter((id) => id !== itemId));
  }, []);

  const clearHardItems = useCallback(() => {
    setHardItemIds([]);
    setIsHardReview(false);
    setHardPage(1);
  }, []);

  function toggleShuffle() {
    if (isShuffled) {
      setOrder(items.map((_, idx) => idx));
      setIsShuffled(false);
      setIndex(0);
      resetPerQuestionState();
      return;
    }

    setOrder(shuffleIndices(items.length));
    setIsShuffled(true);
    setIndex(0);
    resetPerQuestionState();
  }

  function checkQuiz() {
    if (!selectedOptionId) {
      return;
    }

    const isCorrect = selectedOptionId === current.id;
    setCheckedQuiz(true);
    setQuizCorrect(isCorrect);
    if (isCorrect) {
      setCorrectCount((prev) => prev + 1);
    } else {
      setWrongCount((prev) => prev + 1);
    }
  }

  function submitRecall() {
    const candidate = normalizeInput(recallInput);
    const word = normalizeInput(current.word);
    const reading = normalizeInput(current.reading);
    const kanji = normalizeInput(current.kanji);

    const isCorrect =
      candidate.length > 0 &&
      (candidate === word || candidate === reading || (kanji && candidate === kanji));
    if (isCorrect) {
      setRecallMessage("Dung roi!");
      setRecallSuccess(true);
      setCorrectCount((prev) => prev + 1);
      return;
    }

    setRecallMessage("Chua dung, thu lai nhe.");
    setRecallSuccess(false);
    setWrongCount((prev) => prev + 1);
  }

  function useHint() {
    setHintCount((prev) => Math.min(prev + 1, 2));
  }

  const changeJaVoice = useCallback((voiceName: string) => {
    setSelectedJaVoiceName(voiceName);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(AUDIO_VOICE_KEY, voiceName);
    }
  }, []);

  const hintText =
    hintCount === 0
      ? "Goi y (0/2)"
      : hintCount === 1
        ? `Goi y: bat dau bang "${currentDisplayWord.slice(0, 1)}" (1/2)`
        : `Goi y: cach doc la "${current.reading}" (2/2)`;

  const japaneseMain = (current.reading || current.word || currentDisplayWord).trim();
  const japaneseSub = currentDisplayWord && currentDisplayWord !== japaneseMain ? currentDisplayWord : "";
  const meaningMain = current.meaning.trim();
  const hanvietMain = current.hanviet.trim();
  const kanjiMain = (current.kanji || current.word || japaneseMain).trim();
  const kanjiHint = current.reading.trim();
  const hasRealKanji = current.kanji.trim().length > 0;

  let flashFrontMain = japaneseMain;
  let flashFrontSub = japaneseSub;
  let flashFrontLabel = "Hiragana";
  let flashFrontSubLabel = "Chu han";

  let flashBackMain = meaningMain;
  let flashBackSub = hanvietMain;
  let flashBackLabel = "Nghia";
  let flashBackSubLabel = "Han viet";

  if (flashPromptMode === "vi_to_jp") {
    flashFrontMain = meaningMain;
    flashFrontSub = hanvietMain;
    flashFrontLabel = "Nghia";
    flashFrontSubLabel = "Han viet";

    flashBackMain = japaneseMain;
    flashBackSub = japaneseSub;
    flashBackLabel = "Hiragana";
    flashBackSubLabel = "Chu han";
  }

  if (flashPromptMode === "kanji_to_answer") {
    flashFrontMain = kanjiMain;
    flashFrontSub = "";
    flashFrontLabel = hasRealKanji ? "Chu han" : "Tu vung";
    flashFrontSubLabel = "";

    flashBackMain = japaneseMain;
    flashBackSub = hanvietMain
      ? `${meaningMain} · Han viet: ${hanvietMain}`
      : meaningMain;
    if (!kanjiHint || kanjiHint === kanjiMain) {
      flashBackMain = japaneseMain || kanjiMain;
    }
    flashBackLabel = "Hiragana";
    flashBackSubLabel = "Nghia";
  }

  const flashMainText = isFlipped ? flashBackMain : flashFrontMain;
  const flashSubText = isFlipped ? flashBackSub : flashFrontSub;
  const flashMainLabel = isFlipped ? flashBackLabel : flashFrontLabel;
  const flashSubLabel = isFlipped ? flashBackSubLabel : flashFrontSubLabel;

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

  const selectedJaVoice = useMemo(() => {
    if (!effectiveJaVoiceName) {
      return null;
    }
    return japaneseVoices.find((voice) => voice.name === effectiveJaVoiceName) ?? null;
  }, [effectiveJaVoiceName, japaneseVoices]);

  const speakCurrentFlash = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }

    const jpCandidate =
      [current.kanji, current.word, current.reading].find((value) =>
        hasJapaneseChars(value)
      ) ?? "";

    const textToSpeak = (jpCandidate || flashMainText || "").trim();
    if (!textToSpeak) {
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.lang = hasJapaneseChars(textToSpeak) ? "ja-JP" : "vi-VN";
    const storedRate = Number(
      typeof window !== "undefined" ? window.localStorage.getItem(AUDIO_RATE_KEY) ?? "0.95" : "0.95"
    );
    utterance.rate = Number.isFinite(storedRate) ? Math.min(1.25, Math.max(0.75, storedRate)) : 0.95;
    utterance.pitch = 1;

    if (utterance.lang === "ja-JP") {
      const chosenVoice = selectedJaVoice ?? pickJapaneseVoice(speechVoices);
      if (chosenVoice) {
        utterance.voice = chosenVoice;
        const name = chosenVoice.name.toLowerCase();
        if (name.includes("online") || name.includes("natural")) {
          utterance.rate = 0.95;
        }
      }
    }

    window.speechSynthesis.speak(utterance);
  }, [
    current.kanji,
    current.reading,
    current.word,
    flashMainText,
    selectedJaVoice,
    speechVoices,
  ]);

  useEffect(() => {
    if (mode !== "flashcard") {
      return;
    }

    flashcardAreaRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
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

      if (key === "1") {
        event.preventDefault();
        changeFlashPromptMode("jp_to_vi");
        return;
      }

      if (key === "2") {
        event.preventDefault();
        changeFlashPromptMode("vi_to_jp");
        return;
      }

      if (key === "3") {
        event.preventDefault();
        changeFlashPromptMode("kanji_to_answer");
        return;
      }

      if (key === "z") {
        event.preventDefault();
        markFlashcard(true);
        focusFlashcardArea();
        return;
      }

      if (key === "x") {
        event.preventDefault();
        markFlashcard(false);
        focusFlashcardArea();
        return;
      }

      if (key === "r") {
        event.preventDefault();
        speakCurrentFlash();
        focusFlashcardArea();
      }
    }

    document.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => document.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [
    changeFlashPromptMode,
    focusFlashcardArea,
    mode,
    flipCard,
    goNext,
    goPrev,
    markFlashcard,
    speakCurrentFlash,
  ]);

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
    if (mode !== "flashcard" || !autoPlay) {
      return;
    }
    const timer = window.setTimeout(() => {
      speakCurrentFlash();
    }, 140);
    return () => window.clearTimeout(timer);
  }, [autoPlay, index, mode, speakCurrentFlash]);

  return (
    <section className="mx-auto w-full max-w-5xl rounded-3xl border border-[#41507c] bg-[#2f3c66] p-4 text-slate-100 shadow-[0_16px_35px_rgba(18,28,56,0.45)] sm:p-5">
      <div className="mb-4 flex items-center justify-between">
        <Link
          href="/vocab"
          className="inline-flex items-center gap-2 text-base text-slate-300 transition hover:text-white"
        >
          <span>{"<"}</span>
          <span>Quay lai</span>
        </Link>
        <div className="text-center">
          <p className="text-sm uppercase tracking-widest text-slate-300">{lessonTitle}</p>
          <h1 className="text-xl font-bold text-white">
            <ModeTitle mode={mode} />
          </h1>
        </div>
        {mode === "flashcard" ? (
          <div className="w-[108px]" />
        ) : (
          <button
            type="button"
            className="rounded-full border border-slate-500 px-3 py-1 text-sm text-slate-200 hover:bg-slate-700"
            onClick={toggleShuffle}
          >
            {isShuffled ? "Thu tu goc" : "Dao thu tu"}
          </button>
        )}
      </div>

      {mode === "flashcard" ? (
        <div className="mx-auto max-w-[980px] overflow-hidden rounded-2xl bg-[#32416d]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-500/35 bg-[#3a4a75] px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-200/90">
              Kieu luyen flashcard
            </p>
            <div className="inline-flex items-center rounded-full bg-slate-800/55 p-1 text-xs">
              <button
                type="button"
                className={`rounded-full px-2.5 py-1.5 font-semibold transition ${
                  flashPromptMode === "jp_to_vi"
                    ? "bg-blue-500 text-white"
                    : "text-slate-200 hover:bg-slate-700/70"
                }`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => changeFlashPromptMode("jp_to_vi")}
              >
                1. JP -{">"} VI
              </button>
              <button
                type="button"
                className={`rounded-full px-2.5 py-1.5 font-semibold transition ${
                  flashPromptMode === "vi_to_jp"
                    ? "bg-emerald-500 text-white"
                    : "text-slate-200 hover:bg-slate-700/70"
                }`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => changeFlashPromptMode("vi_to_jp")}
              >
                2. VI -{">"} JP
              </button>
              <button
                type="button"
                className={`rounded-full px-2.5 py-1.5 font-semibold transition ${
                  flashPromptMode === "kanji_to_answer"
                    ? "bg-fuchsia-500 text-white"
                    : "text-slate-200 hover:bg-slate-700/70"
                }`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => changeFlashPromptMode("kanji_to_answer")}
              >
                3. Kanji -{">"} Doc/Nghia
              </button>
            </div>
          </div>
          <div
            role="button"
            ref={flashcardAreaRef}
            tabIndex={0}
            className="relative min-h-[250px] cursor-pointer select-none p-4 outline-none sm:min-h-[300px]"
            onClick={flipCard}
            onMouseDown={() => flashcardAreaRef.current?.focus()}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                flipCard();
              }
            }}
          >
            <button
              type="button"
              className="absolute left-2 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-slate-600/55 text-xl text-slate-200"
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
              className="absolute right-2 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-slate-600/55 text-xl text-slate-200"
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

            <div className="mx-auto flex min-h-[170px] max-w-3xl flex-col items-center justify-center text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300/85">
                {flashMainLabel}
              </p>
              <p
                className={`mt-2 font-semibold text-white ${
                  flashMainText.length > 20 ? "text-2xl sm:text-3xl" : "text-4xl sm:text-5xl"
                }`}
              >
                {flashMainText}
              </p>
              {flashSubText ? (
                <>
                  <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300/75">
                    {flashSubLabel}
                  </p>
                  <p className="mt-1 text-xl text-slate-300">{flashSubText}</p>
                </>
              ) : null}
              <button
                type="button"
                className="mt-4 inline-flex items-center gap-2 rounded-full bg-slate-700/60 px-3 py-1.5 text-xs text-slate-100"
                onMouseDown={(event) => event.preventDefault()}
                onClick={(event) => {
                  event.stopPropagation();
                  speakCurrentFlash();
                  focusFlashcardArea();
                }}
                aria-label="Phat am"
              >
                <span>🔊</span>
                <span>Phat am</span>
              </button>
            </div>
          </div>

          <div className="border-y border-slate-500/35 bg-[#44517a] px-3 py-1.5 text-xs text-slate-200">
            Phim tat: Space lat, 1/2/3 doi kieu luyen, Z biet, X chua biet (them tu kho), R phat am, mui ten trai/phai de chuyen the
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 bg-[#1f2848] px-3 py-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => markFlashcard(false)}
                onMouseDown={(event) => event.preventDefault()}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-rose-500 text-xl font-bold"
                aria-label="Khong biet"
              >
                x
              </button>
              <span className="text-xl font-semibold">
                {index + 1} / {activeCount}
              </span>
              {isHardReview ? (
                <span className="rounded-full border border-rose-300 bg-rose-500/20 px-2 py-0.5 text-xs font-semibold text-rose-100">
                  Tu kho
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => markFlashcard(true)}
                onMouseDown={(event) => event.preventDefault()}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-xl font-bold"
                aria-label="Biet"
              >
                v
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              {japaneseVoices.length > 0 ? (
                <label className="inline-flex items-center gap-2 rounded-full bg-slate-700 px-3 py-1.5 text-xs text-slate-100">
                  <span>Giong</span>
                  <select
                    value={effectiveJaVoiceName}
                    onChange={(event) => changeJaVoice(event.target.value)}
                    className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-100 outline-none"
                  >
                    {japaneseVoices.map((voice) => (
                      <option key={voice.name} value={voice.name}>
                        {voice.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <button
                type="button"
                className="rounded-full bg-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-100"
                onClick={() => setIsFlipped(false)}
                onMouseDown={(event) => event.preventDefault()}
              >
                Lat lai
              </button>
              <button
                type="button"
                className="rounded-full bg-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-100"
                onClick={() => {
                  toggleShuffle();
                  focusFlashcardArea();
                }}
                onMouseDown={(event) => event.preventDefault()}
              >
                {isShuffled ? "Thu tu goc" : "Dao"}
              </button>
              <button
                type="button"
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  hardItems.length === 0
                    ? "cursor-not-allowed bg-slate-700/60 text-slate-400"
                    : isHardReview
                      ? "bg-rose-500/30 text-rose-100"
                      : "bg-slate-700 text-slate-100"
                }`}
                onClick={toggleHardReview}
                onMouseDown={(event) => event.preventDefault()}
                disabled={hardItems.length === 0}
              >
                {isHardReview
                  ? `Xem tat ca (${items.length})`
                  : `On tu kho (${hardItems.length})`}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {mode === "flashcard" ? (
        <div className="mt-4 rounded-2xl border border-slate-500/40 bg-[#25315a] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-slate-100">
                Danh sach tu chua thuoc ({hardItems.length})
              </h3>
              <p className="mt-1 text-xs text-slate-300">
                Tu nao bam <span className="font-semibold text-rose-300">X</span> se vao day de on lai.
                {hardItems.length > 0 ? ` Trang ${hardPageSafe}/${hardTotalPages}.` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-full border border-slate-400 px-3 py-1 text-xs font-semibold text-slate-100 hover:bg-slate-700"
                onClick={() => setShowHardPanel((prev) => !prev)}
              >
                {showHardPanel ? "An danh sach" : "Hien danh sach"}
              </button>
              <button
                type="button"
                className="rounded-full border border-slate-400 px-3 py-1 text-xs font-semibold text-slate-100 hover:bg-slate-700"
                onClick={toggleHardReview}
                disabled={hardItems.length === 0}
              >
                {isHardReview ? "Dang on tu kho" : "On nhom tu kho"}
              </button>
              <button
                type="button"
                className="rounded-full border border-rose-300/70 px-3 py-1 text-xs font-semibold text-rose-100 hover:bg-rose-500/20"
                onClick={clearHardItems}
                disabled={hardItems.length === 0}
              >
                Xoa danh sach
              </button>
            </div>
          </div>

          {!showHardPanel ? (
            <p className="mt-3 rounded-lg border border-slate-500/40 bg-[#1f2a4f] px-3 py-2 text-sm text-slate-300">
              Danh sach dang duoc thu gon. Bam{" "}
              <span className="font-semibold text-sky-300">Hien danh sach</span> de xem lai.
            </p>
          ) : hardItems.length === 0 ? (
            <p className="mt-3 rounded-lg border border-slate-500/40 bg-[#243056] px-3 py-2 text-sm text-slate-300">
              Chua co tu kho. Bam nut <span className="font-bold text-rose-300">X</span> de danh dau tu can on lai.
            </p>
          ) : (
            <>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {hardPageItems.map((item) => (
                  <article
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-slate-400/50 bg-[#23305a] px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-lg font-semibold text-white">
                        {item.reading || item.word}
                      </p>
                      <p className="truncate text-sm text-slate-300">
                        {item.kanji ? `${item.kanji} · ` : ""}
                        {item.meaning}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="shrink-0 rounded-full border border-slate-300/80 px-3 py-1 text-xs font-semibold text-slate-100 hover:bg-slate-700"
                      onClick={() => removeHardItem(item.id)}
                    >
                      Bo
                    </button>
                  </article>
                ))}
              </div>

              {hardItems.length > HARD_ITEMS_PAGE_SIZE ? (
                <div className="mt-3 flex items-center justify-between rounded-lg border border-slate-500/40 bg-[#1f2a4f] px-3 py-2 text-xs">
                  <button
                    type="button"
                    className="rounded-full border border-slate-400 px-3 py-1 font-semibold text-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                    onClick={() => setHardPage((prev) => Math.max(1, prev - 1))}
                    disabled={hardPageSafe <= 1}
                  >
                    ← Trang truoc
                  </button>
                  <span className="font-semibold text-slate-200">
                    Trang {hardPageSafe} / {hardTotalPages}
                  </span>
                  <button
                    type="button"
                    className="rounded-full border border-slate-400 px-3 py-1 font-semibold text-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                    onClick={() => setHardPage((prev) => Math.min(hardTotalPages, prev + 1))}
                    disabled={hardPageSafe >= hardTotalPages}
                  >
                    Trang sau →
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {mode === "quiz" ? (
        <div className="rounded-2xl bg-[#32416d] p-8">
          <div className="mb-8 flex justify-end">
            <div className="inline-flex rounded-xl bg-slate-700 p-1 text-sm">
              <span className="rounded-lg bg-emerald-500 px-3 py-1 font-semibold text-white">
                Cach doc
              </span>
              <span className="px-3 py-1 text-slate-200">Kanji</span>
              <span className="px-3 py-1 text-slate-200">Y nghia</span>
            </div>
          </div>

          <h2 className="mb-8 text-center text-6xl font-semibold text-white">{current.meaning}</h2>

          <div className="grid gap-3 md:grid-cols-2">
            {quizOptions.map((option, optionIndex) => {
              const optionNo = optionIndex + 1;
              const selected = selectedOptionId === option.id;
              const correct = checkedQuiz && option.id === current.id;
              const wrong = checkedQuiz && selected && option.id !== current.id;
              const optionMain = displayReadingMain(option).trim();
              const optionReading = shouldShowReadingHint(option) ? displayJapanese(option).trim() : "";

              return (
                <button
                  key={`${option.id}-${optionIndex}`}
                  type="button"
                  className={`rounded-xl border px-6 py-5 text-left text-4xl font-semibold transition ${
                    correct
                      ? "border-emerald-300 bg-emerald-600/25"
                      : wrong
                        ? "border-rose-300 bg-rose-600/25"
                        : selected
                          ? "border-sky-300 bg-sky-600/25"
                          : "border-slate-500 bg-[#394971] hover:bg-[#41527e]"
                  }`}
                  onClick={() => !checkedQuiz && setSelectedOptionId(option.id)}
                >
                  <span className="mr-3 text-xl text-slate-300">{optionNo}</span>
                  <span>{optionMain}</span>
                  {optionReading ? (
                    <span className="mt-1 block text-xl font-medium text-slate-300">
                      {optionReading}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="mt-8 flex items-center justify-center gap-4">
            {!checkedQuiz ? (
              <button
                type="button"
                className="rounded-xl bg-orange-500 px-8 py-3 text-xl font-semibold text-white disabled:opacity-50"
                onClick={checkQuiz}
                disabled={!selectedOptionId}
              >
                Kiem tra
              </button>
            ) : (
              <button
                type="button"
                className="rounded-xl bg-emerald-500 px-8 py-3 text-xl font-semibold text-white"
                onClick={goNext}
              >
                {quizCorrect ? "Dung! Tiep tuc" : "Xem cau tiep"}
              </button>
            )}
          </div>
        </div>
      ) : null}

      {mode === "recall" ? (
        <div className="rounded-2xl bg-[#32416d] p-8">
          <h2 className="mb-6 text-center text-6xl font-semibold text-white">{current.meaning}</h2>

          <div className="mb-4 rounded-xl border-2 border-slate-300 bg-[#33425f] p-2">
            <input
              className="w-full rounded-lg bg-transparent px-4 py-3 text-2xl text-white outline-none placeholder:text-slate-400"
              placeholder="Go cach doc, tu goc hoac romaji"
              value={recallInput}
              onChange={(event) => setRecallInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (recallSuccess) {
                    goNext();
                  } else {
                    submitRecall();
                  }
                }
              }}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <button
              type="button"
              className="rounded-xl bg-slate-200 px-5 py-3 text-xl font-semibold text-slate-500 disabled:opacity-60"
              onClick={useHint}
              disabled={hintCount >= 2}
            >
              {hintText}
            </button>
            <button
              type="button"
              className="rounded-xl bg-orange-500 px-5 py-3 text-xl font-semibold text-white"
              onClick={() => {
                if (recallSuccess) {
                  goNext();
                } else {
                  submitRecall();
                }
              }}
            >
              {recallSuccess ? "Cau tiep theo" : "Kiem tra"}
            </button>
          </div>

          <p
            className={`mt-4 text-center text-lg ${
              recallSuccess ? "text-emerald-300" : "text-slate-300"
            }`}
          >
            {recallMessage || "Nhan Enter de kiem tra nhanh"}
          </p>
        </div>
      ) : null}

      <div className="mt-5 flex items-center justify-between text-base text-slate-300">
        <span>
          {index + 1} / {activeCount}
        </span>
        <span>
          Dung {correctCount} | Sai {wrongCount}
        </span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-slate-600/70">
        <div
          className="h-2 rounded-full bg-emerald-400 transition-all"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </section>
  );
}

