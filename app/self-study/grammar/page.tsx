import Link from "next/link";
import { ChevronLeft, Layers3, NotebookPen, StickyNote, Trash2 } from "lucide-react";

import { deleteGrammarPracticeItemAction } from "@/app/actions/grammar-practice";
import { GrammarPracticeClient } from "@/app/components/grammar-practice-client";
import { GrammarPracticeImportForm } from "@/app/components/grammar-practice-import-form";
import { requireUser } from "@/lib/auth";
import {
  DEFAULT_GRAMMAR_DECK_NAME,
  loadGrammarPracticeStore,
  type GrammarPracticeItem,
} from "@/lib/grammar-practice-store";

type SearchParams = Promise<{
  item?: string | string[];
  level?: string | string[];
  deck?: string | string[];
}>;

function pickSingle(value?: string | string[]): string {
  if (!value) {
    return "";
  }
  return Array.isArray(value) ? value[0] ?? "" : value;
}

function levelClass(level: string, active: boolean): string {
  if (active) {
    return "border-[#123c69] bg-[#123c69] text-white";
  }
  if (level === "N5") {
    return "border-[#a7e8cf] bg-[#effdf7] text-[#11795e]";
  }
  if (level === "N4") {
    return "border-[#bdd7ff] bg-[#f1f6ff] text-[#2557a7]";
  }
  if (level === "N3") {
    return "border-[#ffe0a8] bg-[#fff8e8] text-[#a35b00]";
  }
  return "border-[#e0e7ef] bg-white text-[#526070]";
}

function getDeckName(item: Pick<GrammarPracticeItem, "deckName" | "topic">): string {
  return item.deckName?.trim() || item.topic?.trim() || DEFAULT_GRAMMAR_DECK_NAME;
}

function grammarHref({
  level,
  deck,
  item,
}: {
  level?: string;
  deck?: string;
  item?: string;
}): string {
  const search = new URLSearchParams();
  if (level && level !== "ALL") {
    search.set("level", level);
  }
  if (deck) {
    search.set("deck", deck);
  }
  if (item) {
    search.set("item", item);
  }
  const query = search.toString();
  return query ? `/self-study/grammar?${query}` : "/self-study/grammar";
}

export default async function SelfStudyGrammarPage(props: { searchParams: SearchParams }) {
  const user = await requireUser();
  const params = await props.searchParams;
  const requestedItemId = pickSingle(params.item).trim();
  const requestedLevel = pickSingle(params.level).trim().toUpperCase();
  const requestedDeckName = pickSingle(params.deck).trim();

  const store = await loadGrammarPracticeStore(user.id);
  const allItems = [...store.items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const levelFilteredItems =
    requestedLevel && requestedLevel !== "ALL"
      ? allItems.filter((item) => item.jlptLevel === requestedLevel)
      : allItems;
  const filteredItems = requestedDeckName
    ? levelFilteredItems.filter((item) => getDeckName(item) === requestedDeckName)
    : levelFilteredItems;
  const selectedItem = filteredItems.find((item) => item.id === requestedItemId) ?? filteredItems[0] ?? null;

  const levelCounts = ["N5", "N4", "N3", "N2", "N1"].map((level) => ({
    level,
    count: allItems.filter((item) => item.jlptLevel === level).length,
  }));

  const deckGroups = Array.from(
    levelFilteredItems.reduce((map, item) => {
      const name = getDeckName(item);
      const current = map.get(name) ?? { name, count: 0 };
      current.count += 1;
      map.set(name, current);
      return map;
    }, new Map<string, { name: string; count: number }>())
  )
    .map(([, group]) => group)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "vi"));

  const totalExamples = allItems.reduce((sum, item) => sum + item.examples.length, 0);
  const totalNotes = allItems.reduce((sum, item) => sum + item.notes.length, 0);

  return (
    <section className="mx-auto max-w-[1360px] space-y-6 pb-10">
      <div className="flex items-center gap-4">
        <Link
          href="/self-study"
          className="grid h-11 w-11 place-items-center rounded-2xl border border-[#d8e2ee] bg-white text-[#123c69] shadow-[0_10px_24px_rgba(18,60,105,0.08)] transition hover:bg-[#f4fbfb]"
          aria-label="Quay lai tu hoc"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#22a6a1]">Tu hoc ngu phap</p>
          <h1 className="mt-1 text-3xl font-black text-[#111827]">Kho ngu phap JSON</h1>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <article className="rounded-2xl border border-[#d8e2ee] bg-white px-5 py-4 shadow-[0_14px_28px_rgba(18,60,105,0.06)]">
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-[#64748b]">
            <Layers3 className="h-4 w-4 text-[#22a6a1]" />
            Mau ngu phap
          </p>
          <p className="mt-2 text-3xl font-black text-[#111827]">{allItems.length}</p>
        </article>
        <article className="rounded-2xl border border-[#d8e2ee] bg-white px-5 py-4 shadow-[0_14px_28px_rgba(18,60,105,0.06)]">
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-[#64748b]">
            <NotebookPen className="h-4 w-4 text-[#4f7cff]" />
            Vi du cau
          </p>
          <p className="mt-2 text-3xl font-black text-[#111827]">{totalExamples}</p>
        </article>
        <article className="rounded-2xl border border-[#d8e2ee] bg-white px-5 py-4 shadow-[0_14px_28px_rgba(18,60,105,0.06)]">
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-[#64748b]">
            <StickyNote className="h-4 w-4 text-[#e68a2e]" />
            Ghi chu
          </p>
          <p className="mt-2 text-3xl font-black text-[#111827]">{totalNotes}</p>
        </article>
      </div>

      <div className="rounded-[24px] border border-[#d8e2ee] bg-white p-4 shadow-[0_18px_42px_rgba(18,60,105,0.06)]">
        <div className="flex flex-wrap gap-2">
          <Link
            href={grammarHref({ deck: requestedDeckName })}
            className={`rounded-full border px-4 py-2 text-sm font-black transition ${levelClass(
              "ALL",
              !requestedLevel || requestedLevel === "ALL"
            )}`}
          >
            Tat ca ({allItems.length})
          </Link>
          {levelCounts.map((entry) => (
            <Link
              key={entry.level}
              href={grammarHref({ level: entry.level, deck: requestedDeckName })}
              className={`rounded-full border px-4 py-2 text-sm font-black transition ${levelClass(
                entry.level,
                requestedLevel === entry.level
              )}`}
            >
              {entry.level} ({entry.count})
            </Link>
          ))}
        </div>

        {deckGroups.length > 0 ? (
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            <Link
              href={grammarHref({ level: requestedLevel })}
              className={`shrink-0 rounded-full border px-4 py-2 text-sm font-black transition ${
                !requestedDeckName
                  ? "border-[#a7e8cf] bg-[#dffaf2] text-[#0c735d]"
                  : "border-[#d8e2ee] bg-white text-[#526070] hover:bg-[#f8fcff]"
              }`}
            >
              Tat ca muc ({levelFilteredItems.length})
            </Link>
            {deckGroups.map((deck) => (
              <Link
                key={deck.name}
                href={grammarHref({ level: requestedLevel, deck: deck.name })}
                className={`shrink-0 rounded-full border px-4 py-2 text-sm font-black transition ${
                  requestedDeckName === deck.name
                    ? "border-[#123c69] bg-[#123c69] text-white"
                    : "border-[#d8e2ee] bg-white text-[#526070] hover:bg-[#f8fcff]"
                }`}
              >
                {deck.name} ({deck.count})
              </Link>
            ))}
          </div>
        ) : null}
      </div>

      {selectedItem ? (
        <div className="rounded-[24px] border border-[#d8e2ee] bg-white p-4 shadow-[0_18px_42px_rgba(18,60,105,0.06)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#22a6a1]">Mau dang chon</p>
              <h2 className="mt-2 font-[var(--font-jp)] text-3xl font-black text-[#111827]">
                {selectedItem.displayPattern || selectedItem.pattern}
              </h2>
              <p className="mt-1 text-sm font-semibold text-[#445169]">
                {selectedItem.meaning}
                {selectedItem.meaningShort ? ` (${selectedItem.meaningShort})` : ""}
              </p>
              <p className="mt-1 text-sm font-semibold text-[#667085]">
                {selectedItem.jlptLevel} | {getDeckName(selectedItem)} | {selectedItem.topic}
              </p>
            </div>
            <form action={deleteGrammarPracticeItemAction}>
              <input type="hidden" name="itemId" value={selectedItem.id} />
              <button
                type="submit"
                className="grid h-11 w-11 place-items-center rounded-full border border-rose-200 bg-rose-50 text-rose-600 transition hover:bg-rose-100"
                aria-label="Xoa mau ngu phap"
                title="Xoa mau ngu phap"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </form>
          </div>
          {selectedItem.structure ? (
            <p className="mt-3 text-sm font-semibold text-[#445169]">
              <span className="font-black text-[#263750]">Cau truc:</span> {selectedItem.structure}
            </p>
          ) : null}
          {selectedItem.examples.length > 0 ? (
            <div className="mt-3 rounded-xl border border-[#e7edf6] bg-[#fbfdff] px-3 py-3">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-[#667085]">Vi du nhanh</p>
              {selectedItem.examples.slice(0, 2).map((example, index) => (
                <div key={`${selectedItem.id}-quick-example-${index}`} className="mt-2">
                  <p className="font-[var(--font-jp)] text-sm font-black text-[#111827]">
                    {example.jpWithReading || example.jp}
                  </p>
                  {example.vi ? (
                    <p className="mt-0.5 text-xs font-semibold text-[#667085]">{example.vi}</p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {filteredItems.length > 0 ? (
        <>
          <GrammarPracticeClient items={filteredItems} />

          <div className="rounded-[24px] border border-[#d8e2ee] bg-white p-4 shadow-[0_18px_42px_rgba(18,60,105,0.06)]">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#22a6a1]">Danh sach mau ngu phap</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filteredItems.map((item) => {
                const active = selectedItem?.id === item.id;
                return (
                  <Link
                    key={item.id}
                    href={grammarHref({
                      level: requestedLevel,
                      deck: requestedDeckName || getDeckName(item),
                      item: item.id,
                    })}
                    className={`rounded-2xl border bg-white p-4 shadow-[0_10px_24px_rgba(18,60,105,0.05)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_28px_rgba(18,60,105,0.08)] ${
                      active ? "border-[#22a6a1] ring-4 ring-[#d9f5f1]" : "border-[#d8e2ee]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded-full bg-[#eef3ff] px-2.5 py-1 text-xs font-black text-[#3554a8]">
                        {item.jlptLevel}
                      </span>
                      <span className="text-xs font-bold text-[#667085]">{item.examples.length} vi du</span>
                    </div>
                    <h3 className="mt-3 font-[var(--font-jp)] text-xl font-black text-[#111827]">
                      {item.displayPattern || item.pattern}
                    </h3>
                    <p className="mt-1 line-clamp-2 text-sm font-semibold text-[#667085]">{item.meaning}</p>
                  </Link>
                );
              })}
            </div>
          </div>
        </>
      ) : (
        <div className="rounded-[24px] border border-dashed border-[#cbd8e7] bg-white p-8 text-center text-sm font-semibold text-[#667085]">
          Chua co mau ngu phap trong bo loc hien tai. Hay import JSON de bat dau.
        </div>
      )}

      <div className="rounded-[24px] border border-[#d8e2ee] bg-white p-5 shadow-[0_18px_42px_rgba(18,60,105,0.08)]">
        <h2 className="text-xl font-black text-[#111827]">Import JSON ngu phap</h2>
        <p className="mt-1 text-sm text-[#667085]">
          Dan JSON hoac tai file de them mau ngu phap, y nghia, vi du va ghi chu.
        </p>
        <div className="mt-4">
          <GrammarPracticeImportForm />
        </div>
      </div>
    </section>
  );
}
