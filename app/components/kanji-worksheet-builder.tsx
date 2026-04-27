"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { extractKanjiChars, parseCustomKanjiInput } from "@/lib/kanji-worksheet";

type WorksheetKanjiOption = {
  id: string;
  character: string;
  meaning: string;
  onReading: string;
  kunReading: string;
  strokeHint: string;
  strokeCount: number;
  jlptLevel: string;
  source: "core" | "personal";
};

type Props = {
  items: WorksheetKanjiOption[];
  initialQuery: string;
  initialLevel: string;
  initialPickedIds: string[];
  initialSource?: SourceFilter;
};

type SourceFilter = "all" | "core" | "personal";

const LEVELS = ["ALL", "N5", "N4", "N3", "N2", "N1"] as const;
const SOURCE_FILTERS: Array<{ value: SourceFilter; label: string }> = [
  { value: "all", label: "Tất cả nguồn" },
  { value: "personal", label: "Cá nhân" },
  { value: "core", label: "Hệ thống" },
];
const LEVEL_ORDER: Record<string, number> = {
  N5: 0,
  N4: 1,
  N3: 2,
  N2: 3,
  N1: 4,
};

function normalizeLevel(input: string): string {
  const normalized = input.toUpperCase();
  return LEVELS.includes(normalized as (typeof LEVELS)[number]) ? normalized : "ALL";
}

function normalizeSource(input: string): SourceFilter {
  if (input === "core" || input === "personal") {
    return input;
  }
  return "all";
}

function normalizePickedIds(initialPickedIds: string[], validIds: Set<string>): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const id of initialPickedIds) {
    if (!validIds.has(id) || seen.has(id)) {
      continue;
    }
    seen.add(id);
    output.push(id);
  }
  return output;
}

function katakanaToHiragana(value: string): string {
  return value.replace(/[\u30a1-\u30f6]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0x60)
  );
}

function normalizeForSearch(value: string): string {
  return katakanaToHiragana(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function tokenizeSearch(value: string): string[] {
  return normalizeForSearch(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function parseStrokeFilter(value: string): number | null {
  if (!value.trim()) {
    return null;
  }
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed)) {
    return null;
  }
  const rounded = Math.floor(parsed);
  if (rounded < 1 || rounded > 40) {
    return null;
  }
  return rounded;
}

function buildSearchIndex(item: WorksheetKanjiOption): string {
  return normalizeForSearch(
    [
      item.character,
      item.meaning,
      item.onReading,
      item.kunReading,
      item.strokeHint,
      item.jlptLevel,
      item.source === "personal" ? "cá nhân" : "hệ thống",
      String(item.strokeCount),
      `nét ${item.strokeCount}`,
    ].join(" ")
  );
}

function scoreItem(
  item: WorksheetKanjiOption,
  normalizedQuery: string,
  tokens: string[]
): number {
  if (!normalizedQuery && tokens.length === 0) {
    return 0;
  }

  const charNorm = normalizeForSearch(item.character);
  const meaningNorm = normalizeForSearch(item.meaning);
  const onNorm = normalizeForSearch(item.onReading);
  const kunNorm = normalizeForSearch(item.kunReading);
  const indexNorm = buildSearchIndex(item);

  let score = 0;
  if (normalizedQuery) {
    if (charNorm === normalizedQuery) score += 140;
    if (meaningNorm === normalizedQuery) score += 120;
    if (onNorm === normalizedQuery || kunNorm === normalizedQuery) score += 95;
    if (meaningNorm.includes(normalizedQuery)) score += 55;
    if (onNorm.includes(normalizedQuery) || kunNorm.includes(normalizedQuery)) score += 48;
    if (indexNorm.includes(normalizedQuery)) score += 20;
  }

  for (const token of tokens) {
    if (charNorm === token) {
      score += 45;
      continue;
    }
    if (charNorm.includes(token)) score += 20;
    if (meaningNorm.includes(token)) score += 14;
    if (onNorm.includes(token) || kunNorm.includes(token)) score += 14;
  }

  return score;
}

function sourceLabel(source: WorksheetKanjiOption["source"]): string {
  return source === "personal" ? "Cá nhân" : "Hệ thống";
}

export function KanjiWorksheetBuilder({
  items,
  initialQuery,
  initialLevel,
  initialPickedIds,
  initialSource = "all",
}: Props) {
  const validIds = useMemo(() => new Set(items.map((item) => item.id)), [items]);
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    normalizePickedIds(initialPickedIds, validIds)
  );
  const [query, setQuery] = useState(initialQuery);
  const [level, setLevel] = useState(normalizeLevel(initialLevel));
  const [source, setSource] = useState<SourceFilter>(normalizeSource(initialSource));
  const [strokeInput, setStrokeInput] = useState("");
  const [boxCount, setBoxCount] = useState(10);
  const [sheetTitle, setSheetTitle] = useState("Kanji Writing Worksheet");
  const [customInput, setCustomInput] = useState("");

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const selectedItems = useMemo(
    () =>
      selectedIds
        .map((id) => itemById.get(id))
        .filter((item): item is WorksheetKanjiOption => Boolean(item)),
    [itemById, selectedIds]
  );

  const normalizedQuery = useMemo(() => normalizeForSearch(query), [query]);
  const queryTokens = useMemo(() => tokenizeSearch(query), [query]);
  const strokeFilter = useMemo(() => parseStrokeFilter(strokeInput), [strokeInput]);

  const filteredItems = useMemo(() => {
    const scored: Array<{ item: WorksheetKanjiOption; score: number }> = [];

    for (const item of items) {
      if (level !== "ALL" && item.jlptLevel !== level) {
        continue;
      }
      if (source !== "all" && item.source !== source) {
        continue;
      }
      if (strokeFilter !== null && item.strokeCount !== strokeFilter) {
        continue;
      }

      const index = buildSearchIndex(item);
      const tokenMatched =
        queryTokens.length === 0 || queryTokens.every((token) => index.includes(token));
      if (!tokenMatched) {
        continue;
      }

      scored.push({
        item,
        score: scoreItem(item, normalizedQuery, queryTokens),
      });
    }

    scored.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      const levelDelta =
        (LEVEL_ORDER[a.item.jlptLevel] ?? 99) - (LEVEL_ORDER[b.item.jlptLevel] ?? 99);
      if (levelDelta !== 0) {
        return levelDelta;
      }
      if (a.item.source !== b.item.source) {
        return a.item.source === "personal" ? -1 : 1;
      }
      return a.item.character.localeCompare(b.item.character, "ja");
    });

    return scored.map((entry) => entry.item);
  }, [items, level, normalizedQuery, queryTokens, source, strokeFilter]);

  const customRows = useMemo(() => parseCustomKanjiInput(customInput), [customInput]);
  const customChars = useMemo(() => extractKanjiChars(customInput), [customInput]);
  const canBuild = selectedIds.length > 0 || customChars.length > 0;

  const printHref = useMemo(() => {
    const params = new URLSearchParams();
    if (selectedIds.length > 0) {
      params.set("ids", selectedIds.join(","));
    }
    if (customInput.trim()) {
      params.set("custom", customInput);
    }
    params.set("boxes", String(boxCount));
    if (sheetTitle.trim()) {
      params.set("title", sheetTitle.trim());
    }
    return `/kanji/worksheet/print?${params.toString()}`;
  }, [boxCount, customInput, selectedIds, sheetTitle]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id);
      }
      return [...prev, id];
    });
  }

  function removeSelected(id: string) {
    setSelectedIds((prev) => prev.filter((item) => item !== id));
  }

  function clearSelected() {
    setSelectedIds([]);
  }

  function addFromFiltered(limit: number | null) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      let added = 0;

      for (const item of filteredItems) {
        if (!next.has(item.id)) {
          next.add(item.id);
          added += 1;
        }
        if (limit !== null && added >= limit) {
          break;
        }
      }

      return Array.from(next);
    });
  }

  function resetFilters() {
    setQuery("");
    setLevel("ALL");
    setSource("all");
    setStrokeInput("");
  }

  const hasFilter =
    query.trim().length > 0 || level !== "ALL" || source !== "all" || strokeInput.trim().length > 0;

  return (
    <div className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
      <section className="rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900">Thư viện Kanji để in</h2>
            <p className="text-sm text-slate-600">
              Tìm nhanh theo chữ, nghĩa, kana, số nét và nguồn dữ liệu.
            </p>
          </div>
          <p className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            Đã chọn: {selectedIds.length}
          </p>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-[1fr_125px_140px_110px]">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tim: 低, tei, hikui, thap..."
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
          />
          <select
            value={level}
            onChange={(event) => setLevel(normalizeLevel(event.target.value))}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
          >
            {LEVELS.map((item) => (
              <option key={item} value={item}>
                {item === "ALL" ? "Tất cả cấp" : item}
              </option>
            ))}
          </select>
          <select
            value={source}
            onChange={(event) => setSource(normalizeSource(event.target.value))}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
          >
            {SOURCE_FILTERS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <input
            value={strokeInput}
            onChange={(event) => setStrokeInput(event.target.value)}
            placeholder="Số nét"
            inputMode="numeric"
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">
            Thư viện: {items.length}
          </span>
          <span className="rounded-full bg-sky-100 px-3 py-1 font-semibold text-sky-700">
            Ket qua: {filteredItems.length}
          </span>
          <span className="rounded-full bg-emerald-100 px-3 py-1 font-semibold text-emerald-700">
            Đã chọn: {selectedItems.length}
          </span>
          {hasFilter ? (
            <button
              type="button"
              onClick={resetFilters}
              className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 font-semibold text-amber-700 hover:bg-amber-100"
            >
              Bỏ lọc
            </button>
          ) : null}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => addFromFiltered(20)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            disabled={filteredItems.length === 0}
          >
            Thêm 20 kết quả đầu
          </button>
          <button
            type="button"
            onClick={() => addFromFiltered(null)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            disabled={filteredItems.length === 0}
          >
            Thêm tất cả kết quả
          </button>
        </div>

        <div className="mt-4 max-h-[520px] space-y-2 overflow-y-auto pr-1">
          {filteredItems.slice(0, 260).map((item) => {
            const selected = selectedSet.has(item.id);
            return (
              <article
                key={item.id}
                className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 transition ${
                  selected
                    ? "border-emerald-300 bg-emerald-50"
                    : "border-slate-200 bg-white hover:border-sky-200 hover:bg-sky-50/40"
                }`}
              >
                <div className="min-w-0">
                  <p className="truncate text-lg font-bold text-slate-900">{item.character}</p>
                  <p className="truncate text-sm font-semibold text-slate-700">{item.meaning}</p>
                  <p className="truncate text-xs text-slate-500">
                    {item.onReading || "-"} | {item.kunReading || "-"}
                  </p>
                  <p className="truncate text-[11px] text-slate-500">
                    {item.jlptLevel} - {sourceLabel(item.source)} - {item.strokeCount} nét
                  </p>
                  {item.strokeHint ? (
                    <p className="truncate text-[11px] text-amber-700">Nét: {item.strokeHint}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => toggleSelect(item.id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    selected
                      ? "bg-emerald-600 text-white hover:bg-emerald-500"
                      : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {selected ? "Đã thêm" : "Thêm"}
                </button>
              </article>
            );
          })}

          {filteredItems.length === 0 ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
              Không tìm thấy Kanji phù hợp. Thử bớt bộ lọc hoặc đổi từ khóa.
            </p>
          ) : null}
        </div>
      </section>

      <section className="space-y-4 rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-sm">
        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Danh sách sẽ in ({selectedItems.length})
            </p>
            {selectedItems.length > 0 ? (
              <button
                type="button"
                onClick={clearSelected}
                className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
              >
                Xóa tất cả
              </button>
            ) : null}
          </div>

          {selectedItems.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">Chưa chọn Kanji nào từ thư viện.</p>
          ) : (
            <div className="mt-2 max-h-48 space-y-2 overflow-y-auto pr-1">
              {selectedItems.map((item) => (
                <article
                  key={item.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-base font-bold text-slate-900">{item.character}</p>
                    <p className="truncate text-xs text-slate-500">
                      {item.meaning} - {item.jlptLevel}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeSelected(item.id)}
                    className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Xóa
                  </button>
                </article>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="text-xl font-extrabold text-slate-900">Tự nhập Kanji ngoài hệ thống</h2>
          <p className="text-sm text-slate-600">
            Mỗi dòng: <code>Kanji|Nghĩa|Reading|Hướng dẫn nét</code> (hoặc dán chữ Kanji bất kỳ).
          </p>
        </div>

        <textarea
          value={customInput}
          onChange={(event) => setCustomInput(event.target.value)}
          className="min-h-40 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
          placeholder={
            "Ví dụ:\n\u68EE|rừng|mori|1 nét trái, 2 nét phải\n\u8A9E|ngữ ngôn|go|1 bộ ngôn bên trái, 2 phần bên phải\n\u96A3"
          }
        />

        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          Kanji tự nhập: <span className="font-semibold text-slate-800">{customChars.length}</span>
          {customRows.length > 0 ? (
            <span className="ml-2 text-xs text-slate-500">
              ({customRows.slice(0, 8).map((row) => row.character).join(" - ")}
              {customRows.length > 8 ? " ..." : ""})
            </span>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Tiêu đề file
            </span>
            <input
              value={sheetTitle}
              onChange={(event) => setSheetTitle(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              So o luyen/vong
            </span>
            <select
              value={boxCount}
              onChange={(event) => setBoxCount(Number(event.target.value))}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
            >
              {[8, 10, 12, 14].map((value) => (
                <option key={value} value={value}>
                  {value} ô
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={canBuild ? printHref : "#"}
            target="_blank"
            rel="noreferrer"
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              canBuild
                ? "bg-emerald-600 text-white hover:bg-emerald-500"
                : "pointer-events-none cursor-not-allowed bg-slate-100 text-slate-400"
            }`}
          >
            Tạo trang in PDF
          </Link>
          <p className="text-xs text-slate-500">Mở trang in mới, rồi bấm Ctrl+P để lưu PDF.</p>
        </div>
      </section>
    </div>
  );
}
