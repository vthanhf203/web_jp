import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BookOpenText,
  ChartNoAxesColumn,
  Languages,
  Search,
  Sparkles,
  Target,
} from "lucide-react";

import { getCurrentUser } from "@/lib/auth";

type HighlightItem = {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
};

type TrackItem = {
  href: string;
  title: string;
  subtitle: string;
  image: string;
  label: string;
  fit?: "cover" | "contain";
};

const highlights: HighlightItem[] = [
  {
    icon: Sparkles,
    title: "Kanji thông minh",
    body: "Tra nghĩa, On/Kun, nét viết và học theo đúng nhịp JLPT.",
  },
  {
    icon: BookOpenText,
    title: "Từ vựng theo chủ đề",
    body: "N5 đến N1 theo nhóm rõ ràng, luyện flashcard dễ nhớ hơn.",
  },
  {
    icon: Languages,
    title: "Ngữ pháp dễ hiểu",
    body: "Vào bài trước, mở chi tiết sau, bố cục gọn để không rối mắt.",
  },
  {
    icon: ChartNoAxesColumn,
    title: "Tiến độ rõ ràng",
    body: "Theo dõi XP, streak và mục tiêu để giữ động lực mỗi ngày.",
  },
];

const studyTracks: TrackItem[] = [
  {
    href: "/kanji",
    title: "Kanji Studio",
    subtitle: "Tập trung nét viết + ghi nhớ theo cụm",
    image: "/images/kanji-logo.png",
    label: "KANJI",
    fit: "contain",
  },
  {
    href: "/vocab",
    title: "Vocab Flow",
    subtitle: "Học theo chủ đề, sát đề thi",
    image: "/images/home-vocab.png",
    label: "VOCABULARY",
  },
  {
    href: "/grammar",
    title: "Grammar Map",
    subtitle: "Nhập vào bài, xem mẫu câu theo logic",
    image: "/images/home-grammar.png",
    label: "GRAMMAR",
  },
];

const routine = [
  "7 phút ôn lại bài đã học",
  "10 phút học chủ đề mới",
  "8 phút luyện flashcard để nhớ sâu",
];

function initialsFromName(name: string): string {
  const tokens = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (!tokens.length) {
    return "JP";
  }
  return tokens.map((token) => token[0]?.toUpperCase() ?? "").join("");
}

export default async function Home() {
  const user = await getCurrentUser();
  const initials = user ? initialsFromName(user.name) : "JP";

  return (
    <section className="space-y-6 lg:space-y-7">
      <section className="panel motion-rise overflow-hidden p-4 sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="space-y-1.5">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
              Nihongo Home
            </p>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-[2rem]">
              Học có nhịp, nhớ lâu, vào đề là học được ngay
            </h1>
          </div>

          <div className="flex w-full flex-col gap-3 sm:flex-row xl:w-auto xl:items-center">
            <label className="flex w-full items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 shadow-[0_8px_24px_rgba(15,23,42,0.08)] sm:max-w-[380px] xl:w-[380px]">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                readOnly
                value="Tìm bài học, từ vựng, ngữ pháp..."
                className="w-full border-0 bg-transparent text-sm text-slate-500 outline-none"
                aria-label="Thanh tìm kiếm"
              />
              <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-bold text-slate-400">
                ⌘K
              </span>
            </label>

            {user ? (
              <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-sky-100 to-teal-100 text-xs font-extrabold text-slate-700">
                  {initials}
                </span>
                <div className="leading-tight">
                  <p className="text-sm font-bold text-slate-800">{user.name}</p>
                  <p className="text-xs text-slate-500">
                    {user.level} • {user.xp} XP • {user.streak} ngày
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link href="/login" className="btn-soft text-sm">
                  Đăng nhập
                </Link>
                <Link href="/register" className="btn-primary text-sm">
                  Tạo tài khoản
                </Link>
              </div>
            )}
          </div>
        </div>
      </section>

      <article className="relative isolate overflow-hidden rounded-[1.7rem] border border-slate-200 bg-slate-900/80 shadow-[0_24px_54px_rgba(15,23,42,0.24)]">
        <Image
          src="https://images.unsplash.com/photo-1492571350019-22de08371fd3?auto=format&fit=crop&w=2200&q=80"
          alt="Phong cảnh Nhật Bản"
          fill
          priority
          sizes="(max-width: 1024px) 100vw, 1200px"
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/80 via-slate-900/52 to-slate-900/22" />
        <div className="relative z-10 flex min-h-[360px] flex-col justify-center px-5 py-7 sm:px-8 lg:min-h-[390px] lg:px-10">
          <p className="inline-flex w-fit items-center gap-2 rounded-full border border-white/40 bg-white/15 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-slate-100 backdrop-blur">
            <Target className="h-3.5 w-3.5" />
            Không gian học JLPT
          </p>
          <h2 className="mt-4 max-w-2xl text-4xl font-black leading-[1.12] tracking-tight text-white sm:text-5xl">
            Học có nhịp, nhớ lâu, vào đề là học được ngay
          </h2>
          <p className="mt-4 max-w-2xl text-base text-slate-200 sm:text-lg">
            Từ Kanji đến ngữ pháp, mỗi phần đều được sắp lại để bạn học nhanh nhưng vẫn chắc.
            Giao diện gọn, dễ dùng cả trên máy tính và điện thoại.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href={user ? "/dashboard" : "/register"} className="btn-primary">
              {user ? "Tiếp tục học" : "Bắt đầu miễn phí"}
            </Link>
            <Link href="/kanji" className="btn-soft-dark">
              Khám phá thư viện
            </Link>
          </div>
        </div>
      </article>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {highlights.map((item) => (
          <article
            key={item.title}
            className="panel motion-rise rounded-2xl border border-slate-200/95 bg-white/95 p-5"
          >
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-sky-200 bg-sky-50 text-sky-700">
              <item.icon className="h-5 w-5" />
            </span>
            <h3 className="mt-3 text-[1.06rem] font-extrabold text-slate-800">{item.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.body}</p>
            <span className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-sky-700">
              Xem thêm <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </article>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {studyTracks.map((track) => (
          <Link
            key={track.title}
            href={track.href}
            className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.14)]"
          >
            <div className="relative h-[190px] overflow-hidden">
              <Image
                src={track.image}
                alt={track.title}
                fill
                sizes="(max-width: 1024px) 100vw, 33vw"
                className={`transition duration-500 group-hover:scale-105 ${
                  track.fit === "contain"
                    ? "bg-gradient-to-b from-amber-50 to-slate-100 object-contain p-4"
                    : "object-cover"
                }`}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900/62 via-slate-900/10 to-transparent" />
              <span className="absolute right-3 top-3 rounded-full border border-white/40 bg-white/20 px-2.5 py-1 text-[11px] font-extrabold tracking-[0.14em] text-white backdrop-blur">
                {track.label}
              </span>
            </div>
            <div className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-2xl font-black tracking-tight text-slate-900">{track.title}</h3>
                  <p className="mt-1 text-sm text-slate-600">{track.subtitle}</p>
                </div>
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-700">
                  <ArrowRight className="h-4 w-4" />
                </span>
              </div>
            </div>
          </Link>
        ))}
      </section>

      <section className="panel motion-rise rounded-2xl p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="chip">Routine 25 phút</p>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-900">
              Nhịp học để giữ đến cuối tuần
            </h2>
          </div>
          <Link href="/dashboard" className="btn-soft">
            Mở bảng học
          </Link>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {routine.map((step, index) => (
            <article
              key={step}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-[0_8px_20px_rgba(15,23,42,0.08)]"
            >
              <p className="flex items-center gap-2 text-sm font-bold text-slate-500">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-cyan-600 text-xs font-black text-white">
                  {index + 1}
                </span>
                Bước {index + 1}
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-700">{step}</p>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
