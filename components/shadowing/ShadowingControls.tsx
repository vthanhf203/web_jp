"use client";

import { useMemo } from "react";

import { useShadowingStore } from "@/store/shadowingStore";

import styles from "./ShadowingControls.module.css";

type ShadowingControlsProps = {
  onPrev: () => void;
  onNext: () => void;
  onReplay: () => void;
  onApplyRate: (rate: number) => void;
  isLooping: boolean;
  onToggleLoop: () => void;
};

const SPEED_OPTIONS = [0.5, 0.75, 1] as const;

function toRateLabel(rate: number): string {
  if (Number.isInteger(rate)) {
    return `${rate.toFixed(0)}x`;
  }
  return `${rate}x`;
}

export default function ShadowingControls({
  onPrev,
  onNext,
  onReplay,
  onApplyRate,
  isLooping,
  onToggleLoop,
}: ShadowingControlsProps) {
  const isShadowingMode = useShadowingStore((state) => state.isShadowingMode);
  const playbackRate = useShadowingStore((state) => state.playbackRate);
  const currentIndex = useShadowingStore((state) => state.currentIndex);
  const segments = useShadowingStore((state) => state.segments);
  const toggleShadowingMode = useShadowingStore((state) => state.toggleShadowingMode);
  const setPlaybackRate = useShadowingStore((state) => state.setPlaybackRate);

  const currentSegment = useMemo(() => segments[currentIndex] ?? null, [currentIndex, segments]);
  const canPrev = currentIndex > 0;
  const canNext = currentIndex < segments.length - 1;

  const handleRateSelect = (rate: (typeof SPEED_OPTIONS)[number]) => {
    setPlaybackRate(rate);
    onApplyRate(rate);
  };

  return (
    <section className={styles.panel}>
      <div className={styles.topRow}>
        <label className={styles.switchRow}>
          <span className={styles.switchLabel}>Chế độ shadowing</span>
          <span className={styles.switchWrap}>
            <input
              type="checkbox"
              className={styles.switchInput}
              checked={isShadowingMode}
              onChange={toggleShadowingMode}
            />
            <span className={styles.switchSlider} aria-hidden="true" />
          </span>
        </label>

        <div className={styles.speedGroup}>
          {SPEED_OPTIONS.map((rate) => (
            <button
              key={rate}
              type="button"
              className={`${styles.speedButton} ${playbackRate === rate ? styles.speedButtonActive : ""}`}
              onClick={() => handleRateSelect(rate)}
            >
              {toRateLabel(rate)}
            </button>
          ))}
        </div>
      </div>

      {isShadowingMode ? (
        <div className={styles.shadowingBox}>
          <p className={styles.shadowingTitle}>Nhại lại câu này ^</p>
          <p className={styles.shadowingMeta}>
            {currentSegment ? `${currentIndex + 1}/${segments.length}: ${currentSegment.text}` : "Chưa có câu hiện tại."}
          </p>

          <div className={styles.navRow}>
            <button type="button" className={styles.navButton} disabled={!canPrev} onClick={onPrev}>
              {"<-"} Câu trước
            </button>
            <button type="button" className={styles.navButtonPrimary} onClick={onReplay}>
              Phát lại
            </button>
            <button type="button" className={styles.navButton} disabled={!canNext} onClick={onNext}>
              Câu tiếp {"->"}
            </button>
          </div>
        </div>
      ) : null}

      <label className={styles.loopToggle}>
        <input type="checkbox" checked={isLooping} onChange={onToggleLoop} />
        <span>Lặp câu hiện tại (A/B)</span>
      </label>
    </section>
  );
}
