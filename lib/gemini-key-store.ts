import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const STORE_KEY = "admin_gemini_api_keys";

export type GeminiKeyStatus = "ready" | "rate-limited" | "invalid" | "error";

type StoredGeminiKey = {
  id: string;
  label: string;
  encryptedKey: string;
  iv: string;
  authTag: string;
  lastFour: string;
  status: GeminiKeyStatus;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
  lastErrorAt?: string;
  lastError?: string;
};

type GeminiKeyStore = {
  activeKeyId: string | null;
  keys: StoredGeminiKey[];
};

export type GeminiKeySummary = {
  id: string;
  label: string;
  maskedKey: string;
  status: GeminiKeyStatus;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
  lastErrorAt?: string;
  lastError?: string;
};

export type ActiveGeminiApiKey = {
  apiKey: string;
  source: "managed" | "env";
  managedKeyId?: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function emptyStore(): GeminiKeyStore {
  return { activeKeyId: null, keys: [] };
}

function encryptionKey(): Buffer {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret) {
    throw new Error("AUTH_SECRET is required to encrypt Gemini API keys.");
  }
  return createHash("sha256").update(`jp-lab-gemini-key-store:${secret}`).digest();
}

function encryptApiKey(apiKey: string): Pick<StoredGeminiKey, "encryptedKey" | "iv" | "authTag"> {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  return {
    encryptedKey: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

function decryptApiKey(key: StoredGeminiKey): string {
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(key.iv, "base64"));
  decipher.setAuthTag(Buffer.from(key.authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(key.encryptedKey, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

function normalizeStatus(value: unknown): GeminiKeyStatus {
  return value === "rate-limited" || value === "invalid" || value === "error" ? value : "ready";
}

function normalizeStoredKey(value: unknown): StoredGeminiKey | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const label = typeof raw.label === "string" ? raw.label.trim() : "";
  const encryptedKey = typeof raw.encryptedKey === "string" ? raw.encryptedKey : "";
  const iv = typeof raw.iv === "string" ? raw.iv : "";
  const authTag = typeof raw.authTag === "string" ? raw.authTag : "";
  const lastFour = typeof raw.lastFour === "string" ? raw.lastFour.slice(-4) : "";
  const createdAt = typeof raw.createdAt === "string" ? raw.createdAt : nowIso();
  const updatedAt = typeof raw.updatedAt === "string" ? raw.updatedAt : createdAt;
  if (!id || !label || !encryptedKey || !iv || !authTag) {
    return null;
  }
  return {
    id,
    label,
    encryptedKey,
    iv,
    authTag,
    lastFour,
    status: normalizeStatus(raw.status),
    createdAt,
    updatedAt,
    lastUsedAt: typeof raw.lastUsedAt === "string" ? raw.lastUsedAt : undefined,
    lastErrorAt: typeof raw.lastErrorAt === "string" ? raw.lastErrorAt : undefined,
    lastError: typeof raw.lastError === "string" ? raw.lastError.slice(0, 300) : undefined,
  };
}

async function loadStore(): Promise<GeminiKeyStore> {
  try {
    const record = await prisma.appData.findUnique({ where: { key: STORE_KEY } });
    if (!record?.value || typeof record.value !== "object" || Array.isArray(record.value)) {
      return emptyStore();
    }
    const raw = record.value as Record<string, unknown>;
    const keys = Array.isArray(raw.keys)
      ? raw.keys.map(normalizeStoredKey).filter((key): key is StoredGeminiKey => Boolean(key))
      : [];
    const activeKeyId = typeof raw.activeKeyId === "string" ? raw.activeKeyId : null;
    return {
      activeKeyId: keys.some((key) => key.id === activeKeyId) ? activeKeyId : null,
      keys,
    };
  } catch (error) {
    console.error("[gemini-key-store/load]", error);
    return emptyStore();
  }
}

async function saveStore(store: GeminiKeyStore): Promise<void> {
  const value = {
    activeKeyId: store.activeKeyId,
    keys: store.keys,
  } satisfies Prisma.InputJsonObject;
  await prisma.appData.upsert({
    where: { key: STORE_KEY },
    create: { key: STORE_KEY, value },
    update: { value },
  });
}

export async function listGeminiApiKeys(): Promise<{
  keys: GeminiKeySummary[];
  envConfigured: boolean;
  usingEnv: boolean;
}> {
  const store = await loadStore();
  return {
    keys: store.keys.map((key) => ({
      id: key.id,
      label: key.label,
      maskedKey: `••••••••${key.lastFour || "????"}`,
      status: key.status,
      active: key.id === store.activeKeyId,
      createdAt: key.createdAt,
      updatedAt: key.updatedAt,
      lastUsedAt: key.lastUsedAt,
      lastErrorAt: key.lastErrorAt,
      lastError: key.lastError,
    })),
    envConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
    usingEnv: store.activeKeyId === null,
  };
}

export async function addGeminiApiKey(label: string, apiKey: string): Promise<void> {
  const store = await loadStore();
  const timestamp = nowIso();
  const encrypted = encryptApiKey(apiKey);
  const entry: StoredGeminiKey = {
    id: randomUUID(),
    label,
    ...encrypted,
    lastFour: apiKey.slice(-4),
    status: "ready",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  store.keys.push(entry);
  if (!store.activeKeyId) {
    store.activeKeyId = entry.id;
  }
  await saveStore(store);
}

export async function selectGeminiApiKey(keyId: string | null): Promise<void> {
  const store = await loadStore();
  if (keyId === null) {
    store.activeKeyId = null;
    await saveStore(store);
    return;
  }
  const key = store.keys.find((entry) => entry.id === keyId);
  if (!key) {
    throw new Error("Khong tim thay Gemini API key.");
  }
  key.status = "ready";
  key.lastError = undefined;
  key.lastErrorAt = undefined;
  key.updatedAt = nowIso();
  store.activeKeyId = key.id;
  await saveStore(store);
}

export async function deleteGeminiApiKey(keyId: string): Promise<void> {
  const store = await loadStore();
  store.keys = store.keys.filter((entry) => entry.id !== keyId);
  if (store.activeKeyId === keyId) {
    store.activeKeyId = null;
  }
  await saveStore(store);
}

export async function getActiveGeminiApiKey(): Promise<ActiveGeminiApiKey | null> {
  const store = await loadStore();
  if (store.activeKeyId) {
    const active = store.keys.find((entry) => entry.id === store.activeKeyId);
    if (!active || active.status === "rate-limited" || active.status === "invalid") {
      return null;
    }
    try {
      return {
        apiKey: decryptApiKey(active),
        source: "managed",
        managedKeyId: active.id,
      };
    } catch (error) {
      console.error("[gemini-key-store/decrypt]", error);
      return null;
    }
  }

  const envKey = process.env.GEMINI_API_KEY?.trim();
  return envKey ? { apiKey: envKey, source: "env" } : null;
}

export async function markGeminiApiKeySuccess(keyId: string | undefined): Promise<void> {
  if (!keyId) {
    return;
  }
  const store = await loadStore();
  const key = store.keys.find((entry) => entry.id === keyId);
  if (!key) {
    return;
  }
  key.status = "ready";
  key.lastUsedAt = nowIso();
  key.lastError = undefined;
  key.lastErrorAt = undefined;
  key.updatedAt = nowIso();
  await saveStore(store);
}

export async function markGeminiApiKeyFailure(
  keyId: string | undefined,
  status: GeminiKeyStatus,
  message: string
): Promise<void> {
  if (!keyId) {
    return;
  }
  const store = await loadStore();
  const key = store.keys.find((entry) => entry.id === keyId);
  if (!key) {
    return;
  }
  key.status = status;
  key.lastError = message.slice(0, 300);
  key.lastErrorAt = nowIso();
  key.updatedAt = nowIso();
  await saveStore(store);
}
