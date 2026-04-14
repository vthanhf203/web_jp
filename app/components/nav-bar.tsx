import Image from "next/image";
import Link from "next/link";

import { logoutAction } from "@/app/actions/auth";
import { DailyReminderClient } from "@/app/components/daily-reminder-client";
import { isAdminEmail } from "@/lib/admin";
import { getCurrentUser } from "@/lib/auth";
import { loadUserPersonalState } from "@/lib/user-personal-data";

const privateLinks = [
  { href: "/dashboard", label: "Tong quan" },
  { href: "/personal", label: "Lo trinh" },
  { href: "/placement", label: "Test dau vao" },
  { href: "/focus", label: "On sai" },
  { href: "/search", label: "Search" },
  { href: "/kanji", label: "Kanji" },
  { href: "/vocab", label: "Tu vung" },
  { href: "/grammar", label: "Ngu phap" },
];

export async function NavBar() {
  const user = await getCurrentUser();
  const personalState = user ? await loadUserPersonalState(user.id) : null;
  const links =
    user && isAdminEmail(user.email)
      ? [...privateLinks, { href: "/admin", label: "Admin" }]
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
                <p className="text-xs text-slate-500">Kanji | Tu vung | Ngu phap</p>
              </div>
            </Link>

            {user ? (
              <div className="flex flex-wrap items-center gap-2">
                <div className="rounded-full border border-blue-200 bg-white/90 px-3 py-1 text-xs text-slate-600 shadow-[0_8px_20px_rgba(37,99,235,0.08)]">
                  <span className="font-semibold text-slate-700">{user.name}</span>
                  <span className="mx-1 text-slate-300">|</span>
                  <span className="font-bold text-emerald-700">{user.xp} XP</span>
                  <span className="mx-1 text-slate-300">|</span>
                  <span className="font-bold text-orange-600">{user.streak} ngay</span>
                </div>
                {personalState ? (
                  <DailyReminderClient
                    enabled={personalState.reminders.enabled}
                    hour={personalState.reminders.hour}
                    minute={personalState.reminders.minute}
                    label="Mo JP Lab 20 phut de giu streak hom nay."
                  />
                ) : null}
                <form action={logoutAction}>
                  <button type="submit" className="btn-danger">
                    Dang xuat
                  </button>
                </form>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link href="/login" className="btn-soft text-sm">
                  Dang nhap
                </Link>
                <Link href="/register" className="btn-primary text-sm">
                  Tao tai khoan
                </Link>
              </div>
            )}
          </div>

          {user ? (
            <nav className="mt-3 flex items-center gap-1 overflow-x-auto border-t border-white/70 pt-3">
              {links.map((link) => (
                <Link key={link.href} href={link.href} className="nav-link whitespace-nowrap">
                  {link.label}
                </Link>
              ))}
            </nav>
          ) : null}
        </div>
      </div>
    </header>
  );
}

