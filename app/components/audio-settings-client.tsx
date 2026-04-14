"use client";

import { useEffect, useMemo, useState } from "react";

export const AUDIO_RATE_KEY = "jp_audio_rate";
export const AUDIO_VOICE_KEY = "jp_audio_voice_name";
export const AUDIO_AUTOPLAY_KEY = "jp_audio_autoplay";

export function AudioSettingsClient() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceName, setVoiceName] = useState(() =>
    typeof window === "undefined" ? "" : window.localStorage.getItem(AUDIO_VOICE_KEY) ?? ""
  );
  const [rate, setRate] = useState(() =>
    typeof window === "undefined" ? 0.95 : Number(window.localStorage.getItem(AUDIO_RATE_KEY) ?? "0.95")
  );
  const [autoplay, setAutoplay] = useState(() =>
    typeof window === "undefined" ? false : window.localStorage.getItem(AUDIO_AUTOPLAY_KEY) === "1"
  );

  const jpVoices = useMemo(
    () => voices.filter((voice) => voice.lang.toLowerCase().startsWith("ja")),
    [voices]
  );

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }
    const loadVoices = () => setVoices(window.speechSynthesis.getVoices());
    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(AUDIO_RATE_KEY, String(rate));
  }, [rate]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(AUDIO_VOICE_KEY, voiceName);
  }, [voiceName]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(AUDIO_AUTOPLAY_KEY, autoplay ? "1" : "0");
  }, [autoplay]);

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <h3 className="text-base font-bold text-slate-800">Audio tuy chinh</h3>
      <p className="text-xs text-slate-600">Dat giong, toc do, va auto-play cho flashcard.</p>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="font-semibold text-slate-700">Giong tieng Nhat</span>
          <select
            value={voiceName}
            onChange={(event) => setVoiceName(event.target.value)}
            className="input-base"
          >
            <option value="">Tu dong (goi y gioi tinh nu/tu nhien)</option>
            {jpVoices.map((voice) => (
              <option key={voice.name} value={voice.name}>
                {voice.name}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-sm">
          <span className="font-semibold text-slate-700">
            Toc do ({rate.toFixed(2)}x)
          </span>
          <input
            type="range"
            min={0.75}
            max={1.25}
            step={0.05}
            value={rate}
            onChange={(event) => setRate(Number(event.target.value))}
            className="w-full"
          />
        </label>
      </div>

      <label className="inline-flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={autoplay}
          onChange={(event) => setAutoplay(event.target.checked)}
        />
        Bat auto-play khi qua the flashcard moi
      </label>
    </div>
  );
}


