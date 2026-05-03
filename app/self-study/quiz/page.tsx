import Link from "next/link";
import { ChevronLeft, Layers3, Trash2 } from "lucide-react";

import { deleteSelfStudyQuizDeckAction } from "@/app/actions/self-study-quiz";
import { SelfStudyQuizSessionForm } from "@/app/components/self-study-quiz-session-form";
import { isAdminEmail } from "@/lib/admin";
import { requireUser } from "@/lib/auth";
import { getKanjiMetadataMap, loadAdminKanjiMetadata } from "@/lib/kanji-metadata";
import { prisma } from "@/lib/prisma";

type SearchParams = Promise<{
  score?: string | string[];
  total?: string | string[];
  status?: string | string[];
  category?: string | string[];
}>;

const SELF_STUDY_PREFIX = "SELF::";

function pickSingle(value?: string | string[]): string {
  if (!value) {
    return "";
  }
  return Array.isArray(value) ? value[0] ?? "" : value;
}

function shuffle<T>(list: T[]): T[] {
  const output = [...list];
  for (let i = output.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [output[i], output[j]] = [output[j], output[i]];
  }
  return output;
}

function toDeckLabel(category: string): string {
  return category.startsWith(SELF_STUDY_PREFIX) ? category.slice(SELF_STUDY_PREFIX.length) : category;
}

function getCorrectOptionText(question: {
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctOption: string;
}): string {
  if (question.correctOption === "A") {
    return question.optionA;
  }
  if (question.correctOption === "B") {
    return question.optionB;
  }
  if (question.correctOption === "C") {
    return question.optionC;
  }
  return question.optionD;
}

function extractFirstKanji(text: string): string {
  return text.match(/[\u3400-\u9fff]/)?.[0] ?? "";
}

export default async function SelfStudyQuizPage(props: { searchParams: SearchParams }) {
  const user = await requireUser();
  const isAdmin = isAdminEmail(user.email);
  const params = await props.searchParams;

  const score = pickSingle(params.score).trim();
  const total = pickSingle(params.total).trim();
  const status = pickSingle(params.status).trim();
  const requestedCategory = pickSingle(params.category).trim();

  const categories = await prisma.quizQuestion.groupBy({
    by: ["category"],
    where: {
      category: {
        startsWith: SELF_STUDY_PREFIX,
      },
    },
    _count: {
      _all: true,
    },
    orderBy: {
      category: "asc",
    },
  });

  const selectedCategory =
    requestedCategory && categories.some((item) => item.category === requestedCategory)
      ? requestedCategory
      : categories[0]?.category ?? "";

  const sourceQuestions = selectedCategory
    ? await prisma.quizQuestion.findMany({
        where: { category: selectedCategory },
        orderBy: [{ level: "asc" }, { createdAt: "desc" }],
        select: {
          id: true,
          level: true,
          category: true,
          prompt: true,
          optionA: true,
          optionB: true,
          optionC: true,
          optionD: true,
          correctOption: true,
          explanation: true,
        },
      })
    : [];
  const metadataMap =
    sourceQuestions.length > 0
      ? getKanjiMetadataMap(await loadAdminKanjiMetadata())
      : new Map();
  const questions = shuffle(
    sourceQuestions.map((question) => {
      const kanji = extractFirstKanji(getCorrectOptionText(question));
      const radical = kanji ? metadataMap.get(kanji)?.radical ?? null : null;

      return {
        ...question,
        radical: radical
          ? {
              symbol: radical.symbol,
              name: radical.name,
              meaning: radical.meaning,
              position: radical.position,
            }
          : null,
      };
    })
  );

  return (
    <section className="mx-auto max-w-[1180px] space-y-5 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            href="/self-study"
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[#dce3f5] bg-white text-[#4458df] shadow-[0_10px_24px_rgba(17,24,57,0.06)] transition hover:bg-[#f7f9ff]"
            aria-label="Quay lai Tu hoc"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div>
            <p className="text-xs font-bold uppercase text-[#6672c7]">
              Self-study quiz
            </p>
            <h1 className="mt-1 text-2xl font-black text-[#101735]">On cau hoi JSON da import</h1>
          </div>
        </div>
        <div className="inline-flex items-center gap-2 rounded-2xl border border-[#e0e6f6] bg-white px-4 py-3 text-sm font-extrabold text-[#26345f] shadow-[0_10px_26px_rgba(17,24,57,0.06)]">
          <Layers3 className="h-5 w-5 text-[#12a98e]" />
          {categories.length} bo quiz
        </div>
      </div>

      {score && total ? (
        <div className="rounded-2xl border border-[#b9eddc] bg-[#f0fff9] px-4 py-3 text-sm font-semibold text-[#117d65]">
          Ket qua vua roi: <strong>{score}</strong> / <strong>{total}</strong>
        </div>
      ) : null}

      {status === "empty" ? (
        <div className="rounded-2xl border border-[#f7d9a8] bg-[#fff8ec] px-4 py-3 text-sm font-semibold text-[#946326]">
          Ban chua chon dap an nao.
        </div>
      ) : null}

      {categories.length > 0 ? (
        <div className="rounded-[22px] border border-[#dfe6f8] bg-white p-3 shadow-[0_16px_36px_rgba(17,24,57,0.06)]">
          <div className="flex flex-wrap gap-2">
            {categories.map((item) => {
              const active = item.category === selectedCategory;
              return (
                <div
                  key={item.category}
                  className={`flex items-center overflow-hidden rounded-2xl border transition ${
                    active
                      ? "border-[#4458df] bg-[#f2f4ff] text-[#4458df] shadow-[0_10px_22px_rgba(68,88,223,0.14)]"
                      : "border-transparent bg-[#f7f9ff] text-[#64708c] hover:bg-[#eef3ff]"
                  }`}
                >
                  <Link
                    href={`/self-study/quiz?category=${encodeURIComponent(item.category)}`}
                    className="px-4 py-2 text-sm font-extrabold"
                  >
                    {toDeckLabel(item.category)} ({item._count._all})
                  </Link>
                  {isAdmin ? (
                    <form action={deleteSelfStudyQuizDeckAction} className="border-l border-white/80">
                      <input type="hidden" name="category" value={item.category} />
                      <input type="hidden" name="returnTo" value="/self-study/quiz" />
                      <button
                        type="submit"
                        className="grid h-9 w-9 place-items-center text-rose-600 transition hover:bg-rose-50"
                        aria-label={`Xoa bo quiz ${toDeckLabel(item.category)}`}
                        title="Xoa bo quiz"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </form>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {questions.length === 0 ? (
        <div className="rounded-[24px] border border-[#dfe6f8] bg-white p-6 text-sm font-semibold text-[#64708c] shadow-[0_16px_36px_rgba(17,24,57,0.06)]">
          Chua co bo quiz tu hoc nao. Admin vao <Link href="/self-study" className="font-extrabold text-[#4458df]">/self-study</Link> de import JSON.
        </div>
      ) : (
        <div>
          <SelfStudyQuizSessionForm questions={questions} category={selectedCategory} />
        </div>
      )}
    </section>
  );
}
