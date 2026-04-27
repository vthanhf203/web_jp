"use client";

import { useActionState, useEffect, useMemo, useState } from "react";

import {
  importAdminKanjiAction,
  type AdminImportState,
} from "@/app/actions/admin-content";

const initialState: AdminImportState = {
  status: "idle",
  message: "",
};

const ADMIN_KANJI_DRAFT_KEY = "admin_kanji_import_draft_v1";

const SAMPLE_JSON =
  '[\n  {\n    "id": "n5-001",\n    "character": "\\u751f",\n    "meaning": "Sinh, song",\n    "onReading": ["\\u30bb\\u30a4", "\\u30b7\\u30e7\\u30a6"],\n    "kunReading": ["\\u3044\\u304d\\u308b", "\\u3046\\u307e\\u308c\\u308b", "\\u306a\\u307e"],\n    "strokeCount": 5,\n    "jlptLevel": "N5",\n    "order": 12,\n    "category": "life",\n    "tags": ["life", "existence"],\n    "relatedVocabularies": [\n      {\n        "id": "v-001",\n        "word": "\\u5b66\\u751f",\n        "reading": "\\u304c\\u304f\\u305b\\u3044",\n        "meaning": "Hoc sinh",\n        "type": "noun",\n        "jlptLevel": "N5",\n        "exampleSentence": "\\u79c1\\u306f\\u5b66\\u751f\\u3067\\u3059\\u3002",\n        "exampleMeaning": "Toi la hoc sinh"\n      },\n      {\n        "id": "v-002",\n        "word": "\\u5148\\u751f",\n        "reading": "\\u305b\\u3093\\u305b\\u3044",\n        "meaning": "Giao vien",\n        "type": "noun",\n        "jlptLevel": "N5",\n        "exampleSentence": "\\u5148\\u751f\\u306b\\u805e\\u304d\\u307e\\u3059\\u3002",\n        "exampleMeaning": "Toi hoi giao vien"\n      }\n    ],\n    "createdAt": "2026-04-18",\n    "updatedAt": "2026-04-18"\n  }\n]';

function persistDraft(value: string) {
  try {
    window.localStorage.setItem(ADMIN_KANJI_DRAFT_KEY, value);
  } catch {
    // ignore storage write issues
  }
}

function clearDraft() {
  try {
    window.localStorage.removeItem(ADMIN_KANJI_DRAFT_KEY);
  } catch {
    // ignore storage remove issues
  }
}

function buildExportUrl(level: string | undefined, download: boolean): string {
  const query = new URLSearchParams();
  const normalizedLevel = (level ?? "").trim().toUpperCase();
  if (normalizedLevel && normalizedLevel !== "ALL") {
    query.set("level", normalizedLevel);
  }
  if (download) {
    query.set("download", "1");
  }
  const queryString = query.toString();
  return queryString ? `/api/admin/kanji-export?${queryString}` : "/api/admin/kanji-export";
}

type AdminKanjiImportFormProps = {
  selectedLevel?: string;
};

export function AdminKanjiImportForm({ selectedLevel }: AdminKanjiImportFormProps) {
  const [state, formAction, pending] = useActionState(importAdminKanjiAction, initialState);
  const [rawInput, setRawInput] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [isLoadingExisting, setIsLoadingExisting] = useState(false);
  const [clientMessage, setClientMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(ADMIN_KANJI_DRAFT_KEY) ?? "";
      setRawInput(saved);
    } catch {
      // ignore storage read issues
    } finally {
      setHydrated(true);
    }
  }, []);

  const draftSizeLabel = useMemo(() => {
    if (!rawInput.trim()) {
      return "Chưa có nhập tạm";
    }
    return `Đã lưu nhập tạm: ${rawInput.length} ký tự`;
  }, [rawInput]);

  const canInteract = hydrated && !pending && !isLoadingExisting;

  return (
    <form
      action={formAction}
      onSubmit={() => {
        persistDraft(rawInput);
        setClientMessage(null);
      }}
      className="space-y-3"
    >
      <textarea
        name="rawInput"
        value={rawInput}
        onChange={(event) => {
          const nextValue = event.target.value;
          setRawInput(nextValue);
          setClientMessage(null);
          if (hydrated) {
            persistDraft(nextValue);
          }
        }}
        className="min-h-48 w-full resize-y rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-sky-400 focus:ring-3 focus:ring-sky-100"
        placeholder='Hỗ trợ JSON array / JSON object / JSON-lines / text. Field mới: id, character, meaning, onReading[], kunReading[], strokeCount, jlptLevel, order, category, tags[], strokeHint, strokeImage, relatedVocabularies[].'
        disabled={!canInteract}
        required
      />

      {state.message ? (
        <p
          className={
            state.status === "error"
              ? "rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
              : "rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
          }
        >
          {state.message}
        </p>
      ) : null}
      {clientMessage ? (
        <p
          className={
            clientMessage.type === "error"
              ? "rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
              : "rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
          }
        >
          {clientMessage.text}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!canInteract}
        >
          {pending ? "Đang import..." : "Import Kanji"}
        </button>
        <button
          type="button"
          className="rounded-xl border border-fuchsia-200 bg-fuchsia-50 px-4 py-2 text-sm font-semibold text-fuchsia-700"
          onClick={() => {
            setRawInput(SAMPLE_JSON);
            if (hydrated) {
              persistDraft(SAMPLE_JSON);
            }
            setClientMessage(null);
          }}
          disabled={!canInteract}
        >
          Mẫu JSON
        </button>
        <button
          type="button"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700"
          onClick={async () => {
            setClientMessage(null);
            setIsLoadingExisting(true);
            try {
              const response = await fetch(buildExportUrl(selectedLevel, false), {
                method: "GET",
                cache: "no-store",
              });
              if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
              }
              const parsed = (await response.json()) as unknown;
              const text = JSON.stringify(parsed, null, 2);
              setRawInput(text);
              persistDraft(text);
              const itemCount = Array.isArray(parsed) ? parsed.length : 0;
              setClientMessage({
                type: "success",
                text: `Đã nạp JSON hiện có (${itemCount} Kanji).`,
              });
            } catch {
              setClientMessage({
                type: "error",
                text: "Không lấy được JSON hiện có. Kiểm tra quyền admin và thử lại.",
              });
            } finally {
              setIsLoadingExisting(false);
            }
          }}
          disabled={!canInteract}
        >
          {isLoadingExisting ? "Đang nạp..." : "Nạp từ kho hiện có"}
        </button>
        <a
          href={buildExportUrl(selectedLevel, true)}
          className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700"
        >
          Tải JSON hiện có
        </a>
        <button
          type="button"
          className="ml-auto rounded-xl px-3 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-100"
          onClick={() => {
            setRawInput("");
            clearDraft();
            setClientMessage(null);
          }}
          disabled={!canInteract}
        >
          Xóa nhập
        </button>
      </div>

      <p className="text-xs text-slate-500">
        Nội dung JSON được giữ lại sau khi import để bạn đối chiếu dễ dàng hơn.
      </p>
      <p className="text-xs font-medium text-slate-500">{draftSizeLabel}</p>
    </form>
  );
}
