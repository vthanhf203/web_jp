"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BookOpenText,
  Brain,
  Check,
  Clock3,
  FileJson2,
  Flame,
  Gamepad2,
  Languages,
  Lightbulb,
  Medal,
  Play,
  RotateCcw,
  Settings2,
  Shuffle,
  Star,
  Trash2,
  Trophy,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { SpeakJpButton } from "@/app/components/speak-jp-button";
import { HandwrittenKanjiGlyph } from "@/app/components/kanji-handwriting-glyph";
import { parseVocabInput } from "@/lib/vocab-import";

export type MatchGameItem = {
  id: string;
  word: string;
  reading: string;
  meaning: string;
  kind?: "vocab" | "kanji" | "related";
};

export type MatchSourceOption = {
  value: string;
  label: string;
  href: string;
  group: string;
  count: number;
};

type GameCard = {
  key: string;
  pairId: string;
  side: "word" | "meaning";
  word: string;
  reading: string;
  meaning: string;
  kind: "vocab" | "kanji" | "related";
};

type GameStatus = "playing" | "complete";

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededShuffle<T>(items: T[], seedText: string): T[] {
  const result = [...items];
  let seed = hashSeed(seedText) || 1;

  for (let index = result.length - 1; index > 0; index -= 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const swapIndex = seed % (index + 1);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }

  return result;
}

function createCards(
  items: MatchGameItem[],
  roundSeed: number,
  boardSeed: number
): GameCard[] {
  const cards = items.flatMap<GameCard>((item) => [
    {
      key: `${item.id}:word`,
      pairId: item.id,
      side: "word",
      word: item.word,
      reading: item.reading,
      meaning: item.meaning,
      kind: item.kind ?? "vocab",
    },
    {
      key: `${item.id}:meaning`,
      pairId: item.id,
      side: "meaning",
      word: item.word,
      reading: item.reading,
      meaning: item.meaning,
      kind: item.kind ?? "vocab",
    },
  ]);

  return seededShuffle(cards, `cards-${roundSeed}-${boardSeed}`);
}

function selectRoundItems(
  items: MatchGameItem[],
  pairCount: number,
  seenPairIds: Set<string>,
  weakPairIds: Set<string>,
  seed: number
): MatchGameItem[] {
  const targetCount = Math.min(pairCount, items.length);
  const selected: MatchGameItem[] = [];
  const selectedIds = new Set<string>();

  const addItems = (candidates: MatchGameItem[]) => {
    for (const item of candidates) {
      if (selected.length >= targetCount) {
        return;
      }
      if (!selectedIds.has(item.id)) {
        selected.push(item);
        selectedIds.add(item.id);
      }
    }
  };

  addItems(
    seededShuffle(
      items.filter((item) => !seenPairIds.has(item.id)),
      `unseen-${seed}`
    )
  );
  addItems(
    seededShuffle(
      items.filter((item) => seenPairIds.has(item.id) && weakPairIds.has(item.id)),
      `weak-${seed}`
    )
  );
  addItems(seededShuffle(items, `seen-${seed}`));

  return selected;
}

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  tone: "violet" | "orange" | "sky" | "emerald";
}) {
  const toneClass = {
    violet: "bg-violet-50 text-violet-700 ring-violet-100",
    orange: "bg-orange-50 text-orange-700 ring-orange-100",
    sky: "bg-sky-50 text-sky-700 ring-sky-100",
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  }[tone];

  return (
    <div className={`flex items-center gap-2 rounded-2xl px-3 py-2 ring-1 ${toneClass}`}>
      <span className="grid h-8 w-8 place-items-center rounded-xl bg-white/80">{icon}</span>
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.12em] opacity-60">{label}</p>
        <p className="font-mono text-base font-black leading-none">{value}</p>
      </div>
    </div>
  );
}

export function VocabMatchGame({
  title,
  subtitle,
  items,
  sourceOptions,
  selectedSource,
  returnHref,
}: {
  title: string;
  subtitle: string;
  items: MatchGameItem[];
  sourceOptions: MatchSourceOption[];
  selectedSource: string;
  returnHref: string;
}) {
  const router = useRouter();
  const [customItems, setCustomItems] = useState<MatchGameItem[] | null>(null);
  const [jsonInput, setJsonInput] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const activeItems = customItems ?? items;
  const availablePairCounts = useMemo(() => {
    const presets = [6, 8, 10, 12, 16, 20, 24, 30].filter((count) => count <= activeItems.length);
    return presets.length > 0 ? presets : [activeItems.length];
  }, [activeItems.length]);
  const defaultPairCount = availablePairCounts[Math.min(1, availablePairCounts.length - 1)];
  const [pairCount, setPairCount] = useState(() => defaultPairCount);
  const [roundSeed, setRoundSeed] = useState(1);
  const [boardSeed, setBoardSeed] = useState(1);
  const [roundItems, setRoundItems] = useState<MatchGameItem[]>(() =>
    selectRoundItems(activeItems, defaultPairCount, new Set(), new Set(), 1)
  );
  const [seenPairIds, setSeenPairIds] = useState<Set<string>>(
    () => new Set(selectRoundItems(activeItems, defaultPairCount, new Set(), new Set(), 1).map((item) => item.id))
  );
  const [weakPairIds, setWeakPairIds] = useState<Set<string>>(() => new Set());
  const [matchedPairs, setMatchedPairs] = useState<Set<string>>(() => new Set());
  const [selectedCards, setSelectedCards] = useState<GameCard[]>([]);
  const [wrongKeys, setWrongKeys] = useState<Set<string>>(() => new Set());
  const [hintKeys, setHintKeys] = useState<Set<string>>(() => new Set());
  const [locked, setLocked] = useState(false);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [status, setStatus] = useState<GameStatus>("playing");
  const pendingTimeout = useRef<number | null>(null);

  const cards = useMemo(
    () => createCards(roundItems, roundSeed, boardSeed),
    [roundItems, roundSeed, boardSeed]
  );

  useEffect(() => {
    if (status !== "playing") {
      return;
    }
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [status, roundSeed]);

  useEffect(
    () => () => {
      if (pendingTimeout.current !== null) {
        window.clearTimeout(pendingTimeout.current);
      }
    },
    []
  );

  function clearPendingTimeout() {
    if (pendingTimeout.current !== null) {
      window.clearTimeout(pendingTimeout.current);
      pendingTimeout.current = null;
    }
  }

  function resetRoundStats() {
    clearPendingTimeout();
    setBoardSeed(1);
    setMatchedPairs(new Set());
    setSelectedCards([]);
    setWrongKeys(new Set());
    setHintKeys(new Set());
    setLocked(false);
    setScore(0);
    setCombo(0);
    setBestCombo(0);
    setAttempts(0);
    setElapsed(0);
    setStatus("playing");
  }

  function beginSourceRound(sourceItems: MatchGameItem[], nextPairCount: number) {
    const nextSeed = roundSeed + 1;
    const nextItems = selectRoundItems(sourceItems, nextPairCount, new Set(), new Set(), nextSeed);
    setPairCount(nextPairCount);
    setRoundSeed(nextSeed);
    setRoundItems(nextItems);
    setSeenPairIds(new Set(nextItems.map((item) => item.id)));
    setWeakPairIds(new Set());
    resetRoundStats();
  }

  function advanceRound(nextPairCount = pairCount) {
    const nextSeed = roundSeed + 1;
    const nextItems = selectRoundItems(activeItems, nextPairCount, seenPairIds, weakPairIds, nextSeed);
    setPairCount(nextPairCount);
    setRoundSeed(nextSeed);
    setRoundItems(nextItems);
    setSeenPairIds((current) => {
      const next = new Set(current);
      nextItems.forEach((item) => next.add(item.id));
      return next;
    });
    resetRoundStats();
  }

  function replayRound() {
    setRoundSeed((value) => value + 1);
    resetRoundStats();
  }

  function startImportedRound() {
    const rows = parseVocabInput(jsonInput).slice(0, 200);
    const importedItems = rows.map((row, index) => ({
      id: `json:${index}:${row.word}:${row.meaning}`,
      word: row.kanji.trim() || row.word.trim(),
      reading: row.reading.trim() || row.word.trim(),
      meaning: row.meaning.trim(),
      kind: "vocab" as const,
    }));

    if (importedItems.length < 2) {
      setImportMessage("Không đọc được dữ liệu hoặc chưa đủ 2 từ có nghĩa.");
      return;
    }

    const nextPairCount = Math.min(importedItems.length, importedItems.length >= 16 ? 16 : importedItems.length >= 8 ? 8 : importedItems.length);
    setCustomItems(importedItems);
    setImportMessage(`Đã nạp ${importedItems.length} từ. Bàn mới bắt đầu với ${nextPairCount} cặp.`);
    beginSourceRound(importedItems, nextPairCount);
  }

  function clearImportedItems() {
    setCustomItems(null);
    setJsonInput("");
    setImportMessage("");
    const nextPairCount = Math.min(items.length, items.length >= 8 ? 8 : items.length);
    beginSourceRound(items, nextPairCount);
  }

  async function loadJsonFile(file: File) {
    const content = await file.text();
    setJsonInput(content);
    setImportMessage(`Đã đọc file ${file.name}. Bấm "Chơi bộ JSON này" để bắt đầu.`);
  }

  function handleCardClick(card: GameCard) {
    if (
      locked ||
      status !== "playing" ||
      matchedPairs.has(card.pairId) ||
      selectedCards.some((selected) => selected.key === card.key)
    ) {
      return;
    }

    if (selectedCards.length === 0) {
      setSelectedCards([card]);
      return;
    }

    const firstCard = selectedCards[0];
    if (firstCard.side === card.side) {
      setSelectedCards([card]);
      return;
    }

    const nextSelected = [firstCard, card];
    const isMatch = firstCard.pairId === card.pairId;
    setSelectedCards(nextSelected);
    setAttempts((value) => value + 1);
    setLocked(true);

    if (isMatch) {
      const nextCombo = combo + 1;
      setCombo(nextCombo);
      setBestCombo((value) => Math.max(value, nextCombo));
      setScore((value) => value + 100 + Math.min(nextCombo, 8) * 20);
      pendingTimeout.current = window.setTimeout(() => {
        const nextMatched = new Set(matchedPairs);
        nextMatched.add(card.pairId);
        setMatchedPairs(nextMatched);
        setSelectedCards([]);
        setLocked(false);
        pendingTimeout.current = null;
        if (nextMatched.size >= roundItems.length) {
          setStatus("complete");
        }
      }, 280);
      return;
    }

    setCombo(0);
    setScore((value) => Math.max(0, value - 15));
    setWeakPairIds((current) => {
      const next = new Set(current);
      next.add(firstCard.pairId);
      next.add(card.pairId);
      return next;
    });
    setWrongKeys(new Set(nextSelected.map((selected) => selected.key)));
    pendingTimeout.current = window.setTimeout(() => {
      setSelectedCards([]);
      setWrongKeys(new Set());
      setLocked(false);
      pendingTimeout.current = null;
    }, 650);
  }

  function shuffleBoard() {
    if (status !== "playing") {
      return;
    }
    clearPendingTimeout();
    setBoardSeed((value) => value + 1);
    setSelectedCards([]);
    setWrongKeys(new Set());
    setHintKeys(new Set());
    setLocked(false);
    setCombo(0);
    setScore((value) => Math.max(0, value - 25));
  }

  function showHint() {
    if (locked || status !== "playing") {
      return;
    }
    const remaining = cards.find((card) => !matchedPairs.has(card.pairId));
    if (!remaining) {
      return;
    }
    const matchingKeys = cards
      .filter((card) => card.pairId === remaining.pairId)
      .map((card) => card.key);
    setHintKeys(new Set(matchingKeys));
    setScore((value) => Math.max(0, value - 35));
    window.setTimeout(() => setHintKeys(new Set()), 900);
  }

  const accuracy = attempts === 0 ? 100 : Math.round((matchedPairs.size / attempts) * 100);
  const progress = Math.round((matchedPairs.size / roundItems.length) * 100);
  const coverageProgress = Math.round((seenPairIds.size / activeItems.length) * 100);
  const sourceGroups = Array.from(new Set(sourceOptions.map((option) => option.group)));
  const isMaximumBoard = pairCount >= 30;
  const boardGridClass =
    pairCount >= 24
      ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5"
      : pairCount >= 16
        ? "grid-cols-2 sm:grid-cols-3 xl:grid-cols-4"
        : "grid-cols-2 md:grid-cols-3 xl:grid-cols-4";

  function renderCard(card: GameCard) {
    const isMatched = matchedPairs.has(card.pairId);
    const isSelected = selectedCards.some((selected) => selected.key === card.key);
    const isWrong = wrongKeys.has(card.key);
    const isHint = hintKeys.has(card.key);
    const baseColor =
      card.side === "word"
        ? card.kind === "kanji"
          ? "border-amber-200 bg-gradient-to-br from-white to-amber-50 text-slate-950 hover:border-amber-500 hover:bg-amber-50"
          : "border-emerald-200 bg-gradient-to-br from-white to-emerald-50 text-slate-950 hover:border-emerald-500 hover:bg-emerald-50"
        : "border-violet-200 bg-gradient-to-br from-white to-violet-50 text-slate-900 hover:border-violet-500 hover:bg-violet-50";

    return (
      <div
        key={card.key}
        className={`relative min-h-[98px] overflow-hidden rounded-2xl border-2 text-left shadow-[0_4px_0_rgba(51,65,85,0.08)] transition-all duration-300 ${
          isMaximumBoard ? "xl:min-h-[92px]" : "sm:min-h-[108px]"
        } ${
          isMatched
            ? "pointer-events-none scale-90 border-transparent opacity-0"
            : isWrong
              ? "animate-pulse border-rose-400 bg-rose-50 text-rose-900 shadow-[0_8px_20px_rgba(244,63,94,0.18)]"
              : isHint
                ? "scale-[1.02] border-amber-400 bg-amber-50 shadow-[0_0_0_4px_rgba(251,191,36,0.2)]"
                : isSelected
                  ? card.side === "word"
                    ? card.kind === "kanji"
                      ? "scale-[1.02] border-amber-500 bg-amber-100 shadow-[0_8px_20px_rgba(245,158,11,0.22)]"
                      : "scale-[1.02] border-emerald-500 bg-emerald-100 shadow-[0_8px_20px_rgba(16,185,129,0.22)]"
                    : "scale-[1.02] border-violet-500 bg-violet-100 shadow-[0_8px_20px_rgba(139,92,246,0.22)]"
                  : baseColor
        }`}
      >
        <button
          type="button"
          onClick={() => handleCardClick(card)}
          disabled={isMatched}
          aria-label={card.side === "word" ? `Chọn từ ${card.word}` : `Chọn nghĩa ${card.meaning}`}
          className="flex min-h-[inherit] w-full items-center px-3 py-3 text-left"
        >
          <span className="min-w-0 flex-1 pr-8">
            {card.side === "word" ? (
              <>
                {card.kind === "kanji" ? (
                  <HandwrittenKanjiGlyph
                    character={card.word}
                    title={`Kanji ${card.word}`}
                    className={`mx-auto text-amber-950 ${isMaximumBoard ? "h-14 w-14" : "h-[4.5rem] w-[4.5rem]"}`}
                    fallbackClassName={`font-kanji-art block text-center font-black leading-none text-amber-950 ${
                      isMaximumBoard ? "text-5xl" : "text-6xl"
                    }`}
                    strokeWidth={4.9}
                  />
                ) : card.kind === "related" ? (
                  <span
                    lang="ja"
                    className={`block max-w-full whitespace-nowrap font-kanji-art font-black leading-tight text-emerald-950 ${
                      isMaximumBoard ? "text-2xl sm:text-[1.75rem]" : "text-3xl sm:text-4xl"
                    }`}
                    title={card.word}
                  >
                    {card.word}
                  </span>
                ) : (
                  <span className={`block font-black leading-tight text-slate-950 ${
                    isMaximumBoard ? "text-lg" : "text-xl sm:text-[1.35rem]"
                  }`}>
                    {card.word}
                  </span>
                )}
                {card.kind === "vocab" && card.reading && card.reading !== card.word ? (
                  <span className={`mt-1.5 block font-black leading-tight text-sky-700 ${isMaximumBoard ? "text-xs" : "text-sm"}`}>
                    {card.reading}
                  </span>
                ) : null}
              </>
            ) : (
              <>
                <span className={`block font-black leading-snug text-slate-800 ${isMaximumBoard ? "text-xs" : "text-sm sm:text-[0.95rem]"}`}>
                  {card.meaning}
                </span>
                {(card.kind === "kanji" || card.kind === "related") && card.reading ? (
                  <span lang="ja" className={`mt-2 block border-t border-violet-200 pt-1.5 font-kanji font-black leading-snug text-sky-700 ${
                    isMaximumBoard ? "text-[11px]" : "text-sm"
                  }`}>
                    {card.reading}
                  </span>
                ) : null}
              </>
            )}
          </span>
        </button>

        <span
          className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.12em] ${
            card.side === "word"
              ? card.kind === "kanji"
                ? "bg-amber-100 text-amber-800"
                : "bg-emerald-100 text-emerald-700"
              : "bg-violet-100 text-violet-700"
          }`}
        >
          {card.side === "word"
            ? card.kind === "kanji"
              ? "Kanji"
              : card.kind === "related"
                ? "Từ viết tay"
                : "Từ"
            : card.kind === "kanji" || card.kind === "related"
              ? "Nghĩa + đọc"
              : "Nghĩa"}
        </span>

        {!isSelected && !isWrong ? (
          card.side === "word" ? (
            <SpeakJpButton
              text={card.kind === "kanji" ? card.word : card.reading || card.word}
              title={`Phát âm ${card.word}`}
              className={`absolute bottom-2 right-2 h-8 w-8 border-2 bg-white shadow-sm ${
                card.kind === "kanji"
                  ? "border-amber-200 text-amber-700 hover:bg-amber-100"
                  : "border-emerald-200 text-emerald-700 hover:bg-emerald-100"
              }`}
            />
          ) : (
            <span className="absolute bottom-2 right-2 grid h-8 w-8 place-items-center rounded-full border-2 border-violet-200 bg-white text-xs font-black text-violet-600 shadow-sm">
              {card.kind === "kanji" || card.kind === "related" ? "読" : "VI"}
            </span>
          )
        ) : null}

        {isSelected || isWrong ? (
          <span
            className={`ml-2 grid h-7 w-7 shrink-0 place-items-center rounded-full text-white ${
              isWrong ? "bg-rose-500" : card.side === "word" ? "bg-emerald-600" : "bg-violet-600"
            }`}
          >
            {isWrong ? <X className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <section className="relative isolate overflow-hidden rounded-[2rem] border-[3px] border-sky-300 bg-gradient-to-b from-sky-400 via-sky-100 to-emerald-100 p-3 shadow-[0_28px_70px_rgba(14,116,144,0.24)] sm:p-4">
      <div className="pointer-events-none absolute -left-12 top-20 -z-10 h-40 w-72 rounded-full bg-white/75 blur-2xl" />
      <div className="pointer-events-none absolute right-4 top-10 -z-10 h-32 w-64 rounded-full bg-white/70 blur-2xl" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-44 bg-gradient-to-t from-emerald-400/45 to-transparent" />

      <div className="relative grid gap-3 xl:grid-cols-[190px_minmax(0,1fr)]">
        <aside className="hidden flex-col gap-3 rounded-[1.7rem] border-2 border-amber-200 bg-white/88 p-3 shadow-[0_12px_0_rgba(180,83,9,0.12)] backdrop-blur-sm xl:flex">
          <div className="rounded-2xl bg-gradient-to-b from-amber-100 to-orange-50 p-3 text-center ring-2 ring-amber-200">
            <Image
              src="/images/home-vocab.png"
              alt="JP Lab vocabulary"
              width={150}
              height={150}
              className="mx-auto h-28 w-28 rounded-2xl object-cover shadow-md"
            />
            <p className="mt-2 text-lg font-black text-orange-600">JP LAB GAME</p>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Học Nhật ngữ mỗi ngày</p>
          </div>

          <Link href="/vocab" className="flex items-center gap-2 rounded-xl border-2 border-amber-400 bg-gradient-to-r from-yellow-300 to-amber-300 px-3 py-2.5 text-xs font-black text-amber-950 shadow-[0_4px_0_#d97706]">
            <BookOpenText className="h-4 w-4" />
            Kho học liệu
          </Link>
          <Link href="/review" className="flex items-center gap-2 rounded-xl border-2 border-orange-200 bg-white px-3 py-2.5 text-xs font-black text-slate-700 shadow-[0_3px_0_#fed7aa] transition hover:-translate-y-0.5">
            <Brain className="h-4 w-4 text-orange-500" />
            Ôn tập SRS
          </Link>
          <a href="#match-json" className="flex items-center gap-2 rounded-xl border-2 border-violet-200 bg-white px-3 py-2.5 text-xs font-black text-slate-700 shadow-[0_3px_0_#ddd6fe] transition hover:-translate-y-0.5">
            <FileJson2 className="h-4 w-4 text-violet-500" />
            Nhập JSON
          </a>
          <Link href="/personal" className="flex items-center gap-2 rounded-xl border-2 border-emerald-200 bg-white px-3 py-2.5 text-xs font-black text-slate-700 shadow-[0_3px_0_#a7f3d0] transition hover:-translate-y-0.5">
            <Medal className="h-4 w-4 text-emerald-500" />
            Thành tích
          </Link>
          <Link href="/vocab" className="flex items-center gap-2 rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-xs font-black text-slate-700 shadow-[0_3px_0_#e2e8f0] transition hover:-translate-y-0.5">
            <Settings2 className="h-4 w-4 text-slate-500" />
            Đổi bộ từ
          </Link>

          <div className="mt-auto rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-3 text-center">
            <Star className="mx-auto h-6 w-6 fill-amber-300 text-amber-500" />
            <p className="mt-1 text-xs font-black text-emerald-900">Học mỗi ngày</p>
            <p className="text-[10px] font-bold text-emerald-700">Tiến bộ mỗi ngày</p>
          </div>
        </aside>

        <main className="min-w-0 space-y-3">
          <header className="rounded-[1.7rem] border-2 border-amber-200 bg-[#fffdf5]/95 p-3 shadow-[0_8px_0_rgba(180,83,9,0.12)] sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <Link
                  href={returnHref}
                  aria-label="Quay lại"
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-full border-2 border-sky-200 bg-white text-sky-700 shadow-[0_3px_0_#bae6fd] transition hover:-translate-y-0.5"
                >
                  <ArrowLeft className="h-5 w-5" />
                </Link>
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border-4 border-amber-300 bg-gradient-to-br from-sky-400 to-indigo-500 text-white shadow-md">
                  <Languages className="h-6 w-6" />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-orange-500">Game nối cặp Nhật ngữ</p>
                  <h1 className="truncate text-lg font-black text-slate-900 sm:text-2xl">{title}</h1>
                  <p className="line-clamp-1 text-xs font-bold text-slate-500">{subtitle}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full border-2 border-orange-200 bg-white px-3 py-1.5 text-xs font-black text-orange-600">
                  <Flame className="h-4 w-4" />
                  x{combo}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border-2 border-sky-200 bg-white px-3 py-1.5 text-xs font-black text-sky-700">
                  <Trophy className="h-4 w-4" />
                  {score}
                </span>
              </div>
            </div>

            <div className="mt-3 grid gap-3 border-t border-amber-100 pt-3 lg:grid-cols-[minmax(0,1fr)_auto]">
              <label className="rounded-xl border-2 border-amber-100 bg-white px-3 py-2">
                <span className="block text-[9px] font-black uppercase tracking-[0.14em] text-amber-600">Bộ từ đang chơi</span>
                <select
                  value={customItems ? "custom-json" : selectedSource}
                  onChange={(event) => {
                    if (event.target.value === "custom-json") {
                      return;
                    }
                    const option = sourceOptions.find((entry) => entry.value === event.target.value);
                    if (option) {
                      if (customItems) {
                        clearImportedItems();
                      }
                      router.push(option.href);
                    }
                  }}
                  className="mt-0.5 w-full bg-transparent text-xs font-black text-slate-800 outline-none"
                >
                  {customItems ? (
                    <optgroup label="JSON chơi ngay">
                      <option value="custom-json">Bộ JSON vừa nhập ({customItems.length})</option>
                    </optgroup>
                  ) : null}
                  {sourceGroups.map((group) => (
                    <optgroup key={group} label={group}>
                      {sourceOptions
                        .filter((option) => option.group === group)
                        .map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label} ({option.count})
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </label>

              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">Số cặp</span>
                {availablePairCounts.map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => advanceRound(count)}
                    className={`h-8 min-w-8 rounded-lg border-2 px-2 text-[10px] font-black transition ${
                      pairCount === count
                        ? "border-amber-500 bg-amber-300 text-amber-950 shadow-[0_3px_0_#d97706]"
                        : "border-slate-200 bg-white text-slate-600 hover:border-amber-300"
                    }`}
                  >
                    {count}
                  </button>
                ))}
              </div>
            </div>
          </header>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatCard icon={<Trophy className="h-4 w-4" />} label="Điểm" value={score} tone="violet" />
            <StatCard icon={<Flame className="h-4 w-4" />} label="Combo" value={`x${combo}`} tone="orange" />
            <StatCard icon={<Clock3 className="h-4 w-4" />} label="Thời gian" value={formatTime(elapsed)} tone="sky" />
            <StatCard icon={<Check className="h-4 w-4" />} label="Còn lại" value={roundItems.length - matchedPairs.size} tone="emerald" />
          </div>

          <div className="rounded-[1.7rem] border-2 border-amber-200 bg-[#fffdf6]/95 p-3 shadow-[0_8px_0_rgba(180,83,9,0.12)] sm:p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-xs font-black text-slate-700">
                <span className="grid h-8 w-8 place-items-center rounded-full border-2 border-red-200 bg-white text-red-500">
                  <Gamepad2 className="h-4 w-4" />
                </span>
                Chọn một thẻ tiếng Nhật, sau đó chọn nghĩa đúng.
              </p>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" onClick={showHint} className="inline-flex items-center gap-1 rounded-lg border-2 border-amber-300 bg-yellow-100 px-2.5 py-1.5 text-[10px] font-black text-amber-800 shadow-[0_2px_0_#f59e0b]">
                  <Lightbulb className="h-3.5 w-3.5" />
                  Gợi ý -35
                </button>
                <button type="button" onClick={shuffleBoard} className="inline-flex items-center gap-1 rounded-lg border-2 border-sky-300 bg-sky-100 px-2.5 py-1.5 text-[10px] font-black text-sky-800 shadow-[0_2px_0_#38bdf8]">
                  <Shuffle className="h-3.5 w-3.5" />
                  Trộn -25
                </button>
                <button type="button" onClick={replayRound} className="inline-flex items-center gap-1 rounded-lg border-2 border-slate-300 bg-white px-2.5 py-1.5 text-[10px] font-black text-slate-700 shadow-[0_2px_0_#cbd5e1]">
                  <RotateCcw className="h-3.5 w-3.5" />
                  Chơi lại
                </button>
              </div>
            </div>

            <div className={`grid gap-2 ${boardGridClass}`}>{cards.map(renderCard)}</div>

            <div className="mt-4 flex items-center gap-3 rounded-2xl border-2 border-amber-200 bg-amber-50 px-3 py-2">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 border-sky-300 bg-white text-sky-600">
                <Star className="h-4 w-4 fill-amber-300 text-amber-500" />
              </span>
              <div className="h-3 flex-1 overflow-hidden rounded-full border-2 border-amber-200 bg-white">
                <div className="h-full rounded-full bg-gradient-to-r from-sky-400 via-emerald-400 to-amber-400 transition-all duration-500" style={{ width: `${progress}%` }} />
              </div>
              <span className="rounded-full bg-amber-300 px-3 py-1 text-[10px] font-black text-amber-900">{progress}% ván</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] font-black text-slate-600">
              <span>Độ phủ bộ từ: {seenPairIds.size}/{activeItems.length} ({coverageProgress}%)</span>
              <span className={weakPairIds.size > 0 ? "text-rose-600" : "text-emerald-700"}>
                Từ cần ôn lại: {weakPairIds.size}
              </span>
            </div>
          </div>

          <details id="match-json" className="group rounded-[1.5rem] border-2 border-violet-200 bg-white/95 shadow-[0_6px_0_rgba(124,58,237,0.1)]">
            <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-4 py-3">
              <span className="flex items-center gap-2 text-sm font-black text-slate-800">
                <FileJson2 className="h-5 w-5 text-violet-600" />
                Học chủ động bằng JSON
              </span>
              <span className="rounded-lg bg-violet-100 px-3 py-1.5 text-[10px] font-black text-violet-700">
                {customItems ? `${customItems.length} từ đang dùng` : "Mở nhập JSON"}
              </span>
            </summary>
            <div className="border-t border-violet-100 p-4">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
                <textarea
                  value={jsonInput}
                  onChange={(event) => setJsonInput(event.target.value)}
                  className="min-h-36 resize-y rounded-2xl border-2 border-violet-100 bg-violet-50/40 px-4 py-3 font-mono text-xs leading-relaxed text-slate-700 outline-none focus:border-violet-300"
                  placeholder='[{"word":"べんきょう","reading":"べんきょう","kanji":"勉強","meaning":"học tập"}]'
                />
                <div className="space-y-2">
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-violet-300 bg-violet-50 px-4 py-2.5 text-xs font-black text-violet-700">
                    <Upload className="h-4 w-4" />
                    Chọn file JSON / TXT
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,.txt,.jsonl"
                    className="hidden"
                    onChange={async (event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        await loadJsonFile(file);
                      }
                      event.currentTarget.value = "";
                    }}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setJsonInput(
                        '[\n  {"word":"べんきょう","reading":"べんきょう","kanji":"勉強","meaning":"học tập"},\n  {"word":"でんしゃ","reading":"でんしゃ","kanji":"電車","meaning":"tàu điện"},\n  {"word":"ありがとう","reading":"ありがとう","meaning":"cảm ơn"}\n]'
                      )
                    }
                    className="w-full rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-black text-slate-600"
                  >
                    Điền mẫu JSON
                  </button>
                  <button type="button" onClick={startImportedRound} className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-black text-white">
                    <Play className="h-4 w-4" />
                    Chơi bộ JSON này
                  </button>
                  {customItems ? (
                    <button type="button" onClick={clearImportedItems} className="flex w-full items-center justify-center gap-2 rounded-xl bg-rose-50 px-4 py-2.5 text-xs font-black text-rose-600">
                      <Trash2 className="h-4 w-4" />
                      Bỏ bộ JSON
                    </button>
                  ) : null}
                </div>
              </div>
              {importMessage ? (
                <p className={`mt-3 rounded-xl px-3 py-2 text-xs font-bold ${customItems ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                  {importMessage}
                </p>
              ) : null}
            </div>
          </details>
        </main>
      </div>

      {status === "complete" ? (
        <div className="absolute inset-0 z-20 grid place-items-center bg-slate-950/35 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[2rem] border border-white/80 bg-white p-6 text-center shadow-2xl sm:p-8">
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-amber-300 to-orange-500 text-white shadow-lg shadow-orange-200">
              <Trophy className="h-8 w-8" />
            </span>
            <p className="mt-4 text-xs font-black uppercase tracking-[0.18em] text-violet-600">Hoàn thành bàn chơi</p>
            <h2 className="mt-1 text-3xl font-black text-slate-900">{score} điểm</h2>
            <p className="mt-2 text-xs font-bold text-slate-500">
              Đã gặp {seenPairIds.size}/{activeItems.length} từ. Ván mới sẽ ưu tiên từ chưa xuất hiện và từ từng chọn sai.
            </p>
            <div className="mt-5 grid grid-cols-3 gap-2">
              <div className="rounded-2xl bg-sky-50 p-3">
                <p className="text-[10px] font-black uppercase text-sky-500">Thời gian</p>
                <p className="mt-1 font-mono font-black text-sky-800">{formatTime(elapsed)}</p>
              </div>
              <div className="rounded-2xl bg-orange-50 p-3">
                <p className="text-[10px] font-black uppercase text-orange-500">Combo tốt</p>
                <p className="mt-1 font-mono font-black text-orange-800">x{bestCombo}</p>
              </div>
              <div className="rounded-2xl bg-emerald-50 p-3">
                <p className="text-[10px] font-black uppercase text-emerald-500">Chính xác</p>
                <p className="mt-1 font-mono font-black text-emerald-800">{accuracy}%</p>
              </div>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <Link
                href={returnHref}
                className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-black text-slate-600 transition hover:bg-slate-200"
              >
                Về bộ từ
              </Link>
              <button
                type="button"
                onClick={() => advanceRound()}
                className="rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-violet-200 transition hover:-translate-y-0.5"
              >
                Ván mới
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
