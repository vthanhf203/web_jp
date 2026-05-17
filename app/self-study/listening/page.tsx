import Link from "next/link";
import { ChevronLeft, Clock3, Headphones, Layers3, Trash2 } from "lucide-react";

import { deleteListeningItemAction } from "@/app/actions/listening-practice";
import { ListeningImportForm } from "@/app/components/listening-import-form";
import { ListeningPracticeClient } from "@/app/components/listening-practice-client";
import { requireUser } from "@/lib/auth";
import {
  DEFAULT_LISTENING_DECK_NAME,
  loadListeningPracticeStore,
  type ListeningPracticeItem,
} from "@/lib/listening-practice-store";

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

function getDeckName(item: Pick<ListeningPracticeItem, "deckName" | "topic">): string {
  return item.deckName?.trim() || item.topic?.trim() || DEFAULT_LISTENING_DECK_NAME;
}

function listeningHref({
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
  return query ? `/self-study/listening?${query}` : "/self-study/listening";
}

export default async function SelfStudyListeningPage(props: { searchParams: SearchParams }) {
  const user = await requireUser();
  const params = await props.searchParams;
  const requestedItemId = pickSingle(params.item).trim();
  const requestedLevel = pickSingle(params.level).trim().toUpperCase();
  const requestedDeckName = pickSingle(params.deck).trim();

  const store = await loadListeningPracticeStore(user.id);
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

  const totalMinutes = allItems.reduce((sum, item) => sum + item.estimatedMinutes, 0);
  const totalQuestions = allItems.reduce((sum, item) => sum + item.questions.length, 0);

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
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#22a6a1]">Tu hoc nghe hieu</p>
          <h1 className="mt-1 text-3xl font-black text-[#111827]">Kho bai nghe chu dong</h1>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <article className="rounded-2xl border border-[#d8e2ee] bg-white px-5 py-4 shadow-[0_14px_28px_rgba(18,60,105,0.06)]">
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-[#64748b]">
            <Layers3 className="h-4 w-4 text-[#22a6a1]" />
            Bai nghe
          </p>
          <p className="mt-2 text-3xl font-black text-[#111827]">{allItems.length}</p>
        </article>
        <article className="rounded-2xl border border-[#d8e2ee] bg-white px-5 py-4 shadow-[0_14px_28px_rgba(18,60,105,0.06)]">
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-[#64748b]">
            <Clock3 className="h-4 w-4 text-[#4f7cff]" />
            Tong phut nghe
          </p>
          <p className="mt-2 text-3xl font-black text-[#111827]">{totalMinutes}</p>
        </article>
        <article className="rounded-2xl border border-[#d8e2ee] bg-white px-5 py-4 shadow-[0_14px_28px_rgba(18,60,105,0.06)]">
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-[#64748b]">
            <Headphones className="h-4 w-4 text-[#e68a2e]" />
            Cau hoi quiz
          </p>
          <p className="mt-2 text-3xl font-black text-[#111827]">{totalQuestions}</p>
        </article>
      </div>

      <div className="rounded-[24px] border border-[#d8e2ee] bg-white p-4 shadow-[0_18px_42px_rgba(18,60,105,0.06)]">
        <div className="flex flex-wrap gap-2">
          <Link
            href={listeningHref({ deck: requestedDeckName })}
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
              href={listeningHref({ level: entry.level, deck: requestedDeckName })}
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
              href={listeningHref({ level: requestedLevel })}
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
                href={listeningHref({ level: requestedLevel, deck: deck.name })}
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
        <>
          <div className="rounded-[24px] border border-[#d8e2ee] bg-white p-4 shadow-[0_18px_42px_rgba(18,60,105,0.06)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#22a6a1]">Bai dang chon</p>
                <h2 className="mt-1 text-2xl font-black text-[#111827]">{selectedItem.title}</h2>
                <p className="mt-1 text-sm font-semibold text-[#667085]">
                  {selectedItem.jlptLevel} | {getDeckName(selectedItem)} | {selectedItem.estimatedMinutes} phut
                </p>
              </div>
              <form action={deleteListeningItemAction}>
                <input type="hidden" name="itemId" value={selectedItem.id} />
                <button
                  type="submit"
                  className="grid h-11 w-11 place-items-center rounded-full border border-rose-200 bg-rose-50 text-rose-600 transition hover:bg-rose-100"
                  aria-label="Xoa bai nghe"
                  title="Xoa bai nghe"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </form>
            </div>
          </div>

          <ListeningPracticeClient item={selectedItem} />
        </>
      ) : (
        <div className="rounded-[24px] border border-dashed border-[#cbd8e7] bg-white p-8 text-center text-sm font-semibold text-[#667085]">
          Chua co bai nghe. Hay import JSON de bat dau.
        </div>
      )}

      {filteredItems.length > 0 ? (
        <div className="rounded-[24px] border border-[#d8e2ee] bg-white p-4 shadow-[0_18px_42px_rgba(18,60,105,0.06)]">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#22a6a1]">Danh sach bai nghe</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredItems.map((item) => {
              const active = selectedItem?.id === item.id;
              return (
                <Link
                  key={item.id}
                  href={listeningHref({
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
                    <span className="text-xs font-bold text-[#667085]">{item.questions.length} cau</span>
                  </div>
                  <h3 className="mt-3 text-lg font-black text-[#111827]">{item.title}</h3>
                  <p className="mt-1 truncate text-sm font-semibold text-[#667085]">{item.topic}</p>
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="rounded-[24px] border border-[#d8e2ee] bg-white p-5 shadow-[0_18px_42px_rgba(18,60,105,0.08)]">
        <h2 className="text-xl font-black text-[#111827]">Import JSON bai nghe</h2>
        <p className="mt-1 text-sm text-[#667085]">
          Dan JSON hoac tai file de them bai nghe, script va bo cau hoi quiz.
        </p>
        <div className="mt-4">
          <ListeningImportForm />
        </div>
      </div>
    </section>
  );
}

