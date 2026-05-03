import { parseKanjiInput, type ImportedKanjiRow } from "@/lib/kanji-import";

type ReportDropItem = {
  at: string;
  reason: string;
  preview: string;
};

type ReportDuplicateItem = {
  character: string;
  firstAt: string;
  duplicateAt: string[];
};

export type KanjiImportReport = {
  totalCandidates: number;
  parsedCount: number;
  dropped: ReportDropItem[];
  duplicates: ReportDuplicateItem[];
};

type FormatReportOptions = {
  maxDetails?: number;
  limitNote?: string;
};

type Candidate = {
  at: string;
  raw: unknown;
};

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function pickString(source: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = normalizeText(source[key]);
    if (value) {
      return value;
    }
  }
  return "";
}

function sanitizeRawInput(rawInput: string): string {
  const text = rawInput.trim();
  if (!text) {
    return "";
  }
  return text
    .replace(/^\s*```(?:json)?\s*$/gim, "")
    .replace(/^\s*```\s*$/gim, "")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .trim();
}

function previewRaw(value: unknown): string {
  if (typeof value === "string") {
    return value.trim().slice(0, 80);
  }
  try {
    return JSON.stringify(value).slice(0, 80);
  } catch {
    return String(value).slice(0, 80);
  }
}

function parseAsJson(text: string): unknown | null {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function extractObjectCandidates(text: string): Candidate[] {
  const parsed = parseAsJson(text);
  if (Array.isArray(parsed)) {
    return parsed.map((item, index) => ({ at: `mục ${index + 1}`, raw: item }));
  }
  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    const list = obj.items ?? obj.kanji ?? obj.data;
    if (Array.isArray(list)) {
      return list.map((item, index) => ({ at: `mục ${index + 1}`, raw: item }));
    }
    return [{ at: "mục 1", raw: obj }];
  }
  return [];
}

function extractJsonLineCandidates(text: string): Candidate[] {
  const lines = text.split(/\r?\n/);
  const output: Candidate[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line.startsWith("{") || !line.includes("}")) {
      continue;
    }
    try {
      const parsed = JSON.parse(line.replace(/,+\s*$/, "")) as unknown;
      output.push({ at: `dòng ${index + 1}`, raw: parsed });
    } catch {
      output.push({ at: `dòng ${index + 1}`, raw: line });
    }
  }
  return output;
}

function extractTextLineCandidates(text: string): Candidate[] {
  const lines = text.split(/\r?\n/);
  const output: Candidate[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) {
      continue;
    }
    output.push({ at: `dòng ${index + 1}`, raw: line });
  }
  return output;
}

function toObjectValidation(raw: unknown): {
  character: string;
  meaning: string;
  reason: string | null;
} {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { character: "", meaning: "", reason: "không phải object hợp lệ" };
  }
  const source = raw as Record<string, unknown>;
  const character = pickString(source, ["character", "kanji", "word", "chu", "text"]);
  const meaning = pickString(source, ["meaning", "nghia", "translation", "vi"]);
  if (!character && !meaning) {
    return { character, meaning, reason: "thiếu cả character và meaning" };
  }
  if (!character) {
    return { character, meaning, reason: "thiếu character" };
  }
  if (!meaning) {
    return { character, meaning, reason: "thiếu meaning" };
  }
  return { character, meaning, reason: null };
}

function toTextValidation(raw: string): {
  character: string;
  meaning: string;
  reason: string | null;
} {
  const parts = raw.split("|").map((item) => item.trim());
  if (parts.length < 2) {
    return { character: "", meaning: "", reason: "không đúng format text (cần character|meaning|...)" };
  }
  const character = parts[0] || "";
  const meaning = parts[1] || "";
  if (!character && !meaning) {
    return { character, meaning, reason: "thiếu cả character và meaning" };
  }
  if (!character) {
    return { character, meaning, reason: "thiếu character" };
  }
  if (!meaning) {
    return { character, meaning, reason: "thiếu meaning" };
  }
  return { character, meaning, reason: null };
}

export function buildKanjiImportReport(rawInput: string): {
  rows: ImportedKanjiRow[];
  report: KanjiImportReport;
} {
  const text = sanitizeRawInput(rawInput);
  const rows = parseKanjiInput(rawInput);
  if (!text) {
    return {
      rows,
      report: {
        totalCandidates: 0,
        parsedCount: 0,
        dropped: [],
        duplicates: [],
      },
    };
  }

  let candidates = extractObjectCandidates(text);
  let mode: "object" | "text" = "object";
  if (candidates.length === 0) {
    candidates = extractJsonLineCandidates(text);
  }
  if (candidates.length === 0) {
    candidates = extractTextLineCandidates(text);
    mode = "text";
  }

  const dropped: ReportDropItem[] = [];
  const seen = new Map<string, string>();
  const duplicatesMap = new Map<string, { firstAt: string; duplicateAt: string[] }>();

  for (const candidate of candidates) {
    const checked =
      mode === "text" && typeof candidate.raw === "string"
        ? toTextValidation(candidate.raw)
        : toObjectValidation(candidate.raw);

    if (checked.reason) {
      dropped.push({
        at: candidate.at,
        reason: checked.reason,
        preview: previewRaw(candidate.raw),
      });
      continue;
    }

    const existingAt = seen.get(checked.character);
    if (!existingAt) {
      seen.set(checked.character, candidate.at);
      continue;
    }
    const tracked = duplicatesMap.get(checked.character);
    if (tracked) {
      tracked.duplicateAt.push(candidate.at);
    } else {
      duplicatesMap.set(checked.character, {
        firstAt: existingAt,
        duplicateAt: [candidate.at],
      });
    }
  }

  const duplicates: ReportDuplicateItem[] = Array.from(duplicatesMap.entries()).map(
    ([character, item]) => ({
      character,
      firstAt: item.firstAt,
      duplicateAt: item.duplicateAt,
    })
  );

  return {
    rows,
    report: {
      totalCandidates: candidates.length,
      parsedCount: rows.length,
      dropped,
      duplicates,
    },
  };
}

export function formatKanjiImportReport(
  report: KanjiImportReport,
  options: FormatReportOptions = {}
): string {
  const maxDetails = options.maxDetails ?? 10;
  const droppedPreview = report.dropped
    .slice(0, maxDetails)
    .map((item) => `- ${item.at}: ${item.reason}${item.preview ? ` | ${item.preview}` : ""}`)
    .join("\n");
  const duplicatePreview = report.duplicates
    .slice(0, maxDetails)
    .map(
      (item) =>
        `- "${item.character}" (giữ ${item.firstAt}, trùng tại ${item.duplicateAt.join(", ")})`
    )
    .join("\n");
  const droppedOverflow =
    report.dropped.length > maxDetails
      ? `\n... và ${report.dropped.length - maxDetails} dòng bị bỏ khác.`
      : "";
  const duplicateOverflow =
    report.duplicates.length > maxDetails
      ? `\n... và ${report.duplicates.length - maxDetails} ký tự trùng khác.`
      : "";

  return [
    "\nBáo cáo import:",
    `- Input nhận: ${report.totalCandidates} mục/dòng`,
    `- Parse hợp lệ: ${report.parsedCount}`,
    `- Bị bỏ: ${report.dropped.length}`,
    `- Ký tự trùng trong input: ${report.duplicates.length}`,
    droppedPreview ? `\nDòng bị bỏ:\n${droppedPreview}${droppedOverflow}` : "",
    duplicatePreview ? `\nKý tự trùng:\n${duplicatePreview}${duplicateOverflow}` : "",
    options.limitNote ? `\n${options.limitNote}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
