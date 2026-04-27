"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
  /([\u4e00-\u9fff々〆ヶ]+)[（(]([\u3041-\u3096\u30a1-\u30fa\u30fc\u30fb]+)[)）]/g;

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

  const speakJapanese = useCallback((text: string) => {
    if (typeof window === "undefined" || typeof window.speechSynthesis === "undefined") {
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ja-JP";
    utterance.rate = 1;
    utterance.pitch = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
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
