import { HandwrittenJapaneseText } from "@/app/components/kanji-handwriting-glyph";
import { WorksheetPrintToolbar } from "@/app/components/worksheet-print-toolbar";
import { requireUser } from "@/lib/auth";
import { loadKanjiHandwritingItems, selectKanjiHandwritingItems } from "@/lib/kanji-handwriting";
import type { HandwritingRelatedWord, KanjiHandwritingItem } from "@/lib/kanji-handwriting-types";

import styles from "./page.module.css";

type SearchParams = Promise<{
  ids?: string | string[];
  title?: string | string[];
}>;

type VocabPrintRow = {
  key: string;
  word: string;
  reading: string;
  hanviet: string;
  meaning: string;
  jlptLevel: string;
  sourceKanji: string;
  sourceLabel: string;
};

function pickSingle(value?: string | string[]): string {
  if (!value) {
    return "";
  }
  return Array.isArray(value) ? value[0] ?? "" : value;
}

function parseIdList(raw: string): string[] {
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

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function extractKanjiChars(value: string): string[] {
  return Array.from(new Set(Array.from(value).filter((char) => /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(char))));
}

function splitInlineReading(value: string): { surface: string; reading: string } {
  const trimmed = value.trim();
  const match = trimmed.match(/^(.+?)[(（]([^()（）]+)[)）]$/);
  if (!match) {
    return { surface: trimmed, reading: "" };
  }
  return {
    surface: match[1].trim(),
    reading: match[2].trim(),
  };
}

function isLikelyVocabularySurface(value: string): boolean {
  const surface = value.trim();
  if (!surface) {
    return false;
  }
  if (/[~〜()[\]（）「」『』【】]/.test(surface)) {
    return false;
  }
  if (/[。、！？!?]/.test(surface)) {
    return false;
  }
  if (/\s/.test(surface)) {
    return false;
  }
  if (Array.from(surface).length > 8) {
    return false;
  }
  return extractKanjiChars(surface).length > 0;
}

function pickHanviet(item: KanjiHandwritingItem, word: HandwritingRelatedWord): string {
  const direct = word.hanviet.trim();
  if (direct) {
    return direct;
  }
  const surface = splitInlineReading(word.kanji || word.word).surface;
  return surface === item.character ? item.hanviet : "";
}

function scoreRow(row: VocabPrintRow): number {
  let score = 0;
  if (row.reading && row.reading !== "-") score += 8;
  if (row.hanviet && row.hanviet !== "-") score += 6;
  if (row.word.length > 1) score += 4;
  if (row.sourceLabel.includes("cá nhân") || row.sourceLabel.includes("Cá nhân")) score += 2;
  score += Math.min(row.meaning.length, 60) / 100;
  return score;
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

  const currentKey = normalizeKey(cleanCurrent);
  const nextKey = normalizeKey(cleanNext);
  if (currentKey === nextKey || currentKey.includes(nextKey)) {
    return cleanCurrent;
  }
  if (nextKey.includes(currentKey)) {
    return cleanNext;
  }
  return `${cleanCurrent}; ${cleanNext}`;
}

function mergeRows(current: VocabPrintRow, next: VocabPrintRow): VocabPrintRow {
  const primary = scoreRow(next) > scoreRow(current) ? next : current;
  const secondary = primary === next ? current : next;

  return {
    ...primary,
    reading: primary.reading || secondary.reading,
    hanviet: primary.hanviet || secondary.hanviet,
    meaning: mergeMeaning(primary.meaning, secondary.meaning),
    sourceLabel: primary.sourceLabel || secondary.sourceLabel,
    sourceKanji: primary.sourceKanji || secondary.sourceKanji,
  };
}

function buildVocabRows(items: KanjiHandwritingItem[]): VocabPrintRow[] {
  const rows = new Map<string, VocabPrintRow>();

  for (const item of items) {
    for (const word of item.relatedWords) {
      const parsedSurface = splitInlineReading(word.kanji || word.word);
      const surface = parsedSurface.surface;
      const reading = word.reading.trim() || parsedSurface.reading;
      const meaning = word.meaning.trim();
      if (!surface || !meaning) {
        continue;
      }
      if (!isLikelyVocabularySurface(surface)) {
        continue;
      }

      const key = normalizeKey(surface);
      const nextRow = {
        key,
        word: surface,
        reading,
        hanviet: pickHanviet(item, word),
        meaning,
        jlptLevel: word.jlptLevel,
        sourceKanji: item.character,
        sourceLabel: word.sourceLabel,
      };
      const existing = rows.get(key);
      if (existing) {
        rows.set(key, mergeRows(existing, nextRow));
        continue;
      }

      rows.set(key, nextRow);
    }
  }

  return Array.from(rows.values()).sort((a, b) => {
    if (a.jlptLevel !== b.jlptLevel) {
      return a.jlptLevel.localeCompare(b.jlptLevel);
    }
    return a.word.localeCompare(b.word, "ja");
  });
}

export default async function KanjiHandwritingPrintPage(props: { searchParams: SearchParams }) {
  const user = await requireUser();
  const params = await props.searchParams;
  const title = pickSingle(params.title).trim() || "Tổng hợp từ vựng Kanji viết tay";
  const selectedIds = parseIdList(pickSingle(params.ids));
  const allItems = await loadKanjiHandwritingItems(user.id);
  const selectedItems = selectKanjiHandwritingItems(allItems, selectedIds, 120).slice(0, 160);
  const rows = buildVocabRows(selectedItems).slice(0, 600);
  const selectedKanjiLabel = selectedItems.map((item) => item.character).join("、");
  const today = new Date().toLocaleDateString("vi-VN");

  return (
    <section className={styles.pageWrap}>
      <div className={styles.toolbar}>
        <p className="text-sm text-slate-600">
          Bảng gồm <span className="font-semibold text-slate-800">{rows.length}</span> từ vựng liên quan từ{" "}
          <span className="font-semibold text-slate-800">{selectedItems.length}</span> Kanji.
        </p>
        <WorksheetPrintToolbar backHref="/kanji/handwriting" />
      </div>

      <article className={styles.paper}>
        <header className={styles.titleBand}>
          <h1>{title}</h1>
        </header>

        <div className={styles.metaRow}>
          <p>
            Ngày in: {today} · Kanji đã chọn:{" "}
            <span lang="ja" className="font-kanji">
              {selectedKanjiLabel || "-"}
            </span>
          </p>
          <p>{rows.length} từ</p>
        </div>

        {rows.length === 0 ? (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
            Chưa có từ vựng liên quan để in. Hãy quay lại trang Kanji viết tay và chọn Kanji có từ liên quan.
          </p>
        ) : (
          <table className={styles.vocabTable}>
            <colgroup>
              <col className={styles.colIndex} />
              <col className={styles.colKanji} />
              <col className={styles.colHanviet} />
              <col className={styles.colReading} />
              <col className={styles.colMeaning} />
            </colgroup>
            <thead>
              <tr>
                <th>STT</th>
                <th>KANJI</th>
                <th>ÂM HÁN VIỆT</th>
                <th>HIRAGANA</th>
                <th>NGHĨA</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.key}>
                  <td className={styles.indexCell}>{index + 1}</td>
                  <td className={styles.kanjiCell}>
                    <div className={styles.kanjiSurface}>
                      <HandwrittenJapaneseText
                        text={row.word}
                        glyphClassName="h-[1.22em] w-[1.22em]"
                        kanaClassName="font-kanji text-[0.95em] font-bold"
                        strokeWidth={5.2}
                      />
                    </div>
                    <p className={styles.sourceHint}>
                      Gốc:{" "}
                      <span lang="ja" className="font-kanji">
                        {row.sourceKanji}
                      </span>
                    </p>
                  </td>
                  <td className={styles.hanvietCell}>{row.hanviet || "-"}</td>
                  <td className={styles.readingCell}>
                    <span lang="ja" className="font-kanji">
                      {row.reading || "-"}
                    </span>
                  </td>
                  <td className={styles.meaningCell}>{row.meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <p className={styles.legend}>
          Ghi chú: cột KANJI render theo nét viết tay KanjiVG khi tải được dữ liệu; Hiragana giữ font Nhật để đọc rõ.
        </p>
      </article>
    </section>
  );
}
