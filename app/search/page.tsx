import Link from "next/link";

import { toggleBookmarkAction } from "@/app/actions/personal";
import { requireUser } from "@/lib/auth";
import { loadGrammarDataset } from "@/lib/grammar-dataset";
import { prisma } from "@/lib/prisma";
import { loadUserPersonalState } from "@/lib/user-personal-data";
import { loadAdminVocabLibrary } from "@/lib/admin-vocab-library";

type SearchParams = Promise<{
  q?: string | string[];
}>;

function pickSingle(value?: string | string[]): string {
  if (!value) {
    return "";
  }
  return Array.isArray(value) ? value[0] ?? "" : value;
}

function includesText(source: string, query: string): boolean {
  return source.toLowerCase().includes(query);
}

export default async function GlobalSearchPage(props: { searchParams: SearchParams }) {
  const user = await requireUser();
  const searchParams = await props.searchParams;
  const rawQuery = pickSingle(searchParams.q).trim();
  const query = rawQuery.toLowerCase();

  const [personalState, kanjiRows, vocabRows, adminLibrary, grammarDataset] = await Promise.all([
    loadUserPersonalState(user.id),
    rawQuery
      ? prisma.kanji.findMany({
          where: {
            OR: [
              { character: { contains: rawQuery, mode: "insensitive" } },
              { meaning: { contains: rawQuery, mode: "insensitive" } },
              { onReading: { contains: rawQuery, mode: "insensitive" } },
              { kunReading: { contains: rawQuery, mode: "insensitive" } },
              { jlptLevel: { contains: rawQuery, mode: "insensitive" } },
            ],
          },
          orderBy: [{ jlptLevel: "asc" }, { character: "asc" }],
          take: 40,
        })
      : Promise.resolve([]),
    rawQuery
      ? prisma.vocab.findMany({
          where: {
            OR: [
              { word: { contains: rawQuery, mode: "insensitive" } },
              { reading: { contains: rawQuery, mode: "insensitive" } },
              { meaning: { contains: rawQuery, mode: "insensitive" } },
              { jlptLevel: { contains: rawQuery, mode: "insensitive" } },
            ],
          },
          orderBy: [{ jlptLevel: "asc" }, { word: "asc" }],
          take: 40,
        })
      : Promise.resolve([]),
    loadAdminVocabLibrary(),
    loadGrammarDataset(),
  ]);

  const adminVocabRows = rawQuery
    ? adminLibrary.lessons.flatMap((lesson) =>
        lesson.items
          .filter((item) => {
            const haystacks = [item.word, item.reading, item.kanji, item.hanviet, item.meaning, item.partOfSpeech];
            return haystacks.some((entry) => includesText(entry, query));
          })
          .slice(0, 12)
          .map((item) => ({
            lessonId: lesson.id,
            lessonTitle: lesson.title,
            level: lesson.jlptLevel,
            item,
          }))
      )
    : [];

  const grammarRows = rawQuery
    ? grammarDataset.lessons.flatMap((lesson) =>
        lesson.points
          .filter((point) => {
            const haystacks = [
              point.title,
              point.meaning,
              point.content,
              ...point.usage,
              ...point.examples,
              ...point.notes,
            ];
            return haystacks.some((entry) => includesText(entry, query));
          })
          .slice(0, 8)
          .map((point) => ({
            lessonId: lesson.id,
            lessonTitle: lesson.title,
            level: lesson.level,
            point,
          }))
      )
    : [];

  const bookmarkKeySet = new Set(
    personalState.bookmarks.map((item) => `${item.type}:${item.refId}`)
  );

  return (
    <section className="space-y-6">
      <div className="panel p-6">
        <h1 className="text-2xl font-bold text-slate-900">Tìm kiếm toàn cục</h1>
        <p className="mt-1 text-sm text-slate-600">
          Một ô tìm được cả Kanji + Từ vựng + Ngữ pháp trong kho dữ liệu.
        </p>
        <form className="mt-4 flex flex-wrap gap-2">
          <input
            type="search"
            name="q"
            defaultValue={rawQuery}
            className="input-base max-w-2xl flex-1"
            placeholder="Ví dụ: học, benkyou, N1 wa N2 desu, rai..."
          />
          <button type="submit" className="btn-primary">
            Tìm
          </button>
        </form>
      </div>

      {!rawQuery ? (
        <div className="panel p-6 text-sm text-slate-600">
          Thử tìm theo: <strong>kanji</strong>, <strong>hiragana/katakana</strong>,{" "}
          <strong>hán việt</strong>, <strong>nghĩa tiếng Việt</strong>, hoặc{" "}
          <strong>mẫu ngữ pháp</strong>.
        </div>
      ) : null}

      {rawQuery ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="panel p-5">
            <h2 className="text-lg font-bold text-slate-800">Kanji ({kanjiRows.length})</h2>
            <div className="mt-3 space-y-2">
              {kanjiRows.length === 0 ? (
                <p className="text-sm text-slate-500">Không có kết quả.</p>
              ) : (
                kanjiRows.map((kanji) => {
                  const refId = kanji.character;
                  const bookmarked = bookmarkKeySet.has(`kanji:${refId}`);
                  return (
                    <article key={kanji.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <Link href={`/kanji?q=${encodeURIComponent(kanji.character)}&selected=${encodeURIComponent(kanji.character)}`} className="text-lg font-bold text-slate-900">
                          {kanji.character} - {kanji.meaning}
                        </Link>
                        <form action={toggleBookmarkAction}>
                          <input type="hidden" name="type" value="kanji" />
                          <input type="hidden" name="refId" value={refId} />
                          <input type="hidden" name="title" value={`${kanji.character} - ${kanji.meaning}`} />
                          <input type="hidden" name="subtitle" value={`${kanji.jlptLevel} - ${kanji.strokeCount} nét`} />
                          <input type="hidden" name="returnTo" value={`/search?q=${encodeURIComponent(rawQuery)}`} />
                          <button type="submit" className="btn-soft text-xs">
                            {bookmarked ? "Bỏ bookmark" : "Bookmark"}
                          </button>
                        </form>
                      </div>
                      <p className="mt-1 text-sm text-slate-600">
                        On: {kanji.onReading} - Kun: {kanji.kunReading} - {kanji.jlptLevel}
                      </p>
                    </article>
                  );
                })
              )}
            </div>
          </div>

          <div className="panel p-5">
            <h2 className="text-lg font-bold text-slate-800">Từ vựng hệ thống ({vocabRows.length})</h2>
            <div className="mt-3 space-y-2">
              {vocabRows.length === 0 ? (
                <p className="text-sm text-slate-500">Không có kết quả.</p>
              ) : (
                vocabRows.map((vocab) => {
                  const refId = vocab.id;
                  const bookmarked = bookmarkKeySet.has(`vocab:${refId}`);
                  return (
                    <article key={vocab.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-base font-bold text-slate-900">
                          {vocab.word} ({vocab.reading})
                        </p>
                        <form action={toggleBookmarkAction}>
                          <input type="hidden" name="type" value="vocab" />
                          <input type="hidden" name="refId" value={refId} />
                          <input type="hidden" name="title" value={`${vocab.word} (${vocab.reading})`} />
                          <input type="hidden" name="subtitle" value={vocab.meaning} />
                          <input type="hidden" name="returnTo" value={`/search?q=${encodeURIComponent(rawQuery)}`} />
                          <button type="submit" className="btn-soft text-xs">
                            {bookmarked ? "Bỏ bookmark" : "Bookmark"}
                          </button>
                        </form>
                      </div>
                      <p className="mt-1 text-sm text-slate-600">{vocab.meaning}</p>
                    </article>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : null}

      {rawQuery ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="panel p-5">
            <h2 className="text-lg font-bold text-slate-800">Từ vựng admin ({adminVocabRows.length})</h2>
            <div className="mt-3 space-y-2">
              {adminVocabRows.length === 0 ? (
                <p className="text-sm text-slate-500">Không có kết quả.</p>
              ) : (
                adminVocabRows.slice(0, 40).map((row) => (
                  <Link
                    key={`${row.lessonId}-${row.item.id}`}
                    href={`/vocab/group/${row.lessonId}?level=${row.level}`}
                    className="block rounded-lg border border-slate-200 bg-slate-50 p-3 hover:bg-white"
                  >
                    <p className="text-base font-semibold text-slate-900">
                      {row.item.reading || row.item.word}
                      {row.item.kanji ? <span className="ml-2 text-slate-500">{row.item.kanji}</span> : null}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">{row.item.meaning}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {row.level} - {row.lessonTitle}
                    </p>
                  </Link>
                ))
              )}
            </div>
          </div>

          <div className="panel p-5">
            <h2 className="text-lg font-bold text-slate-800">Ngữ pháp ({grammarRows.length})</h2>
            <div className="mt-3 space-y-2">
              {grammarRows.length === 0 ? (
                <p className="text-sm text-slate-500">Không có kết quả.</p>
              ) : (
                grammarRows.slice(0, 30).map((row) => {
                  const refId = row.point.id;
                  const bookmarked = bookmarkKeySet.has(`grammar:${refId}`);
                  return (
                    <article key={row.point.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          href={`/grammar?level=${row.level}&lesson=${row.lessonId}&point=${row.point.id}`}
                          className="text-base font-semibold text-slate-900"
                        >
                          {row.point.title}
                        </Link>
                        <form action={toggleBookmarkAction}>
                          <input type="hidden" name="type" value="grammar" />
                          <input type="hidden" name="refId" value={refId} />
                          <input type="hidden" name="title" value={row.point.title} />
                          <input type="hidden" name="subtitle" value={row.point.meaning} />
                          <input type="hidden" name="returnTo" value={`/search?q=${encodeURIComponent(rawQuery)}`} />
                          <button type="submit" className="btn-soft text-xs">
                            {bookmarked ? "Bỏ bookmark" : "Bookmark"}
                          </button>
                        </form>
                      </div>
                      {row.point.meaning ? <p className="mt-1 text-sm text-slate-600">{row.point.meaning}</p> : null}
                      <p className="mt-1 text-xs text-slate-500">
                        {row.level} - {row.lessonTitle}
                      </p>
                    </article>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}


