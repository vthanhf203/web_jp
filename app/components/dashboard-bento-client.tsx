"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Variants } from "framer-motion";
import {
  BarChart3,
  BellRing,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Flame,
  Languages,
  PlayCircle,
  Trophy,
  Target,
  X,
  Zap,
} from "lucide-react";

import {
  clearLearningProgress,
  learningProgressUpdatedEventName,
  readLearningProgressList,
  type LearningProgressSnapshot,
} from "@/app/components/learning-progress-storage";

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

const TIMER_STORAGE_KEY = "jp-study-timer:v3";
const RESUME_PAGE_SIZE = 3;

type TimerResume = {
  href: string;
  title: string;
  subtitle: string;
  percent: number;
  running: boolean;
};

function formatRemaining(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function readTimerResume(): TimerResume | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(TIMER_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as {
      durationMinutes?: number;
      remainingSeconds?: number;
      running?: boolean;
      endAtMs?: number | null;
    };
    const durationMinutes = Math.max(1, Math.round(Number(parsed.durationMinutes ?? 25)));
    const totalSeconds = durationMinutes * 60;
    const running = Boolean(parsed.running);
    const endAtMs = Number.isFinite(Number(parsed.endAtMs)) ? Number(parsed.endAtMs) : null;
    const storedRemaining = Math.max(0, Math.round(Number(parsed.remainingSeconds ?? totalSeconds)));
    const remainingSeconds =
      running && endAtMs ? Math.max(0, Math.ceil((endAtMs - Date.now()) / 1000)) : storedRemaining;
    if (!running && (remainingSeconds <= 0 || remainingSeconds >= totalSeconds)) {
      return null;
    }
    const doneSeconds = totalSeconds - Math.min(totalSeconds, remainingSeconds);
    return {
      href: "/study-timer",
      title: running ? "Bấm giờ đang chạy" : "Bấm giờ đang tạm dừng",
      subtitle: `${formatRemaining(remainingSeconds)} còn lại`,
      percent: Math.max(0, Math.min(100, Math.round((doneSeconds / totalSeconds) * 100))),
      running,
    };
  } catch {
    return null;
  }
}

function modeLabel(mode: string): string {
  if (mode === "quiz") {
    return "Trắc nghiệm";
  }
  if (mode === "recall") {
    return "Nhồi nhét";
  }
  return "Flashcard";
}

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

function LearningResumeCard({
  item,
  onClear,
}: {
  item: LearningProgressSnapshot;
  onClear: (href: string) => void;
}) {
  return (
    <div className="group relative rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm transition hover:border-emerald-200 hover:shadow-[0_16px_32px_rgba(15,23,42,0.10)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-extrabold text-emerald-800">
              {item.kind === "kanji" ? "Kanji" : "Từ vựng"}
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
              {modeLabel(item.mode)}
            </span>
          </div>
          <p className="mt-2 truncate text-base font-black text-slate-900" title={item.title}>
            {item.title}
          </p>
          <p className="mt-1 truncate text-sm font-semibold text-slate-600" title={item.currentLabel}>
            {item.currentLabel || "Đang học"} · {item.currentIndex + 1}/{item.totalCount}
          </p>
          <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{item.subLabel}</p>
        </div>
        <button
          type="button"
          onClick={() => onClear(item.href)}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-slate-200 bg-white text-slate-400 opacity-70 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100"
          aria-label="Xóa phiên đang dở"
          title="Xóa phiên đang dở"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-sky-500" style={{ width: `${item.percent}%` }} />
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-500">
          {item.percent}% {item.hardCount > 0 ? `· ${item.hardCount} từ khó` : ""}
        </span>
        <Link
          href={item.href}
          className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-700"
        >
          <PlayCircle className="h-4 w-4" />
          Tiếp tục
        </Link>
      </div>
    </div>
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
  const [progressItems, setProgressItems] = useState<LearningProgressSnapshot[]>([]);
  const [timerResume, setTimerResume] = useState<TimerResume | null>(null);
  const [resumePage, setResumePage] = useState(1);

  useEffect(() => {
    function syncResumeState() {
      setProgressItems(readLearningProgressList());
      setTimerResume(readTimerResume());
    }

    syncResumeState();
    const interval = window.setInterval(syncResumeState, 1000);
    window.addEventListener("storage", syncResumeState);
    window.addEventListener("focus", syncResumeState);
    window.addEventListener(learningProgressUpdatedEventName(), syncResumeState);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("storage", syncResumeState);
      window.removeEventListener("focus", syncResumeState);
      window.removeEventListener(learningProgressUpdatedEventName(), syncResumeState);
    };
  }, []);

  const hasResumeItems = progressItems.length > 0 || Boolean(timerResume);
  const resumeTotalPages = Math.max(1, Math.ceil(progressItems.length / RESUME_PAGE_SIZE));
  const safeResumePage = Math.min(resumePage, resumeTotalPages);
  const visibleProgressItems = progressItems.slice(
    (safeResumePage - 1) * RESUME_PAGE_SIZE,
    safeResumePage * RESUME_PAGE_SIZE
  );
  const resumeGridClass = useMemo(
    () =>
      timerResume && progressItems.length > 0
        ? "grid gap-3 lg:grid-cols-[0.82fr_1.18fr]"
        : "grid gap-3",
    [progressItems.length, timerResume]
  );

  function clearResumeItem(href: string) {
    clearLearningProgress(href);
    const nextItems = readLearningProgressList();
    setProgressItems(nextItems);
    setResumePage((page) => Math.min(page, Math.max(1, Math.ceil(nextItems.length / RESUME_PAGE_SIZE))));
  }

  useEffect(() => {
    setResumePage((page) => Math.min(page, resumeTotalPages));
  }, [resumeTotalPages]);

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

          {hasResumeItems ? (
            <motion.article
              variants={cardVariants}
              className="rounded-3xl border border-emerald-200/70 bg-gradient-to-br from-white/92 via-emerald-50/80 to-sky-50/70 p-5 shadow-[0_14px_34px_rgba(15,23,42,0.08)] xl:col-span-12"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black text-slate-900">Tiếp tục học</h2>
                  <p className="mt-1 text-sm text-slate-500">Các phiên đang dở được lưu tự động trên trình duyệt này.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {progressItems.length > RESUME_PAGE_SIZE ? (
                    <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white p-1">
                      <button
                        type="button"
                        className="grid h-8 w-8 place-items-center rounded-full text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-35"
                        onClick={() => setResumePage((page) => Math.max(1, page - 1))}
                        disabled={safeResumePage <= 1}
                        aria-label="Phiên trước"
                        title="Phiên trước"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <span className="min-w-14 text-center text-xs font-black text-slate-600">
                        {safeResumePage}/{resumeTotalPages}
                      </span>
                      <button
                        type="button"
                        className="grid h-8 w-8 place-items-center rounded-full text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-35"
                        onClick={() => setResumePage((page) => Math.min(resumeTotalPages, page + 1))}
                        disabled={safeResumePage >= resumeTotalPages}
                        aria-label="Phiên sau"
                        title="Phiên sau"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  ) : null}
                  <Link
                    href="/study-timer"
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                  >
                    <Clock3 className="h-4 w-4" />
                    Bấm giờ
                  </Link>
                </div>
              </div>
              <div className={`mt-4 ${resumeGridClass}`}>
                {timerResume ? (
                  <Link
                    href={timerResume.href}
                    className="rounded-2xl border border-sky-200 bg-white/92 p-4 shadow-sm transition hover:border-sky-300 hover:shadow-[0_16px_32px_rgba(14,165,233,0.14)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${
                          timerResume.running ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                        }`}>
                          Timer
                        </span>
                        <p className="mt-2 text-base font-black text-slate-900">{timerResume.title}</p>
                        <p className="mt-1 text-sm font-semibold text-slate-600">{timerResume.subtitle}</p>
                      </div>
                      <Clock3 className="h-6 w-6 text-sky-700" />
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full rounded-full bg-gradient-to-r from-sky-500 to-emerald-500" style={{ width: `${timerResume.percent}%` }} />
                    </div>
                  </Link>
                ) : null}

                {progressItems.length > 0 ? (
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {visibleProgressItems.map((item) => (
                      <LearningResumeCard key={item.href} item={item} onClear={clearResumeItem} />
                    ))}
                  </div>
                ) : null}
              </div>
            </motion.article>
          ) : null}

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
