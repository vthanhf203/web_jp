"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  AUDIO_AUTOPLAY_KEY,
  AUDIO_RATE_KEY,
  AUDIO_VOICE_KEY,
} from "@/app/components/audio-settings-client";
import { SpeakJpButton } from "@/app/components/speak-jp-button";
import {
  readLearningProgress,
  upsertLearningProgress,
} from "@/app/components/learning-progress-storage";

export type StudyMode = "flashcard" | "quiz" | "recall";
type FlashcardPromptMode = "jp_to_vi" | "vi_to_jp" | "kanji_to_answer";
type QuizPromptMode =
  | "reading_meaning_to_kanji"
  | "vi_to_jp"
  | "kanji_to_hiragana"
  | "kanji_to_vi";
type RecallKanaMode = "hiragana" | "katakana";
type RecallPromptMode = "meaning_to_japanese" | "word_to_meaning" | "word_to_reading";

type StudyItem = {
  id: string;
  word: string;
  reading: string;
  kanji: string;
  hanviet: string;
  meaning: string;
  radical?: {
    symbol?: string;
    name?: string;
    meaning?: string;
    position?: string;
  } | null;
};

type Props = {
  lessonTitle: string;
  mode: StudyMode;
  items: StudyItem[];
  backHref?: string;
  alwaysShowQuizFurigana?: boolean;
  recallPromptMode?: RecallPromptMode;
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

function stripVietnameseDiacritics(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d");
}

function normalizeMeaningInput(value: string): string {
  return stripVietnameseDiacritics(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function collectMeaningCandidates(value: string): string[] {
  const parts = value
    .split(/[;,/|•\n]+/)
    .map((item) => normalizeMeaningInput(item))
    .filter(Boolean);
  const whole = normalizeMeaningInput(value);
  const all = whole ? [whole, ...parts] : parts;
  return Array.from(new Set(all));
}

function extractInlineReading(value: string): string {
  const text = value.trim();
  if (!text) {
    return "";
  }

  const hasInlineReading = /[（(][^）)]+[）)]/.test(text);
  if (!hasInlineReading) {
    return "";
  }

  const expanded = text.replace(/[\u4e00-\u9fff々〆ヵヶ]+[（(]([^）)]+)[）)]/g, "$1");
  const kanaParts = expanded.match(/[\u3040-\u30ffー]+/g);
  return kanaParts ? kanaParts.join("").trim() : "";
}

function isKanaOnly(value: string): boolean {
  const text = value.trim();
  if (!text) {
    return false;
  }
  return /[\u3040-\u30ff]/u.test(text) && !/[\u4e00-\u9fff]/u.test(text);
}

function stripInlineReading(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  const stripped = trimmed
    .replace(/（[^）]*）/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return stripped || trimmed;
}

const LEADING_USAGE_CONTEXT_PATTERN = /^[［\[\(（【][^］\]\)）】]*[〜～~][^］\]\)）】*[］\]\)）】]\s*/u;

function stripLeadingUsageContext(value: string): string {
  let output = value.trim();
  while (output && LEADING_USAGE_CONTEXT_PATTERN.test(output)) {
    output = output.replace(LEADING_USAGE_CONTEXT_PATTERN, "").trim();
  }
  return output;
}

function extractCoreJapaneseTerm(value: string): string {
  const stripped = stripLeadingUsageContext(stripInlineReading(value));
  if (!stripped) {
    return "";
  }
  const parts = stripped
    .split(/[\s,，、/／|;；・]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return stripped;
  }
  const japaneseParts = parts.filter((part) => hasJapaneseChars(part));
  if (japaneseParts.length > 0) {
    return japaneseParts[japaneseParts.length - 1] ?? stripped;
  }
  return parts[parts.length - 1] ?? stripped;
}

function collectRecallAnswerCandidates(value: string): string[] {
  const stripped = stripInlineReading(value).trim();
  if (!stripped) {
    return [];
  }
  const withoutContext = stripLeadingUsageContext(stripped);
  const parts = withoutContext
    .split(/[\s,，、/／|;；・]+/)
    .map((item) => stripLeadingUsageContext(item).trim())
    .filter(Boolean);
  const core = extractCoreJapaneseTerm(stripped);
  return Array.from(new Set([withoutContext, ...parts, core].filter(Boolean)));
}

function formatRadicalSummary(radical: StudyItem["radical"]): string {
  if (!radical) {
    return "";
  }
  const left = [radical.symbol?.trim(), radical.name?.trim()].filter(Boolean).join(" ");
  const right = [radical.meaning?.trim(), radical.position?.trim()].filter(Boolean).join(" · ");
  return [left, right].filter(Boolean).join(" - ");
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
  shi: "し",
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

    if (char === "n") {
      if (next === "'") {
        result += "ん";
        index += 2;
        continue;
      }
      if (!next) {
        // Keep a single standalone "n" as-is while typing, so "ni" can become "に"
        // on the next keystroke instead of being stuck as "んい".
        if (source.length === 1 && index === 0) {
          result += "n";
        } else {
          result += "ん";
        }
        index += 1;
        continue;
      }
      if (next === "n") {
        result += "ん";
        const third = source[index + 2];
        // terminal "nn" should become one ん, while "nna/nnya/..." keeps
        // the second n to combine with the following vowel/y.
        index += third ? 1 : 2;
        continue;
      }
      if (!/[aiueoy]/.test(next)) {
        result += "ん";
        index += 1;
        continue;
      }
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
  return value.replace(/[A-Za-z']+/g, (token) => {
    const lowered = token.toLowerCase();
    if (lowered === "n") {
      // Keep a single "n" while typing so following vowels can still form
      // syllables like "ni/na/nu/ne/no" naturally.
      return "n";
    }
    return convertRomajiTokenToHiragana(token);
  });
}

function displayJapanese(item: StudyItem): string {
  return item.kanji || item.word;
}

function displayReadingMain(item: StudyItem): string {
  return item.reading || item.word || item.kanji;
}

function collectReadingCandidates(item: StudyItem): string[] {
  const primaryReading = item.reading.trim();
  const inlineFromReading = extractInlineReading(primaryReading);
  const strippedPrimaryReading = stripInlineReading(primaryReading);
  const corePrimaryReading = extractCoreJapaneseTerm(primaryReading);
  const inlineFromWord = extractInlineReading(item.word || "");
  const inlineFromKanji = extractInlineReading(item.kanji || "");
  const kanaWord = isKanaOnly(item.word) ? item.word : "";
  const kanaKanji = isKanaOnly(item.kanji) ? item.kanji : "";
  const kanaPrimaryReading = isKanaOnly(strippedPrimaryReading) ? strippedPrimaryReading : "";
  const rawCandidates = [
    corePrimaryReading,
    inlineFromReading,
    primaryReading,
    kanaPrimaryReading,
    inlineFromWord,
    inlineFromKanji,
    kanaWord,
    kanaKanji,
  ]
    .map((value) => value.trim())
    .filter(Boolean);
  return Array.from(new Set(rawCandidates));
}

function expandReadingCandidates(candidates: string[]): string[] {
  const expanded: string[] = [];
  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    if (!trimmed) {
      continue;
    }
    const parts = trimmed
      .split(/[,\u3001\u30fb/|;\n]+/)
      .map((value) => value.trim())
      .filter(Boolean);
    if (parts.length > 0) {
      expanded.push(...parts);
    } else {
      expanded.push(trimmed);
    }
  }
  return Array.from(new Set(expanded));
}

function pickBestReadingCandidate(candidates: string[]): string {
  const sorted = candidates
    .map((value) => value.trim())
    .filter(Boolean)
    .sort((left, right) => left.length - right.length || left.localeCompare(right, "ja"));
  return sorted[0] ?? "";
}

function pickBestReadingForItem(item: StudyItem): string {
  return pickBestReadingCandidate(
    expandReadingCandidates(buildReadingAliases(collectReadingCandidates(item)))
  );
}

function buildQuizOptionSpeakText(
  option: StudyItem,
  optionMain: string,
  optionReading: string,
  showFurigana: boolean,
  quizPromptMode: QuizPromptMode
): string {
  if (quizPromptMode === "kanji_to_vi") {
    const bestReading = pickBestReadingForItem(option);
    if (bestReading) {
      return bestReading;
    }
    return stripInlineReading(displayJapanese(option)).trim();
  }

  if (showFurigana && optionReading.trim()) {
    return optionReading.trim();
  }

  const stripped = stripInlineReading(optionMain).trim();
  if (stripped) {
    return stripped;
  }

  return optionMain.trim();
}

function collapseRepeatedPattern(value: string): string {
  const text = value.trim();
  if (!text) {
    return text;
  }
  for (let size = 1; size <= Math.floor(text.length / 2); size += 1) {
    if (text.length % size !== 0) {
      continue;
    }
    const pattern = text.slice(0, size);
    if (pattern && pattern.repeat(text.length / size) === text) {
      return pattern;
    }
  }
  return text;
}

function buildReadingAliases(candidates: string[]): string[] {
  const expanded: string[] = [];
  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    if (!trimmed) {
      continue;
    }
    const collapsed = collapseRepeatedPattern(trimmed);
    if (collapsed && collapsed !== trimmed) {
      expanded.push(collapsed);
    }
    expanded.push(trimmed);
  }
  return Array.from(new Set(expanded));
}

function toHiraganaOnly(value: string): string {
  const normalized = katakanaToHiragana(convertRomajiToHiraganaInput(value)).trim();
  return normalized.replace(/[^\u3040-\u309fー]/gu, "");
}

function pickPrimaryHiraganaForQuiz(item: StudyItem): string {
  const candidates = expandReadingCandidates(buildReadingAliases(collectReadingCandidates(item)));
  for (const candidate of candidates) {
    const inlineReading = extractInlineReading(candidate);
    const normalized = toHiraganaOnly(inlineReading || candidate);
    if (normalized) {
      return normalized;
    }
  }
  return "";
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

export function VocabStudyClient({
  lessonTitle,
  mode,
  items,
  backHref = "/vocab",
  alwaysShowQuizFurigana = false,
  recallPromptMode = "meaning_to_japanese",
}: Props) {
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
  const [quizPromptMode, setQuizPromptMode] = useState<QuizPromptMode>("reading_meaning_to_kanji");

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
  const currentDisplayWordPlain =
    extractCoreJapaneseTerm(currentDisplayWord) ||
    stripInlineReading(currentDisplayWord) ||
    currentDisplayWord;
  const isWordToMeaningRecall = recallPromptMode === "word_to_meaning";
  const isWordToReadingRecall = recallPromptMode === "word_to_reading";
  const isCompactRecallLayout = isWordToMeaningRecall || isWordToReadingRecall;
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
    if (mode !== "recall" || isWordToMeaningRecall) {
      return;
    }
    if (isWordToReadingRecall) {
      setRecallKanaMode("hiragana");
      return;
    }
    setRecallKanaMode(recallSupportsKatakana ? "katakana" : "hiragana");
  }, [current.id, isWordToMeaningRecall, isWordToReadingRecall, mode, recallSupportsKatakana]);

  const markFlashcard = useCallback((isCorrect: boolean) => {
    if (isCorrect) {
      setCorrectCount((prev) => prev + 1);
    } else {
      setWrongCount((prev) => prev + 1);
      setHardItemIds((prev) => (prev.includes(current.id) ? prev : [...prev, current.id]));
    }
    goNext();
  }, [current.id, goNext]);

  const markCurrentAsHard = useCallback(() => {
    const alreadyMarked = hardIdSet.has(current.id);
    if (alreadyMarked) {
      setHardItemIds((prev) => prev.filter((id) => id !== current.id));
    } else {
      setHardItemIds((prev) => [...prev, current.id]);
    }
    if (mode === "recall") {
      setRecallSuccess(false);
      setRecallMessage(
        alreadyMarked
          ? "Đã bỏ khỏi mục chưa thuộc."
          : "Đã thêm vào mục chưa thuộc."
      );
    }
  }, [current.id, hardIdSet, mode]);

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

  const changeQuizPromptMode = useCallback((nextMode: QuizPromptMode) => {
    setQuizPromptMode(nextMode);
    setSelectedOptionId("");
    setCheckedQuiz(false);
    setQuizCorrect(false);
  }, []);

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
    if (isWordToMeaningRecall) {
      const normalizeReading = (value: string) =>
        normalizeInput(katakanaToHiragana(convertRomajiToHiraganaInput(value)));
      const candidate = normalizeMeaningInput(recallInput);
      const candidateReading = normalizeReading(recallInput);
      const meaningCandidates = collectMeaningCandidates(current.meaning);
      const readingCandidates = Array.from(
        new Set(
          [
            current.reading,
            extractInlineReading(current.word),
            extractInlineReading(current.kanji),
            isKanaOnly(current.word) ? current.word : "",
          ]
            .map((value) => normalizeReading(value))
            .filter(Boolean)
        )
      );
      const matchesMeaning =
        candidate.length > 0 && meaningCandidates.some((expected) => expected === candidate);
      const matchesReading =
        candidateReading.length > 0 &&
        readingCandidates.some((expected) => expected === candidateReading);
      const isCorrect = matchesMeaning || matchesReading;
      if (isCorrect) {
        setRecallMessage("Đúng rồi!");
        setRecallSuccess(true);
        setCorrectCount((prev) => prev + 1);
        return;
      }

      setRecallMessage("Chưa đúng, thử lại nhé.");
      setRecallSuccess(false);
      setWrongCount((prev) => prev + 1);
      return;
    }

    if (isWordToReadingRecall) {
      const normalizeReading = (value: string) =>
        normalizeInput(katakanaToHiragana(convertRomajiToHiraganaInput(value)));
      const candidate = collapseRepeatedPattern(normalizeReading(recallInput));
      const readingCandidates = Array.from(
        new Set(
          expandReadingCandidates(buildReadingAliases(collectReadingCandidates(current)))
            .map((value) => collapseRepeatedPattern(normalizeReading(value)))
            .filter(Boolean)
        )
      );
      const isCorrect =
        candidate.length > 0 &&
        readingCandidates.some((expected) => expected === candidate);
      if (isCorrect) {
        setRecallMessage("Đúng rồi!");
        setRecallSuccess(true);
        setCorrectCount((prev) => prev + 1);
        return;
      }

      setRecallMessage("Chưa đúng, thử lại nhé.");
      setRecallSuccess(false);
      setWrongCount((prev) => prev + 1);
      return;
    }

    const normalizeRecall = (value: string) =>
      normalizeInput(katakanaToHiragana(convertRomajiToHiraganaInput(value)));

    const candidate = normalizeRecall(recallInput);
    const recallCandidates = Array.from(
      new Set(
        [current.word, current.reading, current.kanji]
          .flatMap((value) => collectRecallAnswerCandidates(value))
          .map((value) => normalizeRecall(value))
          .filter(Boolean)
      )
    );

    const isCorrect =
      candidate.length > 0 &&
      recallCandidates.some((expected) => expected === candidate);
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
        ? isWordToMeaningRecall
          ? (() => {
              const readingHint = pickBestReadingCandidate(
                expandReadingCandidates(buildReadingAliases(collectReadingCandidates(current)))
              );
              return `Gợi ý: nghĩa bắt đầu bằng "${current.meaning.trim().slice(0, 1)}" hoặc đọc "${readingHint || "-"}" (1/2)`;
            })()
          : isWordToReadingRecall
            ? (() => {
                const readingHint = pickBestReadingForItem(current);
                return readingHint ? `Gợi ý: ${readingHint.slice(0, 1)}...` : "Gợi ý: chưa có";
              })()
          : (() => {
              const readingHint = pickBestReadingForItem(current);
              const firstHint = readingHint || currentDisplayWordPlain;
              return firstHint
                ? `Gợi ý: bắt đầu bằng "${firstHint.slice(0, 1)}" (1/2)`
                : "Gợi ý: chưa có";
            })()
        : isWordToMeaningRecall
          ? `Gợi ý: ${current.meaning.trim()} | Đọc: ${current.reading.trim() || "-"}`
          : isWordToReadingRecall
            ? (() => {
                const readingHint = pickBestReadingForItem(current);
                return readingHint ? `Gợi ý: ${readingHint}` : "Gợi ý: chưa có";
              })()
          : (() => {
              const readingHint = pickBestReadingForItem(current);
              return `Gợi ý: cách đọc là "${readingHint || current.reading}" (2/2)`;
            })();
  const hintButtonLabel =
    hintCount === 0 ? "Gợi ý (0/2)" : hintCount === 1 ? "Gợi ý (1/2)" : "Gợi ý (2/2)";
  const hintDetailText = hintCount > 0 ? hintText : "";
  const hintDetailBody = hintDetailText.replace(/^Gợi ý:\s*/u, "");
  const isHardListRecallFeedback = /mục chưa thuộc/u.test(recallMessage);
  const currentIsHard = hardIdSet.has(current.id);

  const japaneseMain = (current.reading || current.word || currentDisplayWord).trim();
  const japaneseSub = currentDisplayWord && currentDisplayWord !== japaneseMain ? currentDisplayWord : "";
  const meaningMain = current.meaning.trim();
  const hanvietMain = current.hanviet.trim();
  const kanjiRaw = (current.kanji || current.word || japaneseMain).trim();
  const kanjiMain = extractCoreJapaneseTerm(kanjiRaw) || stripInlineReading(kanjiRaw);
  const kanjiHint = current.reading.trim();
  const inlineReading = extractInlineReading(current.word || current.kanji || "");
  const fallbackKanaReading = isKanaOnly(japaneseMain) ? japaneseMain : "";
  const kanjiFurigana = kanjiHint || inlineReading || fallbackKanaReading;
  const hasRealKanji = /[\u4e00-\u9fff]/u.test(kanjiMain);
  const recallAnswerWord = currentDisplayWordPlain || kanjiMain || japaneseMain;
  const recallAnswerReading = pickBestReadingForItem(current);
  const recallRadicalSummary = formatRadicalSummary(current.radical);

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

    flashBackMain = meaningMain || japaneseMain || kanjiMain;
    flashBackSub = [
      kanjiFurigana ? `${kanjiMain} (${kanjiFurigana})` : kanjiMain,
      hanvietMain ? `Hán Việt: ${hanvietMain}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    flashBackLabel = "Nghĩa";
    flashBackSubLabel = kanjiFurigana ? "Kanji + Furigana" : "Kanji";
  }

  const flashMainText = isFlipped ? flashBackMain : flashFrontMain;
  const flashSubText = isFlipped ? flashBackSub : flashFrontSub;
  const flashMainLabel = isFlipped ? flashBackLabel : flashFrontLabel;
  const flashSubLabel = isFlipped ? flashBackSubLabel : flashFrontSubLabel;
  const showKanjiAnswerBackFurigana =
    isFlipped && flashPromptMode === "kanji_to_answer" && Boolean(kanjiFurigana);
  const quizQuestionMain =
    quizPromptMode === "vi_to_jp"
      ? meaningMain || hanvietMain || displayReadingMain(current)
      : quizPromptMode === "kanji_to_vi"
        ? kanjiMain || displayJapanese(current)
      : quizPromptMode === "kanji_to_hiragana"
        ? kanjiMain || displayJapanese(current)
        : displayReadingMain(current);
  const quizQuestionSub =
    quizPromptMode === "vi_to_jp"
      ? hanvietMain
        ? `Hán Việt: ${hanvietMain}`
        : ""
      : quizPromptMode === "kanji_to_vi"
        ? ""
      : quizPromptMode === "kanji_to_hiragana"
        ? ""
        : meaningMain;
  const quizPromptChip =
    quizPromptMode === "vi_to_jp"
      ? "Câu hỏi: Nghĩa tiếng Việt"
      : quizPromptMode === "kanji_to_vi"
        ? "Câu hỏi: Kanji"
      : quizPromptMode === "kanji_to_hiragana"
        ? "Câu hỏi: Kanji"
        : "Câu hỏi: Hiragana + Nghĩa";
  const quizAnswerChip =
    quizPromptMode === "reading_meaning_to_kanji"
      ? "Đáp án: Kanji"
      : quizPromptMode === "kanji_to_vi"
        ? "Đáp án: Nghĩa Việt"
      : quizPromptMode === "kanji_to_hiragana"
        ? "Đáp án: Hiragana"
        : "Đáp án: Tiếng Nhật";

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

  const sectionClassName = `mx-auto w-full max-w-5xl rounded-3xl border border-[#41507c] bg-[#2f3c66] text-slate-100 shadow-[0_16px_35px_rgba(18,28,56,0.45)] ${
    isCompactRecallLayout
      ? "max-h-[calc(100dvh-12px)] overflow-y-auto p-3 sm:p-4"
      : "p-4 sm:p-5"
  }`;

  return (
    <section className={sectionClassName}>
      <div className={`flex items-center justify-between ${isCompactRecallLayout ? "mb-2" : "mb-4"}`}>
        <button
          type="button"
          onClick={handleGoBack}
          className="inline-flex items-center gap-2 text-base text-slate-300 transition hover:text-white"
        >
          <span>{"<"}</span>
          <span>Quay lại</span>
        </button>
        <div className="text-center">
          <p className={`${isCompactRecallLayout ? "text-xs tracking-[0.16em]" : "text-sm tracking-widest"} uppercase text-slate-300`}>
            {lessonTitle}
          </p>
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
                  {showKanjiAnswerBackFurigana ? (
                    <div className="mt-1 text-slate-300">
                      <p className="text-xl">
                        <ruby className="font-kanji leading-none [ruby-position:over]">
                          <span className="font-kanji text-[1.08em] font-semibold">{kanjiMain}</span>
                          <rt className="relative top-[0.08em] text-[0.42em] leading-none font-semibold text-slate-200/95">
                            {kanjiFurigana}
                          </rt>
                        </ruby>
                      </p>
                      {hanvietMain ? (
                        <p className="mt-1 text-sm text-slate-300/90">Hán Việt: {hanvietMain}</p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="mt-1 text-xl text-slate-300">{flashSubText}</p>
                  )}
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

      {mode === "quiz" ? (
        <div className="rounded-2xl bg-[#32416d] p-8">
          <div className="mb-8 flex flex-wrap items-center justify-end gap-3">
            <div className="inline-flex rounded-xl bg-slate-800/80 p-1 text-sm">
              <button
                type="button"
                className={`rounded-lg px-3 py-1 font-semibold transition ${
                  quizPromptMode === "reading_meaning_to_kanji"
                    ? "bg-emerald-500 text-white"
                    : "text-slate-200 hover:bg-slate-700"
                }`}
                onClick={() => changeQuizPromptMode("reading_meaning_to_kanji")}
              >
                Hiragana + nghĩa
              </button>
              <button
                type="button"
                className={`rounded-lg px-3 py-1 font-semibold transition ${
                  quizPromptMode === "vi_to_jp"
                    ? "bg-sky-500 text-white"
                    : "text-slate-200 hover:bg-slate-700"
                }`}
                onClick={() => changeQuizPromptMode("vi_to_jp")}
              >
                Nghĩa Việt -{">"} Nhật
              </button>
              <button
                type="button"
                className={`rounded-lg px-3 py-1 font-semibold transition ${
                  quizPromptMode === "kanji_to_hiragana"
                    ? "bg-fuchsia-500 text-white"
                    : "text-slate-200 hover:bg-slate-700"
                }`}
                onClick={() => changeQuizPromptMode("kanji_to_hiragana")}
              >
                Kanji -{">"} Hiragana
              </button>
              <button
                type="button"
                className={`rounded-lg px-3 py-1 font-semibold transition ${
                  quizPromptMode === "kanji_to_vi"
                    ? "bg-amber-500 text-white"
                    : "text-slate-200 hover:bg-slate-700"
                }`}
                onClick={() => changeQuizPromptMode("kanji_to_vi")}
              >
                Kanji -{">"} Nghĩa Việt
              </button>
            </div>
            <div className="inline-flex rounded-xl bg-slate-700 p-1 text-sm">
              <span className="rounded-lg bg-emerald-500 px-3 py-1 font-semibold text-white">
                {quizPromptChip}
              </span>
              <span className="px-3 py-1 text-slate-200">{quizAnswerChip}</span>
            </div>
          </div>

          <div className="mb-8 text-center">
            <h2
              className={`font-semibold text-white ${
                quizPromptMode === "vi_to_jp" || quizPromptMode === "kanji_to_vi"
                  ? "text-4xl sm:text-5xl"
                  : "text-5xl"
              }`}
            >
              {quizQuestionMain}
            </h2>
            {quizQuestionSub ? (
              <p className="mt-2 text-2xl font-medium text-slate-200">{quizQuestionSub}</p>
            ) : null}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {quizOptions.map((option, optionIndex) => {
              const optionNo = optionIndex + 1;
              const selected = selectedOptionId === option.id;
              const correct = checkedQuiz && option.id === current.id;
              const wrong = checkedQuiz && selected && option.id !== current.id;
              const optionMain =
                quizPromptMode === "kanji_to_hiragana"
                  ? pickPrimaryHiraganaForQuiz(option) || "-"
                  : quizPromptMode === "kanji_to_vi"
                    ? option.meaning.trim() || displayJapanese(option).trim()
                  : displayJapanese(option).trim() || displayReadingMain(option).trim();
              const optionReading = option.reading.trim();
              const showFurigana =
                (alwaysShowQuizFurigana || checkedQuiz) &&
                optionReading.length > 0 &&
                quizPromptMode !== "kanji_to_hiragana" &&
                quizPromptMode !== "kanji_to_vi" &&
                hasJapaneseChars(optionMain) &&
                optionReading !== optionMain;
              const showMeaningAfterCheck =
                quizPromptMode === "kanji_to_hiragana" && checkedQuiz;
              const optionTextClass =
                quizPromptMode === "kanji_to_vi"
                  ? "text-2xl leading-snug sm:text-3xl"
                  : "text-4xl";
              const optionSpeakText = buildQuizOptionSpeakText(
                option,
                optionMain,
                optionReading,
                showFurigana,
                quizPromptMode
              );
              const canSpeakOption = hasJapaneseChars(optionSpeakText);

              return (
                <div key={`${option.id}-${optionIndex}`} className="flex items-stretch gap-2">
                  <button
                    type="button"
                    className={`flex-1 rounded-xl border px-6 py-5 text-left font-semibold transition ${optionTextClass} ${
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
                        <rt className="relative top-[0.08em] text-[0.42em] leading-none font-semibold text-slate-200/95">
                          {optionReading}
                        </rt>
                      </ruby>
                    ) : (
                      <span className="font-kanji text-[1.08em] font-semibold leading-none">{optionMain}</span>
                    )}
                    {showMeaningAfterCheck ? (
                      <p className="mt-2 text-base font-medium text-slate-200">
                        {option.meaning}
                      </p>
                    ) : null}
                  </button>
                  {canSpeakOption ? (
                    <div className="flex items-center">
                      <SpeakJpButton
                        text={optionSpeakText}
                        title="Phat am dap an"
                        className="h-11 w-11 border-slate-400/80 bg-slate-700 text-slate-100 hover:bg-slate-600"
                      />
                    </div>
                  ) : null}
                </div>
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
        <div className={`rounded-2xl bg-[#32416d] ${isCompactRecallLayout ? "p-4 sm:p-5" : "p-6"}`}>
          <div className={`flex items-center justify-center ${isCompactRecallLayout ? "mb-2 min-h-[72px]" : "mb-3 min-h-[96px]"}`}>
            <h2
              className={`text-center font-semibold leading-tight text-white ${
                isCompactRecallLayout ? "text-5xl sm:text-[3.1rem]" : "text-5xl"
              }`}
            >
              {isWordToMeaningRecall || isWordToReadingRecall ? currentDisplayWordPlain : current.meaning}
            </h2>
          </div>

          {!isWordToMeaningRecall && !isWordToReadingRecall ? (
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
          ) : null}

          <div className={`rounded-xl border-2 border-slate-300 bg-[#33425f] ${isCompactRecallLayout ? "mb-2 p-1.5" : "mb-3 p-2"}`}>
            <input
              ref={recallInputRef}
              className={`w-full rounded-lg bg-transparent text-white outline-none placeholder:text-slate-400 ${
                isCompactRecallLayout ? "px-3.5 py-2 text-lg sm:text-xl" : "px-4 py-2.5 text-xl"
              }`}
              lang={isWordToMeaningRecall ? "vi" : "ja"}
              spellCheck={isWordToMeaningRecall}
              autoCapitalize="off"
              autoCorrect="off"
              placeholder={
                isWordToMeaningRecall
                  ? "Gõ nghĩa tiếng Việt"
                  : isWordToReadingRecall
                    ? "Gõ cách đọc (hiragana / romaji)"
                  : recallKanaMode === "katakana"
                  ? "Gõ cách đọc, từ gốc hoặc romaji (ra katakana)"
                  : "Gõ cách đọc, từ gốc hoặc romaji (ra hiragana)"
              }
              value={recallInput}
              onCompositionStart={() => {
                if (isWordToMeaningRecall) {
                  return;
                }
                setIsComposingRomaji(true);
              }}
              onCompositionEnd={(event) => {
                if (isWordToMeaningRecall) {
                  setRecallInput(event.currentTarget.value);
                  return;
                }
                setIsComposingRomaji(false);
                const convertedHiragana = convertRomajiToHiraganaInput(event.currentTarget.value);
                setRecallInput(
                  isWordToReadingRecall
                    ? convertedHiragana
                    : recallKanaMode === "katakana"
                    ? hiraganaToKatakana(convertedHiragana)
                    : convertedHiragana
                );
              }}
              onChange={(event) => {
                const rawValue = event.target.value;
                if (isWordToMeaningRecall) {
                  setRecallInput(rawValue);
                  return;
                }
                const convertedHiragana = convertRomajiToHiraganaInput(rawValue);
                setRecallInput(
                  isComposingRomaji
                    ? rawValue
                    : isWordToReadingRecall
                      ? convertedHiragana
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
          <p className={`text-center text-slate-300 ${isCompactRecallLayout ? "mb-2 text-[11px]" : "mb-3 text-xs"}`}>
            {isWordToMeaningRecall
              ? "Hiển thị từ liên quan, bạn gõ nghĩa hoặc cách đọc để kiểm tra đúng/sai."
              : isWordToReadingRecall
                ? "Hiển thị từ, bạn gõ cách đọc để kiểm tra đúng/sai."
              : recallKanaMode === "katakana"
                ? "Gõ romaji sẽ tự chuyển sang katakana."
                : "Gõ romaji sẽ tự chuyển sang hiragana."}
          </p>

          {currentIsHard ? (
            <p
              className={`mb-2 text-center ${
                isCompactRecallLayout ? "text-sm" : "text-base"
              }`}
            >
              <span className="inline-flex items-center gap-2 rounded-full border border-rose-200/85 bg-gradient-to-r from-rose-500/30 to-pink-500/25 px-4 py-1.5 font-bold text-rose-50 shadow-[0_8px_20px_rgba(244,63,94,0.24)]">
                <span aria-hidden className="text-sm leading-none">★</span>
                <span>Từ này đã nằm trong mục chưa thuộc</span>
              </span>
            </p>
          ) : null}

          <div className={`grid md:grid-cols-3 ${isCompactRecallLayout ? "gap-2" : "gap-2.5"}`}>
            <button
              type="button"
              className={`flex items-center justify-center rounded-xl px-4 font-semibold ${
                currentIsHard
                  ? "border border-rose-200/85 bg-rose-500/25 text-rose-50"
                  : "bg-rose-500 text-white"
              } ${isCompactRecallLayout ? "h-12 text-base" : "h-14 text-lg"}`}
              title={currentIsHard ? "Bấm để bỏ khỏi mục chưa thuộc" : "Thêm từ này vào mục chưa thuộc"}
              onClick={markCurrentAsHard}
              onMouseDown={(event) => event.preventDefault()}
            >
              {currentIsHard ? "Đã thêm (bấm để bỏ)" : "Chưa thuộc"}
            </button>
            <button
              type="button"
              className={`flex items-center justify-center rounded-xl bg-slate-200 px-4 font-semibold text-slate-500 disabled:opacity-60 ${
                isCompactRecallLayout ? "h-12 text-base" : "h-14 text-lg"
              }`}
              onClick={useHint}
              disabled={hintCount >= 2}
              onMouseDown={(event) => event.preventDefault()}
              title={hintText}
            >
              {hintButtonLabel}
            </button>
            <button
              type="button"
              className={`flex items-center justify-center rounded-xl bg-orange-500 px-4 font-semibold text-white ${
                isCompactRecallLayout ? "h-12 text-base" : "h-14 text-lg"
              }`}
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

          {hintDetailText ? (
            <p
              className={`mt-2 rounded-lg border border-amber-200/75 bg-gradient-to-r from-amber-300/25 via-yellow-200/20 to-amber-300/25 px-3 py-2 text-center font-semibold text-white shadow-[0_8px_20px_rgba(252,211,77,0.18)] ${
                isCompactRecallLayout ? "text-sm" : "text-base"
              }`}
            >
              <span className="mr-1.5 rounded-full border border-amber-100/80 bg-amber-300/25 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-amber-100">
                Gợi ý
              </span>
              <span className="align-middle text-white">{hintDetailBody || hintDetailText}</span>
            </p>
          ) : null}

          <p
            className={`${isCompactRecallLayout ? "mt-2 min-h-[22px] text-sm" : "mt-3 min-h-[28px] text-base"} text-center ${
              isHardListRecallFeedback ? "text-rose-100" : recallSuccess ? "text-emerald-300" : "text-slate-300"
            }`}
          >
            {recallMessage ? (
              isHardListRecallFeedback ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-rose-200/85 bg-gradient-to-r from-rose-500/30 to-pink-500/25 px-4 py-1.5 font-bold text-rose-50 shadow-[0_8px_20px_rgba(244,63,94,0.28)]">
                  <span aria-hidden className="text-sm leading-none">★</span>
                  <span>{recallMessage}</span>
                </span>
              ) : (
                recallMessage
              )
            ) : (
              "Nhấn Enter để kiểm tra nhanh"
            )}
          </p>

          <div className={`${isCompactRecallLayout ? "mt-2 min-h-[96px]" : "mt-3 min-h-[118px]"}`}>
            <div
              aria-hidden={!recallSuccess}
              className={`border text-left transition-all duration-200 ${
                isCompactRecallLayout ? "rounded-md p-2.5" : "rounded-lg p-3"
              } ${
                recallSuccess
                  ? "translate-y-0 border-emerald-300/35 bg-emerald-500/10 opacity-100"
                  : "pointer-events-none translate-y-1 border-transparent bg-transparent opacity-0"
              }`}
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-200">Đáp án</p>
              <div className="mt-1.5 flex flex-wrap items-end gap-x-2.5 gap-y-1.5 text-white">
                <span className="text-sm font-semibold text-slate-300">Từ:</span>
                {hasJapaneseChars(recallAnswerWord) &&
                recallAnswerReading &&
                recallAnswerReading !== recallAnswerWord ? (
                  <ruby className="font-kanji leading-none [ruby-position:over]">
                    <span
                      className={`font-kanji font-semibold leading-none ${
                        isCompactRecallLayout ? "text-[1.58rem]" : "text-[1.7rem]"
                      }`}
                    >
                      {recallAnswerWord}
                    </span>
                    <rt className="relative top-[0.08em] text-[0.52em] leading-none font-semibold text-slate-200/95">
                      {recallAnswerReading}
                    </rt>
                  </ruby>
                ) : (
                  <span
                    className={`font-kanji font-semibold leading-none ${
                      isCompactRecallLayout ? "text-[1.58rem]" : "text-[1.7rem]"
                    }`}
                  >
                    {recallAnswerWord}
                  </span>
                )}
              </div>
              <p className={`${isCompactRecallLayout ? "mt-1.5 text-[15px]" : "mt-1.5 text-sm"} text-slate-100`}>
                <span className="font-semibold text-slate-200">Nghĩa:</span> {meaningMain || "-"}
              </p>
              {hanvietMain ? (
                <p className={`${isCompactRecallLayout ? "mt-0.5 text-[15px]" : "mt-0.5 text-sm"} text-slate-100`}>
                  <span className="font-semibold text-slate-200">Hán Việt:</span> {hanvietMain}
                </p>
              ) : null}
              {recallRadicalSummary ? (
                <p className={`${isCompactRecallLayout ? "mt-0.5 text-[15px]" : "mt-0.5 text-sm"} text-slate-100`}>
                  <span className="font-semibold text-slate-200">Bộ thủ:</span> {recallRadicalSummary}
                </p>
              ) : null}
            </div>
          </div>

          <div className={`${isCompactRecallLayout ? "mt-2" : "mt-3"} flex items-center justify-center gap-2.5`}>
            <button
              type="button"
              className={`inline-flex items-center justify-center rounded-full border border-slate-300/70 bg-slate-700/45 font-semibold text-slate-100 transition hover:bg-slate-600/55 ${
                isCompactRecallLayout ? "h-8 w-8 text-base" : "h-9 w-9 text-lg"
              }`}
              onClick={goPrev}
              aria-label="Từ trước"
              title="Từ trước"
              onMouseDown={(event) => event.preventDefault()}
            >
              ←
            </button>
            <button
              type="button"
              className={`inline-flex items-center justify-center rounded-full border border-slate-300/70 bg-slate-700/45 font-semibold text-slate-100 transition hover:bg-slate-600/55 ${
                isCompactRecallLayout ? "h-8 w-8 text-base" : "h-9 w-9 text-lg"
              }`}
              onClick={goNext}
              aria-label="Từ sau"
              title="Từ sau"
              onMouseDown={(event) => event.preventDefault()}
            >
              →
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                hardItems.length === 0
                  ? "cursor-not-allowed border border-slate-500 bg-slate-700/60 text-slate-400"
                  : isHardReview
                    ? "border border-rose-300 bg-rose-500/30 text-rose-100"
                    : "border border-slate-300/80 bg-slate-700/45 text-slate-100"
              }`}
              onClick={toggleHardReview}
              onMouseDown={(event) => event.preventDefault()}
              disabled={hardItems.length === 0}
            >
              {isHardReview
                ? `Xem tất cả (${items.length})`
                : `Ôn mục chưa thuộc (${hardItems.length})`}
            </button>
            {isHardReview ? (
              <span className="rounded-full border border-rose-300/70 bg-rose-500/15 px-2.5 py-1 text-xs font-semibold text-rose-100">
                Đang ôn mục chưa thuộc
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className={`${isCompactRecallLayout ? "mt-3 text-sm" : "mt-5 text-base"} flex items-center justify-between text-slate-300`}>
        <span>
          {index + 1} / {activeCount}
        </span>
        <span>
          Đúng {correctCount} | Sai {wrongCount}
        </span>
      </div>
      <div className={`${isCompactRecallLayout ? "mt-1.5" : "mt-2"} h-2 rounded-full bg-slate-600/70`}>
        <div
          className="h-2 rounded-full bg-emerald-400 transition-all"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {mode === "flashcard" || mode === "recall" ? (
        <div className="mt-4 rounded-2xl border border-slate-500/40 bg-[#25315a] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-slate-100">
                Danh sách từ chưa thuộc ({hardItems.length})
              </h3>
              <p className="mt-1 text-xs text-slate-300">
                {mode === "flashcard" ? (
                  <>
                    Từ nào bấm <span className="font-semibold text-rose-300">X</span> sẽ vào đây để ôn lại.
                  </>
                ) : (
                  <>
                    Từ nào bấm <span className="font-semibold text-rose-300">Chưa thuộc</span> sẽ vào đây để ôn lại.
                  </>
                )}
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
              {mode === "flashcard" ? (
                <>
                  Chưa có từ khó. Bấm nút <span className="font-bold text-rose-300">X</span> để đánh dấu từ cần ôn lại.
                </>
              ) : (
                <>
                  Chưa có từ khó. Bấm nút <span className="font-bold text-rose-300">Chưa thuộc</span> để đánh dấu từ cần ôn lại.
                </>
              )}
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
    </section>
  );
}

