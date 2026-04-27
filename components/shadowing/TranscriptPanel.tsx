"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { cacheGet, cacheSet } from "@/lib/cache";
import { useShadowingStore } from "@/store/shadowingStore";
import type { FuriganaResponse, FuriganaWord, Segment } from "@/types/shadowing";

import styles from "./TranscriptPanel.module.css";

type TranscriptPanelProps = {
  onSeek: (seconds: number, index?: number) => void;
};

type TranslateResponse = {
  translation?: string;
  message?: string;
};

type FuriganaApiResponse = FuriganaResponse & { message?: string };

const EMPTY_WORDS: FuriganaWord[] = [];

function toTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const min = Math.floor(safe / 60);
  const sec = String(safe % 60).padStart(2, "0");
  return `${min}:${sec}`;
}

function hasJapaneseText(text: string): boolean {
  return /[\u3040-\u30ff\u4e00-\u9fff]/.test(text);
}

function buildTranslationKey(segment: Segment): string {
  return `tl-${segment.id}-${encodeURIComponent(segment.text.slice(0, 80))}`;
}

function buildFuriganaKey(segment: Segment): string {
  return `fg-${segment.id}-${encodeURIComponent(segment.text.slice(0, 80))}`;
}

function renderSegmentText(segment: Segment, words: FuriganaWord[]): ReactNode {
  if (!words.length) {
    return <>{segment.text}</>;
  }

  return (
    <>
      {words.map((word, index) => {
        const text = (word.text || "").trim();
        const furigana = (word.furigana || "").trim();
        if (!text) {
          return null;
        }

        if (!furigana || furigana === text) {
          return (
            <span key={`${segment.id}-plain-${index}`} className={styles.rubyChunk}>
              {text}
            </span>
          );
        }

        return (
          <ruby key={`${segment.id}-ruby-${index}`} className={styles.rubyWord}>
            {text}
            <rt className={styles.furigana}>{furigana}</rt>
          </ruby>
        );
      })}
    </>
  );
}

export default function TranscriptPanel({ onSeek }: TranscriptPanelProps) {
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const loadingTranslationRef = useRef<Set<string>>(new Set());
  const loadingFuriganaRef = useRef<Set<string>>(new Set());
  const translationsRef = useRef<Record<string, string>>({});
  const furiganaRef = useRef<Record<string, FuriganaWord[]>>({});

  const segments = useShadowingStore((state) => state.segments);
  const currentIndex = useShadowingStore((state) => state.currentIndex);
  const isShadowingMode = useShadowingStore((state) => state.isShadowingMode);

  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [furiganaByKey, setFuriganaByKey] = useState<Record<string, FuriganaWord[]>>({});
  const [loadingTranslationKeys, setLoadingTranslationKeys] = useState<Record<string, boolean>>({});
  const [translateError, setTranslateError] = useState("");

  useEffect(() => {
    translationsRef.current = translations;
  }, [translations]);

  useEffect(() => {
    furiganaRef.current = furiganaByKey;
  }, [furiganaByKey]);

  const ensureTranslation = useCallback(
    async (segment: Segment) => {
      const key = buildTranslationKey(segment);
      if (key in translationsRef.current || loadingTranslationRef.current.has(key)) {
        return;
      }

      if (!hasJapaneseText(segment.text)) {
        setTranslations((prev) => ({ ...prev, [key]: "" }));
        return;
      }

      const cached = cacheGet<string>(key);
      if (cached !== null) {
        setTranslations((prev) => ({ ...prev, [key]: cached }));
        return;
      }

      loadingTranslationRef.current.add(key);
      setLoadingTranslationKeys((prev) => ({ ...prev, [key]: true }));

      try {
        const res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: segment.text }),
        });

        const data = (await res.json()) as TranslateResponse;
        if (!res.ok) {
          throw new Error(data?.message || "Không dịch được");
        }

        const value = (data.translation ?? "").trim();
        setTranslations((prev) => ({ ...prev, [key]: value }));
        cacheSet(key, value);
        if (translateError) {
          setTranslateError("");
        }
      } catch (error) {
        const message = error instanceof Error ? error.message.trim() : "";
        if (message && !translateError) {
          setTranslateError(message);
        }
        setTranslations((prev) => ({ ...prev, [key]: "" }));
        cacheSet(key, "");
      } finally {
        loadingTranslationRef.current.delete(key);
        setLoadingTranslationKeys((prev) => ({ ...prev, [key]: false }));
      }
    },
    [translateError]
  );

  const ensureFurigana = useCallback(async (segment: Segment) => {
    const key = buildFuriganaKey(segment);
    if (key in furiganaRef.current || loadingFuriganaRef.current.has(key)) {
      return;
    }

    if (!hasJapaneseText(segment.text)) {
      setFuriganaByKey((prev) => ({
        ...prev,
        [key]: [{ text: segment.text, furigana: "", romaji: "" }],
      }));
      return;
    }

    const cached = cacheGet<FuriganaWord[]>(key);
    if (cached && cached.length > 0) {
      setFuriganaByKey((prev) => ({ ...prev, [key]: cached }));
      return;
    }

    loadingFuriganaRef.current.add(key);
    try {
      const res = await fetch("/api/furigana", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: segment.text }),
      });

      const data = (await res.json()) as FuriganaApiResponse;
      if (!res.ok) {
        throw new Error(data?.message || "Furigana failed");
      }

      const words = Array.isArray(data.words) && data.words.length > 0 ? data.words : EMPTY_WORDS;
      const safeWords = words.length > 0 ? words : [{ text: segment.text, furigana: "", romaji: "" }];
      setFuriganaByKey((prev) => ({ ...prev, [key]: safeWords }));
      cacheSet(key, safeWords);
    } catch {
      const fallback = [{ text: segment.text, furigana: "", romaji: "" }];
      setFuriganaByKey((prev) => ({ ...prev, [key]: fallback }));
      cacheSet(key, fallback);
    } finally {
      loadingFuriganaRef.current.delete(key);
    }
  }, []);

  const centerCurrentSegment = useCallback(
    (behavior: ScrollBehavior = "auto") => {
      const container = scrollAreaRef.current;
      const current = itemRefs.current[currentIndex];
      if (!container || !current) {
        return;
      }

      const targetTop = Math.max(
        0,
        current.offsetTop - (container.clientHeight - current.offsetHeight) / 2
      );
      const maxTop = Math.max(0, container.scrollHeight - container.clientHeight);
      const safeTop = Math.min(maxTop, targetTop);

      if (Math.abs(container.scrollTop - safeTop) < 2) {
        return;
      }
      container.scrollTo({ top: safeTop, behavior });
    },
    [currentIndex]
  );

  useEffect(() => {
    centerCurrentSegment("auto");
    const rafId = requestAnimationFrame(() => {
      centerCurrentSegment("auto");
    });
    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [centerCurrentSegment]);

  useEffect(() => {
    if (segments.length === 0) {
      return;
    }

    const start = Math.max(0, currentIndex - 2);
    const end = Math.min(segments.length - 1, currentIndex + 4);
    for (let index = start; index <= end; index += 1) {
      const segment = segments[index];
      if (!segment) {
        continue;
      }
      void ensureTranslation(segment);
      void ensureFurigana(segment);
    }
  }, [currentIndex, ensureFurigana, ensureTranslation, segments]);

  return (
    <section className={styles.panel}>
      <header className={styles.header}>
        <h2 className={styles.title}>Transcript</h2>
        <p className={styles.count}>{segments.length} câu</p>
      </header>

      {translateError ? (
        <p className={styles.notice}>Dịch nghĩa tạm thời chưa sẵn sàng: {translateError}</p>
      ) : null}

      <div ref={scrollAreaRef} className={styles.scrollArea}>
        {segments.length === 0 ? <p className={styles.empty}>Chưa có subtitle.</p> : null}

        {segments.map((segment, index) => {
          const active = index === currentIndex;
          const translationKey = buildTranslationKey(segment);
          const furiganaKey = buildFuriganaKey(segment);
          const isLoadingTranslation = !!loadingTranslationKeys[translationKey];
          const translation = translations[translationKey] ?? "";
          const furiganaWords = furiganaByKey[furiganaKey] ?? EMPTY_WORDS;

          return (
            <div
              key={segment.id}
              ref={(node) => {
                itemRefs.current[index] = node;
              }}
              className={`${styles.segment} ${active ? styles.segmentActive : ""}`}
              onClick={() => onSeek(segment.start, index)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSeek(segment.start, index);
                }
              }}
              onMouseEnter={() => {
                void ensureTranslation(segment);
                void ensureFurigana(segment);
              }}
            >
              <div className={styles.segmentTop}>
                <span className={styles.timeBadge}>{toTime(segment.start)}</span>
                <button
                  type="button"
                  className={styles.replayButton}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSeek(segment.start, index);
                  }}
                  aria-label="Phát lại câu này"
                >
                  Replay
                </button>
              </div>

              <p className={styles.text}>{renderSegmentText(segment, furiganaWords)}</p>
              <p className={styles.translation}>
                {isLoadingTranslation ? "Đang dịch..." : translation || " "}
              </p>

              {active && isShadowingMode ? <span className={styles.shadowingBadge}>Nhại lại</span> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
