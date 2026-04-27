"use client";

import Link from "next/link";
import {
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { SpeakJpButton } from "@/app/components/speak-jp-button";

type RoadmapLevel = "N5" | "N4" | "N3" | "N2" | "N1";

type RoadmapKanjiItem = {
  id: string;
  character: string;
  meaning: string;
  onReading: string;
  kunReading: string;
  strokeCount: number;
  jlptLevel: string;
  exampleWord: string;
  exampleMeaning: string;
};

type QuizQuestion = {
  id: string;
  prompt: string;
  subPrompt: string;
  answerId: string;
  answerLabel: string;
  options: Array<{
    id: string;
    label: string;
  }>;
};

type RoadmapProgressState = {
  completedDays: Record<RoadmapLevel, number[]>;
  masteredIds: string[];
  activityDates: string[];
};

type Props = {
  items: RoadmapKanjiItem[];
  initialLevel: string;
  dailyTarget?: number;
};

const ROADMAP_LEVELS: RoadmapLevel[] = ["N5", "N4", "N3", "N2", "N1"];
const ROADMAP_STORAGE_KEY = "kanji_roadmap_state_v3";
const BOARD_SIZE = 420;
const SAMPLE_SIZE = 72;
const SAMPLE_PADDING = 6;

const levelStyleMap: Record<RoadmapLevel, string> = {
  N5: "border-emerald-300 bg-emerald-100 text-emerald-800",
  N4: "border-blue-300 bg-blue-100 text-blue-800",
  N3: "border-amber-300 bg-amber-100 text-amber-800",
  N2: "border-orange-300 bg-orange-100 text-orange-800",
  N1: "border-rose-300 bg-rose-100 text-rose-800",
};

function normalizeLevel(value: string): RoadmapLevel {
  const normalized = value.trim().toUpperCase();
  if (normalized === "N4") {
    return "N4";
  }
  if (normalized === "N3") {
    return "N3";
  }
  if (normalized === "N2") {
    return "N2";
  }
  if (normalized === "N1") {
    return "N1";
  }
  return "N5";
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function createEmptyProgressState(): RoadmapProgressState {
  return {
    completedDays: {
      N5: [],
      N4: [],
      N3: [],
      N2: [],
      N1: [],
    },
    masteredIds: [],
    activityDates: [],
  };
}

function uniqueSortedNumbers(values: number[]): number[] {
  return Array.from(new Set(values.filter((value) => Number.isInteger(value) && value >= 0))).sort((a, b) => a - b);
}

function uniqueSortedStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function parseProgressState(raw: string | null): RoadmapProgressState {
  if (!raw) {
    return createEmptyProgressState();
  }

  try {
    const parsed = JSON.parse(raw) as Partial<RoadmapProgressState>;
    const base = createEmptyProgressState();

    for (const level of ROADMAP_LEVELS) {
      const levelValue = parsed.completedDays?.[level];
      if (Array.isArray(levelValue)) {
        base.completedDays[level] = uniqueSortedNumbers(levelValue);
      }
    }

    base.masteredIds = Array.isArray(parsed.masteredIds) ? uniqueSortedStrings(parsed.masteredIds) : [];
    base.activityDates = Array.isArray(parsed.activityDates)
      ? uniqueSortedStrings(parsed.activityDates).slice(-180)
      : [];

    return base;
  } catch {
    return createEmptyProgressState();
  }
}

function chunkBy<T>(items: T[], size: number): T[][] {
  if (items.length === 0) {
    return [];
  }
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function todayDateKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(value: string): Date | null {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!matched) {
    return null;
  }
  const year = Number(matched[1]);
  const month = Number(matched[2]) - 1;
  const day = Number(matched[3]);
  const date = new Date(year, month, day);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

function calculateStreak(dateKeys: string[]): number {
  if (dateKeys.length === 0) {
    return 0;
  }

  const sorted = uniqueSortedStrings(dateKeys);
  const dates = sorted
    .map((key) => parseDateKey(key))
    .filter((value): value is Date => Boolean(value))
    .sort((a, b) => a.getTime() - b.getTime());

  if (dates.length === 0) {
    return 0;
  }

  let streak = 1;
  for (let index = dates.length - 1; index > 0; index -= 1) {
    const current = dates[index];
    const previous = dates[index - 1];
    const diff = Math.round((current.getTime() - previous.getTime()) / (24 * 60 * 60 * 1000));
    if (diff === 1) {
      streak += 1;
      continue;
    }
    break;
  }
  return streak;
}

function createSeededRandom(seed: number): () => number {
  let state = Math.floor(seed) % 2147483647;
  if (state <= 0) {
    state += 2147483646;
  }
  return () => {
    state = (state * 48271) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function sampleDistinct<T>(
  input: T[],
  count: number,
  randomFn: () => number
): T[] {
  if (input.length <= count) {
    return [...input];
  }
  const pool = [...input];
  const selected: T[] = [];
  while (selected.length < count && pool.length > 0) {
    const index = Math.floor(randomFn() * pool.length);
    const [item] = pool.splice(index, 1);
    if (item) {
      selected.push(item);
    }
  }
  return selected;
}

function shuffle<T>(input: T[], randomFn: () => number): T[] {
  const array = [...input];
  for (let index = array.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(randomFn() * (index + 1));
    [array[index], array[swapIndex]] = [array[swapIndex], array[index]];
  }
  return array;
}

function buildQuizQuestions(
  dayItems: RoadmapKanjiItem[],
  levelPool: RoadmapKanjiItem[],
  seed: number
): QuizQuestion[] {
  if (dayItems.length === 0) {
    return [];
  }

  const random = createSeededRandom(seed);
  const pool = levelPool.length > 0 ? levelPool : dayItems;

  return dayItems.map((target, index) => {
    const meaningToChar = index % 2 === 0;
    const distractorPool = pool.filter((item) => item.id !== target.id);
    const distractors = sampleDistinct(distractorPool, 3, random);
    const optionItems = shuffle([target, ...distractors], random).slice(0, 4);

    if (meaningToChar) {
      return {
        id: `${target.id}-m2c`,
        prompt: `Chọn kanji đúng với nghĩa: "${target.meaning}"`,
        subPrompt: `Nets: ${target.strokeCount} · ${target.jlptLevel}`,
        answerId: target.id,
        answerLabel: target.character,
        options: optionItems.map((item) => ({
          id: item.id,
          label: item.character,
        })),
      };
    }

    return {
      id: `${target.id}-c2m`,
      prompt: `Ý nghĩa của kanji "${target.character}" là gì?`,
      subPrompt: `On: ${target.onReading || "-"} · Kun: ${target.kunReading || "-"}`,
      answerId: target.id,
      answerLabel: target.meaning,
      options: optionItems.map((item) => ({
        id: item.id,
        label: item.meaning,
      })),
    };
  });
}

function drawBoardBase(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "#d7e2f1";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(width / 2, 0);
  ctx.lineTo(width / 2, height);
  ctx.moveTo(0, height / 2);
  ctx.lineTo(width, height / 2);
  ctx.stroke();
  ctx.setLineDash([]);
}

function getCanvasPoint(canvas: HTMLCanvasElement, event: ReactPointerEvent<HTMLCanvasElement>) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (canvas.width / rect.width),
    y: (event.clientY - rect.top) * (canvas.height / rect.height),
  };
}

function drawTemplateGlyph(canvas: HTMLCanvasElement, character: string) {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#0f172a";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${Math.floor(canvas.width * 0.64)}px 'Yu Gothic','Hiragino Kaku Gothic ProN','Noto Sans JP','Meiryo',sans-serif`;
  ctx.fillText(character, canvas.width / 2, canvas.height / 2 + canvas.width * 0.06);
}

function extractInkBounds(image: ImageData) {
  const { width, height, data } = image;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const alpha = data[index + 3];
      const brightness = (data[index] + data[index + 1] + data[index + 2]) / 3;
      if (alpha > 10 && brightness < 230) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0 || maxY < 0) {
    return null;
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

function rasterizeToBits(sourceCanvas: HTMLCanvasElement): Uint8Array {
  const sourceCtx = sourceCanvas.getContext("2d");
  if (!sourceCtx) {
    return new Uint8Array(SAMPLE_SIZE * SAMPLE_SIZE);
  }
  const sourceImage = sourceCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  const bounds = extractInkBounds(sourceImage);
  if (!bounds) {
    return new Uint8Array(SAMPLE_SIZE * SAMPLE_SIZE);
  }

  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = SAMPLE_SIZE;
  tempCanvas.height = SAMPLE_SIZE;
  const tempCtx = tempCanvas.getContext("2d");
  if (!tempCtx) {
    return new Uint8Array(SAMPLE_SIZE * SAMPLE_SIZE);
  }

  tempCtx.fillStyle = "#ffffff";
  tempCtx.fillRect(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);

  const innerSize = SAMPLE_SIZE - SAMPLE_PADDING * 2;
  const scale = Math.min(innerSize / bounds.width, innerSize / bounds.height);
  const drawWidth = bounds.width * scale;
  const drawHeight = bounds.height * scale;
  const dx = (SAMPLE_SIZE - drawWidth) / 2;
  const dy = (SAMPLE_SIZE - drawHeight) / 2;

  tempCtx.drawImage(
    sourceCanvas,
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    dx,
    dy,
    drawWidth,
    drawHeight
  );

  const sampled = tempCtx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  const bits = new Uint8Array(SAMPLE_SIZE * SAMPLE_SIZE);
  for (let index = 0; index < bits.length; index += 1) {
    const offset = index * 4;
    const brightness = (sampled.data[offset] + sampled.data[offset + 1] + sampled.data[offset + 2]) / 3;
    const alpha = sampled.data[offset + 3];
    bits[index] = alpha > 10 && brightness < 220 ? 1 : 0;
  }
  return bits;
}

function dilateBits(bits: Uint8Array, radius: number): Uint8Array {
  if (radius <= 0) {
    return bits.slice();
  }
  const output = new Uint8Array(bits.length);
  for (let y = 0; y < SAMPLE_SIZE; y += 1) {
    for (let x = 0; x < SAMPLE_SIZE; x += 1) {
      const idx = y * SAMPLE_SIZE + x;
      if (bits[idx] !== 1) {
        continue;
      }
      const minY = Math.max(0, y - radius);
      const maxY = Math.min(SAMPLE_SIZE - 1, y + radius);
      const minX = Math.max(0, x - radius);
      const maxX = Math.min(SAMPLE_SIZE - 1, x + radius);
      for (let yy = minY; yy <= maxY; yy += 1) {
        for (let xx = minX; xx <= maxX; xx += 1) {
          output[yy * SAMPLE_SIZE + xx] = 1;
        }
      }
    }
  }
  return output;
}

function countOnes(bits: Uint8Array): number {
  let count = 0;
  for (let index = 0; index < bits.length; index += 1) {
    if (bits[index] === 1) {
      count += 1;
    }
  }
  return count;
}

function countOverlap(a: Uint8Array, b: Uint8Array): number {
  let count = 0;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] === 1 && b[index] === 1) {
      count += 1;
    }
  }
  return count;
}

function countUnion(a: Uint8Array, b: Uint8Array): number {
  let count = 0;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] === 1 || b[index] === 1) {
      count += 1;
    }
  }
  return count;
}

function evaluateSimilarity(userBits: Uint8Array, targetBits: Uint8Array) {
  const userInk = countOnes(userBits);
  const targetInk = countOnes(targetBits);

  if (userInk < 26 || targetInk < 26) {
    return {
      score: 0,
      passed: false,
      hasInk: userInk >= 26,
      coverage: 0,
      precision: 0,
    };
  }

  const userSoft = dilateBits(userBits, 2);
  const targetSoft = dilateBits(targetBits, 2);
  const overlapCoverage = countOverlap(userSoft, targetBits);
  const overlapPrecision = countOverlap(targetSoft, userBits);
  const overlapIou = countOverlap(userSoft, targetSoft);
  const union = countUnion(userSoft, targetSoft);

  const coverage = overlapCoverage / targetInk;
  const precision = overlapPrecision / userInk;
  const iou = union > 0 ? overlapIou / union : 0;

  const score = clamp(iou * 0.45 + coverage * 0.35 + precision * 0.2, 0, 1);
  const passed = score >= 0.56 || (coverage >= 0.82 && precision >= 0.48);

  return {
    score,
    passed,
    hasInk: true,
    coverage,
    precision,
  };
}

export function KanjiRoadmapClient({ items, initialLevel, dailyTarget = 10 }: Props) {
  const safeDailyTarget = clamp(dailyTarget, 5, 20);
  const [activeLevel, setActiveLevel] = useState<RoadmapLevel>(() => normalizeLevel(initialLevel));
  const [dayByLevel, setDayByLevel] = useState<Record<RoadmapLevel, number>>({
    N5: 0,
    N4: 0,
    N3: 0,
    N2: 0,
    N1: 0,
  });
  const [mode, setMode] = useState<"write" | "quiz">("write");
  const [state, setState] = useState<RoadmapProgressState>(createEmptyProgressState);
  const [hydrated, setHydrated] = useState(false);
  const [selectedWriteId, setSelectedWriteId] = useState("");
  const [showGuide, setShowGuide] = useState(true);
  const [strokeCount, setStrokeCount] = useState(0);
  const [checkResult, setCheckResult] = useState<{
    passed: boolean;
    score: number;
    message: string;
    hint: string;
  } | null>(null);
  const [quizSeed, setQuizSeed] = useState(1);
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizSelected, setQuizSelected] = useState<string | null>(null);
  const [quizChecked, setQuizChecked] = useState(false);
  const [quizCorrectCount, setQuizCorrectCount] = useState(0);
  const [quizFinished, setQuizFinished] = useState(false);

  const writeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const templateCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const saved = parseProgressState(window.localStorage.getItem(ROADMAP_STORAGE_KEY));
    setState(saved);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(ROADMAP_STORAGE_KEY, JSON.stringify(state));
  }, [hydrated, state]);

  const byLevel = useMemo(() => {
    const map: Record<RoadmapLevel, RoadmapKanjiItem[]> = {
      N5: [],
      N4: [],
      N3: [],
      N2: [],
      N1: [],
    };
    for (const item of items) {
      map[normalizeLevel(item.jlptLevel)].push(item);
    }
    return map;
  }, [items]);

  const levelItems = byLevel[activeLevel];
  const dayGroups = useMemo(() => chunkBy(levelItems, safeDailyTarget), [levelItems, safeDailyTarget]);
  const totalDays = Math.max(1, dayGroups.length);
  const currentDayIndex = clamp(dayByLevel[activeLevel] ?? 0, 0, totalDays - 1);
  const currentDayItems = dayGroups[currentDayIndex] ?? [];
  const daySignature = useMemo(
    () => `${activeLevel}-${currentDayIndex}-${currentDayItems.map((item) => item.id).join(",")}`,
    [activeLevel, currentDayIndex, currentDayItems]
  );

  useEffect(() => {
    setDayByLevel((prev) => ({
      ...prev,
      [activeLevel]: clamp(prev[activeLevel] ?? 0, 0, totalDays - 1),
    }));
  }, [activeLevel, totalDays]);

  useEffect(() => {
    const firstId = currentDayItems[0]?.id ?? "";
    setSelectedWriteId((previous) =>
      currentDayItems.some((item) => item.id === previous) ? previous : firstId
    );
  }, [currentDayItems]);

  useEffect(() => {
    setQuizSeed((seed) => seed + 1);
    setQuizIndex(0);
    setQuizSelected(null);
    setQuizChecked(false);
    setQuizCorrectCount(0);
    setQuizFinished(false);
  }, [daySignature]);

  const selectedWriteKanji =
    currentDayItems.find((item) => item.id === selectedWriteId) ?? currentDayItems[0] ?? null;

  const masteredSet = useMemo(() => new Set(state.masteredIds), [state.masteredIds]);
  const completedDaySet = useMemo(
    () => new Set(state.completedDays[activeLevel] ?? []),
    [activeLevel, state.completedDays]
  );

  const learnedCount = levelItems.reduce(
    (sum, item) => (masteredSet.has(item.id) ? sum + 1 : sum),
    0
  );
  const progressPercent = levelItems.length > 0 ? Math.round((learnedCount / levelItems.length) * 100) : 0;
  const streak = calculateStreak(state.activityDates);
  const totalDayKanjiCount = currentDayItems.length;
  const remainingToday = currentDayItems.filter((item) => !masteredSet.has(item.id)).length;

  const updateState = useCallback((updater: (previous: RoadmapProgressState) => RoadmapProgressState) => {
    setState((previous) => updater(previous));
  }, []);

  const touchActivity = useCallback(() => {
    updateState((previous) => {
      const today = todayDateKey();
      const dates = previous.activityDates.includes(today)
        ? previous.activityDates
        : [...previous.activityDates, today];
      return {
        ...previous,
        activityDates: uniqueSortedStrings(dates).slice(-180),
      };
    });
  }, [updateState]);

  const markCurrentDayCompleted = useCallback(() => {
    updateState((previous) => {
      const currentDays = previous.completedDays[activeLevel] ?? [];
      const nextDays = currentDays.includes(currentDayIndex)
        ? currentDays
        : [...currentDays, currentDayIndex];
      const today = todayDateKey();
      const dates = previous.activityDates.includes(today)
        ? previous.activityDates
        : [...previous.activityDates, today];
      return {
        ...previous,
        completedDays: {
          ...previous.completedDays,
          [activeLevel]: uniqueSortedNumbers(nextDays),
        },
        activityDates: uniqueSortedStrings(dates).slice(-180),
      };
    });
  }, [activeLevel, currentDayIndex, updateState]);

  const markMastered = useCallback(
    (kanjiId: string) => {
      updateState((previous) => {
        const masteredIds = previous.masteredIds.includes(kanjiId)
          ? previous.masteredIds
          : [...previous.masteredIds, kanjiId];
        const masterySet = new Set(masteredIds);
        const shouldCompleteDay =
          currentDayItems.length > 0 &&
          currentDayItems.every((item) => masterySet.has(item.id));
        const currentDays = previous.completedDays[activeLevel] ?? [];
        const nextDays = shouldCompleteDay && !currentDays.includes(currentDayIndex)
          ? [...currentDays, currentDayIndex]
          : currentDays;
        const today = todayDateKey();
        const dates = previous.activityDates.includes(today)
          ? previous.activityDates
          : [...previous.activityDates, today];

        return {
          ...previous,
          masteredIds: uniqueSortedStrings(masteredIds),
          completedDays: {
            ...previous.completedDays,
            [activeLevel]: uniqueSortedNumbers(nextDays),
          },
          activityDates: uniqueSortedStrings(dates).slice(-180),
        };
      });
    },
    [activeLevel, currentDayIndex, currentDayItems, updateState]
  );

  const goDay = useCallback(
    (nextIndex: number) => {
      setDayByLevel((previous) => ({
        ...previous,
        [activeLevel]: clamp(nextIndex, 0, totalDays - 1),
      }));
    },
    [activeLevel, totalDays]
  );

  const dayIds = currentDayItems.map((item) => item.id).join(",");
  const flashcardHref = dayIds
    ? `/kanji/learn?level=${activeLevel}&ids=${encodeURIComponent(dayIds)}`
    : `/kanji/learn?level=${activeLevel}`;

  const drawBoard = useCallback(() => {
    const canvas = writeCanvasRef.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    drawBoardBase(ctx, canvas.width, canvas.height);
    setStrokeCount(0);
    setCheckResult(null);
  }, []);

  useEffect(() => {
    drawBoard();
  }, [drawBoard, selectedWriteId]);

  const beginDrawing = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = writeCanvasRef.current;
    if (!canvas || event.button !== 0) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = getCanvasPoint(canvas, event);
    drawingRef.current = true;
    lastPointRef.current = point;
    setStrokeCount((count) => count + 1);
    setCheckResult(null);

    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 10;
    ctx.strokeStyle = "#0f1f3b";
  }, []);

  const continueDrawing = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) {
      return;
    }
    const canvas = writeCanvasRef.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    const point = getCanvasPoint(canvas, event);
    const previous = lastPointRef.current;
    if (!previous) {
      lastPointRef.current = point;
      return;
    }
    ctx.beginPath();
    ctx.moveTo(previous.x, previous.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastPointRef.current = point;
  }, []);

  const stopDrawing = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) {
      return;
    }
    drawingRef.current = false;
    lastPointRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);

  const checkWriting = useCallback(() => {
    const drawCanvas = writeCanvasRef.current;
    const templateCanvas = templateCanvasRef.current;
    if (!drawCanvas || !templateCanvas || !selectedWriteKanji) {
      return;
    }

    drawTemplateGlyph(templateCanvas, selectedWriteKanji.character);
    const userBits = rasterizeToBits(drawCanvas);
    const targetBits = rasterizeToBits(templateCanvas);
    const result = evaluateSimilarity(userBits, targetBits);
    const percent = Math.round(result.score * 100);

    if (!result.hasInk) {
      setCheckResult({
        passed: false,
        score: percent,
        message: "Bạn chưa vẽ đủ nét",
        hint: "Vẽ lại to hơn và bấm Kiểm tra.",
      });
      return;
    }

    if (result.passed) {
      setCheckResult({
        passed: true,
        score: percent,
        message: "Đỉnh kout!",
        hint: `Độ giống ${percent}% · Nét đã vẽ: ${strokeCount}`,
      });
      markMastered(selectedWriteKanji.id);
      return;
    }

    setCheckResult({
      passed: false,
      score: percent,
      message: "Gần đúng rồi, thử lại nhé",
      hint: `Độ giống ${percent}% · Hơi lệch form, thử vẽ gọn vào giữa khung.`,
    });
    touchActivity();
  }, [markMastered, selectedWriteKanji, strokeCount, touchActivity]);

  const moveToNextKanji = useCallback(() => {
    if (currentDayItems.length === 0) {
      return;
    }
    const currentIndex = currentDayItems.findIndex((item) => item.id === selectedWriteId);
    const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % currentDayItems.length;
    const nextKanji = currentDayItems[nextIndex];
    if (nextKanji) {
      setSelectedWriteId(nextKanji.id);
    }
  }, [currentDayItems, selectedWriteId]);

  const quizQuestions = useMemo(
    () => buildQuizQuestions(currentDayItems, levelItems, quizSeed),
    [currentDayItems, levelItems, quizSeed]
  );
  const activeQuestion = quizQuestions[quizIndex] ?? null;
  const quizPassed = quizQuestions.length > 0 && quizCorrectCount / quizQuestions.length >= 0.8;

  const handleQuizCheck = useCallback(() => {
    if (!activeQuestion || !quizSelected || quizChecked) {
      return;
    }
    const correct = quizSelected === activeQuestion.answerId;
    if (correct) {
      setQuizCorrectCount((count) => count + 1);
    }
    setQuizChecked(true);
    touchActivity();
  }, [activeQuestion, quizChecked, quizSelected, touchActivity]);

  const handleQuizNext = useCallback(() => {
    if (!quizChecked) {
      return;
    }
    if (quizIndex >= quizQuestions.length - 1) {
      setQuizFinished(true);
      if (quizQuestions.length > 0 && quizCorrectCount / quizQuestions.length >= 0.8) {
        markCurrentDayCompleted();
      }
      return;
    }
    setQuizIndex((index) => index + 1);
    setQuizSelected(null);
    setQuizChecked(false);
  }, [markCurrentDayCompleted, quizChecked, quizCorrectCount, quizIndex, quizQuestions.length]);

  const restartQuiz = useCallback(() => {
    setQuizSeed((seed) => seed + 1);
    setQuizIndex(0);
    setQuizSelected(null);
    setQuizChecked(false);
    setQuizCorrectCount(0);
    setQuizFinished(false);
  }, []);

  return (
    <section className="space-y-6">
      <div className="panel relative overflow-hidden p-6">
        <div className="absolute inset-x-0 top-0 h-44 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.24),transparent_64%),radial-gradient(circle_at_top_left,rgba(16,185,129,0.2),transparent_56%)]" />
        <div className="relative">
          <div className="text-center">
            <h1 className="text-4xl font-extrabold text-slate-900">Lộ trình học Kanji</h1>
            <p className="mt-1 text-lg text-slate-600">
              {safeDailyTarget} chữ mỗi ngày · Tổng cộng {Math.max(1, Math.ceil(items.length / safeDailyTarget))} ngày
            </p>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-2xl border border-sky-100 bg-white/95 p-4 shadow-sm">
              <p className="text-sm font-semibold text-sky-600">Đã học</p>
              <p className="mt-2 text-4xl font-extrabold text-slate-900">
                {completedDaySet.size}/{totalDays}
              </p>
              <p className="text-sm text-slate-500">ngày</p>
            </article>
            <article className="rounded-2xl border border-emerald-100 bg-white/95 p-4 shadow-sm">
              <p className="text-sm font-semibold text-emerald-600">Kanji</p>
              <p className="mt-2 text-4xl font-extrabold text-slate-900">{learnedCount}</p>
              <p className="text-sm text-slate-500">chữ đã nhớ</p>
            </article>
            <article className="rounded-2xl border border-orange-100 bg-white/95 p-4 shadow-sm">
              <p className="text-sm font-semibold text-orange-500">Streak</p>
              <p className="mt-2 text-4xl font-extrabold text-slate-900">{streak}</p>
              <p className="text-sm text-slate-500">ngày liên tiếp</p>
            </article>
            <article className="rounded-2xl border border-violet-100 bg-white/95 p-4 shadow-sm">
              <p className="text-sm font-semibold text-violet-600">Tiến độ</p>
              <p className="mt-2 text-4xl font-extrabold text-slate-900">{progressPercent}%</p>
              <p className="text-sm text-slate-500">hoàn thành level</p>
            </article>
          </div>
        </div>
      </div>

      <div className="panel p-5">
        <div className="flex flex-wrap gap-2">
          {ROADMAP_LEVELS.map((level) => {
            const active = level === activeLevel;
            const total = byLevel[level].length;
            const days = Math.max(1, Math.ceil(total / safeDailyTarget));
            return (
              <button
                key={level}
                type="button"
                className={`min-w-[138px] rounded-2xl border px-4 py-3 text-left transition ${
                  active
                    ? `${levelStyleMap[level]} shadow-[0_10px_22px_rgba(59,130,246,0.18)]`
                    : "border-slate-200 bg-white text-slate-700 hover:-translate-y-0.5 hover:bg-slate-50"
                }`}
                onClick={() => setActiveLevel(level)}
              >
                <p className="text-3xl font-extrabold">{level}</p>
                <p className="text-xs opacity-80">{total} chữ · {days} ngày</p>
              </button>
            );
          })}
        </div>

        <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              className="rounded-xl border border-slate-200 bg-white px-3 py-1 text-xl font-bold text-slate-600"
              onClick={() => goDay(currentDayIndex - 1)}
              disabled={currentDayIndex <= 0}
            >
              {"<"}
            </button>
            <div className="flex items-center gap-2 text-center">
              <span className={`rounded-full border px-3 py-1 text-sm font-semibold ${levelStyleMap[activeLevel]}`}>
                {activeLevel}
              </span>
                <p className="text-3xl font-extrabold text-slate-900">Ngày {currentDayIndex + 1}</p>
            </div>
            <button
              type="button"
              className="rounded-xl border border-slate-200 bg-white px-3 py-1 text-xl font-bold text-slate-600"
              onClick={() => goDay(currentDayIndex + 1)}
              disabled={currentDayIndex >= totalDays - 1}
            >
              {">"}
            </button>
          </div>

          <div className="mt-4 flex items-center gap-3 text-sm text-slate-600">
            <span>Ngày 1</span>
            <input
              type="range"
              min={0}
              max={Math.max(0, totalDays - 1)}
              value={currentDayIndex}
              onChange={(event) => goDay(Number(event.target.value))}
              className="h-2 flex-1 accent-blue-500"
            />
            <span>
              Ngày {totalDays} ({activeLevel})
            </span>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xl font-bold text-slate-900">Kanji ngày {currentDayIndex + 1}</p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-slate-500">{totalDayKanjiCount} chữ</span>
              <Link href={flashcardHref} className="btn-primary text-sm">
                Học bằng Flashcard
              </Link>
              <button type="button" className="btn-soft text-sm" onClick={markCurrentDayCompleted}>
                Đánh dấu đã học
              </button>
            </div>
          </div>

          {currentDayItems.length === 0 ? (
            <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              Chưa có dữ liệu Kanji cho level {activeLevel}.
            </p>
          ) : (
            <div className="mt-3 grid gap-2 sm:grid-cols-5 lg:grid-cols-10">
              {currentDayItems.map((item) => {
                const active = selectedWriteKanji?.id === item.id;
                const mastered = masteredSet.has(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`rounded-xl border px-2 py-3 text-center transition ${
                      active
                        ? "border-emerald-300 bg-emerald-100 shadow-[0_8px_16px_rgba(16,185,129,0.22)]"
                        : mastered
                          ? "border-blue-300 bg-blue-50"
                          : "border-slate-200 bg-slate-50 hover:bg-white"
                    }`}
                    onClick={() => setSelectedWriteId(item.id)}
                  >
                    <p className="text-4xl font-extrabold text-slate-800">{item.character}</p>
                    <p className="mt-1 truncate text-xs text-slate-500">{item.meaning}</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2 rounded-full border border-slate-200/80 bg-white/80 p-1.5 shadow-sm">
            <Link href={flashcardHref} className="btn-tab text-sm">
              Học bằng Flashcard
            </Link>
            <button
              type="button"
              className={`btn-tab ${
                mode === "write"
                  ? "active-emerald"
                  : ""
              }`}
              onClick={() => setMode("write")}
            >
              Luyện viết
            </button>
            <button
              type="button"
              className={`btn-tab ${
                mode === "quiz"
                  ? "active-amber"
                  : ""
              }`}
              onClick={() => setMode("quiz")}
            >
              Kiểm tra nhanh
            </button>
          </div>
          <p className="text-sm text-slate-500">
            Còn {remainingToday} chữ chưa mastered hôm nay
          </p>
        </div>

        {mode === "write" ? (
          <div className="mt-4 grid gap-4 lg:grid-cols-[1.05fr_1fr]">
            <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-6xl font-extrabold text-slate-900">
                    {selectedWriteKanji?.character ?? "-"}
                  </p>
                  <p className="mt-1 text-2xl font-bold text-blue-600">
                    {selectedWriteKanji?.meaning ?? "Chọn kanji"}
                  </p>
                  <p className="text-sm text-slate-500">
                    Nét {strokeCount} · Mẫu nét: {selectedWriteKanji?.strokeCount ?? 0}
                  </p>
                </div>
                {selectedWriteKanji ? (
                  <SpeakJpButton
                    text={selectedWriteKanji.character}
                    className="h-10 w-10 text-lg"
                    title="Phát âm chữ này"
                  />
                ) : null}
              </div>

              <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-2">
                <div className="relative mx-auto w-full max-w-[340px]">
                  {showGuide && selectedWriteKanji ? (
                    <div className="pointer-events-none absolute inset-0 z-0 grid place-items-center text-[7rem] font-black text-slate-300/25 sm:text-[8rem]">
                      {selectedWriteKanji.character}
                    </div>
                  ) : null}
                  <canvas
                    ref={writeCanvasRef}
                    width={BOARD_SIZE}
                    height={BOARD_SIZE}
                    className="relative z-10 mx-auto block h-auto w-full touch-none"
                    onPointerDown={beginDrawing}
                    onPointerMove={continueDrawing}
                    onPointerUp={stopDrawing}
                    onPointerCancel={stopDrawing}
                    onPointerLeave={stopDrawing}
                  />
                </div>
              </div>

              <canvas ref={templateCanvasRef} width={BOARD_SIZE} height={BOARD_SIZE} className="hidden" />

              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <button type="button" className="btn-tab text-sm" onClick={drawBoard}>
                  Viết lại
                </button>
                <button
                  type="button"
                  className="btn-tab text-sm"
                  onClick={() => {
                    setShowGuide((value) => !value);
                    drawBoard();
                  }}
                >
                  {showGuide ? "Tự viết" : "Hiện guide"}
                </button>
                <button type="button" className="btn-primary text-sm" onClick={checkWriting}>
                  Kiểm tra
                </button>
                <button type="button" className="btn-tab text-sm" onClick={moveToNextKanji}>
                  Chữ tiếp theo
                </button>
              </div>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-lg font-bold text-slate-900">Thông tin nhanh</h3>
              {selectedWriteKanji ? (
                <div className="mt-3 space-y-2 text-sm text-slate-700">
                  <p>
                    <span className="font-semibold text-slate-900">On:</span> {selectedWriteKanji.onReading || "-"}
                  </p>
                  <p>
                    <span className="font-semibold text-slate-900">Kun:</span> {selectedWriteKanji.kunReading || "-"}
                  </p>
                  <p>
                    <span className="font-semibold text-slate-900">Số nét:</span> {selectedWriteKanji.strokeCount}
                  </p>
                  <p>
                    <span className="font-semibold text-slate-900">Ví dụ:</span>{" "}
                    {selectedWriteKanji.exampleWord || selectedWriteKanji.character}
                    {" · "}
                    {selectedWriteKanji.exampleMeaning || selectedWriteKanji.meaning}
                  </p>
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-500">Chọn 1 chữ để bắt đầu luyện viết.</p>
              )}

              <div className="mt-4 rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50 via-white to-emerald-50 p-4">
                <p className="text-sm font-bold text-slate-900">Mẫu vẽ hướng dẫn</p>
                <p className="mt-1 text-sm text-slate-600">
                  Bạn không cần upload để sử dụng hướng dẫn cơ bản. Hệ thống đang tự tạo mẫu mờ từ ký tự hiện tại.
                </p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 font-semibold text-emerald-700">
                    Có sẵn: guide mờ theo ký tự
                  </span>
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 font-semibold text-amber-700">
                    Nâng cao: thứ tự nét cần dữ liệu SVG/JSON
                  </span>
                </div>
              </div>

              {checkResult ? (
                <div
                  className={`mt-4 rounded-2xl border p-6 text-center ${
                    checkResult.passed
                      ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                      : "border-rose-300 bg-rose-50 text-rose-700"
                  }`}
                >
                  <p className="text-6xl font-black">{checkResult.passed ? "✓" : "✕"}</p>
                  <p className="mt-2 text-3xl font-extrabold">{checkResult.message}</p>
                  <p className="mt-1 text-sm">{checkResult.hint}</p>
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center text-slate-500">
                  <p className="text-sm">Bấm "Kiểm tra" để chấm độ giống với mẫu.</p>
                </div>
              )}
            </article>
          </div>
        ) : (
          <article className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            {quizQuestions.length === 0 ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                Không có dữ liệu quiz cho ngày này.
              </p>
            ) : quizFinished ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center">
                <p className="text-sm font-semibold text-slate-500">Kết quả</p>
                <p className="mt-2 text-5xl font-extrabold text-slate-900">
                  {quizCorrectCount}/{quizQuestions.length}
                </p>
                <p className={`mt-2 text-lg font-bold ${quizPassed ? "text-emerald-700" : "text-orange-600"}`}>
                  {quizPassed ? "Đạt mục tiêu ngày hôm nay!" : "Chưa đạt 80%, thử lại 1 lần nữa nhé"}
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <button type="button" className="btn-primary text-sm" onClick={restartQuiz}>
                    Làm lại quiz
                  </button>
                  <button type="button" className="btn-soft text-sm" onClick={markCurrentDayCompleted}>
                    Đánh dấu đã học ngày này
                  </button>
                </div>
              </div>
            ) : activeQuestion ? (
              <div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-500">
                    Câu {quizIndex + 1}/{quizQuestions.length}
                  </p>
                  <p className="text-sm font-semibold text-emerald-700">
                    Đúng: {quizCorrectCount}
                  </p>
                </div>
                <h3 className="mt-2 text-2xl font-bold text-slate-900">{activeQuestion.prompt}</h3>
                <p className="mt-1 text-sm text-slate-500">{activeQuestion.subPrompt}</p>

                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {activeQuestion.options.map((option, optionIndex) => {
                    const selected = quizSelected === option.id;
                    const correct = quizChecked && option.id === activeQuestion.answerId;
                    const wrong = quizChecked && selected && option.id !== activeQuestion.answerId;
                    return (
                      <button
                        key={`${activeQuestion.id}-${option.id}`}
                        type="button"
                        disabled={quizChecked}
                        className={`rounded-xl border px-4 py-3 text-left text-lg font-semibold transition ${
                          correct
                            ? "border-emerald-300 bg-emerald-100 text-emerald-800"
                            : wrong
                              ? "border-rose-300 bg-rose-100 text-rose-800"
                              : selected
                                ? "border-blue-300 bg-blue-100 text-blue-800"
                                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                        onClick={() => setQuizSelected(option.id)}
                      >
                        <span className="mr-2 text-slate-400">{optionIndex + 1}.</span>
                        {option.label}
                      </button>
                    );
                  })}
                </div>

                {quizChecked ? (
                  <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                    <p>
                      Đáp án đúng:{" "}
                      <strong className="text-slate-900">{activeQuestion.answerLabel}</strong>
                    </p>
                  </div>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-primary text-sm"
                    onClick={handleQuizCheck}
                    disabled={!quizSelected || quizChecked}
                  >
                    Kiểm tra đáp án
                  </button>
                  <button
                    type="button"
                    className="btn-soft text-sm"
                    onClick={handleQuizNext}
                    disabled={!quizChecked}
                  >
                    {quizIndex >= quizQuestions.length - 1 ? "Xem kết quả" : "Câu tiếp theo"}
                  </button>
                  <button type="button" className="btn-soft text-sm" onClick={restartQuiz}>
                    Làm lại từ đầu
                  </button>
                </div>
              </div>
            ) : null}
          </article>
        )}
      </div>
    </section>
  );
}
