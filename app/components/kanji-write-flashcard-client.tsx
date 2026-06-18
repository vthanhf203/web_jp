"use client";

import Link from "next/link";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Eraser,
  Eye,
  RotateCcw,
  Search,
  Shuffle,
  Undo2,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

export type KanjiWriteFlashcardItem = {
  id: string;
  character: string;
  meaning: string;
  hanviet: string;
  onReading: string;
  kunReading: string;
  strokeCount: number;
  jlptLevel: string;
  sourceLabel: string;
  strokeHint: string;
  radical: KanjiWriteRadical | null;
  radicalHint: string;
  mnemonic: string;
  components: KanjiWriteComponent[];
  structure: KanjiWriteStructure | null;
  category: string;
  tags: string[];
  relatedWords: KanjiWriteRelatedWord[];
};

export type KanjiWriteRadical = {
  symbol: string;
  name: string;
  meaning: string;
  position: string;
  note: string;
};

export type KanjiWriteComponent = {
  symbol: string;
  name: string;
  meaning: string;
  position: string;
  role: string;
};

export type KanjiWriteStructure = {
  type: string;
  formula: string;
  meaning: string;
  note: string;
};

export type KanjiWriteRelatedWord = {
  id: string;
  word: string;
  reading: string;
  kanji: string;
  hanviet: string;
  meaning: string;
  type: string;
  jlptLevel: string;
  exampleSentence: string;
  exampleMeaning: string;
  note: string;
  sourceLabel: string;
};

type Props = {
  items: KanjiWriteFlashcardItem[];
  sourceOptions: KanjiWriteSourceOption[];
};

export type KanjiWriteSourceOption = {
  value: string;
  label: string;
  count: number;
  href: string;
  active: boolean;
};

type Point = {
  x: number;
  y: number;
};

type DrawStroke = Point[];

type ViewBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type DrawMetrics = {
  scale: number;
  offsetX: number;
  offsetY: number;
};

type Bounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

type KanjiVgData = {
  viewBox: ViewBox;
  paths: string[];
  sourceUrl: string;
};

type CheckResult = {
  status: "correct" | "close" | "wrong" | "empty";
  totalScore: number;
  shapeScore: number;
  strokeScore: number;
  precision: number;
  recall: number;
  actualStrokes: number;
  message: string;
};

const BOARD_SIZE = 420;
const EVAL_SIZE = 220;
const KANJIVG_BASE_URL = "https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji";
const LEVEL_ORDER = ["N5", "N4", "N3", "N2", "N1"];
const DEFAULT_VIEW_BOX: ViewBox = { x: 0, y: 0, width: 109, height: 109 };
const kanjiVgCache = new Map<string, Promise<KanjiVgData>>();

function parseViewBox(value: string | null): ViewBox {
  if (!value) {
    return DEFAULT_VIEW_BOX;
  }
  const parts = value
    .trim()
    .split(/\s+/)
    .map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
    return DEFAULT_VIEW_BOX;
  }
  return {
    x: parts[0],
    y: parts[1],
    width: parts[2] || DEFAULT_VIEW_BOX.width,
    height: parts[3] || DEFAULT_VIEW_BOX.height,
  };
}

function kanjiVgFileName(character: string): string {
  const firstChar = Array.from(character.trim())[0] ?? "";
  const codePoint = firstChar.codePointAt(0);
  if (typeof codePoint !== "number") {
    return "";
  }
  return `${codePoint.toString(16).padStart(5, "0")}.svg`;
}

function loadKanjiVg(character: string): Promise<KanjiVgData> {
  const fileName = kanjiVgFileName(character);
  if (!fileName) {
    return Promise.reject(new Error("Không đọc được mã chữ Kanji."));
  }

  const cached = kanjiVgCache.get(fileName);
  if (cached) {
    return cached;
  }

  const promise = fetch(`${KANJIVG_BASE_URL}/${fileName}`)
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`KanjiVG trả về ${response.status}`);
      }
      return response.text();
    })
    .then((svgText) => {
      const documentSvg = new DOMParser().parseFromString(svgText, "image/svg+xml");
      const parseError = documentSvg.querySelector("parsererror");
      if (parseError) {
        throw new Error("Không phân tích được SVG KanjiVG.");
      }
      const svg = documentSvg.querySelector("svg");
      const paths = Array.from(documentSvg.querySelectorAll("path[d]"))
        .map((path) => path.getAttribute("d")?.trim() ?? "")
        .filter(Boolean);

      if (paths.length === 0) {
        throw new Error("KanjiVG không có dữ liệu nét cho chữ này.");
      }

      return {
        viewBox: parseViewBox(svg?.getAttribute("viewBox") ?? null),
        paths,
        sourceUrl: `${KANJIVG_BASE_URL}/${fileName}`,
      };
    });

  kanjiVgCache.set(fileName, promise);
  return promise;
}

function KanjiVgGlyph({
  data,
  character,
  className = "",
  fallbackClassName = "",
  strokeWidth = 4.2,
}: {
  data: KanjiVgData | null;
  character: string;
  className?: string;
  fallbackClassName?: string;
  strokeWidth?: number;
}) {
  if (!data || data.paths.length === 0) {
    return (
      <span lang="ja" className={`font-kanji ${fallbackClassName || className}`}>
        {character}
      </span>
    );
  }

  const viewBox = data.viewBox;

  return (
    <svg
      lang="ja"
      role="img"
      aria-label={character}
      className={className}
      viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
      preserveAspectRatio="xMidYMid meet"
      focusable="false"
    >
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}>
        {data.paths.map((path, index) => (
          <path key={`${index}-${path}`} d={path} />
        ))}
      </g>
    </svg>
  );
}

function getMetricsForSize(width: number, height: number, viewBox: ViewBox, padding = 20): DrawMetrics {
  const usableWidth = Math.max(1, width - padding * 2);
  const usableHeight = Math.max(1, height - padding * 2);
  const scale = Math.min(usableWidth / viewBox.width, usableHeight / viewBox.height);
  const drawnWidth = viewBox.width * scale;
  const drawnHeight = viewBox.height * scale;
  return {
    scale,
    offsetX: (width - drawnWidth) / 2 - viewBox.x * scale,
    offsetY: (height - drawnHeight) / 2 - viewBox.y * scale,
  };
}

function getCanvasMetrics(canvas: HTMLCanvasElement, viewBox: ViewBox, padding = 20): DrawMetrics {
  return getMetricsForSize(canvas.width, canvas.height, viewBox, padding);
}

function withSvgTransform(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  viewBox: ViewBox,
  callback: (metrics: DrawMetrics) => void,
  padding = 20
) {
  const metrics = getMetricsForSize(width, height, viewBox, padding);
  ctx.save();
  ctx.translate(metrics.offsetX, metrics.offsetY);
  ctx.scale(metrics.scale, metrics.scale);
  callback(metrics);
  ctx.restore();
}

function drawGuideGrid(ctx: CanvasRenderingContext2D, size: number) {
  ctx.save();
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = "#f8fbff";
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = "rgba(59, 130, 246, 0.14)";
  ctx.lineWidth = 1;
  ctx.setLineDash([8, 10]);
  ctx.beginPath();
  ctx.moveTo(size / 2, 18);
  ctx.lineTo(size / 2, size - 18);
  ctx.moveTo(18, size / 2);
  ctx.lineTo(size - 18, size / 2);
  ctx.stroke();

  ctx.setLineDash([]);
  ctx.strokeStyle = "rgba(15, 23, 42, 0.08)";
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i += 1) {
    const pos = (size / 4) * i;
    ctx.beginPath();
    ctx.moveTo(pos, 18);
    ctx.lineTo(pos, size - 18);
    ctx.moveTo(18, pos);
    ctx.lineTo(size - 18, pos);
    ctx.stroke();
  }
  ctx.restore();
}

function drawKanjiVgPaths(
  ctx: CanvasRenderingContext2D,
  data: KanjiVgData,
  style: { strokeStyle: string; lineWidth: number; lineCap?: CanvasLineCap; lineJoin?: CanvasLineJoin },
  width: number,
  height: number,
  padding = 20
) {
  drawKanjiVgPathList(ctx, data, data.paths, style, width, height, padding);
}

function drawKanjiVgPathList(
  ctx: CanvasRenderingContext2D,
  data: KanjiVgData,
  paths: string[],
  style: { strokeStyle: string; lineWidth: number; lineCap?: CanvasLineCap; lineJoin?: CanvasLineJoin },
  width: number,
  height: number,
  padding = 20
) {
  if (paths.length === 0) {
    return;
  }

  withSvgTransform(
    ctx,
    width,
    height,
    data.viewBox,
    () => {
      ctx.save();
      ctx.strokeStyle = style.strokeStyle;
      ctx.lineWidth = style.lineWidth;
      ctx.lineCap = style.lineCap ?? "round";
      ctx.lineJoin = style.lineJoin ?? "round";
      for (const d of paths) {
        ctx.stroke(new Path2D(d));
      }
      ctx.restore();
    },
    padding
  );
}

function getPathStartPoint(path: string): Point | null {
  const match = path.match(/[Mm]\s*(-?\d+(?:\.\d+)?)(?:[\s,]+)(-?\d+(?:\.\d+)?)/);
  if (!match) {
    return null;
  }

  const x = Number(match[1]);
  const y = Number(match[2]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  return { x, y };
}

function drawStrokeStartMarker(
  ctx: CanvasRenderingContext2D,
  data: KanjiVgData,
  path: string,
  strokeNumber: number,
  width: number,
  height: number,
  padding = 20
) {
  const point = getPathStartPoint(path);
  if (!point) {
    return;
  }

  withSvgTransform(
    ctx,
    width,
    height,
    data.viewBox,
    () => {
      ctx.save();
      ctx.fillStyle = "rgba(249, 115, 22, 0.94)";
      ctx.strokeStyle = "rgba(255, 247, 237, 0.95)";
      ctx.lineWidth = 0.95;
      ctx.beginPath();
      ctx.arc(point.x, point.y, 4.25, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#fff7ed";
      ctx.font = `${strokeNumber >= 10 ? "700 4.4px" : "700 5.2px"} sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(strokeNumber), point.x, point.y + 0.15);
      ctx.restore();
    },
    padding
  );
}

function drawStrokeOrderGuide(
  ctx: CanvasRenderingContext2D,
  data: KanjiVgData,
  completedCount: number,
  width: number,
  height: number,
  padding = 20
) {
  const safeCompletedCount = Math.max(0, Math.min(completedCount, data.paths.length));
  const completedPaths = data.paths.slice(0, safeCompletedCount);
  drawKanjiVgPathList(
    ctx,
    data,
    completedPaths,
    { strokeStyle: "rgba(34, 197, 94, 0.24)", lineWidth: 3.2 },
    width,
    height,
    padding
  );

  const nextPath = data.paths[safeCompletedCount];
  if (!nextPath) {
    return;
  }

  drawKanjiVgPathList(
    ctx,
    data,
    [nextPath],
    { strokeStyle: "rgba(249, 115, 22, 0.84)", lineWidth: 4.7 },
    width,
    height,
    padding
  );
  drawStrokeStartMarker(ctx, data, nextPath, safeCompletedCount + 1, width, height, padding);
}

function drawUserStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: DrawStroke[],
  style: { strokeStyle: string; lineWidth: number },
  data: KanjiVgData,
  width: number,
  height: number,
  padding = 20,
  fitTransform?: { scale: number; translateX: number; translateY: number }
) {
  if (strokes.length === 0) {
    return;
  }

  withSvgTransform(
    ctx,
    width,
    height,
    data.viewBox,
    () => {
      ctx.save();
      if (fitTransform) {
        ctx.translate(fitTransform.translateX, fitTransform.translateY);
        ctx.scale(fitTransform.scale, fitTransform.scale);
      }
      ctx.strokeStyle = style.strokeStyle;
      ctx.lineWidth = style.lineWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (const stroke of strokes) {
        if (stroke.length === 0) {
          continue;
        }
        ctx.beginPath();
        ctx.moveTo(stroke[0].x, stroke[0].y);
        for (let index = 1; index < stroke.length; index += 1) {
          ctx.lineTo(stroke[index].x, stroke[index].y);
        }
        if (stroke.length === 1) {
          ctx.lineTo(stroke[0].x + 0.01, stroke[0].y + 0.01);
        }
        ctx.stroke();
      }
      ctx.restore();
    },
    padding
  );
}

function canvasPointToSvgPoint(event: ReactPointerEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement, viewBox: ViewBox): Point {
  const rect = canvas.getBoundingClientRect();
  const canvasX = ((event.clientX - rect.left) / rect.width) * canvas.width;
  const canvasY = ((event.clientY - rect.top) / rect.height) * canvas.height;
  const metrics = getCanvasMetrics(canvas, viewBox);
  return {
    x: (canvasX - metrics.offsetX) / metrics.scale,
    y: (canvasY - metrics.offsetY) / metrics.scale,
  };
}

function measureStrokeBounds(strokes: DrawStroke[]): Bounds | null {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const stroke of strokes) {
    for (const point of stroke) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }
  return { minX, minY, maxX, maxY };
}

function measureMaskBounds(canvas: HTMLCanvasElement): Bounds | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return null;
  }
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const alpha = pixels[(y * canvas.width + x) * 4 + 3];
      if (alpha > 18) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }
  return { minX, minY, maxX, maxY };
}

function pixelBoundsToSvgBounds(bounds: Bounds, viewBox: ViewBox, size: number): Bounds {
  const metrics = getMetricsForSize(size, size, viewBox, 14);
  return {
    minX: (bounds.minX - metrics.offsetX) / metrics.scale,
    minY: (bounds.minY - metrics.offsetY) / metrics.scale,
    maxX: (bounds.maxX - metrics.offsetX) / metrics.scale,
    maxY: (bounds.maxY - metrics.offsetY) / metrics.scale,
  };
}

function buildFitTransform(userBounds: Bounds | null, targetBounds: Bounds | null) {
  if (!userBounds || !targetBounds) {
    return undefined;
  }
  const userWidth = Math.max(1, userBounds.maxX - userBounds.minX);
  const userHeight = Math.max(1, userBounds.maxY - userBounds.minY);
  const targetWidth = Math.max(1, targetBounds.maxX - targetBounds.minX);
  const targetHeight = Math.max(1, targetBounds.maxY - targetBounds.minY);
  const scale = Math.min(targetWidth / userWidth, targetHeight / userHeight) * 0.96;
  const userCenterX = (userBounds.minX + userBounds.maxX) / 2;
  const userCenterY = (userBounds.minY + userBounds.maxY) / 2;
  const targetCenterX = (targetBounds.minX + targetBounds.maxX) / 2;
  const targetCenterY = (targetBounds.minY + targetBounds.maxY) / 2;

  return {
    scale,
    translateX: targetCenterX - userCenterX * scale,
    translateY: targetCenterY - userCenterY * scale,
  };
}

function createMaskCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = EVAL_SIZE;
  canvas.height = EVAL_SIZE;
  return canvas;
}

function renderTargetMask(data: KanjiVgData, lineWidth = 5.8): HTMLCanvasElement {
  const canvas = createMaskCanvas();
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return canvas;
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawKanjiVgPaths(ctx, data, { strokeStyle: "#000000", lineWidth }, canvas.width, canvas.height, 14);
  return canvas;
}

function renderUserMask(
  data: KanjiVgData,
  strokes: DrawStroke[],
  fitTransform?: { scale: number; translateX: number; translateY: number },
  lineWidth = 6.2
): HTMLCanvasElement {
  const canvas = createMaskCanvas();
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return canvas;
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawUserStrokes(
    ctx,
    strokes,
    { strokeStyle: "#000000", lineWidth },
    data,
    canvas.width,
    canvas.height,
    14,
    fitTransform
  );
  return canvas;
}

function compareTolerantMasks(
  targetStrict: HTMLCanvasElement,
  targetLoose: HTMLCanvasElement,
  userStrict: HTMLCanvasElement,
  userLoose: HTMLCanvasElement
) {
  const targetStrictCtx = targetStrict.getContext("2d");
  const targetLooseCtx = targetLoose.getContext("2d");
  const userStrictCtx = userStrict.getContext("2d");
  const userLooseCtx = userLoose.getContext("2d");
  if (!targetStrictCtx || !targetLooseCtx || !userStrictCtx || !userLooseCtx) {
    return { shapeScore: 0, precision: 0, recall: 0 };
  }

  const targetStrictPixels = targetStrictCtx.getImageData(0, 0, targetStrict.width, targetStrict.height).data;
  const targetLoosePixels = targetLooseCtx.getImageData(0, 0, targetLoose.width, targetLoose.height).data;
  const userStrictPixels = userStrictCtx.getImageData(0, 0, userStrict.width, userStrict.height).data;
  const userLoosePixels = userLooseCtx.getImageData(0, 0, userLoose.width, userLoose.height).data;
  let targetCount = 0;
  let userCount = 0;
  let strictIntersection = 0;
  let targetCoveredByUser = 0;
  let userCoveredByTarget = 0;

  for (let index = 3; index < targetStrictPixels.length; index += 4) {
    const hasTarget = targetStrictPixels[index] > 18;
    const hasTargetTolerance = targetLoosePixels[index] > 18;
    const hasUser = userStrictPixels[index] > 18;
    const hasUserTolerance = userLoosePixels[index] > 18;
    if (hasTarget) {
      targetCount += 1;
      if (hasUser) {
        strictIntersection += 1;
      }
      if (hasUserTolerance) {
        targetCoveredByUser += 1;
      }
    }
    if (hasUser) {
      userCount += 1;
      if (hasTargetTolerance) {
        userCoveredByTarget += 1;
      }
    }
  }

  if (targetCount === 0 || userCount === 0) {
    return { shapeScore: 0, precision: 0, recall: 0, tolerantPrecision: 0, tolerantRecall: 0 };
  }

  const strictRecall = strictIntersection / targetCount;
  const strictPrecision = strictIntersection / userCount;
  const tolerantRecall = targetCoveredByUser / targetCount;
  const tolerantPrecision = userCoveredByTarget / userCount;
  const strictShape = strictRecall * 0.56 + strictPrecision * 0.44;
  const tolerantShape = tolerantRecall * 0.56 + tolerantPrecision * 0.44;
  const blendedShape = strictShape * 0.62 + tolerantShape * 0.38;
  return {
    shapeScore: blendedShape * 100,
    precision: strictPrecision * 100,
    recall: strictRecall * 100,
    tolerantPrecision: tolerantPrecision * 100,
    tolerantRecall: tolerantRecall * 100,
  };
}

function scoreStrokeCount(expected: number, actual: number): number {
  if (actual <= 0) {
    return 0;
  }
  const gap = Math.abs(Math.max(1, expected) - actual);
  if (gap <= 1) {
    return 100;
  }
  if (gap === 2) {
    return 72;
  }
  if (gap === 3) {
    return 45;
  }
  return Math.max(10, 45 - (gap - 3) * 12);
}

function strokeCountGate(expected: number, actual: number): "ok" | "close" | "bad" {
  const gap = Math.abs(Math.max(1, expected) - actual);
  if (gap <= 1) {
    return "ok";
  }
  if (gap === 2) {
    return "close";
  }
  return "bad";
}

function evaluateDrawing(data: KanjiVgData, strokes: DrawStroke[], expectedStrokeCount: number): CheckResult {
  if (strokes.length === 0) {
    return {
      status: "empty",
      totalScore: 0,
      shapeScore: 0,
      strokeScore: 0,
      precision: 0,
      recall: 0,
      actualStrokes: 0,
      message: "Bạn hãy vẽ Kanji trước đã.",
    };
  }

  const targetMask = renderTargetMask(data, 5.8);
  const targetLooseMask = renderTargetMask(data, 13.2);
  const targetPixelBounds = measureMaskBounds(targetMask);
  const targetSvgBounds = targetPixelBounds ? pixelBoundsToSvgBounds(targetPixelBounds, data.viewBox, EVAL_SIZE) : null;
  const userBounds = measureStrokeBounds(strokes);
  const fitTransform = buildFitTransform(userBounds, targetSvgBounds);
  const fittedUserMask = renderUserMask(data, strokes, fitTransform, 6.2);
  const fittedUserLooseMask = renderUserMask(data, strokes, fitTransform, 13.6);
  const rawUserMask = renderUserMask(data, strokes, undefined, 6.2);
  const rawUserLooseMask = renderUserMask(data, strokes, undefined, 13.6);
  const fittedScore = compareTolerantMasks(targetMask, targetLooseMask, fittedUserMask, fittedUserLooseMask);
  const rawScore = compareTolerantMasks(targetMask, targetLooseMask, rawUserMask, rawUserLooseMask);
  const bestShape = fittedScore.shapeScore >= rawScore.shapeScore ? fittedScore : rawScore;
  const strokeScore = scoreStrokeCount(expectedStrokeCount, strokes.length);
  const totalScore = Math.round(bestShape.shapeScore * 0.78 + strokeScore * 0.22);
  const countGate = strokeCountGate(expectedStrokeCount, strokes.length);

  if (countGate === "bad") {
    return {
      status: "wrong",
      totalScore,
      shapeScore: Math.round(bestShape.shapeScore),
      strokeScore: Math.round(strokeScore),
      precision: Math.round(bestShape.precision),
      recall: Math.round(bestShape.recall),
      actualStrokes: strokes.length,
      message:
        strokes.length < expectedStrokeCount
          ? "Hình khá giống nhưng còn thiếu nhiều nét."
          : "Hình khá giống nhưng đang dư nhiều nét.",
    };
  }

  if (
    countGate === "ok" &&
    totalScore >= 76 &&
    bestShape.shapeScore >= 68 &&
    bestShape.precision >= 60 &&
    bestShape.recall >= 60
  ) {
    return {
      status: "correct",
      totalScore,
      shapeScore: Math.round(bestShape.shapeScore),
      strokeScore: Math.round(strokeScore),
      precision: Math.round(bestShape.precision),
      recall: Math.round(bestShape.recall),
      actualStrokes: strokes.length,
      message: "Đúng rồi!",
    };
  }

  if (totalScore >= 58 && bestShape.shapeScore >= 50) {
    return {
      status: "close",
      totalScore,
      shapeScore: Math.round(bestShape.shapeScore),
      strokeScore: Math.round(strokeScore),
      precision: Math.round(bestShape.precision),
      recall: Math.round(bestShape.recall),
      actualStrokes: strokes.length,
      message: "Gần đúng rồi, chỉnh lại nét một chút nhé.",
    };
  }

  return {
    status: "wrong",
    totalScore,
    shapeScore: Math.round(bestShape.shapeScore),
    strokeScore: Math.round(strokeScore),
    precision: Math.round(bestShape.precision),
    recall: Math.round(bestShape.recall),
    actualStrokes: strokes.length,
    message: "Chưa khớp mẫu KanjiVG, thử lại nha.",
  };
}

function shuffleArray<T>(items: T[]): T[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function sortLevels(levels: string[]): string[] {
  return levels.sort((a, b) => {
    const levelDiff = LEVEL_ORDER.indexOf(a) - LEVEL_ORDER.indexOf(b);
    if (levelDiff !== 0) {
      return levelDiff;
    }
    return a.localeCompare(b);
  });
}

function statusClass(status: CheckResult["status"]) {
  if (status === "correct") {
    return "border-emerald-200 bg-emerald-50 text-emerald-900";
  }
  if (status === "close") {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }
  return "border-rose-200 bg-rose-50 text-rose-900";
}

function joinVisible(values: Array<string | undefined | null>): string {
  return values
    .map((value) => value?.trim() ?? "")
    .filter(Boolean)
    .join(" · ");
}

function katakanaToHiragana(value: string): string {
  return value.replace(/[\u30a1-\u30f6]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0x60)
  );
}

function normalizeForSearch(value: string): string {
  return katakanaToHiragana(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function tokenizeSearch(value: string): string[] {
  return normalizeForSearch(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function isSingleKanjiQuery(value: string): boolean {
  const chars = Array.from(value);
  return chars.length === 1 && /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(chars[0]);
}

function buildSearchIndex(item: KanjiWriteFlashcardItem): string {
  return normalizeForSearch(
    [
      item.character,
      item.meaning,
      item.hanviet,
      item.onReading,
      item.kunReading,
      item.strokeHint,
      item.radical?.symbol,
      item.radical?.name,
      item.radical?.meaning,
      item.radicalHint,
      item.mnemonic,
      item.structure?.formula,
      item.structure?.meaning,
      item.category,
      item.tags.join(" "),
      item.relatedWords
        .map((word) =>
          [
            word.word,
            word.kanji,
            word.reading,
            word.hanviet,
            word.meaning,
            word.exampleSentence,
            word.exampleMeaning,
          ].join(" ")
        )
        .join(" "),
      item.jlptLevel,
      item.sourceLabel,
      String(item.strokeCount),
      `${item.strokeCount} nét`,
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function scoreSearchMatch(
  item: KanjiWriteFlashcardItem,
  normalizedQuery: string,
  tokens: string[]
): number {
  if (!normalizedQuery && tokens.length === 0) {
    return 0;
  }

  const character = normalizeForSearch(item.character);
  const meaning = normalizeForSearch(item.meaning);
  const hanviet = normalizeForSearch(item.hanviet);
  const onReading = normalizeForSearch(item.onReading);
  const kunReading = normalizeForSearch(item.kunReading);
  const index = buildSearchIndex(item);

  if (isSingleKanjiQuery(normalizedQuery) && character !== normalizedQuery) {
    return 0;
  }

  if (tokens.length > 0 && !tokens.every((token) => index.includes(token))) {
    return 0;
  }

  let score = 0;
  if (normalizedQuery) {
    if (character === normalizedQuery) score += 180;
    if (meaning === normalizedQuery) score += 130;
    if (hanviet === normalizedQuery) score += 120;
    if (onReading === normalizedQuery || kunReading === normalizedQuery) score += 100;
    if (character.includes(normalizedQuery)) score += 70;
    if (meaning.includes(normalizedQuery)) score += 54;
    if (hanviet.includes(normalizedQuery)) score += 50;
    if (onReading.includes(normalizedQuery) || kunReading.includes(normalizedQuery)) score += 42;
    if (index.includes(normalizedQuery)) score += 20;
  }

  for (const token of tokens) {
    if (character === token) score += 52;
    if (character.includes(token)) score += 26;
    if (meaning.includes(token)) score += 16;
    if (hanviet.includes(token)) score += 16;
    if (onReading.includes(token) || kunReading.includes(token)) score += 14;
  }

  return score;
}

export function KanjiWriteFlashcardClient({ items, sourceOptions }: Props) {
  const [levelFilter, setLevelFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const [shuffleMode, setShuffleMode] = useState(false);
  const [shuffleSeed, setShuffleSeed] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [strokes, setStrokes] = useState<DrawStroke[]>([]);
  const [showTarget, setShowTarget] = useState(false);
  const [showStrokeGuide, setShowStrokeGuide] = useState(true);
  const [data, setData] = useState<KanjiVgData | null>(null);
  const [dataError, setDataError] = useState("");
  const [loadingData, setLoadingData] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokesRef = useRef<DrawStroke[]>([]);
  const activeStrokeRef = useRef<DrawStroke | null>(null);
  const activePointerRef = useRef<number | null>(null);

  const normalizedQuery = useMemo(() => normalizeForSearch(query), [query]);
  const queryTokens = useMemo(() => tokenizeSearch(query), [query]);
  const levels = useMemo(() => sortLevels(Array.from(new Set(items.map((item) => item.jlptLevel).filter(Boolean)))), [items]);
  const filteredItems = useMemo(() => {
    const scored: Array<{ item: KanjiWriteFlashcardItem; index: number; score: number }> = [];
    const hasSearchQuery = Boolean(normalizedQuery || queryTokens.length > 0);

    items.forEach((item, index) => {
      if (levelFilter !== "ALL" && item.jlptLevel !== levelFilter) {
        return;
      }

      const score = scoreSearchMatch(item, normalizedQuery, queryTokens);
      if (hasSearchQuery && score <= 0) {
        return;
      }

      scored.push({ item, index, score });
    });

    if (hasSearchQuery) {
      scored.sort((a, b) => b.score - a.score || a.index - b.index);
    }

    return scored.map((entry) => entry.item);
  }, [items, levelFilter, normalizedQuery, queryTokens]);
  const orderedItems = useMemo(
    () => (shuffleMode ? shuffleArray(filteredItems) : filteredItems),
    [filteredItems, shuffleMode, shuffleSeed]
  );
  const current = orderedItems[currentIndex] ?? null;
  const expectedStrokeCount = data?.paths.length ?? current?.strokeCount ?? 1;
  const relatedWords = current?.relatedWords ?? [];
  const radicalLine = current?.radical
    ? joinVisible([
        current.radical.symbol,
        current.radical.name,
        current.radical.meaning,
        current.radical.position,
      ])
    : "";
  const componentLine = current
    ? joinVisible([
        current.structure?.formula,
        current.components.length > 0
          ? current.components
              .slice(0, 3)
              .map((component) =>
                joinVisible([component.symbol, component.name, component.meaning])
              )
              .join("; ")
          : "",
      ])
    : "";
  const hintLine = current
    ? current.mnemonic || current.radicalHint || current.structure?.meaning || ""
    : "";
  const nextGuideStrokeNumber = data ? Math.min(strokes.length + 1, data.paths.length) : 0;
  const strokeGuideLabel = !data
    ? "Đang tải thứ tự nét"
    : strokes.length < data.paths.length
      ? `Gợi ý nét ${nextGuideStrokeNumber}/${data.paths.length}`
      : "Đã vẽ đủ số nét";

  const resetAnswer = useCallback(() => {
    strokesRef.current = [];
    activeStrokeRef.current = null;
    activePointerRef.current = null;
    setStrokes([]);
    setResult(null);
    setShowTarget(false);
  }, []);

  const redrawBoard = useCallback(
    (liveStroke?: DrawStroke | null) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return;
      }

      drawGuideGrid(ctx, canvas.width);
      const allStrokes = liveStroke ? [...strokesRef.current, liveStroke] : strokesRef.current;

      if (data && showTarget) {
        drawKanjiVgPaths(
          ctx,
          data,
          { strokeStyle: "rgba(14, 165, 233, 0.32)", lineWidth: 3.4 },
          canvas.width,
          canvas.height
        );
      }

      if (data && showStrokeGuide) {
        drawStrokeOrderGuide(ctx, data, strokesRef.current.length, canvas.width, canvas.height);
      }

      if (data) {
        drawUserStrokes(
          ctx,
          allStrokes,
          { strokeStyle: "#0f172a", lineWidth: 3.8 },
          data,
          canvas.width,
          canvas.height
        );
      }
    },
    [data, showStrokeGuide, showTarget]
  );

  useEffect(() => {
    strokesRef.current = strokes;
    redrawBoard();
  }, [strokes, redrawBoard]);

  useEffect(() => {
    redrawBoard();
  }, [data, showTarget, redrawBoard]);

  useEffect(() => {
    setCurrentIndex(0);
    resetAnswer();
  }, [levelFilter, resetAnswer]);

  useEffect(() => {
    if (currentIndex >= orderedItems.length) {
      setCurrentIndex(0);
    }
  }, [currentIndex, orderedItems.length]);

  useEffect(() => {
    resetAnswer();
  }, [current?.id, resetAnswer]);

  useEffect(() => {
    if (!current) {
      setData(null);
      setDataError("");
      setLoadingData(false);
      return;
    }

    let cancelled = false;
    setLoadingData(true);
    setDataError("");
    setData(null);

    loadKanjiVg(current.character)
      .then((loaded) => {
        if (cancelled) {
          return;
        }
        setData(loaded);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setDataError(error instanceof Error ? error.message : "Không tải được KanjiVG.");
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingData(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [current]);

  const goTo = useCallback(
    (direction: "prev" | "next") => {
      if (orderedItems.length === 0) {
        return;
      }
      setCurrentIndex((value) => {
        if (direction === "prev") {
          return (value - 1 + orderedItems.length) % orderedItems.length;
        }
        return (value + 1) % orderedItems.length;
      });
    },
    [orderedItems.length]
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!data || event.button !== 0) {
        return;
      }
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }
      event.preventDefault();
      canvas.setPointerCapture(event.pointerId);
      const point = canvasPointToSvgPoint(event, canvas, data.viewBox);
      activePointerRef.current = event.pointerId;
      activeStrokeRef.current = [point];
      redrawBoard(activeStrokeRef.current);
    },
    [data, redrawBoard]
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!data || activePointerRef.current !== event.pointerId || !activeStrokeRef.current) {
        return;
      }
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }
      event.preventDefault();
      const nextPoint = canvasPointToSvgPoint(event, canvas, data.viewBox);
      const currentStroke = activeStrokeRef.current;
      const lastPoint = currentStroke[currentStroke.length - 1];
      const distance = Math.hypot(nextPoint.x - lastPoint.x, nextPoint.y - lastPoint.y);
      if (distance >= 0.35) {
        currentStroke.push(nextPoint);
        redrawBoard(currentStroke);
      }
    },
    [data, redrawBoard]
  );

  const finishStroke = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (activePointerRef.current !== event.pointerId || !activeStrokeRef.current) {
        return;
      }
      event.preventDefault();
      const canvas = canvasRef.current;
      if (canvas?.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
      const completedStroke = activeStrokeRef.current;
      activePointerRef.current = null;
      activeStrokeRef.current = null;
      setResult(null);
      const nextStrokes = [...strokesRef.current, completedStroke];
      strokesRef.current = nextStrokes;
      setStrokes(nextStrokes);
    },
    []
  );

  const handleCheck = useCallback(() => {
    if (!data || !current) {
      return;
    }
    const checked = evaluateDrawing(data, strokesRef.current, expectedStrokeCount);
    setResult(checked);
    if (checked.status === "correct" || checked.status === "close") {
      setShowTarget(true);
    }
  }, [current, data, expectedStrokeCount]);

  const undoStroke = useCallback(() => {
    setResult(null);
    const nextStrokes = strokesRef.current.slice(0, -1);
    strokesRef.current = nextStrokes;
    setStrokes(nextStrokes);
  }, []);

  const clearBoard = useCallback(() => {
    resetAnswer();
  }, [resetAnswer]);

  const shuffleLabel = shuffleMode ? "Thứ tự gốc" : "Đảo thứ tự";

  if (items.length === 0) {
    return (
      <div className="rounded-[2rem] border border-slate-200 bg-white/90 p-8 text-center text-slate-600 shadow-sm">
        Chưa có Kanji để luyện viết.
      </div>
    );
  }

  return (
    <section className="space-y-5">
      <div className="rounded-[2rem] border border-slate-200 bg-white/90 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-sky-600">KanjiVG prototype</p>
            <h1 className="mt-2 text-3xl font-black text-slate-950">Flashcard luyện viết Kanji</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Trang này tách riêng để test thuật toán: hệ thống hiện nghĩa, bạn vẽ Kanji, rồi app so sánh nét vẽ với
              dữ liệu KanjiVG.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setShuffleMode((value) => !value);
              setShuffleSeed((value) => value + 1);
              setCurrentIndex(0);
            }}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
          >
            <Shuffle className="h-4 w-4" />
            {shuffleLabel}
          </button>
        </div>

        <div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700">
            Nguồn Kanji
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {sourceOptions.map((option) => (
              <Link
                key={option.value}
                href={option.href}
                className={`rounded-full border px-4 py-2 text-sm font-black transition ${
                  option.active
                    ? "border-emerald-600 bg-emerald-600 text-white shadow-sm"
                    : "border-emerald-200 bg-white text-emerald-800 hover:border-emerald-400 hover:bg-emerald-100"
                }`}
              >
                {option.label} ({option.count})
              </Link>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setLevelFilter("ALL")}
            className={`rounded-full border px-4 py-2 text-sm font-black transition ${
              levelFilter === "ALL"
                ? "border-sky-200 bg-sky-100 text-sky-800"
                : "border-slate-200 bg-white text-slate-500 hover:text-slate-800"
            }`}
          >
            Tất cả ({items.length})
          </button>
          {levels.map((level) => {
            const count = items.filter((item) => item.jlptLevel === level).length;
            return (
              <button
                key={level}
                type="button"
                onClick={() => setLevelFilter(level)}
                className={`rounded-full border px-4 py-2 text-sm font-black transition ${
                  levelFilter === level
                    ? "border-sky-200 bg-sky-100 text-sky-800"
                    : "border-slate-200 bg-white text-slate-500 hover:text-slate-800"
                }`}
              >
                {level} ({count})
              </button>
            );
          })}
        </div>

        <div className="mt-5 rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Danh sách Kanji</p>
              <p className="mt-1 text-sm font-semibold text-slate-600">
                Bấm vào chữ bất kỳ để chuyển nhanh sang flashcard luyện viết.
              </p>
            </div>
            <p className="rounded-full bg-white px-3 py-1 text-xs font-black text-sky-700 shadow-sm">
              {orderedItems.length} chữ
            </p>
          </div>

          <label className="relative mt-4 block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setCurrentIndex(0);
                resetAnswer();
              }}
              placeholder="Tìm Kanji, nghĩa, Hán Việt, On/Kun, từ liên quan..."
              className="h-11 w-full rounded-2xl border border-slate-200 bg-white pl-10 pr-4 text-sm font-semibold text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
            />
          </label>

          <div className="mt-4 grid max-h-72 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
            {orderedItems.length > 0 ? (
              orderedItems.map((item, index) => {
                const active = index === currentIndex;
                return (
                  <button
                    key={`${item.id}-${item.character}-${index}`}
                    type="button"
                    onClick={() => setCurrentIndex(index)}
                    className={`min-h-[78px] rounded-2xl border px-3 py-2 text-left transition ${
                      active
                        ? "border-sky-300 bg-sky-100 text-sky-950 shadow-[0_10px_24px_rgba(14,165,233,0.16)]"
                        : "border-slate-200 bg-white text-slate-700 hover:border-sky-200 hover:bg-sky-50"
                    }`}
                  >
                    <span lang="ja" className="font-kanji block text-2xl font-black leading-none">
                      {item.character}
                    </span>
                    <span className="mt-2 line-clamp-2 block text-xs font-bold leading-4 text-slate-500">
                      {item.meaning}
                    </span>
                  </button>
                );
              })
            ) : (
              <div className="col-span-full rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm font-bold text-slate-500">
                Không tìm thấy Kanji phù hợp.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-[2rem] border border-[#b8d4ff] bg-[#2f4074] p-4 text-white shadow-[0_24px_70px_rgba(30,64,175,0.24)] sm:p-5">
        {!current ? (
          <div className="rounded-[1.5rem] bg-white/8 p-8 text-center font-bold">Không có Kanji trong bộ lọc này.</div>
        ) : (
          <>
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,440px)]">
              <div className="rounded-[1.5rem] border border-white/10 bg-white/7 p-5">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-sky-100/80">Nghĩa tiếng Việt</p>
                <h2 className="mt-3 text-4xl font-black leading-tight text-white sm:text-5xl">{current.meaning}</h2>
                <div className="mt-4 flex flex-wrap gap-2 text-xs font-black uppercase tracking-[0.16em]">
                  <span className="rounded-full bg-white/12 px-3 py-1.5 text-sky-50">{current.jlptLevel}</span>
                  <span className="rounded-full bg-white/12 px-3 py-1.5 text-sky-50">{expectedStrokeCount} nét</span>
                  {current.hanviet ? (
                    <span className="rounded-full bg-white/12 px-3 py-1.5 text-sky-50">Hán Việt: {current.hanviet}</span>
                  ) : null}
                  <span className="rounded-full bg-white/12 px-3 py-1.5 text-sky-50">{current.sourceLabel}</span>
                </div>
                <p className="mt-4 max-w-2xl text-sm font-semibold leading-6 text-sky-50/80">
                  Hãy vẽ chữ Kanji tương ứng với nghĩa trên. App chấm thoáng theo vùng dung sai, không bắt nét phải đè
                  đúng y chang đường mẫu.
                </p>

                <div className="mt-4 grid min-h-[230px] gap-3 rounded-2xl border border-sky-100/16 bg-slate-950/12 p-4 lg:grid-cols-[minmax(290px,0.82fr)_1fr]">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-sky-50/92 text-[#263750] shadow-inner">
                      <KanjiVgGlyph
                        data={data}
                        character={current.character}
                        className="h-12 w-12"
                        fallbackClassName="text-5xl font-black leading-none"
                        strokeWidth={4.6}
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-black uppercase tracking-[0.16em] text-sky-100/65">
                        Thông tin Kanji
                      </p>
                      <p className="mt-1 text-base font-black leading-5 text-white">
                        {current.onReading || current.kunReading ? (
                          <>
                            {current.onReading ? (
                              <span>
                                On:{" "}
                                <span lang="ja" className="font-kanji">
                                  {current.onReading}
                                </span>
                              </span>
                            ) : null}
                            {current.onReading && current.kunReading ? (
                              <span className="mx-1 text-sky-100/55">·</span>
                            ) : null}
                            {current.kunReading ? (
                              <span>
                                Kun:{" "}
                                <span lang="ja" className="font-kanji">
                                  {current.kunReading}
                                </span>
                              </span>
                            ) : null}
                          </>
                        ) : (
                          "Chưa có On/Kun"
                        )}
                      </p>
                      <div className="mt-2 space-y-1 text-xs font-semibold leading-5 text-sky-50/78">
                        {radicalLine ? (
                          <p>
                            <span className="font-black text-sky-50">Bộ thủ:</span> {radicalLine}
                          </p>
                        ) : null}
                        {componentLine ? (
                          <p className="line-clamp-2">
                            <span className="font-black text-sky-50">Cấu tạo:</span> {componentLine}
                          </p>
                        ) : null}
                        {hintLine ? (
                          <p className="line-clamp-2">
                            <span className="font-black text-sky-50">Gợi nhớ:</span> {hintLine}
                          </p>
                        ) : null}
                        {!radicalLine && !componentLine && !hintLine ? (
                          <p className="text-sky-50/55">Chưa có bộ thủ/cấu tạo trong dữ liệu.</p>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="min-w-0 border-t border-sky-100/10 pt-3 lg:border-l lg:border-t-0 lg:pl-3 lg:pt-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-black uppercase tracking-[0.16em] text-sky-100/65">
                        Từ liên quan
                      </p>
                      <span className="rounded-full bg-sky-100/10 px-2 py-0.5 text-[10px] font-black text-sky-50">
                        {relatedWords.length} từ
                      </span>
                    </div>
                    {relatedWords.length > 0 ? (
                      <div className="mt-2 max-h-48 space-y-1.5 overflow-y-auto pr-1">
                        {relatedWords.map((word) => (
                          <article
                            key={word.id}
                            className="rounded-xl border border-sky-100/14 bg-[#465783]/58 px-3 py-2"
                          >
                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                              <span lang="ja" className="font-kanji text-[1.03rem] font-semibold leading-6 text-sky-50 antialiased">
                                {word.word || word.kanji}
                              </span>
                              {word.reading ? (
                                <span lang="ja" className="font-kanji text-[11px] font-medium leading-5 text-sky-50/68 antialiased">
                                  {word.reading}
                                </span>
                              ) : null}
                              {word.jlptLevel ? (
                                <span className="rounded-full bg-sky-100/10 px-1.5 py-0.5 text-[10px] font-black text-sky-50">
                                  {word.jlptLevel}
                                </span>
                              ) : null}
                            </div>
                            <p className="line-clamp-1 text-xs font-semibold leading-5 text-sky-50/76">
                              {word.hanviet ? `${word.hanviet} - ` : ""}
                              {word.meaning}
                            </p>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-xs font-semibold text-sky-50/58">
                        Chưa có từ liên quan cho Kanji này.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-white/10 bg-white/7 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-bold text-sky-50/85">
                  <span>
                    {currentIndex + 1} / {orderedItems.length}
                  </span>
                  {showStrokeGuide ? (
                    <span className="rounded-full bg-orange-400/18 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-orange-50">
                      {strokeGuideLabel}
                    </span>
                  ) : null}
                  <span>{strokes.length} nét đã vẽ</span>
                </div>
                <div className="mt-3 overflow-hidden rounded-[1.25rem] border border-sky-100/60 bg-white shadow-inner">
                  <canvas
                    ref={canvasRef}
                    width={BOARD_SIZE}
                    height={BOARD_SIZE}
                    className="block aspect-square w-full cursor-crosshair"
                    style={{ touchAction: "none" }}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={finishStroke}
                    onPointerCancel={finishStroke}
                    aria-label="Bảng vẽ Kanji"
                  />
                </div>
                {data && showStrokeGuide ? (
                  <div className="mt-3 rounded-2xl border border-orange-200/45 bg-orange-400/12 px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-black uppercase tracking-[0.14em] text-orange-50">
                      <span>{strokeGuideLabel}</span>
                      <span>
                        {Math.min(strokes.length, expectedStrokeCount)} / {expectedStrokeCount} nét
                      </span>
                    </div>
                    <div className="mt-2 flex gap-1.5 overflow-hidden" aria-hidden="true">
                      {data.paths.map((_, index) => {
                        const segmentClass =
                          index < strokes.length
                            ? "bg-emerald-300"
                            : index === strokes.length
                              ? "bg-orange-300"
                              : "bg-white/25";
                        return <span key={index} className={`h-1.5 min-w-[6px] flex-1 rounded-full ${segmentClass}`} />;
                      })}
                    </div>
                  </div>
                ) : null}
                {loadingData ? (
                  <p className="mt-3 text-center text-xs font-bold text-sky-100/80">Đang tải nét KanjiVG...</p>
                ) : null}
                {dataError ? (
                  <p className="mt-3 rounded-2xl border border-rose-200/60 bg-rose-500/15 px-3 py-2 text-xs font-bold text-rose-50">
                    {dataError}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto]">
              <div className="grid gap-2 sm:grid-cols-4">
                <button
                  type="button"
                  onClick={handleCheck}
                  disabled={!data || loadingData}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-orange-500 px-4 py-3 text-sm font-black text-white shadow-[0_12px_30px_rgba(249,115,22,0.28)] transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  <Check className="h-4 w-4" />
                  Kiểm tra
                </button>
                <button
                  type="button"
                  onClick={() => setShowTarget((value) => !value)}
                  disabled={!data}
                  aria-pressed={showTarget}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-sky-100/60 bg-white/10 px-4 py-3 text-sm font-black text-white transition hover:bg-white/16 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Eye className="h-4 w-4" />
                  {showTarget ? "Ẩn mẫu" : "Hiện mẫu"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowStrokeGuide((value) => !value)}
                  disabled={!data}
                  aria-pressed={showStrokeGuide}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-orange-200/55 bg-orange-400/14 px-4 py-3 text-sm font-black text-orange-50 transition hover:bg-orange-400/22 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RotateCcw className="h-4 w-4" />
                  {showStrokeGuide ? "Tắt gợi ý" : "Gợi ý nét"}
                </button>
                <button
                  type="button"
                  onClick={undoStroke}
                  disabled={strokes.length === 0}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-sky-100/60 bg-white/10 px-4 py-3 text-sm font-black text-white transition hover:bg-white/16 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Undo2 className="h-4 w-4" />
                  Lùi nét
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => goTo("prev")}
                  className="grid h-12 w-12 place-items-center rounded-2xl border border-sky-100/60 bg-white/10 text-white transition hover:bg-white/16"
                  aria-label="Chữ trước"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={clearBoard}
                  className="grid h-12 w-12 place-items-center rounded-2xl border border-sky-100/60 bg-white/10 text-white transition hover:bg-white/16"
                  aria-label="Xóa bảng"
                >
                  <Eraser className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => goTo("next")}
                  className="grid h-12 w-12 place-items-center rounded-2xl border border-sky-100/60 bg-white/10 text-white transition hover:bg-white/16"
                  aria-label="Chữ sau"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="mt-4 min-h-[132px] rounded-[1.35rem] border border-sky-100/50 bg-[#294e73] p-4">
              {result ? (
                <div className={`rounded-2xl border p-4 ${statusClass(result.status)}`}>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.22em]">{result.message}</p>
                      <div className="mt-2 flex flex-wrap items-end gap-3">
                        <div>
                          <p className="text-xs font-black uppercase tracking-[0.18em] opacity-70">Đáp án</p>
                          <KanjiVgGlyph
                            data={data}
                            character={current.character}
                            className="mt-1 h-14 w-14"
                            fallbackClassName="text-5xl font-black leading-none"
                            strokeWidth={4.8}
                          />
                        </div>
                        <div className="pb-1 text-sm font-bold leading-6">
                          <p>Nghĩa: {current.meaning}</p>
                          {current.hanviet ? <p>Hán Việt: {current.hanviet}</p> : null}
                          <p>
                            Nét: {result.actualStrokes}/{expectedStrokeCount}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="grid min-w-[180px] gap-1 text-sm font-black">
                      <span>Điểm tổng: {result.totalScore}%</span>
                      <span>Độ khớp hình: {result.shapeScore}%</span>
                      <span>Điểm số nét: {result.strokeScore}%</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex h-full min-h-[100px] items-center justify-center rounded-2xl border border-dashed border-sky-100/45 bg-white/5 px-4 text-center text-sm font-semibold text-sky-50/75">
                  Kết quả sẽ hiện cố định ở đây sau khi kiểm tra để màn hình không bị giật lên xuống.
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs font-semibold text-sky-50/70">
              <span>
                Prototype này chấm theo mask KanjiVG và số nét. Nó phù hợp để test UX trước; nếu cần chuẩn như app nhận
                dạng chữ viết tay thật, ta sẽ thêm model nhận dạng chuyên dụng sau.
              </span>
              {data ? (
                <a href={data.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
                  Dữ liệu nét: KanjiVG
                </a>
              ) : (
                <span>Dữ liệu nét: KanjiVG</span>
              )}
            </div>
          </>
        )}
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white/90 p-4 text-xs leading-6 text-slate-500">
        KanjiVG được phát hành theo giấy phép Creative Commons Attribution-Share Alike 3.0. Khi đưa lên production, nên
        lưu cache dữ liệu cần dùng để trang không phụ thuộc mạng mỗi lần luyện.
      </div>
    </section>
  );
}
