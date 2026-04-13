import { submitQuizAction } from "@/app/actions/quiz";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

type SearchParams = Promise<{
  score?: string | string[];
  total?: string | string[];
  status?: string | string[];
}>;

function pickSingle(param?: string | string[]): string | undefined {
  if (!param) {
    return undefined;
  }
  return Array.isArray(param) ? param[0] : param;
}

function shuffle<T>(list: T[]): T[] {
  const output = [...list];
  for (let i = output.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [output[i], output[j]] = [output[j], output[i]];
  }
  return output;
}

export default async function QuizPage(props: { searchParams: SearchParams }) {
  await requireUser();
  const params = await props.searchParams;

  const allQuestions = await prisma.quizQuestion.findMany();
  const questions = shuffle(allQuestions).slice(0, 5);

  const score = pickSingle(params.score);
  const total = pickSingle(params.total);
  const status = pickSingle(params.status);

  return (
    <section className="space-y-5">
      <div className="panel p-6">
        <h1 className="text-2xl font-bold text-slate-900">Quiz JLPT mini</h1>
        <p className="mt-1 text-sm text-slate-600">
          Mỗi câu đúng nhận 2 XP. Làm nhanh 5 câu để giữ nhịp mỗi ngày.
        </p>
      </div>

      {score && total ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Kết quả vừa rồi: <strong>{score}</strong> / <strong>{total}</strong>
        </div>
      ) : null}

      {status === "empty" ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Bạn chưa chọn đáp án nào.
        </div>
      ) : null}

      {questions.length === 0 ? (
        <div className="panel p-6 text-sm text-slate-600">
          Chưa có dữ liệu quiz. Hãy chạy seed database trước.
        </div>
      ) : (
        <form action={submitQuizAction} className="space-y-4">
          {questions.map((question, index) => (
            <article key={question.id} className="panel p-5">
              <div className="mb-3">
                <span className="chip">{question.level}</span>
                <p className="mt-2 text-base font-semibold text-slate-800">
                  Câu {index + 1}. {question.prompt}
                </p>
              </div>

              <div className="space-y-2 text-sm">
                {(
                  [
                    ["A", question.optionA],
                    ["B", question.optionB],
                    ["C", question.optionC],
                    ["D", question.optionD],
                  ] as const
                ).map(([key, value]) => (
                  <label
                    key={key}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                  >
                    <input
                      type="radio"
                      name={`q_${question.id}`}
                      value={key}
                      required={key === "A"}
                    />
                    <span>
                      <strong>{key}.</strong> {value}
                    </span>
                  </label>
                ))}
              </div>
            </article>
          ))}

          <button type="submit" className="btn-primary">
            Chấm điểm quiz
          </button>
        </form>
      )}
    </section>
  );
}
