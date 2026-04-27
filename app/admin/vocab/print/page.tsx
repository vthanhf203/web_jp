import { WorksheetPrintToolbar } from "@/app/components/worksheet-print-toolbar";
import {
  JLPT_LEVELS,
  loadAdminVocabLibrary,
  type JlptLevel,
} from "@/lib/admin-vocab-library";
import { requireAdmin } from "@/lib/admin";

import styles from "./page.module.css";

type SearchParams = Promise<{
  level?: string | string[];
  lesson?: string | string[];
}>;

type ExportLevel = JlptLevel | "ALL";

type ExportRow = {
  level: JlptLevel;
  lessonId: string;
  lessonTitle: string;
  word: string;
  kanji: string;
  hanviet: string;
  meaning: string;
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

function parseExportLevel(value: string): ExportLevel {
  const normalized = value.trim().toUpperCase();
  if (normalized === "ALL") {
    return "ALL";
  }
  if (JLPT_LEVELS.includes(normalized as JlptLevel)) {
    return normalized as JlptLevel;
  }
  return "N5";
}

export default async function AdminVocabPrintPage(props: { searchParams: SearchParams }) {
  await requireAdmin();
  const params = await props.searchParams;
  const level = parseExportLevel(pickSingle(params.level) || "ALL");
  const lessonId = pickSingle(params.lesson).trim();
  const library = await loadAdminVocabLibrary();

  const lessonsByLevel =
    level === "ALL"
      ? library.lessons
      : library.lessons.filter((lesson) => lesson.jlptLevel === level);

  const selectedLesson = lessonId
    ? lessonsByLevel.find((lesson) => lesson.id === lessonId) ?? null
    : null;
  const lessons = selectedLesson ? [selectedLesson] : lessonsByLevel;

  const rows = lessons
    .flatMap((lesson) =>
      lesson.items.map(
        (item): ExportRow => ({
          level: lesson.jlptLevel,
          lessonId: lesson.id,
          lessonTitle: lesson.title,
          word: item.word,
          kanji: item.kanji || "",
          hanviet: item.hanviet || "",
          meaning: item.meaning,
        })
      )
    )
    .sort((a, b) => {
      const levelCompare = a.level.localeCompare(b.level);
      if (levelCompare !== 0) {
        return levelCompare;
      }
      const topicCompare = a.lessonTitle.localeCompare(b.lessonTitle, "vi", {
        sensitivity: "base",
      });
      if (topicCompare !== 0) {
        return topicCompare;
      }
      return a.word.localeCompare(b.word, "ja", { sensitivity: "base" });
    });

  const MAX_PRINT_ROWS = 5000;
  const printRows = rows.slice(0, MAX_PRINT_ROWS);
  const isTruncated = rows.length > printRows.length;
  const today = new Date().toLocaleDateString("vi-VN");

  const backHref = selectedLesson
    ? `/admin/vocab?level=${selectedLesson.jlptLevel}&lesson=${selectedLesson.id}`
    : level === "ALL"
      ? "/admin/vocab"
      : `/admin/vocab?level=${level}`;

  const titleSuffix = selectedLesson
    ? ` • Chủ đề: ${selectedLesson.title}`
    : ` • ${level === "ALL" ? "Tất cả cấp" : `Cấp ${level}`}`;

  return (
    <section className={styles.pageWrap}>
      <div className={styles.toolbar}>
        <p className="text-sm text-slate-600">
          Bảng xuất {level === "ALL" ? "tất cả cấp" : `cấp ${level}`} •{" "}
          <span className="font-semibold text-slate-800">{printRows.length}</span> từ
          {isTruncated ? " (đã giới hạn 5000 dòng)" : ""}.
        </p>
        <WorksheetPrintToolbar backHref={backHref} />
      </div>

      <article className={styles.paper}>
        <header className={styles.header}>
          <h1 className={styles.title}>Bảng từ vựng{titleSuffix}</h1>
          <p className={styles.meta}>Ngày xuất: {today}</p>
        </header>

        {printRows.length === 0 ? (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
            Không có dữ liệu từ vựng để xuất ở bộ lọc hiện tại.
          </p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>STT</th>
                  <th>Cấp</th>
                  <th>Từ</th>
                  <th>Kanji</th>
                  <th>Hán Việt</th>
                  <th>Nghĩa</th>
                </tr>
              </thead>
              <tbody>
                {printRows.map((row, index) => (
                  <tr key={`${row.level}-${row.lessonId}-${row.word}-${index}`}>
                    <td>{index + 1}</td>
                    <td>{row.level}</td>
                    <td>{row.word}</td>
                    <td>{row.kanji || "-"}</td>
                    <td>{row.hanviet || "-"}</td>
                    <td>{row.meaning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>
    </section>
  );
}
