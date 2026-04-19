"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type NavLinkItem = {
  href: string;
  label: string;
  iconPath: string;
};

function Icon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
      <path d={path} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type Props = {
  links: NavLinkItem[];
};

export function DesktopSideNav({ links }: Props) {
  const pathname = usePathname();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  const activeHref = useMemo(() => {
    const matches = links
      .filter((link) => pathname === link.href || pathname.startsWith(`${link.href}/`))
      .sort((a, b) => b.href.length - a.href.length);
    return matches[0]?.href ?? "";
  }, [links, pathname]);

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

    syncScrollState();
    node.addEventListener("scroll", syncScrollState, { passive: true });
    window.addEventListener("resize", syncScrollState);

    return () => {
      node.removeEventListener("scroll", syncScrollState);
      window.removeEventListener("resize", syncScrollState);
    };
  }, [syncScrollState]);

  useEffect(() => {
    syncScrollState();
  }, [links.length, syncScrollState]);

  const scrollByStep = useCallback((distance: number) => {
    scrollRef.current?.scrollBy({ top: distance, behavior: "smooth" });
  }, []);

  return (
    <aside className="fixed left-4 top-[104px] z-40 hidden w-[96px] lg:block">
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-[0_16px_30px_rgba(26,49,91,0.14)] backdrop-blur">
        <div
          ref={scrollRef}
          className="max-h-[calc(100vh-176px)] overflow-y-auto pr-0.5 [scrollbar-width:thin]"
        >
          <div className="space-y-1.5 pb-10 pt-0.5">
            {links.map((link) => {
              const active = link.href === activeHref;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`group flex flex-col items-center rounded-xl border px-2 py-2 text-center ${
                    active
                      ? "border-sky-300/80 bg-sky-50"
                      : "border-transparent hover:border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <span
                    className={`transition ${
                      active ? "text-sky-700" : "text-slate-500 group-hover:text-slate-700"
                    }`}
                  >
                    <Icon path={link.iconPath} />
                  </span>
                  <span
                    className={`mt-1 text-[11px] font-semibold leading-tight ${
                      active ? "text-sky-800" : "text-slate-600"
                    }`}
                  >
                    {link.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>

        <div
          className={`pointer-events-none absolute inset-x-2 top-2 h-7 rounded-t-xl bg-gradient-to-b from-white to-transparent transition ${
            canScrollUp ? "opacity-100" : "opacity-0"
          }`}
        />
        <div
          className={`pointer-events-none absolute inset-x-2 bottom-12 h-7 rounded-b-xl bg-gradient-to-t from-white to-transparent transition ${
            canScrollDown ? "opacity-100" : "opacity-0"
          }`}
        />

        <div className="absolute inset-x-0 bottom-2 flex justify-center">
          <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-white/95 px-1 py-1 shadow-sm">
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => scrollByStep(-180)}
              disabled={!canScrollUp}
              aria-label="Cuon len"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
                <path
                  d="M6 14l6-6 6 6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => scrollByStep(180)}
              disabled={!canScrollDown}
              aria-label="Cuon xuong"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
                <path
                  d="M6 10l6 6 6-6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
