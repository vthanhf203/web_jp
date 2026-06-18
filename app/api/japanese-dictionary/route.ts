import { NextResponse } from "next/server";

import {
  loadOpenJapaneseDictionary,
  searchOpenJapaneseDictionary,
  type OpenDictionaryLookupKind,
} from "@/lib/open-japanese-dictionary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseKind(value: string | null): OpenDictionaryLookupKind {
  if (value === "word" || value === "kanji") {
    return value;
  }
  return "all";
}

function parseLimit(value: string | null): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) {
    return 20;
  }
  return Math.min(80, Math.max(1, parsed));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim();
  const kind = parseKind(url.searchParams.get("type"));
  const limit = parseLimit(url.searchParams.get("limit"));

  const dictionary = await loadOpenJapaneseDictionary();
  const result = searchOpenJapaneseDictionary(dictionary, query, {
    kind,
    limit,
  });

  return NextResponse.json(
    {
      query,
      type: kind,
      limit,
      loaded: {
        updatedAt: dictionary.updatedAt,
        words: dictionary.words.length,
        kanji: dictionary.kanji.length,
        source: dictionary.source,
      },
      items: result,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
