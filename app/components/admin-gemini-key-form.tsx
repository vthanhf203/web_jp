"use client";

import { KeyRound, Loader2, Plus } from "lucide-react";
import { useActionState } from "react";

import {
  addGeminiApiKeyAction,
  type AdminTtsActionState,
} from "@/app/actions/admin-tts";

const initialState: AdminTtsActionState = {
  status: "idle",
  message: "",
};

export function AdminGeminiKeyForm() {
  const [state, formAction, pending] = useActionState(addGeminiApiKeyAction, initialState);

  return (
    <form action={formAction} className="rounded-3xl border border-violet-100 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-violet-100 text-violet-700">
          <KeyRound className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-lg font-black text-slate-900">Thêm Gemini API key</h2>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
            Key được mã hóa bằng <code>AUTH_SECRET</code> trước khi lưu. Sau khi lưu, web không hiển thị lại key đầy đủ.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]">
        <label className="text-sm font-black text-slate-700">
          Tên phân biệt
          <input
            name="label"
            type="text"
            maxLength={80}
            required
            disabled={pending}
            placeholder="Ví dụ: Tài khoản Google 2"
            className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800 outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
          />
        </label>
        <label className="text-sm font-black text-slate-700">
          Gemini API key
          <input
            name="apiKey"
            type="password"
            autoComplete="off"
            required
            disabled={pending}
            placeholder="Dán API key vào đây"
            className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 font-mono text-sm font-bold text-slate-800 outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-11 items-center gap-2 rounded-2xl bg-violet-600 px-5 text-sm font-black text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {pending ? "Đang mã hóa và lưu..." : "Thêm API key"}
        </button>
        {state.message ? (
          <p
            className={`rounded-xl border px-3 py-2 text-sm font-bold ${
              state.status === "error"
                ? "border-rose-200 bg-rose-50 text-rose-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
