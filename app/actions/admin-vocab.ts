"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin";
import {
  JLPT_LEVELS,
  loadAdminVocabLibrary,
  normalizeJlptLevel,
  saveAdminVocabLibrary,
  type AdminVocabLesson,
} from "@/lib/admin-vocab-library";
import { parseVocabInput } from "@/lib/vocab-import";

export type AdminImportState = {
  status: "idle" | "success" | "error";
  message: string;
};

const createLessonSchema = z.object({
  title: z.preprocess(
    (value) => (typeof value === "string" ? value : undefined),
    z.string().trim().max(64).optional()
  ),
  jlptLevel: z.preprocess(
    (value) => normalizeJlptLevel(value),
    z.enum(JLPT_LEVELS).default("N5")
  ),
});

const updateLessonSchema = z.object({
  lessonId: z.string().min(1),
  title: z.string().trim().min(1).max(64),
  description: z.preprocess(
    (value) => (typeof value === "string" ? value : undefined),
    z.string().trim().max(180).optional()
  ),
  jlptLevel: z.preprocess(
    (value) => normalizeJlptLevel(value),
    z.enum(JLPT_LEVELS).default("N5")
  ),
});

const deleteLessonSchema = z.object({
  lessonId: z.string().min(1),
});

const importItemsSchema = z.object({
  lessonId: z.string().min(1),
  rawInput: z.string().min(1),
});

const clearLessonSchema = z.object({
  lessonId: z.string().min(1),
});

const deleteItemSchema = z.object({
  lessonId: z.string().min(1),
  itemId: z.string().min(1),
});

const updateItemSchema = z.object({
  lessonId: z.string().min(1),
  itemId: z.string().min(1),
  word: z.string().trim().min(1),
  reading: z.preprocess(
    (value) => (typeof value === "string" ? value : undefined),
    z.string().trim().max(120).optional()
  ),
  kanji: z.preprocess(
    (value) => (typeof value === "string" ? value : undefined),
    z.string().trim().max(120).optional()
  ),
  hanviet: z.preprocess(
    (value) => (typeof value === "string" ? value : undefined),
    z.string().trim().max(120).optional()
  ),
  partOfSpeech: z.preprocess(
    (value) => (typeof value === "string" ? value : undefined),
    z.string().trim().max(40).optional()
  ),
  meaning: z.string().trim().min(1),
});

function nowIso(): string {
  return new Date().toISOString();
}

function findLesson(lessons: AdminVocabLesson[], lessonId: string): AdminVocabLesson | null {
  return lessons.find((lesson) => lesson.id === lessonId) ?? null;
}

function touchSharedPaths() {
  revalidatePath("/admin/vocab");
  revalidatePath("/vocab");
  revalidatePath("/api/vocab-library");
}

export async function createAdminVocabLessonAction(formData: FormData) {
  await requireAdmin();

  const parsed = createLessonSchema.safeParse({
    title: formData.get("title"),
    jlptLevel: formData.get("jlptLevel"),
  });
  if (!parsed.success) {
    return;
  }

  const library = await loadAdminVocabLibrary();
  const now = nowIso();
  const nextLessonNumber = library.lessons.length + 1;
  const lesson: AdminVocabLesson = {
    id: crypto.randomUUID(),
    title: parsed.data.title || `Admin lesson ${nextLessonNumber}`,
    description: "",
    jlptLevel: parsed.data.jlptLevel,
    createdAt: now,
    updatedAt: now,
    items: [],
  };

  library.lessons.push(lesson);
  await saveAdminVocabLibrary(library);
  touchSharedPaths();
  redirect(`/admin/vocab?level=${lesson.jlptLevel}&lesson=${lesson.id}`);
}

export async function updateAdminVocabLessonAction(formData: FormData) {
  await requireAdmin();

  const parsed = updateLessonSchema.safeParse({
    lessonId: formData.get("lessonId"),
    title: formData.get("title"),
    description: formData.get("description"),
    jlptLevel: formData.get("jlptLevel"),
  });
  if (!parsed.success) {
    return;
  }

  const library = await loadAdminVocabLibrary();
  const lesson = findLesson(library.lessons, parsed.data.lessonId);
  if (!lesson) {
    return;
  }

  lesson.title = parsed.data.title;
  lesson.description = parsed.data.description || "";
  lesson.jlptLevel = parsed.data.jlptLevel;
  lesson.updatedAt = nowIso();

  await saveAdminVocabLibrary(library);
  touchSharedPaths();
  redirect(`/admin/vocab?level=${lesson.jlptLevel}&lesson=${lesson.id}`);
}

export async function deleteAdminVocabLessonAction(formData: FormData) {
  await requireAdmin();

  const parsed = deleteLessonSchema.safeParse({
    lessonId: formData.get("lessonId"),
  });
  if (!parsed.success) {
    return;
  }

  const library = await loadAdminVocabLibrary();
  const deletingIndex = library.lessons.findIndex(
    (lesson) => lesson.id === parsed.data.lessonId
  );
  if (deletingIndex < 0) {
    return;
  }

  const deletingLesson = library.lessons[deletingIndex];
  const deletingLevel = deletingLesson?.jlptLevel ?? "N5";
  const lessonsSameLevelBefore = library.lessons.filter(
    (lesson) => lesson.jlptLevel === deletingLevel
  );
  const deletingLevelIndex = lessonsSameLevelBefore.findIndex(
    (lesson) => lesson.id === parsed.data.lessonId
  );

  library.lessons = library.lessons.filter((lesson) => lesson.id !== parsed.data.lessonId);
  await saveAdminVocabLibrary(library);
  touchSharedPaths();

  const lessonsSameLevel = library.lessons.filter(
    (lesson) => lesson.jlptLevel === deletingLevel
  );
  const nextLesson =
    lessonsSameLevel[deletingLevelIndex] ??
    lessonsSameLevel[deletingLevelIndex - 1] ??
    lessonsSameLevel[0] ??
    null;
  if (nextLesson) {
    redirect(`/admin/vocab?level=${deletingLevel}&lesson=${nextLesson.id}`);
  }
  redirect(`/admin/vocab?level=${deletingLevel}`);
}

export async function importAdminVocabItemsAction(
  _prevState: AdminImportState,
  formData: FormData
): Promise<AdminImportState> {
  await requireAdmin();

  const parsed = importItemsSchema.safeParse({
    lessonId: formData.get("lessonId"),
    rawInput: formData.get("rawInput"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Hay chon lesson va nhap du lieu hop le.",
    };
  }

  const library = await loadAdminVocabLibrary();
  const lesson = findLesson(library.lessons, parsed.data.lessonId);
  if (!lesson) {
    return {
      status: "error",
      message: "Khong tim thay lesson admin.",
    };
  }

  const rows = parseVocabInput(parsed.data.rawInput).slice(0, 500);
  if (rows.length === 0) {
    return {
      status: "error",
      message: "Khong parse duoc du lieu. Thu lai voi JSON hoac moi dong 1 tu.",
    };
  }
  const noKanjiCount = rows.filter((row) => !row.kanji.trim()).length;

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

  await saveAdminVocabLibrary(library);
  touchSharedPaths();

  return {
    status: "success",
    message:
      noKanjiCount > 0
        ? `Da them ${rows.length} tu vao kho admin. Luu y: ${noKanjiCount} tu chua co field kanji nen co the khong hien o muc lien quan tren trang Kanji.`
        : `Da them ${rows.length} tu vao kho admin.`,
  };
}

export async function clearAdminVocabLessonAction(formData: FormData) {
  await requireAdmin();

  const parsed = clearLessonSchema.safeParse({
    lessonId: formData.get("lessonId"),
  });
  if (!parsed.success) {
    return;
  }

  const library = await loadAdminVocabLibrary();
  const lesson = findLesson(library.lessons, parsed.data.lessonId);
  if (!lesson) {
    return;
  }

  lesson.items = [];
  lesson.updatedAt = nowIso();
  await saveAdminVocabLibrary(library);
  touchSharedPaths();
}

export async function deleteAdminVocabItemAction(formData: FormData) {
  await requireAdmin();

  const parsed = deleteItemSchema.safeParse({
    lessonId: formData.get("lessonId"),
    itemId: formData.get("itemId"),
  });
  if (!parsed.success) {
    return;
  }

  const library = await loadAdminVocabLibrary();
  const lesson = findLesson(library.lessons, parsed.data.lessonId);
  if (!lesson) {
    return;
  }

  lesson.items = lesson.items.filter((item) => item.id !== parsed.data.itemId);
  lesson.updatedAt = nowIso();
  await saveAdminVocabLibrary(library);
  touchSharedPaths();
}

export async function updateAdminVocabItemAction(formData: FormData) {
  await requireAdmin();

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

  const library = await loadAdminVocabLibrary();
  const lesson = findLesson(library.lessons, parsed.data.lessonId);
  if (!lesson) {
    return;
  }

  const item = lesson.items.find((entry) => entry.id === parsed.data.itemId);
  if (!item) {
    return;
  }

  item.word = parsed.data.word;
  item.reading = parsed.data.reading || "";
  item.kanji = parsed.data.kanji || "";
  item.hanviet = parsed.data.hanviet || "";
  item.partOfSpeech = parsed.data.partOfSpeech || "";
  item.meaning = parsed.data.meaning;
  item.updatedAt = nowIso();
  lesson.updatedAt = nowIso();

  await saveAdminVocabLibrary(library);
  touchSharedPaths();
}
