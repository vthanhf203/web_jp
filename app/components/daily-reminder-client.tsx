"use client";

import { useEffect, useMemo, useState } from "react";

type Props = {
  enabled: boolean;
  hour: number;
  minute: number;
  label: string;
};

const REMINDER_DAY_KEY = "jp_daily_reminder_last_date";

function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function DailyReminderClient({ enabled, hour, minute, label }: Props) {
  const [statusText, setStatusText] = useState("");

  const normalizedHour = useMemo(() => Math.min(23, Math.max(0, hour)), [hour]);
  const normalizedMinute = useMemo(() => Math.min(59, Math.max(0, minute)), [minute]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      return;
    }

    let disposed = false;

    const notifyIfNeeded = () => {
      const now = new Date();
      if (now.getHours() !== normalizedHour || now.getMinutes() !== normalizedMinute) {
        return;
      }

      const today = dateKey(now);
      const lastNotified = window.localStorage.getItem(REMINDER_DAY_KEY) ?? "";
      if (lastNotified === today) {
        return;
      }

      if (!("Notification" in window)) {
        return;
      }

      const showNotification = () => {
        if (disposed) {
          return;
        }
        try {
          new Notification("JP Lab - Gio hoc roi", {
            body: label,
            icon: "/images/kanji-logo.png",
          });
          window.localStorage.setItem(REMINDER_DAY_KEY, today);
          setStatusText(`Da nhac hoc luc ${String(normalizedHour).padStart(2, "0")}:${String(normalizedMinute).padStart(2, "0")}`);
        } catch {
          // Ignore browser notification errors.
        }
      };

      if (Notification.permission === "granted") {
        showNotification();
        return;
      }

      if (Notification.permission === "default") {
        Notification.requestPermission().then((permission) => {
          if (permission === "granted") {
            showNotification();
          }
        });
      }
    };

    notifyIfNeeded();
    const timer = window.setInterval(notifyIfNeeded, 45_000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [enabled, label, normalizedHour, normalizedMinute]);

  if (!enabled) {
    return null;
  }

  return (
    <p className="hidden text-xs text-slate-500 sm:block">
      Nhac hoc: {String(normalizedHour).padStart(2, "0")}:{String(normalizedMinute).padStart(2, "0")}
      {statusText ? ` - ${statusText}` : ""}
    </p>
  );
}


