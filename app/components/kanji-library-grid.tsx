"use client";

import Link from "next/link";
import { motion } from "framer-motion";

type KanjiLibraryItem = {
  id: string;
  character: string;
  hanviet?: string;
  meaning: string;
  jlptLevel: string;
  href: string;
  togglePickHref: string;
  active: boolean;
  picked: boolean;
};

type Props = {
  items: KanjiLibraryItem[];
  selectionEnabled: boolean;
};

type LevelTheme = {
  badge: string;
  glow: string;
  hoverFill: string;
};

function getLevelTheme(level: string): LevelTheme {
  if (level === "N5") {
    return {
      badge: "bg-cyan-100/90 text-cyan-800",
      glow: "from-cyan-300/30 to-sky-200/10",
      hoverFill: "group-hover:from-cyan-200/50 group-hover:to-sky-100/20",
    };
  }
  if (level === "N4") {
    return {
      badge: "bg-violet-100/90 text-violet-800",
      glow: "from-violet-300/30 to-indigo-200/10",
      hoverFill: "group-hover:from-violet-200/50 group-hover:to-indigo-100/20",
    };
  }
  if (level === "N3") {
    return {
      badge: "bg-amber-100/90 text-amber-800",
      glow: "from-amber-300/30 to-yellow-200/10",
      hoverFill: "group-hover:from-amber-200/50 group-hover:to-yellow-100/20",
    };
  }
  if (level === "N2") {
    return {
      badge: "bg-orange-100/90 text-orange-800",
      glow: "from-orange-300/30 to-amber-200/10",
      hoverFill: "group-hover:from-orange-200/50 group-hover:to-amber-100/20",
    };
  }
  return {
    badge: "bg-rose-100/90 text-rose-800",
    glow: "from-rose-300/30 to-fuchsia-200/10",
    hoverFill: "group-hover:from-rose-200/50 group-hover:to-fuchsia-100/20",
  };
}

export function KanjiLibraryGrid({ items, selectionEnabled }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
      {items.map((item, index) => {
        const theme = getLevelTheme(item.jlptLevel);
        const isHighlighted = item.active || item.picked;
        const subtitle = item.hanviet?.trim() || item.meaning;

        return (
          <motion.article
            key={item.id}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.34, delay: index * 0.012, ease: "easeOut" }}
            whileHover={{ y: -4, scale: 1.1 }}
            className="group relative aspect-square"
          >
            {selectionEnabled ? (
              <Link
                href={item.togglePickHref}
                scroll={false}
                className={`absolute right-3 top-3 z-20 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] transition-all duration-300 ${
                  item.picked
                    ? "bg-emerald-500 text-white shadow-[0_10px_18px_rgba(16,185,129,0.28)] hover:bg-emerald-400"
                    : "bg-white/95 text-slate-600 shadow-[0_8px_16px_rgba(15,23,42,0.12)] hover:bg-slate-100"
                }`}
                aria-label={item.picked ? `Bỏ chọn ${item.character}` : `Chọn ${item.character} để học flashcard`}
              >
                {item.picked ? "Đã chọn" : "Flash"}
              </Link>
            ) : null}

            <div
              className={`absolute inset-0 rounded-3xl bg-gradient-to-br ${theme.glow} ${theme.hoverFill} transition-all duration-300`}
            />
            <div
              className={`absolute inset-0 rounded-3xl bg-white/80 shadow-[0_16px_34px_rgba(15,23,42,0.08)] backdrop-blur transition-all duration-300 ${
                isHighlighted
                  ? "ring-2 ring-emerald-300/80"
                  : "ring-1 ring-white/70 group-hover:ring-cyan-200/80"
              }`}
            />

            <Link
              href={item.href}
              className="relative flex h-full flex-col justify-between rounded-3xl p-3"
            >
              <div className="flex items-center justify-between">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.13em] ${theme.badge}`}>
                  {item.jlptLevel}
                </span>
                {selectionEnabled && item.picked ? (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                    Picked
                  </span>
                ) : null}
              </div>

              <div className="relative mt-2">
                <p className="font-kanji-art text-4xl font-bold leading-none text-slate-900 sm:text-[2.5rem]">
                  {item.character}
                </p>
                <p className="mt-1 truncate text-xs text-slate-600">{subtitle}</p>

                <p className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-900/0 transition-all duration-300 group-hover:text-slate-900/25">
                  {subtitle}
                </p>
              </div>
            </Link>
          </motion.article>
        );
      })}
    </div>
  );
}

