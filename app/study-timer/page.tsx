import Link from "next/link";

import { StudyTimerClient } from "@/app/components/study-timer-client";
import { requireUser } from "@/lib/auth";
import { loadUserPersonalState } from "@/lib/user-personal-data";

function clampMinutes(value: number): number {
  return Math.max(1, Math.min(120, Math.round(value)));
}

export default async function StudyTimerPage() {
  const user = await requireUser();
  const personalState = await loadUserPersonalState(user.id);

  const plan = personalState.plan;
  const planMinutes = plan?.manualMinutes && plan.manualMinutes > 0 ? plan.manualMinutes : plan?.dailyMinutes ?? 25;
  const defaultMinutes = clampMinutes(planMinutes);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Bấm giờ học</h1>
          <p className="text-sm text-slate-600">Bắt đầu một phiên học tập trung để giữ nhịp học N5/N4 mỗi ngày.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/personal#deadline-board" className="btn-soft text-sm">
            Về deadline
          </Link>
          <Link href="/kanji?scope=personal" className="btn-primary text-sm">
            Vào flashcard
          </Link>
        </div>
      </div>

      <StudyTimerClient defaultMinutes={defaultMinutes} />
    </section>
  );
}
