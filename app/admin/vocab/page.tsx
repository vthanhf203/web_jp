import Link from "next/link";
import {
  Bell,
  BookOpen,
  ChartNoAxesColumn,
  Check,
  ChevronDown,
  CircleQuestionMark,
  CloudUpload,
  Database,
  Download,
  FileText,
  Funnel,
  Hourglass,
  Import as ImportIcon,
  Languages,
  LayoutDashboard,
  ListChecks,
  Moon,
  Plus,
  RotateCw,
  Search,
  Settings,
  Trash2,
  type LucideIcon,
} from "lucide-react";

import {
  clearAdminVocabLessonAction,
  createAdminVocabLessonAction,
  deleteAdminVocabImportHistoryAction,
  deleteAdminVocabLessonAction,
  rollbackAdminVocabImportAction,
  updateAdminVocabLessonAction,
} from "@/app/actions/admin-vocab";
import { AdminVocabImportForm } from "@/app/components/admin-vocab-import-form";
import { AdminVocabItemsTable } from "@/app/components/admin-vocab-items-table";
import { AdminVocabLessonBundleImportForm } from "@/app/components/admin-vocab-lesson-bundle-import-form";
import { AdminVocabScrollRestore } from "@/app/components/admin-vocab-scroll-restore";
import { AdminVocabSyncForm } from "@/app/components/admin-vocab-sync-form";
import { requireAdmin } from "@/lib/admin";
import {
  JLPT_LEVELS,
  loadAdminVocabImportHistory,
  loadAdminVocabLibrary,
  normalizeJlptLevel,
  type JlptLevel,
} from "@/lib/admin-vocab-library";

type SearchParams = Promise<{
  lesson?: string | string[];
  level?: string | string[];
  section?: string | string[];
}>;

type ExportLevel = JlptLevel | "ALL";

type Taone = "violet" | "blue" | "emerald" | "amber";
type AdminVocabSection =
  | "overview"
  | "lesson"
  | "import"
  | "history"
  | "sync"
  | "items"
  | "reports";

const DEFAULT_SECTION: AdminVocabSection = "overview";

const SECTION_CONFIG: Array<{
  key: AdminVocabSection;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    key: "overview",
    label: "Taong quan",
    description: "Thong ke nhanh va loi tat quan ly.",
    icon: LayoutDashboard,
  },
  {
    key: "lesson",
    label: "Lesson",
    description: "Tao va cap nhat lesson.",
    icon: BookOpen,
  },
  {
    key: "import",
    label: "Import",
    description: "Nhap du lieu JSON vao lesson.",
    icon: CloudUpload,
  },
  {
    key: "history",
    label: "Lich su import",
    description: "Theo doi va hoan tac import.",
    icon: Hourglass,
  },
  {
    key: "sync",
    label: "Sync URL/API",
    description: "Dong bo du lieu tu nguon ngoai.",
    icon: RotateCw,
  },
  {
    key: "items",
    label: "Danh sach tu",
    description: "Sua, xoa, chuyen chu de tu vung.",
    icon: ListChecks,
  },
  {
    key: "reports",
    label: "Bao cao va xuat",
    description: "Bang tong hop, in PDF, xuat JSON.",
    icon: ChartNoAxesColumn,
  },
];

const navItems: Array<{
  href: string;
  label: string;
  icon: LucideIcon;
  active?: boolean;
}> = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/grammar", label: "Ngu phap", icon: Languages },
  { href: "/admin/vocab", label: "Tu vung", icon: BookOpen, active: true },
  { href: "/admin/kanji", label: "Kanji", icon: FileText },
  { href: "/self-study/reading", label: "Bai hoc", icon: ListChecks },
  { href: "/admin/vocab?section=import", label: "Import", icon: ImportIcon },
];

const reportItems = [
  { href: "/admin/vocab?section=reports", label: "Thong ke", icon: ChartNoAxesColumn },
];

const systemItems = [
  { href: "/admin", label: "Cai dat", icon: Settings },
];

function pickSingle(value?: string | string[]): string | null {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? value[0] ?? null : value;
}

function normalizeAdminVocabSection(value: string | null): AdminVocabSection {
  if (!value) {
    return DEFAULT_SECTION;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "lesson") {
    return "lesson";
  }
  if (normalized === "import") {
    return "import";
  }
  if (normalized === "history") {
    return "history";
  }
  if (normalized === "sync") {
    return "sync";
  }
  if (normalized === "items") {
    return "items";
  }
  if (normalized === "reports") {
    return "reports";
  }
  return "overview";
}

function levelStyle(level: JlptLevel, active: JlptLevel): string {
  if (level !== active) {
    return "border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50";
  }
  if (level === "N5") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (level === "N4") {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }
  if (level === "N3") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (level === "N2") {
    return "border-orange-200 bg-orange-50 text-orange-700";
  }
  return "border-rose-200 bg-rose-50 text-rose-700";
}

function levelHref(
  level: JlptLevel,
  lessonId: string | null = null,
  section?: AdminVocabSection
): string {
  const query = new URLSearchParams();
  query.set("level", level);
  if (lessonId) {
    query.set("lesson", lessonId);
  }
  if (section && section !== DEFAULT_SECTION) {
    query.set("section", section);
  }
  return `/admin/vocab?${query.toString()}`;
}

function sectionHref(options: {
  section: AdminVocabSection;
  level: JlptLevel;
  lessonId?: string | null;
}): string {
  const query = new URLSearchParams();
  query.set("level", options.level);
  if (options.lessonId) {
    query.set("lesson", options.lessonId);
  }
  if (options.section !== DEFAULT_SECTION) {
    query.set("section", options.section);
  }
  return `/admin/vocab?${query.toString()}`;
}

function buildVocabPrintHref(level: ExportLevel, lessonId?: string): string {
  const query = new URLSearchParams();
  query.set("level", level);
  if (lessonId) {
    query.set("lesson", lessonId);
  }
  return `/admin/vocab/print?${query.toString()}`;
}

function buildVocabJsonHref(level: ExportLevel, lessonId?: string): string {
  const query = new URLSearchParams();
  query.set("download", "1");
  if (level !== "ALL") {
    query.set("level", level);
  }
  if (lessonId) {
    query.set("lesson", lessonId);
  }
  return `/api/vocab-library${query.size ? `?${query.toString()}` : ""}`;
}

function formatDateTime(value: string): string {
  try {
    return new Intl.DateTimeFormat("vi-VN", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("vi-VN").format(value);
}

function toneClasses(tone: Taone): { icon: string; value: string; hint: string } {
  if (tone === "violet") {
    return {
      icon: "bg-violet-50 text-violet-600",
      value: "text-slate-800",
      hint: "text-emerald-600",
    };
  }
  if (tone === "blue") {
    return {
      icon: "bg-blue-50 text-blue-600",
      value: "text-slate-800",
      hint: "text-emerald-600",
    };
  }
  if (tone === "emerald") {
    return {
      icon: "bg-sky-50 text-sky-600",
      value: "text-emerald-600",
      hint: "text-slate-500",
    };
  }
  return {
    icon: "bg-orange-50 text-orange-500",
    value: "text-orange-500",
    hint: "text-slate-500",
  };
}

function SidebarLink({
  href,
  label,
  icon: Icon,
  active = false,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-semibold transition ${
        active
          ? "bg-violet-50 text-violet-700 shadow-[inset_3px_0_0_#7c3aed]"
          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
      }`}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {active ? <ChevronDown className="h-4 w-4 -rotate-90" aria-hidden="true" /> : null}
    </Link>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
  tone: Taone;
}) {
  const classes = toneClasses(tone);
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-[0_8px_26px_rgba(15,23,42,0.05)]">
      <div className="flex items-center gap-4">
        <span className={`grid h-12 w-12 place-items-center rounded-full ${classes.icon}`}>
          <Icon className="h-6 w-6" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-500">{label}</p>
          <p className={`mt-1 text-2xl font-bold ${classes.value}`}>{value}</p>
          <p className={`mt-1 text-xs font-semibold ${classes.hint}`}>{hint}</p>
        </div>
      </div>
    </article>
  );
}

function SectionHeader({
  number,
  title,
  description,
  action,
}: {
  number: number;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="flex min-w-0 gap-3">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-blue-50 text-sm font-bold text-blue-700">
          {number}
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-800">{title}</h2>
          {description ? <p className="mt-1 text-xs text-slate-500">{description}</p> : null}
        </div>
      </div>
      {action}
    </div>
  );
}

function StatusBadge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "green" | "orange" | "slate";
}) {
  const className =
    tone === "green"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "orange"
        ? "border-orange-200 bg-orange-50 text-orange-700"
        : "border-slate-200 bg-slate-50 text-slate-600";
  return (
    <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${className}`}>
      {children}
    </span>
  );
}

export default async function AdminVocabPage(props: { searchParams: SearchParams }) {
  await requireAdmin();

  const params = await props.searchParams;
  const [library, importHistory] = await Promise.all([
    loadAdminVocabLibrary(),
    loadAdminVocabImportHistory(),
  ]);
  const lessons = [...library.lessons].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const selectedLevel = normalizeJlptLevel(pickSingle(params.level));
  const activeSection = normalizeAdminVocabSection(pickSingle(params.section));
  const filteredLessons = lessons.filter((lesson) => lesson.jlptLevel === selectedLevel);
  const requestedLessonId = pickSingle(params.lesson);
  const selectedLesson =
    filteredLessons.find((lesson) => lesson.id === requestedLessonId) ??
    filteredLessons[0] ??
    null;

  const items = selectedLesson ? [...selectedLesson.items] : [];
  const latestImport = importHistory[0] ?? null;
  const activeSectionConfig =
    SECTION_CONFIG.find((entry) => entry.key === activeSection) ?? SECTION_CONFIG[0];
  const ActiveSectionIcon = activeSectionConfig.icon;
  const showOverview = activeSection === "overview";
  const showLessonSection = activeSection === "lesson";
  const showImportSection = activeSection === "import";
  const showHistorySection = activeSection === "history";
  const showSyncSection = activeSection === "sync";
  const showItemsSection = activeSection === "items";
  const showReportsSection = activeSection === "reports";

  const levelStats = Object.fromEntries(
    JLPT_LEVELS.map((level) => {
      const lessonsInLevel = lessons.filter((lesson) => lesson.jlptLevel === level);
      return [
        level,
        {
          lessonCount: lessonsInLevel.length,
          vocabCount: lessonsInLevel.reduce((sum, lesson) => sum + lesson.items.length, 0),
        },
      ];
    })
  ) as Record<JlptLevel, { lessonCount: number; vocabCount: number }>;

  const aggregateRows = filteredLessons
    .flatMap((lesson) =>
      lesson.items.map((item) => ({
        id: item.id,
        topic: lesson.title,
        level: lesson.jlptLevel,
        word: item.word,
        kanji: item.kanji,
        hanviet: item.hanviet,
        meaning: item.meaning,
      }))
    )
    .sort((a, b) => {
      const topicCompare = a.topic.localeCompare(b.topic, "vi", { sensitivity: "base" });
      if (topicCompare !== 0) {
        return topicCompare;
      }
      return a.word.localeCompare(b.word, "ja", { sensitivity: "base" });
    });

  const sameLevelMoveLessons = selectedLesson
    ? lessons
        .filter((lesson) => lesson.id !== selectedLesson.id && lesson.jlptLevel === selectedLevel)
        .sort((a, b) => a.title.localeCompare(b.title, "vi", { sensitivity: "base" }))
    : [];
  const crossLevelMoveLessons = selectedLesson
    ? lessons
        .filter((lesson) => lesson.id !== selectedLesson.id && lesson.jlptLevel !== selectedLevel)
        .sort((a, b) => {
          const levelCompare = JLPT_LEVELS.indexOf(a.jlptLevel) - JLPT_LEVELS.indexOf(b.jlptLevel);
          if (levelCompare !== 0) {
            return levelCompare;
          }
          return a.title.localeCompare(b.title, "vi", { sensitivity: "base" });
        })
    : [];

  const totalLessonCount = lessons.length;
  const totalWordCount = lessons.reduce((sum, lesson) => sum + lesson.items.length, 0);
  const selectedLevelWordCount = filteredLessons.reduce(
    (sum, lesson) => sum + lesson.items.length,
    0
  );
  const selectedLevelNoKanjiCount = filteredLessons.reduce(
    (sum, lesson) => sum + lesson.items.filter((item) => !(item.kanji || "").trim()).length,
    0
  );
  const approvedWordCount = aggregateRows.filter((row) => row.kanji.trim()).length;
  const activeLessonItemCount = selectedLesson?.items.length ?? 0;
  const importPreview = importHistory.slice(0, 4);
  const lessonSummaryRows = filteredLessons.map((lesson) => {
    const approved = lesson.items.filter((item) => item.kanji.trim()).length;
    return {
      id: lesson.id,
      title: lesson.title,
      count: lesson.items.length,
      approved,
      pending: lesson.items.length - approved,
      updatedAt: lesson.updatedAt,
    };
  });

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-[#f7f9fd] text-slate-800 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
      <AdminVocabScrollRestore />
      <div className="grid min-h-[calc(100vh-7rem)] xl:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="relative flex flex-col border-r border-slate-200 bg-white px-5 py-6">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-lg bg-gradient-to-br from-violet-100 to-sky-100 text-xl font-black text-violet-700">
              
            </div>
            <div>
              <p className="text-sm font-bold uppercase text-violet-700">Nihongo</p>
              <p className="text-xs text-slate-500">Learning Platform</p>
            </div>
          </div>

          <div className="mt-6 h-px bg-slate-200" />

          <p className="mt-6 text-xs font-bold uppercase tracking-wide text-slate-400">Menu chnh</p>
          <nav className="mt-3 space-y-1">
            {navItems.map((item) => (
              <SidebarLink key={item.href} {...item} />
            ))}
          </nav>

          <p className="mt-7 text-xs font-bold uppercase tracking-wide text-slate-400">Bao cao</p>
          <nav className="mt-3 space-y-1">
            {reportItems.map((item) => (
              <SidebarLink key={item.href} {...item} />
            ))}
          </nav>

          <p className="mt-7 text-xs font-bold uppercase tracking-wide text-slate-400">He thong</p>
          <nav className="mt-3 space-y-1">
            {systemItems.map((item) => (
              <SidebarLink key={item.href} {...item} />
            ))}
          </nav>

          <div className="mt-auto pt-8">
            <div className="rounded-lg border border-blue-100 bg-gradient-to-br from-blue-50 to-violet-50 p-4">
              <div className="h-24 rounded-md bg-[linear-gradient(135deg,rgba(96,165,250,0.28),rgba(167,139,250,0.18)),linear-gradient(180deg,transparent_52%,rgba(14,165,233,0.18)_52%)]" />
              <div className="mt-4 flex items-center justify-between rounded-md bg-white/80 px-3 py-3">
                <div>
                  <p className="text-xs font-bold text-slate-700">Nihongo Admin</p>
                  <p className="text-xs text-slate-500">v2.0.0</p>
                </div>
                <Moon className="h-4 w-4 text-slate-500" aria-hidden="true" />
              </div>
            </div>
          </div>
        </aside>

        <main className="min-w-0 bg-[#fbfcff] px-6 py-5">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Quan ly tu vung Admin</h1>
              <div className="mt-2 flex items-center gap-2 text-xs font-semibold text-slate-500">
                <Link href="/admin" className="hover:text-blue-600">
                  Dashboard
                </Link>
                <span>/</span>
                <Link href="/admin/vocab" className="hover:text-blue-600">
                  Tu vung
                </Link>
                <span>/</span>
                <span className="text-slate-700">Quan ly tu vung</span>
              </div>
            </div>

            <div className="flex min-w-[320px] flex-1 items-center justify-end gap-3">
              <label className="relative hidden w-full max-w-[330px] md:block">
                <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  aria-label="Tim kiem nhanh"
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-4 pr-10 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
                  placeholder="Tim kiem nhanh..."
                />
              </label>
              <button
                type="button"
                className="relative grid h-10 w-10 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600"
                aria-label="Thong bao"
              >
                <Bell className="h-4 w-4" aria-hidden="true" />
                <span className="absolute right-2 top-1.5 h-2 w-2 rounded-full bg-rose-500" />
              </button>
              <button
                type="button"
                className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600"
                aria-label="Tro giup"
              >
                <CircleQuestionMark className="h-4 w-4" aria-hidden="true" />
              </button>
              <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-blue-50 text-sm font-bold text-blue-600">
                  A
                </span>
                <div className="hidden sm:block">
                  <p className="text-sm font-bold text-slate-800">Admin</p>
                  <p className="text-xs text-slate-500">Super Admin</p>
                </div>
                <ChevronDown className="h-4 w-4 text-slate-400" aria-hidden="true" />
              </div>
            </div>
          </header>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {JLPT_LEVELS.map((level) => (
                <Link
                  key={level}
                  href={levelHref(level, selectedLesson?.id ?? null, activeSection)}
                  className={`rounded-lg border px-3 py-2 text-sm font-bold ${levelStyle(
                    level,
                    selectedLevel
                  )}`}
                >
                  {level} <span className="font-semibold">({levelStats[level].vocabCount})</span>
                </Link>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={sectionHref({ section: "lesson", level: selectedLevel, lessonId: selectedLesson?.id ?? null })}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-violet-300 bg-white px-4 text-sm font-bold text-violet-700 hover:bg-violet-50"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Tao lesson
              </Link>
              <Link
                href={sectionHref({ section: "import", level: selectedLevel, lessonId: selectedLesson?.id ?? null })}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-blue-600 bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700"
              >
                <CloudUpload className="h-4 w-4" aria-hidden="true" />
                Import nhanh
              </Link>
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={BookOpen}
              label="So lesson"
              value={formatNumber(totalLessonCount)}
              hint={`+${formatNumber(filteredLessons.length)} lesson ${selectedLevel}`}
              tone="violet"
            />
            <StatCard
              icon={Database}
              label="Taong so tu"
              value={formatNumber(totalWordCount)}
              hint={`+${formatNumber(selectedLevelWordCount)} t ${selectedLevel}`}
              tone="blue"
            />
            <StatCard
              icon={CloudUpload}
              label="Import gan day"
              value={latestImport ? "Thanh cong" : "Chua co"}
              hint={latestImport ? formatDateTime(latestImport.createdAt) : "Chua co du lieu"}
              tone="emerald"
            />
            <StatCard
              icon={Hourglass}
              label="Tu cho xu ly"
              value={formatNumber(selectedLevelNoKanjiCount)}
              hint="Can kiem tra"
              tone="amber"
            />
          </div>

          <section className="mt-5 rounded-lg border border-slate-200 bg-white p-4 shadow-[0_8px_26px_rgba(15,23,42,0.05)]">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Chuyen den tung trang chuc nang
                </p>
                <h2 className="text-lg font-bold text-slate-900">{activeSectionConfig.label}</h2>
                <p className="text-sm text-slate-500">{activeSectionConfig.description}</p>
              </div>
              <span className="inline-flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700">
                <ActiveSectionIcon className="h-4 w-4" aria-hidden="true" />
                {selectedLevel}
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {SECTION_CONFIG.map((section) => {
                const Icon = section.icon;
                const isActive = section.key === activeSection;
                return (
                  <Link
                    key={section.key}
                    href={sectionHref({
                      section: section.key,
                      level: selectedLevel,
                      lessonId: selectedLesson?.id ?? null,
                    })}
                    className={`rounded-lg border px-3 py-3 transition ${
                      isActive
                        ? "border-blue-300 bg-blue-50 text-blue-900"
                        : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`grid h-8 w-8 place-items-center rounded-md ${
                          isActive ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <p className="text-sm font-bold">{section.label}</p>
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs text-slate-500">{section.description}</p>
                  </Link>
                );
              })}
            </div>
          </section>
          {showOverview ? (
            <section className="mt-4 rounded-lg border border-blue-200 bg-blue-50/60 p-4 text-sm text-blue-900">
              Chon mot muc o tren de vao trang chuc nang rieng. Giao dien da tach theo tung muc de de quan ly.
            </section>
          ) : null}
          {showOverview || showLessonSection ? (
            <section className="mt-4 rounded-lg border border-slate-200 bg-white p-4 shadow-[0_8px_26px_rgba(15,23,42,0.05)]">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Quan ly chu de tu vung
                  </p>
                  <h3 className="text-lg font-bold text-slate-900">
                    {selectedLevel}: {formatNumber(filteredLessons.length)} chu de
                  </h3>
                  <p className="text-sm text-slate-500">
                    Bam vao tung chu de de vao trang lesson va quan ly danh sach tu.
                  </p>
                </div>
                {!showLessonSection ? (
                  <Link
                    href={sectionHref({
                      section: "lesson",
                      level: selectedLevel,
                      lessonId: selectedLesson?.id ?? null,
                    })}
                    className="inline-flex h-10 items-center gap-2 rounded-lg border border-violet-300 bg-white px-4 text-sm font-bold text-violet-700 hover:bg-violet-50"
                  >
                    <BookOpen className="h-4 w-4" aria-hidden="true" />
                    Mo trang lesson
                  </Link>
                ) : null}
              </div>

              {filteredLessons.length === 0 ? (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                  Chua co chu de nao o {selectedLevel}. Hay tao lesson moi.
                </p>
              ) : (
                <div className="max-h-56 overflow-y-auto rounded-md border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-wrap gap-2">
                    {filteredLessons.map((lesson) => (
                      <Link
                        key={`topic-${lesson.id}`}
                        href={sectionHref({
                          section: "lesson",
                          level: selectedLevel,
                          lessonId: lesson.id,
                        })}
                        className={`rounded-md border px-3 py-2 text-sm font-semibold leading-tight ${
                          selectedLesson?.id === lesson.id
                            ? "border-blue-300 bg-blue-100 text-blue-800"
                            : "border-slate-300 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50"
                        }`}
                      >
                        {lesson.title}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </section>
          ) : null}
          {showImportSection || showLessonSection || showHistorySection ? (
            <div className="mt-5 grid gap-4 xl:grid-cols-2">
            {showImportSection ? (
            <section
              id="import-json"
              className="rounded-lg border border-slate-200 bg-white p-4 shadow-[0_8px_26px_rgba(15,23,42,0.05)]"
            >
              <SectionHeader
                number={1}
                title="Import JSON vao lesson"
                description="Dan JSON tu danh sach tu hoac list de import vao lesson hien tai."
              />
              <AdminVocabLessonBundleImportForm defaultJlptLevel={selectedLevel} />
            </section>
            ) : null}

            {showLessonSection ? (
            <section
              id="create-lesson"
              className="rounded-lg border border-slate-200 bg-white p-4 shadow-[0_8px_26px_rgba(15,23,42,0.05)]"
            >
              <SectionHeader
                number={2}
                title="Thong tin lesson"
                action={
                  selectedLesson ? (
                    <form action={deleteAdminVocabLessonAction}>
                      <input type="hidden" name="lessonId" value={selectedLesson.id} />
                      <button
                        type="submit"
                        className="grid h-8 w-8 place-items-center rounded-md border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100"
                        aria-label="Xoa lesson"
                        title="Xoa lesson"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </form>
                  ) : null
                }
              />

              {selectedLesson ? (
                <form action={updateAdminVocabLessonAction} className="space-y-4">
                  <input type="hidden" name="lessonId" value={selectedLesson.id} />
                  <label className="block">
                    <span className="text-xs font-bold text-slate-600">Ten lesson</span>
                    <input
                      name="title"
                      defaultValue={selectedLesson.title}
                      className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
                      maxLength={64}
                      required
                    />
                  </label>
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="block">
                      <span className="text-xs font-bold text-slate-600">Cap do JLPT</span>
                      <select
                        name="jlptLevel"
                        defaultValue={selectedLesson.jlptLevel}
                        className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
                      >
                        {JLPT_LEVELS.map((level) => (
                          <option key={level} value={level}>
                            {level}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-xs font-bold text-slate-600">Category</span>
                      <select className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-50">
                        <option>Taong hop</option>
                        <option>Giao tiep</option>
                        <option>Doi song</option>
                      </select>
                    </label>
                  </div>
                  <label className="block">
                    <span className="text-xs font-bold text-slate-600">Mo ta</span>
                    <textarea
                      name="description"
                      defaultValue={selectedLesson.description}
                      className="mt-1 min-h-20 w-full resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
                      maxLength={180}
                    />
                  </label>
                  <div>
                    <p className="text-xs font-bold text-slate-600">Tags</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {["co ban", "giao tip", selectedLevel.toLowerCase()].map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700"
                        >
                          {tag}
                          <ChevronDown className="h-3 w-3 -rotate-90" aria-hidden="true" />
                        </span>
                      ))}
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-gradient-to-r from-blue-600 to-violet-600 px-4 text-sm font-bold text-white"
                  >
                    <Check className="h-4 w-4" aria-hidden="true" />
                    Luu thong tin
                  </button>
                </form>
              ) : (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                  Chua co lesson no  {selectedLevel}. Tao lesson moi de bat dau.
                </p>
              )}

              <form action={createAdminVocabLessonAction} className="mt-4 grid gap-2 border-t border-slate-100 pt-4">
                <input type="hidden" name="jlptLevel" value={selectedLevel} />
                <label className="block">
                  <span className="text-xs font-bold text-slate-600">Tao lesson nhanh</span>
                  <div className="mt-1 flex gap-2">
                    <input
                      name="title"
                      placeholder={`${selectedLevel} - Tu vung co ban 01`}
                      className="h-10 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
                      maxLength={64}
                    />
                    <button
                      type="submit"
                      className="inline-flex h-10 items-center gap-2 rounded-md border border-violet-300 bg-white px-3 text-sm font-bold text-violet-700 hover:bg-violet-50"
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      Tao
                    </button>
                  </div>
                </label>
              </form>

              {filteredLessons.length > 0 ? (
                <div className="mt-4 max-h-44 overflow-y-auto rounded-md border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-wrap gap-2">
                  {filteredLessons.map((lesson) => (
                    <Link
                      key={lesson.id}
                      href={levelHref(selectedLevel, lesson.id, activeSection)}
                      className={`rounded-md border px-3 py-2 text-sm font-semibold leading-tight ${
                        selectedLesson?.id === lesson.id
                          ? "border-blue-300 bg-blue-100 text-blue-800"
                          : "border-slate-300 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50"
                      }`}
                    >
                      {lesson.title}
                    </Link>
                  ))}
                  </div>
                </div>
              ) : null}
            </section>
            ) : null}

            {showHistorySection ? (
            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-[0_8px_26px_rgba(15,23,42,0.05)]">
              <SectionHeader
                number={3}
                title="Lich su import JSON"
                description="Xem cac lan import gan day va trang thai xu ly."
                action={
                  <span className="text-xs font-bold text-blue-600">
                    {formatNumber(importHistory.length)} lan
                  </span>
                }
              />

              {importPreview.length === 0 ? (
                <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  Chua co lich su import.
                </p>
              ) : (
                <div
                  className="max-h-[276px] overflow-y-auto pr-1"
                  data-scroll-restore-key="admin-vocab-import-history"
                >
                  {importPreview.map((entry) => (
                    <article
                      key={entry.id}
                      className="flex items-center gap-3 border-b border-slate-100 py-3 last:border-b-0"
                    >
                      <span
                        className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border ${
                          entry.rolledBackAt
                            ? "border-slate-200 bg-slate-50 text-slate-500"
                            : "border-emerald-200 bg-emerald-50 text-emerald-600"
                        }`}
                      >
                        {entry.rolledBackAt ? (
                          <Hourglass className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <Check className="h-4 w-4" aria-hidden="true" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-slate-800">
                          {entry.source === "bundle" ? "Import nhieu lesson" : "Import vao lesson"}
                        </p>
                        <p className="text-xs text-slate-500">
                          {formatNumber(entry.importedRows)} tu - {formatDateTime(entry.createdAt)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <StatusBadge tone={entry.rolledBackAt ? "slate" : "green"}>
                          {entry.rolledBackAt ? "Hoan tac" : "Hoan tat import"}
                        </StatusBadge>
                        {!entry.rolledBackAt ? (
                          <form action={rollbackAdminVocabImportAction}>
                            <input type="hidden" name="entryId" value={entry.id} />
                            <button
                              type="submit"
                              className="rounded-md border border-orange-200 bg-orange-50 px-2 py-1 text-xs font-bold text-orange-700"
                            >
                              Hoan tac
                            </button>
                          </form>
                        ) : null}
                        <form action={deleteAdminVocabImportHistoryAction}>
                          <input type="hidden" name="entryId" value={entry.id} />
                          <button
                            type="submit"
                            className="grid h-8 w-8 place-items-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50"
                            aria-label="Xoa log import"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </form>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
            ) : null}

            {showImportSection ? (
            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-[0_8px_26px_rgba(15,23,42,0.05)]">
              <SectionHeader
                number={4}
                title="Nhap tu vung vao lesson"
                description="Nhap danh sach tu JSON hoac text de them vao lesson hien tai."
              />
              {selectedLesson ? (
                <AdminVocabImportForm lessonId={selectedLesson.id} />
              ) : (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                  Chon hoac tao lesson de nhap tu.
                </p>
              )}
            </section>
            ) : null}
            </div>
          ) : null}

          {showSyncSection ? (
          <section className="mt-4 rounded-lg border border-slate-200 bg-white p-4 shadow-[0_8px_26px_rgba(15,23,42,0.05)]">
            <SectionHeader
              number={5}
              title="Sync tu URL / API"
              description="Dong bo tu vung tu nguon du lieu ben ngoai."
            />
            <AdminVocabSyncForm lessonId={selectedLesson?.id ?? null} />
          </section>
          ) : null}

          {showItemsSection && selectedLesson ? (
            <section className="mt-4 rounded-lg border border-slate-200 bg-white p-4 shadow-[0_8px_26px_rgba(15,23,42,0.05)]">
              <SectionHeader
                number={6}
                title={`Danh sach tu (${formatNumber(activeLessonItemCount)})`}
                description="Quan ly, chinh sua va phan loai tu vung."
                action={
                  <form action={clearAdminVocabLessonAction}>
                    <input type="hidden" name="lessonId" value={selectedLesson.id} />
                    <button
                      type="submit"
                      className="inline-flex h-9 items-center gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 text-xs font-bold text-rose-700 hover:bg-rose-100"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                      Xoa tat ca
                    </button>
                  </form>
                }
              />

              <div className="mb-3 flex flex-wrap items-center gap-3">
                <select className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600">
                  <option>Tat ca category</option>
                  <option>{selectedLesson.title}</option>
                </select>
                <label className="relative min-w-[220px] flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    className="h-9 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
                    placeholder="Tim kiem tu, reading, kanji..."
                  />
                </label>
                <button
                  type="button"
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600"
                >
                  <Funnel className="h-4 w-4" aria-hidden="true" />
                  Bo loc nang cao
                </button>
              </div>

              <AdminVocabItemsTable
                items={items}
                selectedLevel={selectedLevel}
                selectedLessonId={selectedLesson.id}
                sameLevelMoveLessons={sameLevelMoveLessons}
                crossLevelMoveLessons={crossLevelMoveLessons}
              />
            </section>
          ) : null}
          {showItemsSection && !selectedLesson ? (
            <section className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
              Chua co lesson trong {selectedLevel}. Hay tao lesson truoc khi quan ly danh sach tu.
            </section>
          ) : null}

          {showReportsSection ? (
          <section
            id="summary"
            className="mt-4 rounded-lg border border-slate-200 bg-white p-4 shadow-[0_8px_26px_rgba(15,23,42,0.05)]"
          >
            <SectionHeader
                number={7}
                title="Tong hop tu vung theo chu de"
                description="Thong ke va tong hop tu vung theo chu de, category."
              action={
                <div className="flex flex-wrap items-center gap-2">
                  <form action="/admin/vocab/print" method="get" target="_blank" className="flex items-center gap-1.5">
                    <input type="hidden" name="level" value={selectedLevel} />
                    <select
                      name="lesson"
                      defaultValue={selectedLesson?.id ?? ""}
                      className="h-9 min-w-[180px] rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700"
                    >
                      {selectedLesson ? <option value="">In toan bo {selectedLevel}</option> : null}
                      {filteredLessons.map((lesson) => (
                        <option key={`print-${lesson.id}`} value={lesson.id}>
                          {lesson.title}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      className="inline-flex h-9 items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-700"
                    >
                      <Download className="h-4 w-4" aria-hidden="true" />
                      In PDF theo chu de
                    </button>
                  </form>

                  <form action="/api/vocab-library" method="get" className="flex items-center gap-1.5">
                    <input type="hidden" name="download" value="1" />
                    <input type="hidden" name="level" value={selectedLevel} />
                    <select
                      name="lesson"
                      defaultValue={selectedLesson?.id ?? ""}
                      className="h-9 min-w-[180px] rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700"
                    >
                      {selectedLesson ? <option value="">Xuat toan bo {selectedLevel}</option> : null}
                      {filteredLessons.map((lesson) => (
                        <option key={`json-${lesson.id}`} value={lesson.id}>
                          {lesson.title}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      className="inline-flex h-9 items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-700"
                    >
                      <Download className="h-4 w-4" aria-hidden="true" />
                      Xuat JSON theo chu de
                    </button>
                  </form>

                  <Link
                    href={buildVocabJsonHref("ALL")}
                    className="inline-flex h-9 items-center gap-2 rounded-md border border-violet-200 bg-violet-50 px-3 text-xs font-bold text-violet-700"
                  >
                    <Download className="h-4 w-4" aria-hidden="true" />
                    Xuat JSON tat ca
                  </Link>

                  <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1">
                    {JLPT_LEVELS.map((level) => (
                      <Link
                        key={`json-export-${level}`}
                        href={buildVocabJsonHref(level)}
                        className={`inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] font-black transition ${
                          level === selectedLevel
                            ? "border-blue-200 bg-blue-100 text-blue-800"
                            : "border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:text-blue-700"
                        }`}
                        title={`Xuat JSON rieng ${level}`}
                      >
                        <Download className="h-3.5 w-3.5" aria-hidden="true" />
                        {level}
                      </Link>
                    ))}
                  </div>
                </div>
              }
            />

            <div className="overflow-hidden rounded-lg border border-slate-200">
              <div className="max-h-[360px] overflow-auto">
                <table className="min-w-[980px] w-full border-collapse text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="border-b border-slate-200 px-4 py-3 text-left">Chu de / Category</th>
                      <th className="border-b border-slate-200 px-4 py-3 text-right">So tu</th>
                      <th className="border-b border-slate-200 px-4 py-3 text-right">Da duyet</th>
                      <th className="border-b border-slate-200 px-4 py-3 text-right">ChDa duyet</th>
                      <th className="border-b border-slate-200 px-4 py-3 text-center">Dang hieu luc</th>
                      <th className="border-b border-slate-200 px-4 py-3 text-left">Cap nhat cuoi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lessonSummaryRows.length === 0 ? (
                      <tr>
                        <td className="px-4 py-6 text-center text-slate-500" colSpan={6}>
                          Chua co du lieu tu vung o {selectedLevel}.
                        </td>
                      </tr>
                    ) : (
                      lessonSummaryRows.map((row) => (
                        <tr key={row.id} className="border-b border-slate-100 last:border-b-0">
                          <td className="px-4 py-3 font-semibold text-slate-700">{row.title}</td>
                          <td className="px-4 py-3 text-right text-slate-700">{formatNumber(row.count)}</td>
                          <td className="px-4 py-3 text-right text-slate-700">{formatNumber(row.approved)}</td>
                          <td className="px-4 py-3 text-right text-slate-700">{formatNumber(row.pending)}</td>
                          <td className="px-4 py-3 text-center">
                            <StatusBadge tone={row.pending > 0 ? "orange" : "green"}>
                              {row.pending > 0 ? "Cho dong bo" : "Dang hieu luc"}
                            </StatusBadge>
                          </td>
                          <td className="px-4 py-3 text-slate-500">{formatDateTime(row.updatedAt)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  <tfoot className="bg-slate-50 font-bold text-slate-700">
                    <tr>
                      <td className="px-4 py-3">Tong cong</td>
                      <td className="px-4 py-3 text-right">{formatNumber(aggregateRows.length)}</td>
                      <td className="px-4 py-3 text-right">{formatNumber(approvedWordCount)}</td>
                      <td className="px-4 py-3 text-right">{formatNumber(selectedLevelNoKanjiCount)}</td>
                      <td className="px-4 py-3 text-center">-</td>
                      <td className="px-4 py-3">-</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </section>
          ) : null}
        </main>
      </div>
    </section>
  );
}


