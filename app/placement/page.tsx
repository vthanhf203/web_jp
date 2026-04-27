import Link from "next/link";

import {
  applyPlacementLevelAction,
  submitPlacementTestAction,
} from "@/app/actions/personal";
import { JLPT_LEVELS, normalizeJlptLevel, type JlptLevel } from "@/lib/admin-vocab-library";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { loadUserPersonalState } from "@/lib/user-personal-data";

type SearchParams = Promise<{
  score?: string | string[];
  total?: string | string[];
  level?: string | string[];
  status?: string | string[];
}>;

function pickSingle(value?: string | string[]): string {
  if (!value) {
    return "";
  }
  return Array.isArray(value) ? value[0] ?? "" : value;
}

function toNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function shuffle<T>(list: T[]): T[] {
  const output = [...list];
  for (let i = output.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [output[i], output[j]] = [output[j], output[i]];
  }
  return output;
}

function pickQuestionsByLevel<T extends { level: string }>(questions: T[], takeTotal: number): T[] {
  const bucket = new Map<JlptLevel, T[]>();
  for (const level of JLPT_LEVELS) {
    bucket.set(level, []);
  }

  for (const question of questions) {
    const normalizedLevel = normalizeJlptLevel(question.level);
    const current = bucket.get(normalizedLevel) ?? [];
    current.push(question);
    bucket.set(normalizedLevel, current);
  }

  const picked: T[] = [];
  const basePerLevel = Math.max(1, Math.floor(takeTotal / JLPT_LEVELS.length));

  for (const level of JLPT_LEVELS) {
    const list = shuffle(bucket.get(level) ?? []).slice(0, basePerLevel);
    picked.push(...list);
  }

  if (picked.length < takeTotal) {
    const remaining = shuffle(
      questions.filter((question) => !picked.some((pickedQuestion) => (pickedQuestion as { id?: string }).id === (question as { id?: string }).id))
    ).slice(0, takeTotal - picked.length);
    picked.push(...remaining);
  }

  return shuffle(picked).slice(0, takeTotal);
}

export default async function PlacementPage(props: { searchParams: SearchParams }) {
  const user = await requireUser();
  const params = await props.searchParams;
  const score = toNumber(pickSingle(params.score));
  const total = toNumber(pickSingle(params.total));
  const level = normalizeJlptLevel(pickSingle(params.level));
  const status = pickSingle(params.status);

  const [questions, personalState] = await Promise.all([
    prisma.quizQuestion.findMany({
      select: {
        id: true,
        level: true,
        category: true,
        prompt: true,
        optionA: true,
        optionB: true,
        optionC: true,
        optionD: true,
      },
      take: 220,
      orderBy: { createdAt: "desc" },
    }),
    loadUserPersonalState(user.id),
  ]);

  const testQuestions = pickQuestionsByLevel(questions, 20);

  return (
    <section className="space-y-5">
      <div className="panel p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Kiểm tra đầu vào nhanh</h1>
            <p className="mt-1 text-sm text-slate-600">
              Làm 20 câu, hệ thống sẽ gợi ý bạn đang ở mức nào và đề xuất bài phù hợp.
            </p>
          </div>
          <Link href="/personal" className="btn-soft text-sm">
            Quay lại lộ trình
          </Link>
        </div>
      </div>

      {status === "empty" ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Bạn chưa chọn đáp án nào.
        </p>
      ) : null}

      {total > 0 ? (
        <div className="panel p-5">
          <p className="text-sm text-slate-600">Kết quả gần nhất</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">
            {score}/{total} - Gợi ý trình độ: {level}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <form action={applyPlacementLevelAction}>
              <input type="hidden" name="level" value={level} />
                <button type="submit" className="btn-primary text-sm">
                Áp dụng level {level} vào tài khoản
                </button>
              </form>
              <p className="text-xs text-slate-500">
              Level hiện tại: {user.level}
              {personalState.placement ? ` - Lần test: ${personalState.placement.createdAt.slice(0, 10)}` : ""}
              </p>
          </div>
        </div>
      ) : null}

      {testQuestions.length === 0 ? (
        <div className="panel p-6 text-sm text-slate-600">
          Chưa có dữ liệu quiz để tạo bài test đầu vào.
        </div>
      ) : (
        <form action={submitPlacementTestAction} className="space-y-4">
          {testQuestions.map((question, index) => (
            <article key={question.id} className="panel p-5">
              <input type="hidden" name="questionIds" value={question.id} />
              <div className="mb-3 flex items-center gap-2">
                <span className="chip">{question.level}</span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-500">
                  {question.category}
                </span>
              </div>
              <p className="text-base font-semibold text-slate-800">
                {index + 1}. {question.prompt}
              </p>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {(
                  [
                    ["A", question.optionA],
                    ["B", question.optionB],
                    ["C", question.optionC],
                    ["D", question.optionD],
                  ] as const
                ).map(([key, label]) => (
                  <label
                    key={key}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                  >
                    <input type="radio" name={`p_${question.id}`} value={key} />
                    <span>
                      <strong>{key}.</strong> {label}
                    </span>
                  </label>
                ))}
              </div>
            </article>
          ))}
          <button type="submit" className="btn-primary">
            Chấm bài và gợi ý level
          </button>
        </form>
      )}
    </section>
  );
}


