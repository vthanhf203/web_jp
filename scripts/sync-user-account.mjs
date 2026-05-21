import "dotenv/config";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { CardType, PrismaClient } from "@prisma/client";

const USER_APP_DATA_PREFIXES = [
  "user_vocab_store:",
  "user_kanji_store:",
  "user_personal_state:",
  "user_reading_practice_store:",
  "user_listening_practice_store:",
  "user_grammar_practice_store:",
  "user_kanji_pick_decks:",
];

function parseArgs(argv) {
  const [modeArg, ...rest] = argv;
  if (modeArg !== "export" && modeArg !== "import") {
    throw new Error(
      "Usage: node scripts/sync-user-account.mjs <export|import> [--email <email>] [--file <path>] [--database-url <url>]"
    );
  }

  const options = {
    mode: modeArg,
    email: undefined,
    filePath: undefined,
    databaseUrl: undefined,
  };
  const positionals = [];

  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    const next = rest[i + 1];
    if (token === "--email" && next) {
      options.email = next.trim().toLowerCase();
      i += 1;
      continue;
    }
    if (token === "--file" && next) {
      options.filePath = next;
      i += 1;
      continue;
    }
    if (token === "--database-url" && next) {
      options.databaseUrl = next;
      i += 1;
      continue;
    }
    if (token.startsWith("--")) {
      throw new Error(`Unknown or incomplete argument: ${token}`);
    }
    positionals.push(token);
  }

  if (options.mode === "export") {
    if (!options.email && positionals[0]) {
      options.email = positionals[0].trim().toLowerCase();
    }
    if (!options.filePath && positionals[1]) {
      options.filePath = positionals[1];
    }
    if (positionals.length > 2) {
      throw new Error("Too many positional arguments for export mode.");
    }
  }

  if (options.mode === "import") {
    if (!options.filePath && positionals[0]) {
      options.filePath = positionals[0];
    }
    if (!options.email && positionals[1]) {
      options.email = positionals[1].trim().toLowerCase();
    }
    if (positionals.length > 2) {
      throw new Error("Too many positional arguments for import mode.");
    }
  }

  return options;
}

function toSafeFileName(input) {
  return input.replace(/[^a-z0-9._-]/gi, "_").toLowerCase();
}

function buildDefaultExportPath(email) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeEmail = toSafeFileName(email);
  return path.join(process.cwd(), "tmp", `user-sync-${safeEmail}-${timestamp}.json`);
}

function getPrisma(databaseUrl) {
  if (!databaseUrl) {
    return new PrismaClient();
  }
  return new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });
}

function mapKeyToTargetUserId(key, sourceUserId, targetUserId) {
  for (const prefix of USER_APP_DATA_PREFIXES) {
    const sourceKey = `${prefix}${sourceUserId}`;
    if (key === sourceKey) {
      return `${prefix}${targetUserId}`;
    }
  }
  return key;
}

function parsePayload(raw) {
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid payload format.");
  }
  if (parsed.version !== 1) {
    throw new Error("Unsupported payload version.");
  }
  if (!parsed.source?.userId || !parsed.source?.email || !parsed.user?.email) {
    throw new Error("Payload is missing required user metadata.");
  }
  if (!Array.isArray(parsed.appData) || !Array.isArray(parsed.reviews)) {
    throw new Error("Payload is missing appData or reviews arrays.");
  }
  return parsed;
}

async function runExport(options) {
  const prisma = getPrisma(options.databaseUrl);
  try {
    const user = await prisma.user.findUnique({
      where: { email: options.email },
      select: {
        id: true,
        name: true,
        email: true,
        passwordHash: true,
        level: true,
        xp: true,
        streak: true,
        lastStudyAt: true,
      },
    });
    if (!user) {
      throw new Error(`User not found: ${options.email}`);
    }

    const expectedKeys = USER_APP_DATA_PREFIXES.map((prefix) => `${prefix}${user.id}`);
    const [appData, reviews] = await Promise.all([
      prisma.appData.findMany({
        where: {
          OR: expectedKeys.map((key) => ({ key })),
        },
        select: { key: true, value: true },
        orderBy: { key: "asc" },
      }),
      prisma.review.findMany({
        where: { userId: user.id },
        select: {
          cardType: true,
          repetitions: true,
          easeFactor: true,
          intervalDays: true,
          fsrsState: true,
          fsrsStability: true,
          fsrsDifficulty: true,
          fsrsLearningSteps: true,
          fsrsLapses: true,
          dueAt: true,
          lastReviewedAt: true,
          createdAt: true,
          updatedAt: true,
          kanji: {
            select: {
              character: true,
            },
          },
          vocab: {
            select: {
              word: true,
            },
          },
        },
      }),
    ]);

    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      source: {
        userId: user.id,
        email: user.email,
      },
      user: {
        name: user.name,
        email: user.email,
        passwordHash: user.passwordHash,
        level: user.level,
        xp: user.xp,
        streak: user.streak,
        lastStudyAt: user.lastStudyAt?.toISOString() ?? null,
      },
      appData: appData.map((entry) => ({
        key: entry.key,
        value: entry.value,
      })),
      reviews: reviews.map((entry) => ({
        cardType: entry.cardType,
        character: entry.kanji?.character ?? null,
        word: entry.vocab?.word ?? null,
        repetitions: entry.repetitions,
        easeFactor: entry.easeFactor,
        intervalDays: entry.intervalDays,
        fsrsState: entry.fsrsState,
        fsrsStability: entry.fsrsStability,
        fsrsDifficulty: entry.fsrsDifficulty,
        fsrsLearningSteps: entry.fsrsLearningSteps,
        fsrsLapses: entry.fsrsLapses,
        dueAt: entry.dueAt.toISOString(),
        lastReviewedAt: entry.lastReviewedAt?.toISOString() ?? null,
        createdAt: entry.createdAt.toISOString(),
        updatedAt: entry.updatedAt.toISOString(),
      })),
    };

    const resolvedOutput = path.isAbsolute(options.filePath)
      ? options.filePath
      : path.join(process.cwd(), options.filePath);
    await mkdir(path.dirname(resolvedOutput), { recursive: true });
    await writeFile(resolvedOutput, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

    console.log(`Exported user: ${user.email}`);
    console.log(`- userId: ${user.id}`);
    console.log(`- appData keys: ${payload.appData.length}`);
    console.log(`- reviews: ${payload.reviews.length}`);
    console.log(`- output: ${resolvedOutput}`);
  } finally {
    await prisma.$disconnect();
  }
}

async function runImport(options) {
  const resolvedInput = path.isAbsolute(options.filePath)
    ? options.filePath
    : path.join(process.cwd(), options.filePath);
  const raw = await readFile(resolvedInput, "utf8");
  const payload = parsePayload(raw);
  const targetEmail = (options.email ?? payload.user.email).trim().toLowerCase();

  const prisma = getPrisma(options.databaseUrl);
  try {
    const targetUser = await prisma.user.upsert({
      where: { email: targetEmail },
      create: {
        name: payload.user.name,
        email: targetEmail,
        passwordHash: payload.user.passwordHash,
        level: payload.user.level,
        xp: payload.user.xp,
        streak: payload.user.streak,
        lastStudyAt: payload.user.lastStudyAt ? new Date(payload.user.lastStudyAt) : null,
      },
      update: {
        name: payload.user.name,
        passwordHash: payload.user.passwordHash,
        level: payload.user.level,
        xp: payload.user.xp,
        streak: payload.user.streak,
        lastStudyAt: payload.user.lastStudyAt ? new Date(payload.user.lastStudyAt) : null,
      },
      select: {
        id: true,
        email: true,
      },
    });

    const sourceUserId = payload.source.userId;
    let appDataUpserted = 0;
    for (const entry of payload.appData) {
      const mappedKey = mapKeyToTargetUserId(entry.key, sourceUserId, targetUser.id);
      await prisma.appData.upsert({
        where: { key: mappedKey },
        create: {
          key: mappedKey,
          value: entry.value,
        },
        update: {
          value: entry.value,
        },
      });
      appDataUpserted += 1;
    }

    const kanjiChars = Array.from(
      new Set(
        payload.reviews
          .filter((entry) => entry.cardType === CardType.KANJI && entry.character)
          .map((entry) => entry.character)
      )
    );
    const vocabWords = Array.from(
      new Set(
        payload.reviews
          .filter((entry) => entry.cardType === CardType.VOCAB && entry.word)
          .map((entry) => entry.word)
      )
    );

    const [targetKanji, targetVocab] = await Promise.all([
      kanjiChars.length > 0
        ? prisma.kanji.findMany({
            where: { character: { in: kanjiChars } },
            select: { id: true, character: true },
          })
        : Promise.resolve([]),
      vocabWords.length > 0
        ? prisma.vocab.findMany({
            where: { word: { in: vocabWords } },
            select: { id: true, word: true },
          })
        : Promise.resolve([]),
    ]);

    const kanjiIdByCharacter = new Map(targetKanji.map((entry) => [entry.character, entry.id]));
    const vocabIdByWord = new Map(targetVocab.map((entry) => [entry.word, entry.id]));

    let reviewsCreated = 0;
    let reviewsUpdated = 0;
    let reviewsSkipped = 0;

    for (const review of payload.reviews) {
      const reviewData = {
        repetitions: review.repetitions,
        easeFactor: review.easeFactor,
        intervalDays: review.intervalDays,
        fsrsState: review.fsrsState,
        fsrsStability: review.fsrsStability,
        fsrsDifficulty: review.fsrsDifficulty,
        fsrsLearningSteps: review.fsrsLearningSteps,
        fsrsLapses: review.fsrsLapses,
        dueAt: new Date(review.dueAt),
        lastReviewedAt: review.lastReviewedAt ? new Date(review.lastReviewedAt) : null,
      };

      if (review.cardType === CardType.KANJI) {
        if (!review.character) {
          reviewsSkipped += 1;
          continue;
        }
        const kanjiId = kanjiIdByCharacter.get(review.character);
        if (!kanjiId) {
          reviewsSkipped += 1;
          continue;
        }
        const existing = await prisma.review.findFirst({
          where: {
            userId: targetUser.id,
            kanjiId,
          },
          select: { id: true },
        });
        if (existing) {
          await prisma.review.update({
            where: { id: existing.id },
            data: reviewData,
          });
          reviewsUpdated += 1;
        } else {
          await prisma.review.create({
            data: {
              userId: targetUser.id,
              cardType: CardType.KANJI,
              kanjiId,
              ...reviewData,
            },
          });
          reviewsCreated += 1;
        }
        continue;
      }

      if (!review.word) {
        reviewsSkipped += 1;
        continue;
      }
      const vocabId = vocabIdByWord.get(review.word);
      if (!vocabId) {
        reviewsSkipped += 1;
        continue;
      }
      const existing = await prisma.review.findFirst({
        where: {
          userId: targetUser.id,
          vocabId,
        },
        select: { id: true },
      });
      if (existing) {
        await prisma.review.update({
          where: { id: existing.id },
          data: reviewData,
        });
        reviewsUpdated += 1;
      } else {
        await prisma.review.create({
          data: {
            userId: targetUser.id,
            cardType: CardType.VOCAB,
            vocabId,
            ...reviewData,
          },
        });
        reviewsCreated += 1;
      }
    }

    console.log(`Imported into user: ${targetUser.email}`);
    console.log(`- target userId: ${targetUser.id}`);
    console.log(`- appData upserted: ${appDataUpserted}`);
    console.log(`- reviews created: ${reviewsCreated}`);
    console.log(`- reviews updated: ${reviewsUpdated}`);
    console.log(`- reviews skipped (missing mapping): ${reviewsSkipped}`);
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.mode === "export") {
    if (!args.email) {
      throw new Error("Missing --email for export mode.");
    }
    const filePath = args.filePath ?? buildDefaultExportPath(args.email);
    await runExport({
      email: args.email,
      filePath,
      databaseUrl: args.databaseUrl,
    });
    return;
  }

  if (!args.filePath) {
    throw new Error("Missing --file for import mode.");
  }

  await runImport({
    filePath: args.filePath,
    email: args.email,
    databaseUrl: args.databaseUrl,
  });
}

main().catch((error) => {
  console.error("Sync failed:", error);
  process.exitCode = 1;
});
