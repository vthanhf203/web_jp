"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { saveSubjectColorAction } from "@/app/actions/personal";

type SubjectColorPickerProps = {
  subject: string;
  initialColor: string;
};

export function SubjectColorPicker({ subject, initialColor }: SubjectColorPickerProps) {
  const router = useRouter();
  const [color, setColor] = useState(initialColor);
  const [isSaving, startSaving] = useTransition();

  return (
    <div className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1">
      <input
        type="color"
        value={color}
        onChange={(event) => {
          const next = event.currentTarget.value;
          const previous = color;
          setColor(next);

          startSaving(async () => {
            try {
              const formData = new FormData();
              formData.set("subject", subject);
              formData.set("color", next);
              await saveSubjectColorAction(formData);
              router.refresh();
            } catch {
              setColor(previous);
            }
          });
        }}
        className={`h-6 w-6 cursor-pointer rounded border border-slate-200 bg-transparent p-0 ${isSaving ? "opacity-70" : ""}`}
        title={`Chọn màu cho ${subject}`}
        aria-label={`Chọn màu cho ${subject}`}
      />
      <span className="max-w-[92px] truncate text-[11px] font-bold text-slate-700" title={subject}>
        {subject}
      </span>
      {isSaving ? <span className="text-[10px] font-black text-indigo-600">...</span> : null}
    </div>
  );
}
