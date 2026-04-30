import "server-only";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type KanjiPickScope = "all" | "personal";

export type KanjiPickDeck = {
  id: string;
  title: string;
  scope: KanjiPickScope;
  pickedIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type UserKanjiPickDeckStore = {
  updatedAt: string;
  decks: KanjiPickDeck[];
  lastPicked: Record<KanjiPickScope, string[]>;
};

const APP_DATA_PREFIX = "user_kanji_pick_decks:";

function nowIso(): string {
  return new Date().toISOString();
}

function getStoreKey(userId: string): string {
  return `${APP_DATA_PREFIX}${userId}`;
}

function normalizePickedIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(
    new Set(
      value
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter(Boolean)
    )
  ).slice(0, 2000);
}

function normalizeScope(value: unknown): KanjiPickScope {
  return value === "personal" ? "personal" : "all";
}

function normalizeDeck(input: unknown): KanjiPickDeck | null {
  if (!input || typeof input !== "object") {
    return null;
  }
  const raw = input as Partial<KanjiPickDeck>;
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  if (!title) {
    return null;
  }
  const createdAt = typeof raw.createdAt === "string" ? raw.createdAt : nowIso();
  const updatedAt = typeof raw.updatedAt === "string" ? raw.updatedAt : createdAt;
  return {
    id: typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : crypto.randomUUID(),
    title: title.slice(0, 64),
    scope: normalizeScope(raw.scope),
    pickedIds: normalizePickedIds(raw.pickedIds),
    createdAt,
    updatedAt,
  };
}

function emptyStore(): UserKanjiPickDeckStore {
  return {
    updatedAt: "",
    decks: [],
    lastPicked: {
      all: [],
      personal: [],
    },
  };
}

function normalizeStore(input: unknown): UserKanjiPickDeckStore {
  if (!input || typeof input !== "object") {
    return emptyStore();
  }
  const raw = input as Partial<UserKanjiPickDeckStore>;
  const rawLastPicked = raw.lastPicked && typeof raw.lastPicked === "object" ? raw.lastPicked : {};
  return {
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
    decks: Array.isArray(raw.decks)
      ? raw.decks
          .map((deck) => normalizeDeck(deck))
          .filter((deck): deck is KanjiPickDeck => !!deck)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      : [],
    lastPicked: {
      all: normalizePickedIds((rawLastPicked as Record<string, unknown>).all),
      personal: normalizePickedIds((rawLastPicked as Record<string, unknown>).personal),
    },
  };
}

export async function loadUserKanjiPickDeckStore(userId: string): Promise<UserKanjiPickDeckStore> {
  try {
    const record = await prisma.appData.findUnique({
      where: { key: getStoreKey(userId) },
      select: { value: true },
    });
    return normalizeStore(record?.value);
  } catch {
    return emptyStore();
  }
}

export async function saveUserKanjiPickDeckStore(
  userId: string,
  store: UserKanjiPickDeckStore
): Promise<void> {
  const payload = {
    ...normalizeStore(store),
    updatedAt: nowIso(),
  };
  await prisma.appData.upsert({
    where: { key: getStoreKey(userId) },
    create: {
      key: getStoreKey(userId),
      value: payload as unknown as Prisma.InputJsonValue,
    },
    update: {
      value: payload as unknown as Prisma.InputJsonValue,
    },
  });
}

