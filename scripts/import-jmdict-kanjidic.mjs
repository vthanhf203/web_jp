#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const APP_DATA_KEY = "open_japanese_dictionary";
const JLPT_LEVELS = new Set(["N5", "N4", "N3", "N2", "N1"]);

function usage() {
  console.log(`Import offline JMdict Simplified and KANJIDIC2 JSON files.

Usage:
  npm run data:import-jmdict -- --jmdict ./data/jmdict-eng.json --kanjidic ./data/kanjidic2-en.json

Options:
  --jmdict <file>       JMdict Simplified JSON file
  --kanjidic <file>     KANJIDIC2 JSON file
  --limit-words <n>     Import only the first n normalized JMdict entries
  --limit-kanji <n>     Import only the first n normalized kanji entries
  --replace             Clear omitted categories instead of preserving existing data
  --dry-run             Parse files and print counts without writing to the database
  --help                Show this help text
`);
}

function parseArgs(argv) {
  const options = {
    dryRun: false,
    replace: false,
    jmdict: "",
    kanjidic: "",
    limitWords: undefined,
    limitKanji: undefined,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    const equalsIndex = raw.indexOf("=");
    const name = equalsIndex >= 0 ? raw.slice(0, equalsIndex) : raw;
    const inlineValue = equalsIndex >= 0 ? raw.slice(equalsIndex + 1) : undefined;

    const readValue = () => {
      if (inlineValue !== undefined) {
        return inlineValue;
      }
      index += 1;
      return argv[index] ?? "";
    };

    if (name === "--help" || name === "-h") {
      options.help = true;
    } else if (name === "--dry-run") {
      options.dryRun = true;
    } else if (name === "--replace") {
      options.replace = true;
    } else if (name === "--jmdict" || name === "--jmdict-file") {
      options.jmdict = readValue();
    } else if (name === "--kanjidic" || name === "--kanjidic2") {
      options.kanjidic = readValue();
    } else if (name === "--limit-words") {
      options.limitWords = parsePositiveInt(readValue());
    } else if (name === "--limit-kanji") {
      options.limitKanji = parsePositiveInt(readValue());
    } else {
      throw new Error(`Unknown option: ${raw}`);
    }
  }

  return options;
}

function parsePositiveInt(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function isObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asArray(value) {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function cleanText(value) {
  if (typeof value === "string") {
    return value.normalize("NFKC").trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return "";
}

function unique(values) {
  return Array.from(
    new Set(values.map((value) => cleanText(value)).filter(Boolean))
  );
}

function getAny(object, keys) {
  if (!isObject(object)) {
    return undefined;
  }

  for (const key of keys) {
    if (object[key] !== undefined && object[key] !== null) {
      return object[key];
    }
  }

  return undefined;
}

function pickString(value, keys) {
  const direct = cleanText(value);
  if (direct) {
    return direct;
  }

  if (!isObject(value)) {
    return "";
  }

  for (const key of keys) {
    const picked = cleanText(value[key]);
    if (picked) {
      return picked;
    }
  }

  return "";
}

function extractTextList(value, keys) {
  const texts = [];

  for (const item of asArray(value)) {
    const picked = pickString(item, keys);
    if (picked) {
      texts.push(picked);
    }
  }

  return unique(texts);
}

function collectStrings(value, depth = 4) {
  if (depth < 0 || value === undefined || value === null) {
    return [];
  }
  if (typeof value === "string" || typeof value === "number") {
    return [cleanText(value)].filter(Boolean);
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectStrings(item, depth - 1));
  }
  if (isObject(value)) {
    return Object.values(value).flatMap((item) => collectStrings(item, depth - 1));
  }
  return [];
}

function normalizeJlpt(value) {
  const text = cleanText(value).toUpperCase();
  if (JLPT_LEVELS.has(text)) {
    return text;
  }

  const match =
    text.match(/\bJLPT[-_\s]*N?([1-5])\b/) || text.match(/\bN([1-5])\b/);
  return match ? `N${match[1]}` : "";
}

function normalizeKanjidicJlpt(value) {
  const normalized = normalizeJlpt(value);
  if (normalized) {
    return normalized;
  }

  const parsed = Number.parseInt(cleanText(value), 10);
  if (parsed === 4) {
    return "N5";
  }
  if (parsed === 3) {
    return "N4";
  }
  if (parsed === 2) {
    return "N2";
  }
  if (parsed === 1) {
    return "N1";
  }
  return "";
}

function extractJlptFromEntry(entry) {
  for (const value of collectStrings(entry, 4)) {
    const normalized = normalizeJlpt(value);
    if (normalized) {
      return normalized;
    }
  }
  return "";
}

function hasCommonMarker(value) {
  return collectStrings(value, 4).some((entry) => {
    const normalized = entry.toLowerCase();
    return (
      normalized === "common" ||
      normalized.includes("ichi") ||
      normalized.includes("news") ||
      normalized.includes("spec") ||
      normalized.includes("gai")
    );
  });
}

function findEntryArray(root, keys) {
  if (Array.isArray(root)) {
    return root;
  }

  if (!isObject(root)) {
    return [];
  }

  for (const key of keys) {
    const value = root[key];
    if (Array.isArray(value)) {
      return value;
    }
    if (isObject(value)) {
      const nested = findEntryArray(value, keys);
      if (nested.length > 0) {
        return nested;
      }
    }
  }

  return [];
}

function extractJmdictForms(entry, objectKeys, textKeys) {
  return unique(
    objectKeys.flatMap((key) => extractTextList(entry[key], textKeys))
  );
}

function extractGlosses(senses) {
  const meanings = [];

  for (const sense of asArray(senses)) {
    const glossValue = isObject(sense)
      ? getAny(sense, ["gloss", "glosses", "meaning", "meanings"])
      : sense;

    for (const gloss of asArray(glossValue)) {
      if (isObject(gloss)) {
        const lang = cleanText(
          getAny(gloss, ["lang", "language", "xml:lang"])
        ).toLowerCase();
        if (lang && lang !== "eng" && lang !== "en") {
          continue;
        }
        const text = pickString(gloss, ["text", "value", "gloss", "meaning"]);
        if (text) {
          meanings.push(text);
        }
      } else {
        const text = cleanText(gloss);
        if (text) {
          meanings.push(text);
        }
      }
    }
  }

  return unique(meanings);
}

function extractPartsOfSpeech(senses) {
  return unique(
    asArray(senses).flatMap((sense) => {
      if (!isObject(sense)) {
        return [];
      }
      return [
        ...extractTextList(
          getAny(sense, ["partOfSpeech", "partsOfSpeech", "pos"]),
          ["text", "value", "name", "code"]
        ),
        ...extractTextList(getAny(sense, ["field", "misc"]), [
          "text",
          "value",
          "name",
          "code",
        ]),
      ];
    })
  );
}

function compactKey(value) {
  return cleanText(value).replace(/\s+/g, "");
}

function parseJmdictWords(root, limit) {
  const entries = findEntryArray(root, ["words", "entries", "jmdict", "JMdict"]);
  const byKey = new Map();

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!isObject(entry)) {
      continue;
    }

    const sourceId =
      pickString(getAny(entry, ["id", "ent_seq", "sequence", "seq"]), [
        "text",
        "value",
      ]) || String(index + 1);
    const kanjiForms = extractJmdictForms(
      entry,
      ["kanji", "kanjiForms", "k_ele", "kEle", "headwords"],
      ["text", "word", "value", "keb"]
    );
    const kanaForms = extractJmdictForms(
      entry,
      ["kana", "reading", "readings", "r_ele", "rEle"],
      ["text", "reading", "value", "reb"]
    );
    const senses = getAny(entry, ["sense", "senses"]) ?? [];
    const meanings =
      extractGlosses(senses).length > 0
        ? extractGlosses(senses)
        : extractTextList(getAny(entry, ["meaning", "meanings", "gloss"]), [
            "text",
            "value",
            "gloss",
            "meaning",
          ]);

    if (meanings.length === 0) {
      continue;
    }

    const readings = kanaForms.length > 0 ? kanaForms : kanjiForms;
    const spellings = kanjiForms.length > 0 ? kanjiForms : readings.slice(0, 1);
    const partsOfSpeech = extractPartsOfSpeech(senses);
    const jlptLevel = extractJlptFromEntry(entry);
    const common =
      entry.common === true ||
      hasCommonMarker(getAny(entry, ["tags", "priority", "misc"])) ||
      hasCommonMarker(getAny(entry, ["kanji", "kana", "k_ele", "r_ele"]));

    for (const spelling of spellings.slice(0, 4)) {
      const reading = readings[0] || spelling;
      if (!spelling || !reading) {
        continue;
      }

      const key = `${compactKey(spelling)}\u0000${compactKey(reading)}`;
      if (byKey.has(key)) {
        continue;
      }

      byKey.set(key, {
        id: `jmdict:${sourceId}:${byKey.size + 1}`,
        word: spelling,
        reading,
        kanji: kanjiForms.includes(spelling) ? spelling : "",
        meanings: meanings.slice(0, 8),
        partsOfSpeech: partsOfSpeech.slice(0, 8),
        jlptLevel,
        common,
        source: "JMdict",
      });

      if (limit && byKey.size >= limit) {
        return Array.from(byKey.values());
      }
    }
  }

  return Array.from(byKey.values());
}

function firstNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.floor(value);
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const parsed = firstNumber(item);
      if (parsed !== null) {
        return parsed;
      }
    }
  }
  if (isObject(value)) {
    for (const item of Object.values(value)) {
      const parsed = firstNumber(item);
      if (parsed !== null) {
        return parsed;
      }
    }
  }
  return null;
}

function pickNumber(object, keys) {
  for (const key of keys) {
    const value = isObject(object) ? object[key] : undefined;
    const parsed = firstNumber(value);
    if (parsed !== null) {
      return parsed;
    }
  }
  return null;
}

function extractReadingMeaning(entry) {
  const onReadings = [];
  const kunReadings = [];
  const nanori = [];
  const meanings = [];

  onReadings.push(
    ...extractTextList(getAny(entry, ["onReadings", "on", "onyomi"]), [
      "text",
      "value",
      "reading",
    ])
  );
  kunReadings.push(
    ...extractTextList(getAny(entry, ["kunReadings", "kun", "kunyomi"]), [
      "text",
      "value",
      "reading",
    ])
  );
  nanori.push(
    ...extractTextList(getAny(entry, ["nanori", "nameReadings"]), [
      "text",
      "value",
      "reading",
    ])
  );
  meanings.push(
    ...extractTextList(getAny(entry, ["meanings", "meaning"]), [
      "text",
      "value",
      "meaning",
    ])
  );

  const readingMeaning = getAny(entry, [
    "readingMeaning",
    "reading_meaning",
    "readingsMeanings",
    "readings_meanings",
  ]);
  const groupsValue = isObject(readingMeaning)
    ? getAny(readingMeaning, ["groups", "group", "rmgroup"])
    : readingMeaning;

  for (const group of asArray(groupsValue)) {
    if (!isObject(group)) {
      continue;
    }

    meanings.push(
      ...extractTextList(getAny(group, ["meanings", "meaning"]), [
        "text",
        "value",
        "meaning",
      ])
    );

    for (const reading of asArray(getAny(group, ["readings", "reading"]))) {
      const text = pickString(reading, ["text", "value", "reading"]);
      if (!text) {
        continue;
      }
      const type = cleanText(
        isObject(reading)
          ? getAny(reading, ["type", "r_type", "readingType"])
          : ""
      ).toLowerCase();

      if (type.includes("ja_on") || type.includes("on")) {
        onReadings.push(text);
      } else if (type.includes("ja_kun") || type.includes("kun")) {
        kunReadings.push(text);
      }
    }
  }

  return {
    meanings: unique(meanings).slice(0, 12),
    onReadings: unique(onReadings).slice(0, 12),
    kunReadings: unique(kunReadings).slice(0, 12),
    nanori: unique(nanori).slice(0, 12),
  };
}

function parseKanjidicCharacters(root, limit) {
  const entries = findEntryArray(root, [
    "characters",
    "character",
    "kanji",
    "kanjidic2",
  ]);
  const byCharacter = new Map();

  for (const entry of entries) {
    if (!isObject(entry)) {
      continue;
    }

    const character = pickString(entry.literal, ["text", "value"]) ||
      pickString(entry.character, ["text", "value"]) ||
      pickString(entry.kanji, ["text", "value"]);
    if (!character || byCharacter.has(character)) {
      continue;
    }

    const misc = isObject(entry.misc) ? entry.misc : {};
    const readingMeaning = extractReadingMeaning(entry);
    const rawJlpt =
      getAny(entry, ["jlptLevel", "jlpt"]) ??
      getAny(misc, ["jlptLevel", "jlpt"]);

    byCharacter.set(character, {
      id: character,
      character,
      meanings: readingMeaning.meanings,
      onReadings: readingMeaning.onReadings,
      kunReadings: readingMeaning.kunReadings,
      nanori: readingMeaning.nanori,
      strokeCount:
        pickNumber(entry, ["strokeCount", "stroke_count", "strokes"]) ??
        pickNumber(misc, ["strokeCount", "stroke_count", "strokeCounts"]) ??
        0,
      jlptLevel: normalizeKanjidicJlpt(rawJlpt),
      grade: pickNumber(entry, ["grade"]) ?? pickNumber(misc, ["grade"]),
      frequency:
        pickNumber(entry, ["frequency", "freq"]) ??
        pickNumber(misc, ["frequency", "freq"]),
      source: "KANJIDIC2",
    });

    if (limit && byCharacter.size >= limit) {
      return Array.from(byCharacter.values());
    }
  }

  return Array.from(byCharacter.values());
}

async function readJson(filePath) {
  const absolutePath = path.resolve(filePath);
  const raw = await readFile(absolutePath, "utf8");
  return JSON.parse(raw);
}

async function loadExistingStore(prisma) {
  const record = await prisma.appData.findUnique({
    where: { key: APP_DATA_KEY },
    select: { value: true },
  });

  const value = isObject(record?.value) ? record.value : {};
  return {
    source: isObject(value.source) ? value.source : {},
    words: Array.isArray(value.words) ? value.words : [],
    kanji: Array.isArray(value.kanji) ? value.kanji : [],
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }

  if (!options.jmdict && !options.kanjidic) {
    usage();
    throw new Error("Provide at least --jmdict or --kanjidic.");
  }

  const source = {};
  let words = null;
  let kanji = null;

  if (options.jmdict) {
    const root = await readJson(options.jmdict);
    words = parseJmdictWords(root, options.limitWords);
    source.jmdict = path.basename(options.jmdict);
    console.log(`Parsed JMdict words: ${words.length}`);
  }

  if (options.kanjidic) {
    const root = await readJson(options.kanjidic);
    kanji = parseKanjidicCharacters(root, options.limitKanji);
    source.kanjidic2 = path.basename(options.kanjidic);
    console.log(`Parsed KANJIDIC2 kanji: ${kanji.length}`);
  }

  if (options.dryRun) {
    console.log("Dry run complete. Database was not changed.");
    return;
  }

  const prisma = new PrismaClient();
  try {
    const existing = options.replace
      ? { source: {}, words: [], kanji: [] }
      : await loadExistingStore(prisma);
    const payload = {
      updatedAt: new Date().toISOString(),
      source: {
        ...existing.source,
        ...source,
      },
      words: words ?? existing.words,
      kanji: kanji ?? existing.kanji,
    };

    await prisma.appData.upsert({
      where: { key: APP_DATA_KEY },
      create: {
        key: APP_DATA_KEY,
        value: payload,
      },
      update: {
        value: payload,
      },
    });

    console.log(
      `Imported open dictionary: ${payload.words.length} words, ${payload.kanji.length} kanji.`
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
