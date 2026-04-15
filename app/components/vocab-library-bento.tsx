"use client";

import Link from "next/link";
import { motion } from "framer-motion";

import type { JlptLevel } from "@/lib/admin-vocab-library";

type LevelDockItem = {
  level: JlptLevel;
  jpLabel: string;
  hint: string;
  lessonCount: number;
  vocabCount: number;
  href: string;
  active: boolean;
};

type LessonBentoItem = {
  id: string;
  title: string;
  description: string;
  wordCount: number;
  href: string;
  completionPercent: number;
};

type Props = {
  selectedLevel: JlptLevel;
  completionPercent: number;
  completedTopicCount: number;
  totalTopicCount: number;
  levels: LevelDockItem[];
  lessons: LessonBentoItem[];
};

type Accent = "sky" | "violet" | "amber" | "lime";

const accentMeta: Record<
  Accent,
  {
    ringClass: string;
    badgeClass: string;
    glowClass: string;
    progressHex: string;
    titleClass: string;
    tag: string;
  }
> = {
  sky: {
    ringClass: "border-sky-200",
    badgeClass: "border-sky-200 bg-sky-50 text-sky-700",
    glowClass: "bg-[radial-gradient(circle_at_12%_0%,rgba(56,189,248,0.16),transparent_44%)]",
    progressHex: "#38bdf8",
    titleClass: "group-hover:text-sky-700",
    tag: "Verb",
  },
  violet: {
    ringClass: "border-violet-200",
    badgeClass: "border-violet-200 bg-violet-50 text-violet-700",
    glowClass: "bg-[radial-gradient(circle_at_12%_0%,rgba(167,139,250,0.16),transparent_44%)]",
    progressHex: "#a78bfa",
    titleClass: "group-hover:text-violet-700",
    tag: "Vocab",
  },
  amber: {
    ringClass: "border-amber-200",
    badgeClass: "border-amber-200 bg-amber-50 text-amber-700",
    glowClass: "bg-[radial-gradient(circle_at_12%_0%,rgba(251,191,36,0.15),transparent_44%)]",
    progressHex: "#fbbf24",
    titleClass: "group-hover:text-amber-700",
    tag: "Time",
  },
  lime: {
    ringClass: "border-lime-200",
    badgeClass: "border-lime-200 bg-lime-50 text-lime-700",
    glowClass: "bg-[radial-gradient(circle_at_12%_0%,rgba(163,230,53,0.14),transparent_44%)]",
    progressHex: "#a3e635",
    titleClass: "group-hover:text-lime-700",
    tag: "Life",
  },
};

const containerVariants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.08,
    },
  },
} as const;

const itemVariants = {
  hidden: { opacity: 0, y: 14, scale: 0.99 },
  show: { opacity: 1, y: 0, scale: 1 },
} as const;

function detectAccent(title: string, description: string, index: number): Accent {
  const source = `${title} ${description}`.toLowerCase();
  if (source.includes("dong tu") || source.includes("verb")) {
    return "sky";
  }
  if (source.includes("tinh tu") || source.includes("adjective")) {
    return "violet";
  }
  if (source.includes("so dem") || source.includes("ngay") || source.includes("gio") || source.includes("thoi tiet")) {
    return "amber";
  }
  if (source.includes("gia dinh") || source.includes("con nguoi") || source.includes("suc khoe") || source.includes("doi song")) {
    return "lime";
  }
  const cycle: Accent[] = ["sky", "violet", "amber", "lime"];
  return cycle[index % cycle.length] ?? "sky";
}

function bentoSpanClass(index: number): string {
  if (index === 0) {
    return "xl:col-span-2";
  }
  return "xl:col-span-1";
}

function MiniProgress({ percent, colorHex }: { percent: number; colorHex: string }) {
  const safePercent = Math.max(0, Math.min(100, percent));
  const sweep = `${safePercent * 3.6}deg`;
  return (
    <div
      className="relative h-11 w-11 rounded-full p-[2px]"
      style={{
        background: `conic-gradient(${colorHex} ${sweep}, rgba(203,213,225,0.9) ${sweep})`,
      }}
      aria-label={`Progress ${safePercent}%`}
    >
      <div className="grid h-full w-full place-items-center rounded-full bg-white text-[10px] font-bold text-slate-700">
        {safePercent}%
      </div>
    </div>
  );
}

export function VocabLibraryBento({
  selectedLevel,
  completionPercent,
  completedTopicCount,
  totalTopicCount,
  levels,
  lessons,
}: Props) {
  const clampedCompletion = Math.max(0, Math.min(100, completionPercent));

  return (
    <div className="space-y-6">
      <div className="sticky top-[102px] z-20">
        <div className="mx-auto w-full max-w-4xl rounded-full border border-slate-200 bg-white/95 p-2 shadow-lg backdrop-blur">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {levels.map((item) => (
              <Link
                key={item.level}
                href={item.href}
                className={`rounded-full border px-3 py-2 text-center transition ${
                  item.active
                    ? "border-sky-200 bg-sky-50 text-sky-700 shadow-sm"
                    : "border-slate-200 bg-white text-slate-600 hover:border-sky-200 hover:bg-sky-50"
                }`}
              >
                <p className="text-sm font-bold">{item.level}</p>
                <p className="text-[10px] uppercase tracking-wide opacity-80">{item.hint}</p>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <header className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(56,189,248,0.14),transparent_44%),radial-gradient(circle_at_85%_16%,rgba(167,139,250,0.12),transparent_46%)]" />
        <div className="relative">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">Fresh Bento Vocabulary</p>
          <h2 className="mt-1 text-4xl font-black leading-tight text-slate-900 sm:text-6xl">JLPT {selectedLevel}</h2>
          <p className="mt-3 max-w-3xl text-sm text-slate-600 sm:text-base">
            Bo cuc Bento card-based sang, thoang va de theo doi tien do hoc tung chu de.
          </p>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-2 flex items-center justify-between text-xs text-slate-600 sm:text-sm">
              <span>Da hoan thanh: {completedTopicCount}/{totalTopicCount || 0} chu de</span>
              <span>{clampedCompletion}%</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-200">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${clampedCompletion}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="h-full rounded-full bg-gradient-to-r from-sky-400 via-violet-400 to-amber-300 shadow-[0_0_18px_rgba(56,189,248,0.45)]"
              />
            </div>
          </div>
        </div>
      </header>

      {lessons.length === 0 ? (
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-amber-700">
          Chua co chu de nao trong cap do nay. Ban co the them du lieu tai /admin/vocab.
        </div>
      ) : (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
        >
          {lessons.map((lesson, index) => {
            const accent = detectAccent(lesson.title, lesson.description, index);
            const accentStyle = accentMeta[accent];
            const isLargeCard = index === 0;

            return (
              <motion.article
                key={lesson.id}
                variants={itemVariants}
                whileHover={{ scale: 1.02, y: -2 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className={`group relative overflow-hidden rounded-3xl border bg-white p-5 shadow-sm transition ${accentStyle.ringClass} ${bentoSpanClass(
                  index
                )} ${isLargeCard ? "min-h-[245px]" : "min-h-[220px]"}`}
              >
                <div className={`pointer-events-none absolute inset-0 opacity-75 ${accentStyle.glowClass}`} />
                <div className="pointer-events-none absolute inset-0 rounded-3xl border border-transparent opacity-0 shadow-[0_0_0_1px_rgba(186,230,253,0.9),0_12px_28px_rgba(148,163,184,0.18)] transition group-hover:opacity-100" />
                <Link href={lesson.href} className="absolute inset-0 z-10" aria-label={`Mo chu de ${lesson.title}`} />

                <div className="relative z-0 flex h-full flex-col justify-between">
                  <div className="flex items-start justify-between gap-3">
                    <span
                      className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${accentStyle.badgeClass}`}
                    >
                      {accentStyle.tag}
                    </span>
                    <MiniProgress percent={lesson.completionPercent} colorHex={accentStyle.progressHex} />
                  </div>

                  <div className="mt-5">
                    <h3 className={`text-2xl font-extrabold text-slate-900 transition ${accentStyle.titleClass}`}>
                      {lesson.title}
                    </h3>
                    <p className="mt-2 text-base text-slate-500">{lesson.description}</p>
                  </div>

                  <div className="mt-5 flex items-center justify-between">
                    <p className="text-lg font-bold text-slate-700">{lesson.wordCount} tu vung</p>
                    <span className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-600">
                      Mo chu de
                    </span>
                  </div>
                </div>
              </motion.article>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}
