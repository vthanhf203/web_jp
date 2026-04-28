export type ImportedConjugationForm = {
  label: string;
  value: string;
};

export type ImportedConjugationRow = {
  base: string;
  reading: string;
  kanji: string;
  hanviet: string;
  partOfSpeech: string;
  meaning: string;
  note: string;
  forms: ImportedConjugationForm[];
};

type RowImportContext = {
  formKey?: string;
  formLabel?: string;
  rulePatternById?: Map<string, string>;
  groupSummaryById?: Map<string, string>;
  groupLabelById?: Map<string, string>;
};

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeLookupKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

function valueToString(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return "";
}

function pickString(source: Record<string, unknown>, keys: string[]): string {
  const entries = Object.entries(source);
  const normalizedEntryPairs = entries.map(([rawKey, rawValue]) => [
    normalizeLookupKey(rawKey),
    rawValue,
  ] as const);

  for (const key of keys) {
    const directValue = valueToString(source[key]);
    if (directValue) {
      return directValue;
    }

    const normalizedTarget = normalizeLookupKey(key);
    const matched = normalizedEntryPairs.find(([normalizedKey]) => normalizedKey === normalizedTarget);
    const value = matched ? valueToString(matched[1]) : "";
    if (value) {
      return value;
    }
  }
  return "";
}

function normalizeRuleId(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeGroupId(value: string): string {
  return value.trim().toLowerCase();
}

function mergeStringMaps(
  base: Map<string, string> | undefined,
  incoming: Map<string, string>
): Map<string, string> | undefined {
  if (incoming.size === 0) {
    return base;
  }

  const merged = new Map<string, string>();
  if (base) {
    for (const [key, value] of base.entries()) {
      merged.set(key, value);
    }
  }
  for (const [key, value] of incoming.entries()) {
    merged.set(key, value);
  }
  return merged;
}

function defaultGroupLabel(rawGroup: string): string {
  const key = normalizeLookupKey(rawGroup);
  const labels: Record<string, string> = {
    verb: "Động từ",
    verbs: "Động từ",
    iadjective: "Tính từ い",
    iadjectives: "Tính từ い",
    naadjective: "Tính từ な",
    naadjectives: "Tính từ な",
    naadjectivenoun: "Tính từ な / Danh từ",
    noun: "Danh từ",
    nouns: "Danh từ",
  };
  return labels[key] || rawGroup;
}

function buildRulePatternMap(input: unknown): Map<string, string> {
  const map = new Map<string, string>();
  if (!Array.isArray(input)) {
    return map;
  }

  for (const entry of input) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const source = entry as Record<string, unknown>;
    const ruleId = pickString(source, ["rule_id", "ruleId", "id"]);
    const pattern = pickString(source, ["pattern", "rule", "description"]);
    const note = pickString(source, ["note"]);
    if (!ruleId || !pattern) {
      continue;
    }
    map.set(normalizeRuleId(ruleId), note ? `${pattern} (${note})` : pattern);
  }

  return map;
}

function buildGroupSummaryMap(input: unknown): Map<string, string> {
  const map = new Map<string, string>();
  if (!Array.isArray(input)) {
    return map;
  }

  for (const entry of input) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const source = entry as Record<string, unknown>;
    const groupId = pickString(source, ["group", "group_id", "groupId", "id"]);
    if (!groupId) {
      continue;
    }

    const groupName = pickString(source, ["group_name", "groupName", "name"]);
    const description = pickString(source, ["description"]);
    const generalRule = pickString(source, ["general_rule", "generalRule", "pattern"]);
    const specialRule = pickString(source, ["special_rule", "specialRule"]);

    const parts: string[] = [];
    if (groupName) {
      parts.push(groupName);
    }
    if (generalRule) {
      parts.push(`Quy tắc chung: ${generalRule}`);
    }
    if (specialRule) {
      parts.push(`Quy tắc đặc biệt: ${specialRule}`);
    }
    if (description) {
      parts.push(description);
    }

    if (parts.length === 0) {
      continue;
    }

    map.set(normalizeGroupId(groupId), parts.join(" | "));
  }

  return map;
}

function buildGroupLabelMap(input: unknown): Map<string, string> {
  const map = new Map<string, string>();
  if (!Array.isArray(input)) {
    return map;
  }

  for (const entry of input) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const source = entry as Record<string, unknown>;
    const groupId = pickString(source, ["group", "group_id", "groupId", "id"]);
    if (!groupId) {
      continue;
    }

    const groupName = pickString(source, ["group_name", "groupName", "name"]);
    map.set(normalizeGroupId(groupId), groupName || defaultGroupLabel(groupId));
  }

  return map;
}

function toFormLabelFromKey(rawKey: string): string {
  const key = rawKey.trim();
  if (!key) {
    return "Form";
  }

  const compactKey = normalizeLookupKey(key);
  const aliases: Record<string, string> = {
    teform: "Thể て",
    taform: "Thể た",
    naiform: "Thể ない",
    masuform: "Thể ます",
    dictionaryform: "Thể từ điển",
    politeform: "丁寧形",
    plainform: "普通形",
  };

  if (aliases[compactKey]) {
    return aliases[compactKey];
  }

  return key
    .replace(/[_-]+/g, " ")
    .replace(/\bform\b/i, "thể")
    .replace(/\s+/g, " ")
    .trim();
}

function parseFormsFromFormKeys(
  source: Record<string, unknown>,
  context: RowImportContext
): ImportedConjugationForm[] {
  const pairs: ImportedConjugationForm[] = [];
  const used = new Set<string>();

  const pushPair = (label: string, value: string) => {
    const cleanLabel = normalizeText(label);
    const cleanValue = normalizeText(value);
    if (!cleanLabel || !cleanValue) {
      return;
    }
    const key = `${cleanLabel}::${cleanValue}`;
    if (used.has(key)) {
      return;
    }
    used.add(key);
    pairs.push({ label: cleanLabel, value: cleanValue });
  };

  const targetValue = pickString(source, ["target_form", "targetForm", "target form"]);
  const plainValue = pickString(source, ["plain_form", "plainForm", "plain form"]);
  if (plainValue) {
    pushPair(toFormLabelFromKey("plain_form"), plainValue);
  } else if (targetValue) {
    pushPair(context.formLabel || "Kết quả", targetValue);
  } else if (context.formKey) {
    const mappedValue = pickString(source, [context.formKey]);
    if (mappedValue) {
      pushPair(context.formLabel || toFormLabelFromKey(context.formKey), mappedValue);
    }
  }

  for (const [key, value] of Object.entries(source)) {
    const normalizedKey = key.toLowerCase();
    const compactKey = normalizeLookupKey(key);
    const isFormField =
      normalizedKey.endsWith("_form") ||
      normalizedKey.endsWith(" form") ||
      compactKey.endsWith("form");

    if (
      !isFormField ||
      compactKey === "masuform" ||
      compactKey === "politeform" ||
      compactKey === "sourceform" ||
      compactKey === "targetform" ||
      (context.formKey && compactKey === normalizeLookupKey(context.formKey))
    ) {
      continue;
    }
    const cleanValue = normalizeText(value);
    if (!cleanValue) {
      continue;
    }
    pushPair(toFormLabelFromKey(key), cleanValue);
  }

  return pairs;
}

function parseFormsFromObject(source: Record<string, unknown>): ImportedConjugationForm[] {
  const pairs: ImportedConjugationForm[] = [];
  for (const [rawLabel, rawValue] of Object.entries(source)) {
    const label = normalizeText(rawLabel);
    const value =
      rawValue && typeof rawValue === "object" && !Array.isArray(rawValue)
        ? pickString(rawValue as Record<string, unknown>, ["value", "text", "form", "result"])
        : normalizeText(rawValue);
    if (!label || !value) {
      continue;
    }
    pairs.push({ label, value });
  }
  return pairs;
}

function parseFormsFromText(raw: string): ImportedConjugationForm[] {
  return raw
    .split(/[;\n]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [label, ...rest] = part.split(/[:=]/);
      return {
        label: normalizeText(label),
        value: normalizeText(rest.join(":")),
      };
    })
    .filter((entry) => entry.label && entry.value);
}

function parseForms(input: unknown): ImportedConjugationForm[] {
  if (Array.isArray(input)) {
    return input
      .map((entry) => {
        if (!entry || typeof entry !== "object") {
          return null;
        }
        const source = entry as Record<string, unknown>;
        const label = pickString(source, ["label", "name", "form", "key", "type"]);
        const value = pickString(source, ["value", "reading", "text", "result", "output"]);
        if (!label || !value) {
          return null;
        }
        return { label, value };
      })
      .filter((entry): entry is ImportedConjugationForm => !!entry);
  }

  if (input && typeof input === "object") {
    return parseFormsFromObject(input as Record<string, unknown>);
  }

  if (typeof input === "string") {
    return parseFormsFromText(input);
  }

  return [];
}

function rowFromObject(
  input: Record<string, unknown>,
  context: RowImportContext = {}
): ImportedConjugationRow | null {
  const base = pickString(input, [
    "base",
    "baseWord",
    "source_form",
    "sourceForm",
    "source form",
    "polite_form",
    "politeForm",
    "polite form",
    "dictionaryForm",
    "masu_form",
    "word",
    "term",
    "japanese",
  ]);
  const meaning = pickString(input, [
    "meaning",
    "meaning_vi",
    "translation",
    "vi",
    "vn",
    "nghia",
  ]);
  if (!base || !meaning) {
    return null;
  }

  const forms = parseForms(
    input.forms ?? input.conjugations ?? input.variants ?? input.patterns
  );
  if (forms.length === 0) {
    forms.push(...parseFormsFromFormKeys(input, context));
  }

  const ruleId = pickString(input, ["rule_id", "ruleId"]);
  const rulePattern =
    ruleId && context.rulePatternById
      ? context.rulePatternById.get(normalizeRuleId(ruleId)) || ""
      : "";

  const sourceNote = pickString(input, ["note", "memo", "hint"]);
  const group = pickString(input, ["group", "item_type", "itemType", "wordType", "type"]);
  const groupLabel =
    group && context.groupLabelById
      ? context.groupLabelById.get(normalizeGroupId(group)) || defaultGroupLabel(group)
      : group
        ? defaultGroupLabel(group)
        : "";
  const groupSummary =
    group && context.groupSummaryById
      ? context.groupSummaryById.get(normalizeGroupId(group)) || ""
      : "";

  const notes: string[] = [];
  if (sourceNote) {
    notes.push(sourceNote);
  }
  if (groupLabel) {
    notes.push(`Nhóm: ${groupLabel}`);
  }
  if (rulePattern) {
    notes.push(`Quy tắc: ${rulePattern}`);
  }
  if (groupSummary) {
    notes.push(`Mô tả nhóm: ${groupSummary}`);
  }

  return {
    base,
    reading: pickString(input, ["reading", "kana", "hiragana", "yomi"]),
    kanji: pickString(input, ["kanji", "surface"]),
    hanviet: pickString(input, ["hanviet", "han_viet", "hanViet"]),
    partOfSpeech: pickString(input, ["partOfSpeech", "pos", "wordType", "type"]),
    meaning,
    note: notes.join(" | "),
    forms,
  };
}

function buildContextFromContainer(
  source: Record<string, unknown>,
  inherited: RowImportContext = {}
): RowImportContext {
  const formKey = pickString(source, [
    "form",
    "target_form",
    "targetForm",
    "form_key",
    "formKey",
  ]);
  const formLabel = pickString(source, ["form_label", "formLabel"]);

  const mergedRuleMap = mergeStringMaps(
    inherited.rulePatternById,
    buildRulePatternMap(source.rules ?? source.ruleList ?? source.rule_list ?? source["rule list"])
  );

  const groupInput =
    source.group_descriptions ??
    source.groupDescriptions ??
    source["group descriptions"] ??
    source.group_list ??
    source.groupList ??
    source.groups;
  const mergedGroupMap = mergeStringMaps(
    inherited.groupSummaryById,
    buildGroupSummaryMap(groupInput)
  );
  const mergedGroupLabelMap = mergeStringMaps(
    inherited.groupLabelById,
    buildGroupLabelMap(groupInput)
  );

  return {
    formKey: formKey || inherited.formKey,
    formLabel:
      formLabel ||
      inherited.formLabel ||
      (formKey ? toFormLabelFromKey(formKey) : undefined),
    rulePatternById: mergedRuleMap,
    groupSummaryById: mergedGroupMap,
    groupLabelById: mergedGroupLabelMap,
  };
}

function rowsFromContainer(
  source: Record<string, unknown>,
  inherited: RowImportContext = {}
): ImportedConjugationRow[] {
  const context = buildContextFromContainer(source, inherited);

  const sectionList =
    source.sections ??
    source.sectionList ??
    source.section_list ??
    source["section list"];
  if (Array.isArray(sectionList)) {
    const rowsFromSections: ImportedConjugationRow[] = [];
    for (const section of sectionList) {
      if (!section || typeof section !== "object" || Array.isArray(section)) {
        continue;
      }
      rowsFromSections.push(
        ...rowsFromContainer(section as Record<string, unknown>, context)
      );
    }
    if (rowsFromSections.length > 0) {
      return rowsFromSections;
    }
  }

  const listCandidate =
    source.items ??
    source.rows ??
    source.data ??
    source.itemList ??
    source.item_list ??
    source["item list"];
  if (!Array.isArray(listCandidate)) {
    return [];
  }

  return listCandidate
    .map((entry) =>
      entry && typeof entry === "object"
        ? rowFromObject(entry as Record<string, unknown>, context)
        : null
    )
    .filter((entry): entry is ImportedConjugationRow => !!entry);
}

function parseJsonInput(rawInput: string): ImportedConjugationRow[] {
  const parsed = JSON.parse(rawInput) as unknown;

  if (Array.isArray(parsed)) {
    const rows: ImportedConjugationRow[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object") {
        continue;
      }
      const source = entry as Record<string, unknown>;
      const row = rowFromObject(source);
      if (row) {
        rows.push(row);
        continue;
      }
      rows.push(...rowsFromContainer(source));
    }
    return rows;
  }

  if (parsed && typeof parsed === "object") {
    const source = parsed as Record<string, unknown>;
    const containerRows = rowsFromContainer(source);
    if (containerRows.length > 0) {
      return containerRows;
    }

    const single = rowFromObject(source);
    if (single) {
      return [single];
    }
  }

  return [];
}

function parseLineInput(rawInput: string): ImportedConjugationRow[] {
  const rows: ImportedConjugationRow[] = [];
  for (const rawLine of rawInput.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    if (line.startsWith("{") && line.endsWith("}")) {
      try {
        const parsed = JSON.parse(line) as unknown;
        if (parsed && typeof parsed === "object") {
          const row = rowFromObject(parsed as Record<string, unknown>);
          if (row) {
            rows.push(row);
          }
        }
      } catch {
        // Skip invalid JSON line.
      }
      continue;
    }

    const [base, meaning, formsText = ""] = line.split("|").map((part) => part.trim());
    if (!base || !meaning) {
      continue;
    }

    rows.push({
      base,
      reading: "",
      kanji: "",
      hanviet: "",
      partOfSpeech: "",
      meaning,
      note: "",
      forms: parseFormsFromText(formsText),
    });
  }
  return rows;
}

export function parseConjugationInput(rawInput: string): ImportedConjugationRow[] {
  const text = rawInput.trim();
  if (!text) {
    return [];
  }

  try {
    const fromJson = parseJsonInput(text);
    if (fromJson.length > 0) {
      return fromJson;
    }
  } catch {
    // Continue to line parser.
  }

  return parseLineInput(text);
}
