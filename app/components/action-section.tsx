import Link from "next/link";
import { Brain, Flame, Library, Sparkles } from "lucide-react";

type ActionSectionProps = {
  title?: string;
  subtitle?: string;
  flashcardHref: string;
  quizHref: string;
  recallHref: string;
};

export function ActionSection({
  title = "Bắt đầu học chủ đề này",
  subtitle = "Action Hub - chọn nhanh 1 chế độ học.",
  flashcardHref,
  quizHref,
  recallHref,
}: ActionSectionProps) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-extrabold tracking-tight text-slate-900">{title}</h2>
        <span className="inline-flex items-center gap-1 rounded-full bg-violet-100/70 px-3 py-1 text-xs font-semibold text-violet-700">
          <Sparkles className="h-3.5 w-3.5" />
          {subtitle}
        </span>
      </div>

      <div className="relative overflow-hidden rounded-[1.25rem] bg-white/85 p-2 shadow-sm ring-1 ring-slate-200/60 backdrop-blur-md">
        <div className="pointer-events-none absolute -left-12 top-0 h-20 w-32 rounded-full bg-sky-200/35 blur-2xl" />
        <div className="pointer-events-none absolute -right-8 bottom-0 h-20 w-28 rounded-full bg-fuchsia-200/30 blur-2xl" />
        <div className="relative grid gap-2 sm:grid-cols-3">
          <Link
            href={flashcardHref}
            className="group inline-flex items-center justify-center gap-2 rounded-xl border border-sky-200/60 bg-gradient-to-r from-sky-400/25 to-indigo-500/20 px-4 py-3 text-sm font-bold text-slate-800 shadow-[0_6px_16px_rgba(56,189,248,0.18)] transition hover:-translate-y-0.5 hover:shadow-[0_10px_20px_rgba(56,189,248,0.28)]"
          >
            <Library className="h-4 w-4 text-sky-700 transition group-hover:scale-110" />
            Flashcard
          </Link>
          <Link
            href={quizHref}
            className="group inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200/60 bg-gradient-to-r from-emerald-400/25 to-cyan-500/20 px-4 py-3 text-sm font-bold text-slate-800 shadow-[0_6px_16px_rgba(16,185,129,0.18)] transition hover:-translate-y-0.5 hover:shadow-[0_10px_20px_rgba(16,185,129,0.3)]"
          >
            <Brain className="h-4 w-4 text-emerald-700 transition group-hover:scale-110" />
            Trắc nghiệm
          </Link>
          <Link
            href={recallHref}
            className="group inline-flex items-center justify-center gap-2 rounded-xl border border-amber-200/60 bg-gradient-to-r from-amber-400/25 to-orange-500/20 px-4 py-3 text-sm font-bold text-slate-800 shadow-[0_6px_16px_rgba(249,115,22,0.18)] transition hover:-translate-y-0.5 hover:shadow-[0_10px_20px_rgba(249,115,22,0.3)]"
          >
            <Flame className="h-4 w-4 text-orange-700 transition group-hover:scale-110" />
            Nhồi nhét
          </Link>
        </div>
      </div>
    </section>
  );
}
