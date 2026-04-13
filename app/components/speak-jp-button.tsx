"use client";

type Props = {
  text: string;
  className?: string;
  title?: string;
};

function pickJapaneseVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const jaVoices = voices.filter((voice) => voice.lang.toLowerCase().startsWith("ja"));
  return jaVoices[0] ?? null;
}

export function SpeakJpButton({ text, className = "", title = "Phát âm" }: Props) {
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
        utterance.rate = 0.94;
        utterance.pitch = 1;

        const selectedVoice = pickJapaneseVoice(window.speechSynthesis.getVoices());
        if (selectedVoice) {
          utterance.voice = selectedVoice;
        }

        window.speechSynthesis.speak(utterance);
      }}
    >
      🔊
    </button>
  );
}
