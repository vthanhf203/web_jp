import Link from "next/link";

import { logoutAction } from "@/app/actions/auth";
import { isAdminEmail } from "@/lib/admin";
import { getCurrentUser } from "@/lib/auth";

const privateLinks = [
  { href: "/dashboard", label: "Tong quan" },
  { href: "/kanji", label: "Kanji" },
  { href: "/vocab", label: "Tu vung" },
  { href: "/grammar", label: "Ngu phap" },
  { href: "/review", label: "On tap SRS" },
  { href: "/quiz", label: "Quiz" },
];

export async function NavBar() {
  const user = await getCurrentUser();
  const links =
    user && isAdminEmail(user.email)
      ? [...privateLinks, { href: "/admin", label: "Admin" }]
      : privateLinks;

  return (
    <header className="sticky top-0 z-50 border-b border-white/60 bg-[#edf4ff]/78 backdrop-blur-lg">
      <div className="mx-auto w-full max-w-[1200px] px-4 py-3 lg:px-6">
        <div className="glass-card rounded-2xl px-3 py-3 sm:px-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/" className="group flex items-center gap-3">
              <span className="rounded-full bg-gradient-to-r from-emerald-600 via-sky-600 to-blue-700 px-3 py-1 text-xs font-extrabold uppercase tracking-[0.15em] text-white shadow-[0_10px_24px_rgba(14,116,144,0.35)]">
                JP LAB
              </span>
              <div className="leading-tight">
                <p className="text-sm font-semibold text-slate-700">Hoc Nhat co he thong</p>
                <p className="text-xs text-slate-500">Kanji · Tu vung · Ngu phap · SRS</p>
              </div>
            </Link>

            {user ? (
              <div className="flex flex-wrap items-center gap-2">
                <div className="rounded-full border border-blue-200 bg-white/90 px-3 py-1 text-xs text-slate-600">
                  <span className="font-semibold text-slate-700">{user.name}</span>
                  <span className="mx-1 text-slate-300">|</span>
                  <span className="font-bold text-emerald-700">{user.xp} XP</span>
                  <span className="mx-1 text-slate-300">|</span>
                  <span className="font-bold text-orange-600">{user.streak} ngay</span>
                </div>
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
            <nav className="mt-3 flex items-center gap-1 overflow-x-auto pb-1">
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

