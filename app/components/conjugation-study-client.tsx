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
  rows: TableRow[];
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
  ruleKey: string;
  ruleLabel: string;
  baseText: string;
  formValue: string;
  meaning: string;
};

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function firstForm(item: ConjugationStudyItem): { label: string; value: string } {
  if (item.forms.length === 0) {
    return { label: "The can hoc", value: "-" };
  }
  const first = item.forms[0];
  return {
    label: normalizeText(first.label || "The can hoc"),
    value: normalizeText(first.value || "-"),
  };
}

function compactRuleText(value: string): string {
  const clean = normalizeText(value);
  if (!clean) {
    return "Khong co quy tac";
  }
  const noPrefix = clean.replace(/^quy\s*tac\s*:\s*/i, "").replace(/^rule\s*:\s*/i, "");
  const main = noPrefix.split("(")[0]?.trim() || noPrefix;
  return main || "Khong co quy tac";
}

function extractRule(note: string): string {
  const clean = normalizeText(note);
  if (!clean) {
    return "Khong co quy tac";
  }
  const matched = clean.match(/(?:quy\s*tac|rule)\s*:\s*([^|]+)/i);
  if (matched?.[1]) {
    return compactRuleText(matched[1]);
  }
  return compactRuleText(clean);
}

function extractGroup(note: string): { key: string; title: string; order: number } {
  const clean = normalizeText(note);
  const matched = clean.match(/(?:nhom|group)\s*(\d+)/i);
  if (matched?.[1]) {
    const numeric = Number(matched[1]);
    if (Number.isFinite(numeric)) {
      return {
        key: `group_${numeric}`,
        title: `Nhom ${numeric}`,
        order: numeric,
      };
    }
  }
  return {
    key: "group_other",
    title: "Nhom khac",
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
      ruleKey: `${group.key}::${rule.toLowerCase()}`,
      ruleLabel: rule,
      baseText: renderBase(item),
      formValue: form.value,
      meaning: normalizeText(item.meaning) || "-",
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
        title: row.groupOrder === 999 ? "Nhom khac" : `Nhom ${row.groupOrder}`,
        rows: [row],
      });
      continue;
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
  return sorted[0]?.[0] ?? "The can hoc";
}

export function ConjugationStudyClient({
  level,
  lessonTitle,
  lessonDescription,
  items,
}: {
  level: string;
  lessonTitle: string;
  lessonDescription: string;
  items: ConjugationStudyItem[];
}) {
  const rows = useMemo(() => toRows(items), [items]);
  const sections = useMemo(() => toGroupSections(rows), [rows]);
  const formHeader = useMemo(() => detectMainFormLabel(items), [items]);

  return (
    <section className="space-y-4">
      <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          Bang chia the
        </p>
        <h2 className="mt-1 text-2xl font-extrabold text-slate-900">
          {level} | {lessonTitle}
        </h2>
        {lessonDescription ? (
          <p className="mt-1 text-sm text-slate-600">{lessonDescription}</p>
        ) : null}
        <p className="mt-2 text-xs text-slate-500">
          Bang da toi uu de hien du trong 1 khung hinh, de doc nhanh theo quy tac.
        </p>
      </article>

      {sections.map((section) => {
        const buckets = toRuleBuckets(section.rows);

        return (
          <article
            key={section.key}
            className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
          >
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
              <h3 className="text-lg font-bold text-slate-800">({section.title})</h3>
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
                    <th className="border border-slate-300 px-3 py-2 text-left font-bold">V (ます)</th>
                    <th className="border border-slate-300 px-3 py-2 text-left font-bold">Cach chia</th>
                    <th className="border border-slate-300 px-3 py-2 text-left font-bold">{formHeader}</th>
                    <th className="border border-slate-300 px-3 py-2 text-left font-bold">Nghia</th>
                  </tr>
                </thead>
                <tbody>
                  {buckets.map((bucket) =>
                    bucket.rows.map((row, rowIndex) => (
                      <tr key={row.id} className="odd:bg-white even:bg-slate-50">
                        <td className="border border-slate-300 px-3 py-2 font-semibold text-slate-800 whitespace-nowrap">
                          {row.baseText}
                        </td>
                        {rowIndex === 0 ? (
                          <td
                            className="border border-slate-300 px-3 py-2 align-top font-semibold text-slate-700 break-words leading-6"
                            rowSpan={bucket.rows.length}
                          >
                            {bucket.label}
                          </td>
                        ) : null}
                        <td className="border border-slate-300 px-3 py-2 font-semibold text-indigo-700 whitespace-nowrap">
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

