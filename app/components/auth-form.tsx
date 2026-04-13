"use client";

import Link from "next/link";
import { useActionState } from "react";

import { loginAction, registerAction, type AuthActionState } from "@/app/actions/auth";

type AuthMode = "login" | "register";

const initialState: AuthActionState = {};

type Props = {
  mode: AuthMode;
};

export function AuthForm({ mode }: Props) {
  const action = mode === "login" ? loginAction : registerAction;
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <div className="panel max-w-md p-7">
      <h1 className="text-2xl font-bold text-slate-800">
        {mode === "login" ? "Dang nhap" : "Tao tai khoan moi"}
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        {mode === "login"
          ? "Tiep tuc lo trinh hoc Kanji, tu vung va ngu phap cua ban."
          : "Bat dau website hoc tieng Nhat ca nhan cua rieng ban."}
      </p>

      <form action={formAction} className="mt-5 space-y-4">
        {mode === "register" ? (
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Ten hien thi</span>
            <input className="input-base" name="name" autoComplete="name" placeholder="Vi du: Thanh" required />
          </label>
        ) : null}

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Email</span>
          <input
            className="input-base"
            type="email"
            name="email"
            autoComplete="email"
            placeholder="you@example.com"
            required
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Mat khau</span>
          <input
            className="input-base"
            type="password"
            name="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            placeholder="Toi thieu 8 ky tu"
            required
          />
        </label>

        {state.error ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p>
        ) : null}

        <button type="submit" className="btn-primary w-full" disabled={pending}>
          {pending ? "Dang xu ly..." : mode === "login" ? "Vao hoc ngay" : "Tao tai khoan"}
        </button>
      </form>

      <p className="mt-4 text-sm text-slate-600">
        {mode === "login" ? "Chua co tai khoan?" : "Da co tai khoan?"}{" "}
        <Link
          href={mode === "login" ? "/register" : "/login"}
          className="font-semibold text-emerald-700 underline decoration-emerald-400 decoration-2 underline-offset-2"
        >
          {mode === "login" ? "Dang ky ngay" : "Dang nhap"}
        </Link>
      </p>
    </div>
  );
}
