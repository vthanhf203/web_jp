"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { AUDIO_RATE_KEY, AUDIO_VOICE_KEY } from "@/app/components/audio-settings-client";
import styles from "@/components/GrammarDetail.module.css";

export type GrammarExample = {
  japanese: string;
  translation: string;
};

export interface GrammarDetailProps {
  order: number;
  title: string;
  meaning: string;
  usage: string[];
  examples: GrammarExample[];
  notes?: string[];
  initialBookmarked?: boolean;
  onQuizStart?: () => void;
  quizHref?: string;
}

const KANJI_FURIGANA_PATTERN =
  /([\u4e00-\u9fff々〆ヶ]+)[（(]([\u3041-\u3096\u30a1-\u30faー・]+)[)）]/g;

const preferredVoiceKeywords = [
  "haruka online",
  "nanami online",
  "otoya online",
  "natural",
  "microsoft",
  "google",
  "japanese",
  "nihongo",
  "nanami",
  "haruka",
];
const SPEAK_DELAY_MS = 70;
const CLICK_GUARD_MS = 280;

function pickJapaneseVoice(voices: SpeechSynthesisVoice[], preferredName: string): SpeechSynthesisVoice | null {
  const jpVoices = voices.filter((voice) => voice.lang.toLowerCase().startsWith("ja"));
  if (jpVoices.length === 0) {
    return null;
  }

  if (preferredName) {
    const selected = jpVoices.find((voice) => voice.name === preferredName);
    if (selected) {
      return selected;
    }
  }

  const preferred = jpVoices.find((voice) => {
    const lowerName = voice.name.toLowerCase();
    return preferredVoiceKeywords.some((keyword) => lowerName.includes(keyword));
  });

  return preferred ?? jpVoices[0] ?? null;
}

function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function withRuby(input: string): string {
  if (!input) {
    return "";
  }

  const escaped = escapeHtml(input);
  return escaped.replace(KANJI_FURIGANA_PATTERN, (_match, kanji: string, reading: string) => {
    return `<ruby>${kanji}<rt>${reading}</rt></ruby>`;
  });
}

export default function GrammarDetail({
  order,
  title,
  meaning,
  usage,
  examples,
  notes = [],
  initialBookmarked = false,
  onQuizStart,
  quizHref,
}: GrammarDetailProps) {
  const router = useRouter();
  const [bookmarked, setBookmarked] = useState<boolean>(initialBookmarked);
  const lastSpeakRef = useRef<{ text: string; at: number }>({ text: "", at: 0 });
  const speakTimerRef = useRef<number | null>(null);

  const normalizedExamples = useMemo(
    () =>
      examples
        .map((example) => ({
          japanese: example.japanese.trim(),
          translation: example.translation.trim(),
        }))
        .filter((example) => Boolean(example.japanese || example.translation)),
    [examples]
  );

  useEffect(() => {
    return () => {
      if (speakTimerRef.current !== null && typeof window !== "undefined") {
        window.clearTimeout(speakTimerRef.current);
        speakTimerRef.current = null;
      }
    };
  }, []);

  const speakJapanese = useCallback((text: string) => {
    const value = text.trim();
    if (!value || typeof window === "undefined" || typeof window.speechSynthesis === "undefined") {
      return;
    }

    const now = Date.now();
    if (lastSpeakRef.current.text === value && now - lastSpeakRef.current.at < CLICK_GUARD_MS) {
      return;
    }
    lastSpeakRef.current = { text: value, at: now };

    const synth = window.speechSynthesis;
    if (speakTimerRef.current !== null) {
      window.clearTimeout(speakTimerRef.current);
      speakTimerRef.current = null;
    }

    synth.cancel();

    const savedRate = Number(window.localStorage.getItem(AUDIO_RATE_KEY) ?? "0.95");
    const rate = Number.isFinite(savedRate) ? Math.min(1.25, Math.max(0.75, savedRate)) : 0.95;
    const preferredVoiceName = window.localStorage.getItem(AUDIO_VOICE_KEY) ?? "";

    speakTimerRef.current = window.setTimeout(() => {
      const utterance = new SpeechSynthesisUtterance(value);
      utterance.lang = "ja-JP";
      utterance.rate = rate;
      utterance.pitch = 1;

      const selectedVoice = pickJapaneseVoice(synth.getVoices(), preferredVoiceName);
      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }

      synth.speak(utterance);
      speakTimerRef.current = null;
    }, SPEAK_DELAY_MS);
  }, []);

  const handleQuizStart = useCallback(() => {
    if (onQuizStart) {
      onQuizStart();
      return;
    }

    if (quizHref) {
      router.push(quizHref);
    }
  }, [onQuizStart, quizHref, router]);

  return (
    <article className={styles.card}>
      <header className={styles.header}>
        <div className={styles.titleWrap}>
          <span className={styles.order}>{order}</span>
          <h3 className={styles.title}>{title}</h3>
        </div>

        <button
          type="button"
          className={`${styles.bookmarkButton} ${bookmarked ? styles.bookmarkActive : ""}`}
          onClick={() => setBookmarked((prev) => !prev)}
          aria-pressed={bookmarked}
          aria-label={bookmarked ? "Bỏ bookmark" : "Bookmark mẫu này"}
        >
          <svg className={styles.bookmarkIcon} viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 4.5h12a1 1 0 011 1V21l-7-4-7 4V5.5a1 1 0 011-1z" />
          </svg>
          {bookmarked ? "Đã lưu" : "Bookmark"}
        </button>
      </header>

      <section className={styles.block}>
        <p className={styles.blockTitle}>Ý nghĩa</p>
        <p className={styles.meaning}>{meaning}</p>
      </section>

      {usage.length > 0 ? (
        <section className={styles.block}>
          <p className={styles.blockTitle}>Cách dùng</p>
          <ul className={styles.usageList}>
            {usage.map((line, index) => (
              <li key={`usage-${index}`}>{line}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {normalizedExamples.length > 0 ? (
        <section>
          <p className={styles.blockTitle}>Vi du</p>
          <div className={styles.examples}>
            {normalizedExamples.map((example, index) => (
              <article key={`example-${index}`} className={styles.exampleCard}>
                <div className={styles.exampleTop}>
                  <p
                    className={styles.jpText}
                    dangerouslySetInnerHTML={{ __html: withRuby(example.japanese) }}
                  />
                  <button
                    type="button"
                    className={styles.speakButton}
                    onClick={() => speakJapanese(example.japanese)}
                    aria-label="Phat am cau tieng Nhat"
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
                      <path
                        d="M11 6l-4 3H4v6h3l4 3V6zm4.5 2.5a5 5 0 010 7m2-9.5a8 8 0 010 12"
                        stroke="currentColor"
                        strokeWidth="1.9"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>
                {example.translation ? <p className={styles.viText}>{example.translation}</p> : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {notes.length > 0 ? (
        <section className={styles.block}>
          <p className={styles.blockTitle}>Chú ý</p>
          <ul className={styles.notesList}>
            {notes.map((line, index) => (
              <li key={`note-${index}`}>{line}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <button
        type="button"
        onClick={handleQuizStart}
        className={styles.quizButton}
        disabled={!onQuizStart && !quizHref}
      >
        Kiểm tra nhanh
      </button>
    </article>
  );
}
