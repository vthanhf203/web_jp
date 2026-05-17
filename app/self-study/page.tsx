import Link from "next/link";
import type { ReactNode } from "react";
import {
  BookOpenText,
  BrainCircuit,
  ChevronRight,
  FileText,
  Headphones,
  LibraryBig,
  Sparkles,
} from "lucide-react";

import { requireUser } from "@/lib/auth";
import { loadListeningPracticeStore } from "@/lib/listening-practice-store";
import { prisma } from "@/lib/prisma";
import { loadReadingPracticeStore } from "@/lib/reading-practice-store";
import { loadUserKanjiStore } from "@/lib/user-kanji-store";
import { loadUserVocabStore } from "@/lib/vocab-store";

const SELF_STUDY_PREFIX = "SELF::";

function StudyCard({
  href,
  title,
  description,
  accent,
  stat,
  icon,
}: {
  href: string;
  title: string;
  description: string;
  accent: string;
  stat: string;
  icon: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group rounded-[24px] border border-[#d8e2ee] bg-white p-5 shadow-[0_18px_42px_rgba(20,47,80,0.08)] transition hover:-translate-y-1 hover:shadow-[0_24px_48px_rgba(20,47,80,0.12)]"
    >
      <div className="flex items-start justify-between gap-4">
        <span className={`grid h-12 w-12 place-items-center rounded-2xl ${accent}`}>{icon}</span>
        <span className="grid h-10 w-10 place-items-center rounded-full border border-[#d8e2ee] text-[#64748b] transition group-hover:border-[#123c69] group-hover:text-[#123c69]">
          <ChevronRight className="h-5 w-5" />
        </span>
      </div>
      <h2 className="mt-5 text-2xl font-black text-[#111827]">{title}</h2>
      <p className="mt-2 min-h-12 text-sm leading-6 text-[#667085]">{description}</p>
      <p className="mt-5 rounded-2xl border border-[#edf1f6] bg-[#f8fafc] px-4 py-3 text-sm font-black text-[#263750]">
        {stat}
      </p>
    </Link>
  );
}

export default async function SelfStudyPage() {
  const user = await requireUser();

  const [userKanjiStore, vocabStore, readingStore, listeningStore, selfStudyQuizQuestionCount] =
    await Promise.all([
      loadUserKanjiStore(user.id),
      loadUserVocabStore(user.id),
      loadReadingPracticeStore(user.id),
      loadListeningPracticeStore(user.id),
      prisma.quizQuestion.count({
        where: {
          category: {
            startsWith: SELF_STUDY_PREFIX,
          },
        },
      }),
    ]);

  const totalVocabItems = vocabStore.lessons.reduce((sum, lesson) => sum + lesson.items.length, 0);
  const totalReadingWords = readingStore.items.reduce((sum, item) => sum + item.vocabulary.length, 0);
  const totalListeningQuestions = listeningStore.items.reduce((sum, item) => sum + item.questions.length, 0);
  const totalListeningMinutes = listeningStore.items.reduce((sum, item) => sum + item.estimatedMinutes, 0);

  return (
    <section className="mx-auto max-w-[1240px] space-y-6 pb-10">
      <div className="overflow-hidden rounded-[30px] border border-[#d8e2ee] bg-white shadow-[0_20px_54px_rgba(20,47,80,0.09)]">
        <div className="grid gap-6 bg-[#f7fbff] px-6 py-7 lg:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)] lg:px-8">
          <div>
            <p className="inline-flex items-center rounded-full bg-[#e8fbf8] px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-[#108373]">
              Tu hoc chu dong
            </p>
            <h1 className="mt-4 max-w-3xl text-4xl font-black leading-tight text-[#111827] md:text-5xl">
              Moi ky nang mot man hinh rieng
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[#667085]">
              Chon dung muc ban muon luyen de man hinh hoc rong hon, de quan sat hon va it roi hon.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <div className="rounded-2xl border border-[#d8e2ee] bg-white px-4 py-3">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#64748b]">Kanji</p>
              <p className="mt-1 text-2xl font-black text-[#111827]">{userKanjiStore.items.length}</p>
            </div>
            <div className="rounded-2xl border border-[#d8e2ee] bg-white px-4 py-3">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#64748b]">Tu vung</p>
              <p className="mt-1 text-2xl font-black text-[#111827]">{totalVocabItems}</p>
            </div>
            <div className="rounded-2xl border border-[#d8e2ee] bg-white px-4 py-3">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#64748b]">Bai doc</p>
              <p className="mt-1 text-2xl font-black text-[#111827]">{readingStore.items.length}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-5">
        <StudyCard
          href="/self-study/vocab"
          title="Tu vung & Kanji"
          description="Import kho rieng, chon bai hoc, luyen flashcard va quiz Kanji ca nhan."
          stat={`${vocabStore.lessons.length} bai tu vung · ${userKanjiStore.items.length} Kanji`}
          accent="bg-[#e8fbf8] text-[#108373]"
          icon={<LibraryBig className="h-6 w-6" />}
        />
        <StudyCard
          href="/self-study/reading"
          title="Doc van ban"
          description="Luyen bai doc theo cap do, kem tu vung, ngu phap, quiz sau bai va go cau Viet -> Nhat."
          stat={`${readingStore.items.length} bai doc · ${totalReadingWords} tu vung`}
          accent="bg-[#fff3df] text-[#b45b10]"
          icon={<BookOpenText className="h-6 w-6" />}
        />
        <StudyCard
          href="/self-study/listening"
          title="Nghe chu dong"
          description="Import bai nghe bang JSON, tao audio tu script Nhat, nghe roi lam quiz hien dung noi dung."
          stat={`${listeningStore.items.length} bai nghe · ${totalListeningQuestions} cau hoi · ${totalListeningMinutes} phut`}
          accent="bg-[#e8fbf8] text-[#108373]"
          icon={<Headphones className="h-6 w-6" />}
        />
        <StudyCard
          href="/self-study/quiz"
          title="Quiz JSON"
          description="On cac bo cau hoi da import, chon bo rieng va lam bai trong mot man hinh thoang hon."
          stat={`${selfStudyQuizQuestionCount} cau hoi`}
          accent="bg-[#eef3ff] text-[#3554a8]"
          icon={<BrainCircuit className="h-6 w-6" />}
        />
        <StudyCard
          href="/kanji/personal"
          title="Thu vien Kanji"
          description="Xem lai toan bo Kanji da import, tu lien quan va trang thai du lieu ca nhan."
          stat={`${userKanjiStore.items.length} chu da luu`}
          accent="bg-[#f4ecff] text-[#6a3fc4]"
          icon={<Sparkles className="h-6 w-6" />}
        />
      </div>

      <div className="rounded-[24px] border border-[#d8e2ee] bg-white p-5 shadow-[0_18px_42px_rgba(20,47,80,0.08)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#f8fafc] text-[#123c69]">
              <FileText className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-xl font-black text-[#111827]">Luong tu hoc da tach trang</h2>
              <p className="mt-1 text-sm text-[#667085]">
                Form import nang nam trong tung trang con de trang tong khong bi chat.
              </p>
            </div>
          </div>
          <Link
            href="/self-study/reading"
            className="rounded-xl bg-[#123c69] px-4 py-2.5 text-sm font-black text-white transition hover:bg-[#0f3157]"
          >
            Mo luyen doc
          </Link>
        </div>
      </div>
    </section>
  );
}
