import "dotenv/config";

import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const USER_VOCAB_PREFIX = "user_vocab_store:";
const USER_KANJI_PREFIX = "user_kanji_store:";

async function writeJson(filePath, payload) {
  const content = `${JSON.stringify(payload, null, 2)}\n`;
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
}

async function clearJsonFiles(targetDir) {
  try {
    const entries = await readdir(targetDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) {
        continue;
      }
      await unlink(path.join(targetDir, entry.name));
    }
  } catch {
    // Folder may not exist yet.
  }
}

function parseUserIdFromKey(key, prefix) {
  if (!key.startsWith(prefix)) {
    return null;
  }
  const userId = key.slice(prefix.length).trim();
  return userId || null;
}

async function exportUserStores(options) {
  await mkdir(options.dirPath, { recursive: true });
  await clearJsonFiles(options.dirPath);

  let exportedCount = 0;
  for (const entry of options.entries) {
    const userId = parseUserIdFromKey(entry.key, options.prefix);
    if (!userId) {
      continue;
    }
    await writeJson(path.join(options.dirPath, `${userId}.json`), entry.value);
    exportedCount += 1;
  }
  return exportedCount;
}

async function main() {
  const rootDir = process.cwd();
  const adminVocabFile = path.join(rootDir, "data", "admin-vocab-library.json");
  const grammarFile = path.join(rootDir, "data", "grammar", "minna-n4n5.json");
  const adminKanjiMetadataFile = path.join(rootDir, "data", "admin-kanji-metadata.json");
  const adminConjugationFile = path.join(rootDir, "data", "admin-conjugation-library.json");
  const systemKanjiFile = path.join(rootDir, "data", "kanji-system.json");
  const userVocabDir = path.join(rootDir, "data", "vocab-lessons");
  const userKanjiDir = path.join(rootDir, "data", "kanji-lessons");

  const [kanjiRows, adminVocab, grammar, adminKanjiMetadata, adminConjugation, appDataStores] =
    await Promise.all([
      prisma.kanji.findMany({
        orderBy: [{ jlptLevel: "asc" }, { character: "asc" }],
      }),
      prisma.appData.findUnique({
        where: { key: "admin_vocab_library" },
        select: { value: true },
      }),
      prisma.appData.findUnique({
        where: { key: "grammar_dataset" },
        select: { value: true },
      }),
      prisma.appData.findUnique({
        where: { key: "admin_kanji_metadata" },
        select: { value: true },
      }),
      prisma.appData.findUnique({
        where: { key: "admin_conjugation_library" },
        select: { value: true },
      }),
      prisma.appData.findMany({
        where: {
          OR: [{ key: { startsWith: USER_VOCAB_PREFIX } }, { key: { startsWith: USER_KANJI_PREFIX } }],
        },
        select: { key: true, value: true },
        orderBy: { key: "asc" },
      }),
    ]);

  await writeJson(
    systemKanjiFile,
    kanjiRows.map((item) => ({
      character: item.character,
      meaning: item.meaning,
      onReading: item.onReading,
      kunReading: item.kunReading,
      strokeCount: item.strokeCount,
      jlptLevel: item.jlptLevel,
      exampleWord: item.exampleWord,
      exampleMeaning: item.exampleMeaning,
    }))
  );

  if (adminVocab?.value) {
    await writeJson(adminVocabFile, adminVocab.value);
  }
  if (grammar?.value) {
    await writeJson(grammarFile, grammar.value);
  }
  if (adminKanjiMetadata?.value) {
    await writeJson(adminKanjiMetadataFile, adminKanjiMetadata.value);
  }
  if (adminConjugation?.value) {
    await writeJson(adminConjugationFile, adminConjugation.value);
  }

  const userVocabEntries = appDataStores.filter((entry) =>
    entry.key.startsWith(USER_VOCAB_PREFIX)
  );
  const userKanjiEntries = appDataStores.filter((entry) =>
    entry.key.startsWith(USER_KANJI_PREFIX)
  );
  const [exportedUserVocabCount, exportedUserKanjiCount] = await Promise.all([
    exportUserStores({
      dirPath: userVocabDir,
      entries: userVocabEntries,
      prefix: USER_VOCAB_PREFIX,
    }),
    exportUserStores({
      dirPath: userKanjiDir,
      entries: userKanjiEntries,
      prefix: USER_KANJI_PREFIX,
    }),
  ]);

  console.log("DB -> file export done");
  console.log(`- system kanji: ${kanjiRows.length} row(s) exported`);
  console.log(`- admin vocab: ${adminVocab?.value ? "exported" : "missing in DB"}`);
  console.log(`- grammar dataset: ${grammar?.value ? "exported" : "missing in DB"}`);
  console.log(
    `- admin kanji metadata: ${adminKanjiMetadata?.value ? "exported" : "missing in DB"}`
  );
  console.log(
    `- admin conjugation: ${adminConjugation?.value ? "exported" : "missing in DB"}`
  );
  console.log(`- user vocab stores: ${exportedUserVocabCount} file(s) exported`);
  console.log(`- user kanji stores: ${exportedUserKanjiCount} file(s) exported`);
}

main()
  .catch((error) => {
    console.error("Export failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
