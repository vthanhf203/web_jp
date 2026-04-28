import "dotenv/config";

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { PrismaClient, type Prisma } from "@prisma/client";

const prisma = new PrismaClient();

const USER_VOCAB_PREFIX = "user_vocab_store:";
const USER_KANJI_PREFIX = "user_kanji_store:";

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStrokeCount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(1, Math.floor(value));
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return Math.max(1, Math.floor(parsed));
    }
  }
  return 1;
}

function normalizeJlptLevel(value: unknown): string {
  const text = normalizeText(value).toUpperCase();
  if (text === "N1" || text === "N2" || text === "N3" || text === "N4") {
    return text;
  }
  return "N5";
}

function toInputJson(value: unknown): Prisma.InputJsonValue | null {
  if (value === null) {
    return null;
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value as Prisma.InputJsonValue;
  }
  if (typeof value === "object") {
    return value as Prisma.InputJsonValue;
  }
  return null;
}

async function readJsonFile(filePath: string): Promise<unknown | null> {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function upsertAppData(key: string, value: unknown): Promise<boolean> {
  const payload = toInputJson(value);
  if (payload === null) {
    return false;
  }
  await prisma.appData.upsert({
    where: { key },
    create: { key, value: payload },
    update: { value: payload },
  });
  return true;
}

async function migrateAppDataFile(options: {
  rootDir: string;
  relativeFilePath: string;
  appDataKey: string;
}): Promise<boolean> {
  const filePath = path.join(options.rootDir, options.relativeFilePath);
  const json = await readJsonFile(filePath);
  if (json === null) {
    return false;
  }
  return upsertAppData(options.appDataKey, json);
}

type ParsedKanjiRow = {
  character: string;
  meaning: string;
  onReading: string;
  kunReading: string;
  strokeCount: number;
  jlptLevel: string;
  exampleWord: string;
  exampleMeaning: string;
};

function parseKanjiRows(value: unknown): ParsedKanjiRow[] {
  const list =
    Array.isArray(value)
      ? value
      : value && typeof value === "object" && Array.isArray((value as { items?: unknown[] }).items)
        ? (value as { items: unknown[] }).items
        : [];
  const deduped = new Map<string, ParsedKanjiRow>();

  for (const raw of list) {
    if (!raw || typeof raw !== "object") {
      continue;
    }
    const source = raw as Record<string, unknown>;
    const character = normalizeText(source.character ?? source.kanji ?? source.word);
    const meaning = normalizeText(source.meaning ?? source.nghia ?? source.translation ?? source.vi);
    if (!character || !meaning) {
      continue;
    }
    const onReading = normalizeText(source.onReading ?? source.on ?? source.onyomi) || "-";
    const kunReading = normalizeText(source.kunReading ?? source.kun ?? source.kunyomi) || "-";
    const strokeCount = normalizeStrokeCount(
      source.strokeCount ?? source.strokes ?? source.net
    );
    const jlptLevel = normalizeJlptLevel(source.jlptLevel ?? source.level ?? source.jlpt);
    const exampleWord =
      normalizeText(source.exampleWord ?? source.example ?? source.tuViDu) || character;
    const exampleMeaning =
      normalizeText(source.exampleMeaning ?? source.exampleNghia ?? source.viDuNghia) || meaning;

    deduped.set(character, {
      character,
      meaning,
      onReading,
      kunReading,
      strokeCount,
      jlptLevel,
      exampleWord,
      exampleMeaning,
    });
  }

  return Array.from(deduped.values());
}

async function migrateSystemKanji(rootDir: string): Promise<{
  found: boolean;
  processedCount: number;
  createdCount: number;
  updatedCount: number;
}> {
  const filePath = path.join(rootDir, "data", "kanji-system.json");
  const json = await readJsonFile(filePath);
  if (json === null) {
    return {
      found: false,
      processedCount: 0,
      createdCount: 0,
      updatedCount: 0,
    };
  }

  const rows = parseKanjiRows(json);
  if (rows.length === 0) {
    return {
      found: true,
      processedCount: 0,
      createdCount: 0,
      updatedCount: 0,
    };
  }

  const existing = await prisma.kanji.findMany({
    where: {
      character: {
        in: rows.map((item) => item.character),
      },
    },
    select: {
      character: true,
    },
  });
  const existingSet = new Set(existing.map((item) => item.character));

  let createdCount = 0;
  let updatedCount = 0;
  for (const row of rows) {
    const data = {
      meaning: row.meaning,
      onReading: row.onReading,
      kunReading: row.kunReading,
      strokeCount: row.strokeCount,
      jlptLevel: row.jlptLevel,
      exampleWord: row.exampleWord,
      exampleMeaning: row.exampleMeaning,
    };

    await prisma.kanji.upsert({
      where: { character: row.character },
      create: {
        character: row.character,
        ...data,
      },
      update: data,
    });

    if (existingSet.has(row.character)) {
      updatedCount += 1;
    } else {
      createdCount += 1;
    }
  }

  return {
    found: true,
    processedCount: rows.length,
    createdCount,
    updatedCount,
  };
}

async function migrateUserStoresFromDir(options: {
  rootDir: string;
  folderName: string;
  keyPrefix: string;
}): Promise<number> {
  const dirPath = path.join(options.rootDir, "data", options.folderName);
  try {
    const files = await readdir(dirPath, { withFileTypes: true });
    let count = 0;
    for (const file of files) {
      if (!file.isFile() || !file.name.endsWith(".json")) {
        continue;
      }
      const userId = file.name.slice(0, -5).trim();
      if (!userId) {
        continue;
      }
      const json = await readJsonFile(path.join(dirPath, file.name));
      if (json === null) {
        continue;
      }
      const ok = await upsertAppData(`${options.keyPrefix}${userId}`, json);
      if (ok) {
        count += 1;
      }
    }
    return count;
  } catch {
    return 0;
  }
}

async function main() {
  const rootDir = process.cwd();

  const [
    systemKanjiResult,
    kanjiMetadataOk,
    adminVocabOk,
    grammarOk,
    adminConjugationOk,
    userVocabStoreCount,
    userKanjiStoreCount,
  ] = await Promise.all([
    migrateSystemKanji(rootDir),
    migrateAppDataFile({
      rootDir,
      relativeFilePath: path.join("data", "admin-kanji-metadata.json"),
      appDataKey: "admin_kanji_metadata",
    }),
    migrateAppDataFile({
      rootDir,
      relativeFilePath: path.join("data", "admin-vocab-library.json"),
      appDataKey: "admin_vocab_library",
    }),
    migrateAppDataFile({
      rootDir,
      relativeFilePath: path.join("data", "grammar", "minna-n4n5.json"),
      appDataKey: "grammar_dataset",
    }),
    migrateAppDataFile({
      rootDir,
      relativeFilePath: path.join("data", "admin-conjugation-library.json"),
      appDataKey: "admin_conjugation_library",
    }),
    migrateUserStoresFromDir({
      rootDir,
      folderName: "vocab-lessons",
      keyPrefix: USER_VOCAB_PREFIX,
    }),
    migrateUserStoresFromDir({
      rootDir,
      folderName: "kanji-lessons",
      keyPrefix: USER_KANJI_PREFIX,
    }),
  ]);

  console.log("File -> DB migration done");
  console.log(
    `- system kanji: ${
      systemKanjiResult.found
        ? `${systemKanjiResult.processedCount} rows (${systemKanjiResult.createdCount} created, ${systemKanjiResult.updatedCount} updated)`
        : "not found (data/kanji-system.json)"
    }`
  );
  console.log(
    `- admin kanji metadata: ${
      kanjiMetadataOk ? "migrated" : "not found (data/admin-kanji-metadata.json)"
    }`
  );
  console.log(`- admin vocab: ${adminVocabOk ? "migrated" : "not found"}`);
  console.log(`- grammar dataset: ${grammarOk ? "migrated" : "not found"}`);
  console.log(
    `- admin conjugation: ${
      adminConjugationOk ? "migrated" : "not found (data/admin-conjugation-library.json)"
    }`
  );
  console.log(`- user vocab stores: ${userVocabStoreCount} file(s) migrated`);
  console.log(`- user kanji stores: ${userKanjiStoreCount} file(s) migrated`);
}

main()
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
