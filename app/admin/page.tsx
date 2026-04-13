import Link from "next/link";

import { AdminNav } from "@/app/components/admin-nav";
import { requireAdmin } from "@/lib/admin";
import { loadAdminVocabLibrary } from "@/lib/admin-vocab-library";
import { loadGrammarDataset } from "@/lib/grammar-dataset";
import { prisma } from "@/lib/prisma";

export default async function AdminHomePage() {
  await requireAdmin();

  const [vocabLibrary, grammarDataset, kanjiCount] = await Promise.all([
    loadAdminVocabLibrary(),
    loadGrammarDataset(),
    prisma.kanji.count(),
  ]);

  return (
    <section className="space-y-6 rounded-3xl border border-sky-100 bg-[#d8e5f7] p-6 shadow-[0_8px_28px_rgba(28,78,140,0.08)] [background-image:linear-gradient(rgba(255,255,255,0.3)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.3)_1px,transparent_1px)] [background-size:30px_30px]">
      <div className="rounded-2xl border border-slate-200 bg-white/95 p-6 shadow-sm">
        <h1 className="text-3xl font-bold text-slate-800">Admin nội dung học</h1>
        <p className="mt-1 text-sm text-slate-600">
          Quản lý tập trung dữ liệu Từ vựng, Ngữ pháp và Kanji cho toàn bộ người dùng.
        </p>
        <div className="mt-4">
          <AdminNav active="home" />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <article className="rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-sm">
          <p className="text-sm text-slate-500">Kho từ vựng admin</p>
          <p className="mt-2 text-3xl font-bold text-slate-800">{vocabLibrary.lessons.length}</p>
          <p className="text-sm text-slate-600">nhóm</p>
          <Link href="/admin/vocab" className="btn-primary mt-4">
            Quản lý từ vựng
          </Link>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-sm">
          <p className="text-sm text-slate-500">Kho ngữ pháp</p>
          <p className="mt-2 text-3xl font-bold text-slate-800">{grammarDataset.lessonCount}</p>
          <p className="text-sm text-slate-600">bài</p>
          <Link href="/admin/grammar" className="btn-primary mt-4">
            Quản lý ngữ pháp
          </Link>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-sm">
          <p className="text-sm text-slate-500">Kho Kanji</p>
          <p className="mt-2 text-3xl font-bold text-slate-800">{kanjiCount}</p>
          <p className="text-sm text-slate-600">chữ</p>
          <Link href="/admin/kanji" className="btn-primary mt-4">
            Quản lý Kanji
          </Link>
        </article>
      </div>
    </section>
  );
}
