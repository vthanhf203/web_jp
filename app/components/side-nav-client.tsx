"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type NavLinkItem = {
  href: string;
  label: string;
  iconPath: string;
};

export type NavGroupItem = {
  id: string;
  label: string;
  iconPath: string;
  links: NavLinkItem[];
};

type Props = {
  groups: NavGroupItem[];
};

function Icon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
      <path d={path} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BrandMark() {
  return (
    <div className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-white to-sky-50 text-blue-600 shadow-[0_10px_24px_rgba(37,99,235,0.14)]">
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
        <path
          d="M4 9l8-4 8 4-8 4-8-4zM7 11v5c1.6 1.5 8.4 1.5 10 0v-5M20 10v5"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

export function DesktopSideNav({ groups }: Props) {
  const pathname = usePathname();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set(["overview", "learn"]));
  const links = useMemo(() => groups.flatMap((group) => group.links), [groups]);

  const activeHref = useMemo(() => {
    const matches = links
      .filter((link) => pathname === link.href || pathname.startsWith(`${link.href}/`))
      .sort((a, b) => b.href.length - a.href.length);
    return matches[0]?.href ?? "";
  }, [links, pathname]);
  const activeGroupId = useMemo(
    () => groups.find((group) => group.links.some((link) => link.href === activeHref))?.id ?? "",
    [activeHref, groups]
  );

  const syncScrollState = useCallback(() => {
    const node = scrollRef.current;
    if (!node) {
      setCanScrollUp(false);
      setCanScrollDown(false);
      return;
    }

    const maxScroll = node.scrollHeight - node.clientHeight;
    setCanScrollUp(node.scrollTop > 6);
    setCanScrollDown(maxScroll - node.scrollTop > 6);
  }, []);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) {
      return;
    }

    const frame = window.requestAnimationFrame(syncScrollState);
    node.addEventListener("scroll", syncScrollState, { passive: true });
    window.addEventListener("resize", syncScrollState);

    return () => {
      window.cancelAnimationFrame(frame);
      node.removeEventListener("scroll", syncScrollState);
      window.removeEventListener("resize", syncScrollState);
    };
  }, [syncScrollState]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(syncScrollState);
    return () => window.cancelAnimationFrame(frame);
  }, [collapsed, links.length, syncScrollState]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stored = window.localStorage.getItem("jp-lab-side-nav-collapsed");
      setCollapsed(stored === "1");
      const storedGroups = window.localStorage.getItem("jp-lab-side-nav-groups");
      if (storedGroups) {
        try {
          const parsed = JSON.parse(storedGroups) as unknown;
          if (Array.isArray(parsed)) {
            setOpenGroups(new Set(parsed.filter((entry): entry is string => typeof entry === "string")));
          }
        } catch {
          window.localStorage.removeItem("jp-lab-side-nav-groups");
        }
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function toggleCollapsed() {
    setCollapsed((value) => {
      const next = !value;
      window.localStorage.setItem("jp-lab-side-nav-collapsed", next ? "1" : "0");
      return next;
    });
  }

  function toggleGroup(groupId: string) {
    setOpenGroups((current) => {
      const next = new Set(current);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      window.localStorage.setItem("jp-lab-side-nav-groups", JSON.stringify(Array.from(next)));
      return next;
    });
  }

  function navLink(link: NavLinkItem) {
    const active = link.href === activeHref;
    return (
      <Link
        key={link.href}
        href={link.href}
        title={collapsed ? link.label : undefined}
        aria-label={link.label}
        className={`group relative flex min-h-11 items-center rounded-xl border text-left transition-all duration-200 ${
          active
            ? "border-blue-100 bg-blue-50 text-blue-700 shadow-[inset_3px_0_0_#2563eb,0_8px_18px_rgba(37,99,235,0.08)]"
            : "border-transparent bg-white text-slate-600 hover:border-blue-100 hover:bg-sky-50/70 hover:text-blue-700"
        } ${collapsed ? "justify-center px-2 py-2.5" : "gap-2.5 px-3 py-2.5"}`}
      >
        <span
          className={`grid h-6 w-6 shrink-0 place-items-center transition ${
            active ? "text-blue-600" : "text-slate-400 group-hover:text-blue-600"
          }`}
        >
          <Icon path={link.iconPath} />
        </span>
        <span
          className={`min-w-0 text-[11px] font-bold leading-snug transition ${
            collapsed ? "sr-only" : "line-clamp-2"
          } ${active ? "text-blue-700" : "text-slate-600 group-hover:text-blue-700"}`}
        >
          {link.label}
        </span>
      </Link>
    );
  }

  return (
    <aside
      className={`fixed left-5 top-[104px] z-40 hidden transition-all duration-300 lg:block ${
        collapsed ? "w-[84px]" : "w-[164px]"
      }`}
    >
      <div className="relative overflow-hidden rounded-[1.45rem] border border-slate-200/80 bg-white/96 p-3 shadow-[0_20px_48px_rgba(26,49,91,0.16)] backdrop-blur-xl">
        <div className="mb-3 grid place-items-center border-b border-slate-100 pb-3">
          <BrandMark />
        </div>

        <div
          ref={scrollRef}
          className="max-h-[calc(100vh-254px)] overflow-y-auto pr-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <div className="space-y-2 pb-2 pt-0.5">
            {collapsed
              ? links.map(navLink)
              : groups.map((group) => {
                  const open = openGroups.has(group.id) || group.id === activeGroupId;
                  const active = group.id === activeGroupId;
                  return (
                    <section key={group.id} className="overflow-hidden rounded-2xl border border-slate-100 bg-white">
                      <button
                        type="button"
                        onClick={() => toggleGroup(group.id)}
                        aria-expanded={open}
                        className={`flex w-full items-center gap-2.5 px-3 py-3 text-left transition ${
                          active ? "bg-blue-50/70 text-blue-700" : "text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        <span className={`grid h-6 w-6 place-items-center ${active ? "text-blue-600" : "text-slate-400"}`}>
                          <Icon path={group.iconPath} />
                        </span>
                        <span className="min-w-0 flex-1 text-[11px] font-black uppercase tracking-[0.08em]">
                          {group.label}
                        </span>
                        <svg
                          viewBox="0 0 24 24"
                          className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`}
                          fill="none"
                          aria-hidden="true"
                        >
                          <path d="M7 10l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      </button>
                      {open ? <div className="space-y-1 border-t border-slate-100 p-1.5">{group.links.map(navLink)}</div> : null}
                    </section>
                  );
                })}
          </div>
        </div>

        <div
          className={`pointer-events-none absolute inset-x-3 top-[72px] h-8 rounded-t-xl bg-gradient-to-b from-white to-transparent transition ${
            canScrollUp ? "opacity-100" : "opacity-0"
          }`}
        />
        <div
          className={`pointer-events-none absolute inset-x-3 bottom-[76px] h-8 rounded-b-xl bg-gradient-to-t from-white to-transparent transition ${
            canScrollDown ? "opacity-100" : "opacity-0"
          }`}
        />

        <div className="mt-3 border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Mo rong thanh dieu huong" : "Thu gon thanh dieu huong"}
            className={`flex h-11 w-full items-center justify-center rounded-2xl border border-slate-200 bg-white text-xs font-bold text-slate-500 shadow-[0_8px_18px_rgba(15,23,42,0.04)] transition hover:border-blue-100 hover:bg-sky-50 hover:text-blue-700 ${
              collapsed ? "px-0" : "gap-2 px-3"
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              className={`h-4 w-4 transition ${collapsed ? "rotate-180" : ""}`}
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M11 8l-4 4 4 4M17 8l-4 4 4 4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {collapsed ? null : <span>Thu gọn</span>}
          </button>
        </div>
      </div>
    </aside>
  );
}
