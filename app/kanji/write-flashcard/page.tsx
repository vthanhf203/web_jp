import Link from "next/link";

import {
  KanjiWriteFlashcardClient,
  type KanjiWriteComponent,
  type KanjiWriteFlashcardItem,
  type KanjiWriteRadical,
  type KanjiWriteRelatedWord,
  type KanjiWriteSourceOption,
  type KanjiWriteStructure,
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

function mergeDisplayText(current: string, next: string): string {
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
  if (currentKey === nextKey || currentKey.includes(nextKey)) {
    return cleanCurrent;
  }
  if (nextKey.includes(currentKey)) {
    return cleanNext;
  }
  return `${cleanCurrent}; ${cleanNext}`;
}

function mergeStringList(current: string[], next: string[]): string[] {
  const values = [...current, ...next]
    .map((item) => item.trim())
    .filter(Boolean);
  return Array.from(new Set(values));
}

function cloneRadical(radical: KanjiWriteRadical | null | undefined): KanjiWriteRadical | null {
  return radical
    ? {
        symbol: radical.symbol,
        name: radical.name,
        meaning: radical.meaning,
        position: radical.position,
        note: radical.note,
      }
    : null;
}

function cloneComponents(components: KanjiWriteComponent[] | undefined): KanjiWriteComponent[] {
  return (components ?? []).map((component) => ({
    symbol: component.symbol,
    name: component.name,
    meaning: component.meaning,
    position: component.position,
    role: component.role,
  }));
}

function cloneStructure(
  structure: KanjiWriteStructure | null | undefined
): KanjiWriteStructure | null {
  return structure
    ? {
        type: structure.type,
        formula: structure.formula,
        meaning: structure.meaning,
        note: structure.note,
      }
    : null;
}

type RelatedWordLike = {
  id?: string;
  word?: string;
  reading?: string;
  kanji?: string;
  hanviet?: string;
  meaning?: string;
  type?: string;
  jlptLevel?: string;
  exampleSentence?: string;
  exampleMeaning?: string;
  note?: string;
  sourceLabel?: string;
};

function toWriteRelatedWord(
  word: RelatedWordLike,
  fallbackId: string,
  fallbackSourceLabel: string
): KanjiWriteRelatedWord | null {
  const surface = (word.word ?? word.kanji ?? "").trim();
  const meaning = (word.meaning ?? "").trim();
  if (!surface || !meaning) {
    return null;
  }

  return {
    id: (word.id ?? fallbackId).trim() || fallbackId,
    word: surface,
    reading: (word.reading ?? "").trim(),
    kanji: (word.kanji ?? "").trim(),
    hanviet: (word.hanviet ?? "").trim(),
    meaning,
    type: (word.type ?? "").trim(),
    jlptLevel: (word.jlptLevel ?? "").trim(),
    exampleSentence: (word.exampleSentence ?? "").trim(),
    exampleMeaning: (word.exampleMeaning ?? "").trim(),
    note: (word.note ?? "").trim(),
    sourceLabel: (word.sourceLabel ?? fallbackSourceLabel).trim() || fallbackSourceLabel,
  };
}

function buildExampleRelatedWord(options: {
  character: string;
  exampleWord: string;
  exampleMeaning: string;
  jlptLevel: string;
  sourceLabel: string;
}): KanjiWriteRelatedWord | null {
  const word = options.exampleWord.trim();
  const meaning = options.exampleMeaning.trim();
  if (!word || !meaning) {
    return null;
  }

  return {
    id: `example:${options.character}:${word}`,
    word,
    reading: "",
    kanji: /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(word) ? word : "",
    hanviet: "",
    meaning,
    type: "",
    jlptLevel: options.jlptLevel,
    exampleSentence: "",
    exampleMeaning: "",
    note: "",
    sourceLabel: options.sourceLabel,
  };
}

function dedupeRelatedWords(words: KanjiWriteRelatedWord[]): KanjiWriteRelatedWord[] {
  const unique = new Map<string, KanjiWriteRelatedWord>();
  for (const word of words) {
    const key = [
      normalizeComparableText(word.word || word.kanji),
      normalizeComparableText(word.reading),
      normalizeComparableText(word.meaning),
    ].join("|");
    if (!unique.has(key)) {
      unique.set(key, word);
    }
  }
  return Array.from(unique.values());
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
        onReading: item.onReading,
        kunReading: item.kunReading,
        strokeCount: Math.max(1, item.strokeCount || 1),
        jlptLevel: item.jlptLevel,
        sourceLabel: item.sourceLabel,
        strokeHint: item.strokeHint,
        radical: cloneRadical(item.radical),
        radicalHint: item.radicalHint,
        mnemonic: item.mnemonic,
        components: cloneComponents(item.components),
        structure: cloneStructure(item.structure),
        category: item.category,
        tags: [...item.tags],
        relatedWords: dedupeRelatedWords(item.relatedWords),
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
    existing.onReading = mergeDisplayText(existing.onReading, item.onReading);
    existing.kunReading = mergeDisplayText(existing.kunReading, item.kunReading);
    existing.strokeHint = mergeDisplayText(existing.strokeHint, item.strokeHint);
    existing.radicalHint = mergeDisplayText(existing.radicalHint, item.radicalHint);
    existing.mnemonic = mergeDisplayText(existing.mnemonic, item.mnemonic);
    existing.category = existing.category || item.category;
    existing.tags = mergeStringList(existing.tags, item.tags);
    existing.relatedWords = dedupeRelatedWords([...existing.relatedWords, ...item.relatedWords]);
    if (!existing.radical && item.radical) {
      existing.radical = cloneRadical(item.radical);
    }
    if (existing.components.length === 0 && item.components.length > 0) {
      existing.components = cloneComponents(item.components);
    }
    if (!existing.structure && item.structure) {
      existing.structure = cloneStructure(item.structure);
    }
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
        onReading: true,
        kunReading: true,
        strokeCount: true,
        jlptLevel: true,
        exampleWord: true,
        exampleMeaning: true,
      },
    }),
    loadAdminKanjiMetadata(),
    loadUserKanjiStore(user.id),
  ]);

  const metadataMap = new Map(kanjiMetadata.entries.map((entry) => [entry.character, entry]));
  const groupedItems = new Map<string, WritingItemDraft>();
  const coreCharacters = new Set(dbKanji.flatMap((item) => extractKanjiChars(item.character)));
  const personalCharacters = new Set(userKanjiStore.items.flatMap((item) => extractKanjiChars(item.character)));
  const allCharacters = new Set([...coreCharacters, ...personalCharacters]);
  const personalDeckCharacters = new Map<string, Set<string>>();
  for (const deckName of userKanjiStore.decks) {
    const normalizedDeckName = deckName.trim();
    if (normalizedDeckName) {
      personalDeckCharacters.set(normalizedDeckName, new Set());
    }
  }
  for (const item of userKanjiStore.items) {
    const deckName = item.deckName.trim() || "Chua phan loai";
    const characters = personalDeckCharacters.get(deckName) ?? new Set<string>();
    for (const character of extractKanjiChars(item.character)) {
      characters.add(character);
    }
    personalDeckCharacters.set(deckName, characters);
  }

  if (includePersonal) {
    for (const item of userKanjiStore.items) {
      const deckName = item.deckName.trim();
      if (deckFilter && deckName !== deckFilter) {
        continue;
      }
      const relatedWords = dedupeRelatedWords([
        ...item.relatedWords
          .map((word, index) =>
            toWriteRelatedWord(word, `personal:${item.id}:${index}`, "Cá nhân")
          )
          .filter((word): word is KanjiWriteRelatedWord => !!word),
        buildExampleRelatedWord({
          character: item.character,
          exampleWord: item.exampleWord,
          exampleMeaning: item.exampleMeaning,
          jlptLevel: item.jlptLevel,
          sourceLabel: "Ví dụ cá nhân",
        }),
      ].filter((word): word is KanjiWriteRelatedWord => !!word));
      upsertWritingItem(groupedItems, {
        id: item.id,
        character: item.character,
        meaning: item.meaning,
        hanviet: item.hanviet,
        onReading: item.onReading,
        kunReading: item.kunReading,
        strokeCount: Math.max(1, item.strokeCount || 1),
        jlptLevel: item.jlptLevel,
        sourceLabel: item.deckName ? `Cá nhân: ${item.deckName}` : "Cá nhân",
        strokeHint: item.strokeHint,
        radical: null,
        radicalHint: "",
        mnemonic: "",
        components: [],
        structure: null,
        category: item.category,
        tags: item.tags,
        relatedWords,
        order: item.order,
        sourceType: "personal",
        deckName: item.deckName,
      });
    }
  }

  if (includeCore) {
    for (const item of dbKanji) {
      const metadata = metadataMap.get(item.character);
      const jlptLevel = normalizeJlptLevel(item.jlptLevel);
      const relatedWords = dedupeRelatedWords([
        ...(metadata?.relatedWords ?? [])
          .map((word, index) =>
            toWriteRelatedWord(word, `core:${item.id}:${index}`, "Kanji JSON")
          )
          .filter((word): word is KanjiWriteRelatedWord => !!word),
        buildExampleRelatedWord({
          character: item.character,
          exampleWord: item.exampleWord,
          exampleMeaning: item.exampleMeaning,
          jlptLevel,
          sourceLabel: "Ví dụ hệ thống",
        }),
      ].filter((word): word is KanjiWriteRelatedWord => !!word));
      upsertWritingItem(groupedItems, {
        id: item.id,
        character: item.character,
        meaning: item.meaning,
        hanviet: pickHanviet(item.character, "", metadata?.relatedWords ?? []),
        onReading: item.onReading,
        kunReading: item.kunReading,
        strokeCount: Math.max(1, item.strokeCount || 1),
        jlptLevel,
        sourceLabel: "Hệ thống",
        strokeHint: metadata?.strokeHint ?? "",
        radical: cloneRadical(metadata?.radical),
        radicalHint: metadata?.radicalHint ?? "",
        mnemonic: metadata?.mnemonic ?? "",
        components: cloneComponents(metadata?.components),
        structure: cloneStructure(metadata?.structure),
        category: metadata?.category ?? "",
        tags: metadata?.tags ?? [],
        relatedWords,
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
    onReading: item.onReading,
    kunReading: item.kunReading,
    strokeCount: item.strokeCount,
    jlptLevel: item.jlptLevel,
    sourceLabel: buildSourceLabel(item),
    strokeHint: item.strokeHint,
    radical: cloneRadical(item.radical),
    radicalHint: item.radicalHint,
    mnemonic: item.mnemonic,
    components: cloneComponents(item.components),
    structure: cloneStructure(item.structure),
    category: item.category,
    tags: item.tags,
    relatedWords: dedupeRelatedWords(item.relatedWords),
  }));
  const sourceOptions: KanjiWriteSourceOption[] = [
    {
      value: "all",
      label: "Tất cả",
      count: allCharacters.size,
      href: "/kanji/write-flashcard",
      active: scope === "all" && !deckFilter,
    },
    {
      value: "core",
      label: "Hệ thống",
      count: coreCharacters.size,
      href: "/kanji/write-flashcard?scope=core",
      active: scope === "core",
    },
    {
      value: "personal",
      label: "Kanji cá nhân",
      count: personalCharacters.size,
      href: "/kanji/write-flashcard?scope=personal",
      active: scope === "personal" && !deckFilter,
    },
    ...Array.from(personalDeckCharacters.entries())
      .filter(([, characters]) => characters.size > 0)
      .sort(([left], [right]) => left.localeCompare(right, "vi"))
      .map(([deckName, characters]) => ({
        value: `deck:${deckName}`,
        label: deckName,
        count: characters.size,
        href: `/kanji/write-flashcard?scope=personal&deck=${encodeURIComponent(deckName)}`,
        active: deckFilter === deckName,
      })),
  ];

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

      <KanjiWriteFlashcardClient
        key={deckFilter ? `deck:${deckFilter}` : scope}
        items={items}
        sourceOptions={sourceOptions}
      />
    </section>
  );
}
