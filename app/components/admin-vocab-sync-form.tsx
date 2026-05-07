"use client";

import { useActionState } from "react";
import { RotateCw } from "lucide-react";

import {
  syncAdminVocabFromUrlAction,
  type AdminImportState,
} from "@/app/actions/admin-vocab";

const initialState: AdminImportState = {
  status: "idle",
  message: "",
};

type Props = {
  lessonId: string | null;
};

export function AdminVocabSyncForm({ lessonId }: Props) {
  const [state, formAction, pending] = useActionState(
    syncAdminVocabFromUrlAction,
    initialState
  );
  const hasLesson = Boolean(lessonId);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="lessonId" value={lessonId ?? ""} />
      <div className="grid gap-3 lg:grid-cols-[1fr_190px_190px]">
        <label className="block">
          <span className="text-xs font-bold text-slate-600">URL hoặc API endpoint</span>
          <input
            name="sourceUrl"
            type="url"
            required
            disabled={!hasLesson || pending}
            className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-50 disabled:bg-slate-50"
            placeholder="https://example.com/api/japanese_vocab.json"
          />
        </label>
        <label className="block">
          <span className="text-xs font-bold text-slate-600">Số lượng mỗi trang</span>
          <input
            name="limit"
            type="number"
            min={1}
            max={2000}
            defaultValue={500}
            disabled={!hasLesson || pending}
            className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-50 disabled:bg-slate-50"
            placeholder="500"
          />
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!hasLesson || pending}
          >
            <RotateCw className="h-4 w-4" aria-hidden="true" />
            {pending ? "Đang sync..." : "Sync từ URL/API"}
          </button>
        </div>
      </div>

      {state.message ? (
        <p
          className={
            state.status === "error"
              ? "rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
              : "rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
          }
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
