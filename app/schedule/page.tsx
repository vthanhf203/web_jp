import Link from "next/link";
import {
  Bell,
  BookOpenText,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleGauge,
  Clock3,
  Flame,
  Pencil,
  Plus,
  Search,
  Target,
  Trash2,
} from "lucide-react";

import {
  addManualDeadlineTaskAction,
  deleteDeadlineTaskAction,
  editDeadlineTaskAction,
  saveLearningPlanAction,
  saveReminderSettingsAction,
} from "@/app/actions/personal";
import { DeadlineStatusSelect } from "@/app/components/deadline-status-select";
import { SubjectColorPicker } from "@/app/components/subject-color-picker";
import { WeeklyGoalCollapse } from "@/app/components/weekly-goal-collapse";
import { requireUser } from "@/lib/auth";
import { loadUserPersonalState, type DeadlineTask, type DeadlineTaskStatus, type LearningPlan } from "@/lib/user-personal-data";

const STATUS_LABEL: Record<DeadlineTaskStatus, string> = {
  pending: "Chưa làm",
  doing: "Đang học",
  done: "Hoàn thành",
  late_done: "Xong muộn",
  skipped: "Bỏ qua",
};

const WEEKDAY_LABELS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const TIME_ROWS = [7, 9, 11, 14, 16, 19, 21];
const WEEKLY_GOAL_CATEGORIES = [
  {
    key: "vocab",
    label: "T\u1eeb v\u1ef1ng",
    shortLabel: "T\u1eeb",
    icon: "\u3042",
    unit: "t\u1eeb",
    color: "#f43f5e",
    targetField: "weeklyVocabTarget",
    listField: "weeklyVocabList",
    keywords: ["tu vung", "vocab", "flashcard", "word"],
  },
  {
    key: "grammar",
    label: "Ng\u1eef ph\u00e1p",
    shortLabel: "NP",
    icon: "\u6587",
    unit: "m\u1ee5c",
    color: "#3b82f6",
    targetField: "weeklyGrammarTarget",
    listField: "weeklyGrammarList",
    keywords: ["ngu phap", "grammar"],
  },
  {
    key: "kanji",
    label: "Kanji",
    shortLabel: "Kanji",
    icon: "\u6f22",
    unit: "ch\u1eef",
    color: "#8b5cf6",
    targetField: "weeklyKanjiTarget",
    listField: "weeklyKanjiList",
    keywords: ["kanji"],
  },
  {
    key: "reading",
    label: "\u0110\u1ecdc hi\u1ec3u",
    shortLabel: "\u0110\u1ecdc",
    icon: "\u672c",
    unit: "b\u00e0i",
    color: "#f97316",
    targetField: "weeklyReadingTarget",
    listField: "weeklyReadingList",
    keywords: ["doc hieu", "doc sach", "reading"],
  },
  {
    key: "listening",
    label: "Nghe hi\u1ec3u",
    shortLabel: "Nghe",
    icon: "\u266b",
    unit: "b\u00e0i",
    color: "#10b981",
    targetField: "weeklyListeningTarget",
    listField: "weeklyListeningList",
    keywords: ["nghe", "listening", "listen"],
  },
  {
    key: "shadowing",
    label: "Shadowing / N\u00f3i",
    shortLabel: "N\u00f3i",
    icon: "\u58f0",
    unit: "bu\u1ed5i",
    color: "#06b6d4",
    targetField: "weeklyShadowingTarget",
    listField: "weeklyShadowingList",
    keywords: ["shadowing", "noi", "speaking", "phat am"],
  },
  {
    key: "review",
    label: "\u00d4n t\u1eadp",
    shortLabel: "\u00d4n",
    icon: "\u21bb",
    unit: "m\u1ee5c",
    color: "#6366f1",
    targetField: "weeklyReviewTarget",
    listField: "weeklyReviewList",
    keywords: ["on tap", "tong ket", "review"],
  },
] as const;

type ScheduleItem = DeadlineTask;

function toIsoDateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(base: Date, days: number): Date {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfWeek(base: Date): Date {
  const next = new Date(base);
  next.setHours(0, 0, 0, 0);
  const day = (next.getDay() + 6) % 7;
  next.setDate(next.getDate() - day);
  return next;
}

function isCompleted(status: DeadlineTaskStatus): boolean {
  return status === "done" || status === "late_done";
}

function completionPercent(done: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
}

function timeHour(time: string): number {
  const hour = Number(time.split(":")[0] ?? "0");
  return Number.isFinite(hour) ? hour : 0;
}

function timeRange(task: Pick<DeadlineTask, "startTime" | "deadlineTime">): string {
  return `${task.startTime} - ${task.deadlineTime}`;
}

function formatDayMonth(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00`);
  return date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
}

function formatMonthTitle(date: Date): string {
  return `Tháng ${date.getMonth() + 1}`;
}

function normalizeSubjectKey(subject: string): string {
  return subject.trim().toLowerCase();
}

function normalizeGoalText(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0111/g, "d")
    .replace(/\u0110/g, "D")
    .toLowerCase();
}

function countGoalLines(input: string): number {
  return input
    .split(/[\r\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean).length;
}

function taskMatchesKeywords(task: Pick<DeadlineTask, "subject" | "task">, keywords: readonly string[]): boolean {
  const haystack = normalizeGoalText(`${task.subject} ${task.task}`);
  return keywords.some((keyword) => haystack.includes(keyword));
}

function defaultSubjectColor(subject: string): string {
  const lower = normalizeSubjectKey(subject);
  if (lower.includes("kanji")) return "#8b5cf6";
  if (lower.includes("ngữ pháp") || lower.includes("grammar")) return "#0ea5e9";
  if (lower.includes("từ vựng") || lower.includes("vocab")) return "#f43f5e";
  if (lower.includes("đọc hiểu") || lower.includes("reading")) return "#f97316";
  if (lower.includes("nghe") || lower.includes("listen")) return "#10b981";
  if (lower.includes("tổng kết") || lower.includes("review")) return "#6366f1";
  if (lower.includes("toán") || lower.includes("math")) return "#06b6d4";
  if (lower.includes("english") || lower.includes("anh")) return "#3b82f6";
  if (lower.includes("lập trình") || lower.includes("code") || lower.includes("react")) return "#334155";
  if (lower.includes("flashcard")) return "#d946ef";
  return "#64748b";
}

function resolveSubjectColor(subject: string, subjectColors: Record<string, string>): string {
  const key = normalizeSubjectKey(subject);
  const custom = subjectColors[key];
  return custom && /^#[0-9a-f]{6}$/i.test(custom) ? custom : defaultSubjectColor(subject);
}

function colorWithAlpha(hex: string, alpha: number): string {
  const safe = hex.trim().replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(safe)) {
    return `rgba(100,116,139,${alpha})`;
  }
  const r = Number.parseInt(safe.slice(0, 2), 16);
  const g = Number.parseInt(safe.slice(2, 4), 16);
  const b = Number.parseInt(safe.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function subjectTone(subject: string): {
  dot: string;
  bg: string;
  border: string;
  text: string;
  tag: string;
} {
  const lower = subject.toLowerCase();
  if (lower.includes("kanji")) {
    return {
      dot: "bg-violet-500",
      bg: "bg-violet-50",
      border: "border-violet-200",
      text: "text-violet-800",
      tag: "text-violet-600",
    };
  }
  if (lower.includes("ngữ pháp") || lower.includes("grammar")) {
    return {
      dot: "bg-sky-500",
      bg: "bg-sky-50",
      border: "border-sky-200",
      text: "text-sky-800",
      tag: "text-sky-600",
    };
  }
  if (lower.includes("từ vựng") || lower.includes("vocab")) {
    return {
      dot: "bg-rose-500",
      bg: "bg-rose-50",
      border: "border-rose-200",
      text: "text-rose-800",
      tag: "text-rose-600",
    };
  }
  if (lower.includes("đọc hiểu") || lower.includes("reading")) {
    return {
      dot: "bg-orange-500",
      bg: "bg-orange-50",
      border: "border-orange-200",
      text: "text-orange-800",
      tag: "text-orange-600",
    };
  }
  if (lower.includes("nghe") || lower.includes("listen")) {
    return {
      dot: "bg-emerald-500",
      bg: "bg-emerald-50",
      border: "border-emerald-200",
      text: "text-emerald-800",
      tag: "text-emerald-600",
    };
  }
  if (lower.includes("tổng kết") || lower.includes("review")) {
    return {
      dot: "bg-indigo-500",
      bg: "bg-indigo-50",
      border: "border-indigo-200",
      text: "text-indigo-800",
      tag: "text-indigo-600",
    };
  }
  if (lower.includes("toán") || lower.includes("math")) {
    return {
      dot: "bg-cyan-500",
      bg: "bg-cyan-50",
      border: "border-cyan-200",
      text: "text-cyan-800",
      tag: "text-cyan-600",
    };
  }
  if (lower.includes("english") || lower.includes("anh")) {
    return {
      dot: "bg-blue-500",
      bg: "bg-blue-50",
      border: "border-blue-200",
      text: "text-blue-800",
      tag: "text-blue-600",
    };
  }
  if (lower.includes("lập trình") || lower.includes("code") || lower.includes("react")) {
    return {
      dot: "bg-slate-700",
      bg: "bg-slate-50",
      border: "border-slate-200",
      text: "text-slate-900",
      tag: "text-slate-600",
    };
  }
  if (lower.includes("sách") || lower.includes("đọc sách")) {
    return {
      dot: "bg-amber-500",
      bg: "bg-amber-50",
      border: "border-amber-200",
      text: "text-amber-800",
      tag: "text-amber-600",
    };
  }
  if (lower.includes("thể chất") || lower.includes("sức khỏe")) {
    return {
      dot: "bg-lime-500",
      bg: "bg-lime-50",
      border: "border-lime-200",
      text: "text-lime-800",
      tag: "text-lime-600",
    };
  }
  if (lower.includes("tiếng nhật") || lower.includes("japanese")) {
    return {
      dot: "bg-indigo-500",
      bg: "bg-indigo-50",
      border: "border-indigo-200",
      text: "text-indigo-800",
      tag: "text-indigo-600",
    };
  }
  if (lower.includes("flashcard")) {
    return {
      dot: "bg-fuchsia-500",
      bg: "bg-fuchsia-50",
      border: "border-fuchsia-200",
      text: "text-fuchsia-800",
      tag: "text-fuchsia-600",
    };
  }
  return {
    dot: "bg-slate-500",
    bg: "bg-slate-50",
    border: "border-slate-200",
    text: "text-slate-800",
    tag: "text-slate-600",
  };
}

function statusTone(status: DeadlineTaskStatus): string {
  if (status === "done") {
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  }
  if (status === "late_done") {
    return "bg-orange-50 text-orange-700 border-orange-200";
  }
  if (status === "doing") {
    return "bg-sky-50 text-sky-700 border-sky-200";
  }
  if (status === "skipped") {
    return "bg-rose-50 text-rose-700 border-rose-200";
  }
  return "bg-slate-50 text-slate-600 border-slate-200";
}

function taskSurfaceTone(task: Pick<DeadlineTask, "status" | "subject">, subjectColors: Record<string, string>): {
  bg: string;
  border: string;
  text: string;
  meta: string;
  style?: { backgroundColor: string; borderColor: string };
  subjectStyle?: { color: string };
} {
  if (task.status === "done" || task.status === "late_done") {
    return {
      bg: "bg-emerald-50",
      border: "border-emerald-300",
      text: "text-emerald-800",
      meta: "text-emerald-700",
    };
  }
  if (task.status === "doing") {
    return {
      bg: "bg-sky-50",
      border: "border-sky-300",
      text: "text-sky-800",
      meta: "text-sky-700",
    };
  }
  if (task.status === "skipped") {
    return {
      bg: "bg-rose-50",
      border: "border-rose-200",
      text: "text-rose-700",
      meta: "text-rose-600",
    };
  }
  const accent = resolveSubjectColor(task.subject, subjectColors);
  return {
    bg: "bg-white",
    border: "border-transparent",
    text: "text-slate-900",
    meta: "text-slate-600",
    style: {
      backgroundColor: colorWithAlpha(accent, 0.1),
      borderColor: colorWithAlpha(accent, 0.34),
    },
    subjectStyle: {
      color: accent,
    },
  };
}

function buildCalendarDays(monthDate: Date, taskDates: Set<string>) {
  const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const lastDay = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
  const leading = (firstDay.getDay() + 6) % 7;
  const days: Array<{ iso: string; day: number; inMonth: boolean; hasTask: boolean }> = [];

  for (let i = leading; i > 0; i -= 1) {
    const date = addDays(firstDay, -i);
    const iso = toIsoDateLocal(date);
    days.push({ iso, day: date.getDate(), inMonth: false, hasTask: taskDates.has(iso) });
  }

  for (let day = 1; day <= lastDay.getDate(); day += 1) {
    const date = new Date(monthDate.getFullYear(), monthDate.getMonth(), day);
    const iso = toIsoDateLocal(date);
    days.push({ iso, day, inMonth: true, hasTask: taskDates.has(iso) });
  }

  while (days.length % 7 !== 0) {
    const date = addDays(lastDay, days.length - leading - lastDay.getDate() + 1);
    const iso = toIsoDateLocal(date);
    days.push({ iso, day: date.getDate(), inMonth: false, hasTask: taskDates.has(iso) });
  }

  return days;
}

function ProgressRing({
  value,
  label,
  detail,
  color,
  icon,
  status,
}: {
  value: number;
  label: string;
  detail: string;
  color: string;
  icon?: string;
  status?: string;
}) {
  const safeValue = Math.max(0, Math.min(100, value));
  return (
    <div className="min-w-0 rounded-2xl border border-slate-100 bg-white/80 px-2.5 py-3 text-center shadow-[0_10px_26px_rgba(39,57,112,0.06)]">
      <p className="truncate text-xs font-black" style={{ color }}>
        {label}
      </p>
      <div
        className="mx-auto mt-2 grid h-20 w-20 place-items-center rounded-full"
        style={{ background: `conic-gradient(${color} ${safeValue}%, #eef2ff ${safeValue}% 100%)` }}
      >
        <div className="grid h-14 w-14 place-items-center rounded-full bg-white text-center shadow-inner">
          <div>
            <p className="text-base font-black" style={{ color }}>
              {safeValue}%
            </p>
            {icon ? <p className="text-sm font-black text-slate-400">{icon}</p> : null}
          </div>
        </div>
      </div>
      <p className="mt-2 truncate text-xs font-black text-slate-700">{detail}</p>
      {status ? (
        <p className="mx-auto mt-2 w-fit max-w-full truncate rounded-full px-2 py-1 text-[10px] font-black" style={{ background: colorWithAlpha(color, 0.1), color }}>
          {status}
        </p>
      ) : null}
    </div>
  );
}

type SearchParams = Promise<{ q?: string; month?: string; edit?: string }>;

function parseMonthParam(value: string | undefined, fallback: Date): Date {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) {
    return new Date(fallback.getFullYear(), fallback.getMonth(), 1);
  }
  const [year, month] = value.split("-").map((part) => Number(part));
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return new Date(fallback.getFullYear(), fallback.getMonth(), 1);
  }
  return new Date(year, month - 1, 1);
}

function monthParam(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function scheduleHref(params: { month?: Date; q?: string; edit?: string }): string {
  const query = new URLSearchParams();
  if (params.month) {
    query.set("month", monthParam(params.month));
  }
  if (params.q?.trim()) {
    query.set("q", params.q.trim());
  }
  if (params.edit?.trim()) {
    query.set("edit", params.edit.trim());
  }
  const queryText = query.toString();
  return queryText ? `/schedule?${queryText}` : "/schedule";
}

export default async function SchedulePage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const params = await searchParams;
  const personalState = await loadUserPersonalState(user.id);

  const today = new Date();
  const now = new Date();
  today.setHours(0, 0, 0, 0);
  const isSunday = today.getDay() === 0;
  const searchText = (params.q ?? "").trim();
  const monthDate = parseMonthParam(params.month, today);
  const todayIso = toIsoDateLocal(today);
  const weekStart = startOfWeek(today);
  const weekEnd = addDays(weekStart, 6);
  const weekStartIso = toIsoDateLocal(weekStart);
  const weekEndIso = toIsoDateLocal(weekEnd);

  const allStoredTasks = personalState.deadlineTasks
    .filter((task) => task.date >= toIsoDateLocal(addDays(today, -7)) && task.date <= toIsoDateLocal(addDays(today, 45)))
    .sort((a, b) =>
      a.date === b.date
        ? a.startTime === b.startTime
          ? a.deadlineTime.localeCompare(b.deadlineTime)
          : a.startTime.localeCompare(b.startTime)
        : a.date.localeCompare(b.date)
    );
  const storedTasks = searchText
    ? allStoredTasks.filter((task) => {
        const haystack = `${task.subject} ${task.task} ${task.slot} ${task.note}`.toLowerCase();
        return haystack.includes(searchText.toLowerCase());
      })
    : allStoredTasks;
  const selectedTaskId = (params.edit ?? "").trim();
  const selectedTask = selectedTaskId ? storedTasks.find((task) => task.id === selectedTaskId) ?? null : null;

  const weekTasks = storedTasks.filter((task) => task.date >= weekStartIso && task.date <= weekEndIso);
  const visibleTasks: ScheduleItem[] = weekTasks;
  const managementTasks = selectedTask
    ? [selectedTask, ...storedTasks.filter((task) => task.id !== selectedTask.id).slice(0, 11)]
    : storedTasks.slice(0, 12);

  const todayTasks = visibleTasks.filter((task) => task.date === todayIso);
  const doneToday = todayTasks.filter((task) => isCompleted(task.status)).length;
  const doneWeek = visibleTasks.filter((task) => isCompleted(task.status)).length;
  const weeklyProgress = completionPercent(doneWeek, visibleTasks.length);
  const weeklySummarySource: ScheduleItem[] = weekTasks;
  const weeklySummaryTotal = weeklySummarySource.length;
  const weeklySummaryDone = weeklySummarySource.filter((task) => task.status === "done").length;
  const weeklySummaryLateDone = weeklySummarySource.filter((task) => task.status === "late_done").length;
  const weeklySummaryDoing = weeklySummarySource.filter((task) => task.status === "doing").length;
  const weeklySummaryPending = weeklySummarySource.filter((task) => task.status === "pending").length;
  const weeklySummarySkipped = weeklySummarySource.filter((task) => task.status === "skipped").length;
  const weeklySummaryCompleted = weeklySummaryDone + weeklySummaryLateDone;
  const weeklySummaryOpen = weeklySummaryPending + weeklySummaryDoing;
  const weeklySummaryOverdue = weeklySummarySource.filter((task) => {
    if (isCompleted(task.status) || task.status === "skipped") {
      return false;
    }
    const dueAt = new Date(`${task.date}T${task.deadlineTime}:00`);
    return dueAt.getTime() < now.getTime();
  }).length;
  const weeklySummaryRate = completionPercent(weeklySummaryCompleted, weeklySummaryTotal);

  const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
  const monthTasks = storedTasks.filter((task) => task.date >= toIsoDateLocal(monthStart) && task.date <= toIsoDateLocal(monthEnd));
  const monthTotal = monthTasks.length || visibleTasks.length;
  const monthDone = (monthTasks.length ? monthTasks : visibleTasks).filter((task) => isCompleted(task.status)).length;
  const monthlyProgress = completionPercent(monthDone, monthTotal);

  const upcomingTasks = (storedTasks.length > 0 ? storedTasks : visibleTasks)
    .filter((task) => task.date >= todayIso && !isCompleted(task.status))
    .slice(0, 5);
  const tasksForToday = [...todayTasks].sort((a, b) => {
    if (a.startTime === b.startTime) {
      return a.deadlineTime.localeCompare(b.deadlineTime);
    }
    return a.startTime.localeCompare(b.startTime);
  });

  const taskDates = new Set((storedTasks.length > 0 ? storedTasks : visibleTasks).map((task) => task.date));
  const calendarDays = buildCalendarDays(monthDate, taskDates);
  const weekDates = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(weekStart, index);
    return { iso: toIsoDateLocal(date), label: WEEKDAY_LABELS[index], dayMonth: formatDayMonth(toIsoDateLocal(date)) };
  });

  const minutesToday = todayTasks.reduce((sum, task) => {
    const start = timeHour(task.startTime) * 60 + Number(task.startTime.split(":")[1] ?? "0");
    const end = timeHour(task.deadlineTime) * 60 + Number(task.deadlineTime.split(":")[1] ?? "0");
    return sum + Math.max(0, end - start);
  }, 0);

  const targetMinutes = personalState.plan?.dailyMinutes ?? 120;
  const dailyMinutesProgress = completionPercent(minutesToday, targetMinutes);
  const streakDays = Math.max(1, Math.min(18, Math.round(doneWeek / 2) + 1));
  const level = personalState.plan?.goalLevel ?? "N5";
  const prevMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1);
  const nextMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1);
  const targetDate = personalState.plan?.targetDate || toIsoDateLocal(addDays(today, 30));
  const dailyDeadlineTime = personalState.plan?.dailyDeadlineTime || "21:30";
  const legendSubjects = (() => {
    const source = visibleTasks.length > 0 ? visibleTasks : storedTasks;
    const frequencies = new Map<string, number>();
    for (const task of source) {
      const label = task.subject.trim() || "Khác";
      frequencies.set(label, (frequencies.get(label) ?? 0) + 1);
    }

    const dynamicLabels = Array.from(frequencies.entries())
      .sort((a, b) => (b[1] === a[1] ? a[0].localeCompare(b[0], "vi") : b[1] - a[1]))
      .map(([label]) => label)
      .slice(0, 8);

    return dynamicLabels.length > 0
      ? dynamicLabels
      : ["Kanji", "Ngữ pháp", "Từ vựng", "Đọc hiểu", "Nghe", "Tổng kết"];
  })();
  const legendEntries = legendSubjects.map((label) => ({
    label,
    key: normalizeSubjectKey(label),
    color: resolveSubjectColor(label, personalState.subjectColors ?? {}),
  }));

  const focusGoals = [
    { label: "Tiếng Nhật", count: visibleTasks.filter((task) => /nhật|kanji|vocab|ngữ pháp/i.test(task.subject)).length },
    { label: "Toán", count: visibleTasks.filter((task) => /toán|math/i.test(task.subject)).length },
    { label: "English", count: visibleTasks.filter((task) => /english|tiếng anh/i.test(task.subject)).length },
    {
      label: "Môn khác",
      count: visibleTasks.filter((task) => !/nhật|kanji|vocab|ngữ pháp|toán|math|english|tiếng anh/i.test(task.subject)).length,
    },
  ];
  const weeklyPlanForCurrentWeek: LearningPlan | null =
    personalState.plan && (!personalState.plan.weeklyGoalWeekStart || personalState.plan.weeklyGoalWeekStart === weekStartIso)
      ? personalState.plan
      : null;
  const weeklyGoalItems = WEEKLY_GOAL_CATEGORIES.map((category) => {
    const target = Number(weeklyPlanForCurrentWeek?.[category.targetField] ?? 0);
    const list = String(weeklyPlanForCurrentWeek?.[category.listField] ?? "");
    const listedCount = countGoalLines(list);
    const plannedCount = target || listedCount;
    const matchedTasks = visibleTasks.filter((task) => taskMatchesKeywords(task, category.keywords));
    const completedCount = matchedTasks.filter((task) => isCompleted(task.status)).length;
    const denominator = plannedCount || matchedTasks.length;
    const value = denominator > 0 ? completionPercent(completedCount, denominator) : 0;
    const status =
      value >= 100
        ? "Ho\u00e0n th\u00e0nh"
        : value >= 60
          ? "\u0110ang ti\u1ebfn t\u1ed1t"
          : plannedCount > 0
            ? "C\u1ea7n duy tr\u00ec"
            : "Ch\u01b0a \u0111\u1eb7t";

    return {
      ...category,
      target,
      list,
      plannedCount,
      completedCount,
      denominator,
      value,
      status,
    };
  });
  const weeklyGoalTotal = weeklyGoalItems.reduce((sum, item) => sum + (item.denominator || 0), 0);
  const weeklyGoalDone = weeklyGoalItems.reduce((sum, item) => sum + item.completedCount, 0);
  const weeklyGoalProgress = completionPercent(weeklyGoalDone, weeklyGoalTotal);

  return (
    <section className="min-h-screen space-y-5">
      <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <div className="overflow-hidden rounded-[28px] border border-white/80 bg-white shadow-[0_24px_60px_rgba(39,57,112,0.12)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
              <form action="/schedule" className="relative block w-full max-w-[420px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  name="q"
                  defaultValue={searchText}
                  className="h-10 w-full rounded-full border border-slate-200 bg-slate-50 pl-10 pr-12 text-sm font-semibold text-slate-700 outline-none transition focus:border-indigo-300 focus:bg-white"
                  placeholder="Tìm môn, bài học, deadline..."
                />
                <input type="hidden" name="month" value={monthParam(monthDate)} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-400 shadow-sm">
                  Enter
                </span>
              </form>
              <div className="flex items-center gap-2">
                <Link
                  href="#schedule-planner"
                  className="inline-flex h-10 items-center gap-2 rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 px-4 text-sm font-black text-white shadow-[0_12px_24px_rgba(79,70,229,0.25)]"
                >
                  <Plus className="h-4 w-4" />
                  Tạo kế hoạch
                </Link>
                <Link href="#schedule-planner" className="relative grid h-10 w-10 place-items-center rounded-full border border-slate-200 bg-white text-slate-600">
                  <Bell className="h-4 w-4" />
                  <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500" />
                </Link>
                <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white px-2 py-1 sm:flex">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-rose-100 text-sm font-black text-rose-700">
                    {user.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="max-w-[110px] truncate text-sm font-black text-slate-800">{user.name}</span>
                  <span className="rounded-full bg-indigo-50 px-2 py-1 text-xs font-black text-indigo-700">{level}</span>
                </div>
              </div>
            </div>

            <div className="relative overflow-hidden px-5 py-5">
              <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.96),rgba(255,255,255,0.78)),linear-gradient(120deg,rgba(251,207,232,0.42),rgba(224,242,254,0.5),rgba(254,243,199,0.28))]" />
              <div className="absolute right-0 top-0 h-full w-[48%] opacity-80 [background:radial-gradient(circle_at_72%_44%,rgba(244,114,182,0.16),transparent_18%),linear-gradient(135deg,transparent_30%,rgba(99,102,241,0.12)_30%,transparent_31%),linear-gradient(8deg,transparent_58%,rgba(15,23,42,0.18)_59%,transparent_60%)]" />
              <div className="relative">
                <p className="text-sm font-black uppercase text-rose-500">Lich hoc & Deadline</p>
                <h1 className="mt-1 text-3xl font-black text-slate-950 sm:text-4xl">Lich hoc tuan nay</h1>
                <p className="mt-2 max-w-2xl text-sm font-semibold text-slate-500">
                  Lap ke hoach, theo doi muc tieu va giu nhip hoc deu tung ngay.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-violet-100 bg-white p-4 shadow-[0_12px_28px_rgba(39,57,112,0.08)]">
              <div className="flex items-center gap-3">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-violet-100 text-violet-700">
                  <CalendarDays className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs font-black uppercase text-slate-400">Buoi hoc hom nay</p>
                  <p className="text-2xl font-black text-slate-950">{todayTasks.length || 4} buoi</p>
                  <p className="text-xs font-semibold text-slate-500">{minutesToday || 120} phut</p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-rose-100 bg-white p-4 shadow-[0_12px_28px_rgba(39,57,112,0.08)]">
              <div className="flex items-center gap-3">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-rose-100 text-rose-700">
                  <Target className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs font-black uppercase text-slate-400">Deadline tuan nay</p>
                  <p className="text-2xl font-black text-slate-950">{upcomingTasks.length} viec</p>
                  <p className="text-xs font-semibold text-slate-500">Can xu ly</p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-[0_12px_28px_rgba(39,57,112,0.08)]">
              <div className="flex items-center gap-3">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-100 text-emerald-700">
                  <Flame className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs font-black uppercase text-slate-400">Chuoi hoan thanh</p>
                  <p className="text-2xl font-black text-slate-950">{streakDays} ngay</p>
                  <p className="text-xs font-semibold text-emerald-600">Tang deu</p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-blue-100 bg-white p-4 shadow-[0_12px_28px_rgba(39,57,112,0.08)]">
              <div className="flex items-center gap-3">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-100 text-blue-700">
                  <CircleGauge className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs font-black uppercase text-slate-400">Tien do thang</p>
                  <p className="text-2xl font-black text-slate-950">{monthlyProgress || 68}%</p>
                  <p className="text-xs font-semibold text-slate-500">Con {Math.max(0, monthTotal - monthDone)} viec</p>
                </div>
              </div>
            </div>
          </div>

          <section
            id="schedule-planner"
            className="rounded-[26px] border border-white/80 bg-white p-4 shadow-[0_18px_42px_rgba(39,57,112,0.1)]"
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-slate-950">Tao ke hoach hoc</h2>
                <p className="text-xs font-semibold text-slate-500">
                  Dung cho moi mon: tieng Nhat, tieng Anh, toan, lap trinh hoac viec hoc ca nhan.
                </p>
              </div>
              <Link href="/schedule#schedule-planner" className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-black text-indigo-700">
                Khu vuc ke hoach
              </Link>
            </div>

            <WeeklyGoalCollapse closedLabel="Mo khu vuc tao ke hoach" openLabel="Thu gon khu vuc tao ke hoach">
              <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
              <form action={saveLearningPlanAction} className="grid gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="space-y-1 text-sm font-bold text-slate-700 md:col-span-2">
                    <span>Ten ke hoach / trong tam</span>
                    <input
                      name="manualFocus"
                      defaultValue={personalState.plan?.manualFocus || ""}
                      placeholder="Vi du: Thi cuoi ky toan, tieng Anh giao tiep, JLPT N4..."
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-indigo-300"
                    />
                  </label>
                  <label className="space-y-1 text-sm font-bold text-slate-700">
                    <span>Ngay muc tieu</span>
                    <input
                      name="targetDate"
                      type="date"
                      defaultValue={targetDate}
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-indigo-300"
                      required
                    />
                  </label>
                  <label className="space-y-1 text-sm font-bold text-slate-700">
                    <span>Phut hoc moi ngay</span>
                    <input
                      name="dailyMinutes"
                      type="number"
                      min={10}
                      max={240}
                      defaultValue={targetMinutes}
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-indigo-300"
                      required
                    />
                  </label>
                  <label className="space-y-1 text-sm font-bold text-slate-700">
                    <span>Deadline ngay</span>
                    <input
                      name="dailyDeadlineTime"
                      type="time"
                      defaultValue={dailyDeadlineTime}
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-indigo-300"
                      required
                    />
                  </label>
                  <label className="space-y-1 text-sm font-bold text-slate-700">
                    <span>Muc tieu viec / tuan</span>
                    <input
                      name="weeklyTargetSessions"
                      type="number"
                      min={1}
                      max={28}
                      defaultValue={personalState.plan?.weeklyTargetSessions || 8}
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-indigo-300"
                      required
                    />
                  </label>
                </div>
                <input type="hidden" name="goalLevel" value={level} />
                <input type="hidden" name="manualEnabled" value="off" />
                <input type="hidden" name="autoEnabled" value="off" />
                <input type="hidden" name="autoMinutes" value="0" />
                <input type="hidden" name="manualMinutes" value="0" />
                <input type="hidden" name="autoStrategy" value="balanced" />
                <input type="hidden" name="weeklyDeadlineDay" value={String(personalState.plan?.weeklyDeadlineDay ?? 0)} />
                <input type="hidden" name="monthlyDeadlineDay" value={String(personalState.plan?.monthlyDeadlineDay ?? 28)} />
                <input type="hidden" name="monthlyTargetSessions" value={String(personalState.plan?.monthlyTargetSessions ?? 24)} />
                <button className="h-11 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-sm font-black text-white" type="submit">
                  Luu ke hoach
                </button>
              </form>

              <div className="grid gap-3">
                <form action={addManualDeadlineTaskAction} className="grid gap-3 rounded-2xl border border-slate-100 bg-white p-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="space-y-1 text-sm font-bold text-slate-700">
                      <span>Mon / linh vuc</span>
                      <input
                        name="subject"
                        placeholder="Toan, English, JLPT, Lap trinh..."
                        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-indigo-300"
                        required
                      />
                    </label>
                    <label className="space-y-1 text-sm font-bold text-slate-700">
                      <span>Ngay hoc</span>
                      <input
                        name="date"
                        type="date"
                        defaultValue={todayIso}
                        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-indigo-300"
                        required
                      />
                    </label>
                    <label className="space-y-1 text-sm font-bold text-slate-700 md:col-span-2">
                      <span>Viec can lam</span>
                      <input
                        name="task"
                        placeholder="Vi du: Lam 20 bai tap, nghe 1 bai, doc 15 trang..."
                        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-indigo-300"
                        required
                      />
                    </label>
                    <input type="hidden" name="slot" value="Tu chon" />
                    <label className="space-y-1 text-sm font-bold text-slate-700">
                      <span>Bat dau</span>
                      <input
                        name="startTime"
                        type="time"
                        defaultValue="20:00"
                        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-indigo-300"
                        required
                      />
                    </label>
                    <label className="space-y-1 text-sm font-bold text-slate-700">
                      <span>Deadline</span>
                      <input
                        name="deadlineTime"
                        type="time"
                        defaultValue="21:00"
                        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-indigo-300"
                        required
                      />
                    </label>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <select
                      name="priority"
                      defaultValue="medium"
                      className="h-11 min-w-[150px] rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-700 outline-none focus:border-indigo-300"
                    >
                      <option value="high">Uu tien cao</option>
                      <option value="medium">Vua</option>
                      <option value="low">Nhe</option>
                    </select>
                    <button className="h-11 flex-1 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-black text-emerald-700" type="submit">
                      Them vao lich
                    </button>
                  </div>
                </form>

                <form action={saveReminderSettingsAction} className="flex flex-wrap items-end gap-3 rounded-2xl border border-amber-100 bg-amber-50 p-4">
                  <input type="hidden" name="enabled" value="on" />
                  <input type="hidden" name="timezone" value={personalState.reminders.timezone || "Asia/Tokyo"} />
                  <label className="space-y-1 text-sm font-bold text-amber-900">
                    <span>Nhac luc</span>
                    <input
                      name="hour"
                      type="number"
                      min={0}
                      max={23}
                      defaultValue={personalState.reminders.hour}
                      className="h-10 w-20 rounded-xl border border-amber-200 bg-white px-3 text-sm font-black outline-none"
                    />
                  </label>
                  <label className="space-y-1 text-sm font-bold text-amber-900">
                    <span>Phut</span>
                    <input
                      name="minute"
                      type="number"
                      min={0}
                      max={59}
                      defaultValue={personalState.reminders.minute}
                      className="h-10 w-20 rounded-xl border border-amber-200 bg-white px-3 text-sm font-black outline-none"
                    />
                  </label>
                  <button className="h-10 rounded-xl bg-amber-500 px-4 text-sm font-black text-white" type="submit">
                    Bat nhac hoc
                  </button>
                </form>
              </div>
              </div>
            </WeeklyGoalCollapse>
          </section>

          <section className="rounded-[26px] border border-white/80 bg-white p-4 shadow-[0_18px_42px_rgba(39,57,112,0.1)]">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-slate-950">Lịch học tuần này</h2>
                <p className="text-xs font-semibold text-slate-500">
                  {formatDayMonth(weekStartIso)} - {formatDayMonth(weekEndIso)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs font-black text-slate-500">
                {legendEntries.map((entry) => (
                  <span key={entry.key} className="inline-flex max-w-[150px] items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
                    <span className="truncate" title={entry.label}>
                      {entry.label}
                    </span>
                  </span>
                ))}
              </div>
            </div>

            {legendEntries.length > 0 ? (
              <div className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border border-slate-100 bg-slate-50 p-2.5">
                {legendEntries.map((entry) => (
                  <SubjectColorPicker key={entry.key} subject={entry.label} initialColor={entry.color} />
                ))}
              </div>
            ) : null}

            <div className="overflow-x-auto">
              <div className="min-w-[860px] rounded-2xl border border-slate-100">
                <div className="grid grid-cols-[56px_repeat(7,minmax(106px,1fr))] border-b border-slate-100 bg-slate-50">
                  <div className="px-1.5 py-2 text-center text-xs font-black text-slate-400">Giờ</div>
                  {weekDates.map((day) => (
                    <div
                      key={day.iso}
                      className={`px-1.5 py-2 text-center ${day.iso === todayIso ? "bg-indigo-50" : ""}`}
                    >
                      <p className="text-sm font-black text-slate-900">{day.label}</p>
                      <p className="text-xs font-semibold text-slate-400">{day.dayMonth}</p>
                    </div>
                  ))}
                </div>

                {TIME_ROWS.map((hour) => (
                  <div key={hour} className="grid min-h-[58px] grid-cols-[56px_repeat(7,minmax(106px,1fr))] border-b border-slate-100 last:border-b-0">
                    <div className="border-r border-slate-100 px-1.5 py-2 text-center text-[11px] font-bold text-slate-400">
                      {String(hour).padStart(2, "0")}:00
                    </div>
                    {weekDates.map((day) => {
                      const tasksInSlot = visibleTasks.filter((task) => {
                        const taskHour = timeHour(task.startTime);
                        return task.date === day.iso && taskHour >= hour && taskHour < hour + 2;
                      });
                      return (
                        <div key={`${day.iso}-${hour}`} className="space-y-1 border-r border-slate-100 p-1 last:border-r-0">
                          {tasksInSlot.map((task) => {
                            const tone = taskSurfaceTone(task, personalState.subjectColors ?? {});
                            const cardClassName = `block rounded-lg border px-1.5 py-1 transition ${tone.bg} ${tone.border}`;
                            return (
                              <Link
                                key={task.id}
                                href={`${scheduleHref({ month: monthDate, q: searchText, edit: task.id })}#schedule-manager`}
                                className={`${cardClassName} hover:shadow-sm hover:ring-1 hover:ring-indigo-200`}
                                style={tone.style}
                              >
                                <p className={`truncate text-[11px] font-black ${tone.text}`} style={tone.subjectStyle}>{task.subject}</p>
                                <p className={`truncate text-[10px] font-semibold ${tone.meta}`}>{timeRange(task)}</p>
                              </Link>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </section>

          {selectedTask ? (
            <section className="rounded-2xl border border-indigo-200 bg-indigo-50/90 p-3 shadow-[0_10px_24px_rgba(79,70,229,0.12)]">
              <p className="text-[11px] font-black uppercase tracking-wide text-indigo-500">Đang xem chi tiết lịch</p>
              <p className="mt-1 text-sm font-black text-indigo-900">
                {selectedTask.subject} · {selectedTask.task}
              </p>
              <p className="mt-1 text-xs font-semibold text-indigo-700">
                {formatDayMonth(selectedTask.date)} · {timeRange(selectedTask)} · {STATUS_LABEL[selectedTask.status]}
              </p>
              {selectedTask.note ? (
                <p className="mt-2 rounded-xl border border-indigo-200 bg-white/80 px-2 py-1.5 text-xs font-semibold text-slate-600">
                  Ghi chú: {selectedTask.note}
                </p>
              ) : null}
            </section>
          ) : null}

          <section
            id="schedule-manager"
            className="rounded-[26px] border border-white/80 bg-white p-4 shadow-[0_18px_42px_rgba(39,57,112,0.1)]"
          >
            <details open={Boolean(selectedTaskId)} className="group">
              <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black text-slate-950">Quản lý lịch đã tạo</h2>
                  <p className="text-xs font-semibold text-slate-500">
                    Ấn vào ô lịch để mở đúng chi tiết. Có thể thu gọn khu này khi không cần chỉnh.
                  </p>
                </div>
                <span className="inline-flex h-9 items-center rounded-full border border-slate-200 bg-slate-50 px-3 text-xs font-black text-slate-700 group-open:hidden">
                  Mở quản lý
                </span>
                <span className="hidden h-9 items-center rounded-full border border-slate-200 bg-slate-50 px-3 text-xs font-black text-slate-700 group-open:inline-flex">
                  Thu gọn
                </span>
              </summary>

              <div className="mt-4">
                <div className="mb-4 flex justify-end">
                  <Link href="#schedule-planner" className="inline-flex h-9 items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 text-xs font-black text-indigo-700">
                    <Plus className="h-4 w-4" />
                    Thêm lịch
                  </Link>
                </div>

                {managementTasks.length > 0 ? (
                  <div className="grid max-h-[460px] gap-3 overflow-y-auto pr-1">
                {managementTasks.map((task) => {
                  const tone = subjectTone(task.subject);
                  return (
                    <details
                      id={`edit-${task.id}`}
                      key={task.id}
                      open={selectedTaskId === task.id}
                      className={`group rounded-2xl border ${tone.border} ${tone.bg} p-3 open:bg-white ${
                        selectedTaskId === task.id ? "ring-2 ring-indigo-200" : ""
                      }`}
                    >
                      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className={`truncate text-sm font-black ${tone.text}`}>
                            {task.subject} · {task.task}
                          </p>
                          <p className="mt-1 text-xs font-semibold text-slate-500">
                            {formatDayMonth(task.date)} · {timeRange(task)} · {STATUS_LABEL[task.status]}
                          </p>
                        </div>
                        <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-xs font-black text-indigo-600 shadow-sm">
                          <Pencil className="h-3.5 w-3.5" />
                          {selectedTaskId === task.id ? "Đang mở" : "Sửa"}
                        </span>
                      </summary>

                      <div className="mt-3 grid gap-3 border-t border-slate-100 pt-3">
                        <form action={editDeadlineTaskAction} className="grid gap-3 lg:grid-cols-6">
                          <input type="hidden" name="taskId" value={task.id} />
                          <input type="hidden" name="slot" value={task.slot || "Tự chọn"} />
                          <label className="space-y-1 text-xs font-black text-slate-500 lg:col-span-2">
                            <span>Môn / lĩnh vực</span>
                            <input
                              name="subject"
                              defaultValue={task.subject}
                              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-indigo-300"
                              required
                            />
                          </label>
                          <label className="space-y-1 text-xs font-black text-slate-500 lg:col-span-4">
                            <span>Nội dung</span>
                            <input
                              name="task"
                              defaultValue={task.task}
                              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-indigo-300"
                              required
                            />
                          </label>
                          <label className="space-y-1 text-xs font-black text-slate-500">
                            <span>Ngày</span>
                            <input
                              type="date"
                              name="date"
                              defaultValue={task.date}
                              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-indigo-300"
                              required
                            />
                          </label>
                          <label className="space-y-1 text-xs font-black text-slate-500">
                            <span>Bắt đầu</span>
                            <input
                              type="time"
                              name="startTime"
                              defaultValue={task.startTime}
                              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-indigo-300"
                              required
                            />
                          </label>
                          <label className="space-y-1 text-xs font-black text-slate-500">
                            <span>Kết thúc</span>
                            <input
                              type="time"
                              name="deadlineTime"
                              defaultValue={task.deadlineTime}
                              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-indigo-300"
                              required
                            />
                          </label>
                          <label className="space-y-1 text-xs font-black text-slate-500">
                            <span>Ưu tiên</span>
                            <select
                              name="priority"
                              defaultValue={task.priority}
                              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-indigo-300"
                            >
                              <option value="high">Cao</option>
                              <option value="medium">Vừa</option>
                              <option value="low">Nhẹ</option>
                            </select>
                          </label>
                          <label className="space-y-1 text-xs font-black text-slate-500">
                            <span>Trạng thái</span>
                            <select
                              name="status"
                              defaultValue={task.status}
                              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-indigo-300"
                            >
                              {Object.entries(STATUS_LABEL).map(([value, label]) => (
                                <option key={value} value={value}>
                                  {label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="space-y-1 text-xs font-black text-slate-500 lg:col-span-5">
                            <span>Ghi chú</span>
                            <input
                              name="note"
                              defaultValue={task.note}
                              placeholder="Ghi chú ngắn nếu cần..."
                              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-indigo-300"
                            />
                          </label>
                          <button
                            type="submit"
                            className="h-10 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 text-sm font-black text-white"
                          >
                            Lưu sửa
                          </button>
                        </form>

                        <form action={deleteDeadlineTaskAction} className="flex justify-end">
                          <input type="hidden" name="taskId" value={task.id} />
                          <button
                            type="submit"
                            className="inline-flex h-9 items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 text-xs font-black text-rose-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Xóa lịch này
                          </button>
                        </form>
                      </div>
                    </details>
                  );
                })}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm font-semibold text-slate-500">
                    Chưa có lịch thật để sửa/xóa. Tạo kế hoạch hoặc thêm lịch thủ công ở phần trên nhé.
                  </div>
                )}
              </div>
            </details>
          </section>

          <div className="grid min-w-0 gap-4 xl:grid-cols-3">
            <section className="min-w-0 overflow-hidden rounded-[24px] border border-white/80 bg-white p-4 shadow-[0_16px_34px_rgba(39,57,112,0.09)]">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-black text-slate-950">Deadline sắp tới</h2>
                <Link href="#schedule-planner" className="text-xs font-black text-indigo-600">
                  Xem tất cả
                </Link>
              </div>
              <div className="space-y-3">
                {upcomingTasks.map((task) => {
                  const tone = subjectTone(task.subject);
                  return (
                    <div key={task.id} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
                      <span className={`h-3 w-3 rounded-full ${tone.dot}`} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-black text-slate-900">{task.task}</p>
                        <p className="truncate text-xs font-semibold text-slate-500">{task.subject} · {formatDayMonth(task.date)}</p>
                      </div>
                      <span className={`rounded-full border px-2 py-1 text-[11px] font-black ${statusTone(task.status)}`}>
                        {STATUS_LABEL[task.status]}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="min-w-0 overflow-hidden rounded-[24px] border border-white/80 bg-white p-4 shadow-[0_16px_34px_rgba(39,57,112,0.09)]">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-black text-slate-950">Việc cần làm</h2>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-black text-slate-500">
                  {tasksForToday.length} mục hôm nay
                </span>
              </div>
              {tasksForToday.length > 0 ? (
                <div className="space-y-3">
                  {tasksForToday.map((task) => (
                    <div key={task.id} className="grid gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3">
                      <div className="flex min-w-0 items-start gap-2">
                        <CheckCircle2 className={`mt-0.5 h-4 w-4 ${isCompleted(task.status) ? "text-emerald-500" : "text-slate-300"}`} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-black text-slate-900">{task.task}</p>
                          <p className="truncate text-[11px] font-semibold text-slate-500">{task.subject} · {timeRange(task)}</p>
                          <div className="mt-2 h-2 rounded-full bg-slate-200">
                            <div
                              className="h-2 rounded-full bg-gradient-to-r from-rose-400 to-indigo-500"
                              style={{ width: `${isCompleted(task.status) ? 100 : task.status === "doing" ? 52 : 16}%` }}
                            />
                          </div>
                        </div>
                      </div>
                      <DeadlineStatusSelect taskId={task.id} initialStatus={task.status} taskLabel={task.task} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm font-semibold text-slate-500">
                  Hôm nay chưa có lịch học. Bạn có thể thêm lịch ở phần kế hoạch.
                </div>
              )}
            </section>

            <section className="min-w-0 overflow-hidden rounded-[24px] border border-white/80 bg-white p-4 shadow-[0_16px_34px_rgba(39,57,112,0.09)]">
              <h2 className="text-base font-black text-slate-950">Ghi chú nhanh</h2>
              <div className="mt-4 rounded-2xl border border-violet-100 bg-violet-50 p-4">
                <p className="text-sm font-black text-violet-900">Tập trung vào</p>
                <p className="mt-2 text-sm font-semibold leading-6 text-violet-700">
                  {personalState.plan?.manualFocus || "Môn chính, bài tập và deadline trọng tâm trong tuần này."}
                </p>
              </div>
              <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 p-4">
                <p className="text-sm font-black text-amber-900">Nhắc nhớ</p>
                <p className="mt-2 text-sm font-semibold text-amber-700">
                  {personalState.reminders.enabled
                    ? `Đang bật nhắc học lúc ${String(personalState.reminders.hour).padStart(2, "0")}:${String(personalState.reminders.minute).padStart(2, "0")}.`
                    : "Chưa bật nhắc học hằng ngày."}
                </p>
              </div>
            </section>
          </div>
        </div>

        <aside className="space-y-4">
          <section className="rounded-[24px] border border-white/80 bg-white p-4 shadow-[0_16px_34px_rgba(39,57,112,0.09)]">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-black text-slate-950">{formatMonthTitle(monthDate)}</h2>
              <div className="flex items-center gap-1">
                <Link href={scheduleHref({ month: prevMonth, q: searchText })} className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 text-slate-500">
                  <ChevronLeft className="h-4 w-4" />
                </Link>
                <Link href={scheduleHref({ month: nextMonth, q: searchText })} className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 text-slate-500">
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-black text-slate-400">
              {WEEKDAY_LABELS.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-7 gap-1">
              {calendarDays.map((day) => {
                const isToday = day.iso === todayIso;
                return (
                  <div
                    key={day.iso}
                    className={`relative grid h-9 place-items-center rounded-full text-sm font-black ${
                      isToday
                        ? "bg-indigo-600 text-white"
                        : day.inMonth
                          ? "text-slate-700 hover:bg-slate-50"
                          : "text-slate-300"
                    }`}
                  >
                    {day.day}
                    {day.hasTask && !isToday ? <span className="absolute bottom-1 h-1.5 w-1.5 rounded-full bg-rose-400" /> : null}
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex flex-wrap gap-3 text-[11px] font-black text-slate-500">
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-400" /> Deadline</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-indigo-600" /> Hôm nay</span>
            </div>
          </section>

          <section className="rounded-[24px] border border-white/80 bg-white p-4 shadow-[0_16px_34px_rgba(39,57,112,0.09)]">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-black text-slate-950">{"M\u1ee5c ti\u00eau tu\u1ea7n n\u00e0y"}</h2>
              <Link href="#weekly-goal-form" className="text-xs font-black text-indigo-600">
                {"Xem t\u1ea5t c\u1ea3 ->"}
              </Link>
            </div>

            <WeeklyGoalCollapse>
            <form id="weekly-goal-form" action={saveLearningPlanAction} className="grid gap-2">
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[11px] font-black text-slate-500">
                  <span>So buoi / tuan</span>
                  <input
                    name="weeklyTargetSessions"
                    type="number"
                    min={1}
                    max={28}
                    defaultValue={personalState.plan?.weeklyTargetSessions || 8}
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-800 outline-none focus:border-indigo-300"
                    required
                  />
                </label>
                <label className="text-[11px] font-black text-slate-500">
                  <span>Phut hoc / ngay</span>
                  <input
                    name="dailyMinutes"
                    type="number"
                    min={10}
                    max={240}
                    defaultValue={targetMinutes}
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-800 outline-none focus:border-indigo-300"
                    required
                  />
                </label>
                <label className="text-[11px] font-black text-slate-500">
                  <span>Deadline tuan</span>
                  <select
                    name="weeklyDeadlineDay"
                    defaultValue={String(personalState.plan?.weeklyDeadlineDay ?? 0)}
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-800 outline-none focus:border-indigo-300"
                  >
                    <option value="1">Thu 2</option>
                    <option value="2">Thu 3</option>
                    <option value="3">Thu 4</option>
                    <option value="4">Thu 5</option>
                    <option value="5">Thu 6</option>
                    <option value="6">Thu 7</option>
                    <option value="0">Chu nhat</option>
                  </select>
                </label>
                <label className="text-[11px] font-black text-slate-500">
                  <span>Ngay muc tieu</span>
                  <input
                    name="targetDate"
                    type="date"
                    defaultValue={targetDate}
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-800 outline-none focus:border-indigo-300"
                    required
                  />
                </label>
              </div>
              <label className="text-[11px] font-black text-slate-500">
                <span>Muc tieu tong quan</span>
                <input
                  name="manualFocus"
                  defaultValue={personalState.plan?.manualFocus || ""}
                  placeholder="Vi du: On N5 bai 1-2, luyen de doc..."
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-800 outline-none focus:border-indigo-300"
                />
              </label>
              <div className="grid max-h-[420px] gap-2 overflow-y-auto pr-1">
                {WEEKLY_GOAL_CATEGORIES.map((category) => (
                  <div key={category.key} className="rounded-xl border border-slate-200 bg-white p-2">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-black" style={{ color: category.color }}>
                        {category.label}
                      </span>
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-black" style={{ background: colorWithAlpha(category.color, 0.1), color: category.color }}>
                        {category.icon}
                      </span>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-[92px_1fr]">
                      <label className="text-[11px] font-black text-slate-500">
                        <span>{"M\u1ee5c ti\u00eau"}</span>
                        <input
                          name={category.targetField}
                          type="number"
                          min={0}
                          max={category.key === "vocab" ? 5000 : category.key === "kanji" ? 2000 : 1000}
                          defaultValue={weeklyPlanForCurrentWeek?.[category.targetField] ?? 0}
                          className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 text-sm font-semibold text-slate-800 outline-none focus:border-indigo-300"
                        />
                      </label>
                      <label className="text-[11px] font-black text-slate-500">
                        <span>{"N\u1ed9i dung trong tu\u1ea7n"}</span>
                        <textarea
                          name={category.listField}
                          defaultValue={weeklyPlanForCurrentWeek?.[category.listField] ?? ""}
                          placeholder={`${category.label}: bai 1, bai 2...`}
                          rows={2}
                          className="mt-1 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-indigo-300"
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>

              <input type="hidden" name="goalLevel" value={level} />
              <input type="hidden" name="weeklyGoalWeekStart" value={weekStartIso} />
              <input type="hidden" name="dailyDeadlineTime" value={dailyDeadlineTime} />
              <input type="hidden" name="monthlyDeadlineDay" value={String(personalState.plan?.monthlyDeadlineDay ?? 28)} />
              <input type="hidden" name="monthlyTargetSessions" value={String(personalState.plan?.monthlyTargetSessions ?? 24)} />
              <input type="hidden" name="autoEnabled" value={personalState.plan?.autoEnabled ? "on" : "off"} />
              <input type="hidden" name="manualEnabled" value={personalState.plan?.manualEnabled ? "on" : "off"} />
              <input type="hidden" name="autoMinutes" value={String(personalState.plan?.autoMinutes ?? 0)} />
              <input type="hidden" name="manualMinutes" value={String(personalState.plan?.manualMinutes ?? 0)} />
              <input type="hidden" name="autoStrategy" value={personalState.plan?.autoStrategy ?? "balanced"} />

              <button type="submit" className="h-9 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 text-xs font-black text-white">
                Luu muc tieu tuan
              </button>
            </form>
            </WeeklyGoalCollapse>

            <div className="mt-3 grid grid-cols-2 gap-3">
              {weeklyGoalItems.map((item) => (
                <ProgressRing
                  key={item.key}
                  value={item.value}
                  label={item.label}
                  detail={`${item.completedCount} / ${item.denominator || 0} ${item.unit}`}
                  color={item.color}
                  icon={item.icon}
                  status={item.status}
                />
              ))}
            </div>

            <div className="mt-3 grid gap-3 rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50 to-rose-50 p-3 sm:grid-cols-[1fr_1fr]">
              <div className="flex items-center gap-3">
                <div className="grid h-12 w-12 place-items-center rounded-full bg-white text-sm font-black text-indigo-600 shadow-inner">
                  {weeklyGoalProgress}%
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-black text-slate-900">{"Ho\u00e0n th\u00e0nh m\u1ee5c ti\u00eau tu\u1ea7n"}</p>
                  <p className="text-xs font-semibold text-slate-500">{weeklyGoalDone} / {weeklyGoalTotal || 0} {"m\u1ee5c"}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <CircleGauge className="h-10 w-10 rounded-full bg-white p-2 text-indigo-500 shadow-inner" />
                <div className="min-w-0">
                  <p className="text-sm font-black text-indigo-700">{"Ti\u1ebfn \u0111\u1ed9 \u1ed5n \u0111\u1ecbnh"}</p>
                  <p className="text-xs font-semibold text-slate-500">{"Gi\u1eef nh\u1ecbp h\u1ecdc trong tu\u1ea7n n\u00e0y."}</p>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-[24px] border border-white/80 bg-white p-4 shadow-[0_16px_34px_rgba(39,57,112,0.09)]">
            <h2 className="text-base font-black text-slate-950">Pomodoro hom nay</h2>
            <div className="mt-4 flex items-center gap-4">
              <div
                className="grid h-28 w-28 shrink-0 place-items-center rounded-full"
                style={{ background: `conic-gradient(#fb7185 ${dailyMinutesProgress || 75}%, #f1f5f9 ${dailyMinutesProgress || 75}% 100%)` }}
              >
                <div className="grid h-20 w-20 place-items-center rounded-full bg-white text-center">
                  <div>
                    <p className="text-2xl font-black text-slate-950">3 / 4</p>
                    <p className="text-xs font-black text-slate-400">Phien</p>
                  </div>
                </div>
              </div>
              <div className="min-w-0 flex-1 space-y-3">
                <div>
                  <div className="flex justify-between text-xs font-black text-slate-500">
                    <span>Thoi gian hoc</span>
                    <span>{minutesToday || 120} phut</span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-slate-100">
                    <div className="h-2 rounded-full bg-indigo-500" style={{ width: `${dailyMinutesProgress || 85}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs font-black text-slate-500">
                    <span>Hoan thanh</span>
                    <span>{weeklyProgress || 85}%</span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-slate-100">
                    <div className="h-2 rounded-full bg-rose-400" style={{ width: `${weeklyProgress || 85}%` }} />
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs font-black text-orange-600">
                  <Clock3 className="h-4 w-4" />
                  Chuoi tap trung {streakDays} ngay
                </div>
              </div>
            </div>
          </section>
          <section className="rounded-[24px] border border-white/80 bg-white p-4 shadow-[0_16px_34px_rgba(39,57,112,0.09)]">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <h2 className="text-base font-black text-slate-950">Tong ket deadline tuan</h2>
                <p className="text-xs font-semibold text-slate-500">
                  {formatDayMonth(weekStartIso)} - {formatDayMonth(weekEndIso)}
                </p>
              </div>
              <span
                className={`rounded-full px-2 py-1 text-[11px] font-black ${
                  isSunday ? "bg-rose-100 text-rose-700" : "bg-indigo-100 text-indigo-700"
                }`}
              >
                {isSunday ? "Chu nhat chot tuan" : "Dang trong tuan"}
              </span>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-black text-slate-900">Hoan thanh {weeklySummaryRate}%</p>
                <p className="text-xs font-semibold text-slate-500">
                  {weeklySummaryCompleted}/{weeklySummaryTotal || 0} deadline
                </p>
              </div>
              <div className="mt-2 h-2 rounded-full bg-slate-200">
                <div className="h-2 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500" style={{ width: `${weeklySummaryRate}%` }} />
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-black">
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-emerald-700">Xong: {weeklySummaryCompleted}</div>
              <div className="rounded-xl border border-sky-100 bg-sky-50 px-3 py-2 text-sky-700">Dang hoc: {weeklySummaryDoing}</div>
              <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-amber-700">Chua lam: {weeklySummaryPending}</div>
              <div className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-rose-700">Qua han: {weeklySummaryOverdue}</div>
            </div>

            <div className="mt-3 rounded-xl border border-slate-100 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
              Bo qua: <span className="font-black text-slate-800">{weeklySummarySkipped}</span> • Con mo: <span className="font-black text-slate-800">{weeklySummaryOpen}</span>
            </div>

            {isSunday ? (
              <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-800">
                Hom nay la Chu nhat: hay chot tuan, dan lai cac viec con mo va len plan cho tuan moi.
              </div>
            ) : null}

            {weeklySummarySource.length === 0 ? (
              <div className="mt-3 rounded-xl border border-dashed border-slate-200 px-3 py-2 text-xs font-semibold text-slate-500">
                Tuan nay chua co deadline.
              </div>
            ) : null}
          </section>

          <section className="rounded-[24px] border border-white/80 bg-white p-4 shadow-[0_16px_34px_rgba(39,57,112,0.09)]">
            <div className="mb-4 flex items-center gap-2">
              <BookOpenText className="h-4 w-4 text-indigo-600" />
              <h2 className="text-base font-black text-slate-950">Phan bo mon hoc</h2>
            </div>
            <div className="space-y-2">
              {focusGoals.map((goal) => (
                <div key={goal.label} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                  <span className="text-sm font-black text-slate-700">{goal.label}</span>
                  <span className="text-sm font-black text-indigo-600">{goal.count || 1}</span>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}
