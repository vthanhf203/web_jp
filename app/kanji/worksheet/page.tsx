import Link from "next/link";

import { KanjiWorksheetBuilder } from "@/app/components/kanji-worksheet-builder";
import { normalizeJlptLevel } from "@/lib/admin-vocab-library";
import { requireUser } from "@/lib/auth";
import { sortKanjiByLearningOrder } from "@/lib/kanji-compound";
import { loadAdminKanjiMetadata } from "@/lib/kanji-metadata";
import { prisma } from "@/lib/prisma";
import { loadUserKanjiStore } from "@/lib/user-kanji-store";

type SearchParams = Promise<{
  q?: string | string[];
  level?: string | string[];
  pick?: string | string[];
  scope?: string | string[];
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

function parsePickedIds(raw: string): string[] {
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

export default async function KanjiWorksheetPage(props: { searchParams: SearchParams }) {
  const user = await requireUser();
  const params = await props.searchParams;

  const initialQuery = pickSingle(params.q).trim();
  const levelRaw = pickSingle(params.level).trim();
  const initialLevel = levelRaw ? normalizeJlptLevel(levelRaw) : "ALL";
  const initialPickedIds = parsePickedIds(pickSingle(params.pick));
  const scopeRaw = pickSingle(params.scope).trim().toLowerCase();
  const initialSource = scopeRaw === "personal" ? "personal" : "all";

  const [dbKanji, kanjiMetadata, userKanjiStore] = await Promise.all([
    prisma.kanji.findMany(),
    loadAdminKanjiMetadata(),
    loadUserKanjiStore(user.id),
  ]);

  const metadataEntryMap = new Map(
    kanjiMetadata.entries.map((entry) => [entry.character, entry])
  );

  const personalItems = userKanjiStore.items.map((item) => ({
    id: item.id,
    character: item.character,
    meaning: item.meaning,
    onReading: item.onReading,
    kunReading: item.kunReading,
    strokeHint: item.strokeHint || "",
    strokeCount: Math.max(1, item.strokeCount || 1),
    jlptLevel: item.jlptLevel,
    source: "personal" as const,
  }));
  const personalCharacters = new Set(personalItems.map((item) => item.character));

  const coreItems = sortKanjiByLearningOrder(
    dbKanji.filter((item) => !personalCharacters.has(item.character)),
    {
      getOrder: (item) => metadataEntryMap.get(item.character)?.order,
    }
  ).map((item) => ({
    id: item.id,
    character: item.character,
    meaning: item.meaning,
    onReading: item.onReading,
    kunReading: item.kunReading,
    strokeHint: metadataEntryMap.get(item.character)?.strokeHint || "",
    strokeCount: Math.max(1, item.strokeCount || 1),
    jlptLevel: normalizeJlptLevel(item.jlptLevel),
    source: "core" as const,
  }));

  const items = [...personalItems, ...coreItems];

  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
        <p className="inline-flex items-center rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-700">
          Worksheet PDF
        </p>
        <h1 className="mt-3 text-3xl font-extrabold text-slate-900">In PDF luyện viết Kanji</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Bạn có thể chọn Kanji có sẵn trên web hoặc tự nhập Kanji ngoài hệ thống, sau đó tạo
          trang in để lưu thành PDF.
        </p>
        <div className="mt-4">
          <Link
            href="/kanji"
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-700 transition hover:bg-slate-50"
          >
            Quay lại thư viện Kanji
          </Link>
        </div>
      </div>

      <KanjiWorksheetBuilder
        items={items}
        initialQuery={initialQuery}
        initialLevel={initialLevel}
        initialPickedIds={initialPickedIds}
        initialSource={initialSource}
      />
    </section>
  );
}
