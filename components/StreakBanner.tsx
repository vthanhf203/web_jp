"use client";

import { useMemo, useSyncExternalStore } from "react";
import styles from "@/components/StreakBanner.module.css";

type StudyStreakStore = {
  streakDays?: number;
  streak?: number;
  xp?: number;
  lastStudyDate?: string;
  lastDate?: string;
};

type StreakBannerState = {
  streakDays: number;
  xp: number;
};

const DEFAULT_STATE: StreakBannerState = { streakDays: 0, xp: 0 };
const snapshotCache = new Map<string, { raw: string | null; snapshot: StreakBannerState }>();

export interface StreakBannerProps {
  storageKey?: string;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseStore(raw: string | null): StudyStreakStore {
  if (!raw) {
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isObjectRecord(parsed)) {
      return {};
    }
    return parsed as StudyStreakStore;
  } catch {
    return {};
  }
}

function numberOrZero(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return 0;
  }
  return Math.max(0, Math.round(num));
}

function toSnapshot(parsed: StudyStreakStore): StreakBannerState {
  return {
    streakDays: numberOrZero(parsed.streakDays ?? parsed.streak),
    xp: numberOrZero(parsed.xp),
  };
}

function getSnapshot(storageKey: string): StreakBannerState {
  if (typeof window === "undefined") {
    return DEFAULT_STATE;
  }

  const raw = window.localStorage.getItem(storageKey);
  const cached = snapshotCache.get(storageKey);
  if (cached && cached.raw === raw) {
    return cached.snapshot;
  }

  const snapshot = toSnapshot(parseStore(raw));
  snapshotCache.set(storageKey, { raw, snapshot });
  return snapshot;
}

export default function StreakBanner({ storageKey = "study_streak" }: StreakBannerProps) {
  const state = useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === "undefined") {
        return () => {};
      }

      const refresh = () => {
        snapshotCache.delete(storageKey);
        onStoreChange();
      };

      const handleStorage = (event: StorageEvent) => {
        if (!event.key || event.key === storageKey) {
          refresh();
        }
      };
      const handleFocus = () => refresh();
      window.addEventListener("storage", handleStorage);
      window.addEventListener("focus", handleFocus);
      return () => {
        window.removeEventListener("storage", handleStorage);
        window.removeEventListener("focus", handleFocus);
      };
    },
    () => getSnapshot(storageKey),
    () => DEFAULT_STATE
  );

  const copy = useMemo(
    () => `${state.streakDays} ngày liên tiếp | ⭐ ${state.xp} XP`,
    [state.streakDays, state.xp]
  );

  return (
    <div className={styles.banner} role="status" aria-live="polite">
      <div className={styles.inner}>
        <p className={styles.copy}>
          <span className={styles.flame} aria-hidden>
            🔥
          </span>
          <span>{copy}</span>
        </p>
      </div>
    </div>
  );
}
