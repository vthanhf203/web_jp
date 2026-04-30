import Image from "next/image";
import Link from "next/link";

import { logoutAction } from "@/app/actions/auth";
import { DailyReminderClient } from "@/app/components/daily-reminder-client";
import { DesktopSideNav } from "@/app/components/side-nav-client";
import { isAdminEmail } from "@/lib/admin";
import { getCurrentUser } from "@/lib/auth";
import { loadUserPersonalState } from "@/lib/user-personal-data";

type NavLinkItem = {
  href: string;
  label: string;
  iconPath: string;
};

function navIcon(path: string) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
      <path d={path} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const privateLinks: NavLinkItem[] = [
  { href: "/dashboard", label: "Tổng quan", iconPath: "M3 12l9-8 9 8M5 10v10h14V10" },
  { href: "/personal", label: "Lộ trình", iconPath: "M3 6h18M6 12h12M9 18h6" },
  { href: "/study-timer", label: "Bấm giờ học", iconPath: "M12 8v4l3 3M5 4l2 2M19 4l-2 2M12 22a9 9 0 100-18 9 9 0 000 18z" },
  { href: "/search", label: "Search", iconPath: "M11 4a7 7 0 105.3 11.6L20 19" },
  { href: "/shadowing", label: "Shadowing", iconPath: "M4 12a8 8 0 0116 0v5a2 2 0 01-2 2h-2v-6h4M4 12v5a2 2 0 002 2h2v-6H4" },
  { href: "/kanji", label: "Kanji", iconPath: "M5 6h14M5 12h14M5 18h14M12 6v12" },
  { href: "/kanji/related-review", label: "Ôn từ Kanji", iconPath: "M5 5h14v14H5zM8 9h8M8 13h5M16 16l3 3M19 16v3" },
  { href: "/kanji/worksheet", label: "In PDF Kanji", iconPath: "M7 4h10v4H7zM6 10h12a2 2 0 012 2v5H4v-5a2 2 0 012-2zm2 8h8v2H8z" },
  { href: "/self-study", label: "Tự học chủ động", iconPath: "M4 19h16M6 5h8l4 4v10H6zM10 11h4M10 15h4" },
  { href: "/kanji/roadmap", label: "Lộ trình Kanji", iconPath: "M4 18l6-6 4 4 6-8" },
  { href: "/vocab", label: "Từ vựng", iconPath: "M5 4h10a3 3 0 013 3v13H8a3 3 0 01-3-3zM8 4v16" },
  { href: "/grammar", label: "Ngữ pháp", iconPath: "M6 5h12M6 12h12M6 19h12" },
  { href: "/conjugation", label: "Chia thể", iconPath: "M5 5h14M5 12h14M5 19h8M16 16l3 3 3-3" },
];

export async function NavBar() {
  const user = await getCurrentUser();
  const personalState = user ? await loadUserPersonalState(user.id) : null;
  const links =
    user && isAdminEmail(user.email)
      ? [...privateLinks, { href: "/admin", label: "Admin", iconPath: "M4 5h16v14H4zM9 3v4M15 3v4" }]
      : privateLinks;

  return (
    <header className="sticky top-0 z-50 border-b border-white/70 bg-[#edf4ff]/78 backdrop-blur-xl">
      <div className="mx-auto w-full max-w-[1240px] px-4 py-3 lg:px-6">
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
            <nav className="mt-3 flex items-center gap-2 overflow-x-auto border-t border-white/70 pt-3 lg:hidden">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                >
                  <span className="text-slate-500">{navIcon(link.iconPath)}</span>
                  <span>{link.label}</span>
                </Link>
              ))}
            </nav>
          ) : null}
        </div>
      </div>

      {user ? <DesktopSideNav links={links} /> : null}
    </header>
  );
}
