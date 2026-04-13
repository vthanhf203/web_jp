"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  loginAction,
  registerAction,
  type AuthActionState,
} from "@/app/actions/auth";

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
        {mode === "login" ? "Đăng nhập" : "Tạo tài khoản mới"}
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        {mode === "login"
          ? "Tiếp tục lộ trình Kanji và SRS của bạn."
          : "Bắt đầu website học tiếng Nhật cá nhân của riêng bạn."}
      </p>

      <form action={formAction} className="mt-5 space-y-4">
        {mode === "register" ? (
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              Tên hiển thị
            </span>
            <input
              className="input-base"
              name="name"
              autoComplete="name"
              placeholder="Ví dụ: Thanh"
              required
            />
          </label>
        ) : null}

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">
            Email
          </span>
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
          <span className="mb-1 block text-sm font-medium text-slate-700">
            Mật khẩu
          </span>
          <input
            className="input-base"
            type="password"
            name="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            placeholder="Tối thiểu 8 ký tự"
            required
          />
        </label>

        {state.error ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {state.error}
          </p>
        ) : null}

        <button type="submit" className="btn-primary w-full" disabled={pending}>
          {pending
            ? "Đang xử lý..."
            : mode === "login"
              ? "Vào học ngay"
              : "Tạo tài khoản"}
        </button>
      </form>

      <p className="mt-4 text-sm text-slate-600">
        {mode === "login" ? "Chưa có tài khoản?" : "Đã có tài khoản?"}{" "}
        <Link
          href={mode === "login" ? "/register" : "/login"}
          className="font-semibold text-emerald-700 underline decoration-emerald-400 decoration-2 underline-offset-2"
        >
          {mode === "login" ? "Đăng ký ngay" : "Đăng nhập"}
        </Link>
      </p>
    </div>
  );
}
