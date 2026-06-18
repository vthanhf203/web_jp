"use client";

import { useActionState, useEffect, useMemo, useState } from "react";

import {
  importAdminKanjiAction,
  type AdminImportState,
} from "@/app/actions/admin-content";
import { OpenDictionaryQuickFill } from "@/app/components/open-dictionary-quick-fill";

const initialState: AdminImportState = {
  status: "idle",
  message: "",
};

const ADMIN_KANJI_DRAFT_KEY = "admin_kanji_import_draft_v1";

const SAMPLE_JSON = "[\n  {\n    \"id\": \"kanji-海\",\n    \"character\": \"海\",\n    \"meaning\": \"Biển\",\n    \"onReading\": [\n      \"カイ\"\n    ],\n    \"kunReading\": [\n      \"うみ\"\n    ],\n    \"strokeCount\": 9,\n    \"jlptLevel\": \"N5\",\n    \"order\": 1,\n    \"category\": \"nature\",\n    \"tags\": [\n      \"water\",\n      \"nature\",\n      \"sea\"\n    ],\n    \"radical\": {\n      \"char\": \"氵\",\n      \"name\": \"Thủy\",\n      \"meaning\": \"Nước, chất lỏng\",\n      \"position\": \"left\",\n      \"note\": \"Bộ thủ nằm bên trái, thường liên quan đến nước.\"\n    },\n    \"radicalHint\": \"Bộ 氵 thường liên quan đến nước, chất lỏng, sông, biển.\",\n    \"mnemonic\": \"Rất nhiều nước kéo dài mọi nơi → 海 là biển.\",\n    \"components\": [\n      {\n        \"char\": \"氵\",\n        \"name\": \"Thủy\",\n        \"meaning\": \"Nước, chất lỏng\",\n        \"position\": \"left\",\n        \"role\": \"radical\"\n      },\n      {\n        \"char\": \"毎\",\n        \"name\": \"Mỗi\",\n        \"meaning\": \"Mỗi, thường xuyên\",\n        \"position\": \"right\",\n        \"role\": \"component\"\n      }\n    ],\n    \"structure\": {\n      \"type\": \"left-right\",\n      \"formula\": \"氵 + 毎 = 海\",\n      \"meaning\": \"Nước + nhiều/mỗi nơi → biển\",\n      \"note\": \"氵 giúp đoán nghĩa liên quan đến nước; 毎 giúp nhớ hình dạng chữ.\"\n    },\n    \"relatedVocabularies\": [\n      {\n        \"id\": \"v-umi\",\n        \"word\": \"海\",\n        \"reading\": \"うみ\",\n        \"meaning\": \"Biển\",\n        \"type\": \"noun\",\n        \"jlptLevel\": \"N5\",\n        \"exampleSentence\": \"海(うみ)へ行(い)きます。\",\n        \"exampleMeaning\": \"Tôi đi ra biển.\"\n      }\n    ],\n    \"createdAt\": \"2026-04-18\",\n    \"updatedAt\": \"2026-04-18\"\n  }\n]";

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

  function appendJsonLine(payload: Record<string, unknown>) {
    const line = JSON.stringify(payload);
    setRawInput((current) => {
      const nextValue = current.trim() ? `${current.trim()}\n${line}` : line;
      if (hydrated) {
        persistDraft(nextValue);
      }
      return nextValue;
    });
    setClientMessage({
      type: "success",
      text: "Added one kanji from the offline dictionary.",
    });
  }

  return (
    <form
      action={formAction}
      onSubmit={() => {
        persistDraft(rawInput);
        setClientMessage(null);
      }}
      className="space-y-3"
    >
      <OpenDictionaryQuickFill
        mode="kanji"
        onPickKanji={(entry) => {
          appendJsonLine({
            id: `kanji-${entry.character}`,
            character: entry.character,
            meaning: entry.meanings.join("; "),
            onReading: entry.onReadings,
            kunReading: entry.kunReadings,
            strokeCount: entry.strokeCount || 1,
            jlptLevel: entry.jlptLevel || selectedLevel || "N5",
            tags: ["KANJIDIC2"],
          });
        }}
      />
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
        placeholder="Hỗ trợ JSON array / JSON object / JSON-lines / text. Field mới: id, character, meaning, onReading[], kunReading[], strokeCount, jlptLevel, order, category, tags[], strokeHint, strokeImage, radical{}, radicalHint, mnemonic, components[], structure{}, relatedVocabularies[]."
        disabled={!canInteract}
        required
      />

      {state.message ? (
        <p
          className={
            state.status === "error"
              ? "whitespace-pre-line rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
              : "whitespace-pre-line rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
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
