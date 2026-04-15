"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import type { Variants } from "framer-motion";
import {
  BarChart3,
  BellRing,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Flame,
  Languages,
  Trophy,
  Target,
  Zap,
} from "lucide-react";

type LearningStep = {
  href: string;
  title: string;
  subtitle: string;
};

type ChartItem = {
  key: string;
  count: number;
};

type Props = {
  userName: string;
  initials: string;
  level: string;
  xp: number;
  xpPercent: number;
  streak: number;
  kanjiCount: number;
  totalVocabCount: number;
  steps: LearningStep[];
  quizGoalProgress: number;
  quizDone: number;
  quizTargetDays: number;
  remindersEnabled: boolean;
  dueReviews: number;
  reviewCount30d: number;
  chart7: ChartItem[];
  maxChartCount: number;
};

const gridVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.06,
    },
  },
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 22, scale: 0.98 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: "spring",
      stiffness: 120,
      damping: 18,
      mass: 0.55,
    },
  },
};

function ProgressRing({ value }: { value: number }) {
  const safeValue = Math.max(0, Math.min(100, value));
  const sweep = `${safeValue * 3.6}deg`;
  return (
    <div
      className="relative h-14 w-14 rounded-full p-[3px] shadow-[0_6px_20px_rgba(16,185,129,0.2)]"
      style={{ background: `conic-gradient(#34d399 ${sweep}, rgba(203,213,225,0.9) ${sweep})` }}
      aria-label={`XP progress ${safeValue}%`}
    >
      <div className="grid h-full w-full place-items-center rounded-full bg-white text-sm font-extrabold text-emerald-700">
        {safeValue}%
      </div>
    </div>
  );
}

function MetricCard({
  title,
  subtitle,
  value,
  tone,
  icon,
  iconClass,
}: {
  title: string;
  subtitle: string;
  value: string;
  tone: string;
  icon: ReactNode;
  iconClass: string;
}) {
  return (
    <motion.article
      variants={cardVariants}
      initial="hidden"
      animate="show"
      whileHover={{ y: -4, scale: 1.01, boxShadow: "0 24px 42px rgba(15,23,42,0.14)" }}
      className={`group relative overflow-hidden rounded-3xl border border-slate-200/60 bg-white/80 p-5 backdrop-blur-md ${tone}`}
    >
      <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white/40 blur-2xl" />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-700">{title}</p>
          <p className="mt-1 text-3xl font-black tracking-tight text-slate-900">{value}</p>
          <p className="mt-1 text-xs text-slate-400">{subtitle}</p>
        </div>
        <motion.div
          className={`rounded-2xl border border-white/50 p-2.5 shadow-sm ${iconClass}`}
          whileHover={{ rotate: [0, -8, 8, -4, 0], scale: [1, 1.06, 1] }}
          transition={{ duration: 0.5 }}
        >
          {icon}
        </motion.div>
      </div>
    </motion.article>
  );
}

export function DashboardBentoClient({
  userName,
  initials,
  level,
  xp,
  xpPercent,
  streak,
  kanjiCount,
  totalVocabCount,
  steps,
  quizGoalProgress,
  quizDone,
  quizTargetDays,
  remindersEnabled,
  dueReviews,
  reviewCount30d,
  chart7,
  maxChartCount,
}: Props) {
  return (
    <section className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="relative overflow-hidden rounded-[2rem] border border-slate-200/60 bg-white/80 p-6 shadow-[0_10px_24px_rgba(15,23,42,0.09),0_22px_54px_rgba(15,23,42,0.06)] backdrop-blur-md sm:p-8"
      >
        <div className="pointer-events-none absolute -left-20 top-8 h-44 w-44 rounded-full bg-emerald-200/40 blur-3xl" />
        <div className="pointer-events-none absolute right-8 top-0 h-52 w-52 rounded-full bg-violet-200/35 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 right-20 h-44 w-44 rounded-full bg-orange-200/35 blur-3xl" />

        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-500">Daily mission</p>
            <h1 className="mt-1 text-2xl font-black leading-tight text-slate-900 sm:text-3xl">
              <span className="mr-2">👋</span>
              Chào {userName}, sẵn sàng chinh phục tiếng Nhật hôm nay?
            </h1>
            <p className="mt-2 text-sm text-slate-500 sm:text-base">
              Nâng nhịp học đều mỗi ngày để giữ streak và lên cấp nhanh hơn.
            </p>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-slate-200/70 bg-white/85 px-3 py-2 shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-sky-100 via-indigo-100 to-emerald-100 text-sm font-bold text-slate-700">
              {initials}
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">{userName}</p>
              <p className="text-xs text-slate-500">Level {level}</p>
            </div>
          </div>
        </div>

        <motion.div
          variants={gridVariants}
          initial="hidden"
          animate="show"
          className="relative mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-12"
        >
          <div className="xl:col-span-3">
            <MetricCard
              title="XP Tích Lũy"
              subtitle="Cấp độ hiện tại"
              value={`${xp} XP`}
              tone="bg-emerald-50/70"
              icon={<Zap className="h-5 w-5 text-amber-500" />}
              iconClass="bg-amber-50"
            />
          </div>

          <div className="xl:col-span-3">
            <MetricCard
              title="Chuỗi Học"
              subtitle="Duy trì đều đặn"
              value={`${streak} ngày`}
              tone="bg-orange-50/70"
              icon={<Flame className="h-5 w-5 text-orange-500" />}
              iconClass="bg-orange-50"
            />
          </div>

          <div className="xl:col-span-3">
            <MetricCard
              title="Vốn Kanji"
              subtitle="Mục tiêu N5"
              value={String(kanjiCount)}
              tone="bg-cyan-50/70"
              icon={<Languages className="h-5 w-5 text-cyan-600" />}
              iconClass="bg-cyan-50"
            />
          </div>

          <div className="xl:col-span-3">
            <MetricCard
              title="Vốn Từ Vựng"
              subtitle="Đã tích lũy"
              value={String(totalVocabCount)}
              tone="bg-violet-50/70"
              icon={<BookOpen className="h-5 w-5 text-violet-600" />}
              iconClass="bg-violet-50"
            />
          </div>

          <motion.article
            variants={cardVariants}
            whileHover={{ y: -4, scale: 1.01, boxShadow: "0 24px 44px rgba(15,23,42,0.16)" }}
            className="relative overflow-hidden rounded-3xl border border-slate-200/60 bg-white/80 p-6 shadow-[0_12px_30px_rgba(15,23,42,0.08)] backdrop-blur-md xl:col-span-7"
          >
            <div className="pointer-events-none absolute -left-20 top-10 h-40 w-40 rounded-full bg-emerald-200/25 blur-3xl" />
            <div className="relative flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-slate-900 sm:text-2xl">Hành trình học</h2>
                <p className="mt-1 text-sm text-slate-500">Đi theo từng bước để học đều và không quá tải.</p>
              </div>
              <div className="flex items-center gap-3 rounded-2xl border border-emerald-200/60 bg-emerald-50/70 px-3 py-2">
                <ProgressRing value={xpPercent} />
              </div>
            </div>

            <div className="mt-5 grid gap-3">
              {steps.map((step, index) => (
                <motion.div
                  key={step.title}
                  whileHover={{ y: -2, boxShadow: "0 16px 30px rgba(16,185,129,0.16)" }}
                  transition={{ duration: 0.18 }}
                >
                  <Link
                    href={step.href}
                    className="group flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white/85 px-4 py-3"
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-emerald-200 bg-emerald-50 text-sm font-bold text-emerald-700">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-800 sm:text-base">{step.title}</p>
                      <p className="text-xs text-slate-500">{step.subtitle}</p>
                    </div>
                    <motion.span
                      className="text-emerald-600"
                      whileHover={{ x: 3, rotate: [0, -8, 8, 0] }}
                      transition={{ duration: 0.4 }}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </motion.span>
                  </Link>
                </motion.div>
              ))}
            </div>
          </motion.article>

          <motion.article
            variants={cardVariants}
            whileHover={{ y: -4, scale: 1.01, boxShadow: "0 24px 44px rgba(15,23,42,0.16)" }}
            className="rounded-3xl border border-slate-200/60 bg-white/80 p-6 shadow-[0_12px_30px_rgba(15,23,42,0.08)] backdrop-blur-md xl:col-span-5"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-black text-slate-900">Bảng tin N5</h2>
              <Trophy className="h-5 w-5 text-violet-500" />
            </div>

            <div className="mt-4 rounded-2xl border border-violet-200/70 bg-violet-50/70 p-4">
              <p className="text-sm font-semibold text-slate-700">Mục tiêu: N5</p>
              <div className="mt-3 rounded-full bg-slate-200 p-1 shadow-inner">
                <div className="h-2 rounded-full bg-gradient-to-r from-emerald-400 via-sky-400 to-violet-400" style={{ width: `${quizGoalProgress}%` }} />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-slate-600">
                <span>{quizGoalProgress}% hoàn thành</span>
                <span>Quiz 30 ngày: {quizDone}/{quizTargetDays}</span>
              </div>
            </div>

            <div className="mt-3 grid gap-2 text-sm">
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white/90 px-3 py-2">
                <span className="inline-flex items-center gap-1.5 text-slate-600">
                  <BellRing className="h-4 w-4 text-emerald-500" /> Reminder
                </span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${remindersEnabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>
                  {remindersEnabled ? "Đã bật" : "Đang tắt"}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-slate-700">
                <span className="inline-flex items-center gap-1.5"><Target className="h-4 w-4 text-cyan-600" /> Ôn đến hạn</span>
                <span className="font-semibold">{dueReviews} thẻ</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-slate-700">
                <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-indigo-500" /> Lượt ôn 30 ngày</span>
                <span className="font-semibold">{reviewCount30d}</span>
              </div>
            </div>
          </motion.article>

          <motion.article
            variants={cardVariants}
            whileHover={{ y: -4, scale: 1.01, boxShadow: "0 24px 44px rgba(15,23,42,0.16)" }}
            className="rounded-3xl border border-slate-200/60 bg-white/80 p-6 shadow-[0_12px_30px_rgba(15,23,42,0.08)] backdrop-blur-md xl:col-span-12"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-black text-slate-900 sm:text-xl">Thống kê 7 ngày gần nhất</h2>
              <BarChart3 className="h-5 w-5 text-sky-600" />
            </div>
            <p className="mt-1 text-xs text-slate-500">Giữ đều cột xanh mỗi ngày để tăng tốc độ ghi nhớ.</p>

            <div className="mt-5 grid grid-cols-7 gap-2 sm:gap-3">
              {chart7.map((item) => {
                const barHeight = Math.max(8, Math.round((item.count / Math.max(1, maxChartCount)) * 88));
                return (
                  <div key={item.key} className="flex flex-col items-center gap-1.5">
                    <div className="flex h-[100px] w-full items-end rounded-xl border border-slate-200 bg-slate-50 p-1">
                      <div
                        className="w-full rounded-md bg-gradient-to-t from-emerald-500 via-emerald-400 to-teal-300 shadow-[0_6px_14px_rgba(16,185,129,0.25)]"
                        style={{ height: `${barHeight}px` }}
                        title={`${item.key}: ${item.count} lượt`}
                      />
                    </div>
                    <p className="text-[11px] font-semibold text-slate-500">{item.key.slice(5)}</p>
                    <p className="text-xs font-bold text-slate-700">{item.count}</p>
                  </div>
                );
              })}
            </div>
          </motion.article>
        </motion.div>
      </motion.div>
    </section>
  );
}
