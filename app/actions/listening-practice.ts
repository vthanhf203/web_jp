"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import {
  DEFAULT_LISTENING_DECK_NAME,
  loadListeningPracticeStore,
  saveListeningPracticeStore,
  type ListeningPracticeItem,
} from "@/lib/listening-practice-store";
import { parseListeningTextInput } from "@/lib/listening-text-import";

export type ListeningImportState = {
  status: "idle" | "success" | "error";
  message: string;
};

const importSchema = z.object({
  rawInput: z.string().min(1),
  deckName: z.string().trim().max(120).optional(),
});

const deleteSchema = z.object({
  itemId: z.string().min(1),
});

function nowIso(): string {
  return new Date().toISOString();
}

function touchListeningPaths() {
  revalidatePath("/self-study");
  revalidatePath("/self-study/listening");
}

export async function importListeningTextsAction(
  _prevState: ListeningImportState,
  formData: FormData
): Promise<ListeningImportState> {
  const user = await requireUser();
  const parsed = importSchema.safeParse({
    rawInput: formData.get("rawInput"),
    deckName: formData.get("deckName"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Vui long nhap JSON bai nghe.",
    };
  }

  const rows = parseListeningTextInput(parsed.data.rawInput).slice(0, 200);
  if (rows.length === 0) {
    return {
      status: "error",
      message: "Khong parse duoc JSON. Can co title va script/scriptRaw (questions la tuy chon).",
    };
  }

  const now = nowIso();
  const selectedDeckName = parsed.data.deckName?.trim();
  const nextItems: ListeningPracticeItem[] = rows.map((row) => ({
    id: row.id?.trim() || crypto.randomUUID(),
    title: row.title,
    deckName: selectedDeckName || row.deckName || row.topic || DEFAULT_LISTENING_DECK_NAME,
    jlptLevel: row.jlptLevel,
    topic: row.topic,
    situation: row.situation,
    keyPoint: row.keyPoint,
    meta: row.meta,
    difficulty: row.difficulty,
    estimatedMinutes: row.estimatedMinutes,
    script: row.script,
    scriptRaw: row.scriptRaw,
    translation: row.translation,
    tts: row.tts,
    questions: row.questions,
    createdAt: now,
    updatedAt: now,
  }));

  const store = await loadListeningPracticeStore(user.id);
  const existingById = new Map(store.items.map((item) => [item.id, item]));
  for (const item of nextItems) {
    existingById.set(item.id, {
      ...existingById.get(item.id),
      ...item,
      createdAt: existingById.get(item.id)?.createdAt ?? item.createdAt,
      updatedAt: now,
    });
  }

  await saveListeningPracticeStore(user.id, {
    updatedAt: now,
    items: Array.from(existingById.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  });
  touchListeningPaths();

  return {
    status: "success",
    message: `Da import ${nextItems.length} bai nghe vao muc "${selectedDeckName || nextItems[0]?.deckName || DEFAULT_LISTENING_DECK_NAME}".`,
  };
}

export async function deleteListeningItemAction(formData: FormData) {
  const user = await requireUser();
  const parsed = deleteSchema.safeParse({
    itemId: formData.get("itemId"),
  });
  if (!parsed.success) {
    redirect("/self-study/listening");
  }

  const store = await loadListeningPracticeStore(user.id);
  store.items = store.items.filter((item) => item.id !== parsed.data.itemId);
  await saveListeningPracticeStore(user.id, store);
  touchListeningPaths();
  redirect("/self-study/listening");
}
