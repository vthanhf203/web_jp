"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import {
  loadUserKanjiPickDeckStore,
  saveUserKanjiPickDeckStore,
  type KanjiPickScope,
} from "@/lib/user-kanji-pick-decks";

const createDeckSchema = z.object({
  title: z.string().trim().min(1).max(64),
  scope: z.enum(["all", "personal"]),
  pickedIds: z.string().trim().max(20000).optional(),
  returnTo: z.string().trim().max(500).optional(),
});

const deleteDeckSchema = z.object({
  deckId: z.string().trim().min(1),
  returnTo: z.string().trim().max(500).optional(),
});

function parsePickedIdsCsv(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return Array.from(
    new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    )
  ).slice(0, 2000);
}

function normalizeReturnTo(path: string | undefined): string | null {
  const returnTo = path?.trim();
  if (!returnTo) {
    return null;
  }
  if (!returnTo.startsWith("/") || returnTo.startsWith("//")) {
    return null;
  }
  return returnTo;
}

function buildDeckReturnTo(returnTo: string, scope: KanjiPickScope): string {
  const [pathname, queryString = ""] = returnTo.split("?");
  const query = new URLSearchParams(queryString);
  query.set("scope", scope);
  query.set("pickMode", "1");
  query.set("pickReset", "1");
  query.delete("pick");
  query.delete("deck");
  const nextQuery = query.toString();
  return nextQuery ? `${pathname}?${nextQuery}` : pathname;
}

export async function createKanjiPickDeckAction(formData: FormData) {
  const user = await requireUser();
  const parsed = createDeckSchema.safeParse({
    title: formData.get("title"),
    scope: formData.get("scope"),
    pickedIds: formData.get("pickedIds"),
    returnTo: formData.get("returnTo"),
  });
  if (!parsed.success) {
    return;
  }

  const pickedIds = parsePickedIdsCsv(parsed.data.pickedIds);
  if (pickedIds.length === 0) {
    return;
  }

  const store = await loadUserKanjiPickDeckStore(user.id);
  const now = new Date().toISOString();
  const deck = {
    id: crypto.randomUUID(),
    title: parsed.data.title,
    scope: parsed.data.scope,
    pickedIds,
    createdAt: now,
    updatedAt: now,
  };

  const scopedDecks = store.decks.filter((item) => item.scope === parsed.data.scope);
  const limitedScopedDecks = [deck, ...scopedDecks].slice(0, 40);
  const otherDecks = store.decks.filter((item) => item.scope !== parsed.data.scope);

  await saveUserKanjiPickDeckStore(user.id, {
    ...store,
    decks: [...limitedScopedDecks, ...otherDecks],
    lastPicked: {
      ...store.lastPicked,
      [parsed.data.scope]: pickedIds,
    },
  });

  revalidatePath("/kanji");

  const returnTo = normalizeReturnTo(parsed.data.returnTo);
  if (returnTo) {
    redirect(buildDeckReturnTo(returnTo, parsed.data.scope));
  }
  redirect(`/kanji?scope=${parsed.data.scope}&pickMode=1&pickReset=1`);
}

export async function deleteKanjiPickDeckAction(formData: FormData) {
  const user = await requireUser();
  const parsed = deleteDeckSchema.safeParse({
    deckId: formData.get("deckId"),
    returnTo: formData.get("returnTo"),
  });
  if (!parsed.success) {
    return;
  }

  const store = await loadUserKanjiPickDeckStore(user.id);
  const nextDecks = store.decks.filter((deck) => deck.id !== parsed.data.deckId);
  if (nextDecks.length === store.decks.length) {
    return;
  }

  await saveUserKanjiPickDeckStore(user.id, {
    ...store,
    decks: nextDecks,
  });

  revalidatePath("/kanji");

  const returnTo = normalizeReturnTo(parsed.data.returnTo);
  if (!returnTo) {
    return;
  }
  const [pathname, queryString = ""] = returnTo.split("?");
  const query = new URLSearchParams(queryString);
  if (query.get("deck") === parsed.data.deckId) {
    query.delete("deck");
  }
  const nextQuery = query.toString();
  redirect(nextQuery ? `${pathname}?${nextQuery}` : pathname);
}
