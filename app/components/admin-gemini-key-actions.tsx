"use client";

import { RotateCcw, Trash2 } from "lucide-react";

import {
  deleteGeminiApiKeyAction,
  selectGeminiApiKeyAction,
} from "@/app/actions/admin-tts";
import type { GeminiKeyStatus } from "@/lib/gemini-key-store";

type Props = {
  keyId: string;
  label: string;
  active: boolean;
  status: GeminiKeyStatus;
};

export function AdminGeminiKeyActions({ keyId, label, active, status }: Props) {
  const canSelect = !active || status !== "ready";

  return (
    <div className="flex flex-wrap gap-2">
      {canSelect ? (
        <form action={selectGeminiApiKeyAction}>
          <input type="hidden" name="keyId" value={keyId} />
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-black text-violet-700 transition hover:bg-violet-100"
          >
            {active ? <RotateCcw className="h-3.5 w-3.5" /> : null}
            {active ? "Thử lại key này" : "Chọn key này"}
          </button>
        </form>
      ) : null}
      <form
        action={deleteGeminiApiKeyAction}
        onSubmit={(event) => {
          if (!window.confirm(`Xóa API key "${label}" khỏi web?`)) {
            event.preventDefault();
          }
        }}
      >
        <input type="hidden" name="keyId" value={keyId} />
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-700 transition hover:bg-rose-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Xóa
        </button>
      </form>
    </div>
  );
}
