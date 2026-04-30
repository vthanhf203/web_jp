"use client";

import { useEffect, useState, useTransition } from "react";

import { updateDeadlineTaskAction } from "@/app/actions/personal";

export type DeadlineStatus = "pending" | "doing" | "done" | "late_done" | "skipped";

const STATUS_OPTIONS: Array<{ value: DeadlineStatus; label: string }> = [
  { value: "pending", label: "Chưa làm" },
  { value: "doing", label: "Đang làm" },
  { value: "done", label: "Đã xong" },
  { value: "late_done", label: "Xong muộn" },
  { value: "skipped", label: "Đã bỏ" },
];

const STATUS_SELECT_CLASS: Record<DeadlineStatus, string> = {
  pending: "border-slate-300 bg-white text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200",
  doing: "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-200",
  done: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200",
  late_done:
    "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-200",
  skipped: "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200",
};

type DeadlineStatusSelectProps = {
  taskId: string;
  initialStatus: DeadlineStatus;
  taskLabel: string;
};

export function DeadlineStatusSelect({ taskId, initialStatus, taskLabel }: DeadlineStatusSelectProps) {
  const [status, setStatus] = useState<DeadlineStatus>(initialStatus);
  const [isSaving, startSaving] = useTransition();

  useEffect(() => {
    setStatus(initialStatus);
  }, [initialStatus]);

  return (
    <div className="relative">
      <select
        value={status}
        onChange={(event) => {
          const nextStatus = event.currentTarget.value as DeadlineStatus;
          const previousStatus = status;
          setStatus(nextStatus);

          startSaving(async () => {
            try {
              const formData = new FormData();
              formData.set("taskId", taskId);
              formData.set("status", nextStatus);
              await updateDeadlineTaskAction(formData);
            } catch {
              setStatus(previousStatus);
            }
          });
        }}
        disabled={isSaving}
        className={`h-9 w-full appearance-none rounded-full border px-3 pr-8 text-sm font-semibold transition-colors ${STATUS_SELECT_CLASS[status]} ${isSaving ? "opacity-85" : ""}`}
        aria-label={`Trạng thái task ${taskLabel}`}
      >
        {STATUS_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm leading-none text-current"
      >
        ▾
      </span>
    </div>
  );
}
