"use client";

import { AUDIO_RATE_KEY, AUDIO_VOICE_KEY } from "@/app/components/audio-settings-client";

type Props = {
  text: string;
  className?: string;
  title?: string;
};

const preferredVoiceKeywords = [
  "haruka online",
  "nanami online",
  "otoya online",
  "natural",
  "microsoft",
  "google",
  "japanese",
  "nihongo",
  "nanami",
  "haruka",
];

function pickJapaneseVoice(voices: SpeechSynthesisVoice[], preferredName: string): SpeechSynthesisVoice | null {
  const jpVoices = voices.filter((voice) => voice.lang.toLowerCase().startsWith("ja"));
  if (jpVoices.length === 0) {
    return null;
  }

  if (preferredName) {
    const selected = jpVoices.find((voice) => voice.name === preferredName);
    if (selected) {
      return selected;
    }
  }

  const preferred = jpVoices.find((voice) => {
    const lowerName = voice.name.toLowerCase();
    return preferredVoiceKeywords.some((keyword) => lowerName.includes(keyword));
  });

  return preferred ?? jpVoices[0] ?? null;
}

export function SpeakJpButton({ text, className = "", title = "Phat am" }: Props) {
  const value = text.trim();

  return (
    <button
      type="button"
      className={`inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-white text-sm text-slate-600 transition hover:bg-slate-100 ${className}`}
      title={title}
      aria-label={title}
      onClick={() => {
        if (!value || typeof window === "undefined" || !("speechSynthesis" in window)) {
          return;
        }

        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(value);
        utterance.lang = "ja-JP";

        const savedRate = Number(window.localStorage.getItem(AUDIO_RATE_KEY) ?? "0.95");
        utterance.rate = Number.isFinite(savedRate) ? Math.min(1.25, Math.max(0.75, savedRate)) : 0.95;
        utterance.pitch = 1;

        const selectedVoice = pickJapaneseVoice(
          window.speechSynthesis.getVoices(),
          window.localStorage.getItem(AUDIO_VOICE_KEY) ?? ""
        );
        if (selectedVoice) {
          utterance.voice = selectedVoice;
        }

        window.speechSynthesis.speak(utterance);
      }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="h-4 w-4"
      >
        <path d="M11 5 6 9H3v6h3l5 4V5Z" />
        <path d="M15.5 8.5a5 5 0 0 1 0 7" />
        <path d="M18.5 6a8.5 8.5 0 0 1 0 12" />
      </svg>
    </button>
  );
}

