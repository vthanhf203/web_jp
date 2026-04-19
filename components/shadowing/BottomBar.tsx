"use client";

import { useMemo, type MouseEvent } from "react";

import type { Segment } from "@/types/shadowing";

import styles from "./BottomBar.module.css";

interface BottomBarProps {
  currentTime: number;
  duration: number;
  isShadowingMode: boolean;
  playbackRate: number;
  isLooping: boolean;
  currentSegment: Segment | null;
  onSeek: (t: number) => void;
  onToggleShadowing: () => void;
  onSetPlaybackRate: (r: number) => void;
  onToggleLoop: () => void;
  onPrevSegment: () => void;
  onNextSegment: () => void;
}

const SPEED_STEPS = [0.5, 0.75, 1] as const;

function findNextRate(rate: number): number {
  const index = SPEED_STEPS.findIndex((value) => value === rate);
  if (index === -1) {
    return 1;
  }
  return SPEED_STEPS[(index + 1) % SPEED_STEPS.length] ?? 1;
}

function safePercent(currentTime: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) {
    return 0;
  }
  const ratio = currentTime / duration;
  return Math.min(100, Math.max(0, ratio * 100));
}

export default function BottomBar({
  currentTime,
  duration,
  isShadowingMode,
  playbackRate,
  isLooping,
  currentSegment,
  onSeek,
  onToggleShadowing,
  onSetPlaybackRate,
  onToggleLoop,
  onPrevSegment,
  onNextSegment,
}: BottomBarProps) {
  const progressPercent = useMemo(() => safePercent(currentTime, duration), [currentTime, duration]);

  const handleProgressClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!duration || duration <= 0) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    onSeek(ratio * duration);
  };

  const handleCycleRate = () => {
    onSetPlaybackRate(findNextRate(playbackRate));
  };

  return (
    <div className={styles.bar}>
      <div className={styles.progressRow} onClick={handleProgressClick} role="slider" aria-valuenow={progressPercent}>
        <div className={styles.progressFill} style={{ width: `${progressPercent}%` }} />
      </div>

      <div className={styles.controls}>
        <div className={styles.leftButtons}>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={() => {
              if (currentSegment) {
                onSeek(currentSegment.start);
              }
            }}
          >
            <span>📌</span>
            <small>Gim</small>
          </button>

          <button
            type="button"
            className={styles.iconBtn}
            onClick={() => {
              if (currentSegment) {
                onSeek(currentSegment.start);
              }
            }}
          >
            <span>💡</span>
            <small>Giai</small>
          </button>

          <button
            type="button"
            className={`${styles.iconBtn} ${isLooping ? styles.iconBtnActive : ""}`}
            onClick={onToggleLoop}
          >
            <span>🔁</span>
            <small>Lap</small>
          </button>

          <button type="button" className={`${styles.iconBtn} ${styles.speedBtn}`} onClick={handleCycleRate}>
            <span>⚡</span>
            <small>{playbackRate}x</small>
          </button>
        </div>

        <div className={styles.centerButtons}>
          <button type="button" className={styles.navBtn} onClick={onPrevSegment}>
            ← Cau truoc
          </button>

          <button
            type="button"
            className={`${styles.shadowBtn} ${isShadowingMode ? styles.shadowBtnActive : ""}`}
            onClick={onToggleShadowing}
          >
            {isShadowingMode ? "🎤 Dang nhai" : "Shadowing"}
          </button>

          <button type="button" className={styles.navBtn} onClick={onNextSegment}>
            Cau tiep →
          </button>
        </div>
      </div>
    </div>
  );
}
