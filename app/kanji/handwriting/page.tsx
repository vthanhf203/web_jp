import Link from "next/link";

import { KanjiHandwritingClient } from "@/app/components/kanji-handwriting-client";
import { normalizeJlptLevel } from "@/lib/admin-vocab-library";
import { requireUser } from "@/lib/auth";
import { loadKanjiHandwritingItems } from "@/lib/kanji-handwriting";

type SearchParams = Promise<{
  q?: string | string[];
  level?: string | string[];
  source?: string | string[];
}>;

function pickSingle(value?: string | string[]): string {
  if (!value) {
    return "";
  }
  return Array.isArray(value) ? value[0] ?? "" : value;
}

function normalizeSource(value: string): "all" | "core" | "personal" | "mixed" {
  const normalized = value.trim().toLowerCase();
  return normalized === "core" || normalized === "personal" || normalized === "mixed" ? normalized : "all";
}

export default async function KanjiHandwritingPage(props: { searchParams: SearchParams }) {
  const user = await requireUser();
  const params = await props.searchParams;
  const items = await loadKanjiHandwritingItems(user.id);
  const initialQuery = pickSingle(params.q);
  const rawLevel = pickSingle(params.level);
  const initialLevel = rawLevel ? normalizeJlptLevel(rawLevel) : "ALL";
  const initialSource = normalizeSource(pickSingle(params.source));

  return (
    <section className="space-y-6">
      <div className="overflow-hidden rounded-[2.25rem] border border-emerald-100 bg-[#eefaf4]/92 p-6 shadow-sm">
        <p className="inline-flex rounded-full bg-emerald-600 px-3 py-1 text-xs font-black uppercase tracking-[0.2em] text-white">
          Kanji viết tay
        </p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
          Thư viện Kanji viết tay + từ vựng liên quan
        </h1>
        <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-slate-600">
          Trang này giữ song song hai thế giới: chữ máy để đọc như đề JLPT, và chữ viết tay từ KanjiVG để tập nét.
          Bạn có thể lọc Kanji, xem từ liên quan, rồi xuất PDF danh sách hoặc phiếu luyện viết.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/kanji"
            className="rounded-full border border-emerald-200 bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-emerald-700 transition hover:bg-emerald-50"
          >
            Quay lại Kanji
          </Link>
          <Link
            href="/kanji/write-flashcard"
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-slate-700 transition hover:bg-slate-50"
          >
            Mở luyện viết
          </Link>
        </div>
      </div>

      <KanjiHandwritingClient
        items={items}
        initialQuery={initialQuery}
        initialLevel={initialLevel}
        initialSource={initialSource}
      />
    </section>
  );
}
