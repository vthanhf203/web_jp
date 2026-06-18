"use client";

import { useEffect, useState } from "react";

type DictionaryWord = {
  id: string;
  word: string;
  reading: string;
  kanji: string;
  meanings: string[];
  partsOfSpeech: string[];
  jlptLevel: string;
  common: boolean;
};

type DictionaryKanji = {
  id: string;
  character: string;
  meanings: string[];
  onReadings: string[];
  kunReadings: string[];
  strokeCount: number;
  jlptLevel: string;
};

type DictionaryResponse = {
  loaded?: {
    updatedAt: string;
    words: number;
    kanji: number;
  };
  items?: {
    words?: DictionaryWord[];
    kanji?: DictionaryKanji[];
  };
};

type OpenDictionaryQuickFillProps = {
  mode: "word" | "kanji";
  onPickWord?: (entry: DictionaryWord) => void;
  onPickKanji?: (entry: DictionaryKanji) => void;
};

function compact(values: string[], limit = 2): string {
  return values.filter(Boolean).slice(0, limit).join("; ");
}

export function OpenDictionaryQuickFill({
  mode,
  onPickWord,
  onPickKanji,
}: OpenDictionaryQuickFillProps) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [loaded, setLoaded] = useState({ updatedAt: "", words: 0, kanji: 0 });
  const [words, setWords] = useState<DictionaryWord[]>([]);
  const [kanji, setKanji] = useState<DictionaryKanji[]>([]);

  useEffect(() => {
    let ignored = false;

    fetch("/api/japanese-dictionary?limit=1", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: DictionaryResponse | null) => {
        if (!ignored && payload?.loaded) {
          setLoaded(payload.loaded);
        }
      })
      .catch(() => {
        if (!ignored) {
          setLoaded({ updatedAt: "", words: 0, kanji: 0 });
        }
      });

    return () => {
      ignored = true;
    };
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setWords([]);
      setKanji([]);
      setStatus("idle");
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setStatus("loading");
      const params = new URLSearchParams({
        q: trimmed,
        type: mode,
        limit: "8",
      });

      fetch(`/api/japanese-dictionary?${params.toString()}`, {
        cache: "no-store",
        signal: controller.signal,
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          return response.json() as Promise<DictionaryResponse>;
        })
        .then((payload) => {
          setLoaded(payload.loaded ?? { updatedAt: "", words: 0, kanji: 0 });
          setWords(payload.items?.words ?? []);
          setKanji(payload.items?.kanji ?? []);
          setStatus("idle");
        })
        .catch((error) => {
          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }
          setStatus("error");
        });
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [mode, query]);

  const hasImportedData = loaded.words > 0 || loaded.kanji > 0;
  const resultCount = mode === "word" ? words.length : kanji.length;

  return (
    <div className="rounded-xl border border-sky-100 bg-sky-50/70 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-sky-700">
            Offline dictionary quick fill
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {hasImportedData
              ? `Loaded ${loaded.words} words, ${loaded.kanji} kanji`
              : "No imported dictionary yet"}
          </p>
        </div>
        {loaded.updatedAt ? (
          <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-slate-500">
            {new Date(loaded.updatedAt).toLocaleDateString("vi-VN")}
          </span>
        ) : null}
      </div>

      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="mt-3 h-10 w-full rounded-lg border border-sky-100 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
        placeholder={
          mode === "word"
            ? "Search word, reading, or English meaning..."
            : "Search kanji, reading, or English meaning..."
        }
      />

      <div className="mt-2 space-y-2">
        {mode === "word"
          ? words.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className="block w-full rounded-lg border border-white bg-white px-3 py-2 text-left text-sm shadow-sm transition hover:border-sky-200 hover:bg-sky-50"
                onClick={() => onPickWord?.(entry)}
              >
                <span className="font-bold text-slate-900">{entry.word}</span>
                <span className="ml-2 text-xs font-semibold text-slate-500">
                  {entry.reading}
                </span>
                {entry.jlptLevel ? (
                  <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                    {entry.jlptLevel}
                  </span>
                ) : null}
                <span className="mt-1 block text-xs text-slate-600">
                  {compact(entry.meanings)}
                </span>
              </button>
            ))
          : kanji.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className="block w-full rounded-lg border border-white bg-white px-3 py-2 text-left text-sm shadow-sm transition hover:border-sky-200 hover:bg-sky-50"
                onClick={() => onPickKanji?.(entry)}
              >
                <span className="text-xl font-black text-slate-900">
                  {entry.character}
                </span>
                {entry.jlptLevel ? (
                  <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                    {entry.jlptLevel}
                  </span>
                ) : null}
                <span className="ml-2 text-xs font-semibold text-slate-500">
                  {entry.strokeCount || "-"} strokes
                </span>
                <span className="mt-1 block text-xs text-slate-600">
                  {compact(entry.meanings)}
                </span>
              </button>
            ))}
      </div>

      {query.trim() && status === "loading" ? (
        <p className="mt-2 text-xs font-semibold text-sky-700">Searching...</p>
      ) : null}
      {query.trim() && status === "error" ? (
        <p className="mt-2 text-xs font-semibold text-rose-600">
          Cannot search dictionary right now.
        </p>
      ) : null}
      {query.trim() && status === "idle" && resultCount === 0 ? (
        <p className="mt-2 text-xs text-slate-500">No suggestion found.</p>
      ) : null}
    </div>
  );
}
