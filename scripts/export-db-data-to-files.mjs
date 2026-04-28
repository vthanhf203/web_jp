import "dotenv/config";

import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const USER_VOCAB_PREFIX = "user_vocab_store:";

async function writeJson(filePath, payload) {
  const content = `${JSON.stringify(payload, null, 2)}\n`;
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
}

async function clearUserVocabFiles(vocabDir) {
  try {
    const entries = await readdir(vocabDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) {
        continue;
      }
      await unlink(path.join(vocabDir, entry.name));
    }
  } catch {
    // Folder may not exist yet.
  }
}

function parseUserIdFromKey(key) {
  if (!key.startsWith(USER_VOCAB_PREFIX)) {
    return null;
  }
  const userId = key.slice(USER_VOCAB_PREFIX.length).trim();
  return userId || null;
}

async function main() {
  const rootDir = process.cwd();
  const adminFile = path.join(rootDir, "data", "admin-vocab-library.json");
  const grammarFile = path.join(rootDir, "data", "grammar", "minna-n4n5.json");
  const userVocabDir = path.join(rootDir, "data", "vocab-lessons");

  const [admin, grammar, userStores] = await Promise.all([
    prisma.appData.findUnique({
      where: { key: "admin_vocab_library" },
      select: { value: true },
    }),
    prisma.appData.findUnique({
      where: { key: "grammar_dataset" },
      select: { value: true },
    }),
    prisma.appData.findMany({
      where: { key: { startsWith: USER_VOCAB_PREFIX } },
      select: { key: true, value: true },
      orderBy: { key: "asc" },
    }),
  ]);

  if (admin?.value) {
    await writeJson(adminFile, admin.value);
  }

  if (grammar?.value) {
    await writeJson(grammarFile, grammar.value);
  }

  await mkdir(userVocabDir, { recursive: true });
  await clearUserVocabFiles(userVocabDir);

  let exportedUserStoreCount = 0;
  for (const entry of userStores) {
    const userId = parseUserIdFromKey(entry.key);
    if (!userId) {
      continue;
    }
    await writeJson(path.join(userVocabDir, `${userId}.json`), entry.value);
    exportedUserStoreCount += 1;
  }

  console.log("DB -> file export done");
  console.log(`- admin vocab: ${admin?.value ? "exported" : "missing in DB"}`);
  console.log(`- grammar dataset: ${grammar?.value ? "exported" : "missing in DB"}`);
  console.log(`- user vocab stores: ${exportedUserStoreCount} file(s) exported`);
}

main()
  .catch((error) => {
    console.error("Export failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
