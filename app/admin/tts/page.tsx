import { CircleAlert, KeyRound, ServerCog, ShieldCheck } from "lucide-react";

import { useEnvironmentGeminiKeyAction } from "@/app/actions/admin-tts";
import { AdminGeminiKeyActions } from "@/app/components/admin-gemini-key-actions";
import { AdminGeminiKeyForm } from "@/app/components/admin-gemini-key-form";
import { AdminNav } from "@/app/components/admin-nav";
import { requireAdmin } from "@/lib/admin";
import { listGeminiApiKeys, type GeminiKeyStatus } from "@/lib/gemini-key-store";

const STATUS_STYLE: Record<GeminiKeyStatus, { label: string; className: string }> = {
  ready: {
    label: "Sẵn sàng",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  "rate-limited": {
    label: "Hết hạn mức",
    className: "border-amber-200 bg-amber-50 text-amber-700",
  },
  invalid: {
    label: "Key không hợp lệ",
    className: "border-rose-200 bg-rose-50 text-rose-700",
  },
  error: {
    label: "Lỗi gần nhất",
    className: "border-slate-200 bg-slate-100 text-slate-700",
  },
};

function formatDate(value?: string): string {
  if (!value) {
    return "Chưa dùng";
  }
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function AdminTtsPage() {
  await requireAdmin();
  const store = await listGeminiApiKeys();
  const activeManagedKey = store.keys.find((key) => key.active);

  return (
    <section className="space-y-6 rounded-3xl border border-violet-100 bg-[linear-gradient(135deg,#f5f3ff,#eff6ff_54%,#f8fafc)] p-5 shadow-[0_18px_50px_rgba(76,29,149,0.08)] sm:p-6">
      <header className="rounded-3xl border border-white bg-white/90 p-5 shadow-sm backdrop-blur sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-violet-100 px-3 py-1 text-xs font-black uppercase tracking-[0.15em] text-violet-700">
              <ServerCog className="h-4 w-4" />
              Gemini TTS
            </p>
            <h1 className="mt-3 text-3xl font-black text-slate-900">Quản lý API key tạo giọng</h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-600">
              Chọn key đang dùng ngay trên web. Khi key đó hết hạn mức, bài nghe tự chuyển sang Edge TTS; chọn key khác
              tại đây để dùng Gemini trở lại mà không cần khởi động lại server.
            </p>
          </div>
          <div className="rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm font-bold text-violet-800">
            <p>{store.keys.length} key đã lưu</p>
            <p className="mt-1 text-xs text-violet-600">
              Đang dùng: {activeManagedKey?.label || (store.envConfigured ? "Key trong .env.local" : "Edge TTS")}
            </p>
          </div>
        </div>
        <div className="mt-5">
          <AdminNav active="tts" />
        </div>
      </header>

      <AdminGeminiKeyForm />

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-slate-900">Nguồn key đang quản lý</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">Chỉ một key được chọn tại một thời điểm.</p>
          </div>
          <form action={useEnvironmentGeminiKeyAction}>
            <button
              type="submit"
              className={`rounded-2xl border px-4 py-2.5 text-sm font-black transition ${
                store.usingEnv
                  ? "border-blue-300 bg-blue-100 text-blue-800"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {store.envConfigured ? "Dùng key .env.local" : "Tắt Gemini, dùng Edge"}
            </button>
          </form>
        </div>

        {store.keys.length > 0 ? (
          <div className="mt-5 grid gap-3">
            {store.keys.map((key) => {
              const status = STATUS_STYLE[key.status];
              return (
                <article
                  key={key.id}
                  className={`rounded-2xl border p-4 transition ${
                    key.active ? "border-violet-300 bg-violet-50/70" : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <span
                        className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${
                          key.active ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        <KeyRound className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-black text-slate-900">{key.label}</h3>
                          {key.active ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-violet-600 px-2.5 py-1 text-[11px] font-black text-white">
                              <ShieldCheck className="h-3.5 w-3.5" />
                              Đang dùng
                            </span>
                          ) : null}
                          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${status.className}`}>
                            {status.label}
                          </span>
                        </div>
                        <p className="mt-2 font-mono text-sm font-bold text-slate-500">{key.maskedKey}</p>
                        <p className="mt-2 text-xs font-semibold text-slate-500">
                          Dùng gần nhất: {formatDate(key.lastUsedAt)}
                        </p>
                        {key.lastError ? (
                          <p className="mt-2 inline-flex max-w-2xl items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-800">
                            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                            {key.lastError}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <AdminGeminiKeyActions
                      keyId={key.id}
                      label={key.label}
                      active={key.active}
                      status={key.status}
                    />
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center">
            <p className="font-black text-slate-700">Chưa có Gemini API key nào được lưu trong web.</p>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              Thêm key ở form phía trên; nếu không có key, bài nghe vẫn dùng Edge TTS.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
