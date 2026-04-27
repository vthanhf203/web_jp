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
  isReviewable?: boolean;
};

export type StudyMode = "flashcard" | "quiz";

type Props = {
  title: string;
  backHref: string;
  items: StudyKanjiItem[];
  mode: StudyMode;
};

type Direction = "jp-vi" | "vi-jp";
type QuizPromptMode = "meaning_to_kanji" | "kanji_to_meaning" | "mixed";

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

function makeQuizOptions(items: StudyKanjiItem[], current: StudyKanjiItem): StudyKanjiItem[] {
  const others = items.filter((item) => item.id !== current.id);
  const distractors = shuffleIndices(others.length)
    .slice(0, 3)
    .map((index) => others[index])
    .filter((item): item is StudyKanjiItem => Boolean(item));
  const options = [...distractors, current];
  for (let i = options.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  return options;
}

function pickMixedQuizPromptMode(seed: string): Exclude<QuizPromptMode, "mixed"> {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 2 === 0 ? "meaning_to_kanji" : "kanji_to_meaning";
}

export function KanjiStudyClient({ title, backHref, items, mode }: Props) {
  const [order, setOrder] = useState<number[]>(() => items.map((_, index) => index));
  const [isShuffled, setIsShuffled] = useState(false);
  const [index, setIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [knownCount, setKnownCount] = useState(0);
  const [unknownCount, setUnknownCount] = useState(0);
  const [direction, setDirection] = useState<Direction>("jp-vi");
  const [quizPromptMode, setQuizPromptMode] = useState<QuizPromptMode>("meaning_to_kanji");
  const [selectedOptionId, setSelectedOptionId] = useState("");
  const [checkedQuiz, setCheckedQuiz] = useState(false);
  const [quizCorrect, setQuizCorrect] = useState(false);
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
  const quizOptions = useMemo(() => makeQuizOptions(items, current), [items, current]);
  const effectiveQuizPromptMode =
    quizPromptMode === "mixed"
      ? pickMixedQuizPromptMode(`${current.id}-${index}-${order[index] ?? 0}`)
      : quizPromptMode;
  const canAddToReview = current.isReviewable !== false;
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
    `${current.jlptLevel} - ${current.strokeCount} nét`,
    current.exampleWord
      ? `Ví dụ: ${current.exampleWord}${current.exampleMeaning ? ` - ${current.exampleMeaning}` : ""}`
      : "",
  ]
    .filter(Boolean)
    .join(" | ");

  const viFrontMain = current.meaning;
  const viFrontSub = `${current.jlptLevel} - ${current.strokeCount} nét`;
  const viBackMain = current.character;
  const viBackSub = [
    current.onReading ? `On: ${current.onReading}` : "",
    current.kunReading ? `Kun: ${current.kunReading}` : "",
    current.exampleWord
      ? `Ví dụ: ${current.exampleWord}${current.exampleMeaning ? ` - ${current.exampleMeaning}` : ""}`
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
    setSelectedOptionId("");
    setCheckedQuiz(false);
    setQuizCorrect(false);
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

  const checkQuiz = useCallback(() => {
    if (!selectedOptionId) {
      return;
    }
    const isCorrect = selectedOptionId === current.id;
    setCheckedQuiz(true);
    setQuizCorrect(isCorrect);
    if (isCorrect) {
      setKnownCount((prev) => prev + 1);
      return;
    }
    setUnknownCount((prev) => prev + 1);
  }, [current.id, selectedOptionId]);

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
    if (!canAddToReview) {
      return;
    }
    addDeckFormRef.current?.requestSubmit();
  }, [canAddToReview]);

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
    if (mode !== "flashcard" || !autoPlay) {
      return;
    }
    const timer = window.setTimeout(() => {
      speakCurrent();
    }, 120);
    return () => window.clearTimeout(timer);
  }, [autoPlay, index, mode, speakCurrent]);

  useEffect(() => {
    focusFlashcardArea();

    function onKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();
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
        return;
      }

      if (mode === "quiz") {
        if (key === "q") {
          event.preventDefault();
          setQuizPromptMode("meaning_to_kanji");
          setSelectedOptionId("");
          setCheckedQuiz(false);
          setQuizCorrect(false);
          focusFlashcardArea();
          return;
        }
        if (key === "w") {
          event.preventDefault();
          setQuizPromptMode("kanji_to_meaning");
          setSelectedOptionId("");
          setCheckedQuiz(false);
          setQuizCorrect(false);
          focusFlashcardArea();
          return;
        }
        if (key === "e") {
          event.preventDefault();
          setQuizPromptMode("mixed");
          setSelectedOptionId("");
          setCheckedQuiz(false);
          setQuizCorrect(false);
          focusFlashcardArea();
          return;
        }
        if (["1", "2", "3", "4"].includes(key)) {
          event.preventDefault();
          const optionIndex = Number(key) - 1;
          const option = quizOptions[optionIndex];
          if (!checkedQuiz && option) {
            setSelectedOptionId(option.id);
          }
          focusFlashcardArea();
          return;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          if (!checkedQuiz) {
            checkQuiz();
          } else {
            goNext();
          }
          focusFlashcardArea();
        }
        return;
      }

      if (isSpaceKey(event)) {
        event.preventDefault();
        event.stopPropagation();
        flipCard();
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
      }
    }

    document.addEventListener("keydown", onKeyDown, { capture: true });
    return () => document.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [
    checkedQuiz,
    checkQuiz,
    flipCard,
    focusFlashcardArea,
    goNext,
    goPrev,
    markCard,
    mode,
    quizOptions,
    speakCurrent,
    submitAddToDeck,
  ]);

  const detailHref = `/kanji?q=${encodeURIComponent(current.character)}#kanji-${current.id}`;
  const modeLabel = mode === "quiz" ? "Trắc nghiệm" : "Flashcard";

  if (mode === "quiz") {
    return (
      <section className="mx-auto w-full max-w-[980px] rounded-2xl border border-slate-300 bg-[#2f3c66] text-slate-100 shadow-[0_24px_60px_rgba(15,23,42,0.55)]">
        <div className="relative border-b border-slate-500/20 px-4 py-4">
          <div className="flex items-center justify-between text-slate-300">
            <Link href={detailHref} className="inline-flex items-center gap-2 text-xl">
              <span className="text-lg">[]</span>
              <span>Xem chi ti?t</span>
            </Link>
            <div className="inline-flex items-center gap-2">
              <span className="rounded-full bg-slate-700 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-200">
                {modeLabel}
              </span>
              <Link href={backHref} className="text-3xl leading-none text-slate-400 hover:text-white">
                x
              </Link>
            </div>
          </div>
        </div>

        <div className="p-5">
          <div className="rounded-2xl bg-[#32416d] p-6">
            <div className="mb-5 flex justify-center">
              <div className="inline-flex rounded-xl bg-slate-700 p-1 text-xs">
                <button
                  type="button"
                  className={`rounded-lg px-3 py-1.5 font-semibold transition ${
                    quizPromptMode === "meaning_to_kanji"
                      ? "bg-emerald-500 text-white"
                      : "text-slate-200 hover:bg-slate-600"
                  }`}
                  onClick={() => {
                    setQuizPromptMode("meaning_to_kanji");
                    setSelectedOptionId("");
                    setCheckedQuiz(false);
                    setQuizCorrect(false);
                  }}
                >
                  Nghĩa {"->"} Kanji
                </button>
                <button
                  type="button"
                  className={`rounded-lg px-3 py-1.5 font-semibold transition ${
                    quizPromptMode === "kanji_to_meaning"
                      ? "bg-sky-500 text-white"
                      : "text-slate-200 hover:bg-slate-600"
                  }`}
                  onClick={() => {
                    setQuizPromptMode("kanji_to_meaning");
                    setSelectedOptionId("");
                    setCheckedQuiz(false);
                    setQuizCorrect(false);
                  }}
                >
                  Kanji {"->"} Nghĩa
                </button>
                <button
                  type="button"
                  className={`rounded-lg px-3 py-1.5 font-semibold transition ${
                    quizPromptMode === "mixed"
                      ? "bg-violet-500 text-white"
                      : "text-slate-200 hover:bg-slate-600"
                  }`}
                  onClick={() => {
                    setQuizPromptMode("mixed");
                    setSelectedOptionId("");
                    setCheckedQuiz(false);
                    setQuizCorrect(false);
                  }}
                >
                  Đảo lộn
                </button>
              </div>
            </div>

            <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">
              {effectiveQuizPromptMode === "meaning_to_kanji"
                ? "Chọn Kanji đúng cho nghĩa sau"
                : "Chọn nghĩa đúng cho Kanji sau"}
            </p>
            <h2 className="mt-3 text-center text-5xl font-bold text-white sm:text-6xl">
              {effectiveQuizPromptMode === "meaning_to_kanji" ? current.meaning : current.character}
            </h2>
            <div className="mt-3 rounded-xl border border-slate-500/45 bg-[#2b3a63] px-4 py-3 text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">
                Âm On / Kun
              </p>
              <p className="mt-1 text-sm text-slate-100">
                <span className="font-semibold text-sky-300">On:</span>{" "}
                {current.onReading.trim() || "-"}
              </p>
              <p className="text-sm text-slate-100">
                <span className="font-semibold text-orange-300">Kun:</span>{" "}
                {current.kunReading.trim() || "-"}
              </p>
            </div>
            <p className="mt-2 text-center text-sm text-slate-300">
              Câu {index + 1}/{items.length}
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {quizOptions.map((option, optionIndex) => {
                const optionNo = optionIndex + 1;
                const selected = selectedOptionId === option.id;
                const correct = checkedQuiz && option.id === current.id;
                const wrong = checkedQuiz && selected && option.id !== current.id;
                return (
                  <button
                    key={`${option.id}-${optionIndex}`}
                    type="button"
                    className={`rounded-xl border px-5 py-4 text-left transition ${
                      correct
                        ? "border-emerald-300 bg-emerald-600/25"
                        : wrong
                          ? "border-rose-300 bg-rose-600/25"
                          : selected
                            ? "border-sky-300 bg-sky-600/25"
                            : "border-slate-500 bg-[#394971] hover:bg-[#41527e]"
                    }`}
                    onClick={() => {
                      if (checkedQuiz) {
                        return;
                      }
                      setSelectedOptionId(option.id);
                    }}
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">
                      {optionNo}. Lựa chọn
                    </p>
                    <p className="mt-1 text-4xl font-bold text-white">
                      {effectiveQuizPromptMode === "meaning_to_kanji" ? option.character : option.meaning}
                    </p>
                    {effectiveQuizPromptMode === "meaning_to_kanji" ? (
                      <div className="mt-1 space-y-0.5 text-sm text-slate-300">
                        <p>
                          <span className="font-semibold text-sky-300">On:</span>{" "}
                          {option.onReading.trim() || "-"}
                        </p>
                        <p>
                          <span className="font-semibold text-orange-300">Kun:</span>{" "}
                          {option.kunReading.trim() || "-"}
                        </p>
                      </div>
                    ) : (
                      <p className="mt-1 text-sm text-slate-300">
                        {option.character} · On: {option.onReading.trim() || "-"} · Kun:{" "}
                        {option.kunReading.trim() || "-"}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              {!checkedQuiz ? (
                <button
                  type="button"
                  className="rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={checkQuiz}
                  disabled={!selectedOptionId}
                >
                  Kiểm tra
                </button>
              ) : (
                <button
                  type="button"
                  className="rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white"
                  onClick={goNext}
                >
                  {quizCorrect ? "Đúng rồi, câu tiếp" : "Câu tiếp theo"}
                </button>
              )}
              <button
                type="button"
                className="rounded-xl bg-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-100"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  toggleShuffle();
                  focusFlashcardArea();
                }}
              >
                {isShuffled ? "Thứ tự gốc" : "Đảo thứ tự câu"}
              </button>
              <button
                type="button"
                className="rounded-xl bg-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-100"
                onMouseDown={(event) => event.preventDefault()}
                onClick={speakCurrent}
              >
                Loa
              </button>
            </div>

            <p className="mt-3 text-center text-sm text-slate-300">
              Phím tắt: Q/W/E đổi kiểu câu hỏi, 1-4 chọn đáp án, Enter kiểm tra/câu tiếp, mũi tên trái-phải để chuyển câu.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 bg-[#1f2848] px-5 py-4">
          <form ref={addDeckFormRef} action={addKanjiToReviewAction}>
            <input type="hidden" name="kanjiId" value={current.id} />
            <button
              type="submit"
              onMouseDown={(event) => event.preventDefault()}
              className={`inline-flex h-11 w-11 items-center justify-center rounded-full border text-3xl ${
                canAddToReview
                  ? "border-slate-500 bg-slate-700 text-slate-200"
                  : "cursor-not-allowed border-slate-600 bg-slate-800/60 text-slate-500"
              }`}
              title={canAddToReview ? "Lưu để ôn tập" : "Kanji cá nhân chưa hỗ trợ lưu vào review"}
              disabled={!canAddToReview}
            >
              +
            </button>
          </form>

          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rounded-full bg-slate-700 px-4 py-2 text-sm font-semibold text-slate-200"
              onClick={goPrev}
            >
              {"<"} C?u tr?c
            </button>
            <button
              type="button"
              className="rounded-full bg-slate-700 px-4 py-2 text-sm font-semibold text-slate-200"
              onClick={goNext}
            >
              C?u sau {">"}
            </button>
          </div>
        </div>

        <div className="h-2 rounded-b-2xl bg-slate-700/70">
          <div
            className="h-2 rounded-b-2xl bg-emerald-400 transition-all"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="px-5 py-3 text-sm text-slate-300">
          Đúng: {knownCount} | Sai: {unknownCount} | Chủ đề: {title}
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-[980px] rounded-2xl border border-slate-300 bg-[#2f3c66] text-slate-100 shadow-[0_24px_60px_rgba(15,23,42,0.55)]">
      <div className="relative border-b border-slate-500/20 px-4 py-4">
        <div className="flex items-center justify-between text-slate-300">
          <Link href={detailHref} className="inline-flex items-center gap-2 text-xl">
            <span className="text-lg">[]</span>
            <span>Xem chi ti?t</span>
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
            aria-label="Th? tr?c"
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
            aria-label="Th? sau"
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
        Phím tắt: <span className="rounded-md bg-slate-500/55 px-2 py-0.5">Space</span> lật
        <span className="ml-2 rounded-md bg-slate-500/55 px-2 py-0.5">Z</span> biết
        <span className="ml-2 rounded-md bg-slate-500/55 px-2 py-0.5">X</span> chưa biết
        <span className="ml-2 rounded-md bg-slate-500/55 px-2 py-0.5">C</span> lưu ôn tập
        <span className="ml-2 rounded-md bg-slate-500/55 px-2 py-0.5">R</span> phát âm
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#1f2848] px-5 py-4">
        <form ref={addDeckFormRef} action={addKanjiToReviewAction}>
          <input type="hidden" name="kanjiId" value={current.id} />
          <button
            type="submit"
            onMouseDown={(event) => event.preventDefault()}
            className={`inline-flex h-11 w-11 items-center justify-center rounded-full border text-3xl ${
              canAddToReview
                ? "border-slate-500 bg-slate-700 text-slate-200"
                : "cursor-not-allowed border-slate-600 bg-slate-800/60 text-slate-500"
            }`}
            title={canAddToReview ? "Lưu để ôn tập" : "Kanji cá nhân chưa hỗ trợ lưu vào review"}
            disabled={!canAddToReview}
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
            aria-label="Không biết"
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
            aria-label="Bi?t"
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
            L?t l?i
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
            {isShuffled ? "Thứ tự gốc" : "Đảo"}
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
        Biết: {knownCount} | Chưa biết: {unknownCount} | Chủ đề: {title}
      </div>
    </section>
  );
}

