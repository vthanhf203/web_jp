import { WorksheetPrintToolbar } from "@/app/components/worksheet-print-toolbar";
import { normalizeJlptLevel } from "@/lib/admin-vocab-library";
import { requireUser } from "@/lib/auth";
import { loadAdminKanjiMetadata } from "@/lib/kanji-metadata";
import { parseCustomKanjiInput } from "@/lib/kanji-worksheet";
import { prisma } from "@/lib/prisma";
import { loadUserKanjiStore } from "@/lib/user-kanji-store";

import styles from "./page.module.css";

type SearchParams = Promise<{
  ids?: string | string[];
  custom?: string | string[];
  boxes?: string | string[];
  title?: string | string[];
}>;

type WorksheetSourceRow = {
  id: string;
  character: string;
  meaning: string;
  reading: string;
  strokeHint: string;
  sourceLabel: string;
};

type WorksheetPrintRow = {
  character: string;
  meaning: string;
  reading: string;
  strokeHint: string;
  sourceLabel: string;
};

function pickSingle(value?: string | string[]): string {
  if (!value) {
    return "";
  }
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value;
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

function parseBoxCount(raw: string): number {
  const parsed = Number(raw.trim());
  if (!Number.isFinite(parsed)) {
    return 10;
  }
  const rounded = Math.floor(parsed);
  return Math.min(16, Math.max(6, rounded));
}

function buildReading(onReading: string, kunReading: string): string {
  const chunks: string[] = [];
  if (onReading.trim()) {
    chunks.push(`On: ${onReading.trim()}`);
  }
  if (kunReading.trim()) {
    chunks.push(`Kun: ${kunReading.trim()}`);
  }
  return chunks.join(" | ");
}

function sampleOpacityByCell(cellIndex: number): number {
  if (cellIndex === 0) return 0.95;
  if (cellIndex === 1) return 0.42;
  if (cellIndex === 2) return 0.24;
  if (cellIndex === 3) return 0.12;
  return 0;
}

function toRowLabel(row: WorksheetPrintRow): string {
  const base = row.meaning.trim() || row.character;
  return base.toUpperCase();
}

export default async function KanjiWorksheetPrintPage(props: { searchParams: SearchParams }) {
  const user = await requireUser();
  const params = await props.searchParams;

  const selectedIds = parseIdList(pickSingle(params.ids));
  const customInput = pickSingle(params.custom);
  const boxCount = parseBoxCount(pickSingle(params.boxes));
  const title = pickSingle(params.title).trim() || "Kanji Writing Worksheet";

  const [dbKanji, kanjiMetadata, userKanjiStore] = await Promise.all([
    prisma.kanji.findMany(),
    loadAdminKanjiMetadata(),
    loadUserKanjiStore(user.id),
  ]);
  const metadataByCharacter = new Map(
    kanjiMetadata.entries.map((entry) => [entry.character, entry])
  );

  const sourceRows: WorksheetSourceRow[] = [
    ...userKanjiStore.items.map((item) => ({
      id: item.id,
      character: item.character,
      meaning: item.meaning,
      reading: buildReading(item.onReading, item.kunReading),
      strokeHint: item.strokeHint || "",
      sourceLabel: "Kanji cá nhân",
    })),
    ...dbKanji.map((item) => ({
      id: item.id,
      character: item.character,
      meaning: item.meaning,
      reading: buildReading(item.onReading, item.kunReading),
      strokeHint: metadataByCharacter.get(item.character)?.strokeHint || "",
      sourceLabel: normalizeJlptLevel(item.jlptLevel),
    })),
  ];

  const byId = new Map(sourceRows.map((item) => [item.id, item]));
  const byCharacter = new Map<string, WorksheetSourceRow>();
  for (const item of sourceRows) {
    if (!byCharacter.has(item.character)) {
      byCharacter.set(item.character, item);
    }
  }

  const rows: WorksheetPrintRow[] = [];
  const usedCharacters = new Set<string>();

  for (const id of selectedIds) {
    const found = byId.get(id);
    if (!found || usedCharacters.has(found.character)) {
      continue;
    }
    usedCharacters.add(found.character);
    rows.push({
      character: found.character,
      meaning: found.meaning,
      reading: found.reading,
      strokeHint: found.strokeHint,
      sourceLabel: found.sourceLabel,
    });
  }

  const customRows = parseCustomKanjiInput(customInput);
  for (const custom of customRows) {
    if (usedCharacters.has(custom.character)) {
      continue;
    }
    usedCharacters.add(custom.character);

    const known = byCharacter.get(custom.character);
    if (known) {
      rows.push({
        character: custom.character,
        meaning: custom.meaning || known.meaning,
        reading: custom.reading || known.reading,
        strokeHint: custom.strokeHint || known.strokeHint,
        sourceLabel: custom.meaning || custom.reading ? "Tự nhập + đối chiếu hệ thống" : known.sourceLabel,
      });
      continue;
    }

    rows.push({
      character: custom.character,
      meaning: custom.meaning || "Tự thêm",
      reading: custom.reading || "",
      strokeHint: custom.strokeHint || "",
      sourceLabel: "Tự nhập",
    });
  }

  const limitedRows = rows.slice(0, 180);
  const isTruncated = rows.length > limitedRows.length;
  const today = new Date().toLocaleDateString("vi-VN");

  return (
    <section className={styles.pageWrap}>
      <div className={styles.toolbar}>
        <p className="text-sm text-slate-600">
          Worksheet gồm <span className="font-semibold text-slate-800">{limitedRows.length}</span> Kanji.
          {isTruncated ? " (Đã giới hạn tối đa 180 dòng mỗi lần in)" : ""}
        </p>
        <WorksheetPrintToolbar backHref="/kanji/worksheet" />
      </div>

      <article className={styles.paper}>
        <header className={styles.header}>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.meta}>
            Ngày in: {today} - Số ô luyện: {boxCount}
          </p>
        </header>

        {limitedRows.length === 0 ? (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
            Chưa có Kanji nào để in. Hãy quay lại và chọn Kanji hoặc tự nhập thêm.
          </p>
        ) : (
          <div className={styles.sheetBody}>
            {limitedRows.map((row) => (
              <section key={row.character} className={styles.row}>
                <header className={styles.rowHeader}>
                  <div className={styles.rowLabelWrap}>
                    <p className={styles.rowLabel}>{toRowLabel(row)}</p>
                    {row.meaning.trim() ? <p className={styles.rowMeaning}>{row.meaning}</p> : null}
                  </div>
                  <p className={styles.rowReading}>{row.reading || " "}</p>
                  <p className={styles.strokeHint}>{row.strokeHint || " "}</p>
                </header>

                <div
                  className={styles.practiceGrid}
                  style={{ "--grid-columns": String(boxCount) } as Record<string, string>}
                >
                  {Array.from({ length: boxCount }, (_, cellIndex) => {
                    const opacity = sampleOpacityByCell(cellIndex);
                    return (
                      <div key={`${row.character}-${cellIndex}`} className={styles.practiceCell}>
                        {opacity > 0 ? (
                          <span className={styles.sampleChar} style={{ opacity }}>
                            {row.character}
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}

        <p className={styles.legend}>
          Mẹo: Ô đầu đậm nhất để nhìn mẫu, các ô sau mờ dần để nhập nét, các ô cuối để tự viết.
        </p>
      </article>
    </section>
  );
}
