"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { Segment, ShadowingState } from "@/types/shadowing";

type ShadowingStore = ShadowingState & {
  videoTitle: string;
  setVideoTitle: (title: string) => void;
  clearSession: () => void;
};

const defaultState = {
  segments: [] as Segment[],
  currentIndex: 0,
  currentTime: 0,
  isShadowingMode: false,
  isLoading: false,
  playbackRate: 1,
  videoSrc: "",
  videoType: null as ShadowingStore["videoType"],
  videoTitle: "",
};

function revokeIfBlob(value: string, type: ShadowingStore["videoType"]) {
  if (typeof window === "undefined") {
    return;
  }
  if (type === "mp4" && value.startsWith("blob:")) {
    URL.revokeObjectURL(value);
  }
}

export const useShadowingStore = create<ShadowingStore>()(
  persist(
    (set, get) => ({
      ...defaultState,
      setSegments: (segments) =>
        set({
          segments,
          currentIndex: 0,
          currentTime: 0,
          isShadowingMode: false,
        }),
      setCurrentTime: (t) => set({ currentTime: t }),
      setCurrentIndex: (i) => {
        const { segments } = get();
        if (segments.length === 0) {
          set({ currentIndex: 0 });
          return;
        }
        const maxIndex = segments.length - 1;
        const safeIndex = Math.max(0, Math.min(i, maxIndex));
        set({ currentIndex: safeIndex });
      },
      toggleShadowingMode: () => set((state) => ({ isShadowingMode: !state.isShadowingMode })),
      setPlaybackRate: (rate) => set({ playbackRate: rate }),
      setVideo: (src, type) => {
        const prev = get();
        if (prev.videoSrc && prev.videoSrc !== src) {
          revokeIfBlob(prev.videoSrc, prev.videoType);
        }
        set({ videoSrc: src, videoType: type, isShadowingMode: false });
      },
      setLoading: (v) => set({ isLoading: v }),
      setVideoTitle: (title) => set({ videoTitle: title }),
      clearSession: () => {
        const prev = get();
        if (prev.videoSrc) {
          revokeIfBlob(prev.videoSrc, prev.videoType);
        }
        set({ ...defaultState });
      },
    }),
    {
      name: "shadowing-session",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        segments: state.segments,
        currentIndex: state.currentIndex,
        currentTime: state.currentTime,
        playbackRate: state.playbackRate,
        videoSrc: state.videoSrc,
        videoType: state.videoType,
        videoTitle: state.videoTitle,
      }),
      merge: (persistedState, currentState) => {
        const persisted = (persistedState as Partial<ShadowingStore>) ?? {};
        return {
          ...currentState,
          ...persisted,
          isShadowingMode: false,
        };
      },
    }
  )
);
