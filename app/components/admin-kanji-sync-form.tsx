"use client";

import { useActionState } from "react";

import {
  syncAdminKanjiFromUrlAction,
  type AdminImportState,
} from "@/app/actions/admin-content";

const initialState: AdminImportState = {
  status: "idle",
  message: "",
};

export function AdminKanjiSyncForm() {
  const [state, formAction, pending] = useActionState(
    syncAdminKanjiFromUrlAction,
    initialState
  );

  return (
    <form action={formAction} className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
      <div className="grid gap-2 md:grid-cols-[1fr_120px]">
        <input
          name="sourceUrl"
          type="url"
          required
          disabled={pending}
          className="input-base"
          placeholder="https://example.com/kanji-data.json"
        />
        <input
          name="limit"
          type="number"
          min={1}
          max={2000}
          defaultValue={500}
          disabled={pending}
          className="input-base"
          placeholder="Limit"
        />
      </div>

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

      <button
        type="submit"
        className="rounded-xl border border-sky-300 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={pending}
      >
        {pending ? "Đang sync..." : "Sync Kanji từ URL/API"}
      </button>
    </form>
  );
}
