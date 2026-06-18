import Image from "next/image";
import Link from "next/link";

import { logoutAction } from "@/app/actions/auth";
import { DailyReminderClient } from "@/app/components/daily-reminder-client";
import { DesktopSideNav, type NavGroupItem } from "@/app/components/side-nav-client";
import { isAdminEmail } from "@/lib/admin";
import { getCurrentUser } from "@/lib/auth";
import { loadUserPersonalState } from "@/lib/user-personal-data";

function navIcon(path: string) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
      <path d={path} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const privateGroups: NavGroupItem[] = [
  {
    id: "overview",
    label: "Cá nhân",
    iconPath: "M3 12l9-8 9 8M5 10v10h14V10",
    links: [
      { href: "/dashboard", label: "Tổng quan", iconPath: "M3 12l9-8 9 8M5 10v10h14V10" },
      { href: "/personal", label: "Lộ trình", iconPath: "M3 6h18M6 12h12M9 18h6" },
      { href: "/schedule", label: "Lịch học", iconPath: "M7 3v4M17 3v4M4 9h16M6 5h12a2 2 0 012 2v12H4V7a2 2 0 012-2z" },
    ],
  },
  {
    id: "learn",
    label: "Học liệu",
    iconPath: "M5 4h10a3 3 0 013 3v13H8a3 3 0 01-3-3zM8 4v16",
    links: [
      { href: "/kanji", label: "Kanji", iconPath: "M5 6h14M5 12h14M5 18h14M12 6v12" },
      { href: "/vocab", label: "Từ vựng", iconPath: "M5 4h10a3 3 0 013 3v13H8a3 3 0 01-3-3zM8 4v16" },
      { href: "/grammar", label: "Ngữ pháp", iconPath: "M6 5h12M6 12h12M6 19h12" },
      { href: "/conjugation", label: "Chia thể", iconPath: "M5 5h14M5 12h14M5 19h8M16 16l3 3 3-3" },
      { href: "/reading-vocab", label: "Từ vựng bài đọc", iconPath: "M4 5h16v14H4zM8 9h8M8 13h8M8 17h5" },
    ],
  },
  {
    id: "practice",
    label: "Luyện kỹ năng",
    iconPath: "M4 19h16M6 5h8l4 4v10H6zM10 11h4M10 15h4",
    links: [
      { href: "/self-study", label: "Tự học chủ động", iconPath: "M4 19h16M6 5h8l4 4v10H6zM10 11h4M10 15h4" },
      { href: "/self-study/listening", label: "Nghe chủ động", iconPath: "M4 12a8 8 0 0116 0v4a3 3 0 01-3 3h-1v-7h4M4 12v4a3 3 0 003 3h1v-7H4M10 19h4" },
      { href: "/shadowing", label: "Shadowing", iconPath: "M4 12a8 8 0 0116 0v5a2 2 0 01-2 2h-2v-6h4M4 12v5a2 2 0 002 2h2v-6H4" },
      { href: "/self-study/grammar", label: "Luyện ngữ pháp", iconPath: "M5 4h14v16H5zM8 8h8M8 12h8M8 16h5" },
      { href: "/vocab/match", label: "Game nối từ", iconPath: "M7 7h10v10H7zM4 12h3M17 12h3M12 4v3M12 17v3M9 10h6M9 14h6" },
      { href: "/kanji/handwriting", label: "Kanji viết tay", iconPath: "M4 19c4-8 8-8 12-14M7 17l10-10 2 2L9 19H7z" },
      { href: "/kanji/write-flashcard", label: "Flashcard luyện viết", iconPath: "M4 20h16M5 16l10-10 3 3L8 19H5zM14 7l3 3" },
      { href: "/kanji/related-review", label: "Ôn từ Kanji", iconPath: "M5 5h14v14H5zM8 9h8M8 13h5M16 16l3 3M19 16v3" },
      { href: "/kanji/roadmap", label: "Lộ trình Kanji", iconPath: "M4 18l6-6 4 4 6-8" },
    ],
  },
  {
    id: "exam",
    label: "Kiểm tra",
    iconPath: "M5 4h14v16H5zM8 8h8M8 12h8M8 16h3M16 16l2 2 3-4",
    links: [
      { href: "/luyen-de", label: "Luyện đề tổng hợp", iconPath: "M5 4h14v16H5zM8 8h8M8 12h8M8 16h3M16 16l2 2 3-4" },
      { href: "/luyen-de/tu-vung", label: "Luyện đề từ vựng", iconPath: "M5 4h10a3 3 0 013 3v13H8a3 3 0 01-3-3zM8 4v16M14 10h7M18 7v6" },
      { href: "/review", label: "Ôn tập SRS", iconPath: "M4 12a8 8 0 1016 0M4 12l3-3M4 12l3 3" },
      { href: "/focus", label: "Sửa lỗi sai", iconPath: "M12 4v16M4 12h16" },
    ],
  },
  {
    id: "tools",
    label: "Công cụ",
    iconPath: "M12 8v4l3 3M5 4l2 2M19 4l-2 2M12 22a9 9 0 100-18 9 9 0 000 18z",
    links: [
      { href: "/study-timer", label: "Bấm giờ học", iconPath: "M12 8v4l3 3M5 4l2 2M19 4l-2 2M12 22a9 9 0 100-18 9 9 0 000 18z" },
      { href: "/search", label: "Tra cứu", iconPath: "M11 4a7 7 0 105.3 11.6L20 19" },
      { href: "/kanji/worksheet", label: "In PDF Kanji", iconPath: "M7 4h10v4H7zM6 10h12a2 2 0 012 2v5H4v-5a2 2 0 012-2zm2 8h8v2H8z" },
    ],
  },
];

export async function NavBar() {
  const user = await getCurrentUser();
  const personalState = user ? await loadUserPersonalState(user.id) : null;
  const groups =
    user && isAdminEmail(user.email)
      ? [
          ...privateGroups,
          {
            id: "admin",
            label: "Quản trị",
            iconPath: "M4 5h16v14H4zM9 3v4M15 3v4",
            links: [
              { href: "/admin", label: "Admin", iconPath: "M4 5h16v14H4zM9 3v4M15 3v4" },
              { href: "/admin/tts", label: "Gemini TTS", iconPath: "M7 11V8a5 5 0 0110 0v3M5 11h14v9H5zM12 15v2" },
            ],
          },
        ]
      : privateGroups;

  return (
    <header className="sticky top-0 z-50 border-b border-white/70 bg-[#edf4ff]/78 backdrop-blur-xl">
      <div className="mx-auto w-full max-w-[1420px] px-4 py-3 lg:px-6">
        <div className="nav-surface rounded-2xl px-3 py-3 sm:px-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/" className="group flex items-center gap-3">
              <span className="relative grid h-10 w-10 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_8px_16px_rgba(15,23,42,0.12)]">
                <Image
                  src="/images/kanji-logo.png"
                  alt="Kanji logo"
                  fill
                  sizes="40px"
                  className="object-contain p-1"
                />
              </span>
              <div className="leading-tight">
                <p className="text-sm font-semibold text-slate-700">JP Lab</p>
                <p className="text-xs text-slate-500">Kanji | Từ vựng | Ngữ pháp</p>
              </div>
            </Link>

            {user ? (
              <div className="flex flex-wrap items-center gap-2">
                <div className="rounded-full border border-blue-200 bg-white/90 px-3 py-1 text-xs text-slate-600 shadow-[0_8px_20px_rgba(37,99,235,0.08)]">
                  <span className="font-semibold text-slate-700">{user.name}</span>
                  <span className="mx-1 text-slate-300">|</span>
                  <span className="font-bold text-emerald-700">{user.xp} XP</span>
                  <span className="mx-1 text-slate-300">|</span>
                  <span className="font-bold text-orange-600">{user.streak} ngày</span>
                </div>
                {personalState ? (
                  <DailyReminderClient
                    enabled={personalState.reminders.enabled}
                    hour={personalState.reminders.hour}
                    minute={personalState.reminders.minute}
                    label="Mở JP Lab 20 phút để giữ streak hôm nay."
                  />
                ) : null}
                <form action={logoutAction}>
                  <button type="submit" className="btn-danger">
                    Đăng xuất
                  </button>
                </form>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link href="/login" className="btn-soft text-sm">
                  Đăng nhập
                </Link>
                <Link href="/register" className="btn-primary text-sm">
                  Tạo tài khoản
                </Link>
              </div>
            )}
          </div>

          {user ? (
            <details className="group mt-3 border-t border-white/70 pt-3 lg:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700">
                <span>Danh mục học tập</span>
                <span className="transition group-open:rotate-180">⌄</span>
              </summary>
              <nav className="mt-2 grid gap-2 rounded-2xl border border-slate-200 bg-white/95 p-2 sm:grid-cols-2">
                {groups.map((group) => (
                  <section key={group.id} className="rounded-xl bg-slate-50 p-2">
                    <p className="mb-1.5 flex items-center gap-2 px-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                      {navIcon(group.iconPath)}
                      {group.label}
                    </p>
                    <div className="grid gap-1">
                      {group.links.map((link) => (
                        <Link
                          key={link.href}
                          href={link.href}
                          className="inline-flex items-center gap-2 rounded-lg bg-white px-2.5 py-2 text-xs font-bold text-slate-700"
                        >
                          <span className="text-slate-400">{navIcon(link.iconPath)}</span>
                          <span>{link.label}</span>
                        </Link>
                      ))}
                    </div>
                  </section>
                ))}
              </nav>
            </details>
          ) : null}
        </div>
      </div>

      {user ? <DesktopSideNav groups={groups} /> : null}
    </header>
  );
}
