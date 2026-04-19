"use client";

import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import LessonCard from "@/components/LessonCard";

export type GrammarRoadmapLevelTab = {
  level: string;
  href: string;
  lessonCount: number;
  active: boolean;
};

export type GrammarRoadmapLesson = {
  id: string;
  href: string;
  lessonNumber: number;
  title: string;
  topic: string | null;
  pointCount: number;
  learnedCount: number;
  progress: number;
  status: "current" | "done" | "todo";
};

type GrammarRoadmapProps = {
  bookTitle: string;
  overallProgress: number;
  levelTabs: GrammarRoadmapLevelTab[];
  lessons: GrammarRoadmapLesson[];
};

const listVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.05,
    },
  },
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      type: "spring",
      stiffness: 210,
      damping: 20,
    },
  },
};

function mapStatus(status: GrammarRoadmapLesson["status"]): "done" | "learning" | "locked" {
  if (status === "done") {
    return "done";
  }
  if (status === "current") {
    return "learning";
  }
  return "locked";
}

export default function GrammarRoadmap({
  bookTitle,
  overallProgress,
  levelTabs,
  lessons,
}: GrammarRoadmapProps) {
  const sortedLessons = [...lessons].sort((a, b) => a.lessonNumber - b.lessonNumber);

  return (
    <section className="space-y-6 rounded-[2rem] bg-[#F8FAFC] p-4 shadow-[0_4px_20px_rgba(0,0,0,0.03)] sm:p-6">
      <header className="space-y-4 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
          Visual Study Roadmap
        </p>
        <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
          Lộ trình Minna no Nihongo
        </h2>
        <p className="text-sm font-medium text-slate-500">{bookTitle}</p>

        <div className="mx-auto inline-flex flex-wrap items-center justify-center gap-1 rounded-full bg-white p-1.5 shadow-[0_8px_26px_rgba(15,23,42,0.08)]">
          {levelTabs.map((tab) => (
            <Link
              key={tab.level}
              href={tab.href}
              className={`rounded-full px-4 py-2 text-center transition ${
                tab.active
                  ? "bg-slate-900 text-white shadow-[0_10px_22px_rgba(15,23,42,0.2)]"
                  : "bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-800"
              }`}
            >
              <span className="block text-[11px] font-semibold uppercase tracking-[0.18em]">
                {tab.level}
              </span>
              <span className="block text-[10px] font-medium opacity-80">{tab.lessonCount} bài</span>
            </Link>
          ))}
        </div>

        <div className="mx-auto max-w-2xl rounded-full bg-slate-200/70 p-1">
          <div
            className="h-2.5 rounded-full bg-gradient-to-r from-sky-400 via-blue-400 to-violet-400"
            style={{ width: `${Math.max(0, overallProgress)}%` }}
          />
        </div>
      </header>

      <motion.div
        variants={listVariants}
        initial="hidden"
        animate="show"
        className="grid gap-x-4 gap-y-6 sm:grid-cols-2 xl:grid-cols-3"
      >
        {sortedLessons.map((lesson) => (
          <motion.div key={lesson.id} variants={cardVariants} whileHover={{ y: -3 }}>
            <Link href={lesson.href} className="block">
              <LessonCard
                title={`Bài ${lesson.lessonNumber}`}
                subtitle={lesson.topic ?? lesson.title}
                status={mapStatus(lesson.status)}
                current={lesson.learnedCount}
                total={lesson.pointCount}
              />
            </Link>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}

