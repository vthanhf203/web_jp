import Link from "next/link";

import {
  KanjiWriteFlashcardClient,
  type KanjiWriteFlashcardItem,
} from "@/app/components/kanji-write-flashcard-client";
import { normalizeJlptLevel } from "@/lib/admin-vocab-library";
import { requireUser } from "@/lib/auth";
import { sortKanjiByLearningOrder } from "@/lib/kanji-compound";
import { loadAdminKanjiMetadata } from "@/lib/kanji-metadata";
import { prisma } from "@/lib/prisma";
import { loadUserKanjiStore } from "@/lib/user-kanji-store";

type SearchParams = Promise<{
  scope?: string | string[];
  deck?: string | string[];
}>;

type WritingItemDraft = KanjiWriteFlashcardItem & {
  order: number | null;
  hasCore: boolean;
  personalDecks: Set<string>;
};

const JLPT_RANK: Record<string, number> = {
  N5: 0,
  N4: 1,
  N3: 2,
  N2: 3,
  N1: 4,
};

function extractKanjiChars(value: string): string[] {
  return Array.from(
    new Set(Array.from(value).filter((char) => /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(char)))
  );
}

function pickHanviet(
  character: string,
  explicitHanviet: string,
  relatedWords: Array<{ word?: string; kanji?: string; hanviet?: string }>
): string {
  const direct = explicitHanviet.trim();
  if (direct) {
    return direct;
  }

  const exact = relatedWords.find((entry) => {
    const hanviet = (entry.hanviet ?? "").trim();
    return hanviet && (entry.kanji === character || entry.word === character);
  });
  if (exact?.hanviet?.trim()) {
    return exact.hanviet.trim();
  }

  return relatedWords.find((entry) => entry.hanviet?.trim())?.hanviet?.trim() ?? "";
}

function pickSingle(value?: string | string[]): string {
  if (!value) {
    return "";
  }
  return Array.isArray(value) ? value[0] ?? "" : value;
}

function normalizeComparableText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function mergeMeaning(current: string, next: string): string {
  const cleanCurrent = current.trim();
  const cleanNext = next.trim();
  if (!cleanCurrent) {
    return cleanNext;
  }
  if (!cleanNext) {
    return cleanCurrent;
  }

  const currentKey = normalizeComparableText(cleanCurrent);
  const nextKey = normalizeComparableText(cleanNext);
  if (currentKey === nextKey) {
    return cleanCurrent.length >= cleanNext.length ? cleanCurrent : cleanNext;
  }
  if (currentKey.includes(nextKey)) {
    return cleanCurrent;
  }
  if (nextKey.includes(currentKey)) {
    return cleanNext;
  }

  return `${cleanCurrent}; ${cleanNext}`;
}

function pickEarlierLevel(current: string, next: string): string {
  const currentRank = JLPT_RANK[current] ?? 99;
  const nextRank = JLPT_RANK[next] ?? 99;
  return nextRank < currentRank ? next : current;
}

function pickBetterHanviet(current: string, next: string): string {
  const cleanCurrent = current.trim();
  const cleanNext = next.trim();
  if (!cleanCurrent) {
    return cleanNext;
  }
  if (!cleanNext) {
    return cleanCurrent;
  }
  return cleanCurrent.length >= cleanNext.length ? cleanCurrent : cleanNext;
}

function buildSourceLabel(item: WritingItemDraft): string {
  const decks = Array.from(item.personalDecks).filter(Boolean);
  if (decks.length === 0) {
    return "Hệ thống";
  }
  if (decks.length === 1) {
    return item.hasCore ? `Cá nhân + hệ thống: ${decks[0]}` : `Cá nhân: ${decks[0]}`;
  }
  return item.hasCore ? `Cá nhân ${decks.length} mục + hệ thống` : `Cá nhân ${decks.length} mục`;
}

function upsertWritingItem(
  target: Map<string, WritingItemDraft>,
  item: Omit<WritingItemDraft, "personalDecks" | "hasCore"> & {
    sourceType: "personal" | "core";
    deckName?: string;
  }
) {
  const characters = extractKanjiChars(item.character);
  if (characters.length === 0) {
    return;
  }

  for (const character of characters) {
    const existing = target.get(character);
    const itemId = characters.length === 1 ? item.id : `${item.id}:${character}`;
    const itemMeaning = characters.length === 1
      ? item.meaning
      : `${item.meaning} (${item.character.trim()})`;

    if (!existing) {
      target.set(character, {
        id: itemId,
        character,
        meaning: itemMeaning,
        hanviet: item.hanviet,
        strokeCount: Math.max(1, item.strokeCount || 1),
        jlptLevel: item.jlptLevel,
        sourceLabel: item.sourceLabel,
        order: item.order,
        hasCore: item.sourceType === "core",
        personalDecks: item.sourceType === "personal" && item.deckName ? new Set([item.deckName]) : new Set<string>(),
      });
      continue;
    }

    existing.meaning = item.sourceType === "core"
      ? mergeMeaning(itemMeaning, existing.meaning)
      : mergeMeaning(existing.meaning, itemMeaning);
    existing.hanviet = pickBetterHanviet(existing.hanviet, item.hanviet);
    existing.strokeCount = item.sourceType === "core" ? Math.max(1, item.strokeCount || 1) : existing.strokeCount;
    existing.jlptLevel = pickEarlierLevel(existing.jlptLevel, item.jlptLevel);
    if (Number.isFinite(item.order)) {
      existing.order = Number.isFinite(existing.order)
        ? Math.min(Number(existing.order), Number(item.order))
        : Number(item.order);
    }
    if (item.sourceType === "core") {
      existing.hasCore = true;
    }
    if (item.sourceType === "personal" && item.deckName) {
      existing.personalDecks.add(item.deckName);
    }
  }
}

export default async function KanjiWriteFlashcardPage(props: { searchParams: SearchParams }) {
  const user = await requireUser();
  const params = await props.searchParams;
  const scopeRaw = pickSingle(params.scope).trim().toLowerCase();
  const deckFilter = pickSingle(params.deck).trim();
  const scope: "all" | "personal" | "core" = deckFilter
    ? "personal"
    : scopeRaw === "personal"
      ? "personal"
      : scopeRaw === "core"
        ? "core"
        : "all";
  const includePersonal = scope !== "core";
  const includeCore = scope !== "personal";

  const [dbKanji, kanjiMetadata, userKanjiStore] = await Promise.all([
    prisma.kanji.findMany({
      select: {
        id: true,
        character: true,
        meaning: true,
        strokeCount: true,
        jlptLevel: true,
      },
    }),
    loadAdminKanjiMetadata(),
    loadUserKanjiStore(user.id),
  ]);

  const metadataMap = new Map(kanjiMetadata.entries.map((entry) => [entry.character, entry]));
  const groupedItems = new Map<string, WritingItemDraft>();

  if (includePersonal) {
    for (const item of userKanjiStore.items) {
      const deckName = item.deckName.trim();
      if (deckFilter && deckName !== deckFilter) {
        continue;
      }
      upsertWritingItem(groupedItems, {
        id: item.id,
        character: item.character,
        meaning: item.meaning,
        hanviet: item.hanviet,
        strokeCount: Math.max(1, item.strokeCount || 1),
        jlptLevel: item.jlptLevel,
        sourceLabel: item.deckName ? `Cá nhân: ${item.deckName}` : "Cá nhân",
        order: item.order,
        sourceType: "personal",
        deckName: item.deckName,
      });
    }
  }

  if (includeCore) {
    for (const item of dbKanji) {
      const metadata = metadataMap.get(item.character);
      upsertWritingItem(groupedItems, {
        id: item.id,
        character: item.character,
        meaning: item.meaning,
        hanviet: pickHanviet(item.character, "", metadata?.relatedWords ?? []),
        strokeCount: Math.max(1, item.strokeCount || 1),
        jlptLevel: normalizeJlptLevel(item.jlptLevel),
        sourceLabel: "Hệ thống",
        order: metadata?.order ?? null,
        sourceType: "core",
      });
    }
  }

  const items: KanjiWriteFlashcardItem[] = sortKanjiByLearningOrder(Array.from(groupedItems.values()), {
    getOrder: (item) => item.order,
  }).map((item) => ({
    id: item.id,
    character: item.character,
    meaning: item.meaning,
    hanviet: item.hanviet,
    strokeCount: item.strokeCount,
    jlptLevel: item.jlptLevel,
    sourceLabel: buildSourceLabel(item),
  }));

  return (
    <section className="space-y-6">
      <div className="rounded-[2rem] border border-slate-200 bg-white/90 p-6 shadow-sm">
        <p className="inline-flex rounded-full bg-sky-100 px-3 py-1 text-xs font-black uppercase tracking-[0.2em] text-sky-700">
          Kanji writing lab
        </p>
        <h1 className="mt-3 text-3xl font-black text-slate-950">Flashcard luyện viết Kanji</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Một chức năng thử nghiệm riêng: app hiện nghĩa tiếng Việt, bạn vẽ Kanji trên bảng, sau đó hệ thống so với dữ
          liệu nét KanjiVG để ước lượng đúng/sai.
        </p>
        <p className="mt-3 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-slate-600">
          {deckFilter
            ? `Đang luyện mục: ${deckFilter}`
            : scope === "personal"
              ? "Đang luyện Kanji cá nhân"
              : scope === "core"
                ? "Đang luyện Kanji hệ thống"
                : "Đang luyện tất cả Kanji"}
        </p>
        <div className="mt-4">
          <Link
            href="/kanji"
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-700 transition hover:bg-slate-50"
          >
            Quay lại thư viện Kanji
          </Link>
        </div>
      </div>

      <KanjiWriteFlashcardClient items={items} />
    </section>
  );
}
