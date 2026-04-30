"use client";

import Link from "next/link";
import {
  BookOpen,
  CheckCircle2,
  Clipboard,
  Database,
  FileJson,
  Layers3,
  Play,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { VocabStudyClient, type StudyMode } from "@/app/components/vocab-study-client";

export type RelatedReviewMode = Extract<StudyMode, "flashcard" | "quiz">;
export type RelatedReviewSource = "system" | "json";

type RawRecord = Record<string, unknown>;

export type RelatedWord = {
  id: string;
  sourceCharacter: string;
  word: string;
  reading: string;
  kanji: string;
  hanviet: string;
  meaning: string;
  sourceLabel?: string;
  sourceBucket?: "personal" | "kanji-json" | "admin" | "system" | "json";
};

export type KanjiGroup = {
  character: string;
  hanviet: string;
  meaning: string;
  jlptLevel?: string;
  words: RelatedWord[];
};

type ParsedResult = {
  groups: KanjiGroup[];
  error: string;
};

type Props = {
  initialChars: string[];
  initialMode: RelatedReviewMode | null;
  initialSource: RelatedReviewSource;
  levelCounts: Record<string, number>;
  selectedLevel: string;
  systemGroups: KanjiGroup[];
};

const STORAGE_KEY = "kanji_related_review_json_v1";
const JLPT_LEVELS = ["N5", "N4", "N3", "N2", "N1"] as const;
const KANJI_PAGE_SIZE = 9;

const SOURCE_META: Record<NonNullable<RelatedWord["sourceBucket"]>, { label: string; className: string }> = {
  personal: {
    label: "Cá nhân",
    className: "bg-violet-100 text-violet-700",
  },
  "kanji-json": {
    label: "Kanji JSON",
    className: "bg-teal-100 text-teal-700",
  },
  admin: {
    label: "Admin upload",
    className: "bg-sky-100 text-sky-700",
  },
  system: {
    label: "Hệ thống",
    className: "bg-slate-100 text-slate-600",
  },
  json: {
    label: "JSON chủ động",
    className: "bg-amber-100 text-amber-800",
  },
};

const SAMPLE_JSON = JSON.stringify(
  [
    {
      character: "人",
      hanviet: "Nhân",
      meaning: "người",
      relatedVocabularies: [
        { word: "人", reading: "ひと", kanji: "人", hanviet: "Nhân", meaning: "người" },
        { word: "日本人", reading: "にほんじん", kanji: "日本人", hanviet: "Nhật Bản nhân", meaning: "người Nhật" },
        { word: "外国人", reading: "がいこくじん", kanji: "外国人", hanviet: "Ngoại quốc nhân", meaning: "người nước ngoài" },
        { word: "一人", reading: "ひとり", kanji: "一人", hanviet: "Nhất nhân", meaning: "một người" },
        { word: "二人", reading: "ふたり", kanji: "二人", hanviet: "Nhị nhân", meaning: "hai người" },
        { word: "大人", reading: "おとな", kanji: "大人", hanviet: "Đại nhân", meaning: "người lớn" }
      ]
    },
    {
      character: "日",
      hanviet: "Nhật",
      meaning: "ngày / mặt trời",
      relatedVocabularies: [
        { word: "日", reading: "ひ", kanji: "日", hanviet: "Nhật", meaning: "ngày" },
        { word: "今日", reading: "きょう", kanji: "今日", hanviet: "Kim nhật", meaning: "hôm nay" },
        { word: "明日", reading: "あした", kanji: "明日", hanviet: "Minh nhật", meaning: "ngày mai" },
        { word: "毎日", reading: "まいにち", kanji: "毎日", hanviet: "Mỗi nhật", meaning: "mỗi ngày" },
        { word: "日本", reading: "にほん", kanji: "日本", hanviet: "Nhật Bản", meaning: "Nhật Bản" },
        { word: "日曜日", reading: "にちようび", kanji: "日曜日", hanviet: "Nhật diệu nhật", meaning: "Chủ nhật" }
      ]
    },
    {
      character: "学",
      hanviet: "Học",
      meaning: "học",
      relatedVocabularies: [
        { word: "学生", reading: "がくせい", kanji: "学生", hanviet: "Học sinh", meaning: "học sinh / sinh viên" },
        { word: "学校", reading: "がっこう", kanji: "学校", hanviet: "Học hiệu", meaning: "trường học" },
        { word: "大学", reading: "だいがく", kanji: "大学", hanviet: "Đại học", meaning: "đại học" },
        { word: "留学生", reading: "りゅうがくせい", kanji: "留学生", hanviet: "Lưu học sinh", meaning: "du học sinh" },
        { word: "学ぶ", reading: "まなぶ", kanji: "学ぶ", hanviet: "Học", meaning: "học" }
      ]
    }
  ],
  null,
  2
);

function asText(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return "";
}

function getArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeRoot(input: unknown): unknown[] {
  if (Array.isArray(input)) {
    return input;
  }
  if (!input || typeof input !== "object") {
    return [];
  }
  const source = input as RawRecord;
  if (getArray(source.items).length > 0) {
    return getArray(source.items);
  }
  if (getArray(source.entries).length > 0) {
    return getArray(source.entries);
  }
  if (getArray(source.kanji).length > 0) {
    return getArray(source.kanji);
  }
  return getArray(source.data);
}

function relatedListOf(source: RawRecord): unknown[] {
  if (getArray(source.relatedVocabularies).length > 0) {
    return getArray(source.relatedVocabularies);
  }
  if (getArray(source.relatedWords).length > 0) {
    return getArray(source.relatedWords);
  }
  if (getArray(source.vocabularies).length > 0) {
    return getArray(source.vocabularies);
  }
  return getArray(source.words);
}

function parseRelatedReviewJson(rawInput: string): ParsedResult {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return { groups: [], error: "" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return {
      groups: [],
      error: "JSON chưa hợp lệ. Kiểm tra dấu phẩy, ngoặc vuông và ngoặc nhọn.",
    };
  }

  const entries = normalizeRoot(parsed);
  const groups: KanjiGroup[] = [];

  for (const [entryIndex, entry] of entries.entries()) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }
    const source = entry as RawRecord;
    const character = asText(source.character || source.kanji || source.word);
    if (!character) {
      continue;
    }

    const words = relatedListOf(source)
      .map((rawWord, wordIndex): RelatedWord | null => {
        if (!rawWord || typeof rawWord !== "object" || Array.isArray(rawWord)) {
          return null;
        }
        const wordSource = rawWord as RawRecord;
        const word = asText(wordSource.word || wordSource.kanji);
        const meaning = asText(wordSource.meaning || wordSource.exampleMeaning);
        if (!word || !meaning) {
          return null;
        }
        return {
          id: asText(wordSource.id) || `json-${entryIndex}-${wordIndex}-${word}`,
          sourceCharacter: character,
          word,
          reading: asText(wordSource.reading || wordSource.kana),
          kanji: asText(wordSource.kanji || word),
          hanviet: asText(wordSource.hanviet || wordSource.hanViet),
          meaning,
          sourceLabel: "JSON chủ động",
          sourceBucket: "json",
        };
      })
      .filter((item): item is RelatedWord => Boolean(item));

    groups.push({
      character,
      hanviet: asText(source.hanviet || source.hanViet),
      meaning: asText(source.meaning),
      jlptLevel: asText(source.jlptLevel),
      words: dedupeStudyItems(words),
    });
  }

  if (groups.length === 0) {
    return {
      groups: [],
      error: "Chưa tìm thấy Kanji nào có relatedVocabularies/relatedWords trong JSON.",
    };
  }

  return { groups, error: "" };
}

function dedupeStudyItems(words: RelatedWord[]): RelatedWord[] {
  return Array.from(
    new Map(words.map((word) => [`${word.kanji}|${word.reading}|${word.meaning}`, word])).values()
  );
}

function statLabel(count: number, label: string): string {
  return `${count.toLocaleString("vi-VN")} ${label}`;
}

function buildBaseHref(source: RelatedReviewSource, selectedLevel: string): string {
  const params = new URLSearchParams();
  params.set("source", source);
  if (source === "system") {
    params.set("level", selectedLevel);
  }
  return `/kanji/related-review?${params.toString()}`;
}

function getSourceMeta(item: RelatedWord) {
  return SOURCE_META[item.sourceBucket ?? "system"];
}

function sourceCounts(words: RelatedWord[]) {
  return words.reduce(
    (acc, item) => {
      const key = item.sourceBucket ?? "system";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );
}

function buildPageNumbers(currentPage: number, totalPages: number): number[] {
  const pages = new Set<number>([1, totalPages, currentPage, currentPage - 1, currentPage + 1]);
  return Array.from(pages)
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b);
}

export function KanjiRelatedReviewClient({
  initialChars,
  initialMode,
  initialSource,
  levelCounts,
  selectedLevel,
  systemGroups,
}: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const appliedInitialCharsRef = useRef(false);
  const [sourceMode, setSourceMode] = useState<RelatedReviewSource>(initialSource);
  const [rawInput, setRawInput] = useState(SAMPLE_JSON);
  const [jsonReady, setJsonReady] = useState(false);
  const [selectedCharacters, setSelectedCharacters] = useState<string[]>(initialChars);
  const [focusedCharacter, setFocusedCharacter] = useState(initialChars[0] ?? systemGroups[0]?.character ?? "");
  const [kanjiPage, setKanjiPage] = useState(1);
  const [message, setMessage] = useState("");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved?.trim()) {
        setRawInput(saved);
      }
    } catch {
      // Local storage is optional for this importer.
    } finally {
      setJsonReady(true);
    }
  }, []);

  useEffect(() => {
    if (!jsonReady) {
      return;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, rawInput);
    } catch {
      // Local storage is optional for this importer.
    }
  }, [jsonReady, rawInput]);

  const parsed = useMemo(() => parseRelatedReviewJson(rawInput), [rawInput]);
  const activeGroups = sourceMode === "system" ? systemGroups : parsed.groups;
  const activeGroupCharactersKey = activeGroups.map((group) => group.character).join("|");
  const initialCharsKey = initialChars.join("|");
  const kanjiTotalPages = Math.max(1, Math.ceil(activeGroups.length / KANJI_PAGE_SIZE));
  const kanjiPageSafe = Math.min(kanjiPage, kanjiTotalPages);
  const kanjiPageStart = (kanjiPageSafe - 1) * KANJI_PAGE_SIZE;
  const visibleGroups = activeGroups.slice(kanjiPageStart, kanjiPageStart + KANJI_PAGE_SIZE);
  const kanjiPageNumbers = buildPageNumbers(kanjiPageSafe, kanjiTotalPages);

  useEffect(() => {
    setKanjiPage(1);
  }, [activeGroupCharactersKey, sourceMode, selectedLevel]);

  useEffect(() => {
    setSelectedCharacters((prev) => {
      const available = new Set(activeGroups.map((group) => group.character));
      const initialKept = initialChars.filter((character) => available.has(character));
      if (!appliedInitialCharsRef.current && initialKept.length > 0) {
        appliedInitialCharsRef.current = true;
        return initialKept;
      }
      appliedInitialCharsRef.current = true;
      const kept = prev.filter((character) => available.has(character));
      return kept.length > 0 ? kept : activeGroups.map((group) => group.character);
    });
  }, [activeGroupCharactersKey, activeGroups, initialChars, initialCharsKey]);

  useEffect(() => {
    const available = new Set(activeGroups.map((group) => group.character));
    if (focusedCharacter && available.has(focusedCharacter)) {
      return;
    }
    setFocusedCharacter(activeGroups[0]?.character ?? "");
  }, [activeGroupCharactersKey, activeGroups, focusedCharacter]);

  const selectedSet = useMemo(() => new Set(selectedCharacters), [selectedCharacters]);
  const selectedGroups = useMemo(
    () => activeGroups.filter((group) => selectedSet.has(group.character)),
    [activeGroups, selectedSet]
  );
  const focusedGroup = useMemo(
    () =>
      activeGroups.find((group) => group.character === focusedCharacter) ??
      selectedGroups[0] ??
      activeGroups[0] ??
      null,
    [activeGroups, focusedCharacter, selectedGroups]
  );
  const studyItems = useMemo(
    () => dedupeStudyItems(selectedGroups.flatMap((group) => group.words)),
    [selectedGroups]
  );
  const totalWordCount = useMemo(
    () => dedupeStudyItems(activeGroups.flatMap((group) => group.words)).length,
    [activeGroups]
  );
  const focusedSourceCounts = useMemo(
    () => sourceCounts(focusedGroup?.words ?? []),
    [focusedGroup]
  );

  if (initialMode && sourceMode === "json" && !jsonReady) {
    return (
      <section className="mx-auto max-w-[760px] rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-[0_16px_42px_rgba(30,64,120,0.10)]">
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-amber-600">Đang nạp JSON</p>
        <h1 className="mt-2 text-2xl font-extrabold text-slate-950">Chuẩn bị bộ từ liên quan...</h1>
      </section>
    );
  }

  if (initialMode && studyItems.length > 0) {
    const backHref = buildBaseHref(sourceMode, selectedLevel);
    const titleSource = sourceMode === "system" ? `${selectedLevel} từ dữ liệu hệ thống` : "JSON chủ động";
    return (
      <VocabStudyClient
        lessonTitle={`Từ liên quan Kanji | ${titleSource} | ${studyItems.length} từ`}
        mode={initialMode}
        backHref={backHref}
        items={studyItems.map((item) => ({
          id: item.id,
          word: item.word,
          reading: item.reading,
          kanji: item.kanji,
          hanviet: item.hanviet,
          meaning: item.meaning,
        }))}
      />
    );
  }

  function toggleCharacter(character: string) {
    setFocusedCharacter(character);
    setSelectedCharacters((prev) =>
      prev.includes(character) ? prev.filter((item) => item !== character) : [...prev, character]
    );
  }

  function startStudy(mode: RelatedReviewMode) {
    setMessage("");
    if (studyItems.length === 0) {
      setMessage("Chọn ít nhất 1 Kanji có từ vựng liên quan trước khi học.");
      return;
    }
    const params = new URLSearchParams();
    params.set("mode", mode);
    params.set("source", sourceMode);
    if (sourceMode === "system") {
      params.set("level", selectedLevel);
    }
    params.set("chars", selectedCharacters.join(","));
    router.push(`/kanji/related-review?${params.toString()}`);
  }

  async function handleFile(file: File | null) {
    if (!file) {
      return;
    }
    try {
      const text = await file.text();
      setRawInput(text);
      setSourceMode("json");
      setMessage(`Đã nạp ${file.name}.`);
    } catch {
      setMessage("Không đọc được file JSON này.");
    }
  }

  function selectAll() {
    setSelectedCharacters(activeGroups.map((group) => group.character));
    setFocusedCharacter(activeGroups[0]?.character ?? "");
  }

  function clearSelected() {
    setSelectedCharacters([]);
    setFocusedCharacter(activeGroups[0]?.character ?? "");
  }

  function moveKanjiPage(nextPage: number) {
    const safePage = Math.min(Math.max(1, nextPage), kanjiTotalPages);
    setKanjiPage(safePage);
  }

  return (
    <section className="mx-auto max-w-[1240px] space-y-5 rounded-3xl border border-slate-200 bg-[#f8fbff] p-5 shadow-[0_16px_42px_rgba(30,64,120,0.10)] sm:p-7">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-teal-700">Kanji related vocab</p>
          <h1 className="mt-1 text-3xl font-extrabold text-slate-950">Ôn từ liên quan Kanji</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Chọn bộ N5/N4/N3 rồi bấm Kanji cần học. Web sẽ gom từ liên quan từ Kanji JSON, nguồn admin upload,
            dữ liệu cá nhân và từ vựng hệ thống. Nếu muốn học chủ động hơn, bạn vẫn có thể dán/upload JSON riêng.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-2xl font-black text-slate-900">{activeGroups.length}</p>
            <p className="text-xs font-semibold text-slate-500">Kanji</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-2xl font-black text-slate-900">{totalWordCount}</p>
            <p className="text-xs font-semibold text-slate-500">Từ có sẵn</p>
          </div>
          <div className="rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 shadow-sm">
            <p className="text-2xl font-black text-teal-800">{studyItems.length}</p>
            <p className="text-xs font-semibold text-teal-700">Đang chọn</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3">
        <div className="inline-flex rounded-full bg-slate-100 p-1 text-sm font-extrabold">
          <button
            type="button"
            onClick={() => {
              setSourceMode("system");
              setMessage("");
            }}
            className={`rounded-full px-4 py-2 transition ${
              sourceMode === "system" ? "bg-teal-700 text-white shadow-sm" : "text-slate-600 hover:bg-white"
            }`}
          >
            Kho hệ thống
          </button>
          <button
            type="button"
            onClick={() => {
              setSourceMode("json");
              setMessage("");
            }}
            className={`rounded-full px-4 py-2 transition ${
              sourceMode === "json" ? "bg-amber-500 text-white shadow-sm" : "text-slate-600 hover:bg-white"
            }`}
          >
            JSON chủ động
          </button>
        </div>

        {sourceMode === "system" ? (
          <div className="flex flex-wrap items-center gap-2">
            {JLPT_LEVELS.map((level) => (
              <Link
                key={level}
                href={`/kanji/related-review?source=system&level=${level}`}
                scroll={false}
                className={`rounded-full border px-3 py-1.5 text-xs font-black transition ${
                  selectedLevel === level
                    ? "border-teal-300 bg-teal-50 text-teal-800 shadow-sm"
                    : "border-slate-200 bg-white text-slate-600 hover:border-teal-200 hover:text-teal-700"
                }`}
              >
                {level} · {levelCounts[level] ?? 0}
              </Link>
            ))}
          </div>
        ) : null}
      </div>

      {sourceMode === "json" ? (
        <div className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <FileJson className="h-5 w-5 text-amber-600" aria-hidden="true" />
              <h2 className="text-lg font-bold text-slate-900">JSON nguồn chủ động</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-bold text-sky-800 hover:bg-sky-100"
              >
                <Upload className="h-4 w-4" aria-hidden="true" />
                Upload
              </button>
              <button
                type="button"
                onClick={() => {
                  setRawInput(SAMPLE_JSON);
                  setMessage("Đã nạp mẫu JSON.");
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800 hover:bg-emerald-100"
              >
                <Clipboard className="h-4 w-4" aria-hidden="true" />
                Dùng mẫu
              </button>
              <a
                href={`data:application/json;charset=utf-8,${encodeURIComponent(SAMPLE_JSON)}`}
                download="kanji-related-vocab-template.json"
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                <BookOpen className="h-4 w-4" aria-hidden="true" />
                Tải mẫu
              </a>
              <button
                type="button"
                onClick={() => {
                  setRawInput("");
                  setSelectedCharacters([]);
                  setMessage("");
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700 hover:bg-rose-100"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Xóa
              </button>
            </div>
          </div>
          <textarea
            value={rawInput}
            onChange={(event) => {
              setRawInput(event.target.value);
              setMessage("");
            }}
            spellCheck={false}
            className="mt-3 min-h-[300px] w-full resize-y rounded-2xl border border-slate-300 bg-slate-950 px-4 py-3 font-mono text-sm leading-6 text-slate-50 outline-none focus:border-amber-300 focus:ring-4 focus:ring-amber-100"
          />
          {parsed.error ? (
            <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
              {parsed.error}
            </p>
          ) : null}
        </div>
      ) : null}

      {message ? (
        <p className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-semibold text-teal-800">
          {message}
        </p>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.12fr)_390px]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {sourceMode === "system" ? (
                <Database className="h-5 w-5 text-teal-700" aria-hidden="true" />
              ) : (
                <Layers3 className="h-5 w-5 text-amber-600" aria-hidden="true" />
              )}
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  {sourceMode === "system" ? `Kanji trong bộ ${selectedLevel}` : "Kanji trong JSON"}
                </h2>
                <p className="text-xs font-semibold text-slate-500">
                  Bấm vào thẻ để xem từ liên quan bên phải, bấm lại để bỏ khỏi bộ ôn.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={selectAll}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                Chọn tất cả
              </button>
              <button
                type="button"
                onClick={clearSelected}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-50"
              >
                Bỏ chọn
              </button>
            </div>
          </div>

          {activeGroups.length === 0 ? (
            <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm font-semibold text-amber-800">
              {sourceMode === "system"
                ? `Chưa có Kanji nào trong bộ ${selectedLevel}. Bạn có thể import thêm Kanji cá nhân hoặc dùng JSON chủ động.`
                : "Chưa có dữ liệu để hiển thị."}
            </p>
          ) : (
            <>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {visibleGroups.map((group) => {
                  const active = selectedSet.has(group.character);
                  const focused = focusedGroup?.character === group.character;
                  return (
                  <button
                    key={group.character}
                    type="button"
                    onClick={() => toggleCharacter(group.character)}
                      className={`flex h-[146px] flex-col overflow-hidden rounded-2xl border p-3.5 text-left transition-colors duration-150 motion-reduce:transition-none ${
                        active
                          ? "border-teal-300 bg-teal-50 shadow-[0_10px_24px_rgba(13,148,136,0.12)]"
                          : "border-slate-200 bg-white hover:bg-slate-50"
                      } ${focused ? "outline outline-2 outline-offset-0 outline-teal-300/70" : ""}`}
                    >
                    <div className="flex min-h-0 flex-1 items-start justify-between gap-3">
                      <div>
                          <p className="font-kanji-art h-[52px] overflow-hidden text-[2.75rem] font-black leading-none text-slate-950">
                            {group.character}
                          </p>
                          <p className="mt-1.5 h-[38px] overflow-hidden text-sm font-bold leading-[19px] text-slate-700 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                            {group.hanviet || "Hán Việt"} · {group.meaning || "nghĩa"}
                          </p>
                        </div>
                        {active ? <CheckCircle2 className="h-5 w-5 text-teal-700" aria-hidden="true" /> : null}
                      </div>
                      <p className="mt-2 shrink-0 text-sm font-semibold leading-5 text-slate-500">
                        {statLabel(group.words.length, "từ liên quan")}
                      </p>
                    </button>
                  );
                })}
              </div>

              {kanjiTotalPages > 1 ? (
                <div className="mt-4 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 xl:grid-cols-[minmax(260px,1fr)_auto] xl:items-center">
                  <p className="min-w-0 text-sm font-semibold text-slate-500">
                    Trang {kanjiPageSafe}/{kanjiTotalPages} · Đang xem{" "}
                    {kanjiPageStart + 1}-{Math.min(kanjiPageStart + KANJI_PAGE_SIZE, activeGroups.length)} /{" "}
                    {activeGroups.length} Kanji
                  </p>
                  <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                    <button
                      type="button"
                      onClick={() => moveKanjiPage(kanjiPageSafe - 1)}
                      disabled={kanjiPageSafe <= 1}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:border-teal-200 hover:text-teal-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {"<- Trước"}
                    </button>
                    {kanjiPageNumbers.map((page, index) => {
                      const previous = kanjiPageNumbers[index - 1];
                      const needsGap = previous && page - previous > 1;
                      return (
                        <div key={page} className="flex items-center gap-2">
                          {needsGap ? <span className="text-xs text-slate-400">...</span> : null}
                          <button
                            type="button"
                            onClick={() => moveKanjiPage(page)}
                            className={`rounded-full px-3 py-1.5 text-xs font-black transition ${
                              page === kanjiPageSafe
                                ? "bg-teal-700 text-white shadow-sm"
                                : "border border-slate-200 bg-white text-slate-600 hover:border-teal-200 hover:text-teal-700"
                            }`}
                          >
                            {page}
                          </button>
                        </div>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => moveKanjiPage(kanjiPageSafe + 1)}
                      disabled={kanjiPageSafe >= kanjiTotalPages}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:border-teal-200 hover:text-teal-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {"Sau ->"}
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-orange-500" aria-hidden="true" />
              <h2 className="text-lg font-bold text-slate-900">Từ đang mở</h2>
            </div>

            {focusedGroup ? (
              <>
                <div className="mt-3 rounded-2xl bg-gradient-to-br from-teal-50 to-sky-50 p-4">
                  <p className="font-kanji-art text-5xl font-black leading-none text-slate-950">{focusedGroup.character}</p>
                  <p className="mt-2 text-sm font-extrabold text-slate-700">
                    {focusedGroup.hanviet || "Hán Việt"} · {focusedGroup.meaning || "nghĩa"}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {Object.entries(focusedSourceCounts).map(([key, count]) => {
                      const meta = SOURCE_META[key as keyof typeof SOURCE_META] ?? SOURCE_META.system;
                      return (
                        <span key={key} className={`rounded-full px-2.5 py-1 text-[11px] font-black ${meta.className}`}>
                          {meta.label}: {count}
                        </span>
                      );
                    })}
                  </div>
                </div>

                {focusedGroup.words.length === 0 ? (
                  <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm font-semibold text-amber-800">
                    Chưa có từ liên quan cho chữ này. Nếu bạn muốn học chủ động, chuyển sang tab JSON chủ động để thêm.
                  </p>
                ) : (
                  <div className="mt-3 max-h-[520px] space-y-2 overflow-y-auto pr-1">
                    {focusedGroup.words.map((item) => {
                      const meta = getSourceMeta(item);
                      return (
                        <article key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="break-words text-xl font-black leading-tight text-slate-950">
                                {item.kanji || item.word}
                                {item.reading ? (
                                  <span className="ml-2 text-sm font-bold text-slate-500">({item.reading})</span>
                                ) : null}
                              </p>
                              <p className="mt-1 break-words text-sm font-semibold text-slate-700">
                                {item.hanviet ? `${item.hanviet.toUpperCase()} - ` : ""}
                                {item.meaning}
                              </p>
                              <p className="mt-1 truncate text-[11px] font-semibold text-slate-400">
                                {item.sourceLabel || meta.label}
                              </p>
                            </div>
                            <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black ${meta.className}`}>
                              {meta.label}
                            </span>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                Chưa chọn Kanji nào.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900">Bắt đầu ôn</h2>
            <p className="mt-1 text-sm text-slate-500">
              Bộ ôn hiện có {selectedGroups.length} Kanji và {studyItems.length} từ sau khi trộn, khử trùng lặp.
            </p>
            <div className="mt-4 grid gap-2">
              <button
                type="button"
                onClick={() => startStudy("flashcard")}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-3 text-base font-extrabold text-white shadow-sm hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={studyItems.length === 0}
              >
                <Play className="h-5 w-5" aria-hidden="true" />
                Flashcard từ liên quan
              </button>
              <button
                type="button"
                onClick={() => startStudy("quiz")}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-base font-extrabold text-sky-800 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={studyItems.length === 0}
              >
                <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                Trắc nghiệm nhanh
              </button>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
