import Link from "next/link";
import { AlarmClock, BookOpenCheck, CalendarCheck2, ChevronLeft, ChevronRight, Plus, Save, Trash2 } from "lucide-react";

import {
  addManualDeadlineTaskAction,
  deleteDeadlineTaskAction,
  saveLearningPlanAction,
  saveReminderSettingsAction,
  updateDeadlineTaskAction,
} from "@/app/actions/personal";
import { DailyReminderClient } from "@/app/components/daily-reminder-client";
import { DeadlineStatusSelect } from "@/app/components/deadline-status-select";
import { requireUser } from "@/lib/auth";
import { loadUserPersonalState, type DeadlineTask, type DeadlineTaskStatus } from "@/lib/user-personal-data";
import { loadUserKanjiStore } from "@/lib/user-kanji-store";

const PRIORITY_LABEL: Record<DeadlineTask["priority"], string> = {
  high: "Cao",
  medium: "Vừa",
  low: "Nhẹ",
};

const PRIORITY_CLASS: Record<DeadlineTask["priority"], string> = {
  high: "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-200",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200",
  low: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
};

const STATUS_META: Record<DeadlineTaskStatus, { points: number; progress: number }> = {
  pending: { points: 0, progress: 0 },
  doing: { points: 4, progress: 40 },
  done: { points: 10, progress: 100 },
  late_done: { points: 7, progress: 100 },
  skipped: { points: -3, progress: 0 },
};

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

function endOfWeek(base: Date): Date {
  return addDays(startOfWeek(base), 6);
}

function toDateAtMidnight(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

function weekdayShort(isoDate: string): string {
  const date = toDateAtMidnight(isoDate);
  return date.toLocaleDateString("vi-VN", { weekday: "short" });
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

function formatProgressFromStatus(status: DeadlineTaskStatus): string {
  return `${STATUS_META[status].progress}%`;
}

function modeLabel(mode: DeadlineTask["mode"]): string {
  return mode === "manual" ? "Chủ động" : "Tự động";
}

function slotClass(slot: string): string {
  const normalized = slot.toLowerCase();
  if (normalized.includes("sáng")) {
    return "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200";
  }
  if (normalized.includes("chiều")) {
    return "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-200";
  }
  if (normalized.includes("tối")) {
    return "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-200";
  }
  return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200";
}

function normalizePositiveInt(input: string | undefined, fallback: number): number {
  const parsed = Number(input ?? "");
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const safe = Math.floor(parsed);
  return safe > 0 ? safe : fallback;
}

function buildPersonalHref(week: number, page: number): string {
  const params = new URLSearchParams();
  params.set("week", String(week));
  params.set("page", String(page));
  return `/personal?${params.toString()}#deadline-board`;
}

type WeekGroup = {
  weekNumber: number;
  startIso: string;
  endIso: string;
  tasks: DeadlineTask[];
};

function groupTasksByWeek(sortedTasks: DeadlineTask[]): WeekGroup[] {
  if (sortedTasks.length === 0) {
    return [];
  }

  const firstDate = toDateAtMidnight(sortedTasks[0].date);
  const baseWeekStart = startOfWeek(firstDate);
  const baseWeekStartIso = toIsoDateLocal(baseWeekStart);

  const weekMap = new Map<number, DeadlineTask[]>();
  for (const task of sortedTasks) {
    const taskDate = toDateAtMidnight(task.date);
    const taskWeekStart = startOfWeek(taskDate);
    const diffDays = Math.floor(
      (toDateAtMidnight(toIsoDateLocal(taskWeekStart)).getTime() - toDateAtMidnight(baseWeekStartIso).getTime()) /
        (24 * 60 * 60 * 1000)
    );
    const weekIndex = Math.floor(diffDays / 7);
    const bucket = weekMap.get(weekIndex);
    if (bucket) {
      bucket.push(task);
    } else {
      weekMap.set(weekIndex, [task]);
    }
  }

  const sortedWeekIndexes = Array.from(weekMap.keys()).sort((a, b) => a - b);
  return sortedWeekIndexes.map((weekIndex) => {
    const startDate = addDays(baseWeekStart, weekIndex * 7);
    const endDate = addDays(startDate, 6);
    return {
      weekNumber: weekIndex + 1,
      startIso: toIsoDateLocal(startDate),
      endIso: toIsoDateLocal(endDate),
      tasks: (weekMap.get(weekIndex) ?? []).sort((a, b) =>
        a.date === b.date
          ? a.startTime === b.startTime
            ? a.deadlineTime.localeCompare(b.deadlineTime)
            : a.startTime.localeCompare(b.startTime)
          : a.date.localeCompare(b.date)
      ),
    };
  });
}

function calculateStreak(tasks: DeadlineTask[], todayIso: string): number {
  const taskMap = new Map<string, DeadlineTask[]>();
  for (const task of tasks) {
    const bucket = taskMap.get(task.date);
    if (bucket) {
      bucket.push(task);
    } else {
      taskMap.set(task.date, [task]);
    }
  }

  let streak = 0;
  let cursor = toDateAtMidnight(todayIso);

  while (true) {
    const iso = toIsoDateLocal(cursor);
    const dayTasks = taskMap.get(iso);
    if (!dayTasks || dayTasks.length === 0) {
      break;
    }
    if (!dayTasks.every((task) => isCompleted(task.status))) {
      break;
    }
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  return streak;
}

type SearchParams = Promise<{ week?: string; page?: string }>;

export default async function PersonalPage(props: { searchParams: SearchParams }) {
  const user = await requireUser();
  const params = await props.searchParams;
  const [personalState, userKanjiStore] = await Promise.all([loadUserPersonalState(user.id), loadUserKanjiStore(user.id)]);

  const plan = personalState.plan;
  const goalLevel = plan?.goalLevel === "N4" ? "N4" : "N5";
  const targetDate = plan?.targetDate ?? "";
  const dailyDeadlineTime = plan?.dailyDeadlineTime ?? "21:30";
  const autoEnabled = plan?.autoEnabled ?? false;
  const manualEnabled = plan?.manualEnabled ?? true;
  const autoMinutes = plan?.autoMinutes ?? 0;
  const manualMinutes = plan?.manualMinutes ?? 25;
  const dailyMinutes = plan?.dailyMinutes ?? Math.max(10, autoMinutes + manualMinutes || 25);
  const weeklyDeadlineDay = plan?.weeklyDeadlineDay ?? 0;
  const weeklyTargetSessions = plan?.weeklyTargetSessions ?? 18;
  const monthlyDeadlineDay = plan?.monthlyDeadlineDay ?? 28;
  const monthlyTargetSessions = plan?.monthlyTargetSessions ?? 72;
  const autoStrategy = plan?.autoStrategy ?? "balanced";
  const manualFocus = plan?.manualFocus ?? "";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = toIsoDateLocal(today);
  const weekStart = startOfWeek(today);
  const weekEnd = endOfWeek(today);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  const weekStartIso = toIsoDateLocal(weekStart);
  const weekEndIso = toIsoDateLocal(weekEnd);
  const monthStartIso = toIsoDateLocal(monthStart);
  const monthEndIso = toIsoDateLocal(monthEnd);
  const horizonIso = toIsoDateLocal(addDays(today, 45));

  const tasks = personalState.deadlineTasks
    .filter((task) => task.date >= toIsoDateLocal(addDays(today, -1)) && task.date <= horizonIso)
    .sort((a, b) =>
      a.date === b.date
        ? a.startTime === b.startTime
          ? a.deadlineTime.localeCompare(b.deadlineTime)
          : a.startTime.localeCompare(b.startTime)
        : a.date.localeCompare(b.date)
    );

  const weekGroups = groupTasksByWeek(tasks);
  const selectedWeekRaw = normalizePositiveInt(params.week, 1);
  const selectedWeek = Math.min(Math.max(selectedWeekRaw, 1), Math.max(weekGroups.length, 1));
  const activeWeek = weekGroups[selectedWeek - 1] ?? null;
  const tasksForView = activeWeek ? activeWeek.tasks : tasks;

  const PAGE_SIZE = 8;
  const totalPages = Math.max(1, Math.ceil(tasksForView.length / PAGE_SIZE));
  const selectedPageRaw = normalizePositiveInt(params.page, 1);
  const selectedPage = Math.min(Math.max(selectedPageRaw, 1), totalPages);
  const pageStart = (selectedPage - 1) * PAGE_SIZE;
  const pagedTasks = tasksForView.slice(pageStart, pageStart + PAGE_SIZE);
  const MAX_VISIBLE_PAGES = 7;
  let pageNumberStart = Math.max(1, selectedPage - Math.floor(MAX_VISIBLE_PAGES / 2));
  let pageNumberEnd = Math.min(totalPages, pageNumberStart + MAX_VISIBLE_PAGES - 1);
  if (pageNumberEnd - pageNumberStart + 1 < MAX_VISIBLE_PAGES) {
    pageNumberStart = Math.max(1, pageNumberEnd - MAX_VISIBLE_PAGES + 1);
  }
  const pageNumbers = Array.from({ length: pageNumberEnd - pageNumberStart + 1 }, (_, index) => pageNumberStart + index);

  const tasksToday = tasks.filter((task) => task.date === todayIso);
  const tasksWeek = tasks.filter((task) => task.date >= weekStartIso && task.date <= weekEndIso);
  const tasksMonth = tasks.filter((task) => task.date >= monthStartIso && task.date <= monthEndIso);

  const doneToday = tasksToday.filter((task) => isCompleted(task.status)).length;
  const doneWeek = tasksWeek.filter((task) => isCompleted(task.status)).length;
  const doneMonth = tasksMonth.filter((task) => isCompleted(task.status)).length;

  const dailyProgress = completionPercent(doneToday, tasksToday.length);
  const weeklyProgress = completionPercent(doneWeek, tasksWeek.length || weeklyTargetSessions);
  const monthlyProgress = completionPercent(doneMonth, tasksMonth.length || monthlyTargetSessions);

  const totalPoints = tasks.reduce((sum, task) => sum + STATUS_META[task.status].points, 0);
  const safePoints = Math.max(0, totalPoints);
  const level = Math.floor(safePoints / 100) + 1;
  const expInLevel = safePoints % 100;
  const expPercent = completionPercent(expInLevel, 100);
  const streakDays = calculateStreak(tasks, todayIso);

  const focusKanji = userKanjiStore.items.filter((item) => item.jlptLevel === "N5" || item.jlptLevel === "N4").length;

  return (
    <section className="space-y-5">
      <div className="grammar-shell rounded-2xl border border-sky-200/70 bg-gradient-to-r from-sky-50 via-white to-teal-50 p-6 dark:border-slate-700 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-slate-900 dark:text-slate-100">Bảng Deadline Hằng Ngày</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Tập trung học N5/N4 bằng Flashcard + Kanji. Mỗi nhiệm vụ có deadline, trạng thái, điểm và tiến độ để bạn
              luôn có động lực hoàn thành.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/kanji?scope=personal" className="btn-primary text-sm">
              Flashcard Kanji
            </Link>
            <Link href="/kanji/personal" className="btn-soft text-sm">
              Thư viện Kanji cá nhân
            </Link>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-6">
          <article className="rounded-xl border border-slate-200 bg-white/90 p-3 dark:border-slate-700 dark:bg-slate-900/70">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Mục tiêu</p>
            <p className="mt-1 text-2xl font-black text-slate-900 dark:text-slate-100">{goalLevel}</p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white/90 p-3 dark:border-slate-700 dark:bg-slate-900/70">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Theo ngày</p>
            <p className="mt-1 text-2xl font-black text-slate-900 dark:text-slate-100">{dailyProgress}%</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {doneToday}/{tasksToday.length || 0} nhiệm vụ
            </p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white/90 p-3 dark:border-slate-700 dark:bg-slate-900/70">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Theo tuần</p>
            <p className="mt-1 text-2xl font-black text-slate-900 dark:text-slate-100">{weeklyProgress}%</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {doneWeek}/{tasksWeek.length || weeklyTargetSessions} nhiệm vụ
            </p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white/90 p-3 dark:border-slate-700 dark:bg-slate-900/70">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Theo tháng</p>
            <p className="mt-1 text-2xl font-black text-slate-900 dark:text-slate-100">{monthlyProgress}%</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {doneMonth}/{tasksMonth.length || monthlyTargetSessions} nhiệm vụ
            </p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white/90 p-3 dark:border-slate-700 dark:bg-slate-900/70">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Điểm tổng</p>
            <p className="mt-1 text-2xl font-black text-slate-900 dark:text-slate-100">{totalPoints}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{focusKanji} chữ N5/N4</p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white/90 p-3 dark:border-slate-700 dark:bg-slate-900/70">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Streak</p>
            <p className="mt-1 text-2xl font-black text-slate-900 dark:text-slate-100">{streakDays} ngày 🔥</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Hoàn thành 100% theo ngày</p>
          </article>
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 bg-white/90 p-3 dark:border-slate-700 dark:bg-slate-900/70">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <p className="font-semibold text-slate-800 dark:text-slate-200">Cấp độ học tập: Level {level}</p>
            <p className="text-slate-600 dark:text-slate-300">EXP: {expInLevel}/100</p>
          </div>
          <div className="mt-2 h-2.5 rounded-full bg-slate-200 dark:bg-slate-700">
            <div className="h-2.5 rounded-full bg-gradient-to-r from-emerald-500 to-sky-500" style={{ width: `${expPercent}%` }} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <div className="panel p-5 dark:border-slate-700 dark:bg-slate-900/70">
          <h2 className="inline-flex items-center gap-2 text-lg font-black text-slate-900 dark:text-slate-100">
            <CalendarCheck2 className="h-5 w-5 text-teal-600" />
            Thiết lập mục tiêu + deadline
          </h2>
          <form action={saveLearningPlanAction} className="mt-4 space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <label className="space-y-1 text-sm">
                <span className="font-semibold text-slate-700 dark:text-slate-300">Mục tiêu</span>
                <select name="goalLevel" defaultValue={goalLevel} className="input-base">
                  <option value="N5">N5</option>
                  <option value="N4">N4</option>
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-semibold text-slate-700 dark:text-slate-300">Hạn mục tiêu</span>
                <input name="targetDate" type="date" className="input-base" defaultValue={targetDate} required />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-semibold text-slate-700 dark:text-slate-300">Tổng phút/ngày</span>
                <input
                  name="dailyMinutes"
                  type="number"
                  min={10}
                  max={240}
                  defaultValue={dailyMinutes}
                  className="input-base"
                  required
                />
              </label>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/50">
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <input type="checkbox" name="autoEnabled" defaultChecked={autoEnabled} />
                  Bật tự động
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <input type="checkbox" name="manualEnabled" defaultChecked={manualEnabled} />
                  Bật chủ động
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Deadline ngày</span>
                  <input name="dailyDeadlineTime" type="time" defaultValue={dailyDeadlineTime} className="input-base" required />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Auto phút/ngày</span>
                  <input name="autoMinutes" type="number" min={0} max={240} defaultValue={autoMinutes} className="input-base" />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Chủ động phút/ngày</span>
                  <input
                    name="manualMinutes"
                    type="number"
                    min={0}
                    max={240}
                    defaultValue={manualMinutes}
                    className="input-base"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Chiến lược auto</span>
                  <select name="autoStrategy" defaultValue={autoStrategy} className="input-base">
                    <option value="balanced">Cân bằng</option>
                    <option value="flashcard_first">Flashcard trước</option>
                    <option value="kanji_first">Kanji trước</option>
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Hạn tuần (0-6)</span>
                  <input
                    name="weeklyDeadlineDay"
                    type="number"
                    min={0}
                    max={6}
                    defaultValue={weeklyDeadlineDay}
                    className="input-base"
                    required
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Mục tiêu nhiệm vụ/tuần</span>
                  <input
                    name="weeklyTargetSessions"
                    type="number"
                    min={1}
                    max={28}
                    defaultValue={weeklyTargetSessions}
                    className="input-base"
                    required
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Hạn tháng (ngày)</span>
                  <input
                    name="monthlyDeadlineDay"
                    type="number"
                    min={1}
                    max={31}
                    defaultValue={monthlyDeadlineDay}
                    className="input-base"
                    required
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Mục tiêu nhiệm vụ/tháng</span>
                  <input
                    name="monthlyTargetSessions"
                    type="number"
                    min={4}
                    max={120}
                    defaultValue={monthlyTargetSessions}
                    className="input-base"
                    required
                  />
                </label>
                <label className="space-y-1 text-sm lg:col-span-2">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Chủ đề chủ động</span>
                  <input
                    name="manualFocus"
                    type="text"
                    maxLength={160}
                    defaultValue={manualFocus}
                    placeholder="Ví dụ: N4 đọc hiểu, Kanji công sở, ngữ pháp giao tiếp..."
                    className="input-base"
                  />
                </label>
              </div>
            </div>

            <button type="submit" className="btn-primary w-full">
              Lưu thiết lập lịch học
            </button>
          </form>
        </div>

        <div className="space-y-4">
          <div className="panel p-5 dark:border-slate-700 dark:bg-slate-900/70">
            <h3 className="inline-flex items-center gap-2 text-base font-black text-slate-900 dark:text-slate-100">
              <Plus className="h-4 w-4 text-emerald-600" />
              Thêm task chủ động
            </h3>
            <form action={addManualDeadlineTaskAction} className="mt-3 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <input name="date" type="date" defaultValue={todayIso} className="input-base" required />
                <input name="slot" type="text" defaultValue="Tối" className="input-base" required />
              </div>
              <input name="subject" type="text" defaultValue={`JP - ${goalLevel} chủ động`} className="input-base" required />
              <input
                name="task"
                type="text"
                placeholder="Ví dụ: Ôn 20 thẻ khó + viết 10 kanji"
                className="input-base"
                required
              />
              <div className="grid grid-cols-3 gap-2">
                <input name="startTime" type="time" defaultValue="21:00" className="input-base" required />
                <input name="deadlineTime" type="time" defaultValue="22:00" className="input-base" required />
                <select name="priority" defaultValue="medium" className="input-base">
                  <option value="high">Cao</option>
                  <option value="medium">Vừa</option>
                  <option value="low">Nhẹ</option>
                </select>
              </div>
              <button type="submit" className="btn-soft w-full">
                Thêm task
              </button>
            </form>
          </div>

          <div className="panel p-5 dark:border-slate-700 dark:bg-slate-900/70">
            <h3 className="inline-flex items-center gap-2 text-base font-black text-slate-900 dark:text-slate-100">
              <AlarmClock className="h-4 w-4 text-violet-600" />
              Nhắc học hằng ngày
            </h3>
            <form action={saveReminderSettingsAction} className="mt-3 space-y-3">
              <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input type="checkbox" name="enabled" defaultChecked={personalState.reminders.enabled} />
                Bật thông báo nhắc học
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  name="hour"
                  min={0}
                  max={23}
                  defaultValue={personalState.reminders.hour}
                  className="input-base"
                />
                <input
                  type="number"
                  name="minute"
                  min={0}
                  max={59}
                  defaultValue={personalState.reminders.minute}
                  className="input-base"
                />
              </div>
              <input type="hidden" name="timezone" value={personalState.reminders.timezone || "Asia/Tokyo"} />
              <button type="submit" className="btn-soft w-full">
                Lưu nhắc học
              </button>
            </form>
            <div className="mt-3">
              <DailyReminderClient
                enabled={personalState.reminders.enabled}
                hour={personalState.reminders.hour}
                minute={personalState.reminders.minute}
                label="Đến giờ học N5/N4 flashcard + kanji."
              />
            </div>
          </div>
        </div>
      </div>

      <div id="deadline-board" className="panel overflow-hidden dark:border-slate-700 dark:bg-slate-900/70">
        <div className="border-b border-sky-200 bg-gradient-to-r from-sky-50 via-white to-teal-50 px-6 py-4 dark:border-slate-700 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
          <h2 className="inline-flex items-center gap-2 text-lg font-black text-slate-900 dark:text-slate-100">
            <BookOpenCheck className="h-5 w-5 text-teal-600" />
            Deadline theo ngày / tuần / tháng
          </h2>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
            Đổi trạng thái là tự lưu ngay. Màu trạng thái cũng đổi ngay để bạn nhìn rõ tiến độ.
          </p>
        </div>

        {tasks.length === 0 ? (
          <div className="p-6 text-sm text-slate-600 dark:text-slate-300">Chưa có nhiệm vụ nào. Hãy thêm task chủ động ở khung phía trên.</div>
        ) : (
          <div>
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
              {weekGroups.map((group) => {
                const isActive = group.weekNumber === selectedWeek;
                return (
                  <Link
                    key={group.weekNumber}
                    href={buildPersonalHref(group.weekNumber, 1)}
                    scroll={false}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                      isActive
                        ? "border-teal-400 bg-teal-50 text-teal-700 dark:border-teal-700 dark:bg-teal-950/30 dark:text-teal-200"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                    }`}
                  >
                    Tuần {group.weekNumber}
                  </Link>
                );
              })}
              {activeWeek ? (
                <p className="ml-auto text-xs text-slate-500 dark:text-slate-400">
                  {activeWeek.startIso} - {activeWeek.endIso}
                </p>
              ) : null}
            </div>

            <div className="overflow-hidden">
              <table className="w-full table-fixed text-sm">
                <thead className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  <tr>
                    <th className="w-[12%] px-3 py-3 text-left font-semibold">Ngày</th>
                    <th className="w-[10%] px-3 py-3 text-left font-semibold">Buổi</th>
                    <th className="w-[18%] px-3 py-3 text-left font-semibold">Môn</th>
                    <th className="w-[22%] px-3 py-3 text-left font-semibold">Nhiệm vụ</th>
                    <th className="w-[14%] px-3 py-3 text-left font-semibold">Giờ</th>
                    <th className="w-[10%] px-3 py-3 text-left font-semibold">Ưu tiên</th>
                    <th className="w-[14%] px-3 py-3 text-left font-semibold">Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedTasks.map((task, index) => {
                    const meta = STATUS_META[task.status];
                    const noteFormId = `note-form-${task.id}`;
                    const deleteFormId = `delete-form-${task.id}`;
                    const isFirstRowOfDate = index === 0 || pagedTasks[index - 1].date !== task.date;
                    let dateRowSpan = 1;
                    if (isFirstRowOfDate) {
                      for (let cursor = index + 1; cursor < pagedTasks.length; cursor += 1) {
                        if (pagedTasks[cursor].date !== task.date) {
                          break;
                        }
                        dateRowSpan += 1;
                      }
                    }
                    return (
                      <tr key={task.id} className="group border-t border-sky-100 align-top dark:border-slate-700">
                        {isFirstRowOfDate ? (
                          <td rowSpan={dateRowSpan} className="px-3 py-3 align-top">
                            <p className="font-semibold text-slate-800 dark:text-slate-100">{task.date}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">{weekdayShort(task.date)}</p>
                          </td>
                        ) : null}
                        <td className="px-3 py-3">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${slotClass(task.slot)}`}>
                            {task.slot}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <p className="font-semibold text-slate-800 dark:text-slate-100">{task.subject}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                              {modeLabel(task.mode)}
                            </span>
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">
                              {meta.points} điểm
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex min-h-[136px] flex-col">
                            <p className="whitespace-normal break-words text-slate-800 dark:text-slate-200">{task.task}</p>
                            <input
                              form={noteFormId}
                              name="note"
                              defaultValue={task.note ?? ""}
                              placeholder="Ghi chú ngắn..."
                              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                            />
                            <input form={noteFormId} type="hidden" name="taskId" value={task.id} />
                            <form id={noteFormId} action={updateDeadlineTaskAction} />
                            <form id={deleteFormId} action={deleteDeadlineTaskAction}>
                              <input type="hidden" name="taskId" value={task.id} />
                            </form>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <p className="font-semibold text-slate-800 dark:text-slate-100">
                            {task.startTime} → {task.deadlineTime}
                          </p>
                          <div className="mt-1 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700">
                            <div className="h-1.5 rounded-full bg-teal-500" style={{ width: formatProgressFromStatus(task.status) }} />
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <span className={`inline-flex h-9 items-center rounded-full px-2.5 py-1 text-xs font-semibold ${PRIORITY_CLASS[task.priority]}`}>
                            {PRIORITY_LABEL[task.priority]}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex min-h-[136px] min-w-[8.75rem] flex-col">
                            <DeadlineStatusSelect taskId={task.id} initialStatus={task.status} taskLabel={task.task} />
                            <div className="mt-auto pt-2">
                              <div className="flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                                <button
                                  type="submit"
                                  form={noteFormId}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100 dark:border-teal-800 dark:bg-teal-950/30 dark:text-teal-200"
                                  title="Lưu ghi chú"
                                  aria-label="Lưu ghi chú"
                                >
                                  <Save className="h-4 w-4" />
                                </button>
                                <button
                                  type="submit"
                                  form={deleteFormId}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200"
                                  title="Xóa task"
                                  aria-label="Xóa task"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-700">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Trang {selectedPage}/{totalPages} - {tasksForView.length} nhiệm vụ
              </p>
              <div className="flex items-center gap-1">
                <Link
                  href={buildPersonalHref(selectedWeek, Math.max(1, selectedPage - 1))}
                  scroll={false}
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-full border text-slate-600 dark:text-slate-300 ${
                    selectedPage === 1
                      ? "pointer-events-none opacity-40"
                      : "border-slate-300 bg-white hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:hover:bg-slate-800"
                  }`}
                  aria-label="Trang trước"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Link>
                {pageNumbers.map((page) => {
                  const active = page === selectedPage;
                  return (
                    <Link
                      key={page}
                      href={buildPersonalHref(selectedWeek, page)}
                      scroll={false}
                      className={`inline-flex h-8 min-w-8 items-center justify-center rounded-full border px-2 text-xs font-semibold ${
                        active
                          ? "border-teal-500 bg-teal-50 text-teal-700 dark:border-teal-700 dark:bg-teal-950/30 dark:text-teal-200"
                          : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                      }`}
                    >
                      {page}
                    </Link>
                  );
                })}
                <Link
                  href={buildPersonalHref(selectedWeek, Math.min(totalPages, selectedPage + 1))}
                  scroll={false}
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-full border text-slate-600 dark:text-slate-300 ${
                    selectedPage === totalPages
                      ? "pointer-events-none opacity-40"
                      : "border-slate-300 bg-white hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:hover:bg-slate-800"
                  }`}
                  aria-label="Trang sau"
                >
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
