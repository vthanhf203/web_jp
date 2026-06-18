"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { SpeakJpButton } from "@/app/components/speak-jp-button";
import { buildJapaneseLookupTextCandidates } from "@/lib/japanese-lookup-text";

type LookupItem = {
  id: string;
  kind: "vocab" | "kanji" | "dictionary-word" | "dictionary-kanji";
  title: string;
  reading: string;
  meaning: string;
  meta: string[];
  source: string;
};

type LookupResponse = {
  query?: string;
  items?: LookupItem[];
};

type LookupStatus = "loading" | "ready" | "empty" | "error";

type PopoverState = {
  text: string;
  left: number;
  top: number;
  status: LookupStatus;
  items: LookupItem[];
};

const JAPANESE_TEXT_PATTERN = /[\u3040-\u30ff\u3400-\u9fff]/u;
const MAX_SELECTION_LENGTH = 40;
const POPOVER_WIDTH = 340;
const POPOVER_ESTIMATED_HEIGHT = 330;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function selectionTextWithoutRuby(selection: Selection): { text: string; hadRuby: boolean } {
  if (selection.rangeCount === 0) {
    return { text: selection.toString(), hadRuby: false };
  }

  const wrapper = document.createElement("div");
  let hadRuby = false;

  for (let index = 0; index < selection.rangeCount; index += 1) {
    const fragment = selection.getRangeAt(index).cloneContents();
    hadRuby ||= Boolean(fragment.querySelector?.("rt, rp"));
    fragment.querySelectorAll?.("rt, rp").forEach((node) => node.remove());
    wrapper.appendChild(fragment);
  }

  const text = wrapper.textContent || selection.toString();
  return { text, hadRuby };
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(
    target.closest(
      'input, textarea, select, [contenteditable="true"], [data-selection-lookup-root]'
    )
  );
}

function getSelectionRect(selection: Selection): DOMRect | null {
  if (selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0);
  if (range.collapsed) {
    return null;
  }

  const rect = range.getBoundingClientRect();
  if (rect.width > 0 || rect.height > 0) {
    return rect;
  }

  const firstRect = Array.from(range.getClientRects()).find(
    (item) => item.width > 0 || item.height > 0
  );
  return firstRect ?? null;
}

function resolvePopoverPosition(rect: DOMRect): Pick<PopoverState, "left" | "top"> {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const maxLeft = Math.max(12, viewportWidth - POPOVER_WIDTH - 12);
  const left = clamp(rect.left + rect.width / 2 - POPOVER_WIDTH / 2, 12, maxLeft);
  const belowTop = rect.bottom + 10;
  const top =
    belowTop + POPOVER_ESTIMATED_HEIGHT > viewportHeight
      ? Math.max(12, rect.top - POPOVER_ESTIMATED_HEIGHT - 10)
      : belowTop;

  return { left, top };
}

function sourceLabel(item: LookupItem): string {
  if (item.kind === "vocab") {
    return "Vocab";
  }
  if (item.kind === "kanji") {
    return "Kanji";
  }
  return item.source || "Từ điển";
}

export function SelectionDictionaryPopover() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const cacheRef = useRef(new Map<string, LookupItem[]>());
  const requestIdRef = useRef(0);
  const [popover, setPopover] = useState<PopoverState | null>(null);

  const closePopover = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    abortRef.current?.abort();
    abortRef.current = null;
    setPopover(null);
  }, []);

  const lookupSelection = useCallback(
    (target: EventTarget | null) => {
      if (isEditableTarget(target)) {
        return;
      }

      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        closePopover();
        return;
      }

      const selectedText = buildJapaneseLookupTextCandidates(selectionTextWithoutRuby(selection).text)[0] ?? "";
      if (
        !selectedText ||
        selectedText.length > MAX_SELECTION_LENGTH ||
        !JAPANESE_TEXT_PATTERN.test(selectedText)
      ) {
        closePopover();
        return;
      }

      const rect = getSelectionRect(selection);
      if (!rect) {
        closePopover();
        return;
      }

      const position = resolvePopoverPosition(rect);
      const cachedItems = cacheRef.current.get(selectedText);
      if (cachedItems) {
        setPopover({
          text: selectedText,
          ...position,
          status: cachedItems.length > 0 ? "ready" : "empty",
          items: cachedItems,
        });
        return;
      }

      requestIdRef.current += 1;
      const requestId = requestIdRef.current;
      abortRef.current?.abort();
      abortRef.current = new AbortController();

      setPopover({
        text: selectedText,
        ...position,
        status: "loading",
        items: [],
      });

      void fetch(`/api/selection-lookup?q=${encodeURIComponent(selectedText)}&limit=6`, {
        signal: abortRef.current.signal,
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error("lookup failed");
          }
          return (await response.json()) as LookupResponse;
        })
        .then((data) => {
          if (requestIdRef.current !== requestId) {
            return;
          }

          const items = Array.isArray(data.items) ? data.items : [];
          cacheRef.current.set(selectedText, items);
          setPopover({
            text: selectedText,
            ...position,
            status: items.length > 0 ? "ready" : "empty",
            items,
          });
        })
        .catch((error) => {
          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }
          if (requestIdRef.current !== requestId) {
            return;
          }
          setPopover({
            text: selectedText,
            ...position,
            status: "error",
            items: [],
          });
        });
    },
    [closePopover]
  );

  const scheduleLookup = useCallback(
    (target: EventTarget | null) => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }

      timerRef.current = window.setTimeout(() => {
        lookupSelection(target);
        timerRef.current = null;
      }, 120);
    },
    [lookupSelection]
  );

  useEffect(() => {
    const handleMouseUp = (event: MouseEvent) => scheduleLookup(event.target);
    const handleTouchEnd = (event: TouchEvent) => scheduleLookup(event.target);
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closePopover();
        return;
      }
      scheduleLookup(event.target);
    };
    const handleMouseDown = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) {
        return;
      }
      if (!window.getSelection()?.isCollapsed) {
        return;
      }
      closePopover();
    };
    const handleScroll = (event: Event) => {
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) {
        return;
      }
      closePopover();
    };
    const handleCopy = (event: ClipboardEvent) => {
      if (isEditableTarget(event.target)) {
        return;
      }

      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        return;
      }

      const { text, hadRuby } = selectionTextWithoutRuby(selection);
      if (!hadRuby) {
        return;
      }

      const copiedText = buildJapaneseLookupTextCandidates(text)[0] ?? "";
      if (!copiedText) {
        return;
      }

      event.clipboardData?.setData("text/plain", copiedText);
      event.preventDefault();
    };

    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("touchend", handleTouchEnd);
    document.addEventListener("keyup", handleKeyUp);
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("copy", handleCopy);
    window.addEventListener("scroll", handleScroll, true);

    return () => {
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("touchend", handleTouchEnd);
      document.removeEventListener("keyup", handleKeyUp);
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("copy", handleCopy);
      window.removeEventListener("scroll", handleScroll, true);
      closePopover();
    };
  }, [closePopover, scheduleLookup]);

  if (!popover) {
    return null;
  }

  const searchHref = `/search?q=${encodeURIComponent(popover.text)}`;

  return (
    <div
      ref={rootRef}
      data-selection-lookup-root
      className="fixed z-[90] max-h-[min(430px,calc(100vh-24px))] w-[340px] max-w-[calc(100vw-24px)] overflow-hidden rounded-2xl border border-[#d7e2ef] bg-white text-[#111827] shadow-[0_22px_60px_rgba(15,35,70,0.22)]"
      style={{ left: popover.left, top: popover.top }}
    >
      <div className="flex items-start justify-between gap-3 border-b border-[#edf2f7] bg-[#f8fbff] px-4 py-3">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#64748b]">
            Tra nhanh
          </p>
          <div className="mt-1 flex min-w-0 items-center gap-2">
            <p className="truncate font-[var(--font-jp)] text-lg font-black text-[#123c69]">
              {popover.text}
            </p>
            <SpeakJpButton
              text={popover.text}
              title="Phát âm từ đang chọn"
              className="h-7 w-7 shrink-0 border-[#cfe0f2] text-[#123c69] hover:bg-[#eef6ff]"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={closePopover}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[#d8e2ee] bg-white text-sm font-black text-[#64748b] transition hover:bg-[#eef6ff]"
          aria-label="Đóng tra nhanh"
        >
          ×
        </button>
      </div>

      <div className="max-h-[330px] overflow-y-auto px-4 py-3">
        {popover.status === "loading" ? (
          <div className="space-y-2">
            <div className="h-4 w-32 animate-pulse rounded-full bg-[#e8eef6]" />
            <div className="h-16 animate-pulse rounded-2xl bg-[#f0f4f9]" />
          </div>
        ) : null}

        {popover.status === "empty" ? (
          <div className="rounded-2xl border border-dashed border-[#cfd9e6] bg-[#fbfdff] px-3 py-3 text-sm font-semibold leading-6 text-[#526070]">
            Chưa thấy từ này trong dữ liệu hiện có.
          </div>
        ) : null}

        {popover.status === "error" ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm font-bold text-rose-700">
            Chưa tra được lúc này.
          </div>
        ) : null}

        {popover.status === "ready" ? (
          <div className="space-y-2">
            {popover.items.map((item) => (
              <article
                key={item.id}
                className="rounded-2xl border border-[#e3eaf4] bg-[#fbfdff] px-3 py-2.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <h3 className="truncate font-[var(--font-jp)] text-base font-black text-[#0f172a]">
                        {item.title}
                      </h3>
                      <SpeakJpButton
                        text={item.reading || item.title}
                        title="Phát âm mục này"
                        className="h-6 w-6 shrink-0 border-[#d8e2ee] text-[#3554a8] hover:bg-[#eef4ff]"
                      />
                    </div>
                    {item.reading ? (
                      <p className="mt-0.5 font-[var(--font-jp)] text-sm font-bold text-[#3554a8]">
                        {item.reading}
                      </p>
                    ) : null}
                  </div>
                  <span className="shrink-0 rounded-full bg-[#eef4ff] px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-[#3554a8]">
                    {sourceLabel(item)}
                  </span>
                </div>
                <p className="mt-2 text-sm font-semibold leading-6 text-[#334155]">
                  {item.meaning}
                </p>
                {item.meta.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {item.meta.slice(0, 4).map((meta) => (
                      <span
                        key={`${item.id}-${meta}`}
                        className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-[#64748b] ring-1 ring-[#e4ebf5]"
                      >
                        {meta}
                      </span>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        ) : null}
      </div>

      <div className="border-t border-[#edf2f7] bg-[#f8fbff] px-4 py-2.5">
        <a
          href={searchHref}
          className="inline-flex h-9 w-full items-center justify-center rounded-full bg-[#123c69] px-4 text-sm font-black text-white transition hover:bg-[#19538f]"
        >
          Mở Search đầy đủ
        </a>
      </div>
    </div>
  );
}
