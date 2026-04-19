"use client";

import { useEffect, useMemo, useState } from "react";

import { cacheGet, cacheSet } from "@/lib/cache";
import type { FuriganaResponse, FuriganaWord, Segment } from "@/types/shadowing";

import styles from "./SegmentCard.module.css";

interface SegmentCardProps {
  segment: Segment;
  isActive: boolean;
  isCompleted: boolean;
  isShadowingMode: boolean;
  onReplay: () => void;
  onSelect?: () => void;
}

type TranslateResponse = {
  translation?: string;
  message?: string;
};

const EMPTY_WORDS: FuriganaWord[] = [];

function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const min = Math.floor(safe / 60);
  const sec = String(safe % 60).padStart(2, "0");
  return `${min}:${sec}`;
}

function buildTranslationKey(segment: Segment): string {
  return `tl-${segment.id}-${segment.text.slice(0, 20)}`;
}

function buildFuriganaKey(segment: Segment): string {
  const encoded = btoa(encodeURIComponent(segment.text));
  return `fg-${encoded}`;
}

export default function SegmentCard({
  segment,
  isActive,
  isCompleted,
  isShadowingMode,
  onReplay,
  onSelect,
}: SegmentCardProps) {
  const [translation, setTranslation] = useState("");
  const [furiganaWords, setFuriganaWords] = useState<FuriganaWord[]>(EMPTY_WORDS);
  const [isLoadingTranslation, setIsLoadingTranslation] = useState(false);

  const translationKey = useMemo(() => buildTranslationKey(segment), [segment]);
  const furiganaKey = useMemo(() => buildFuriganaKey(segment), [segment]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const loadTranslation = async () => {
      const cached = cacheGet<string>(translationKey);
      if (cached) {
        setTranslation(cached);
        return;
      }

      setIsLoadingTranslation(true);
      try {
        const res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: segment.text }),
          signal: controller.signal,
        });
        const data = (await res.json()) as TranslateResponse;
        if (!res.ok) {
          throw new Error(data?.message ?? "Translate failed");
        }

        const value = (data.translation ?? "").trim();
        if (!cancelled) {
          setTranslation(value);
        }
        if (value) {
          cacheSet(translationKey, value);
        }
      } catch {
        if (!cancelled) {
          setTranslation("");
        }
      } finally {
        if (!cancelled) {
          setIsLoadingTranslation(false);
        }
      }
    };

    const loadFurigana = async () => {
      const cached = cacheGet<FuriganaWord[]>(furiganaKey);
      if (cached && cached.length > 0) {
        setFuriganaWords(cached);
        return;
      }

      try {
        const res = await fetch("/api/furigana", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: segment.text }),
          signal: controller.signal,
        });
        const data = (await res.json()) as FuriganaResponse & { message?: string };
        if (!res.ok) {
          throw new Error(data?.message ?? "Furigana failed");
        }

        const words = Array.isArray(data.words) ? data.words : EMPTY_WORDS;
        if (!cancelled) {
          setFuriganaWords(words);
        }
        if (words.length > 0) {
          cacheSet(furiganaKey, words);
        }
      } catch {
        if (!cancelled) {
          setFuriganaWords([{ text: segment.text, furigana: "", romaji: "" }]);
        }
      }
    };

    void Promise.all([loadTranslation(), loadFurigana()]);

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [furiganaKey, segment.text, translationKey]);

  const words = furiganaWords.length > 0 ? furiganaWords : [{ text: segment.text, furigana: "", romaji: "" }];

  return (
    <article
      className={[
        styles.card,
        isActive ? styles.cardActive : "",
        isCompleted ? styles.cardCompleted : "",
      ].join(" ")}
      onClick={onSelect}
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onKeyDown={
        onSelect
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect();
              }
            }
          : undefined
      }
    >
      <div className={styles.furiganaRow}>
        {words.map((word, index) => (
          <ruby key={`${segment.id}-${index}-${word.text}`} className={styles.rubyWord}>
            {word.text}
            <rt className={styles.furigana}>{word.furigana}</rt>
          </ruby>
        ))}
      </div>

      <div className={styles.romajiRow}>
        {words.map((word, index) => (
          <span key={`${segment.id}-romaji-${index}`} className={styles.romajiWord}>
            {word.romaji}
          </span>
        ))}
      </div>

      <div className={styles.translation}>
        {isLoadingTranslation ? "Dang dich..." : translation || " "}
      </div>

      <div className={styles.actionRow}>
        <div className={styles.leftActions}>
          <span className={styles.timestamp}>{formatTime(segment.start)}</span>
          {isActive && isShadowingMode ? <span className={styles.shadowingBadge}>Nhai lai</span> : null}
        </div>

        <button
          type="button"
          className={styles.replayBtn}
          onClick={(event) => {
            event.stopPropagation();
            onReplay();
          }}
        >
          Replay
        </button>
      </div>
    </article>
  );
}
