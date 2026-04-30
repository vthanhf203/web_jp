"use client";

import { useEffect, useMemo, useState } from "react";

const PRESET_MINUTES = [15, 25, 35, 45, 60];
const MIN_MINUTES = 1;
const MAX_MINUTES = 180;
const STORAGE_KEY = "jp-study-timer:v3";
const FLIP_DURATION_MS = 720;

type TimerSnapshot = {
  durationMinutes: number;
  remainingSeconds: number;
  running: boolean;
  endAtMs: number | null;
  completedSessions: number;
  completedDate: string;
};

type StudyTimerClientProps = {
  defaultMinutes: number;
};

type FlipDigitProps = {
  digit: string;
};

function todayKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function clampMinutes(value: number): number {
  return Math.max(MIN_MINUTES, Math.min(MAX_MINUTES, Math.round(value)));
}

function formatUnit(value: number): string {
  return String(Math.max(0, Math.floor(value))).padStart(2, "0");
}

function formatTime(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function readSnapshot(defaultMinutes: number): TimerSnapshot {
  const fallback: TimerSnapshot = {
    durationMinutes: defaultMinutes,
    remainingSeconds: defaultMinutes * 60,
    running: false,
    endAtMs: null,
    completedSessions: 0,
    completedDate: todayKey(),
  };

  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return fallback;
    }

    const parsed = JSON.parse(raw) as Partial<TimerSnapshot>;
    const normalizedDuration = clampMinutes(Number(parsed.durationMinutes ?? defaultMinutes));
    const normalizedRemaining = Math.max(0, Math.round(Number(parsed.remainingSeconds ?? normalizedDuration * 60)));
    const normalizedRunning = Boolean(parsed.running);
    const normalizedEndAt = Number.isFinite(Number(parsed.endAtMs)) ? Number(parsed.endAtMs) : null;
    const savedDate = typeof parsed.completedDate === "string" ? parsed.completedDate : todayKey();

    let normalizedCompleted = Math.max(0, Math.round(Number(parsed.completedSessions ?? 0)));
    const currentDate = todayKey();
    if (savedDate !== currentDate) {
      normalizedCompleted = 0;
    }

    if (normalizedRunning && normalizedEndAt) {
      const remainingFromClock = Math.max(0, Math.ceil((normalizedEndAt - Date.now()) / 1000));
      if (remainingFromClock <= 0) {
        return {
          durationMinutes: normalizedDuration,
          remainingSeconds: 0,
          running: false,
          endAtMs: null,
          completedSessions: normalizedCompleted + 1,
          completedDate: currentDate,
        };
      }
      return {
        durationMinutes: normalizedDuration,
        remainingSeconds: remainingFromClock,
        running: true,
        endAtMs: normalizedEndAt,
        completedSessions: normalizedCompleted,
        completedDate: currentDate,
      };
    }

    return {
      durationMinutes: normalizedDuration,
      remainingSeconds: normalizedRemaining,
      running: false,
      endAtMs: null,
      completedSessions: normalizedCompleted,
      completedDate: currentDate,
    };
  } catch {
    return fallback;
  }
}

function FlipDigit({ digit }: FlipDigitProps) {
  const [displayed, setDisplayed] = useState(digit);
  const [previous, setPrevious] = useState(digit);
  const [nextDigit, setNextDigit] = useState(digit);
  const [isFlipping, setIsFlipping] = useState(false);
  const [flipKey, setFlipKey] = useState(0);

  useEffect(() => {
    if (digit === displayed) {
      return;
    }

    setPrevious(displayed);
    setNextDigit(digit);
    setIsFlipping(true);
    setFlipKey((value) => value + 1);

    const timer = window.setTimeout(() => {
      setDisplayed(digit);
      setIsFlipping(false);
      setPrevious(digit);
      setNextDigit(digit);
    }, FLIP_DURATION_MS);

    return () => window.clearTimeout(timer);
  }, [digit, displayed]);

  const topDigit = (value: string) => (
    <span className="study-flip-number study-flip-number-top">{value}</span>
  );

  const bottomDigit = (value: string) => (
    <span className="study-flip-number study-flip-number-bottom">{value}</span>
  );

  const topValue = isFlipping ? nextDigit : displayed;
  const bottomValue = isFlipping ? previous : displayed;

  return (
    <div className="study-flip-digit">
      <div className="study-flip-half study-flip-half-top">{topDigit(topValue)}</div>
      <div className="study-flip-half study-flip-half-bottom">{bottomDigit(bottomValue)}</div>
      <div className="study-flip-hinge" />

      {isFlipping ? (
        <>
          <div key={`top-${flipKey}`} className="study-flip-flap study-flip-flap-top">
            {topDigit(previous)}
            <span className="study-flip-flap-shadow" />
          </div>

          <div key={`bottom-${flipKey}`} className="study-flip-flap study-flip-flap-bottom">
            {bottomDigit(nextDigit)}
            <span className="study-flip-flap-light" />
          </div>
        </>
      ) : null}
    </div>
  );
}

function FlipClockGroup({ value, label }: { value: number; label: string }) {
  const digits = formatUnit(value);
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center gap-2 sm:gap-3">
        <FlipDigit digit={digits[0] ?? "0"} />
        <FlipDigit digit={digits[1] ?? "0"} />
      </div>
      <p className="text-base font-semibold text-slate-600 sm:text-[28px] sm:font-bold">{label}</p>
    </div>
  );
}

export function StudyTimerClient({ defaultMinutes }: StudyTimerClientProps) {
  const safeDefaultMinutes = clampMinutes(defaultMinutes);

  const [durationMinutes, setDurationMinutes] = useState(safeDefaultMinutes);
  const [remainingSeconds, setRemainingSeconds] = useState(safeDefaultMinutes * 60);
  const [running, setRunning] = useState(false);
  const [endAtMs, setEndAtMs] = useState<number | null>(null);
  const [completedSessions, setCompletedSessions] = useState(0);
  const [customMinutesInput, setCustomMinutesInput] = useState(String(safeDefaultMinutes));
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const snapshot = readSnapshot(safeDefaultMinutes);
    setDurationMinutes(snapshot.durationMinutes);
    setRemainingSeconds(snapshot.remainingSeconds);
    setRunning(snapshot.running);
    setEndAtMs(snapshot.endAtMs);
    setCompletedSessions(snapshot.completedSessions);
    setCustomMinutesInput(String(snapshot.durationMinutes));
    setHydrated(true);
  }, [safeDefaultMinutes]);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") {
      return;
    }

    const snapshot: TimerSnapshot = {
      durationMinutes,
      remainingSeconds,
      running,
      endAtMs,
      completedSessions,
      completedDate: todayKey(),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  }, [durationMinutes, remainingSeconds, running, endAtMs, completedSessions, hydrated]);

  useEffect(() => {
    if (!running || !endAtMs) {
      return;
    }

    const syncFromClock = () => {
      const seconds = Math.max(0, Math.ceil((endAtMs - Date.now()) / 1000));
      if (seconds <= 0) {
        setRemainingSeconds(0);
        setRunning(false);
        setEndAtMs(null);
        setCompletedSessions((count) => count + 1);
        return;
      }
      setRemainingSeconds(seconds);
    };

    syncFromClock();
    const timer = window.setInterval(syncFromClock, 250);
    const onVisibility = () => syncFromClock();

    window.addEventListener("focus", onVisibility);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onVisibility);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [running, endAtMs]);

  useEffect(() => {
    if (running) {
      return;
    }
    const maxSeconds = durationMinutes * 60;
    setRemainingSeconds((prev) => (prev > maxSeconds ? maxSeconds : prev));
  }, [durationMinutes, running]);

  const progressPercent = useMemo(() => {
    const total = Math.max(1, durationMinutes * 60);
    const done = total - Math.min(total, remainingSeconds);
    return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
  }, [durationMinutes, remainingSeconds]);

  const minutesValue = Math.floor(Math.max(0, remainingSeconds) / 60);
  const secondsValue = Math.max(0, remainingSeconds) % 60;

  const statusLabel = running ? "Đang chạy" : remainingSeconds === 0 ? "Đã kết thúc" : "Tạm dừng";

  const applyDuration = (minutesRaw: number) => {
    if (running) {
      return;
    }
    const nextMinutes = clampMinutes(minutesRaw);
    setDurationMinutes(nextMinutes);
    setRemainingSeconds(nextMinutes * 60);
    setCustomMinutesInput(String(nextMinutes));
  };

  const applyCustomDuration = () => {
    const parsed = Number(customMinutesInput.replace(",", "."));
    if (!Number.isFinite(parsed)) {
      return;
    }
    applyDuration(parsed);
  };

  const startOrPause = () => {
    if (running) {
      const seconds = endAtMs ? Math.max(0, Math.ceil((endAtMs - Date.now()) / 1000)) : remainingSeconds;
      setRemainingSeconds(seconds);
      setRunning(false);
      setEndAtMs(null);
      return;
    }

    const resumeSeconds = remainingSeconds > 0 ? remainingSeconds : durationMinutes * 60;
    if (remainingSeconds <= 0) {
      setRemainingSeconds(resumeSeconds);
    }
    setEndAtMs(Date.now() + resumeSeconds * 1000);
    setRunning(true);
  };

  const resetTimer = () => {
    setRunning(false);
    setEndAtMs(null);
    setRemainingSeconds(durationMinutes * 60);
  };

  const endSession = () => {
    setRunning(false);
    setEndAtMs(null);
    setRemainingSeconds(0);
  };

  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-[28px] border border-sky-200/80 bg-gradient-to-br from-white/95 via-sky-50/70 to-slate-50 p-6 shadow-[0_20px_70px_rgba(15,23,42,0.12)] sm:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-gradient-to-br from-emerald-200/35 to-sky-200/25 blur-2xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-gradient-to-br from-sky-200/30 to-indigo-200/20 blur-2xl"
        />

        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Bấm giờ học</p>
            <h2 className="mt-1 text-3xl font-black text-slate-900">Phiên học tập trung</h2>
            <p className="mt-1 text-sm text-slate-600">Phong cách flipclock cổ điển, lật số theo từng giây.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-semibold text-slate-700">
              {statusLabel}
            </div>
            <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">
              Hoàn thành hôm nay: {completedSessions}
            </div>
          </div>
        </div>

        <div className="relative mt-5 rounded-2xl border border-slate-200/90 bg-white/90 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] sm:p-6">
          <div className="text-center">
            <div className="mx-auto flex w-fit flex-col items-center gap-3">
              <div className="flex items-start gap-4 sm:gap-6">
                <FlipClockGroup value={minutesValue} label="Phút" />
                <FlipClockGroup value={secondsValue} label="Giây" />
              </div>
              <p className="sr-only" aria-live="polite">
                {formatTime(remainingSeconds)}
              </p>
            </div>
            <p className="mt-2 text-sm text-slate-500">Mục tiêu: {durationMinutes} phút</p>
          </div>

          <div className="mt-5 h-3 rounded-full bg-slate-200">
            <div
              className="h-3 rounded-full bg-gradient-to-r from-emerald-500 via-teal-500 to-sky-500 transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            {Array.from(new Set([...PRESET_MINUTES, durationMinutes]))
              .sort((a, b) => a - b)
              .map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  onClick={() => applyDuration(minutes)}
                  className={`rounded-full border px-3 py-1 text-sm font-semibold transition ${
                    durationMinutes === minutes
                      ? "border-teal-500 bg-teal-50 text-teal-700 shadow-[0_8px_20px_rgba(20,184,166,0.18)]"
                      : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                  } ${running ? "cursor-not-allowed opacity-60" : ""}`}
                  disabled={running}
                >
                  {minutes} phút
                </button>
              ))}
          </div>

          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Thiết lập chủ động</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
              <input
                type="number"
                min={MIN_MINUTES}
                max={MAX_MINUTES}
                step={1}
                value={customMinutesInput}
                onChange={(event) => setCustomMinutesInput(event.target.value)}
                disabled={running}
                className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-base font-semibold text-slate-700 outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100 disabled:cursor-not-allowed disabled:opacity-60"
                placeholder={`Nhập ${MIN_MINUTES}-${MAX_MINUTES} phút`}
              />
              <button
                type="button"
                onClick={() => applyDuration(durationMinutes - 5)}
                disabled={running}
                className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                -5p
              </button>
              <button
                type="button"
                onClick={() => applyDuration(durationMinutes + 5)}
                disabled={running}
                className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                +5p
              </button>
              <button
                type="button"
                onClick={applyCustomDuration}
                disabled={running}
                className="h-11 rounded-xl border border-teal-300 bg-teal-50 px-4 text-sm font-semibold text-teal-700 transition hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Áp dụng
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-3">
            <button
              type="button"
              onClick={startOrPause}
              className={`h-12 rounded-xl px-4 text-base font-bold text-white transition ${
                running
                  ? "bg-gradient-to-r from-amber-500 to-orange-500 shadow-[0_12px_24px_rgba(249,115,22,0.28)]"
                  : "bg-gradient-to-r from-emerald-600 to-teal-600 shadow-[0_12px_24px_rgba(13,148,136,0.28)]"
              }`}
            >
              {running ? "Tạm dừng" : "Bắt đầu"}
            </button>
            <button
              type="button"
              onClick={resetTimer}
              className="h-12 rounded-xl border border-slate-300 bg-white px-4 text-base font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Đặt lại
            </button>
            <button
              type="button"
              onClick={endSession}
              className="h-12 rounded-xl border border-rose-200 bg-rose-50 px-4 text-base font-semibold text-rose-700 transition hover:bg-rose-100"
            >
              Kết thúc phiên
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
