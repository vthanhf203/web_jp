"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BookOpenText,
  Briefcase,
  Bus,
  Coffee,
  Flower2,
  HelpCircle,
  Home,
  MapPin,
  Plus,
  School,
  Trophy,
  type LucideIcon,
} from "lucide-react";

import type { JlptLevel } from "@/lib/admin-vocab-library";

type LevelDockItem = {
  level: JlptLevel;
  jpLabel: string;
  hint: string;
  lessonCount: number;
  vocabCount: number;
  href: string;
  active: boolean;
};

type LessonBentoItem = {
  id: string;
  title: string;
  description: string;
  wordCount: number;
  href: string;
  completionPercent: number;
};

type Props = {
  selectedLevel: JlptLevel;
  completionPercent: number;
  completedTopicCount: number;
  totalTopicCount: number;
  levels: LevelDockItem[];
  lessons: LessonBentoItem[];
};

type Accent = "violet" | "sky" | "rose" | "amber" | "mint";

const accentMeta: Record<
  Accent,
  {
    badgeClass: string;
    iconClass: string;
    cardClass: string;
    progressClass: string;
    tag: string;
  }
> = {
  violet: {
    badgeClass: "bg-[#f1edff] text-[#755cf5]",
    iconClass: "from-[#755cf5] to-[#b79dff] text-white",
    cardClass: "border-[#e8e2ff] hover:border-[#cfc2ff]",
    progressClass: "from-[#765cf5] to-[#b79dff]",
    tag: "VOCAB",
  },
  sky: {
    badgeClass: "bg-[#eaf7ff] text-[#209be4]",
    iconClass: "from-[#35a8f4] to-[#8dddff] text-white",
    cardClass: "border-[#d8f0ff] hover:border-[#aee0ff]",
    progressClass: "from-[#35a8f4] to-[#7fdcff]",
    tag: "VERB",
  },
  rose: {
    badgeClass: "bg-[#fff0f6] text-[#f0629b]",
    iconClass: "from-[#ff74a7] to-[#ffc1d8] text-white",
    cardClass: "border-[#ffe0ec] hover:border-[#ffc6dc]",
    progressClass: "from-[#ff74a7] to-[#ffc1d8]",
    tag: "LIFE",
  },
  amber: {
    badgeClass: "bg-[#fff4df] text-[#e28a10]",
    iconClass: "from-[#ffad32] to-[#ffd080] text-white",
    cardClass: "border-[#ffe7bd] hover:border-[#ffd58c]",
    progressClass: "from-[#ffad32] to-[#ffd080]",
    tag: "TIME",
  },
  mint: {
    badgeClass: "bg-[#ebfbf3] text-[#20a56c]",
    iconClass: "from-[#28c78b] to-[#8ef0c5] text-white",
    cardClass: "border-[#d5f5e6] hover:border-[#aeeecf]",
    progressClass: "from-[#28c78b] to-[#8ef0c5]",
    tag: "LIFE",
  },
};

const containerVariants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.08,
    },
  },
} as const;

const itemVariants = {
  hidden: { opacity: 0, y: 12, scale: 0.99 },
  show: { opacity: 1, y: 0, scale: 1 },
} as const;

function detectAccent(title: string, description: string, index: number): Accent {
  const source = `${title} ${description}`.toLowerCase();
  if (source.includes("động từ") || source.includes("dong tu") || source.includes("verb")) {
    return "sky";
  }
  if (
    source.includes("số đếm") ||
    source.includes("so dem") ||
    source.includes("ngày") ||
    source.includes("ngay") ||
    source.includes("giờ") ||
    source.includes("gio") ||
    source.includes("time")
  ) {
    return "amber";
  }
  if (
    source.includes("gia đình") ||
    source.includes("gia dinh") ||
    source.includes("nhà") ||
    source.includes("nha") ||
    source.includes("sức khỏe") ||
    source.includes("suc khoe") ||
    source.includes("đời sống") ||
    source.includes("doi song")
  ) {
    return "mint";
  }
  if (source.includes("ăn") || source.includes("an ") || source.includes("đồ") || source.includes("do ")) {
    return "rose";
  }
  const cycle: Accent[] = ["violet", "sky", "rose", "amber", "mint"];
  return cycle[index % cycle.length] ?? "violet";
}

function pickIcon(title: string, description: string): LucideIcon {
  const source = `${title} ${description}`.toLowerCase();
  if (source.includes("trường") || source.includes("truong") || source.includes("học")) {
    return School;
  }
  if (source.includes("nghề") || source.includes("nghe") || source.includes("công việc")) {
    return Briefcase;
  }
  if (source.includes("địa điểm") || source.includes("dia diem") || source.includes("phương hướng")) {
    return MapPin;
  }
  if (source.includes("giao thông") || source.includes("di chuyển") || source.includes("di chuyen")) {
    return Bus;
  }
  if (source.includes("nhà") || source.includes("nha") || source.includes("gia đình")) {
    return Home;
  }
  if (source.includes("ăn") || source.includes("an ") || source.includes("uống") || source.includes("uong")) {
    return Coffee;
  }
  if (source.includes("hỏi") || source.includes("hoi") || source.includes("mẫu câu")) {
    return HelpCircle;
  }
  return BookOpenText;
}

function MiniProgress({ percent, accent }: { percent: number; accent: Accent }) {
  const safePercent = Math.max(0, Math.min(100, percent));

  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-black text-[#79809d]">{safePercent}%</span>
      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-[#edf0f8]">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${accentMeta[accent].progressClass}`}
          style={{ width: `${safePercent}%` }}
        />
      </div>
    </div>
  );
}

export function VocabLibraryBento({
  selectedLevel,
  completionPercent,
  completedTopicCount,
  totalTopicCount,
  levels,
  lessons,
}: Props) {
  const clampedCompletion = Math.max(0, Math.min(100, completionPercent));

  return (
    <div className="space-y-5">
      <div className="rounded-[28px] border border-[#e8e9f6] bg-white/90 p-2 shadow-[0_16px_38px_rgba(38,42,94,0.08)] backdrop-blur">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          {levels.map((item) => (
            <Link
              key={item.level}
              href={item.href}
              title={item.jpLabel}
              className={`relative overflow-hidden rounded-[22px] border px-4 py-3 text-center transition hover:-translate-y-0.5 ${
                item.active
                  ? "border-[#d6c7ff] bg-gradient-to-br from-[#f1e9ff] to-[#ffffff] text-[#6c55ef] shadow-[0_14px_24px_rgba(111,86,239,0.16)]"
                  : "border-[#eef0f7] bg-white text-[#7a809b] hover:border-[#dcdcff] hover:bg-[#fbfaff]"
              }`}
            >
              {item.active ? (
                <div className="pointer-events-none absolute -right-4 -top-5 h-16 w-16 rounded-full bg-[#d9caff]/50" />
              ) : null}
              <div className="relative">
                <p className="text-sm font-black">{item.level}</p>
                <p className="mt-0.5 text-[10px] font-black uppercase">{item.hint}</p>
                <p className="mt-1 text-[11px] font-bold">{item.lessonCount} bài học</p>
                <p className="text-[10px] font-semibold opacity-75">{item.vocabCount} từ</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <header className="relative overflow-hidden rounded-[26px] border border-[#e7e2ff] bg-white p-5 shadow-[0_18px_42px_rgba(38,42,94,0.09)] sm:p-6">
        <Image
          src="/images/home-vocab.png"
          alt=""
          fill
          sizes="(min-width: 1024px) 920px, 100vw"
          className="object-cover object-right opacity-55"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-r from-white via-white/90 to-white/20" />
        <div className="absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-[#fff0f6]/60 to-transparent" />

        <div className="relative max-w-2xl">
          <p className="text-xs font-black uppercase text-[#6c55ef]">Fresh Bento Vocabulary</p>
          <h2 className="mt-1 text-5xl font-black leading-none text-[#171934] sm:text-6xl">
            JLPT {selectedLevel}
          </h2>
          <p className="mt-3 max-w-xl text-sm font-medium text-[#69708d]">
            Bố cục bento card-based sáng, thoáng và dễ theo dõi tiến độ học từng chủ đề.
          </p>

          <div className="mt-5 max-w-xl rounded-2xl border border-[#e7e9f7] bg-white/82 p-3 shadow-[0_10px_24px_rgba(79,84,128,0.08)] backdrop-blur">
            <div className="mb-2 flex items-center justify-between text-xs font-bold text-[#69708d]">
              <span>Đã hoàn thành: {completedTopicCount}/{totalTopicCount || 0} chủ đề</span>
              <span>{clampedCompletion}%</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-[#e8ebf5]">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${clampedCompletion}%` }}
                transition={{ duration: 0.85, ease: "easeOut" }}
                className="h-full rounded-full bg-gradient-to-r from-[#7b5cf2] via-[#8bd8ff] to-[#ff9cc2] shadow-[0_0_18px_rgba(123,92,242,0.35)]"
              />
            </div>
          </div>
        </div>
      </header>

      {lessons.length === 0 ? (
        <div className="rounded-[24px] border border-[#ffe3b0] bg-[#fff8eb] p-6 text-sm font-bold text-[#a76a0d] shadow-[0_14px_30px_rgba(167,106,13,0.08)]">
          Chưa có chủ đề nào trong cấp độ này. Bạn có thể thêm dữ liệu tại /admin/vocab.
        </div>
      ) : (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
        >
          {lessons.map((lesson, index) => {
            const accent = detectAccent(lesson.title, lesson.description, index);
            const accentStyle = accentMeta[accent];
            const Icon = pickIcon(lesson.title, lesson.description);

            return (
              <motion.article
                key={lesson.id}
                variants={itemVariants}
                whileHover={{ y: -3 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              >
                <Link
                  href={lesson.href}
                  className={`group block min-h-[142px] rounded-[22px] border bg-white p-4 shadow-[0_12px_28px_rgba(40,45,110,0.07)] transition hover:shadow-[0_18px_34px_rgba(40,45,110,0.12)] ${accentStyle.cardClass}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${accentStyle.badgeClass}`}>
                      {accentStyle.tag}
                    </span>
                    <MiniProgress percent={lesson.completionPercent} accent={accent} />
                  </div>

                  <div className="mt-3 flex gap-3">
                    <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br shadow-[0_10px_20px_rgba(68,72,130,0.14)] ${accentStyle.iconClass}`}>
                      <Icon className="h-6 w-6" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="line-clamp-2 text-base font-black leading-snug text-[#171934]">
                        {lesson.title}
                      </h3>
                      <p className="mt-1 line-clamp-1 text-xs font-semibold text-[#8187a2]">
                        {lesson.description}
                      </p>
                      <p className="mt-2 text-xs font-black text-[#555d7e]">{lesson.wordCount} từ vựng</p>
                    </div>
                  </div>

                  <div className="mt-4 flex justify-end">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e4e7f5] bg-[#fbfbff] px-3 py-1.5 text-xs font-black text-[#6c55ef] transition group-hover:border-[#cfc2ff] group-hover:bg-[#f3efff]">
                      Mở chủ đề
                      <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                    </span>
                  </div>
                </Link>
              </motion.article>
            );
          })}

          <motion.article
            variants={itemVariants}
            whileHover={{ y: -3 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            <Link
              href="/vocab?mode=self"
              className="grid min-h-[142px] place-items-center rounded-[22px] border border-dashed border-[#d9caff] bg-[#fffaff] p-5 text-center shadow-[0_12px_28px_rgba(40,45,110,0.05)] transition hover:border-[#bda9ff] hover:bg-[#f7f2ff]"
            >
              <span className="grid h-12 w-12 place-items-center rounded-full bg-white text-[#755cf5] shadow-[0_12px_24px_rgba(117,92,245,0.16)]">
                <Plus className="h-6 w-6" />
              </span>
              <div className="mt-3">
                <p className="text-sm font-black text-[#6c55ef]">Tạo chủ đề mới</p>
                <p className="mt-1 text-xs font-semibold text-[#8a8fab]">
                  Tự tạo chủ đề theo ý thích.
                </p>
              </div>
            </Link>
          </motion.article>
        </motion.div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-[22px] border border-[#e8e9f6] bg-white p-4 shadow-[0_12px_28px_rgba(40,45,110,0.06)]">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#f1edff] text-[#755cf5]">
              <Trophy className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-black text-[#171934]">Mẹo nhỏ</p>
              <p className="mt-0.5 text-xs font-semibold text-[#7a809b]">
                Học mỗi ngày một chút, tiến bộ mỗi ngày một nhiều.
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-[22px] border border-[#ffe0ec] bg-[#fff7fb] p-4 shadow-[0_12px_28px_rgba(40,45,110,0.05)]">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-white text-[#fb6fa7]">
              <Flower2 className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-black text-[#171934]">Gợi ý học</p>
              <p className="mt-0.5 text-xs font-semibold text-[#7a809b]">
                Chọn một chủ đề, ôn flashcard rồi kiểm tra nhanh bằng quiz.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
