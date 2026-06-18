"use client";

import { useEffect, useState } from "react";

type ViewBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type KanjiVgData = {
  viewBox: ViewBox;
  paths: string[];
};

type GlyphProps = {
  character: string;
  className?: string;
  fallbackClassName?: string;
  strokeWidth?: number;
  title?: string;
};

type JapaneseTextProps = {
  text: string;
  className?: string;
  glyphClassName?: string;
  kanaClassName?: string;
  strokeWidth?: number;
};

const KANJIVG_BASE_URL = "https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji";
const DEFAULT_VIEW_BOX: ViewBox = { x: 0, y: 0, width: 109, height: 109 };
const cache = new Map<string, Promise<KanjiVgData>>();

function isKanjiChar(char: string): boolean {
  return /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(char);
}

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
    return Promise.reject(new Error("Cannot resolve KanjiVG file name."));
  }
  const cached = cache.get(fileName);
  if (cached) {
    return cached;
  }

  const promise = fetch(`${KANJIVG_BASE_URL}/${fileName}`)
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`KanjiVG returned ${response.status}`);
      }
      return response.text();
    })
    .then((svgText) => {
      const documentSvg = new DOMParser().parseFromString(svgText, "image/svg+xml");
      const svg = documentSvg.querySelector("svg");
      const paths = Array.from(documentSvg.querySelectorAll("path[d]"))
        .map((path) => path.getAttribute("d")?.trim() ?? "")
        .filter(Boolean);

      if (paths.length === 0) {
        throw new Error("KanjiVG has no paths for this character.");
      }

      return {
        viewBox: parseViewBox(svg?.getAttribute("viewBox") ?? null),
        paths,
      };
    });

  cache.set(fileName, promise);
  return promise;
}

export function HandwrittenKanjiGlyph({
  character,
  className = "h-16 w-16",
  fallbackClassName = "font-kanji text-5xl font-semibold leading-none",
  strokeWidth = 4.35,
  title,
}: GlyphProps) {
  const [data, setData] = useState<KanjiVgData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setData(null);
    setFailed(false);

    loadKanjiVg(character)
      .then((nextData) => {
        if (alive) {
          setData(nextData);
        }
      })
      .catch(() => {
        if (alive) {
          setFailed(true);
        }
      });

    return () => {
      alive = false;
    };
  }, [character]);

  if (!data || failed) {
    return (
      <span lang="ja" className={fallbackClassName} title={title || character}>
        {character}
      </span>
    );
  }

  const viewBox = data.viewBox;
  return (
    <svg
      lang="ja"
      role="img"
      aria-label={title || character}
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

export function HandwrittenJapaneseText({
  text,
  className = "",
  glyphClassName = "h-[1.45em] w-[1.45em]",
  kanaClassName = "font-kanji leading-none",
  strokeWidth = 4.35,
}: JapaneseTextProps) {
  return (
    <span lang="ja" className={`inline-flex flex-wrap items-center gap-x-0.5 gap-y-1 align-middle ${className}`}>
      {Array.from(text).map((char, index) =>
        isKanjiChar(char) ? (
          <HandwrittenKanjiGlyph
            key={`${char}-${index}`}
            character={char}
            className={`${glyphClassName} inline-block text-current`}
            fallbackClassName={`${kanaClassName} inline-block`}
            strokeWidth={strokeWidth}
          />
        ) : (
          <span key={`${char}-${index}`} className={kanaClassName}>
            {char}
          </span>
        )
      )}
    </span>
  );
}
