"use client";

import { useEffect } from "react";

type ScrollPayload = {
  y: number;
  ts: number;
  containers: Record<string, number>;
};

const STORAGE_KEY = "admin-vocab-scroll-state";
const MAX_RESTORE_AGE_MS = 45_000;

function readPayload(): ScrollPayload | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as ScrollPayload;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    if (typeof parsed.y !== "number" || typeof parsed.ts !== "number") {
      return null;
    }
    if (!parsed.containers || typeof parsed.containers !== "object") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function capturePayload(): ScrollPayload {
  const containers: Record<string, number> = {};
  document.querySelectorAll<HTMLElement>("[data-scroll-restore-key]").forEach((element) => {
    const key = element.dataset.scrollRestoreKey;
    if (!key) {
      return;
    }
    containers[key] = element.scrollTop;
  });

  return {
    y: window.scrollY,
    ts: Date.now(),
    containers,
  };
}

function savePayload() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(capturePayload()));
  } catch {
    // Ignore storage failures.
  }
}

function restorePayload(payload: ScrollPayload) {
  const isFresh = Date.now() - payload.ts <= MAX_RESTORE_AGE_MS;
  if (!isFresh) {
    return;
  }

  window.scrollTo({ top: Math.max(0, payload.y), behavior: "auto" });

  for (const [key, top] of Object.entries(payload.containers)) {
    const target = document.querySelector<HTMLElement>(`[data-scroll-restore-key="${key}"]`);
    if (target) {
      target.scrollTop = Math.max(0, top);
    }
  }
}

export function AdminVocabScrollRestore() {
  useEffect(() => {
    const payload = readPayload();
    if (payload) {
      requestAnimationFrame(() => {
        restorePayload(payload);
        requestAnimationFrame(() => restorePayload(payload));
      });
    }

    const onScroll = () => savePayload();
    const onSubmitCapture = () => savePayload();
    const onPageHide = () => savePayload();

    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("submit", onSubmitCapture, true);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      savePayload();
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("submit", onSubmitCapture, true);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, []);

  return null;
}
