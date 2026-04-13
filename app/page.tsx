import Link from "next/link";

import { getCurrentUser } from "@/lib/auth";

const highlights = [
  {
    title: "Kanji thong minh",
    body: "Tra nghia, On/Kun, tim theo net ve va vao flashcard ngay.",
  },
  {
    title: "Tu vung theo chu de",
    body: "N5-N1 theo nhom, hoc nhanh bang flashcard, quiz va nhoi nhet.",
  },
  {
    title: "Ngu phap de hieu",
    body: "Xem tung mau cau, vi du va ghi chu theo bai, khong roi mat.",
  },
  {
    title: "SRS giu nhip hoc",
    body: "Them vao deck, on dung han, theo doi XP va streak moi ngay.",
  },
];

export default async function Home() {
  const user = await getCurrentUser();

  return (
    <section className="space-y-6">
      <div className="floating-card rounded-3xl border border-blue-100/80 bg-gradient-to-br from-white/95 via-white/92 to-sky-50/90 p-7 lg:p-9">
        <div className="grid gap-7 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <p className="chip">Nhat ky hoc tap ca nhan hoa</p>
            <h1 className="mt-4 text-4xl font-extrabold leading-tight text-slate-900 sm:text-5xl">
              Hoc tieng Nhat <span className="text-grad-brand">de deu, de nho, de tien bo</span>
            </h1>
            <p className="mt-4 max-w-2xl text-base text-slate-600 sm:text-lg">
              JP Lab giup ban hoc Kanji, tu vung, ngu phap theo luong ro rang. Moi thao tac deu
              toi uu de ban mo vao la muon hoc ngay.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href={user ? "/dashboard" : "/register"} className="btn-primary">
                {user ? "Vao bang dieu khien" : "Bat dau hoc ngay"}
              </Link>
              <Link href="/kanji" className="btn-soft">
                Kham pha Kanji
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-blue-100 bg-white/85 p-5 shadow-[0_12px_30px_rgba(24,75,146,0.12)]">
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-blue-700">Lo trinh goi y</p>
            <div className="mt-4 space-y-3 text-sm">
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-2">
                1. Chon Kanji va them vao deck
              </div>
              <div className="rounded-xl border border-sky-100 bg-sky-50/70 px-3 py-2">
                2. Hoc tu vung theo chu de N5-N1
              </div>
              <div className="rounded-xl border border-violet-100 bg-violet-50/70 px-3 py-2">
                3. Lam quiz de khoa kien thuc
              </div>
              <div className="rounded-xl border border-amber-100 bg-amber-50/70 px-3 py-2">
                4. On SRS 20-30 phut moi ngay
              </div>
            </div>
            <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Meo: hoc it nhung deu, uu tien xem va nghe phat am moi ngay.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {highlights.map((item) => (
          <article key={item.title} className="panel p-5">
            <h2 className="text-xl font-bold text-slate-800">{item.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

