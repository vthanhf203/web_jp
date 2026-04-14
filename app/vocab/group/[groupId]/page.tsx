import Link from "next/link";

import { toggleBookmarkAction } from "@/app/actions/personal";
import { SpeakJpButton } from "@/app/components/speak-jp-button";
import { loadAdminVocabLibrary, normalizeJlptLevel } from "@/lib/admin-vocab-library";
import { requireUser } from "@/lib/auth";
import { loadUserPersonalState } from "@/lib/user-personal-data";

type RouteParams = Promise<{
  groupId: string;
}>;

type SearchParams = Promise<{
  level?: string | string[];
}>;

function pickSingle(value?: string | string[]): string {
  if (!value) {
    return "";
  }
  return Array.isArray(value) ? value[0] ?? "" : value;
}

export default async function VocabGroupDetailPage(props: {
  params: RouteParams;
  searchParams: SearchParams;
}) {
  const user = await requireUser();

  const params = await props.params;
  const search = await props.searchParams;
  const levelFromQuery = normalizeJlptLevel(pickSingle(search.level));

  const [library, personalState] = await Promise.all([
    loadAdminVocabLibrary(),
    loadUserPersonalState(user.id),
  ]);
  const group = library.lessons.find((entry) => entry.id === params.groupId);

  if (!group) {
    return (
      <section className="panel p-8">
        <h1 className="text-2xl font-bold text-slate-800">Khong tim thay chu de</h1>
        <p className="mt-2 text-slate-600">Chu de co the da bi xoa hoac thay doi.</p>
        <Link href="/vocab" className="btn-primary mt-5">
          Quay lai /vocab
        </Link>
      </section>
    );
  }

  const level = normalizeJlptLevel(group.jlptLevel || levelFromQuery);
  const totalWords = group.items.length;
  const withKanji = group.items.filter((item) => item.kanji.trim().length > 0).length;
  const withHanViet = group.items.filter((item) => item.hanviet.trim().length > 0).length;
  const withPos = group.items.filter((item) => item.partOfSpeech.trim().length > 0).length;
  const bookmarkKeySet = new Set(
    personalState.bookmarks.map((item) => `${item.type}:${item.refId}`)
  );

  return (
    <section className="space-y-6 rounded-3xl border border-sky-100 bg-[#d8e5f7] p-6 shadow-[0_8px_28px_rgba(28,78,140,0.08)] [background-image:linear-gradient(rgba(255,255,255,0.3)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.3)_1px,transparent_1px)] [background-size:30px_30px]">
      <div className="relative overflow-hidden rounded-[28px] border border-slate-700/20 bg-[#1f3354] p-5 text-white shadow-[0_20px_50px_rgba(15,23,42,0.35)]">
        <div className="pointer-events-none absolute -right-16 -top-14 h-48 w-48 rounded-full bg-cyan-300/20 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-10 h-44 w-44 rounded-full bg-blue-400/20 blur-2xl" />

        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link
              href={`/vocab?mode=library&level=${level}`}
              className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-semibold text-white/90 transition hover:bg-white/20"
            >
              {"<"} Quay lai danh sach chu de
            </Link>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100/90">
              {level} - Chu de admin
            </p>
            <h1 className="mt-2 text-3xl font-extrabold leading-tight text-white sm:text-4xl">
              {group.title}
            </h1>
            <p className="mt-3 max-w-3xl text-base text-slate-200">
              {group.description || "Nhom tu vung theo trinh do JLPT"}
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-white/35 bg-white/10 px-3 py-1 text-xs font-semibold text-cyan-100">
                {totalWords} tu vung
              </span>
              <span className="rounded-full border border-white/35 bg-white/10 px-3 py-1 text-xs font-semibold text-cyan-100">
                {withKanji} co kanji
              </span>
              <span className="rounded-full border border-white/35 bg-white/10 px-3 py-1 text-xs font-semibold text-cyan-100">
                {withHanViet} co han viet
              </span>
            </div>
          </div>
          <div className="rounded-2xl border border-white/30 bg-white/10 p-3 text-center backdrop-blur">
            <p className="text-xs uppercase tracking-widest text-cyan-100/80">Trinh do</p>
            <p className="mt-1 text-3xl font-black">{level}</p>
            <p className="mt-1 text-xs text-cyan-100/80">{totalWords} tu</p>
          </div>
        </div>

        <div className="relative mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-white/25 bg-white/10 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-cyan-100/80">Do phu Kanji</p>
            <p className="mt-1 text-xl font-bold text-white">
              {totalWords === 0 ? 0 : Math.round((withKanji / totalWords) * 100)}%
            </p>
          </div>
          <div className="rounded-xl border border-white/25 bg-white/10 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-cyan-100/80">Do phu Han Viet</p>
            <p className="mt-1 text-xl font-bold text-white">
              {totalWords === 0 ? 0 : Math.round((withHanViet / totalWords) * 100)}%
            </p>
          </div>
          <div className="rounded-xl border border-white/25 bg-white/10 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-cyan-100/80">POS kha dung</p>
            <p className="mt-1 text-xl font-bold text-white">{withPos}</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Danh sach tu vung</h2>
            <p className="mt-1 text-[13px] text-slate-500">
              Chon che do hoc sau khi xem nhanh cac tu ben duoi.
            </p>
          </div>
        </div>

        <div className="mt-4 max-h-[66vh] overflow-y-auto pr-1">
          <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
            {group.items.map((item, index) => {
              const bookmarked = bookmarkKeySet.has(`vocab:${item.id}`);
              return (
                <article
                  key={item.id}
                  className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[1.45rem] font-bold leading-tight text-slate-900">
                        {item.reading || item.word || "-"}
                      </p>
                      <p className="mt-0.5 text-[13px] text-slate-500">
                        {item.kanji || (item.reading ? item.word : "") || "-"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <SpeakJpButton
                        text={item.reading || item.kanji || item.word}
                        title={`Phat am tu ${index + 1}`}
                      />
                      <form action={toggleBookmarkAction}>
                        <input type="hidden" name="type" value="vocab" />
                        <input type="hidden" name="refId" value={item.id} />
                        <input
                          type="hidden"
                          name="title"
                          value={`${item.reading || item.word}${item.kanji ? ` (${item.kanji})` : ""}`}
                        />
                        <input type="hidden" name="subtitle" value={item.meaning} />
                        <input
                          type="hidden"
                          name="returnTo"
                          value={`/vocab/group/${group.id}?level=${level}`}
                        />
                        <button
                          type="submit"
                          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                        >
                          {bookmarked ? "Da luu" : "Luu"}
                        </button>
                      </form>
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600">
                        #{index + 1}
                      </span>
                    </div>
                  </div>

                  <p className="mt-2 text-[1.28rem] font-semibold leading-tight text-slate-800">
                    {item.meaning}
                  </p>

                  <div className="mt-2.5 flex flex-wrap gap-1.5 text-[10px]">
                    <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 font-semibold text-blue-700">
                      Kanji: {item.kanji || "-"}
                    </span>
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-semibold text-amber-700">
                      Han Viet: {item.hanviet || "-"}
                    </span>
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">
                      POS: {item.partOfSpeech || "-"}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-sm">
        <h2 className="text-xl font-bold text-slate-800">Bat dau hoc chu de nay</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Link
            href={`/vocab/learn?group=${group.id}&mode=flashcard`}
            className="rounded-2xl border border-blue-300 bg-blue-600 px-4 py-3 text-center text-base font-semibold text-white transition hover:bg-blue-700"
          >
            Flashcard
          </Link>
          <Link
            href={`/vocab/learn?group=${group.id}&mode=quiz`}
            className="rounded-2xl border border-emerald-300 bg-emerald-600 px-4 py-3 text-center text-base font-semibold text-white transition hover:bg-emerald-700"
          >
            Trac nghiem
          </Link>
          <Link
            href={`/vocab/learn?group=${group.id}&mode=recall`}
            className="rounded-2xl border border-orange-300 bg-orange-600 px-4 py-3 text-center text-base font-semibold text-white transition hover:bg-orange-700"
          >
            Nhoi nhet
          </Link>
        </div>
      </div>
    </section>
  );
}

