"use client";

import {
  FormEvent,
  PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";

type KanjiLookupItem = {
  character: string;
  meaning: string;
  onReading: string;
  kunReading: string;
  jlptLevel: string;
  strokeCount: number;
};

type Props = {
  items: KanjiLookupItem[];
  initialQuery?: string;
  level?: string;
};

type Signature = {
  bits: Uint8Array;
  dilatedBits: Uint8Array;
  looseDilatedBits: Uint8Array;
  inkCount: number;
  inkRatio: number;
  rowProj: Float32Array;
  colProj: Float32Array;
  orientation: Float32Array;
  edgeProfile: Float32Array;
  holeCount: number;
  rowPeakCount: number;
  colPeakCount: number;
  rowStrongCount: number;
  colStrongCount: number;
  horizontalBandCount: number;
  verticalBandCount: number;
  maxHorizontalRunRatio: number;
  maxVerticalRunRatio: number;
  cx: number;
  cy: number;
  aspect: number;
};

type Candidate = {
  char: string;
  score: number;
};

const CANVAS_WIDTH = 680;
const CANVAS_HEIGHT = 360;
const GRID_SIZE = 56;
const PADDING = 6;
const PROJECTION_BINS = 16;
const GLYPH_FONTS = [
  "'Yu Gothic','Hiragino Sans','Noto Sans JP',sans-serif",
  "'Meiryo','MS PGothic','Noto Sans JP',sans-serif",
  "'Yu Mincho','Hiragino Mincho ProN','Noto Serif JP',serif",
];

function getCanvasPoint(
  canvas: HTMLCanvasElement,
  event: PointerEvent | ReactPointerEvent<HTMLCanvasElement>
) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (canvas.width / rect.width),
    y: (event.clientY - rect.top) * (canvas.height / rect.height),
  };
}

function drawGuide(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.save();
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "#dbe4f0";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(width / 2, 0);
  ctx.lineTo(width / 2, height);
  ctx.moveTo(0, height / 2);
  ctx.lineTo(width, height / 2);
  ctx.stroke();
  ctx.restore();
}

function createEmptySignature(): Signature {
  const empty = new Uint8Array(GRID_SIZE * GRID_SIZE);
  return {
    bits: empty,
    dilatedBits: empty,
    looseDilatedBits: empty,
    inkCount: 0,
    inkRatio: 0,
    rowProj: new Float32Array(PROJECTION_BINS),
    colProj: new Float32Array(PROJECTION_BINS),
    orientation: new Float32Array(4),
    edgeProfile: new Float32Array(4),
    holeCount: 0,
    rowPeakCount: 0,
    colPeakCount: 0,
    rowStrongCount: 0,
    colStrongCount: 0,
    horizontalBandCount: 0,
    verticalBandCount: 0,
    maxHorizontalRunRatio: 0,
    maxVerticalRunRatio: 0,
    cx: 0.5,
    cy: 0.5,
    aspect: 1,
  };
}

function normalizeVector(vector: Float32Array): Float32Array {
  const sum = vector.reduce((acc, value) => acc + value, 0);
  if (sum <= 0) {
    return vector;
  }
  for (let i = 0; i < vector.length; i += 1) {
    vector[i] /= sum;
  }
  return vector;
}

function dilateBits(bits: Uint8Array, radius: number): Uint8Array {
  if (radius <= 0) {
    return bits.slice();
  }
  const out = new Uint8Array(bits.length);
  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      const idx = y * GRID_SIZE + x;
      if (bits[idx] !== 1) {
        continue;
      }
      const minY = Math.max(0, y - radius);
      const maxY = Math.min(GRID_SIZE - 1, y + radius);
      const minX = Math.max(0, x - radius);
      const maxX = Math.min(GRID_SIZE - 1, x + radius);
      for (let yy = minY; yy <= maxY; yy += 1) {
        for (let xx = minX; xx <= maxX; xx += 1) {
          out[yy * GRID_SIZE + xx] = 1;
        }
      }
    }
  }
  return out;
}

function countOverlap(a: Uint8Array, b: Uint8Array): number {
  let count = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] === 1 && b[i] === 1) {
      count += 1;
    }
  }
  return count;
}

function countProjectionPeaks(vector: Float32Array, minRatio = 0.55): number {
  let maxValue = 0;
  for (let i = 0; i < vector.length; i += 1) {
    if (vector[i] > maxValue) {
      maxValue = vector[i];
    }
  }
  if (maxValue <= 0) {
    return 0;
  }
  const threshold = maxValue * minRatio;
  let peaks = 0;
  for (let i = 0; i < vector.length; i += 1) {
    const value = vector[i];
    if (value < threshold) {
      continue;
    }
    const prev = i > 0 ? vector[i - 1] : -Infinity;
    const next = i + 1 < vector.length ? vector[i + 1] : -Infinity;
    if (value >= prev && value >= next) {
      peaks += 1;
    }
  }
  return peaks;
}

function countProjectionStrong(vector: Float32Array, minRatio = 0.5): number {
  let maxValue = 0;
  for (let i = 0; i < vector.length; i += 1) {
    if (vector[i] > maxValue) {
      maxValue = vector[i];
    }
  }
  if (maxValue <= 0) {
    return 0;
  }
  const threshold = maxValue * minRatio;
  let strong = 0;
  for (let i = 0; i < vector.length; i += 1) {
    if (vector[i] >= threshold) {
      strong += 1;
    }
  }
  return strong;
}

function countBands(binary: Uint8Array): number {
  let bands = 0;
  let inBand = false;
  for (let i = 0; i < binary.length; i += 1) {
    if (binary[i] === 1) {
      if (!inBand) {
        bands += 1;
        inBand = true;
      }
    } else {
      inBand = false;
    }
  }
  return bands;
}

function getLineBandFeatures(bits: Uint8Array) {
  const rowStrong = new Uint8Array(GRID_SIZE);
  const colStrong = new Uint8Array(GRID_SIZE);
  let maxRowRun = 0;
  let maxColRun = 0;
  const rowThreshold = Math.floor(GRID_SIZE * 0.3);
  const colThreshold = Math.floor(GRID_SIZE * 0.3);

  for (let y = 0; y < GRID_SIZE; y += 1) {
    let longestRun = 0;
    let run = 0;
    for (let x = 0; x < GRID_SIZE; x += 1) {
      const idx = y * GRID_SIZE + x;
      if (bits[idx] === 1) {
        run += 1;
        if (run > longestRun) {
          longestRun = run;
        }
      } else {
        run = 0;
      }
    }
    if (longestRun >= rowThreshold) {
      rowStrong[y] = 1;
    }
    if (longestRun > maxRowRun) {
      maxRowRun = longestRun;
    }
  }

  for (let x = 0; x < GRID_SIZE; x += 1) {
    let longestRun = 0;
    let run = 0;
    for (let y = 0; y < GRID_SIZE; y += 1) {
      const idx = y * GRID_SIZE + x;
      if (bits[idx] === 1) {
        run += 1;
        if (run > longestRun) {
          longestRun = run;
        }
      } else {
        run = 0;
      }
    }
    if (longestRun >= colThreshold) {
      colStrong[x] = 1;
    }
    if (longestRun > maxColRun) {
      maxColRun = longestRun;
    }
  }

  return {
    horizontalBandCount: countBands(rowStrong),
    verticalBandCount: countBands(colStrong),
    maxHorizontalRunRatio: maxRowRun / GRID_SIZE,
    maxVerticalRunRatio: maxColRun / GRID_SIZE,
  };
}

function countHoles(bits: Uint8Array): number {
  const visited = new Uint8Array(bits.length);
  const stack = new Int32Array(bits.length);
  let holes = 0;

  for (let start = 0; start < bits.length; start += 1) {
    if (bits[start] === 1 || visited[start] === 1) {
      continue;
    }
    let touchesBorder = false;
    let size = 0;
    let top = 0;
    stack[top] = start;
    visited[start] = 1;
    top += 1;

    while (top > 0) {
      top -= 1;
      const idx = stack[top];
      size += 1;
      const y = Math.floor(idx / GRID_SIZE);
      const x = idx - y * GRID_SIZE;
      if (x === 0 || y === 0 || x === GRID_SIZE - 1 || y === GRID_SIZE - 1) {
        touchesBorder = true;
      }

      if (x > 0) {
        const left = idx - 1;
        if (bits[left] === 0 && visited[left] === 0) {
          visited[left] = 1;
          stack[top] = left;
          top += 1;
        }
      }
      if (x + 1 < GRID_SIZE) {
        const right = idx + 1;
        if (bits[right] === 0 && visited[right] === 0) {
          visited[right] = 1;
          stack[top] = right;
          top += 1;
        }
      }
      if (y > 0) {
        const up = idx - GRID_SIZE;
        if (bits[up] === 0 && visited[up] === 0) {
          visited[up] = 1;
          stack[top] = up;
          top += 1;
        }
      }
      if (y + 1 < GRID_SIZE) {
        const down = idx + GRID_SIZE;
        if (bits[down] === 0 && visited[down] === 0) {
          visited[down] = 1;
          stack[top] = down;
          top += 1;
        }
      }
    }

    if (!touchesBorder && size >= 8) {
      holes += 1;
    }
  }

  return holes;
}

function extractInkBounds(data: Uint8ClampedArray, width: number, height: number) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      if (brightness < 220) {
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
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

function signatureFromCanvas(source: HTMLCanvasElement): Signature {
  const srcCtx = source.getContext("2d");
  if (!srcCtx) {
    return createEmptySignature();
  }

  const srcData = srcCtx.getImageData(0, 0, source.width, source.height);
  const bounds = extractInkBounds(srcData.data, source.width, source.height);
  if (!bounds) {
    return createEmptySignature();
  }

  const normalized = document.createElement("canvas");
  normalized.width = GRID_SIZE;
  normalized.height = GRID_SIZE;
  const nctx = normalized.getContext("2d");
  if (!nctx) {
    return createEmptySignature();
  }

  nctx.fillStyle = "#fff";
  nctx.fillRect(0, 0, GRID_SIZE, GRID_SIZE);

  const targetW = GRID_SIZE - PADDING * 2;
  const targetH = GRID_SIZE - PADDING * 2;
  const scale = Math.min(targetW / bounds.width, targetH / bounds.height);
  const drawW = Math.max(1, Math.round(bounds.width * scale));
  const drawH = Math.max(1, Math.round(bounds.height * scale));
  const dx = Math.floor((GRID_SIZE - drawW) / 2);
  const dy = Math.floor((GRID_SIZE - drawH) / 2);

  nctx.drawImage(
    source,
    bounds.minX,
    bounds.minY,
    bounds.width,
    bounds.height,
    dx,
    dy,
    drawW,
    drawH
  );

  const image = nctx.getImageData(0, 0, GRID_SIZE, GRID_SIZE).data;
  const bits = new Uint8Array(GRID_SIZE * GRID_SIZE);
  const rowProj = new Float32Array(PROJECTION_BINS);
  const colProj = new Float32Array(PROJECTION_BINS);
  const orientation = new Float32Array(4);
  const edgeProfile = new Float32Array(4); // left, right, top, bottom
  let inkCount = 0;
  let sumX = 0;
  let sumY = 0;
  const rowBinSize = GRID_SIZE / PROJECTION_BINS;
  const colBinSize = GRID_SIZE / PROJECTION_BINS;
  const edgeBand = Math.max(2, Math.floor(GRID_SIZE * 0.18));

  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      const i = y * GRID_SIZE + x;
      const offset = i * 4;
      const brightness = (image[offset] + image[offset + 1] + image[offset + 2]) / 3;
      const bit = brightness < 210 ? 1 : 0;
      bits[i] = bit;
      if (bit) {
        inkCount += 1;
        sumX += x;
        sumY += y;
        const rbin = Math.min(PROJECTION_BINS - 1, Math.floor(y / rowBinSize));
        const cbin = Math.min(PROJECTION_BINS - 1, Math.floor(x / colBinSize));
        rowProj[rbin] += 1;
        colProj[cbin] += 1;
        if (x < edgeBand) {
          edgeProfile[0] += 1;
        }
        if (x >= GRID_SIZE - edgeBand) {
          edgeProfile[1] += 1;
        }
        if (y < edgeBand) {
          edgeProfile[2] += 1;
        }
        if (y >= GRID_SIZE - edgeBand) {
          edgeProfile[3] += 1;
        }
      }
    }
  }

  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      const idx = y * GRID_SIZE + x;
      if (bits[idx] !== 1) {
        continue;
      }

      if (x + 1 < GRID_SIZE && bits[y * GRID_SIZE + (x + 1)] === 1) {
        orientation[0] += 1; // horizontal
      }
      if (y + 1 < GRID_SIZE && bits[(y + 1) * GRID_SIZE + x] === 1) {
        orientation[1] += 1; // vertical
      }
      if (x + 1 < GRID_SIZE && y + 1 < GRID_SIZE && bits[(y + 1) * GRID_SIZE + (x + 1)] === 1) {
        orientation[2] += 1; // down-right
      }
      if (x + 1 < GRID_SIZE && y - 1 >= 0 && bits[(y - 1) * GRID_SIZE + (x + 1)] === 1) {
        orientation[3] += 1; // up-right
      }
    }
  }

  if (inkCount > 0) {
    const rowNorm = GRID_SIZE * rowBinSize;
    const colNorm = GRID_SIZE * colBinSize;
    for (let i = 0; i < PROJECTION_BINS; i += 1) {
      rowProj[i] /= rowNorm;
      colProj[i] /= colNorm;
    }
    for (let i = 0; i < edgeProfile.length; i += 1) {
      edgeProfile[i] /= inkCount;
    }
  }

  const dilatedBits = dilateBits(bits, 1);
  const looseDilatedBits = dilateBits(bits, 2);
  const holeCount = countHoles(bits);
  const lineBands = getLineBandFeatures(bits);
  const rowPeakCount = countProjectionPeaks(rowProj, 0.57);
  const colPeakCount = countProjectionPeaks(colProj, 0.57);
  const rowStrongCount = countProjectionStrong(rowProj, 0.52);
  const colStrongCount = countProjectionStrong(colProj, 0.52);

  return {
    bits,
    dilatedBits,
    looseDilatedBits,
    inkCount,
    inkRatio: inkCount / (GRID_SIZE * GRID_SIZE),
    rowProj,
    colProj,
    orientation: normalizeVector(orientation),
    edgeProfile,
    holeCount,
    rowPeakCount,
    colPeakCount,
    rowStrongCount,
    colStrongCount,
    horizontalBandCount: lineBands.horizontalBandCount,
    verticalBandCount: lineBands.verticalBandCount,
    maxHorizontalRunRatio: lineBands.maxHorizontalRunRatio,
    maxVerticalRunRatio: lineBands.maxVerticalRunRatio,
    cx: inkCount > 0 ? sumX / inkCount / GRID_SIZE : 0.5,
    cy: inkCount > 0 ? sumY / inkCount / GRID_SIZE : 0.5,
    aspect: bounds.height > 0 ? bounds.width / bounds.height : 1,
  };
}

function buildGlyphSignature(char: string, fontFamily: string): Signature {
  const canvas = document.createElement("canvas");
  canvas.width = 120;
  canvas.height = 120;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return createEmptySignature();
  }

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#111827";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 86px ${fontFamily}`;
  ctx.fillText(char, canvas.width / 2, canvas.height / 2 + 4);

  return signatureFromCanvas(canvas);
}

function buildGlyphSignatures(char: string): Signature[] {
  return GLYPH_FONTS.map((font) => buildGlyphSignature(char, font));
}

function compareCoarseSignature(
  input: Signature,
  target: Signature,
  strokeOrientation?: Float32Array
): number {
  let projDiff = 0;
  for (let i = 0; i < PROJECTION_BINS; i += 1) {
    projDiff += Math.abs(input.rowProj[i] - target.rowProj[i]);
    projDiff += Math.abs(input.colProj[i] - target.colProj[i]);
  }
  projDiff /= PROJECTION_BINS * 2;

  const centerDiff = Math.hypot(input.cx - target.cx, input.cy - target.cy);
  const aspectDiff = Math.abs(Math.log((input.aspect + 0.0001) / (target.aspect + 0.0001)));
  const densityDiff = Math.abs(input.inkRatio - target.inkRatio);
  const orientFromStroke = strokeOrientation ?? input.orientation;
  const holeDiff = Math.min(1, Math.abs(input.holeCount - target.holeCount));
  const rowPeakDiff = Math.min(1, Math.abs(input.rowPeakCount - target.rowPeakCount) / 3);
  const colPeakDiff = Math.min(1, Math.abs(input.colPeakCount - target.colPeakCount) / 3);
  const rowStrongDiff = Math.min(1, Math.abs(input.rowStrongCount - target.rowStrongCount) / 4);
  const colStrongDiff = Math.min(1, Math.abs(input.colStrongCount - target.colStrongCount) / 4);
  const hBandDiff = Math.min(1, Math.abs(input.horizontalBandCount - target.horizontalBandCount) / 4);
  const vBandDiff = Math.min(1, Math.abs(input.verticalBandCount - target.verticalBandCount) / 4);
  const hRunDiff = Math.min(1, Math.abs(input.maxHorizontalRunRatio - target.maxHorizontalRunRatio));
  const vRunDiff = Math.min(1, Math.abs(input.maxVerticalRunRatio - target.maxVerticalRunRatio));
  let edgeDiff = 0;
  for (let i = 0; i < 4; i += 1) {
    edgeDiff += Math.abs(input.edgeProfile[i] - target.edgeProfile[i]);
  }
  edgeDiff /= 4;

  let orientDiff = 0;
  for (let i = 0; i < 4; i += 1) {
    orientDiff += Math.abs(orientFromStroke[i] - target.orientation[i]);
  }
  orientDiff /= 4;

  return (
    projDiff * 0.26 +
    centerDiff * 0.11 +
    orientDiff * 0.16 +
    aspectDiff * 0.07 +
    densityDiff * 0.07 +
    edgeDiff * 0.06 +
    holeDiff * 0.03 +
    rowPeakDiff * 0.07 +
    colPeakDiff * 0.03 +
    rowStrongDiff * 0.04 +
    colStrongDiff * 0.01 +
    hBandDiff * 0.06 +
    vBandDiff * 0.02 +
    hRunDiff * 0.01 +
    vRunDiff * 0.01
  );
}

function compareSignature(
  input: Signature,
  target: Signature,
  strokeOrientation?: Float32Array
): number {
  let diff = 0;
  for (let i = 0; i < input.bits.length; i += 1) {
    if (input.bits[i] !== target.bits[i]) {
      diff += 1;
    }
  }
  const pixelDiff = diff / input.bits.length;
  const densityDiff = Math.abs(input.inkRatio - target.inkRatio);
  let projDiff = 0;
  for (let i = 0; i < PROJECTION_BINS; i += 1) {
    projDiff += Math.abs(input.rowProj[i] - target.rowProj[i]);
    projDiff += Math.abs(input.colProj[i] - target.colProj[i]);
  }
  projDiff /= PROJECTION_BINS * 2;

  const centerDiff = Math.hypot(input.cx - target.cx, input.cy - target.cy);
  const aspectDiff = Math.abs(Math.log((input.aspect + 0.0001) / (target.aspect + 0.0001)));
  const orientFromStroke = strokeOrientation ?? input.orientation;
  let orientDiff = 0;
  for (let i = 0; i < 4; i += 1) {
    orientDiff += Math.abs(orientFromStroke[i] - target.orientation[i]);
  }
  orientDiff /= 4;
  const holeDiff = Math.min(1, Math.abs(input.holeCount - target.holeCount));
  const rowPeakDiff = Math.min(1, Math.abs(input.rowPeakCount - target.rowPeakCount) / 3);
  const colPeakDiff = Math.min(1, Math.abs(input.colPeakCount - target.colPeakCount) / 3);
  const rowStrongDiff = Math.min(1, Math.abs(input.rowStrongCount - target.rowStrongCount) / 4);
  const colStrongDiff = Math.min(1, Math.abs(input.colStrongCount - target.colStrongCount) / 4);
  const hBandDiff = Math.min(1, Math.abs(input.horizontalBandCount - target.horizontalBandCount) / 4);
  const vBandDiff = Math.min(1, Math.abs(input.verticalBandCount - target.verticalBandCount) / 4);
  const hRunDiff = Math.min(1, Math.abs(input.maxHorizontalRunRatio - target.maxHorizontalRunRatio));
  const vRunDiff = Math.min(1, Math.abs(input.maxVerticalRunRatio - target.maxVerticalRunRatio));
  let edgeDiff = 0;
  for (let i = 0; i < 4; i += 1) {
    edgeDiff += Math.abs(input.edgeProfile[i] - target.edgeProfile[i]);
  }
  edgeDiff /= 4;

  const inputCover = input.inkCount > 0
    ? countOverlap(input.bits, target.dilatedBits) / input.inkCount
    : 0;
  const targetCover = target.inkCount > 0
    ? countOverlap(target.bits, input.dilatedBits) / target.inkCount
    : 0;
  const partialLikely = input.inkRatio < target.inkRatio * 0.8;
  const beta = partialLikely ? 0.55 : 0.9; // Emphasize precision when user is still drawing.
  const beta2 = beta * beta;
  const overlapFScore =
    inputCover + targetCover > 0
      ? ((1 + beta2) * inputCover * targetCover) / (beta2 * inputCover + targetCover)
      : 0;
  const overlapDiff = 1 - overlapFScore;

  const looseInputCover = input.inkCount > 0
    ? countOverlap(input.bits, target.looseDilatedBits) / input.inkCount
    : 0;
  const looseTargetCover = target.inkCount > 0
    ? countOverlap(target.bits, input.looseDilatedBits) / target.inkCount
    : 0;
  const looseOverlapFScore =
    looseInputCover + looseTargetCover > 0
      ? ((1 + beta2) * looseInputCover * looseTargetCover) /
        (beta2 * looseInputCover + looseTargetCover)
      : 0;
  const looseOverlapDiff = 1 - looseOverlapFScore;

  return (
    overlapDiff * 0.22 +
    looseOverlapDiff * 0.08 +
    pixelDiff * 0.08 +
    projDiff * 0.08 +
    densityDiff * 0.05 +
    centerDiff * 0.06 +
    orientDiff * 0.06 +
    aspectDiff * 0.04 +
    edgeDiff * 0.08 +
    holeDiff * 0.06 +
    rowPeakDiff * 0.09 +
    colPeakDiff * 0.04 +
    rowStrongDiff * 0.08 +
    colStrongDiff * 0.04 +
    hBandDiff * 0.11 +
    vBandDiff * 0.03 +
    hRunDiff * 0.04 +
    vRunDiff * 0.04
  );
}

function getStrokeOrientationVector(
  orientation: Float32Array,
  totalLength: number
): Float32Array | null {
  if (totalLength <= 0) {
    return null;
  }
  const vector = new Float32Array(4);
  for (let i = 0; i < 4; i += 1) {
    vector[i] = orientation[i] / totalLength;
  }
  return normalizeVector(vector);
}

export function KanjiDrawSearch({ items, initialQuery = "", level }: Props) {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointerActiveRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const strokeStartPointRef = useRef<{ x: number; y: number } | null>(null);
  const strokeOrientationRef = useRef<Float32Array>(new Float32Array(4));
  const strokeDirectionCountRef = useRef<Int32Array>(new Int32Array(4));
  const strokeTotalLengthRef = useRef(0);
  const recognizeTimerRef = useRef<number | null>(null);
  const glyphSignatureCacheRef = useRef<Map<string, Signature[]>>(new Map());
  const [query, setQuery] = useState(initialQuery);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [hasDrawing, setHasDrawing] = useState(false);
  const [drawnStrokeCount, setDrawnStrokeCount] = useState(0);

  const uniqueCharacters = useMemo(() => {
    const map = new Map<string, KanjiLookupItem>();
    for (const item of items) {
      if (!item.character) {
        continue;
      }
      if (!map.has(item.character)) {
        map.set(item.character, item);
      }
    }
    return Array.from(map.values());
  }, [items]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    drawGuide(ctx, canvas.width, canvas.height);
    ctx.strokeStyle = "#111827";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 8;
  }, []);

  useEffect(() => {
    if (hasDrawing) {
      runRecognition();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => {
    return () => {
      if (recognizeTimerRef.current) {
        window.clearTimeout(recognizeTimerRef.current);
      }
    };
  }, []);

  function getCanvasContext(): CanvasRenderingContext2D | null {
    const canvas = canvasRef.current;
    if (!canvas) {
      return null;
    }
    return canvas.getContext("2d");
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    const ctx = getCanvasContext();
    if (!canvas || !ctx) {
      return;
    }
    drawGuide(ctx, canvas.width, canvas.height);
    ctx.strokeStyle = "#111827";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 8;
    ctx.globalAlpha = 1;
    if (recognizeTimerRef.current) {
      window.clearTimeout(recognizeTimerRef.current);
      recognizeTimerRef.current = null;
    }
    strokeOrientationRef.current = new Float32Array(4);
    strokeDirectionCountRef.current = new Int32Array(4);
    strokeTotalLengthRef.current = 0;
    strokeStartPointRef.current = null;
    setCandidates([]);
    setHasDrawing(false);
    setDrawnStrokeCount(0);
  }

  function getGlyphSignatures(char: string): Signature[] {
    const cached = glyphSignatureCacheRef.current.get(char);
    if (cached) {
      return cached;
    }
    const signatures = buildGlyphSignatures(char);
    glyphSignatureCacheRef.current.set(char, signatures);
    return signatures;
  }

  function runRecognition() {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const input = signatureFromCanvas(canvas);
    if (input.inkRatio < 0.0035) {
      setCandidates([]);
      setHasDrawing(false);
      return;
    }

    setHasDrawing(true);
    const strokeOrientation = getStrokeOrientationVector(
      strokeOrientationRef.current,
      strokeTotalLengthRef.current
    );
    const maxStroke =
      drawnStrokeCount <= 1 ? 14 : drawnStrokeCount === 2 ? 18 : drawnStrokeCount + 18;
    const constrained = uniqueCharacters.filter((item) => {
      if (drawnStrokeCount <= 0 || item.strokeCount <= 0) {
        return true;
      }
      return item.strokeCount <= maxStroke;
    });
    const candidatesPool = constrained.length > 0 ? constrained : uniqueCharacters;

    const coarseScored = candidatesPool
      .map((item) => ({
        item,
        coarseScore: Math.min(
          ...getGlyphSignatures(item.character).map((signature) =>
            compareCoarseSignature(input, signature, strokeOrientation ?? undefined)
          )
        ),
      }))
      .sort((a, b) => a.coarseScore - b.coarseScore)
      .slice(0, Math.min(240, Math.max(90, Math.floor(candidatesPool.length * 0.35))));

    const scored = coarseScored
      .map((item) => ({
        item: item.item,
        score: (() => {
          const signatures = getGlyphSignatures(item.item.character);
          let bestSignature = signatures[0];
          let score = Number.POSITIVE_INFINITY;
          for (const signature of signatures) {
            const signatureScore = compareSignature(
              input,
              signature,
              strokeOrientation ?? undefined
            );
            if (signatureScore < score) {
              score = signatureScore;
              bestSignature = signature;
            }
          }

          if (drawnStrokeCount > 0 && item.item.strokeCount > 0) {
            const strokeGap = Math.abs(item.item.strokeCount - drawnStrokeCount);
            if (item.item.strokeCount >= drawnStrokeCount) {
              const ratio = strokeGap / Math.max(8, item.item.strokeCount);
              const weight = drawnStrokeCount <= 3 ? 0.02 : 0.05;
              score += ratio * weight;
            } else {
              // Allow user to split one logical stroke into many short strokes.
              const ratio = strokeGap / Math.max(5, drawnStrokeCount);
              const weight = drawnStrokeCount <= 4 ? 0.03 : 0.06;
              score += Math.min(0.06, ratio * weight);
            }

            if (drawnStrokeCount <= 2 && item.item.strokeCount >= 14) {
              score += 0.06;
            }
          }

          const strokeDirections = strokeDirectionCountRef.current;
          const inputHStrokes = Math.min(4, strokeDirections[0]);
          const inputVStrokes = Math.min(4, strokeDirections[1]);
          const inputDStrokes = Math.min(4, strokeDirections[2] + strokeDirections[3]);
          const targetHBands = Math.min(4, bestSignature.horizontalBandCount);
          const targetVBands = Math.min(4, bestSignature.verticalBandCount);
          const targetDiagBias = bestSignature.orientation[2] + bestSignature.orientation[3];
          const strokeLineDiff =
            Math.abs(inputHStrokes - targetHBands) / 4 +
            Math.abs(inputVStrokes - targetVBands) / 4;
          score += strokeLineDiff * 0.08;

          const horizontalPatternInput =
            input.horizontalBandCount >= 3 && input.maxHorizontalRunRatio >= 0.42;
          const verticalCoreInput =
            input.verticalBandCount >= 1 && input.maxVerticalRunRatio >= 0.3;

          if (horizontalPatternInput && verticalCoreInput) {
            const targetLooksLikeHandFamily =
              bestSignature.horizontalBandCount >= 3 &&
              bestSignature.verticalBandCount >= 1 &&
              bestSignature.maxHorizontalRunRatio >= 0.34;
            if (targetLooksLikeHandFamily) {
              score -= 0.16;
            } else {
              score += 0.13;
            }
          }

          if (inputHStrokes >= 3 && targetHBands <= 2) {
            score += 0.09;
          }
          if (inputDStrokes <= 1 && targetDiagBias >= 0.34) {
            score += 0.07;
          }

          return score;
        })(),
      }))
      .sort((a, b) => a.score - b.score)
      .slice(0, drawnStrokeCount <= 2 ? 10 : 8)
      .map((entry) => ({
        char: entry.item.character,
        score: entry.score,
      }));

    setCandidates(scored);
  }

  function scheduleRecognition() {
    if (recognizeTimerRef.current) {
      window.clearTimeout(recognizeTimerRef.current);
    }
    recognizeTimerRef.current = window.setTimeout(() => {
      runRecognition();
    }, 180);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const ctx = getCanvasContext();
    if (!canvas || !ctx) {
      return;
    }
    pointerActiveRef.current = true;
    setHasDrawing(true);
    setDrawnStrokeCount((prev) => prev + 1);
    const point = getCanvasPoint(canvas, event);
    lastPointRef.current = point;
    strokeStartPointRef.current = point;
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 9;
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    canvas.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!pointerActiveRef.current) {
      return;
    }
    const canvas = canvasRef.current;
    const ctx = getCanvasContext();
    if (!canvas || !ctx || !lastPointRef.current) {
      return;
    }
    const point = getCanvasPoint(canvas, event);
    const dx = point.x - lastPointRef.current.x;
    const dy = point.y - lastPointRef.current.y;
    const segmentLength = Math.hypot(dx, dy);
    if (segmentLength > 0) {
      strokeTotalLengthRef.current += segmentLength;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      if (absY <= absX * 0.5) {
        strokeOrientationRef.current[0] += segmentLength; // horizontal
      } else if (absX <= absY * 0.5) {
        strokeOrientationRef.current[1] += segmentLength; // vertical
      } else if (dx * dy > 0) {
        strokeOrientationRef.current[2] += segmentLength; // down-right
      } else {
        strokeOrientationRef.current[3] += segmentLength; // up-right
      }
    }
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastPointRef.current = point;
    scheduleRecognition();
  }

  function endDrawing(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (canvas && canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }

    const start = strokeStartPointRef.current;
    const end = lastPointRef.current;
    if (start && end) {
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const length = Math.hypot(dx, dy);
      if (length >= 14) {
        const absX = Math.abs(dx);
        const absY = Math.abs(dy);
        if (absY <= absX * 0.5) {
          strokeDirectionCountRef.current[0] += 1; // horizontal
        } else if (absX <= absY * 0.5) {
          strokeDirectionCountRef.current[1] += 1; // vertical
        } else if (dx * dy > 0) {
          strokeDirectionCountRef.current[2] += 1; // down-right
        } else {
          strokeDirectionCountRef.current[3] += 1; // up-right
        }
      }
    }

    pointerActiveRef.current = false;
    strokeStartPointRef.current = null;
    lastPointRef.current = null;
    scheduleRecognition();
  }

  function buildKanjiHref(rawQuery: string): string {
    const trimmed = rawQuery.trim();
    const params = new URLSearchParams();
    if (level) {
      params.set("level", level);
    }
    if (trimmed) {
      params.set("q", trimmed);
    }
    const queryString = params.toString();
    return queryString ? `/kanji?${queryString}` : "/kanji";
  }

  function buildKanjiLearnHref(rawQuery: string): string {
    const trimmed = rawQuery.trim();
    const params = new URLSearchParams();
    if (level) {
      params.set("level", level);
    }
    if (trimmed) {
      params.set("q", trimmed);
    }
    const queryString = params.toString();
    return queryString ? `/kanji/learn?${queryString}` : "/kanji/learn";
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push(buildKanjiHref(query), { scroll: false });
  }

  function searchByCandidate(char: string) {
    setQuery(char);
    router.push(buildKanjiHref(char), { scroll: false });
  }

  function learnByCandidate(char: string) {
    setQuery(char);
    router.push(buildKanjiLearnHref(char));
  }

  return (
    <div className="panel grid gap-4 p-4 sm:p-5 lg:grid-cols-[1.15fr_1fr]">
      <div>
        <h2 className="text-2xl font-extrabold text-slate-800">Tim kiem Kanji</h2>
        <form onSubmit={submitSearch} className="mt-3 flex gap-2">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="input-base"
            placeholder="Nhap kanji, nghia, am On/Kun"
          />
          <button type="submit" className="btn-primary shrink-0">
            Tim
          </button>
        </form>

        <h3 className="mt-4 text-lg font-semibold text-slate-800">Hoac ve Kanji</h3>
        <div className="mt-2 overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-[0_10px_30px_rgba(24,76,146,0.08)]">
          <canvas
            ref={canvasRef}
            className="h-[280px] w-full touch-none bg-slate-50"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrawing}
            onPointerLeave={(event) => {
              if (pointerActiveRef.current) {
                endDrawing(event);
              }
            }}
          />
        </div>
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-semibold text-rose-700 hover:-translate-y-0.5 hover:bg-rose-100"
            onClick={clearCanvas}
          >
            Xoa net
          </button>
          <button
            type="button"
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:-translate-y-0.5 hover:bg-slate-50"
            onClick={runRecognition}
          >
            Nhan dien ngay
          </button>
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-extrabold text-slate-800">Goi y tu net ve</h2>
        <p className="mt-1 text-sm text-slate-500">
          Ve cang ro tung net thi ket qua cang chinh xac.
        </p>
        <p className="mt-1 text-sm font-semibold text-sky-700">
          So net da ve: {drawnStrokeCount}
        </p>
        <p className="mt-1 text-xs text-slate-500">Goi y duoc sap xep theo do giong cao den thap.</p>
        {candidates.length > 0 ? (
          <button
            type="button"
            className="mt-2 rounded-xl border border-emerald-300 bg-emerald-100 px-3 py-1.5 text-sm font-semibold text-emerald-800 hover:-translate-y-0.5 hover:bg-emerald-200"
            onClick={() => {
              const top = candidates[0];
              if (!top) {
                return;
              }
              learnByCandidate(top.char);
            }}
          >
            Hoc Flashcard tu net ve (Top 1)
          </button>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-2">
          {candidates.map((candidate, index) => (
            <div
              key={candidate.char}
              className={`inline-flex items-center gap-1 rounded-xl border px-2 py-1 transition ${
                index === 0
                  ? "border-emerald-300 bg-emerald-100 shadow-[0_8px_20px_rgba(16,185,129,0.18)]"
                  : "border-blue-200 bg-blue-50"
              }`}
            >
              <button
                type="button"
                className={`text-lg font-bold ${
                  index === 0 ? "text-emerald-800" : "text-blue-700"
                }`}
                onClick={() => searchByCandidate(candidate.char)}
              >
                {candidate.char}
                {index === 0 ? <span className="ml-2 text-xs font-semibold">Top 1</span> : null}
              </button>
              <button
                type="button"
                className={`rounded-lg px-2 py-0.5 text-xs font-semibold ${
                  index === 0
                    ? "bg-emerald-200 text-emerald-900 hover:bg-emerald-300"
                    : "bg-blue-100 text-blue-800 hover:bg-blue-200"
                }`}
                onClick={() => learnByCandidate(candidate.char)}
              >
                Flash
              </button>
            </div>
          ))}
          {hasDrawing && candidates.length === 0 ? (
            <span className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm text-amber-700">
              Chua nhan dien duoc, thu ve lai nhe.
            </span>
          ) : null}
          {!hasDrawing ? (
            <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-600">
              Chua co net ve.
            </span>
          ) : null}
        </div>

        <div className="mt-4 rounded-2xl border border-blue-100 bg-gradient-to-br from-white to-blue-50/80 p-3">
          <p className="text-sm font-semibold text-slate-700">Meo ve</p>
          <ul className="mt-1 space-y-1 text-sm text-slate-600">
            <li>- Ve lon, nam giua khung</li>
            <li>- Ve tung net ro rang, dung chong qua nhieu</li>
            <li>- Neu sai, bam Xoa net va thu lai</li>
            <li>- Ve du cac bo phan cua chu (vi du: 安 can du ca 宀 va 女)</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
