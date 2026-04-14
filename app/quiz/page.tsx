import Link from "next/link";

import { QuizSessionForm } from "@/app/components/quiz-session-form";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

type SearchParams = Promise<{
  score?: string | string[];
  total?: string | string[];
  status?: string | string[];
  exam?: string | string[];
  minutes?: string | string[];
  ids?: string | string[];
  source?: string | string[];
}>;

function pickSingle(param?: string | string[]): string {
  if (!param) {
    return "";
  }
  return Array.isArray(param) ? param[0] ?? "" : param;
}

function toNumber(value: string, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed;
}

function shuffle<T>(list: T[]): T[] {
  const output = [...list];
  for (let i = output.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [output[i], output[j]] = [output[j], output[i]];
  }
  return output;
}

function parseQuestionIds(raw: string): string[] {
  if (!raw.trim()) {
    return [];
  }
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

export default async function QuizPage(props: { searchParams: SearchParams }) {
  await requireUser();
  const params = await props.searchParams;

  const score = pickSingle(params.score);
  const total = pickSingle(params.total);
  const status = pickSingle(params.status);
  const source = pickSingle(params.source);

  const examMode = ["1", "true", "yes", "on"].includes(pickSingle(params.exam).toLowerCase());
  const examMinutes = Math.min(60, Math.max(5, Math.round(toNumber(pickSingle(params.minutes), 20))));

  const ids = parseQuestionIds(pickSingle(params.ids));

  const sourceQuestions = ids.length
    ? await prisma.quizQuestion.findMany({
        where: { id: { in: ids } },
      })
    : await prisma.quizQuestion.findMany();

  const baseCount = examMode ? 20 : 5;
  const targetCount = ids.length > 0 ? Math.min(40, Math.max(5, ids.length)) : baseCount;
  const questions = shuffle(sourceQuestions).slice(0, targetCount);

  return (
    <section className="space-y-5">
      <div className="panel p-6">
        <h1 className="text-2xl font-bold text-slate-900">
          {examMode ? "Thi thu JLPT mini" : "Quiz JLPT mini"}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {examMode
            ? `Che do thi thu ${examMinutes} phut, het gio se tu dong nop bai.`
            : "Moi cau dung nhan 2 XP. Lam nhanh de giu nhip moi ngay."}
        </p>
        {source === "focus" ? (
          <p className="mt-2 text-xs text-rose-600">Dang lam bo cau sai trong diem.</p>
        ) : null}
      </div>

      {score && total ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Ket qua vua roi: <strong>{score}</strong> / <strong>{total}</strong>
        </div>
      ) : null}

      {status === "empty" ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Ban chua chon dap an nao.
        </div>
      ) : null}

      {questions.length === 0 ? (
        <div className="panel p-6 text-sm text-slate-600">
          Chua co du lieu quiz. Admin vao <Link href="/admin/quiz" className="font-semibold text-sky-700">/admin/quiz</Link> de upload bai tap.
        </div>
      ) : (
        <QuizSessionForm questions={questions} examMode={examMode} examMinutes={examMinutes} />
      )}
    </section>
  );
}

