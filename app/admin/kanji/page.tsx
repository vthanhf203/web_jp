import Link from "next/link";

import { deleteAdminKanjiAction } from "@/app/actions/admin-content";
import { AdminKanjiImportForm } from "@/app/components/admin-kanji-import-form";
import { AdminNav } from "@/app/components/admin-nav";
import { requireAdmin } from "@/lib/admin";
import { JLPT_LEVELS, normalizeJlptLevel, type JlptLevel } from "@/lib/admin-vocab-library";
import { prisma } from "@/lib/prisma";

type SearchParams = Promise<{
  level?: string | string[];
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

function levelHref(level: JlptLevel): string {
  const query = new URLSearchParams();
  query.set("level", level);
  return `/admin/kanji?${query.toString()}`;
}

export default async function AdminKanjiPage(props: { searchParams: SearchParams }) {
  await requireAdmin();

  const params = await props.searchParams;
  const selectedLevel = normalizeJlptLevel(pickSingle(params.level));

  const [kanjiList, levelCounts] = await Promise.all([
    prisma.kanji.findMany({
      where: {
        jlptLevel: selectedLevel,
      },
      orderBy: [{ jlptLevel: "asc" }, { character: "asc" }],
    }),
    Promise.all(
      JLPT_LEVELS.map(async (level) => [
        level,
        await prisma.kanji.count({
          where: { jlptLevel: level },
        }),
      ])
    ),
  ]);

  const countByLevel = Object.fromEntries(levelCounts) as Record<JlptLevel, number>;

  return (
    <section className="space-y-6 rounded-3xl border border-sky-100 bg-[#d8e5f7] p-6 shadow-[0_8px_28px_rgba(28,78,140,0.08)] [background-image:linear-gradient(rgba(255,255,255,0.3)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.3)_1px,transparent_1px)] [background-size:30px_30px]">
      <div className="rounded-2xl border border-slate-200 bg-white/95 p-6 shadow-sm">
        <h1 className="text-3xl font-bold text-slate-800">Admin Kanji</h1>
        <p className="mt-1 text-sm text-slate-600">
          Import vÃ  quáº£n lÃ½ kho Kanji dÃ¹ng chung cho toÃ n bá»™ há»‡ thá»‘ng.
        </p>
        <div className="mt-4">
          <AdminNav active="kanji" />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {JLPT_LEVELS.map((level) => (
            <Link
              key={level}
              href={levelHref(level)}
              className={`rounded-xl border px-4 py-2 text-sm font-semibold transition ${levelStyle(level, selectedLevel)}`}
            >
              {level} ({countByLevel[level]})
            </Link>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-sm">
        <h2 className="text-xl font-bold text-slate-800">Import dá»¯ liá»‡u Kanji</h2>
        <p className="mt-1 text-sm text-slate-600">
          Má»—i object há»— trá»£: character, meaning, onReading, kunReading, strokeCount,
          jlptLevel, exampleWord, exampleMeaning.
        </p>
        <div className="mt-3">
          <AdminKanjiImportForm />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xl font-bold text-slate-800">
            Danh sÃ¡ch Kanji {selectedLevel} ({kanjiList.length})
          </h2></div>

        {kanjiList.length === 0 ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
            ChÆ°a cÃ³ dá»¯ liá»‡u Kanji cho {selectedLevel}.
          </p>
        ) : (
          <div className="mt-3 max-h-[60vh] overflow-auto pr-1">
            <div className="space-y-2">
              {kanjiList.map((kanji) => (
                <article
                  key={kanji.id}
                  className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 md:grid-cols-[90px_1fr_auto]"
                >
                  <div>
                    <p className="text-3xl font-bold text-slate-900">{kanji.character}</p>
                    <p className="mt-1 text-xs text-slate-500">{kanji.jlptLevel}</p>
                  </div>
                  <div className="text-sm text-slate-700">
                    <p>
                      <span className="font-semibold text-slate-800">NghÄ©a:</span> {kanji.meaning}
                    </p>
                    <p>
                      <span className="font-semibold text-slate-800">On:</span> {kanji.onReading}
                    </p>
                    <p>
                      <span className="font-semibold text-slate-800">Kun:</span> {kanji.kunReading}
                    </p>
                    <p>
                      <span className="font-semibold text-slate-800">NÃ©t:</span> {kanji.strokeCount}
                    </p>
                    <p>
                      <span className="font-semibold text-slate-800">VÃ­ dá»¥:</span>{" "}
                      {kanji.exampleWord} - {kanji.exampleMeaning}
                    </p>
                  </div>
                  <div className="flex items-start justify-end">
                    <form action={deleteAdminKanjiAction}>
                      <input type="hidden" name="kanjiId" value={kanji.id} />
                      <button
                        type="submit"
                        className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                      >
                        XoÃ¡
                      </button>
                    </form>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

