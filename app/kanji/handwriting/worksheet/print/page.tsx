import { HandwrittenJapaneseText, HandwrittenKanjiGlyph } from "@/app/components/kanji-handwriting-glyph";
import { WorksheetPrintToolbar } from "@/app/components/worksheet-print-toolbar";
import { requireUser } from "@/lib/auth";
import { loadKanjiHandwritingItems, selectKanjiHandwritingItems } from "@/lib/kanji-handwriting";

import styles from "./page.module.css";

type SearchParams = Promise<{
  ids?: string | string[];
  boxes?: string | string[];
  title?: string | string[];
}>;

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

function parseBoxCount(raw: string): number {
  const parsed = Number(raw.trim());
  if (!Number.isFinite(parsed)) {
    return 10;
  }
  return Math.min(14, Math.max(8, Math.floor(parsed)));
}

function sampleOpacity(index: number): number {
  if (index === 0) return 0.92;
  if (index === 1) return 0.34;
  if (index === 2) return 0.16;
  return 0;
}

export default async function KanjiHandwritingWorksheetPrintPage(props: { searchParams: SearchParams }) {
  const user = await requireUser();
  const params = await props.searchParams;
  const selectedIds = parseIdList(pickSingle(params.ids));
  const boxCount = parseBoxCount(pickSingle(params.boxes));
  const title = pickSingle(params.title).trim() || "Kanji viết tay - luyện viết";
  const allItems = await loadKanjiHandwritingItems(user.id);
  const rows = selectKanjiHandwritingItems(allItems, selectedIds, 80).slice(0, 120);
  const today = new Date().toLocaleDateString("vi-VN");

  return (
    <section className={styles.pageWrap}>
      <div className={styles.toolbar}>
        <p className="text-sm text-slate-600">
          Worksheet gồm <span className="font-semibold text-slate-800">{rows.length}</span> Kanji.
        </p>
        <WorksheetPrintToolbar backHref="/kanji/handwriting" />
      </div>

      <article className={styles.paper}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>{title}</h1>
            <p className={styles.meta}>
              Ngày in: {today} · {boxCount} ô mỗi dòng · có kèm từ vựng liên quan
            </p>
          </div>
          <p className={styles.meta}>{rows.length} Kanji</p>
        </header>

        {rows.length === 0 ? (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
            Chưa có Kanji nào để in. Hãy quay lại trang Kanji viết tay và chọn ít nhất một chữ.
          </p>
        ) : (
          <div className={styles.sheetBody}>
            {rows.map((row) => (
              <section key={row.id} className={styles.row}>
                <div className={styles.side}>
                  <div className={styles.sampleBox}>
                    <HandwrittenKanjiGlyph
                      character={row.character}
                      className="h-12 w-12 text-slate-950"
                      fallbackClassName="font-kanji text-4xl font-semibold leading-none text-slate-950"
                      strokeWidth={4.6}
                    />
                  </div>
                  <div className={styles.rowInfo}>
                    <p className={styles.rowLabel}>{row.meaning}</p>
                    <p className={styles.rowMeta}>
                      {row.jlptLevel} · {row.strokeCount} nét
                      {row.hanviet ? ` · ${row.hanviet}` : ""}
                    </p>
                    <p className={styles.rowReading}>
                      On: <span lang="ja" className="font-kanji">{row.onReading || "-"}</span> · Kun:{" "}
                      <span lang="ja" className="font-kanji">{row.kunReading || "-"}</span>
                    </p>
                    {row.radical ? (
                      <p className={styles.rowMeta}>
                        Bộ: <span lang="ja" className="font-kanji">{row.radical.symbol}</span>{" "}
                        {row.radical.meaning || row.radical.name}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className={styles.practiceArea}>
                  <div
                    className={styles.practiceGrid}
                    style={{ "--grid-columns": String(boxCount) } as Record<string, string>}
                  >
                    {Array.from({ length: boxCount }, (_, cellIndex) => {
                      const opacity = sampleOpacity(cellIndex);
                      return (
                        <div key={`${row.id}-${cellIndex}`} className={styles.practiceCell}>
                          {opacity > 0 ? (
                            <div className={styles.cellSample} style={{ opacity }}>
                              <HandwrittenKanjiGlyph
                                character={row.character}
                                className="h-full w-full text-slate-950"
                                fallbackClassName="font-kanji text-4xl font-semibold leading-none text-slate-950"
                                strokeWidth={4.6}
                              />
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>

                  <div className={styles.related}>
                    {row.relatedWords.length > 0 ? (
                      row.relatedWords.slice(0, 8).map((word) => (
                        <span key={word.id} className={styles.relatedWord}>
                          <HandwrittenJapaneseText
                            text={word.word || word.kanji}
                            glyphClassName="h-[1.15em] w-[1.15em]"
                            kanaClassName="font-kanji"
                            strokeWidth={5}
                          />
                          <span>{word.meaning}</span>
                        </span>
                      ))
                    ) : (
                      <span className={styles.relatedWord}>Chưa có từ liên quan</span>
                    )}
                  </div>
                </div>
              </section>
            ))}
          </div>
        )}

        <p className={styles.legend}>
          Mẹo: ô đầu là mẫu viết tay, hai ô sau mờ dần để đồ nét, các ô còn lại để tự viết.
        </p>
      </article>
    </section>
  );
}
