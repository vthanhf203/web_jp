import Link from "next/link";

import {
  clearAdminQuizQuestionsAction,
  deleteAdminQuizQuestionAction,
} from "@/app/actions/admin-quiz";
import { AdminNav } from "@/app/components/admin-nav";
import { AdminQuizImportForm } from "@/app/components/admin-quiz-import-form";
import { requireAdmin } from "@/lib/admin";
import { JLPT_LEVELS, normalizeJlptLevel, type JlptLevel } from "@/lib/admin-vocab-library";
import { prisma } from "@/lib/prisma";

type SearchParams = Promise<{
  level?: string | string[];
  category?: string | string[];
}>;

function pickSingle(value?: string | string[]): string {
  if (!value) {
    return "";
  }
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value;
}

function levelStyle(level: JlptLevel, active: JlptLevel): string {
  if (level !== active) {
    return "border-slate-200 bg-white text-slate-700 hover:bg-slate-50";
  }
  if (level === "N5") {
    return "border-emerald-300 bg-emerald-100 text-emerald-800";
  }
  if (level === "N4") {
    return "border-blue-300 bg-blue-100 text-blue-800";
  }
  if (level === "N3") {
    return "border-amber-300 bg-amber-100 text-amber-800";
  }
  if (level === "N2") {
    return "border-orange-300 bg-orange-100 text-orange-800";
  }
  return "border-rose-300 bg-rose-100 text-rose-800";
}

function levelHref(level: JlptLevel, category = ""): string {
  const query = new URLSearchParams();
  query.set("level", level);
  if (category.trim()) {
    query.set("category", category.trim());
  }
  return `/admin/quiz?${query.toString()}`;
}

export default async function AdminQuizPage(props: { searchParams: SearchParams }) {
  await requireAdmin();

  const params = await props.searchParams;
  const selectedLevel = normalizeJlptLevel(pickSingle(params.level));
  const selectedCategory = pickSingle(params.category).trim();

  const [countsByLevel, categoriesRaw, questionList] = await Promise.all([
    Promise.all(
      JLPT_LEVELS.map(async (level) => [
        level,
        await prisma.quizQuestion.count({
          where: { level },
        }),
      ])
    ),
    prisma.quizQuestion.groupBy({
      by: ["category"],
      where: { level: selectedLevel },
      _count: {
        _all: true,
      },
      orderBy: {
        category: "asc",
      },
    }),
    prisma.quizQuestion.findMany({
      where: selectedCategory
        ? {
            level: selectedLevel,
            category: selectedCategory,
          }
        : {
            level: selectedLevel,
          },
      orderBy: [{ createdAt: "desc" }],
      take: 240,
    }),
  ]);

  const countMap = Object.fromEntries(countsByLevel) as Record<JlptLevel, number>;
  const categories = categoriesRaw
    .map((entry) => ({
      category: entry.category,
      count: entry._count._all,
    }))
    .filter((entry) => entry.category.trim().length > 0);

  return (
    <section className="space-y-6 rounded-3xl border border-sky-100 bg-[#d8e5f7] p-6 shadow-[0_8px_28px_rgba(28,78,140,0.08)] [background-image:linear-gradient(rgba(255,255,255,0.3)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.3)_1px,transparent_1px)] [background-size:30px_30px]">
      <div className="rounded-2xl border border-slate-200 bg-white/95 p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-slate-800">Admin bai tap</h1>
            <p className="mt-1 text-sm text-slate-600">
              Upload va quan ly bo cau hoi quiz de hoc vien luyen tap va thi thu.
            </p>
          </div>
          <Link href="/quiz" className="btn-soft">
            Xem trang quiz
          </Link>
        </div>

        <div className="mt-4">
          <AdminNav active="quiz" />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {JLPT_LEVELS.map((level) => (
            <Link
              key={level}
              href={levelHref(level)}
              className={`rounded-xl border px-4 py-2 text-sm font-semibold transition ${levelStyle(level, selectedLevel)}`}
            >
              {level} ({countMap[level]})
            </Link>
          ))}
        </div>

        {categories.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={levelHref(selectedLevel)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                !selectedCategory
                  ? "border-blue-300 bg-blue-100 text-blue-800"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              Tat ca
            </Link>
            {categories.map((entry) => (
              <Link
                key={entry.category}
                href={levelHref(selectedLevel, entry.category)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                  selectedCategory === entry.category
                    ? "border-blue-300 bg-blue-100 text-blue-800"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {entry.category} ({entry.count})
              </Link>
            ))}
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-sm">
        <h2 className="text-xl font-bold text-slate-800">Upload bai tap quiz</h2>
        <p className="mt-1 text-sm text-slate-600">
          Moi dong ho tro: level, category, prompt, optionA, optionB, optionC, optionD, correctOption, explanation.
        </p>
        <div className="mt-3">
          <AdminQuizImportForm />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-bold text-slate-800">
            Danh sach cau hoi {selectedLevel}
            {selectedCategory ? ` - ${selectedCategory}` : ""} ({questionList.length})
          </h2>
          <form action={clearAdminQuizQuestionsAction}>
            <input type="hidden" name="level" value={selectedLevel} />
            <input type="hidden" name="category" value={selectedCategory} />
            <button
              type="submit"
              className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-semibold text-rose-700 hover:bg-rose-100"
            >
              Xoa danh sach dang loc
            </button>
          </form>
        </div>

        {questionList.length === 0 ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
            Chua co bai tap nao trong bo loc nay.
          </p>
        ) : (
          <div className="mt-3 max-h-[60vh] space-y-2 overflow-y-auto pr-1">
            {questionList.map((item, index) => (
              <article key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs text-slate-500">
                      #{index + 1} - {item.level} - {item.category}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{item.prompt}</p>
                    <div className="mt-2 grid gap-1 text-sm text-slate-700 md:grid-cols-2">
                      <p>
                        A. {item.optionA} {item.correctOption === "A" ? <strong className="text-emerald-700">(Dung)</strong> : null}
                      </p>
                      <p>
                        B. {item.optionB} {item.correctOption === "B" ? <strong className="text-emerald-700">(Dung)</strong> : null}
                      </p>
                      <p>
                        C. {item.optionC} {item.correctOption === "C" ? <strong className="text-emerald-700">(Dung)</strong> : null}
                      </p>
                      <p>
                        D. {item.optionD} {item.correctOption === "D" ? <strong className="text-emerald-700">(Dung)</strong> : null}
                      </p>
                    </div>
                    {item.explanation ? (
                      <p className="mt-2 rounded-lg bg-white px-3 py-2 text-xs text-slate-600">
                        Giai thich: {item.explanation}
                      </p>
                    ) : null}
                  </div>
                  <form action={deleteAdminQuizQuestionAction}>
                    <input type="hidden" name="questionId" value={item.id} />
                    <input type="hidden" name="level" value={selectedLevel} />
                    <button
                      type="submit"
                      className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                    >
                      Xoa
                    </button>
                  </form>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

