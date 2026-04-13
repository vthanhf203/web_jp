"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  cloneItemsForUser,
  loadAdminVocabLibrary,
} from "@/lib/admin-vocab-library";
import { requireUser } from "@/lib/auth";
import { parseVocabInput } from "@/lib/vocab-import";
import {
  loadUserVocabStore,
  saveUserVocabStore,
  type Lesson,
} from "@/lib/vocab-store";

export type VocabImportState = {
  status: "idle" | "success" | "error";
  message: string;
};

const createLessonSchema = z.object({
  title: z.preprocess(
    (value) => (typeof value === "string" ? value : undefined),
    z.string().trim().max(64).optional()
  ),
});

const importSchema = z.object({
  lessonId: z.string().min(1),
  rawInput: z.string().min(1),
});

const deleteItemSchema = z.object({
  lessonId: z.string().min(1),
  itemId: z.string().min(1),
});

const clearLessonSchema = z.object({
  lessonId: z.string().min(1),
});

const importAdminLessonSchema = z.object({
  libraryLessonId: z.string().min(1),
  targetLessonId: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() ? value.trim() : undefined,
    z.string().min(1).optional()
  ),
  mode: z.enum(["append", "new"]).default("append"),
});

const renameLessonSchema = z.object({
  lessonId: z.string().min(1),
  title: z.string().trim().min(1).max(64),
});

const deleteLessonSchema = z.object({
  lessonId: z.string().min(1),
});

const updateItemSchema = z.object({
  lessonId: z.string().min(1),
  itemId: z.string().min(1),
  word: z.string().trim().min(1),
  reading: z.string().trim().min(1),
  kanji: z.string().trim().max(120).optional(),
  hanviet: z.string().trim().max(120).optional(),
  partOfSpeech: z.string().trim().max(40).optional(),
  meaning: z.string().trim().min(1),
});

function nowIso() {
  return new Date().toISOString();
}

function findLesson(lessons: Lesson[], lessonId: string): Lesson | undefined {
  return lessons.find((lesson) => lesson.id === lessonId);
}

export async function createVocabLessonAction(formData: FormData) {
  const user = await requireUser();

  const parsed = createLessonSchema.safeParse({
    title: formData.get("title"),
  });

  if (!parsed.success) {
    return;
  }

  const store = await loadUserVocabStore(user.id);
  const title = parsed.data.title || `Bai ${store.lessons.length + 1}`;
  const now = nowIso();

  const lesson: Lesson = {
    id: crypto.randomUUID(),
    title,
    createdAt: now,
    updatedAt: now,
    items: [],
  };

  store.lessons.push(lesson);
  await saveUserVocabStore(user.id, store);

  revalidatePath("/vocab");
  redirect(`/vocab?lesson=${lesson.id}`);
}

export async function importVocabAction(
  _prevState: VocabImportState,
  formData: FormData
): Promise<VocabImportState> {
  const user = await requireUser();

  const parsed = importSchema.safeParse({
    lessonId: formData.get("lessonId"),
    rawInput: formData.get("rawInput"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Vui long chon bai va nhap du lieu tu vung.",
    };
  }

  const store = await loadUserVocabStore(user.id);
  const lesson = findLesson(store.lessons, parsed.data.lessonId);
  if (!lesson) {
    return {
      status: "error",
      message: "Khong tim thay bai hoc phu hop.",
    };
  }

  const rows = parseVocabInput(parsed.data.rawInput).slice(0, 500);
  if (rows.length === 0) {
    return {
      status: "error",
      message: "Khong parse duoc du lieu. Hay thu JSON hoac moi dong 1 tu.",
    };
  }

  const now = nowIso();
  lesson.items.push(
    ...rows.map((row) => ({
      id: crypto.randomUUID(),
      word: row.word,
      reading: row.reading,
      kanji: row.kanji || "",
      hanviet: row.hanviet || "",
      partOfSpeech: row.partOfSpeech || "",
      meaning: row.meaning,
      createdAt: now,
      updatedAt: now,
    }))
  );
  lesson.updatedAt = now;

  await saveUserVocabStore(user.id, store);

  revalidatePath("/vocab");
  return {
    status: "success",
    message: `Da nhap ${rows.length} tu vung vao bai.`,
  };
}

export async function deleteVocabItemAction(formData: FormData) {
  const user = await requireUser();

  const parsed = deleteItemSchema.safeParse({
    lessonId: formData.get("lessonId"),
    itemId: formData.get("itemId"),
  });

  if (!parsed.success) {
    return;
  }

  const store = await loadUserVocabStore(user.id);
  const lesson = findLesson(store.lessons, parsed.data.lessonId);
  if (!lesson) {
    return;
  }

  lesson.items = lesson.items.filter((item) => item.id !== parsed.data.itemId);
  lesson.updatedAt = nowIso();

  await saveUserVocabStore(user.id, store);
  revalidatePath("/vocab");
}

export async function clearVocabLessonAction(formData: FormData) {
  const user = await requireUser();

  const parsed = clearLessonSchema.safeParse({
    lessonId: formData.get("lessonId"),
  });

  if (!parsed.success) {
    return;
  }

  const store = await loadUserVocabStore(user.id);
  const lesson = findLesson(store.lessons, parsed.data.lessonId);
  if (!lesson) {
    return;
  }

  lesson.items = [];
  lesson.updatedAt = nowIso();

  await saveUserVocabStore(user.id, store);
  revalidatePath("/vocab");
}

export async function renameVocabLessonAction(formData: FormData) {
  const user = await requireUser();

  const parsed = renameLessonSchema.safeParse({
    lessonId: formData.get("lessonId"),
    title: formData.get("title"),
  });

  if (!parsed.success) {
    return;
  }

  const store = await loadUserVocabStore(user.id);
  const lesson = findLesson(store.lessons, parsed.data.lessonId);
  if (!lesson) {
    return;
  }

  lesson.title = parsed.data.title;
  lesson.updatedAt = nowIso();

  await saveUserVocabStore(user.id, store);
  revalidatePath("/vocab");
  redirect(`/vocab?lesson=${lesson.id}`);
}

export async function deleteVocabLessonAction(formData: FormData) {
  const user = await requireUser();

  const parsed = deleteLessonSchema.safeParse({
    lessonId: formData.get("lessonId"),
  });

  if (!parsed.success) {
    return;
  }

  const store = await loadUserVocabStore(user.id);
  const sortedLessons = [...store.lessons].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt)
  );
  const deletingIndex = sortedLessons.findIndex(
    (lesson) => lesson.id === parsed.data.lessonId
  );
  if (deletingIndex < 0) {
    return;
  }

  store.lessons = store.lessons.filter((lesson) => lesson.id !== parsed.data.lessonId);
  await saveUserVocabStore(user.id, store);
  revalidatePath("/vocab");

  const remainingSorted = [...store.lessons].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt)
  );
  const nextLesson =
    remainingSorted[deletingIndex] ??
    remainingSorted[deletingIndex - 1] ??
    remainingSorted[0] ??
    null;

  if (nextLesson) {
    redirect(`/vocab?lesson=${nextLesson.id}`);
  }
  redirect("/vocab");
}

export async function updateVocabItemAction(formData: FormData) {
  const user = await requireUser();

  const parsed = updateItemSchema.safeParse({
    lessonId: formData.get("lessonId"),
    itemId: formData.get("itemId"),
    word: formData.get("word"),
    reading: formData.get("reading"),
    kanji: formData.get("kanji"),
    hanviet: formData.get("hanviet"),
    partOfSpeech: formData.get("partOfSpeech"),
    meaning: formData.get("meaning"),
  });

  if (!parsed.success) {
    return;
  }

  const store = await loadUserVocabStore(user.id);
  const lesson = findLesson(store.lessons, parsed.data.lessonId);
  if (!lesson) {
    return;
  }

  const item = lesson.items.find((entry) => entry.id === parsed.data.itemId);
  if (!item) {
    return;
  }

  item.word = parsed.data.word;
  item.reading = parsed.data.reading;
  item.kanji = parsed.data.kanji || "";
  item.hanviet = parsed.data.hanviet || "";
  item.partOfSpeech = parsed.data.partOfSpeech || "";
  item.meaning = parsed.data.meaning;
  item.updatedAt = nowIso();
  lesson.updatedAt = nowIso();

  await saveUserVocabStore(user.id, store);
  revalidatePath("/vocab");
}

export async function importAdminLessonToUserAction(formData: FormData) {
  const user = await requireUser();

  const parsed = importAdminLessonSchema.safeParse({
    libraryLessonId: formData.get("libraryLessonId"),
    targetLessonId: formData.get("targetLessonId"),
    mode: formData.get("mode"),
  });
  if (!parsed.success) {
    return;
  }

  const library = await loadAdminVocabLibrary();
  const sourceLesson = library.lessons.find(
    (lesson) => lesson.id === parsed.data.libraryLessonId
  );
  if (!sourceLesson) {
    return;
  }

  const store = await loadUserVocabStore(user.id);
  const now = nowIso();

  let targetLesson: Lesson | undefined;
  if (parsed.data.mode === "append" && parsed.data.targetLessonId) {
    targetLesson = store.lessons.find(
      (lesson) => lesson.id === parsed.data.targetLessonId
    );
  }

  if (!targetLesson) {
    targetLesson = {
      id: crypto.randomUUID(),
      title: sourceLesson.title,
      createdAt: now,
      updatedAt: now,
      items: [],
    };
    store.lessons.push(targetLesson);
  }

  targetLesson.items.push(...cloneItemsForUser(sourceLesson.items));
  targetLesson.updatedAt = nowIso();

  await saveUserVocabStore(user.id, store);
  revalidatePath("/vocab");
  redirect(`/vocab?lesson=${targetLesson.id}`);
}
