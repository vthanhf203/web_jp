"use client";

import { useEffect, useMemo, useState } from "react";
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

export interface StreakBannerProps {
  storageKey?: string;
}

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

export default function StreakBanner({ storageKey = "study_streak" }: StreakBannerProps) {
  const [state, setState] = useState<StreakBannerState>({ streakDays: 0, xp: 0 });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const parsed = parseStore(window.localStorage.getItem(storageKey));
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    const todayKey = toDateKey(today);
    const yesterdayKey = toDateKey(yesterday);
    const lastStudyDate =
      typeof parsed.lastStudyDate === "string"
        ? parsed.lastStudyDate
        : typeof parsed.lastDate === "string"
          ? parsed.lastDate
          : "";

    let streakDays = numberOrZero(parsed.streakDays ?? parsed.streak);
    const xp = numberOrZero(parsed.xp);

    if (lastStudyDate === yesterdayKey) {
      streakDays = Math.max(1, streakDays + 1);
      const nextStore: StudyStreakStore = {
        ...parsed,
        streakDays,
        streak: streakDays,
        xp,
        lastStudyDate: todayKey,
      };
      window.localStorage.setItem(storageKey, JSON.stringify(nextStore));
    }

    setState({ streakDays, xp });
  }, [storageKey]);

  const copy = useMemo(
    () => `🔥 ${state.streakDays} ngay lien tiep | ⭐ ${state.xp} XP`,
    [state.streakDays, state.xp]
  );

  return (
    <div className={styles.banner} role="status" aria-live="polite">
      <div className={styles.inner}>
        <p className={styles.copy}>{copy}</p>
      </div>
    </div>
  );
}
