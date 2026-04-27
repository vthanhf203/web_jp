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

function normalizeRuleId(value: string): string {
  return value.trim().toLowerCase();
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
    map.set(
      normalizeRuleId(ruleId),
      note ? `${pattern} (${note})` : pattern
    );
  }

  return map;
}

function toFormLabelFromKey(rawKey: string): string {
  const key = rawKey.trim();
  if (!key) {
    return "Form";
  }

  const aliases: Record<string, string> = {
    te_form: "Thể て",
    ta_form: "Thể た",
    nai_form: "Thể ない",
    masu_form: "Thể ます",
    dictionary_form: "Thể từ điển",
  };

  const normalized = key.toLowerCase();
  if (aliases[normalized]) {
    return aliases[normalized];
  }

  return key
    .replace(/_/g, " ")
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

  if (context.formKey) {
    const mappedValue = pickString(source, [context.formKey]);
    if (mappedValue) {
      pushPair(context.formLabel || toFormLabelFromKey(context.formKey), mappedValue);
    }
  }

  for (const [key, value] of Object.entries(source)) {
    const normalizedKey = key.toLowerCase();
    if (!normalizedKey.endsWith("_form") || normalizedKey === "masu_form") {
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
    const value = normalizeText(rawValue);
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
  const group = pickString(input, ["group"]);

  const notes: string[] = [];
  if (sourceNote) {
    notes.push(sourceNote);
  }
  if (group) {
    notes.push(`Nhóm ${group}`);
  }
  if (rulePattern) {
    notes.push(`Quy tắc: ${rulePattern}`);
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

function buildContextFromContainer(source: Record<string, unknown>): RowImportContext {
  const formKey = pickString(source, ["form", "target_form", "targetForm"]);
  const formLabel = pickString(source, ["form_label", "formLabel"]);
  return {
    formKey: formKey || undefined,
    formLabel: formLabel || (formKey ? toFormLabelFromKey(formKey) : undefined),
    rulePatternById: buildRulePatternMap(source.rules),
  };
}

function rowsFromContainer(source: Record<string, unknown>): ImportedConjugationRow[] {
  const listCandidate = source.items ?? source.rows ?? source.data;
  if (!Array.isArray(listCandidate)) {
    return [];
  }
  const context = buildContextFromContainer(source);
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
