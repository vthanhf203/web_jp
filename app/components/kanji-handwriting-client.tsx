"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { HandwrittenJapaneseText, HandwrittenKanjiGlyph } from "@/app/components/kanji-handwriting-glyph";
import type { HandwritingSource, KanjiHandwritingItem } from "@/lib/kanji-handwriting-types";

type Props = {
  items: KanjiHandwritingItem[];
  initialQuery?: string;
  initialLevel?: string;
  initialSource?: SourceFilter;
};

type SourceFilter = "all" | HandwritingSource;
type ViewMode = "handwriting" | "machine" | "compare";

const LEVELS = ["ALL", "N5", "N4", "N3", "N2", "N1"] as const;
const SOURCE_FILTERS: Array<{ value: SourceFilter; label: string }> = [
  { value: "all", label: "Tất cả nguồn" },
  { value: "core", label: "Hệ thống" },
  { value: "personal", label: "Cá nhân" },
  { value: "mixed", label: "Cả hai" },
];
const LEVEL_ORDER: Record<string, number> = {
  N5: 0,
  N4: 1,
  N3: 2,
  N2: 3,
  N1: 4,
};

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

function normalizeLevel(input: string): string {
  const normalized = input.toUpperCase();
  return LEVELS.includes(normalized as (typeof LEVELS)[number]) ? normalized : "ALL";
}

function normalizeSource(input: string | undefined): SourceFilter {
  return input === "core" || input === "personal" || input === "mixed" ? input : "all";
}

function buildSearchIndex(item: KanjiHandwritingItem): string {
  return normalizeForSearch(
    [
      item.character,
      item.meaning,
      item.hanviet,
      item.onReading,
      item.kunReading,
      item.strokeHint,
      item.radical?.symbol,
      item.radical?.name,
      item.radical?.meaning,
      item.structure?.formula,
      item.structure?.meaning,
      item.tags.join(" "),
      item.deckNames.join(" "),
      item.relatedWords.map((word) => `${word.word} ${word.reading} ${word.meaning}`).join(" "),
      item.jlptLevel,
      `${item.strokeCount} nét`,
      item.sourceLabel,
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function scoreItem(item: KanjiHandwritingItem, normalizedQuery: string, tokens: string[]): number {
  if (!normalizedQuery && tokens.length === 0) {
    return 0;
  }

  const character = normalizeForSearch(item.character);
  const meaning = normalizeForSearch(item.meaning);
  const onReading = normalizeForSearch(item.onReading);
  const kunReading = normalizeForSearch(item.kunReading);
  const index = buildSearchIndex(item);
  let score = 0;

  if (normalizedQuery) {
    if (character === normalizedQuery) score += 160;
    if (meaning === normalizedQuery) score += 120;
    if (onReading === normalizedQuery || kunReading === normalizedQuery) score += 90;
    if (meaning.includes(normalizedQuery)) score += 52;
    if (onReading.includes(normalizedQuery) || kunReading.includes(normalizedQuery)) score += 44;
    if (index.includes(normalizedQuery)) score += 18;
  }

  for (const token of tokens) {
    if (character === token) score += 50;
    if (meaning.includes(token)) score += 14;
    if (index.includes(token)) score += 6;
  }

  return score;
}

function parseStrokeFilter(value: string): number | null {
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed)) {
    return null;
  }
  const rounded = Math.floor(parsed);
  return rounded >= 1 && rounded <= 40 ? rounded : null;
}

function sourceBadge(source: HandwritingSource): string {
  if (source === "mixed") return "Cả hai";
  return source === "personal" ? "Cá nhân" : "Hệ thống";
}

function matchesSourceFilter(itemSource: HandwritingSource, filter: SourceFilter): boolean {
  if (filter === "all") {
    return true;
  }
  if (filter === "mixed") {
    return itemSource === "mixed";
  }
  if (filter === "personal") {
    return itemSource === "personal" || itemSource === "mixed";
  }
  return itemSource === "core" || itemSource === "mixed";
}

function buildPrintHref(path: string, selectedIds: string[], title: string, extra?: Record<string, string>) {
  const params = new URLSearchParams();
  if (selectedIds.length > 0) {
    params.set("ids", selectedIds.join(","));
  }
  if (title.trim()) {
    params.set("title", title.trim());
  }
  for (const [key, value] of Object.entries(extra ?? {})) {
    if (value.trim()) {
      params.set(key, value);
    }
  }
  return `${path}?${params.toString()}`;
}

function renderCardGlyph(item: KanjiHandwritingItem, viewMode: ViewMode) {
  if (viewMode === "machine") {
    return (
      <span lang="ja" className="font-kanji text-6xl font-semibold leading-none text-slate-900">
        {item.character}
      </span>
    );
  }

  if (viewMode === "compare") {
    return (
      <div className="flex items-center gap-3">
        <HandwrittenKanjiGlyph
          character={item.character}
          className="h-16 w-16 text-slate-900"
          fallbackClassName="font-kanji text-6xl font-semibold leading-none text-slate-900"
        />
        <span className="h-12 w-px bg-slate-200" aria-hidden="true" />
        <span lang="ja" className="font-kanji text-5xl font-semibold leading-none text-slate-500">
          {item.character}
        </span>
      </div>
    );
  }

  return (
    <HandwrittenKanjiGlyph
      character={item.character}
      className="h-20 w-20 text-slate-900"
      fallbackClassName="font-kanji text-6xl font-semibold leading-none text-slate-900"
    />
  );
}

export function KanjiHandwritingClient({
  items,
  initialQuery = "",
  initialLevel = "ALL",
  initialSource = "all",
}: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [level, setLevel] = useState(normalizeLevel(initialLevel));
  const [source, setSource] = useState<SourceFilter>(normalizeSource(initialSource));
  const [deckFilter, setDeckFilter] = useState("ALL");
  const [strokeInput, setStrokeInput] = useState("");
  const [relatedOnly, setRelatedOnly] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("handwriting");
  const [visibleCount, setVisibleCount] = useState(48);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeId, setActiveId] = useState(items[0]?.id ?? "");
  const [documentTitle, setDocumentTitle] = useState("Kanji viết tay");
  const [boxCount, setBoxCount] = useState("10");

  const normalizedQuery = useMemo(() => normalizeForSearch(query), [query]);
  const queryTokens = useMemo(() => tokenizeSearch(query), [query]);
  const strokeFilter = useMemo(() => parseStrokeFilter(strokeInput), [strokeInput]);
  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedItems = useMemo(
    () => selectedIds.map((id) => itemById.get(id)).filter((item): item is KanjiHandwritingItem => Boolean(item)),
    [itemById, selectedIds]
  );
  const deckOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      for (const deckName of item.deckNames) {
        const cleanDeckName = deckName.trim();
        if (!cleanDeckName) {
          continue;
        }
        counts.set(cleanDeckName, (counts.get(cleanDeckName) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "vi"));
  }, [items]);
  const personalDeckItemCount = useMemo(
    () => items.filter((item) => item.deckNames.length > 0).length,
    [items]
  );

  const filteredItems = useMemo(() => {
    const scored: Array<{ item: KanjiHandwritingItem; score: number }> = [];
    for (const item of items) {
      if (!matchesSourceFilter(item.source, source)) continue;
      if (deckFilter !== "ALL" && !item.deckNames.includes(deckFilter)) continue;
      if (source !== "personal" && level !== "ALL" && item.jlptLevel !== level) continue;
      if (relatedOnly && item.relatedWords.length === 0) continue;
      if (strokeFilter !== null && item.strokeCount !== strokeFilter) continue;

      const index = buildSearchIndex(item);
      if (queryTokens.length > 0 && !queryTokens.every((token) => index.includes(token))) {
        continue;
      }

      scored.push({
        item,
        score: scoreItem(item, normalizedQuery, queryTokens),
      });
    }

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const levelDiff = (LEVEL_ORDER[a.item.jlptLevel] ?? 99) - (LEVEL_ORDER[b.item.jlptLevel] ?? 99);
      if (levelDiff !== 0) return levelDiff;
      const strokeDiff = a.item.strokeCount - b.item.strokeCount;
      if (strokeDiff !== 0) return strokeDiff;
      return a.item.character.localeCompare(b.item.character, "ja");
    });

    return scored.map((entry) => entry.item);
  }, [deckFilter, items, level, normalizedQuery, queryTokens, relatedOnly, source, strokeFilter]);

  const visibleItems = filteredItems.slice(0, visibleCount);
  const activeItem = itemById.get(activeId) ?? filteredItems[0] ?? null;
  const listPrintHref = buildPrintHref("/kanji/handwriting/print", selectedIds, documentTitle);
  const worksheetPrintHref = buildPrintHref("/kanji/handwriting/worksheet/print", selectedIds, `${documentTitle} - luyện viết`, {
    boxes: boxCount,
  });
  const canPrint = selectedIds.length > 0;

  useEffect(() => {
    setVisibleCount(48);
  }, [deckFilter, level, normalizedQuery, relatedOnly, source, strokeInput]);

  useEffect(() => {
    const activeIsVisible = filteredItems.some((item) => item.id === activeId);
    if (!activeIsVisible && filteredItems[0]) {
      setActiveId(filteredItems[0].id);
    }
  }, [activeId, filteredItems]);

  function toggleSelected(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }

  function addFiltered(limit: number | null) {
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
    setDeckFilter("ALL");
    setStrokeInput("");
    setRelatedOnly(false);
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_420px]">
      <section className="rounded-[2rem] border border-slate-200 bg-white/88 p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Handwriting library</p>
            <h2 className="mt-1 text-2xl font-black text-slate-950">Danh sách Kanji viết tay</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Kanji chính được render bằng KanjiVG để nhìn theo dáng tập viết; từ liên quan vẫn giữ kana dễ đọc.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-bold">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">{items.length} Kanji</span>
            <span className="rounded-full bg-sky-100 px-3 py-1 text-sky-700">{filteredItems.length} kết quả</span>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">{selectedIds.length} đã chọn</span>
          </div>
        </div>

        {deckOptions.length > 0 ? (
          <div className="mt-4 grid gap-2 rounded-[1.6rem] bg-white/78 p-2 shadow-[0_12px_28px_rgba(15,23,42,0.07)] sm:grid-cols-2 lg:grid-cols-4">
            <button
              type="button"
              onClick={() => {
                setSource("personal");
                setLevel("ALL");
                setDeckFilter("ALL");
              }}
              className={`rounded-2xl px-4 py-3 text-left transition ${
                source === "personal" && deckFilter === "ALL"
                  ? "bg-gradient-to-br from-sky-100 to-cyan-100 text-slate-950"
                  : "bg-white text-slate-500 hover:bg-slate-50"
              }`}
            >
              <span className="block text-xs font-black uppercase tracking-[0.2em]">Tất cả cá nhân</span>
              <span className="mt-1 block text-xs font-bold">{personalDeckItemCount} ký tự</span>
            </button>
            {deckOptions.map((deck) => (
              <button
                key={deck.name}
                type="button"
                onClick={() => {
                  setSource("personal");
                  setLevel("ALL");
                  setDeckFilter(deck.name);
                }}
                className={`rounded-2xl px-4 py-3 text-left transition ${
                  source === "personal" && deckFilter === deck.name
                    ? "bg-gradient-to-br from-sky-100 to-cyan-100 text-slate-950"
                    : "bg-white text-slate-500 hover:bg-slate-50"
                }`}
              >
                <span className="line-clamp-1 block text-xs font-black uppercase tracking-[0.2em]">{deck.name}</span>
                <span className="mt-1 block text-xs font-bold">{deck.count} ký tự</span>
              </button>
            ))}
          </div>
        ) : null}

        <div className="mt-4 grid gap-2 md:grid-cols-[1fr_118px_140px_105px]">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tìm Kanji, nghĩa, On/Kun, từ liên quan..."
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
          />
          <select
            value={level}
            onChange={(event) => setLevel(normalizeLevel(event.target.value))}
            className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
          >
            {LEVELS.map((item) => (
              <option key={item} value={item}>
                {item === "ALL" ? "Tất cả" : item}
              </option>
            ))}
          </select>
          <select
            value={source}
            onChange={(event) => {
              const nextSource = normalizeSource(event.target.value);
              setSource(nextSource);
              if (nextSource !== "personal") {
                setDeckFilter("ALL");
              }
            }}
            className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
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
            className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {(["handwriting", "machine", "compare"] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={`rounded-full px-3 py-1.5 text-xs font-black uppercase tracking-[0.12em] transition ${
                viewMode === mode
                  ? "bg-slate-950 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {mode === "handwriting" ? "Viết tay" : mode === "machine" ? "Chữ máy" : "So sánh"}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setRelatedOnly((value) => !value)}
            className={`rounded-full px-3 py-1.5 text-xs font-black uppercase tracking-[0.12em] transition ${
              relatedOnly
                ? "bg-emerald-600 text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            Chỉ Kanji có từ liên quan
          </button>
          <button
            type="button"
            onClick={resetFilters}
            className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-black uppercase tracking-[0.12em] text-amber-700 hover:bg-amber-100"
          >
            Bỏ lọc
          </button>
        </div>
        {source === "personal" && level !== "ALL" ? (
          <p className="mt-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
            Đang xem nguồn cá nhân nên tạm bỏ lọc cấp JLPT để hiện đủ Kanji bạn đã upload.
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => addFiltered(24)}
            disabled={filteredItems.length === 0}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            Chọn 24 kết quả đầu
          </button>
          <button
            type="button"
            onClick={() => addFiltered(null)}
            disabled={filteredItems.length === 0}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            Chọn tất cả kết quả lọc
          </button>
          <button
            type="button"
            onClick={() => setSelectedIds([])}
            disabled={selectedIds.length === 0}
            className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
          >
            Xóa chọn
          </button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {visibleItems.map((item) => {
            const selected = selectedSet.has(item.id);
            const active = activeItem?.id === item.id;
            return (
              <article
                key={item.id}
                className={`rounded-3xl border p-4 transition ${
                  active
                    ? "border-emerald-300 bg-emerald-50/70 shadow-[0_16px_34px_rgba(16,185,129,0.12)]"
                    : "border-slate-200 bg-white/92 hover:border-emerald-200 hover:bg-emerald-50/35"
                }`}
              >
                <button type="button" onClick={() => setActiveId(item.id)} className="block w-full text-left">
                  <div className="flex items-start justify-between gap-3">
                    <div className="grid h-24 w-24 shrink-0 place-items-center rounded-3xl border border-slate-200 bg-[#f8fbff] text-slate-950 shadow-inner">
                      {renderCardGlyph(item, viewMode)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-600">
                          {item.jlptLevel}
                        </span>
                        <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-black text-sky-700">
                          {item.strokeCount} nét
                        </span>
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700">
                          {sourceBadge(item.source)}
                        </span>
                      </div>
                      <h3 className="mt-2 line-clamp-2 text-lg font-black leading-6 text-slate-950">{item.meaning}</h3>
                      <p className="mt-1 line-clamp-1 text-xs font-bold text-slate-500">
                        On: <span lang="ja" className="font-kanji">{item.onReading || "-"}</span> · Kun:{" "}
                        <span lang="ja" className="font-kanji">{item.kunReading || "-"}</span>
                      </p>
                      {item.radical ? (
                        <p className="mt-1 line-clamp-1 text-xs font-bold text-slate-500">
                          Bộ: <span lang="ja" className="font-kanji">{item.radical.symbol}</span>{" "}
                          {item.radical.meaning || item.radical.name}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  {item.relatedWords.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {item.relatedWords.slice(0, 3).map((word) => (
                        <span
                          key={word.id}
                          className="inline-flex max-w-full items-center rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-600"
                        >
                          <HandwrittenJapaneseText
                            text={word.word || word.kanji}
                            glyphClassName="h-4 w-4"
                            kanaClassName="font-kanji"
                            strokeWidth={5}
                          />
                        </span>
                      ))}
                      {item.relatedWords.length > 3 ? (
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-black text-slate-500">
                          +{item.relatedWords.length - 3}
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    <p className="mt-3 text-xs font-semibold text-slate-400">Chưa có từ liên quan.</p>
                  )}
                </button>

                <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                  <button
                    type="button"
                    onClick={() => toggleSelected(item.id)}
                    className={`rounded-xl px-3 py-2 text-xs font-black uppercase tracking-[0.12em] transition ${
                      selected
                        ? "bg-emerald-600 text-white hover:bg-emerald-500"
                        : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {selected ? "Đã chọn" : "Chọn in"}
                  </button>
                  <Link
                    href={`/kanji/write-flashcard`}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-slate-600 transition hover:bg-slate-50"
                  >
                    Luyện viết
                  </Link>
                </div>
              </article>
            );
          })}
        </div>

        {visibleCount < filteredItems.length ? (
          <div className="mt-5 flex justify-center">
            <button
              type="button"
              onClick={() => setVisibleCount((count) => count + 48)}
              className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white transition hover:bg-slate-800"
            >
              Hiện thêm Kanji
            </button>
          </div>
        ) : null}

        {filteredItems.length === 0 ? (
          <p className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
            Không tìm thấy Kanji phù hợp. Thử bỏ bớt bộ lọc hoặc đổi từ khóa nhé.
          </p>
        ) : null}
      </section>

      <aside className="space-y-4">
        <section className="sticky top-28 rounded-[2rem] border border-slate-200 bg-white/92 p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Xuất PDF</p>
          <h2 className="mt-1 text-xl font-black text-slate-950">Kanji viết tay + từ liên quan</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Chọn Kanji ở danh sách bên trái, rồi xuất dạng danh sách học hoặc phiếu luyện viết.
          </p>

          <label className="mt-4 block space-y-1">
            <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Tên file/trang</span>
            <input
              value={documentTitle}
              onChange={(event) => setDocumentTitle(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
            />
          </label>

          <label className="mt-3 block space-y-1">
            <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Ô luyện mỗi dòng</span>
            <select
              value={boxCount}
              onChange={(event) => setBoxCount(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
            >
              {[8, 10, 12, 14].map((value) => (
                <option key={value} value={value}>
                  {value} ô
                </option>
              ))}
            </select>
          </label>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                Đã chọn {selectedItems.length}
              </p>
              {selectedIds.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setSelectedIds([])}
                  className="rounded-lg border border-rose-200 bg-white px-2 py-1 text-[11px] font-bold text-rose-700"
                >
                  Xóa
                </button>
              ) : null}
            </div>
            {selectedItems.length > 0 ? (
              <div className="mt-2 max-h-32 overflow-y-auto pr-1 text-xs font-bold text-slate-600">
                {selectedItems.slice(0, 36).map((item) => item.character).join("、")}
                {selectedItems.length > 36 ? ` ... +${selectedItems.length - 36}` : ""}
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-500">Chưa chọn Kanji nào.</p>
            )}
          </div>

          <div className="mt-4 grid gap-2">
            <Link
              href={canPrint ? listPrintHref : "#"}
              target="_blank"
              rel="noreferrer"
              className={`rounded-2xl px-4 py-3 text-center text-sm font-black transition ${
                canPrint
                  ? "bg-emerald-600 text-white hover:bg-emerald-500"
                  : "pointer-events-none bg-slate-100 text-slate-400"
              }`}
            >
              Xuất PDF danh sách + từ liên quan
            </Link>
            <Link
              href={canPrint ? worksheetPrintHref : "#"}
              target="_blank"
              rel="noreferrer"
              className={`rounded-2xl px-4 py-3 text-center text-sm font-black transition ${
                canPrint
                  ? "bg-slate-950 text-white hover:bg-slate-800"
                  : "pointer-events-none bg-slate-100 text-slate-400"
              }`}
            >
              Xuất PDF luyện viết
            </Link>
            <p className="text-xs leading-5 text-slate-500">
              Trang in sẽ mở tab mới. Bấm nút In / Save PDF, hoặc dùng Ctrl+P để lưu PDF.
            </p>
          </div>
        </section>

        {activeItem ? (
          <section className="rounded-[2rem] border border-slate-200 bg-white/92 p-5 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="grid h-28 w-28 shrink-0 place-items-center rounded-3xl border border-slate-200 bg-[#f8fbff] text-slate-950 shadow-inner">
                <HandwrittenKanjiGlyph
                  character={activeItem.character}
                  className="h-24 w-24 text-slate-950"
                  fallbackClassName="font-kanji text-7xl font-semibold leading-none text-slate-950"
                />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Chi tiết</p>
                <h3 className="mt-1 text-xl font-black leading-7 text-slate-950">{activeItem.meaning}</h3>
                <p className="mt-1 text-xs font-bold text-slate-500">
                  {activeItem.jlptLevel} · {activeItem.strokeCount} nét · {activeItem.sourceLabel}
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-2 text-sm text-slate-700">
              <p>
                <span className="font-black text-slate-950">On:</span>{" "}
                <span lang="ja" className="font-kanji">{activeItem.onReading || "-"}</span>
              </p>
              <p>
                <span className="font-black text-slate-950">Kun:</span>{" "}
                <span lang="ja" className="font-kanji">{activeItem.kunReading || "-"}</span>
              </p>
              {activeItem.hanviet ? (
                <p>
                  <span className="font-black text-slate-950">Hán Việt:</span> {activeItem.hanviet}
                </p>
              ) : null}
              {activeItem.radical ? (
                <p>
                  <span className="font-black text-slate-950">Bộ thủ:</span>{" "}
                  <span lang="ja" className="font-kanji">{activeItem.radical.symbol}</span>{" "}
                  {activeItem.radical.meaning || activeItem.radical.name}
                </p>
              ) : null}
              {activeItem.structure?.formula ? (
                <p>
                  <span className="font-black text-slate-950">Cấu tạo:</span> {activeItem.structure.formula}
                </p>
              ) : null}
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                  Từ liên quan ({activeItem.relatedWords.length})
                </p>
                <button
                  type="button"
                  onClick={() => toggleSelected(activeItem.id)}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-black text-slate-600"
                >
                  {selectedSet.has(activeItem.id) ? "Bỏ chọn" : "Chọn in"}
                </button>
              </div>
              {activeItem.relatedWords.length > 0 ? (
                <div className="mt-2 max-h-72 space-y-2 overflow-y-auto pr-1">
                  {activeItem.relatedWords.map((word) => (
                    <article key={word.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <HandwrittenJapaneseText
                          text={word.word || word.kanji}
                          className="text-slate-950"
                          glyphClassName="h-6 w-6"
                          kanaClassName="font-kanji text-sm font-semibold"
                          strokeWidth={4.8}
                        />
                        {word.reading ? (
                          <span lang="ja" className="font-kanji text-xs font-semibold text-slate-500">
                            {word.reading}
                          </span>
                        ) : null}
                        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-black text-slate-500">
                          {word.jlptLevel}
                        </span>
                      </div>
                      <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">{word.meaning}</p>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-500">Chưa có từ vựng liên quan trong dữ liệu.</p>
              )}
            </div>
          </section>
        ) : null}
      </aside>
    </div>
  );
}
