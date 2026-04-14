"use client";

import { useActionState, useMemo, useRef, useState } from "react";

import {
  importVocabAction,
  type VocabImportState,
} from "@/app/actions/vocab-manager";
import { parseVocabInput, type ImportedVocabRow } from "@/lib/vocab-import";

const initialState: VocabImportState = {
  status: "idle",
  message: "",
};

type Props = {
  lessonId: string | null;
};

type PreviewError = {
  line: number;
  message: string;
};

function toJsonLines(rows: ImportedVocabRow[]): string {
  return rows
    .map((row) =>
      JSON.stringify({
        word: row.word,
        reading: row.reading,
        kanji: row.kanji,
        hanviet: row.hanviet,
        partOfSpeech: row.partOfSpeech,
        meaning: row.meaning,
      })
    )
    .join("\n");
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const output: string[] = [];
  let current = "";
  let insideQuote = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (insideQuote && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        insideQuote = !insideQuote;
      }
      continue;
    }

    if (char === delimiter && !insideQuote) {
      output.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  output.push(current.trim());
  return output;
}

function parseDelimited(text: string): { rows: ImportedVocabRow[]; errors: PreviewError[] } {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { rows: [], errors: [] };
  }

  const delimiter = lines[0].includes("\t")
    ? "\t"
    : lines[0].includes(";")
      ? ";"
      : lines[0].includes("|")
        ? "|"
        : ",";

  const headers = splitCsvLine(lines[0], delimiter).map(normalizeHeader);
  const headerMap = new Map<string, number>();
  headers.forEach((header, index) => headerMap.set(header, index));

  const idx = (keys: string[]): number => {
    for (const key of keys) {
      const found = headerMap.get(normalizeHeader(key));
      if (typeof found === "number") {
        return found;
      }
    }
    return -1;
  };

  const wordIndex = idx(["word", "jp", "japanese", "term", "tu"]);
  const readingIndex = idx(["reading", "hiragana", "kana", "yomi"]);
  const kanjiIndex = idx(["kanji", "han", "chuhan"]);
  const hanvietIndex = idx(["hanviet", "han_viet", "sino"]);
  const posIndex = idx(["partofspeech", "pos", "type"]);
  const meaningIndex = idx(["meaning", "vi", "vn", "nghia", "translation"]);

  const rows: ImportedVocabRow[] = [];
  const errors: PreviewError[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const cells = splitCsvLine(lines[i], delimiter);
    const lineNumber = i + 1;

    const word = (wordIndex >= 0 ? cells[wordIndex] : cells[0] ?? "")?.trim();
    const meaning = (meaningIndex >= 0 ? cells[meaningIndex] : cells[cells.length - 1] ?? "")?.trim();
    if (!word || !meaning) {
      errors.push({ line: lineNumber, message: "Thieu word hoac meaning" });
      continue;
    }

    const reading = (readingIndex >= 0 ? cells[readingIndex] : word)?.trim();

    rows.push({
      word,
      reading: reading || word,
      kanji: (kanjiIndex >= 0 ? cells[kanjiIndex] : "")?.trim() || "",
      hanviet: (hanvietIndex >= 0 ? cells[hanvietIndex] : "")?.trim() || "",
      partOfSpeech: (posIndex >= 0 ? cells[posIndex] : "")?.trim() || "",
      meaning,
    });
  }

  return { rows, errors };
}

function parseFileContent(fileName: string, content: string): { rows: ImportedVocabRow[]; errors: PreviewError[]; note?: string } {
  const lower = fileName.toLowerCase();

  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    return {
      rows: [],
      errors: [],
      note: "Dang chua doc truc tiep .xlsx trong trinh duyet nay. Ban xuat sang CSV roi keo-tha lai nhe.",
    };
  }

  if (lower.endsWith(".csv") || lower.endsWith(".tsv")) {
    const parsed = parseDelimited(content);
    return parsed;
  }

  const rows = parseVocabInput(content);
  return { rows, errors: [] };
}

export function VocabImportForm({ lessonId }: Props) {
  const [state, formAction, pending] = useActionState(importVocabAction, initialState);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [previewRows, setPreviewRows] = useState<ImportedVocabRow[]>([]);
  const [previewErrors, setPreviewErrors] = useState<PreviewError[]>([]);
  const [previewNote, setPreviewNote] = useState("");
  const [dragActive, setDragActive] = useState(false);

  const hasLesson = Boolean(lessonId);

  const summaryText = useMemo(() => {
    if (previewRows.length === 0 && previewErrors.length === 0 && !previewNote) {
      return "";
    }
    const rowText = `${previewRows.length} dong hop le`;
    const errText = previewErrors.length > 0 ? `, ${previewErrors.length} dong loi` : "";
    return `${rowText}${errText}`;
  }, [previewErrors.length, previewRows.length, previewNote]);

  async function loadFile(file: File) {
    const content = await file.text();
    const parsed = parseFileContent(file.name, content);

    setPreviewRows(parsed.rows.slice(0, 20));
    setPreviewErrors(parsed.errors.slice(0, 20));
    setPreviewNote(parsed.note ?? "");

    if (textareaRef.current) {
      textareaRef.current.value = toJsonLines(parsed.rows);
    }
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="lessonId" value={lessonId ?? ""} />

      <div
        className={`rounded-xl border-2 border-dashed px-4 py-4 transition ${
          dragActive
            ? "border-sky-400 bg-sky-50"
            : "border-slate-300 bg-slate-50"
        }`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={async (event) => {
          event.preventDefault();
          setDragActive(false);
          if (!hasLesson || pending) {
            return;
          }
          const file = event.dataTransfer.files?.[0];
          if (!file) {
            return;
          }
          await loadFile(file);
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-slate-800">Keo-tha file vao day</p>
            <p className="text-xs text-slate-600">Ho tro JSON / CSV / TSV. XLSX dang o che do huong dan chuyen CSV.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn-soft text-sm"
              disabled={!hasLesson || pending}
              onClick={() => fileInputRef.current?.click()}
            >
              Chon file
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.csv,.tsv,.txt,.xlsx,.xls"
              className="hidden"
              disabled={!hasLesson || pending}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) {
                  return;
                }
                await loadFile(file);
                event.currentTarget.value = "";
              }}
            />
          </div>
        </div>
      </div>

      <textarea
        ref={textareaRef}
        name="rawInput"
        className="min-h-58 w-full resize-y rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-sky-400 focus:ring-3 focus:ring-sky-100"
        placeholder="Ho tro JSON array, JSON-lines, CSV/TSV. Field chuan: word, reading, kanji, hanviet, partOfSpeech, meaning."
        disabled={!hasLesson || pending}
        required
      />

      {summaryText ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          {summaryText}
          {previewNote ? ` · ${previewNote}` : ""}
        </div>
      ) : null}

      {previewErrors.length > 0 ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          <p className="font-semibold">Loi du lieu (toi da 20 dong):</p>
          <ul className="mt-1 list-disc pl-5">
            {previewErrors.map((error) => (
              <li key={`${error.line}-${error.message}`}>Dong {error.line}: {error.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {previewRows.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-2 py-2">Word</th>
                <th className="px-2 py-2">Reading</th>
                <th className="px-2 py-2">Kanji</th>
                <th className="px-2 py-2">Han Viet</th>
                <th className="px-2 py-2">Meaning</th>
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row, index) => (
                <tr key={`${row.word}-${index}`} className="border-t border-slate-100 text-slate-700">
                  <td className="px-2 py-1.5">{row.word}</td>
                  <td className="px-2 py-1.5">{row.reading}</td>
                  <td className="px-2 py-1.5">{row.kanji || "-"}</td>
                  <td className="px-2 py-1.5">{row.hanviet || "-"}</td>
                  <td className="px-2 py-1.5">{row.meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {state.message ? (
        <p
          className={
            state.status === "error"
              ? "rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
              : "rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
          }
        >
          {state.message}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          className="inline-flex items-center rounded-xl bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!hasLesson || pending}
        >
          {pending ? "Dang nhap..." : "Nhap du lieu vao he thong"}
        </button>
        <button
          type="button"
          className="inline-flex items-center rounded-xl border border-fuchsia-200 bg-fuchsia-50 px-4 py-2.5 text-sm font-semibold text-fuchsia-600"
          onClick={() => {
            if (!textareaRef.current) {
              return;
            }
            textareaRef.current.value =
              '{"word":"べんきょう","reading":"べんきょう","kanji":"勉強","hanviet":"Mien Cuong","partOfSpeech":"noun","meaning":"Hoc tap"}\n{"word":"でんしゃ","reading":"でんしゃ","kanji":"電車","hanviet":"Dien Xa","partOfSpeech":"noun","meaning":"Tau dien"}\n{"word":"ありがとう","reading":"ありがとう","kanji":"","hanviet":"","partOfSpeech":"expression","meaning":"Cam on"}';
            setPreviewRows([
              {
                word: "べんきょう",
                reading: "べんきょう",
                kanji: "勉強",
                hanviet: "Mien Cuong",
                partOfSpeech: "noun",
                meaning: "Hoc tap",
              },
              {
                word: "でんしゃ",
                reading: "でんしゃ",
                kanji: "電車",
                hanviet: "Dien Xa",
                partOfSpeech: "noun",
                meaning: "Tau dien",
              },
              {
                word: "ありがとう",
                reading: "ありがとう",
                kanji: "",
                hanviet: "",
                partOfSpeech: "expression",
                meaning: "Cam on",
              },
            ]);
            setPreviewErrors([]);
            setPreviewNote("");
          }}
          disabled={!hasLesson || pending}
        >
          Mau JSON
        </button>
        <button
          type="button"
          className="ml-auto inline-flex items-center rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-500 hover:bg-slate-100"
          onClick={() => {
            if (textareaRef.current) {
              textareaRef.current.value = "";
            }
            setPreviewRows([]);
            setPreviewErrors([]);
            setPreviewNote("");
          }}
          disabled={pending}
        >
          Bo nhap
        </button>
      </div>
    </form>
  );
}

