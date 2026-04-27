"use client";

import Link from "next/link";

type Props = {
  backHref: string;
};

export function WorksheetPrintToolbar({ backHref }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => window.print()}
        className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white transition hover:bg-emerald-500"
      >
        In / Save PDF
      </button>
      <Link
        href={backHref}
        className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-700 transition hover:bg-slate-50"
      >
        Quay lại chinh sua
      </Link>
    </div>
  );
}
