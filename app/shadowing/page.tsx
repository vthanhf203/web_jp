"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import ShadowingControls from "@/components/shadowing/ShadowingControls";
import TranscriptPanel from "@/components/shadowing/TranscriptPanel";
import UploadOrLink from "@/components/shadowing/UploadOrLink";
import VideoPlayer, { type VideoPlayerHandle } from "@/components/shadowing/VideoPlayer";
import { useShadowingStore } from "@/store/shadowingStore";

import styles from "./page.module.css";

function findClosestSegmentIndexByStart(starts: number[], target: number): number {
  if (starts.length === 0) {
    return 0;
  }

  let bestIndex = 0;
  let bestDistance = Math.abs(starts[0] - target);
  for (let i = 1; i < starts.length; i += 1) {
    const distance = Math.abs(starts[i] - target);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
  }
  return bestIndex;
}

function findSegmentIndexByTime(starts: number[], target: number): number {
  if (starts.length === 0) {
    return 0;
  }

  let left = 0;
  let right = starts.length - 1;
  let answer = 0;
  const safeTarget = Math.max(0, target + 0.02);

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const value = starts[mid] ?? 0;
    if (value <= safeTarget) {
      answer = mid;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  return answer;
}

export default function ShadowingPage() {
  const videoRef = useRef<VideoPlayerHandle | null>(null);
  const pauseGuardRef = useRef<number | null>(null);
  const indexSwitchAtRef = useRef(0);

  const [isLooping, setIsLooping] = useState(false);

  const segments = useShadowingStore((state) => state.segments);
  const currentIndex = useShadowingStore((state) => state.currentIndex);
  const currentTime = useShadowingStore((state) => state.currentTime);
  const isShadowingMode = useShadowingStore((state) => state.isShadowingMode);
  const playbackRate = useShadowingStore((state) => state.playbackRate);
  const videoSrc = useShadowingStore((state) => state.videoSrc);
  const videoTitle = useShadowingStore((state) => state.videoTitle);
  const setCurrentTime = useShadowingStore((state) => state.setCurrentTime);
  const setCurrentIndex = useShadowingStore((state) => state.setCurrentIndex);
  const clearSession = useShadowingStore((state) => state.clearSession);

  const currentSegment = segments[currentIndex];
  const segmentStarts = useMemo(() => segments.map((seg) => seg.start), [segments]);
  const progressPercent =
    segments.length > 0 ? (Math.min(currentIndex + 1, segments.length) / segments.length) * 100 : 0;

  const seekToIndex = useCallback(
    (index: number, autoPlay = true) => {
      if (!segments.length || index < 0 || index >= segments.length) {
        return;
      }

      const target = segments[index];
      pauseGuardRef.current = null;
      setCurrentIndex(index);
      indexSwitchAtRef.current = performance.now();
      setCurrentTime(target.start);
      videoRef.current?.seekTo(target.start);
      if (autoPlay) {
        videoRef.current?.play();
      }
    },
    [segments, setCurrentIndex, setCurrentTime]
  );

  const handleTimeUpdate = useCallback(
    (time: number) => {
      setCurrentTime(time);
    },
    [setCurrentTime]
  );

  const handleSeek = useCallback(
    (seconds: number, forcedIndex?: number) => {
      if (!segments.length) {
        return;
      }
      if (
        Number.isFinite(forcedIndex) &&
        typeof forcedIndex === "number" &&
        forcedIndex >= 0 &&
        forcedIndex < segments.length
      ) {
        seekToIndex(forcedIndex, true);
        return;
      }
      const index = findClosestSegmentIndexByStart(segmentStarts, seconds);
      seekToIndex(index, true);
    },
    [segmentStarts, segments.length, seekToIndex]
  );

  const handlePrev = useCallback(() => {
    seekToIndex(currentIndex - 1, true);
  }, [currentIndex, seekToIndex]);

  const handleNext = useCallback(() => {
    seekToIndex(currentIndex + 1, true);
  }, [currentIndex, seekToIndex]);

  const handleReplay = useCallback(() => {
    seekToIndex(currentIndex, true);
  }, [currentIndex, seekToIndex]);

  const handleApplyRate = useCallback((rate: number) => {
    videoRef.current?.setPlaybackRate(rate);
  }, []);

  useEffect(() => {
    if (!segments.length) {
      return;
    }

    const indexByTime = findSegmentIndexByTime(segmentStarts, currentTime);
    if (indexByTime !== currentIndex) {
      const jumpDistance = Math.abs(indexByTime - currentIndex);
      const isForwardStep = indexByTime > currentIndex && jumpDistance === 1;
      const currentSegmentStart = segments[currentIndex]?.start ?? 0;
      const currentSegmentElapsed = Math.max(0, currentTime - currentSegmentStart);
      const minVisibleSeconds = 0.78;
      const minSwitchGapMs = 520;
      const switchedTooSoon = performance.now() - indexSwitchAtRef.current < minSwitchGapMs;

      if (isForwardStep && (currentSegmentElapsed < minVisibleSeconds || switchedTooSoon)) {
        return;
      }

      setCurrentIndex(indexByTime);
      pauseGuardRef.current = null;
      indexSwitchAtRef.current = performance.now();
    }
  }, [currentTime, currentIndex, segmentStarts, segments, setCurrentIndex]);

  useEffect(() => {
    if (!segments.length || !currentSegment) {
      return;
    }

    if (isLooping && currentTime >= currentSegment.end - 0.05) {
      videoRef.current?.seekTo(currentSegment.start);
      videoRef.current?.play();
      pauseGuardRef.current = null;
      return;
    }

    if (!isShadowingMode) {
      pauseGuardRef.current = null;
      return;
    }

    if (currentTime >= currentSegment.end - 0.1 && pauseGuardRef.current !== currentIndex) {
      videoRef.current?.pause();
      pauseGuardRef.current = currentIndex;
      return;
    }

    if (currentTime < currentSegment.end - 0.6 && pauseGuardRef.current === currentIndex) {
      pauseGuardRef.current = null;
    }
  }, [currentIndex, currentSegment, currentTime, isLooping, isShadowingMode, segments.length]);

  useEffect(() => {
    if (!videoSrc) {
      return;
    }
    videoRef.current?.setPlaybackRate(playbackRate);
  }, [playbackRate, videoSrc]);

  const progressCopy =
    segments.length > 0
      ? `${Math.min(currentIndex + 1, segments.length)} / ${segments.length}`
      : "0 / 0";

  if (!videoSrc) {
    return (
      <section className={styles.emptyState}>
        <UploadOrLink />
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <div className={styles.phoneShell}>
        <header className={styles.topBar}>
          <button
            type="button"
            className={styles.backButton}
            onClick={() => {
              clearSession();
              setIsLooping(false);
            }}
            aria-label="Chọn video khác"
          >
            {"<- Bài học"}
          </button>

          <div className={styles.headerMeta}>
            <p className={styles.videoTitle}>{videoTitle || "YouTube Transcript"}</p>
            <p className={styles.headerHint}>Luyện nghe và shadowing theo từng câu.</p>
          </div>
          <p className={styles.progressText}>{progressCopy}</p>
        </header>

        <div className={styles.contentGrid}>
          <div className={styles.mainColumn}>
            <div className={styles.videoCard}>
              <VideoPlayer ref={videoRef} onTimeUpdate={handleTimeUpdate} />
            </div>
            <div className={styles.videoProgress} aria-hidden="true">
              <span
                className={styles.videoProgressFill}
                style={{ width: `${Math.max(8, progressPercent)}%` }}
              />
            </div>

            <div className={styles.lessonMeta}>
              <p className={styles.lessonLine}>Bài {currentIndex + 1}, phần luyện nghe</p>
              <p className={styles.lessonHint}>Nghe, nhại lại và lặp câu để nhớ nhanh hơn.</p>
            </div>

            <article className={styles.currentCard}>
              <p className={styles.currentLabel}>Câu đang học</p>
              <p className={styles.currentText}>{currentSegment?.text ?? "Đang chờ subtitle..."}</p>
              <p className={styles.currentHint}>Tập đọc theo nhịp audio 2-3 lần.</p>
            </article>

            <div className={styles.controlsCard}>
              <ShadowingControls
                onPrev={handlePrev}
                onNext={handleNext}
                onReplay={handleReplay}
                onApplyRate={handleApplyRate}
                isLooping={isLooping}
                onToggleLoop={() => setIsLooping((prev) => !prev)}
              />
            </div>
          </div>

          <div className={styles.transcriptCard}>
            <TranscriptPanel onSeek={handleSeek} />
          </div>
        </div>
      </div>
    </section>
  );
}
