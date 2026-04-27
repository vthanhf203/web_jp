import Image from "next/image";
import Link from "next/link";

import { getCurrentUser } from "@/lib/auth";

const highlights = [
  {
    icon: "漢",
    title: "Kanji thông minh",
    body: "Tra nghĩa, On/Kun, vẽ nét tìm chữ và học theo từng cấp độ JLPT.",
  },
  {
    icon: "📚",
    title: "Từ vựng theo chủ đề",
    body: "N5-N1 theo nhóm rõ ràng, học nhanh bằng flashcard và luyện nhớ chủ động.",
  },
  {
    icon: "📝",
    title: "Ngữ pháp dễ hiểu",
    body: "Vào bài trước, mở chi tiết sau, bố cục gọn để không rối mắt.",
  },
  {
    icon: "🏆",
    title: "Tiến độ rõ ràng",
    body: "Theo dõi XP, streak và cấp độ mục tiêu để giữ động lực học mỗi ngày.",
  },
];

const studyTracks = [
  {
    href: "/kanji",
    title: "Kanji Studio",
    subtitle: "Tập trung nét vẽ + ghi nhớ hình",
    image: "/images/kanji-logo.png",
    fit: "contain",
    label: "KANJI",
  },
  {
    href: "/vocab",
    title: "Vocab Flow",
    subtitle: "Học theo chủ đề, sát dụng đề thi",
    image: "/images/home-vocab.png",
    fit: "contain",
    label: "VOCABULARY",
  },
  {
    href: "/grammar",
    title: "Grammar Map",
    subtitle: "Nhập vào bài, xem mẫu câu theo logic",
    image: "/images/home-grammar.png",
    fit: "contain",
    label: "GRAMMAR",
  },
];

const routine = [
  "7 phút ôn lại bài đã học",
  "10 phút học chủ đề mới",
  "8 phút luyện flashcard để nhớ sâu",
];

export default async function Home() {
  const user = await getCurrentUser();

  return (
    <section className="space-y-7">
      <article className="hero-shell motion-rise">
        <Image
          src="https://images.unsplash.com/photo-1492571350019-22de08371fd3?auto=format&fit=crop&w=2000&q=80"
          alt="Bàn học tiếng Nhật với sổ tay và bút"
          fill
          priority
          sizes="(max-width: 1024px) 100vw, 1200px"
          className="hero-media"
        />
        <div className="hero-overlay" />
        <div className="hero-content">
          <p className="chip hero-badge">Không gian học JLPT</p>
          <h1 className="hero-title mt-4 max-w-2xl text-white">
            Học có nhịp, nhớ lâu, vào đề là học được ngay
          </h1>
          <p className="mt-4 max-w-2xl text-base text-slate-200 sm:text-lg">
            Từ Kanji đến ngữ pháp, mỗi phần đều được sắp lại để bạn học nhanh nhưng vẫn chắc.
            Giao diện gọn, dễ dùng cả trên máy tính và điện thoại.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href={user ? "/dashboard" : "/register"} className="btn-primary">
              {user ? "Tiếp tục hôm nay" : "Bắt đầu miễn phí"}
            </Link>
            <Link href="/vocab" className="btn-soft-dark">
              Vào thư viện từ vựng
            </Link>
          </div>
        </div>
      </article>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {highlights.map((item) => (
          <article key={item.title} className="panel feature-card motion-rise p-5">
            <span className="feature-icon" aria-hidden>
              {item.icon}
            </span>
            <h2 className="mt-2 text-[1.08rem] font-bold text-slate-800">{item.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.body}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {studyTracks.map((track) => (
          <Link
            key={track.title}
            href={track.href}
            className={`photo-tile module-card motion-rise group overflow-hidden border border-slate-200 ${
              track.fit === "contain" ? "poster-tile" : ""
            }`}
          >
            <div className="photo-frame">
              <span className="module-badge">{track.label}</span>
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
            <p className="chip">Routine 25 phút</p>
            <h2 className="mt-3 text-3xl font-bold text-slate-800">Nhịp học để giữ đến cuối tuần</h2>
          </div>
          <Link href="/dashboard" className="btn-soft">
            Mở bảng học
          </Link>
        </div>
        <div className="relative mt-5">
          <div className="routine-connector hidden md:block" />
          <div className="grid gap-3 md:grid-cols-3">
            {routine.map((step, index) => (
              <div key={step} className="routine-step">
                <span className="routine-step-badge">{index + 1}</span>
                <p className="text-sm font-semibold text-slate-700">{step}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </section>
  );
}

