import Image from "next/image";
import Link from "next/link";

import { getCurrentUser } from "@/lib/auth";

const highlights = [
  {
    title: "Kanji thong minh",
    body: "Tra nghia, On/Kun, ve net tim chu va hoc theo tung cap do JLPT.",
  },
  {
    title: "Tu vung theo chu de",
    body: "N5-N1 theo nhom ro rang, hoc nhanh bang flashcard va luyen nho chu dong.",
  },
  {
    title: "Ngu phap de hieu",
    body: "Vao bai truoc, mo chi tiet sau, bo cuc gon de khong roi mat.",
  },
  {
    title: "Tien do ro rang",
    body: "Theo doi XP, streak va cap do muc tieu de giu dong luc hoc moi ngay.",
  },
];

const studyTracks = [
  {
    href: "/kanji",
    title: "Kanji Studio",
    subtitle: "Tap trung net ve + ghi nho hinh",
    image: "/images/kanji-logo.png",
    fit: "contain",
  },
  {
    href: "/vocab",
    title: "Vocab Flow",
    subtitle: "Hoc theo chu de, sat dung de thi",
    image: "/images/home-vocab.png",
    fit: "contain",
  },
  {
    href: "/grammar",
    title: "Grammar Map",
    subtitle: "Nhap vao bai, xem mau cau theo logic",
    image: "/images/home-grammar.png",
    fit: "contain",
  },
];

const routine = [
  "7 phut on lai bai da hoc",
  "10 phut hoc chu de moi",
  "8 phut luyen flashcard de nho sau",
];

export default async function Home() {
  const user = await getCurrentUser();

  return (
    <section className="space-y-7">
      <article className="hero-shell motion-rise">
        <Image
          src="https://images.unsplash.com/photo-1492571350019-22de08371fd3?auto=format&fit=crop&w=2000&q=80"
          alt="Ban hoc tieng Nhat voi so tay va but"
          fill
          priority
          sizes="(max-width: 1024px) 100vw, 1200px"
          className="hero-media"
        />
        <div className="hero-overlay" />
        <div className="hero-content">
          <p className="chip">JLPT learning workspace</p>
          <h1 className="mt-4 max-w-2xl text-4xl font-extrabold leading-tight text-white sm:text-5xl">
            Hoc co nhip, nho lau, vao de la hoc duoc ngay
          </h1>
          <p className="mt-4 max-w-2xl text-base text-slate-200 sm:text-lg">
            Tu Kanji den ngu phap, moi phan deu duoc sap lai de ban hoc nhanh nhung van chac.
            Giao dien gon, de dung ca tren may tinh va dien thoai.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href={user ? "/dashboard" : "/register"} className="btn-primary">
              {user ? "Tiep tuc hom nay" : "Bat dau mien phi"}
            </Link>
            <Link href="/vocab" className="btn-soft-dark">
              Vao thu tu vung
            </Link>
          </div>
        </div>
      </article>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {highlights.map((item) => (
          <article key={item.title} className="panel motion-rise p-5">
            <h2 className="text-[1.08rem] font-bold text-slate-800">{item.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.body}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {studyTracks.map((track) => (
          <Link
            key={track.title}
            href={track.href}
            className={`photo-tile motion-rise group overflow-hidden border border-slate-200 ${
              track.fit === "contain" ? "poster-tile" : ""
            }`}
          >
            <div className="photo-frame">
              <Image
                src={track.image}
                alt={track.title}
                fill
                sizes="(max-width: 1024px) 100vw, 33vw"
                loading="lazy"
                className={track.fit === "contain" ? "photo-img photo-img-contain" : "photo-img"}
              />
              <div className="photo-shade" />
            </div>
            <div className="photo-copy">
              <h3 className="text-2xl font-bold text-white">{track.title}</h3>
              <p className="mt-1 text-sm text-slate-200">{track.subtitle}</p>
            </div>
          </Link>
        ))}
      </section>

      <section className="panel motion-rise p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="chip">Routine 25 phut</p>
            <h2 className="mt-3 text-3xl font-bold text-slate-800">Nhip hoc de giu den cuoi tuan</h2>
          </div>
          <Link href="/dashboard" className="btn-soft">
            Mo bang hoc
          </Link>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {routine.map((step, index) => (
            <div
              key={step}
              className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
            >
              {index + 1}. {step}
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}

