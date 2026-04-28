"use client";

import { useMemo } from "react";

type ConjugationFormView = {
  id: string;
  label: string;
  value: string;
};

export type ConjugationStudyItem = {
  id: string;
  base: string;
  reading: string;
  kanji: string;
  hanviet: string;
  partOfSpeech: string;
  meaning: string;
  note: string;
  forms: ConjugationFormView[];
};

type GroupSection = {
  key: string;
  sortOrder: number;
  title: string;
  summary: GroupSummary;
  rows: TableRow[];
};

type GroupSummary = {
  description: string;
  rules: string[];
};

type RuleBucket = {
  key: string;
  label: string;
  rows: TableRow[];
};

type TableRow = {
  id: string;
  order: number;
  groupKey: string;
  groupOrder: number;
  groupTitle: string;
  ruleKey: string;
  ruleLabel: string;
  baseText: string;
  formValue: string;
  meaning: string;
  groupSummary: GroupSummary;
};

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function stripInlineFurigana(value: string): string {
  return value.replace(/([一-龯々〆ヵヶ])[(（][ぁ-ゖァ-ヺー]+[)）]/g, "$1");
}

function firstForm(item: ConjugationStudyItem): { label: string; value: string } {
  if (item.forms.length === 0) {
    return { label: "Thể cần học", value: "-" };
  }
  const first = item.forms[0];
  return {
    label: normalizeText(first.label || "Thể cần học"),
    value: stripInlineFurigana(normalizeText(first.value || "-")),
  };
}

function compactRuleText(value: string): string {
  const clean = normalizeText(value);
  if (!clean) {
    return "Không có quy tắc";
  }
  const noPrefix = clean
    .replace(/^quy\s*t(?:ac|ắc)\s*:\s*/i, "")
    .replace(/^rule\s*:\s*/i, "");
  const main = noPrefix.split("(")[0]?.trim() || noPrefix;
  return main || "Không có quy tắc";
}

function extractRule(note: string): string {
  const clean = normalizeText(note);
  if (!clean) {
    return "Không có quy tắc";
  }
  const matched = clean.match(/(?:quy\s*t(?:ac|ắc)|rule)\s*:\s*([^|]+)/i);
  if (matched?.[1]) {
    return compactRuleText(matched[1]);
  }

  const fallback = clean
    .split("|")
    .map((segment) => normalizeText(segment))
    .find(
      (segment) =>
        segment &&
        !/^(?:nhom|nhóm|group)\s*\d+/i.test(segment) &&
        !/^mô\s*tả\s*nhóm\s*:/i.test(segment)
    );

  if (!fallback || fallback.length > 80) {
    return "Không có quy tắc";
  }
  return compactRuleText(fallback);
}

function extractGroup(note: string): { key: string; title: string; order: number } {
  const clean = normalizeText(note);
  const matched = clean.match(/(?:nhom|nhóm|group)\s*(\d+)/i);
  if (matched?.[1]) {
    const numeric = Number(matched[1]);
    if (Number.isFinite(numeric)) {
      return {
        key: `group_${numeric}`,
        title: `Nhóm ${numeric}`,
        order: numeric,
      };
    }
  }

  const named = clean.match(/nhóm\s*:\s*([^|]+)/i);
  if (named?.[1]) {
    const title = normalizeText(named[1]);
    const normalized = title.toLowerCase();
    const order =
      normalized.includes("động từ")
        ? 1
        : normalized.includes("tính từ い")
          ? 2
          : normalized.includes("tính từ な") || normalized.includes("danh từ")
            ? 3
            : 998;

    return {
      key: `group_${title.toLowerCase().replace(/\s+/g, "_")}`,
      title,
      order,
    };
  }

  return {
    key: "group_other",
    title: "Nhóm khác",
    order: 999,
  };
}

function renderBase(item: ConjugationStudyItem): string {
  const base = normalizeText(item.base);
  const kanji = normalizeText(item.kanji);
  if (kanji && kanji !== base) {
    return `${base} (${kanji})`;
  }
  return base || kanji || "-";
}

function emptyGroupSummary(): GroupSummary {
  return {
    description: "",
    rules: [],
  };
}

function hasGroupSummary(summary: GroupSummary): boolean {
  return Boolean(summary.description || summary.rules.length > 0);
}

function extractGroupSummary(note: string): GroupSummary {
  const segments = note
    .split("|")
    .map((segment) => normalizeText(segment))
    .filter(Boolean);
  const startIndex = segments.findIndex((segment) =>
    /^mô\s*tả\s*nhóm\s*:/i.test(segment)
  );

  if (startIndex < 0) {
    return emptyGroupSummary();
  }

  const rawParts = [
    segments[startIndex].replace(/^mô\s*tả\s*nhóm\s*:\s*/i, ""),
    ...segments.slice(startIndex + 1),
  ]
    .map((part) => normalizeText(part))
    .filter(Boolean);

  const rules: string[] = [];
  const descriptions: string[] = [];

  for (const part of rawParts) {
    if (
      /^nhóm\s*\d+$/i.test(part) ||
      /^(động từ|tính từ い|tính từ な|tính từ な\s*\/\s*danh từ|danh từ)$/i.test(part)
    ) {
      continue;
    }
    if (/^quy\s*tắc\s*(?:chung|đặc\s*biệt)\s*:/i.test(part)) {
      rules.push(part);
      continue;
    }
    descriptions.push(part);
  }

  return {
    description: descriptions.join(" "),
    rules,
  };
}

function toRows(items: ConjugationStudyItem[]): TableRow[] {
  return items.map((item, index) => {
    const form = firstForm(item);
    const group = extractGroup(item.note);
    const rule = extractRule(item.note);

    return {
      id: item.id,
      order: index,
      groupKey: group.key,
      groupOrder: group.order,
      groupTitle: group.title,
      ruleKey: `${group.key}::${rule.toLowerCase()}`,
      ruleLabel: rule,
      baseText: stripInlineFurigana(renderBase(item)),
      formValue: form.value,
      meaning: normalizeText(item.meaning) || "-",
      groupSummary: extractGroupSummary(item.note),
    };
  });
}

function toGroupSections(rows: TableRow[]): GroupSection[] {
  const map = new Map<string, GroupSection>();

  for (const row of rows) {
    const current = map.get(row.groupKey);
    if (!current) {
      map.set(row.groupKey, {
        key: row.groupKey,
        sortOrder: row.groupOrder,
        title: row.groupTitle,
        summary: row.groupSummary,
        rows: [row],
      });
      continue;
    }
    if (!hasGroupSummary(current.summary) && hasGroupSummary(row.groupSummary)) {
      current.summary = row.groupSummary;
    }
    current.rows.push(row);
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) {
      return a.sortOrder - b.sortOrder;
    }
    const firstA = a.rows[0]?.order ?? 0;
    const firstB = b.rows[0]?.order ?? 0;
    return firstA - firstB;
  });
}

function toRuleBuckets(rows: TableRow[]): RuleBucket[] {
  const buckets: RuleBucket[] = [];
  const indexByKey = new Map<string, number>();

  for (const row of rows) {
    const foundIndex = indexByKey.get(row.ruleKey);
    if (typeof foundIndex === "number") {
      buckets[foundIndex].rows.push(row);
      continue;
    }
    const nextIndex = buckets.length;
    indexByKey.set(row.ruleKey, nextIndex);
    buckets.push({
      key: row.ruleKey,
      label: row.ruleLabel,
      rows: [row],
    });
  }

  return buckets;
}

function detectMainFormLabel(items: ConjugationStudyItem[]): string {
  const count = new Map<string, number>();
  for (const item of items) {
    const label = firstForm(item).label;
    count.set(label, (count.get(label) ?? 0) + 1);
  }
  const sorted = Array.from(count.entries()).sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] ?? "Thể cần học";
}

function detectSourceHeader(formHeader: string): string {
  const normalized = formHeader.toLowerCase();
  if (formHeader.includes("普通形") || normalized.includes("plain")) {
    return "丁寧形";
  }
  return "V (ます)";
}

export function ConjugationStudyClient({
  level,
  lessonTitle,
  lessonDescription,
  showIntro = true,
  items,
}: {
  level: string;
  lessonTitle: string;
  lessonDescription: string;
  showIntro?: boolean;
  items: ConjugationStudyItem[];
}) {
  const rows = useMemo(() => toRows(items), [items]);
  const sections = useMemo(() => toGroupSections(rows), [rows]);
  const formHeader = useMemo(() => detectMainFormLabel(items), [items]);
  const sourceHeader = useMemo(() => detectSourceHeader(formHeader), [formHeader]);

  return (
    <section className="space-y-4">
      {showIntro ? (
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Bảng chia thể
          </p>
          <h2 className="mt-1 text-2xl font-extrabold text-slate-900">
            {level} | {lessonTitle}
          </h2>
          {lessonDescription ? (
            <p className="mt-1 text-sm text-slate-600">{lessonDescription}</p>
          ) : null}
          <p className="mt-2 text-xs text-slate-500">
            Bảng đã tối ưu để hiển thị đủ trong 1 khung hình, dễ đọc nhanh theo quy tắc.
          </p>
        </article>
      ) : null}

      {sections.map((section) => {
        const buckets = toRuleBuckets(section.rows);

        return (
          <article
            key={section.key}
            className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
          >
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
              <h3 className="text-lg font-bold text-slate-800">({section.title})</h3>
              {hasGroupSummary(section.summary) ? (
                <div className="mt-2 space-y-2">
                  {section.summary.rules.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {section.summary.rules.map((rule) => (
                        <span
                          key={`${section.key}-${rule}`}
                          className="rounded-full border border-sky-200 bg-white px-2.5 py-1 text-xs font-semibold text-sky-700"
                        >
                          {rule}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {section.summary.description ? (
                    <p className="max-w-4xl text-sm leading-relaxed text-slate-600">
                      {section.summary.description}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full table-fixed border-collapse text-sm">
                <colgroup>
                  <col className="w-[16%]" />
                  <col className="w-[50%]" />
                  <col className="w-[16%]" />
                  <col className="w-[18%]" />
                </colgroup>
                <thead>
                  <tr className="bg-slate-100 text-slate-700">
                    <th className="border border-slate-300 px-3 py-2 text-left font-bold">{sourceHeader}</th>
                    <th className="border border-slate-300 px-3 py-2 text-left font-bold">Cách chia</th>
                    <th className="border border-slate-300 px-3 py-2 text-left font-bold">{formHeader}</th>
                    <th className="border border-slate-300 px-3 py-2 text-left font-bold">Nghĩa</th>
                  </tr>
                </thead>
                <tbody>
                  {buckets.map((bucket) =>
                    bucket.rows.map((row, rowIndex) => (
                      <tr key={row.id} className="odd:bg-white even:bg-slate-50">
                        <td className="border border-slate-300 px-3 py-2 font-semibold text-slate-800 whitespace-normal [overflow-wrap:anywhere] break-words">
                          {row.baseText}
                        </td>
                        {rowIndex === 0 ? (
                          <td
                            className="border border-slate-300 px-3 py-2 align-top font-semibold text-slate-700 break-words [overflow-wrap:anywhere] leading-6"
                            rowSpan={bucket.rows.length}
                          >
                            {bucket.label}
                          </td>
                        ) : null}
                        <td className="border border-slate-300 px-3 py-2 font-semibold text-indigo-700 whitespace-normal [overflow-wrap:anywhere] break-words">
                          {row.formValue}
                        </td>
                        <td className="border border-slate-300 px-3 py-2 text-slate-700">
                          {row.meaning}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </article>
        );
      })}
    </section>
  );
}
