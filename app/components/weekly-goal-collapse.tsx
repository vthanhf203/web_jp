"use client";

import { ChevronDown } from "lucide-react";
import { type ReactNode, useState } from "react";

type WeeklyGoalCollapseProps = {
  children: ReactNode;
  closedLabel?: string;
  openLabel?: string;
  defaultOpen?: boolean;
};

export function WeeklyGoalCollapse({
  children,
  closedLabel = "Mo form muc tieu tuan",
  openLabel = "Thu gon form",
  defaultOpen = false,
}: WeeklyGoalCollapseProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs font-black text-slate-700"
        aria-expanded={open}
      >
        <span>{open ? openLabel : closedLabel}</span>
        <ChevronDown className={`h-4 w-4 text-indigo-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? <div className="border-t border-slate-100 p-3">{children}</div> : null}
    </div>
  );
}
