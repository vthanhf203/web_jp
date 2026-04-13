import "dotenv/config";

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { PrismaClient, type Prisma } from "@prisma/client";

const prisma = new PrismaClient();

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

async function migrateAdminVocab(rootDir: string): Promise<boolean> {
  const filePath = path.join(rootDir, "data", "admin-vocab-library.json");
  const json = await readJsonFile(filePath);
  if (json === null) {
    return false;
  }
  return upsertAppData("admin_vocab_library", json);
}

async function migrateGrammar(rootDir: string): Promise<boolean> {
  const filePath = path.join(rootDir, "data", "grammar", "minna-n4n5.json");
  const json = await readJsonFile(filePath);
  if (json === null) {
    return false;
  }
  return upsertAppData("grammar_dataset", json);
}

async function migrateUserVocabStores(rootDir: string): Promise<number> {
  const vocabDir = path.join(rootDir, "data", "vocab-lessons");
  try {
    const files = await readdir(vocabDir, { withFileTypes: true });
    let count = 0;
    for (const file of files) {
      if (!file.isFile() || !file.name.endsWith(".json")) {
        continue;
      }
      const userId = file.name.slice(0, -5);
      if (!userId) {
        continue;
      }
      const json = await readJsonFile(path.join(vocabDir, file.name));
      if (json === null) {
        continue;
      }
      const ok = await upsertAppData(`user_vocab_store:${userId}`, json);
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

  const [adminOk, grammarOk, userCount] = await Promise.all([
    migrateAdminVocab(rootDir),
    migrateGrammar(rootDir),
    migrateUserVocabStores(rootDir),
  ]);

  console.log("File -> DB migration done");
  console.log(`- admin vocab: ${adminOk ? "migrated" : "not found"}`);
  console.log(`- grammar dataset: ${grammarOk ? "migrated" : "not found"}`);
  console.log(`- user vocab stores: ${userCount} file(s) migrated`);
}

main()
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
