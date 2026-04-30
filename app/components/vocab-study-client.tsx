"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  AUDIO_AUTOPLAY_KEY,
  AUDIO_RATE_KEY,
  AUDIO_VOICE_KEY,
} from "@/app/components/audio-settings-client";
import {
  readLearningProgress,
  upsertLearningProgress,
} from "@/app/components/learning-progress-storage";

export type StudyMode = "flashcard" | "quiz" | "recall";
type FlashcardPromptMode = "jp_to_vi" | "vi_to_jp" | "kanji_to_answer";
type RecallKanaMode = "hiragana" | "katakana";

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
  backHref?: string;
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

const ROMAJI_TO_HIRAGANA_MAP: Record<string, string> = {
  kya: "きゃ",
  kyu: "きゅ",
  kyo: "きょ",
  gya: "ぎゃ",
  gyu: "ぎゅ",
  gyo: "ぎょ",
  sha: "しゃ",
  shu: "しゅ",
  sho: "しょ",
  sya: "しゃ",
  syu: "しゅ",
  syo: "しょ",
  ja: "じゃ",
  ju: "じゅ",
  jo: "じょ",
  jya: "じゃ",
  jyu: "じゅ",
  jyo: "じょ",
  cha: "ちゃ",
  chu: "ちゅ",
  cho: "ちょ",
  cya: "ちゃ",
  cyu: "ちゅ",
  cyo: "ちょ",
  nya: "にゃ",
  nyu: "にゅ",
  nyo: "にょ",
  hya: "ひゃ",
  hyu: "ひゅ",
  hyo: "ひょ",
  bya: "びゃ",
  byu: "びゅ",
  byo: "びょ",
  pya: "ぴゃ",
  pyu: "ぴゅ",
  pyo: "ぴょ",
  mya: "みゃ",
  myu: "みゅ",
  myo: "みょ",
  rya: "りゃ",
  ryu: "りゅ",
  ryo: "りょ",
  dya: "ぢゃ",
  dyu: "ぢゅ",
  dyo: "ぢょ",
  tsa: "つぁ",
  tsi: "つぃ",
  tse: "つぇ",
  tso: "つぉ",
  she: "しぇ",
  je: "じぇ",
  che: "ちぇ",
  fa: "ふぁ",
  fi: "ふぃ",
  fe: "ふぇ",
  fo: "ふぉ",
  va: "ゔぁ",
  vi: "ゔぃ",
  vu: "ゔ",
  ve: "ゔぇ",
  vo: "ゔぉ",
  ti: "てぃ",
  tu: "とぅ",
  di: "でぃ",
  du: "どぅ",
  wi: "うぃ",
  we: "うぇ",
  kwa: "くぁ",
  kwi: "くぃ",
  kwe: "くぇ",
  kwo: "くぉ",
  gwa: "ぐぁ",
  gwi: "ぐぃ",
  gwe: "ぐぇ",
  gwo: "ぐぉ",
  xya: "ゃ",
  xyu: "ゅ",
  xyo: "ょ",
  lya: "ゃ",
  lyu: "ゅ",
  lyo: "ょ",
  ka: "か",
  ki: "き",
  ku: "く",
  ke: "け",
  ko: "こ",
  ga: "が",
  gi: "ぎ",
  gu: "ぐ",
  ge: "げ",
  go: "ご",
  sa: "さ",
  si: "し",
  su: "す",
  se: "せ",
  so: "そ",
  za: "ざ",
  zi: "じ",
  zu: "ず",
  ze: "ぜ",
  zo: "ぞ",
  ta: "た",
  tii: "てぃ",
  tuu: "とぅ",
  te: "て",
  to: "と",
  da: "だ",
  de: "で",
  do: "ど",
  dii: "でぃ",
  duu: "どぅ",
  na: "な",
  ni: "に",
  nu: "ぬ",
  ne: "ね",
  no: "の",
  ha: "は",
  hi: "ひ",
  fu: "ふ",
  he: "へ",
  ho: "ほ",
  ba: "ば",
  bi: "び",
  bu: "ぶ",
  be: "べ",
  bo: "ぼ",
  pa: "ぱ",
  pi: "ぴ",
  pu: "ぷ",
  pe: "ぺ",
  po: "ぽ",
  ma: "ま",
  mi: "み",
  mu: "む",
  me: "め",
  mo: "も",
  ya: "や",
  yu: "ゆ",
  yo: "よ",
  ra: "ら",
  ri: "り",
  ru: "る",
  re: "れ",
  ro: "ろ",
  wa: "わ",
  wo: "を",
  qa: "くぁ",
  qi: "くぃ",
  qe: "くぇ",
  qo: "くぉ",
  la: "ぁ",
  li: "ぃ",
  lu: "ぅ",
  le: "ぇ",
  lo: "ぉ",
  xa: "ぁ",
  xi: "ぃ",
  xu: "ぅ",
  xe: "ぇ",
  xo: "ぉ",
  xtu: "っ",
  ltu: "っ",
  nn: "ん",
  ji: "じ",
  chi: "ち",
  tsu: "つ",
  a: "あ",
  i: "い",
  u: "う",
  e: "え",
  o: "お",
};

function katakanaToHiragana(value: string): string {
  return value.replace(/[\u30a1-\u30f6]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0x60)
  );
}

function hiraganaToKatakana(value: string): string {
  return value.replace(/[\u3041-\u3096]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) + 0x60)
  );
}

function hasKatakanaChars(value: string): boolean {
  return /[\u30a1-\u30ff]/.test(value);
}

function convertRomajiTokenToHiragana(token: string): string {
  const source = token.toLowerCase();
  let index = 0;
  let result = "";

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (!char) {
      break;
    }

    if (!/[a-z']/i.test(char)) {
      result += char;
      index += 1;
      continue;
    }

    if (
      next &&
      char === next &&
      /[bcdfghjklmpqrstvwxyz]/.test(char) &&
      char !== "n"
    ) {
      result += "っ";
      index += 1;
      continue;
    }

    if (char === "n") {
      if (next === "'") {
        result += "ん";
        index += 2;
        continue;
      }
      if (!next) {
        result += "ん";
        index += 1;
        continue;
      }
      if (next === "n") {
        result += "ん";
        index += 1;
        continue;
      }
      if (!/[aiueoy]/.test(next)) {
        result += "ん";
        index += 1;
        continue;
      }
    }

    const four = source.slice(index, index + 4);
    if (ROMAJI_TO_HIRAGANA_MAP[four]) {
      result += ROMAJI_TO_HIRAGANA_MAP[four];
      index += 4;
      continue;
    }

    const three = source.slice(index, index + 3);
    if (ROMAJI_TO_HIRAGANA_MAP[three]) {
      result += ROMAJI_TO_HIRAGANA_MAP[three];
      index += 3;
      continue;
    }

    const two = source.slice(index, index + 2);
    if (ROMAJI_TO_HIRAGANA_MAP[two]) {
      result += ROMAJI_TO_HIRAGANA_MAP[two];
      index += 2;
      continue;
    }

    if (ROMAJI_TO_HIRAGANA_MAP[char]) {
      result += ROMAJI_TO_HIRAGANA_MAP[char];
      index += 1;
      continue;
    }

    result += char;
    index += 1;
  }

  return result;
}

function convertRomajiToHiraganaInput(value: string): string {
  return value.replace(/[A-Za-z']+/g, (token) =>
    convertRomajiTokenToHiragana(token)
  );
}

function displayJapanese(item: StudyItem): string {
  return item.kanji || item.word;
}

function displayReadingMain(item: StudyItem): string {
  return item.reading || item.word || item.kanji;
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
    return <span>Trắc nghiệm</span>;
  }
  return <span>Nhồi nhét</span>;
}

export function VocabStudyClient({ lessonTitle, mode, items, backHref = "/vocab" }: Props) {
  const router = useRouter();
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
  const [isComposingRomaji, setIsComposingRomaji] = useState(false);
  const [recallKanaMode, setRecallKanaMode] = useState<RecallKanaMode>("hiragana");
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
  const recallInputRef = useRef<HTMLInputElement | null>(null);
  const restoredProgressRef = useRef(false);
  const [sessionHref, setSessionHref] = useState("");

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
  const recallSupportsKatakana = useMemo(
    () => hasKatakanaChars(`${current.reading} ${current.word} ${current.kanji}`),
    [current.kanji, current.reading, current.word]
  );
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
  const itemSignature = useMemo(() => items.map((item) => item.id).join("|"), [items]);

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
    if (typeof window === "undefined") {
      return;
    }

    const href = `${window.location.pathname}${window.location.search}`;
    setSessionHref(href);
    const saved = readLearningProgress(href);
    if (saved && saved.itemSignature === itemSignature && saved.totalCount > 0) {
      if (saved.order?.length === items.length) {
        setOrder(saved.order);
        setIsShuffled(Boolean(saved.isShuffled));
      }
      setHardItemIds(saved.hardItemIds ?? []);
      setIsHardReview(Boolean(saved.isHardReview && (saved.hardItemIds?.length ?? 0) > 0));
      setIndex(Math.min(Math.max(0, saved.currentIndex), Math.max(0, items.length - 1)));
    }
    restoredProgressRef.current = true;
  }, [itemSignature, items.length]);

  useEffect(() => {
    if (!restoredProgressRef.current || !sessionHref || !current) {
      return;
    }

    upsertLearningProgress({
      id: sessionHref,
      href: sessionHref,
      kind: "vocab",
      title: lessonTitle,
      mode,
      currentIndex: index,
      totalCount: activeCount,
      percent: Math.round(progressPercent),
      currentLabel: displayJapanese(current) || current.word || current.reading,
      subLabel: current.meaning,
      hardCount: hardItems.length,
      hardItemIds,
      isHardReview,
      order,
      isShuffled,
      itemSignature,
      updatedAt: Date.now(),
    });
  }, [
    activeCount,
    current,
    hardItemIds,
    hardItems.length,
    index,
    isShuffled,
    isHardReview,
    itemSignature,
    lessonTitle,
    mode,
    order,
    progressPercent,
    sessionHref,
  ]);

  useEffect(() => {
    if (isHardReview && hardOrder.length === 0) {
      setIsHardReview(false);
    }
  }, [hardOrder.length, isHardReview]);

  useEffect(() => {
    setHardPage((prev) => Math.max(1, Math.min(prev, hardTotalPages)));
  }, [hardTotalPages]);

  useEffect(() => {
    if (mode !== "recall") {
      return;
    }
    recallInputRef.current?.focus({ preventScroll: true });
  }, [index, mode]);

  useEffect(() => {
    if (mode !== "recall") {
      return;
    }
    setRecallKanaMode(recallSupportsKatakana ? "katakana" : "hiragana");
  }, [current.id, mode, recallSupportsKatakana]);

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
    const normalizeRecall = (value: string) =>
      normalizeInput(katakanaToHiragana(convertRomajiToHiraganaInput(value)));

    const candidate = normalizeRecall(recallInput);
    const word = normalizeRecall(current.word);
    const reading = normalizeRecall(current.reading);
    const kanji = normalizeRecall(current.kanji);

    const isCorrect =
      candidate.length > 0 &&
      (candidate === word || candidate === reading || (kanji && candidate === kanji));
    if (isCorrect) {
      setRecallMessage("Đúng rồi!");
      setRecallSuccess(true);
      setCorrectCount((prev) => prev + 1);
      return;
    }

    setRecallMessage("Chưa đúng, thử lại nhé.");
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
      ? "Gợi ý (0/2)"
      : hintCount === 1
        ? `Gợi ý: bắt đầu bằng "${currentDisplayWord.slice(0, 1)}" (1/2)`
        : `Gợi ý: cách đọc là "${current.reading}" (2/2)`;

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
  let flashFrontSubLabel = "Chữ Hán";

  let flashBackMain = meaningMain;
  let flashBackSub = hanvietMain;
  let flashBackLabel = "Nghĩa";
  let flashBackSubLabel = "Hán Việt";

  if (flashPromptMode === "vi_to_jp") {
    flashFrontMain = meaningMain;
    flashFrontSub = hanvietMain;
    flashFrontLabel = "Nghĩa";
    flashFrontSubLabel = "Hán Việt";

    flashBackMain = japaneseMain;
    flashBackSub = japaneseSub;
    flashBackLabel = "Hiragana";
    flashBackSubLabel = "Chữ Hán";
  }

  if (flashPromptMode === "kanji_to_answer") {
    flashFrontMain = kanjiMain;
    flashFrontSub = "";
    flashFrontLabel = hasRealKanji ? "Chữ Hán" : "Từ vựng";
    flashFrontSubLabel = "";

    flashBackMain = japaneseMain;
    flashBackSub = hanvietMain
      ? `${meaningMain} · Hán Việt: ${hanvietMain}`
      : meaningMain;
    if (!kanjiHint || kanjiHint === kanjiMain) {
      flashBackMain = japaneseMain || kanjiMain;
    }
    flashBackLabel = "Hiragana";
    flashBackSubLabel = "Nghĩa";
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

  const handleGoBack = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(backHref);
  }, [backHref, router]);

  return (
    <section className="mx-auto w-full max-w-5xl rounded-3xl border border-[#41507c] bg-[#2f3c66] p-4 text-slate-100 shadow-[0_16px_35px_rgba(18,28,56,0.45)] sm:p-5">
      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={handleGoBack}
          className="inline-flex items-center gap-2 text-base text-slate-300 transition hover:text-white"
        >
          <span>{"<"}</span>
          <span>Quay lại</span>
        </button>
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
            {isShuffled ? "Thứ tự gốc" : "Đảo thứ tự"}
          </button>
        )}
      </div>

      {mode === "flashcard" ? (
        <div className="mx-auto max-w-[980px] overflow-hidden rounded-2xl bg-[#32416d]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-500/35 bg-[#3a4a75] px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-200/90">
              Kiểu luyện flashcard
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
                3. Kanji -{">"} Đọc/Nghĩa
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
              aria-label="Thẻ trước"
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
              aria-label="Thẻ sau"
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
                aria-label="Phát âm"
              >
                <span>🔊</span>
                <span>Phát âm</span>
              </button>
            </div>
          </div>

          <div className="border-y border-slate-500/35 bg-[#44517a] px-3 py-1.5 text-xs text-slate-200">
            Phím tắt: Space lật, 1/2/3 đổi kiểu luyện, Z biết, X chưa biết (thêm từ khó), R phát âm, mũi tên trái/phải để chuyển thẻ
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 bg-[#1f2848] px-3 py-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => markFlashcard(false)}
                onMouseDown={(event) => event.preventDefault()}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-rose-500 text-xl font-bold"
                aria-label="Không biết"
              >
                x
              </button>
              <span className="text-xl font-semibold">
                {index + 1} / {activeCount}
              </span>
              {isHardReview ? (
                <span className="rounded-full border border-rose-300 bg-rose-500/20 px-2 py-0.5 text-xs font-semibold text-rose-100">
                  Từ khó
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => markFlashcard(true)}
                onMouseDown={(event) => event.preventDefault()}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-xl font-bold"
                aria-label="Biết"
              >
                v
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              {japaneseVoices.length > 0 ? (
                <label className="inline-flex items-center gap-2 rounded-full bg-slate-700 px-3 py-1.5 text-xs text-slate-100">
                  <span>Giọng</span>
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
                Lật lại
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
                {isShuffled ? "Thứ tự gốc" : "Đảo"}
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
                  ? `Xem tất cả (${items.length})`
                  : `Ôn từ khó (${hardItems.length})`}
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
                Danh sách từ chưa thuộc ({hardItems.length})
              </h3>
              <p className="mt-1 text-xs text-slate-300">
                Từ nào bấm <span className="font-semibold text-rose-300">X</span> sẽ vào đây để ôn lại.
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
              Chưa có từ khó. Bấm nút <span className="font-bold text-rose-300">X</span> để đánh dấu từ cần ôn lại.
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
      ) : null}

      {mode === "quiz" ? (
        <div className="rounded-2xl bg-[#32416d] p-8">
          <div className="mb-8 flex justify-end">
            <div className="inline-flex rounded-xl bg-slate-700 p-1 text-sm">
              <span className="rounded-lg bg-emerald-500 px-3 py-1 font-semibold text-white">
                Câu hỏi: Hiragana + Nghĩa
              </span>
              <span className="px-3 py-1 text-slate-200">Đáp án: Kanji</span>
            </div>
          </div>

          <div className="mb-8 text-center">
            <h2 className="text-5xl font-semibold text-white">{displayReadingMain(current)}</h2>
            <p className="mt-2 text-2xl font-medium text-slate-200">{current.meaning}</p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {quizOptions.map((option, optionIndex) => {
              const optionNo = optionIndex + 1;
              const selected = selectedOptionId === option.id;
              const correct = checkedQuiz && option.id === current.id;
              const wrong = checkedQuiz && selected && option.id !== current.id;
              const optionMain = displayJapanese(option).trim() || displayReadingMain(option).trim();
              const optionReading = option.reading.trim();
              const showFurigana =
                checkedQuiz &&
                optionReading.length > 0 &&
                hasJapaneseChars(optionMain) &&
                optionReading !== optionMain;

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
                  <span className="mr-3 text-2xl text-slate-300">{optionNo}</span>
                  {showFurigana ? (
                    <ruby className="font-kanji leading-none [ruby-position:over]">
                      <span className="font-kanji text-[1.08em] font-semibold">{optionMain}</span>
                      <rt className="relative top-[0.1em] text-[0.31em] leading-none font-semibold text-slate-200/95">
                        {optionReading}
                      </rt>
                    </ruby>
                  ) : (
                    <span className="font-kanji text-[1.08em] font-semibold leading-none">{optionMain}</span>
                  )}
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
                Kiểm tra
              </button>
            ) : (
              <button
                type="button"
                className="rounded-xl bg-emerald-500 px-8 py-3 text-xl font-semibold text-white"
                onClick={goNext}
              >
                {quizCorrect ? "Đúng! Tiếp tục" : "Xem câu tiếp"}
              </button>
            )}
          </div>
        </div>
      ) : null}

      {mode === "recall" ? (
        <div className="rounded-2xl bg-[#32416d] p-6">
          <div className="mb-3 flex min-h-[96px] items-center justify-center">
            <h2 className="text-center text-5xl font-semibold leading-tight text-white">
              {current.meaning}
            </h2>
          </div>

          <div className="mb-3 flex items-center justify-start gap-2">
            <button
              type="button"
              onClick={() => setRecallKanaMode("hiragana")}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                recallKanaMode === "hiragana"
                  ? "bg-sky-400 text-slate-900"
                  : "bg-slate-700 text-slate-200 hover:bg-slate-600"
              }`}
            >
              ひらがな
            </button>
            <button
              type="button"
              onClick={() => setRecallKanaMode("katakana")}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                recallKanaMode === "katakana"
                  ? "bg-orange-400 text-slate-900"
                  : "bg-slate-700 text-slate-200 hover:bg-slate-600"
              }`}
            >
              カタカナ
            </button>
          </div>

          <div className="mb-3 rounded-xl border-2 border-slate-300 bg-[#33425f] p-2">
            <input
              ref={recallInputRef}
              className="w-full rounded-lg bg-transparent px-4 py-2.5 text-xl text-white outline-none placeholder:text-slate-400"
              placeholder={
                recallKanaMode === "katakana"
                  ? "Gõ cách đọc, từ gốc hoặc romaji (ra katakana)"
                  : "Gõ cách đọc, từ gốc hoặc romaji (ra hiragana)"
              }
              value={recallInput}
              onCompositionStart={() => setIsComposingRomaji(true)}
              onCompositionEnd={(event) => {
                setIsComposingRomaji(false);
                const convertedHiragana = convertRomajiToHiraganaInput(event.currentTarget.value);
                setRecallInput(
                  recallKanaMode === "katakana"
                    ? hiraganaToKatakana(convertedHiragana)
                    : convertedHiragana
                );
              }}
              onChange={(event) => {
                const rawValue = event.target.value;
                const convertedHiragana = convertRomajiToHiraganaInput(rawValue);
                setRecallInput(
                  isComposingRomaji
                    ? rawValue
                    : recallKanaMode === "katakana"
                      ? hiraganaToKatakana(convertedHiragana)
                      : convertedHiragana
                );
              }}
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
          <p className="mb-3 text-center text-xs text-slate-300">
            {recallKanaMode === "katakana"
              ? "Gõ romaji sẽ tự chuyển sang katakana."
              : "Gõ romaji sẽ tự chuyển sang hiragana."}
          </p>

          <div className="grid gap-2.5 md:grid-cols-2">
            <button
              type="button"
              className="rounded-xl bg-slate-200 px-4 py-2.5 text-lg font-semibold text-slate-500 disabled:opacity-60"
              onClick={useHint}
              disabled={hintCount >= 2}
              onMouseDown={(event) => event.preventDefault()}
            >
              {hintText}
            </button>
            <button
              type="button"
              className="rounded-xl bg-orange-500 px-4 py-2.5 text-lg font-semibold text-white"
              onClick={() => {
                if (recallSuccess) {
                  goNext();
                } else {
                  submitRecall();
                }
              }}
              onMouseDown={(event) => event.preventDefault()}
            >
              {recallSuccess ? "Câu tiếp theo" : "Kiểm tra"}
            </button>
          </div>

          <p
            className={`mt-3 min-h-[28px] text-center text-base ${
              recallSuccess ? "text-emerald-300" : "text-slate-300"
            }`}
          >
            {recallMessage || "Nhấn Enter để kiểm tra nhanh"}
          </p>

          <div className="mt-3 flex items-center justify-center gap-2.5">
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300/70 bg-slate-700/45 text-lg font-semibold text-slate-100 transition hover:bg-slate-600/55"
              onClick={goPrev}
              aria-label="Từ trước"
              title="Từ trước"
              onMouseDown={(event) => event.preventDefault()}
            >
              ←
            </button>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300/70 bg-slate-700/45 text-lg font-semibold text-slate-100 transition hover:bg-slate-600/55"
              onClick={goNext}
              aria-label="Từ sau"
              title="Từ sau"
              onMouseDown={(event) => event.preventDefault()}
            >
              →
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-5 flex items-center justify-between text-base text-slate-300">
        <span>
          {index + 1} / {activeCount}
        </span>
        <span>
          Đúng {correctCount} | Sai {wrongCount}
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

