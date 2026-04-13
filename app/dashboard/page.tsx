import Link from "next/link";

import { SectionCard } from "@/app/components/section-card";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function DashboardPage() {
  const user = await requireUser();

  const [kanjiCount, vocabCount] = await Promise.all([prisma.kanji.count(), prisma.vocab.count()]);

  return (
    <section className="space-y-6">
      <div className="panel p-6">
        <h1 className="text-2xl font-bold text-slate-900">Xin chao {user.name}, san sang hoc chua?</h1>
        <p className="mt-1 text-slate-600">
          Day la trung tam hoc cua ban. Moi ngay 20-30 phut la du de thay tien bo ro rang.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl bg-emerald-50 p-4">
            <p className="text-sm text-slate-600">XP hien tai</p>
            <p className="mt-1 text-2xl font-bold text-emerald-700">{user.xp}</p>
          </div>
          <div className="rounded-xl bg-orange-50 p-4">
            <p className="text-sm text-slate-600">Streak</p>
            <p className="mt-1 text-2xl font-bold text-orange-700">{user.streak} ngay</p>
          </div>
          <div className="rounded-xl bg-sky-50 p-4">
            <p className="text-sm text-slate-600">Tong Kanji</p>
            <p className="mt-1 text-2xl font-bold text-sky-700">{kanjiCount}</p>
          </div>
          <div className="rounded-xl bg-violet-50 p-4">
            <p className="text-sm text-slate-600">Tong Tu vung</p>
            <p className="mt-1 text-2xl font-bold text-violet-700">{vocabCount}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <SectionCard title="Bat dau hoc nhanh" subtitle="Tap trung vao 3 phan chinh de de duy tri nhip hoc">
          <div className="grid gap-2">
            <Link className="btn-soft justify-start" href="/kanji">
              1. Hoc Kanji theo cap do
            </Link>
            <Link className="btn-soft justify-start" href="/vocab">
              2. Hoc Tu vung theo chu de
            </Link>
            <Link className="btn-primary justify-start" href="/grammar">
              3. Xem Ngu phap theo bai
            </Link>
          </div>
        </SectionCard>

        <SectionCard title="Tong quan hoc tap">
          <div className="space-y-2 text-sm text-slate-700">
            <p>
              Cap muc tieu: <strong>{user.level}</strong>
            </p>
            <p>
              Tong Kanji: <strong>{kanjiCount}</strong>
            </p>
            <p>
              Tong Tu vung: <strong>{vocabCount}</strong>
            </p>
          </div>
        </SectionCard>
      </div>
    </section>
  );
}
