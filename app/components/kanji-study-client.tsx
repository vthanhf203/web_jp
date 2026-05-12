"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { addKanjiToReviewAction } from "@/app/actions/study";
import {
  AUDIO_AUTOPLAY_KEY,
  AUDIO_RATE_KEY,
  AUDIO_VOICE_KEY,
} from "@/app/components/audio-settings-client";
import {
  readLearningProgress,
  upsertLearningProgress,
} from "@/app/components/learning-progress-storage";

type StudyKanjiItem = {
  id: string;
  character: string;
  meaning: string;
  hanviet?: string;
  onReading: string;
  kunReading: string;
  strokeCount: number;
  exampleWord: string;
  exampleMeaning: string;
  jlptLevel: string;
  isReviewable?: boolean;
  relatedWords?: Array<{
    id: string;
    word: string;
    reading: string;
    meaning: string;
    hanviet?: string;
    exampleSentence?: string;
    exampleMeaning?: string;
    sourceLabel?: string;
  }>;
};

export type StudyMode = "flashcard" | "quiz" | "recall";

type Props = {
  title: string;
  backHref: string;
  items: StudyKanjiItem[];
  mode: StudyMode;
  relatedVocabCount?: number;
  relatedVocabFlashcardHref?: string;
  relatedVocabQuizHref?: string;
  relatedVocabRecallHref?: string;
};

type Direction = "jp-vi" | "vi-jp";
type QuizPromptMode = "meaning_to_kanji" | "kanji_to_meaning" | "kanji_to_hiragana" | "mixed";
const HARD_ITEMS_PAGE_SIZE = 8;
const RELATED_WORD_PREVIEW_LIMIT = 8;

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

function splitReadings(value: string): string[] {
  return value
    .split(/[,\u3001\u30fb/]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function katakanaToHiragana(value: string): string {
  return value.replace(/[\u30a1-\u30f6]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0x60)
  );
}

function pickPrimaryHiraganaReading(item: StudyKanjiItem): string {
  const kun = splitReadings(item.kunReading)[0] ?? "";
  if (kun) {
    return kun;
  }
  const on = splitReadings(item.onReading)[0] ?? "";
  if (on) {
    return katakanaToHiragana(on);
  }
  return "";
}

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeRecallInput(value: string): string {
  return value.trim().replace(/\s+/g, "").toLowerCase();
}

function buildRelatedWordLabel(input: {
  word: string;
  reading: string;
  meaning: string;
  hanviet?: string;
  exampleSentence?: string;
  exampleMeaning?: string;
}): string {
  const surface = compactWhitespace(input.word || "");
  const reading = compactWhitespace(input.reading || "");
  const meaning = compactWhitespace(input.meaning || "");
  const hanviet = compactWhitespace(input.hanviet || "");
  const exampleSentence = compactWhitespace(input.exampleSentence || "");
  const exampleMeaning = compactWhitespace(input.exampleMeaning || "");
  if (!surface || !meaning) {
    return "";
  }

  const left = reading ? `${surface} (${reading})` : surface;
  const right = hanviet ? `${hanviet.toUpperCase()} - ${meaning}` : meaning;
  const exampleRaw = exampleSentence || exampleMeaning;
  const example = exampleRaw.length > 48 ? `${exampleRaw.slice(0, 48).trim()}...` : exampleRaw;
  return example ? `${left}: ${right} · VD: ${example}` : `${left}: ${right}`;
}

export function KanjiStudyClient({
  title,
  backHref,
  items,
  mode,
  relatedVocabCount = 0,
  relatedVocabFlashcardHref,
  relatedVocabQuizHref,
  relatedVocabRecallHref,
}: Props) {
  const router = useRouter();
  const [order, setOrder] = useState<number[]>(() => items.map((_, index) => index));
  const [isShuffled, setIsShuffled] = useState(false);
  const [index, setIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [knownCount, setKnownCount] = useState(0);
  const [unknownCount, setUnknownCount] = useState(0);
  const [hardItemIds, setHardItemIds] = useState<string[]>([]);
  const [isHardReview, setIsHardReview] = useState(false);
  const [showHardPanel, setShowHardPanel] = useState(true);
  const [hardPage, setHardPage] = useState(1);
  const [direction, setDirection] = useState<Direction>("jp-vi");
  const [quizPromptMode, setQuizPromptMode] = useState<QuizPromptMode>("meaning_to_kanji");
  const [selectedOptionId, setSelectedOptionId] = useState("");
  const [checkedQuiz, setCheckedQuiz] = useState(false);
  const [quizCorrect, setQuizCorrect] = useState(false);
  const [recallInput, setRecallInput] = useState("");
  const [recallMessage, setRecallMessage] = useState("");
  const [recallSuccess, setRecallSuccess] = useState(false);
  const [recallHintCount, setRecallHintCount] = useState(0);
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
  const recallInputRef = useRef<HTMLInputElement | null>(null);
  const addDeckFormRef = useRef<HTMLFormElement | null>(null);
  const restoredProgressRef = useRef(false);
  const [sessionHref, setSessionHref] = useState("");

  const itemOrderKey = useMemo(() => items.map((item) => item.id).join(","), [items]);
  const effectiveOrder =
    order.length === items.length ? order : Array.from({ length: items.length }, (_, idx) => idx);
  const hardIdSet = useMemo(() => new Set(hardItemIds), [hardItemIds]);
  const hardOrder = useMemo(
    () =>
      effectiveOrder.filter((orderIndex) => {
        const target = items[orderIndex];
        return target ? hardIdSet.has(target.id) : false;
      }),
    [effectiveOrder, hardIdSet, items]
  );
  const activeOrder =
    (mode === "flashcard" || mode === "recall") && isHardReview && hardOrder.length > 0
      ? hardOrder
      : effectiveOrder;
  const activeCount = activeOrder.length;
  const normalizedIndex = index >= 0 && index < activeCount ? index : 0;
  const currentOrderIndex = activeOrder[normalizedIndex] ?? activeOrder[0] ?? 0;
  const current = items[currentOrderIndex] ?? items[0];
  const hardItems = useMemo(() => {
    const map = new Map(items.map((item) => [item.id, item]));
    return hardItemIds.map((id) => map.get(id)).filter((item): item is StudyKanjiItem => !!item);
  }, [hardItemIds, items]);
  const hardTotalPages = Math.max(1, Math.ceil(hardItems.length / HARD_ITEMS_PAGE_SIZE));
  const hardPageSafe = Math.min(hardPage, hardTotalPages);
  const hardPageItems = useMemo(() => {
    const start = (hardPageSafe - 1) * HARD_ITEMS_PAGE_SIZE;
    return hardItems.slice(start, start + HARD_ITEMS_PAGE_SIZE);
  }, [hardItems, hardPageSafe]);
  const quizOptions = useMemo(() => makeQuizOptions(items, current), [items, current]);
  const effectiveQuizPromptMode =
    quizPromptMode === "mixed"
      ? pickMixedQuizPromptMode(`${current.id}-${normalizedIndex}-${currentOrderIndex}`)
      : quizPromptMode;
  const canAddToReview = current.isReviewable !== false;
  const progressPercent = activeCount > 0 ? ((normalizedIndex + 1) / activeCount) * 100 : 0;

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

  const onReadingParts = splitReadings(current.onReading || "");
  const kunReadingParts = splitReadings(current.kunReading || "");
  const hanvietSub = current.hanviet?.trim() ? `Hán Việt: ${current.hanviet.trim()}` : "";

  const exampleSub = current.exampleWord
    ? `Ví dụ: ${current.exampleWord}${current.exampleMeaning ? ` - ${current.exampleMeaning}` : ""}`
    : "";

  const relatedWordPreview = (current.relatedWords ?? [])
    .map((entry) =>
      buildRelatedWordLabel({
        word: entry.word,
        reading: entry.reading,
        meaning: entry.meaning,
        hanviet: entry.hanviet,
        exampleSentence: entry.exampleSentence,
        exampleMeaning: entry.exampleMeaning,
      })
    )
    .filter(Boolean);
  const relatedWordPreviewVisible = relatedWordPreview.slice(0, RELATED_WORD_PREVIEW_LIMIT);
  const relatedWordPreviewOverflow = Math.max(
    0,
    relatedWordPreview.length - relatedWordPreviewVisible.length
  );
  const compactBackSub = [hanvietSub, exampleSub].filter(Boolean).join(" | ");
  const shouldScrollBackPanel =
    relatedWordPreview.length > 4 ||
    onReadingParts.length + kunReadingParts.length > 8 ||
    compactBackSub.length > 140;

  const activeRelatedKanji = useMemo(() => {
    if ((mode === "flashcard" || mode === "recall") && isHardReview && hardOrder.length > 0) {
      return hardOrder
        .map((orderIndex) => items[orderIndex])
        .filter((item): item is StudyKanjiItem => Boolean(item));
    }
    return items;
  }, [hardOrder, isHardReview, items, mode]);

  const activeRelatedKanjiIds = useMemo(
    () => Array.from(new Set(activeRelatedKanji.map((item) => item.id).filter(Boolean))),
    [activeRelatedKanji]
  );

  const activeRelatedVocabCount = useMemo(() => {
    const unique = new Set<string>();
    for (const kanji of activeRelatedKanji) {
      for (const word of kanji.relatedWords ?? []) {
        const surface = (word.word || "").trim();
        const reading = (word.reading || "").trim();
        const meaning = (word.meaning || "").trim();
        if (!surface || !meaning) {
          continue;
        }
        unique.add(`${surface}|${reading}|${meaning}`.toLowerCase());
      }
    }
    return unique.size;
  }, [activeRelatedKanji]);

  const buildRelatedHref = useCallback(
    (nextMode: "flashcard" | "quiz" | "recall"): string => {
      const seed =
        nextMode === "quiz"
          ? relatedVocabQuizHref || relatedVocabFlashcardHref || "/kanji/learn"
          : nextMode === "recall"
            ? relatedVocabRecallHref ||
              relatedVocabFlashcardHref ||
              relatedVocabQuizHref ||
              "/kanji/learn"
          : relatedVocabFlashcardHref || relatedVocabQuizHref || "/kanji/learn";
      const url = new URL(seed, "https://local.app");
      const params = new URLSearchParams(url.search);
      params.delete("q");
      params.set("related", "vocab");
      if (nextMode === "quiz") {
        params.set("mode", "quiz");
      } else if (nextMode === "recall") {
        params.set("mode", "recall");
      } else {
        params.delete("mode");
      }
      if (activeRelatedKanjiIds.length > 0) {
        params.set("ids", activeRelatedKanjiIds.join(","));
      } else {
        params.delete("ids");
      }
      const queryString = params.toString();
      return queryString ? `/kanji/learn?${queryString}` : "/kanji/learn";
    },
    [activeRelatedKanjiIds, relatedVocabFlashcardHref, relatedVocabQuizHref, relatedVocabRecallHref]
  );

  const activeRelatedVocabFlashcardHref = useMemo(
    () => buildRelatedHref("flashcard"),
    [buildRelatedHref]
  );
  const activeRelatedVocabQuizHref = useMemo(() => buildRelatedHref("quiz"), [buildRelatedHref]);
  const activeRelatedVocabRecallHref = useMemo(() => buildRelatedHref("recall"), [buildRelatedHref]);
  const hasRelatedVocabDeck =
    activeRelatedVocabCount > 0 &&
    Boolean(activeRelatedVocabFlashcardHref) &&
    Boolean(activeRelatedVocabQuizHref) &&
    Boolean(activeRelatedVocabRecallHref);

  const jpFrontMain = current.character;
  const jpFrontSub = "";

  const jpBackMain = current.meaning;
  const jpBackSub = [hanvietSub, current.character ? `Kanji: ${current.character}` : "", exampleSub]
    .filter(Boolean)
    .join(" | ");

  const viFrontMain = current.meaning;
  const viFrontSub = "";
  const viBackMain = current.character;
  const viBackSub = [hanvietSub, exampleSub].filter(Boolean).join(" | ");

  const frontMain = direction === "jp-vi" ? jpFrontMain : viFrontMain;
  const frontSub = direction === "jp-vi" ? jpFrontSub : viFrontSub;
  const backMain = direction === "jp-vi" ? jpBackMain : viBackMain;
  const backSub = direction === "jp-vi" ? jpBackSub : viBackSub;

  const pickMainClass = (text: string): string => {
    const trimmed = text.trim();
    const hasJapanese = hasJapaneseChars(trimmed);
    const length = trimmed.length;
    if (hasJapanese) {
      return length > 8 ? "text-5xl sm:text-6xl" : "text-8xl sm:text-[7.25rem]";
    }
    if (length > 24) {
      return "text-4xl sm:text-5xl";
    }
    return "text-5xl sm:text-6xl";
  };
  const frontMainClass = pickMainClass(frontMain);
  const backMainClass = pickMainClass(backMain);

  const focusFlashcardArea = useCallback(() => {
    flashRef.current?.focus();
  }, []);

  const resetPerCard = useCallback(() => {
    setIsFlipped(false);
    setSelectedOptionId("");
    setCheckedQuiz(false);
    setQuizCorrect(false);
    setRecallInput("");
    setRecallMessage("");
    setRecallSuccess(false);
    setRecallHintCount(0);
  }, []);

  const goNext = useCallback(() => {
    setIndex((prev) => {
      if (activeCount <= 0) {
        return 0;
      }
      return (prev + 1) % activeCount;
    });
    resetPerCard();
  }, [activeCount, resetPerCard]);

  const goPrev = useCallback(() => {
    setIndex((prev) => {
      if (activeCount <= 0) {
        return 0;
      }
      return (prev - 1 + activeCount) % activeCount;
    });
    resetPerCard();
  }, [activeCount, resetPerCard]);

  const flipCard = useCallback(() => {
    setIsFlipped((prev) => !prev);
  }, []);

  const markCard = useCallback(
    (isKnown: boolean) => {
      if (isKnown) {
        setKnownCount((prev) => prev + 1);
      } else {
        setUnknownCount((prev) => prev + 1);
        setHardItemIds((prev) => (prev.includes(current.id) ? prev : [...prev, current.id]));
      }
      goNext();
    },
    [current.id, goNext]
  );

  const toggleHardReview = useCallback(() => {
    if (hardOrder.length === 0) {
      return;
    }
    setIsHardReview((prev) => !prev);
    setIndex(0);
    resetPerCard();
    focusFlashcardArea();
  }, [focusFlashcardArea, hardOrder.length, resetPerCard]);

  const removeHardItem = useCallback((itemId: string) => {
    setHardItemIds((prev) => prev.filter((id) => id !== itemId));
  }, []);

  const clearHardItems = useCallback(() => {
    setHardItemIds([]);
    setIsHardReview(false);
    setHardPage(1);
  }, []);

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

  const submitRecall = useCallback(() => {
    if (recallSuccess) {
      goNext();
      return;
    }

    const candidate = normalizeRecallInput(recallInput);
    const answer = normalizeRecallInput(current.character);
    const isCorrect = candidate.length > 0 && candidate === answer;
    if (isCorrect) {
      setRecallMessage("Đúng rồi!");
      setRecallSuccess(true);
      setKnownCount((prev) => prev + 1);
      return;
    }

    setRecallMessage("Chưa đúng, thử lại nhé.");
    setRecallSuccess(false);
    setUnknownCount((prev) => prev + 1);
    setHardItemIds((prev) => (prev.includes(current.id) ? prev : [...prev, current.id]));
  }, [current.character, current.id, goNext, recallInput, recallSuccess]);

  const useRecallHint = useCallback(() => {
    setRecallHintCount((prev) => Math.min(prev + 1, 2));
  }, []);

  const recallHintText =
    recallHintCount === 0
      ? "Gợi ý (0/2)"
      : recallHintCount === 1
        ? `Số nét: ${current.strokeCount}${current.hanviet ? ` · Hán Việt: ${current.hanviet}` : ""}`
        : `On: ${current.onReading.trim() || "-"} · Kun: ${current.kunReading.trim() || "-"}`;

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

  useEffect(() => {
    setOrder(Array.from({ length: items.length }, (_, idx) => idx));
    setIsShuffled(false);
    setIndex(0);
    resetPerCard();
  }, [itemOrderKey, items.length, resetPerCard]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const href = `${window.location.pathname}${window.location.search}`;
    setSessionHref(href);
    const saved = readLearningProgress(href);
    if (saved && saved.itemSignature === itemOrderKey && saved.totalCount > 0) {
      if (saved.order?.length === items.length) {
        setOrder(saved.order);
        setIsShuffled(Boolean(saved.isShuffled));
      }
      setHardItemIds(saved.hardItemIds ?? []);
      setIsHardReview(Boolean(saved.isHardReview && (saved.hardItemIds?.length ?? 0) > 0));
      setIndex(Math.min(Math.max(0, saved.currentIndex), Math.max(0, items.length - 1)));
    }
    restoredProgressRef.current = true;
  }, [itemOrderKey, items.length]);

  useEffect(() => {
    if (!restoredProgressRef.current || !sessionHref || !current) {
      return;
    }

    upsertLearningProgress({
      id: sessionHref,
      href: sessionHref,
      kind: "kanji",
      title,
      mode,
      currentIndex: normalizedIndex,
      totalCount: activeCount,
      percent: Math.round(progressPercent),
      currentLabel: current.character,
      subLabel: [current.hanviet, current.meaning].filter(Boolean).join(" · "),
      hardCount: hardItems.length,
      hardItemIds,
      isHardReview,
      order,
      isShuffled,
      itemSignature: itemOrderKey,
      updatedAt: Date.now(),
    });
  }, [
    activeCount,
    current,
    hardItemIds,
    hardItems.length,
    isShuffled,
    isHardReview,
    itemOrderKey,
    mode,
    normalizedIndex,
    order,
    progressPercent,
    sessionHref,
    title,
  ]);

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
  }, [autoPlay, mode, normalizedIndex, speakCurrent]);

  useEffect(() => {
    if (mode !== "recall") {
      return;
    }
    recallInputRef.current?.focus({ preventScroll: true });
  }, [current.id, mode]);

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
        if (key === "t") {
          event.preventDefault();
          setQuizPromptMode("kanji_to_hiragana");
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

      if (mode === "recall") {
        if (event.key === "Enter") {
          event.preventDefault();
          submitRecall();
          recallInputRef.current?.focus({ preventScroll: true });
          return;
        }
        if (key === "h") {
          event.preventDefault();
          useRecallHint();
          recallInputRef.current?.focus({ preventScroll: true });
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
    submitRecall,
    submitAddToDeck,
    useRecallHint,
  ]);

  const detailHref = `/kanji?q=${encodeURIComponent(current.character)}#kanji-${current.id}`;
  const modeLabel = mode === "quiz" ? "Trắc nghiệm" : mode === "recall" ? "Nhồi nhét" : "Flashcard";
  const handleGoBack = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(backHref);
  }, [backHref, router]);

  if (mode === "quiz") {
    return (
      <section className="mx-auto w-full max-w-[980px] rounded-2xl border border-slate-300 bg-[#2f3c66] text-slate-100 shadow-[0_24px_60px_rgba(15,23,42,0.55)]">
        <div className="relative border-b border-slate-500/20 px-4 py-4">
          <div className="flex items-center justify-between text-slate-300">
            <Link href={detailHref} className="inline-flex items-center gap-2 text-xl">
              <span className="text-lg">&#8599;</span>
              <span>Xem chi tiết</span>
            </Link>
            <div className="inline-flex items-center gap-2">
              <span className="rounded-full bg-slate-700 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-200">
                {modeLabel}
              </span>
              <button
                type="button"
                onClick={handleGoBack}
                className="text-3xl leading-none text-slate-400 hover:text-white"
              >
                x
              </button>
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
                    quizPromptMode === "kanji_to_hiragana"
                      ? "bg-fuchsia-500 text-white"
                      : "text-slate-200 hover:bg-slate-600"
                  }`}
                  onClick={() => {
                    setQuizPromptMode("kanji_to_hiragana");
                    setSelectedOptionId("");
                    setCheckedQuiz(false);
                    setQuizCorrect(false);
                  }}
                >
                  Kanji {"->"} Hiragana
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
                : effectiveQuizPromptMode === "kanji_to_hiragana"
                  ? "Chọn cách đọc Hiragana đúng cho Kanji sau"
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
              Câu {normalizedIndex + 1}/{activeCount}
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {quizOptions.map((option, optionIndex) => {
                const optionNo = optionIndex + 1;
                const selected = selectedOptionId === option.id;
                const correct = checkedQuiz && option.id === current.id;
                const wrong = checkedQuiz && selected && option.id !== current.id;
                const optionReadingHiragana = pickPrimaryHiraganaReading(option);
                const showMeaningAfterSelect =
                  effectiveQuizPromptMode === "kanji_to_hiragana" &&
                  (selected || (checkedQuiz && option.id === current.id));
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
                      {effectiveQuizPromptMode === "meaning_to_kanji"
                        ? option.character
                        : effectiveQuizPromptMode === "kanji_to_hiragana"
                          ? optionReadingHiragana || option.character
                          : option.meaning}
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
                    ) : effectiveQuizPromptMode === "kanji_to_hiragana" ? (
                      <div className="mt-1 space-y-0.5 text-sm text-slate-300">
                        <p>
                          {option.character} | On: {option.onReading.trim() || "-"} | Kun:{" "}
                          {option.kunReading.trim() || "-"}
                        </p>
                        {showMeaningAfterSelect ? (
                          <p>
                            <span className="font-semibold text-emerald-300">Nghĩa:</span>{" "}
                            {option.meaning}
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <p className="mt-1 text-sm text-slate-300">
                        {option.character} | On: {option.onReading.trim() || "-"} | Kun:{" "}
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
              Phím tắt: Q/W/E/T đổi kiểu câu hỏi, 1-4 chọn đáp án, Enter kiểm tra/câu tiếp, mũi tên trái-phải để chuyển câu.
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
              {"<"} Câu trước
            </button>
            <button
              type="button"
              className="rounded-full bg-slate-700 px-4 py-2 text-sm font-semibold text-slate-200"
              onClick={goNext}
            >
              Câu sau {">"}
            </button>
          </div>
        </div>

        <div className="h-2 overflow-hidden rounded-b-2xl bg-slate-700/70">
          <div
            className="h-2 bg-emerald-400 transition-all"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="px-5 py-3 text-sm text-slate-300">
          Đúng: {knownCount} | Sai: {unknownCount} | Chủ đề: {title}
        </div>
      </section>
    );
  }

  if (mode === "recall") {
    return (
      <section className="mx-auto w-full max-w-[980px] rounded-2xl border border-slate-300 bg-[#2f3c66] text-slate-100 shadow-[0_24px_60px_rgba(15,23,42,0.55)]">
        <div className="relative border-b border-slate-500/20 px-4 py-4">
          <div className="flex items-center justify-between text-slate-300">
            <Link href={detailHref} className="inline-flex items-center gap-2 text-xl">
              <span className="text-lg">&#8599;</span>
              <span>Xem chi tiết</span>
            </Link>
            <div className="inline-flex items-center gap-2">
              <span className="rounded-full bg-slate-700 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-200">
                {modeLabel}
              </span>
              <button
                type="button"
                onClick={handleGoBack}
                className="text-3xl leading-none text-slate-400 hover:text-white"
              >
                x
              </button>
            </div>
          </div>
        </div>

        <div className="p-5">
          <div className="rounded-2xl bg-[#32416d] p-6">
            <div className="mb-5 text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">
                Nhập đúng chữ Kanji
              </p>
              <h2 className="mt-3 text-5xl font-bold leading-tight text-white sm:text-6xl">
                {current.meaning}
              </h2>
              <div className="mx-auto mt-3 flex max-w-2xl flex-wrap items-center justify-center gap-2 text-sm text-slate-200">
                {current.hanviet ? (
                  <span className="rounded-full bg-slate-700 px-3 py-1">
                    Hán Việt: {current.hanviet}
                  </span>
                ) : null}
                <span className="rounded-full bg-slate-700 px-3 py-1">
                  {current.jlptLevel} · {current.strokeCount} nét
                </span>
                {current.exampleWord ? (
                  <span className="rounded-full bg-slate-700 px-3 py-1">
                    VD: {current.exampleWord}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="mx-auto max-w-xl rounded-xl border-2 border-slate-300 bg-[#33425f] p-2">
              <input
                ref={recallInputRef}
                className="w-full rounded-lg bg-transparent px-4 py-3 text-center text-4xl font-semibold text-white outline-none placeholder:text-base placeholder:font-medium placeholder:text-slate-400"
                placeholder="Gõ chữ Kanji"
                value={recallInput}
                onChange={(event) => {
                  setRecallInput(event.target.value);
                  if (recallSuccess) {
                    setRecallSuccess(false);
                    setRecallMessage("");
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    submitRecall();
                  }
                }}
              />
            </div>

            <div className="mx-auto mt-4 grid max-w-xl gap-2.5 sm:grid-cols-2">
              <button
                type="button"
                className="rounded-xl bg-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 disabled:opacity-60"
                onClick={useRecallHint}
                disabled={recallHintCount >= 2}
                onMouseDown={(event) => event.preventDefault()}
              >
                {recallHintText}
              </button>
              <button
                type="button"
                className="rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white"
                onClick={submitRecall}
                onMouseDown={(event) => event.preventDefault()}
              >
                {recallSuccess ? "Câu tiếp theo" : "Kiểm tra"}
              </button>
            </div>

            <p
              className={`mt-3 min-h-7 text-center text-base ${
                recallSuccess ? "text-emerald-300" : "text-slate-300"
              }`}
            >
              {recallMessage || "Nhấn Enter để kiểm tra nhanh"}
            </p>

            {recallSuccess ? (
              <div className="mx-auto mt-3 max-w-2xl rounded-xl border border-emerald-300/40 bg-emerald-500/12 px-4 py-3 text-center">
                <p className="text-6xl font-bold text-white">{current.character}</p>
                <p className="mt-2 text-sm text-emerald-100">
                  On: {current.onReading.trim() || "-"} · Kun: {current.kunReading.trim() || "-"}
                </p>
              </div>
            ) : null}

            {hasRelatedVocabDeck ? (
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <Link
                  href={activeRelatedVocabFlashcardHref}
                  className="rounded-full border border-emerald-300/50 bg-emerald-400/20 px-3 py-1.5 text-xs font-semibold text-emerald-50 hover:bg-emerald-400/30"
                >
                  Flashcard {activeRelatedVocabCount} từ liên quan
                </Link>
                <Link
                  href={activeRelatedVocabQuizHref}
                  className="rounded-full border border-sky-300/50 bg-sky-400/20 px-3 py-1.5 text-xs font-semibold text-sky-50 hover:bg-sky-400/30"
                >
                  Quiz nhanh
                </Link>
                <Link
                  href={activeRelatedVocabRecallHref}
                  className="rounded-full border border-orange-300/50 bg-orange-400/20 px-3 py-1.5 text-xs font-semibold text-orange-50 hover:bg-orange-400/30"
                >
                  Nhồi từ liên quan
                </Link>
              </div>
            ) : null}
          </div>
        </div>

        <div className="border-y border-slate-500/35 bg-[#44517a] px-4 py-2 text-base text-slate-200 sm:text-lg">
          Phím tắt: <span className="rounded-md bg-slate-500/55 px-1.5 py-0.5 text-sm font-semibold">Enter</span> kiểm tra
          <span className="ml-2 rounded-md bg-slate-500/55 px-1.5 py-0.5 text-sm font-semibold">H</span> gợi ý
          <span className="ml-2 rounded-md bg-slate-500/55 px-1.5 py-0.5 text-sm font-semibold">R</span> phát âm
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

          <div className="flex items-center gap-4">
            <button
              type="button"
              className="rounded-full bg-slate-700 px-4 py-2 text-sm font-semibold text-slate-200"
              onMouseDown={(event) => event.preventDefault()}
              onClick={goPrev}
            >
              {"<"} Câu trước
            </button>
            <span className="text-3xl font-semibold">
              {normalizedIndex + 1} / {activeCount}
            </span>
            <button
              type="button"
              className="rounded-full bg-slate-700 px-4 py-2 text-sm font-semibold text-slate-200"
              onMouseDown={(event) => event.preventDefault()}
              onClick={goNext}
            >
              Câu sau {">"}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-full bg-slate-700 px-4 py-2 text-sm font-semibold text-slate-200"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                toggleShuffle();
                recallInputRef.current?.focus({ preventScroll: true });
              }}
            >
              {isShuffled ? "Thứ tự gốc" : "Đảo"}
            </button>
            <button
              type="button"
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                hardItems.length === 0
                  ? "cursor-not-allowed bg-slate-700/60 text-slate-400"
                  : isHardReview
                    ? "bg-rose-500/30 text-rose-100"
                    : "bg-slate-700 text-slate-200"
              }`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                toggleHardReview();
                recallInputRef.current?.focus({ preventScroll: true });
              }}
              disabled={hardItems.length === 0}
            >
              {isHardReview ? `Xem tất cả (${items.length})` : `Ôn chữ khó (${hardItems.length})`}
            </button>
            <button
              type="button"
              className="rounded-full bg-slate-700 px-4 py-2 text-sm font-semibold text-slate-200"
              onMouseDown={(event) => event.preventDefault()}
              onClick={speakCurrent}
            >
              Loa
            </button>
          </div>
        </div>

        <div className="h-2 overflow-hidden rounded-b-2xl bg-slate-700/70">
          <div className="h-2 bg-emerald-400 transition-all" style={{ width: `${progressPercent}%` }} />
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
            <span className="text-lg">&#8599;</span>
            <span>Xem chi tiết</span>
          </Link>
          <button
            type="button"
            onClick={handleGoBack}
            className="text-3xl leading-none text-slate-400 hover:text-white"
          >
            x
          </button>
        </div>

        <div
          role="button"
          ref={flashRef}
          tabIndex={0}
          className="relative mt-4 min-h-[440px] cursor-pointer select-none rounded-xl outline-none sm:min-h-[470px]"
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
            aria-label="Thẻ trước"
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
            aria-label="Thẻ sau"
          >
            {">"}
          </button>

          <div className="mx-auto w-full max-w-3xl px-16 [perspective:1400px]">
            <div
              className="relative min-h-[420px] transition-transform duration-500 ease-[cubic-bezier(0.22,0.61,0.36,1)] motion-reduce:transition-none sm:min-h-[450px]"
              style={{
                transformStyle: "preserve-3d",
                WebkitTransformStyle: "preserve-3d",
                transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
                willChange: "transform",
              }}
            >
              <div
                className="absolute inset-0 flex flex-col items-center justify-center text-center [backface-visibility:hidden] [-webkit-backface-visibility:hidden]"
                style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}
              >
                <p className="text-sm uppercase tracking-[0.24em] text-slate-300">
                  {direction === "jp-vi" ? "JP -> VI" : "VI -> JP"}
                </p>
                <p className={`mt-4 font-semibold text-white ${frontMainClass}`}>{frontMain}</p>
                {frontSub ? (
                  <p className="mt-4 max-w-2xl rounded-2xl border border-slate-300/30 bg-slate-900/25 px-4 py-2.5 text-base leading-relaxed text-slate-100 sm:text-lg">
                    {frontSub}
                  </p>
                ) : null}
              </div>

              <div
                className="absolute inset-0 [backface-visibility:hidden] [-webkit-backface-visibility:hidden]"
                style={{
                  backfaceVisibility: "hidden",
                  WebkitBackfaceVisibility: "hidden",
                  transform: "rotateY(180deg)",
                }}
              >
                <div
                  className={`flex min-h-[420px] flex-col items-center text-center sm:min-h-[450px] ${
                    shouldScrollBackPanel
                      ? "max-h-[420px] justify-start overflow-y-auto py-3 scrollbar-subtle sm:max-h-[450px]"
                      : "justify-center py-1"
                  }`}
                >
                  <p className="text-sm uppercase tracking-[0.24em] text-slate-300">
                    {direction === "jp-vi" ? "JP -> VI" : "VI -> JP"}
                  </p>
                  <p className={`mt-4 font-semibold text-white ${backMainClass}`}>{backMain}</p>
                  {backSub ? (
                    <p className="mt-4 max-w-2xl rounded-2xl border border-slate-300/30 bg-slate-900/25 px-4 py-2.5 text-base leading-relaxed text-slate-100 sm:text-lg">
                      {backSub}
                    </p>
                  ) : null}
                  {(onReadingParts.length > 0 || kunReadingParts.length > 0) ? (
                    <div className="mt-3 w-full max-w-2xl rounded-2xl border border-slate-300/30 bg-slate-900/20 px-4 py-3 text-left">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                        On / Kun Reading
                      </p>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <div className="rounded-xl bg-sky-500/12 p-2.5">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-200">On</p>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {(onReadingParts.length > 0 ? onReadingParts : ["-"]).map((reading, idx) => (
                              <span
                                key={`on-${idx}-${reading}`}
                                className="rounded-full border border-sky-300/45 bg-sky-400/22 px-2.5 py-0.5 text-xs font-semibold text-sky-100"
                              >
                                {reading}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="rounded-xl bg-orange-500/12 p-2.5">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-orange-200">Kun</p>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {(kunReadingParts.length > 0 ? kunReadingParts : ["-"]).map((reading, idx) => (
                              <span
                                key={`kun-${idx}-${reading}`}
                                className="rounded-full border border-orange-300/45 bg-orange-400/22 px-2.5 py-0.5 text-xs font-semibold text-orange-100"
                              >
                                {reading}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  {relatedWordPreview.length > 0 ? (
                    <div className="mt-3 w-full max-w-2xl rounded-2xl border border-slate-300/30 bg-slate-900/20 px-4 py-3 text-left">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                        Từ vựng liên quan
                      </p>
                      <ul
                        className={`mt-2 space-y-1 ${
                          relatedWordPreview.length > 4
                            ? "max-h-48 overflow-y-auto pr-1 scrollbar-subtle"
                            : ""
                        }`}
                      >
                        {relatedWordPreviewVisible.map((entry) => (
                          <li key={entry} className="text-sm leading-snug text-slate-100">
                            • {entry}
                          </li>
                        ))}
                      </ul>
                      {relatedWordPreviewOverflow > 0 ? (
                        <p className="mt-2 text-xs font-semibold text-slate-300">
                          +{relatedWordPreviewOverflow} mục khác. Dùng nút từ liên quan để học toàn bộ.
                        </p>
                      ) : null}
                      {hasRelatedVocabDeck ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Link
                            href={activeRelatedVocabFlashcardHref}
                            className="rounded-full border border-emerald-300/50 bg-emerald-400/20 px-3 py-1.5 text-xs font-semibold text-emerald-50 hover:bg-emerald-400/30"
                          >
                            Flashcard {activeRelatedVocabCount} từ liên quan
                          </Link>
                          <Link
                            href={activeRelatedVocabQuizHref}
                            className="rounded-full border border-sky-300/50 bg-sky-400/20 px-3 py-1.5 text-xs font-semibold text-sky-50 hover:bg-sky-400/30"
                          >
                            Quiz nhanh
                          </Link>
                          <Link
                            href={activeRelatedVocabRecallHref}
                            className="rounded-full border border-orange-300/50 bg-orange-400/20 px-3 py-1.5 text-xs font-semibold text-orange-50 hover:bg-orange-400/30"
                          >
                            Nhồi từ liên quan
                          </Link>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="border-y border-slate-500/35 bg-[#44517a] px-4 py-2 text-base text-slate-200 sm:text-lg">
        Phím tắt: <span className="rounded-md bg-slate-500/55 px-1.5 py-0.5 text-sm font-semibold">Space</span> lật
        <span className="ml-2 rounded-md bg-slate-500/55 px-1.5 py-0.5 text-sm font-semibold">Z</span> biết
        <span className="ml-2 rounded-md bg-slate-500/55 px-1.5 py-0.5 text-sm font-semibold">X</span> chưa biết
        <span className="ml-2 rounded-md bg-slate-500/55 px-1.5 py-0.5 text-sm font-semibold">C</span> lưu ôn tập
        <span className="ml-2 rounded-md bg-slate-500/55 px-1.5 py-0.5 text-sm font-semibold">R</span> phát âm
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
            {normalizedIndex + 1} / {activeCount}
          </span>
          {isHardReview ? (
            <span className="rounded-full border border-rose-300 bg-rose-500/20 px-2 py-0.5 text-xs font-semibold text-rose-100">
              Từ khó
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => markCard(true)}
            onMouseDown={(event) => event.preventDefault()}
            className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-600 text-5xl font-bold"
            aria-label="Biết"
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
            Lật lại
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
            className={`rounded-full px-4 py-2 font-semibold ${
              hardItems.length === 0
                ? "cursor-not-allowed bg-slate-700/60 text-slate-400"
                : isHardReview
                  ? "bg-rose-500/30 text-rose-100"
                  : "bg-slate-700 text-slate-200"
            }`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={toggleHardReview}
            disabled={hardItems.length === 0}
          >
            {isHardReview ? `Xem tất cả (${items.length})` : `Ôn từ khó (${hardItems.length})`}
          </button>

          {hasRelatedVocabDeck ? (
            <>
              <Link
                href={activeRelatedVocabFlashcardHref}
                className="rounded-full bg-emerald-500/25 px-4 py-2 font-semibold text-emerald-100 ring-1 ring-emerald-300/35 hover:bg-emerald-500/35"
              >
                Từ liên quan ({activeRelatedVocabCount})
              </Link>
              <Link
                href={activeRelatedVocabQuizHref}
                className="rounded-full bg-sky-500/25 px-4 py-2 font-semibold text-sky-100 ring-1 ring-sky-300/35 hover:bg-sky-500/35"
              >
                Quiz từ liên quan
              </Link>
              <Link
                href={activeRelatedVocabRecallHref}
                className="rounded-full bg-orange-500/25 px-4 py-2 font-semibold text-orange-100 ring-1 ring-orange-300/35 hover:bg-orange-500/35"
              >
                Nhồi từ liên quan
              </Link>
            </>
          ) : null}

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

      <div className="mt-4 rounded-2xl border border-slate-500/40 bg-[#25315a] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-slate-100">
              Danh sách chữ chưa thuộc ({hardItems.length})
            </h3>
            <p className="mt-1 text-xs text-slate-300">
              Chữ nào bấm <span className="font-semibold text-rose-300">X</span> sẽ vào đây để ôn lại.
              {hardItems.length > 0 ? ` Trang ${hardPageSafe}/${hardTotalPages}.` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-full border border-slate-400 px-3 py-1 text-xs font-semibold text-slate-100 hover:bg-slate-700"
              onClick={() => setShowHardPanel((prev) => !prev)}
            >
              {showHardPanel ? "Ẩn danh sách" : "Hiện danh sách"}
            </button>
            <button
              type="button"
              className="rounded-full border border-slate-400 px-3 py-1 text-xs font-semibold text-slate-100 hover:bg-slate-700"
              onClick={toggleHardReview}
              disabled={hardItems.length === 0}
            >
              {isHardReview ? "Đang ôn từ khó" : "Ôn nhóm từ khó"}
            </button>
            <button
              type="button"
              className="rounded-full border border-rose-300/70 px-3 py-1 text-xs font-semibold text-rose-100 hover:bg-rose-500/20"
              onClick={clearHardItems}
              disabled={hardItems.length === 0}
            >
              Xóa danh sách
            </button>
          </div>
        </div>

        {!showHardPanel ? (
          <p className="mt-3 rounded-lg border border-slate-500/40 bg-[#1f2a4f] px-3 py-2 text-sm text-slate-300">
            Danh sách đang được thu gọn. Bấm{" "}
            <span className="font-semibold text-sky-300">Hiện danh sách</span> để xem lại.
          </p>
        ) : hardItems.length === 0 ? (
          <p className="mt-3 rounded-lg border border-slate-500/40 bg-[#243056] px-3 py-2 text-sm text-slate-300">
            Chưa có chữ khó. Bấm nút <span className="font-bold text-rose-300">X</span> để đánh dấu chữ cần ôn lại.
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
                    <p className="truncate text-lg font-semibold text-white">{item.character}</p>
                    <p className="truncate text-sm text-slate-300">
                      {item.hanviet ? `${item.hanviet.toUpperCase()} - ` : ""}
                      {item.meaning}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 rounded-full border border-slate-300/80 px-3 py-1 text-xs font-semibold text-slate-100 hover:bg-slate-700"
                    onClick={() => removeHardItem(item.id)}
                  >
                    Bỏ
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
                  ← Trang trước
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

      <div className="h-2 overflow-hidden rounded-b-2xl bg-slate-700/70">
        <div
          className="h-2 bg-emerald-400 transition-all"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div className="px-5 py-3 text-sm text-slate-300">
        Biết: {knownCount} | Chưa biết: {unknownCount} | Chủ đề: {title}
      </div>
    </section>
  );
}

