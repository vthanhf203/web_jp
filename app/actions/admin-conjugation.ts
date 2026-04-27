"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin";
import {
  JLPT_LEVELS,
  loadAdminConjugationLibrary,
  normalizeJlptLevel,
  saveAdminConjugationLibrary,
  type AdminConjugationLesson,
} from "@/lib/admin-conjugation-library";
import { parseConjugationInput } from "@/lib/conjugation-import";

export type AdminConjugationImportState = {
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

function nowIso(): string {
  return new Date().toISOString();
}

function touchPaths() {
  revalidatePath("/admin/conjugation");
}

function findLesson(
  lessons: AdminConjugationLesson[],
  lessonId: string
): AdminConjugationLesson | null {
  return lessons.find((lesson) => lesson.id === lessonId) ?? null;
}

export async function createAdminConjugationLessonAction(formData: FormData) {
  await requireAdmin();

  const parsed = createLessonSchema.safeParse({
    title: formData.get("title"),
    jlptLevel: formData.get("jlptLevel"),
  });
  if (!parsed.success) {
    return;
  }

  const library = await loadAdminConjugationLibrary();
  const now = nowIso();
  const lesson: AdminConjugationLesson = {
    id: crypto.randomUUID(),
    title: parsed.data.title || `Chia thể lesson ${library.lessons.length + 1}`,
    description: "",
    jlptLevel: parsed.data.jlptLevel,
    createdAt: now,
    updatedAt: now,
    items: [],
  };

  library.lessons.push(lesson);
  await saveAdminConjugationLibrary(library);
  touchPaths();
  redirect(`/admin/conjugation?level=${lesson.jlptLevel}&lesson=${lesson.id}`);
}

export async function updateAdminConjugationLessonAction(formData: FormData) {
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

  const library = await loadAdminConjugationLibrary();
  const lesson = findLesson(library.lessons, parsed.data.lessonId);
  if (!lesson) {
    return;
  }

  lesson.title = parsed.data.title;
  lesson.description = parsed.data.description || "";
  lesson.jlptLevel = parsed.data.jlptLevel;
  lesson.updatedAt = nowIso();

  await saveAdminConjugationLibrary(library);
  touchPaths();
  redirect(`/admin/conjugation?level=${lesson.jlptLevel}&lesson=${lesson.id}`);
}

export async function deleteAdminConjugationLessonAction(formData: FormData) {
  await requireAdmin();

  const parsed = deleteLessonSchema.safeParse({
    lessonId: formData.get("lessonId"),
  });
  if (!parsed.success) {
    return;
  }

  const library = await loadAdminConjugationLibrary();
  const deletingLesson = findLesson(library.lessons, parsed.data.lessonId);
  if (!deletingLesson) {
    return;
  }

  const deletingLevel = deletingLesson.jlptLevel;
  const lessonsSameLevelBefore = library.lessons.filter(
    (lesson) => lesson.jlptLevel === deletingLevel
  );
  const deletingLevelIndex = lessonsSameLevelBefore.findIndex(
    (lesson) => lesson.id === parsed.data.lessonId
  );

  library.lessons = library.lessons.filter((lesson) => lesson.id !== parsed.data.lessonId);
  await saveAdminConjugationLibrary(library);
  touchPaths();

  const lessonsSameLevel = library.lessons.filter(
    (lesson) => lesson.jlptLevel === deletingLevel
  );
  const nextLesson =
    lessonsSameLevel[deletingLevelIndex] ??
    lessonsSameLevel[deletingLevelIndex - 1] ??
    lessonsSameLevel[0] ??
    null;

  if (nextLesson) {
    redirect(`/admin/conjugation?level=${deletingLevel}&lesson=${nextLesson.id}`);
  }
  redirect(`/admin/conjugation?level=${deletingLevel}`);
}

export async function importAdminConjugationItemsAction(
  _prevState: AdminConjugationImportState,
  formData: FormData
): Promise<AdminConjugationImportState> {
  await requireAdmin();

  const parsed = importItemsSchema.safeParse({
    lessonId: formData.get("lessonId"),
    rawInput: formData.get("rawInput"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Hãy chọn lesson và nhập JSON hợp lệ.",
    };
  }

  const library = await loadAdminConjugationLibrary();
  const lesson = findLesson(library.lessons, parsed.data.lessonId);
  if (!lesson) {
    return {
      status: "error",
      message: "Không tìm thấy lesson chia thể.",
    };
  }

  const rows = parseConjugationInput(parsed.data.rawInput).slice(0, 1000);
  if (rows.length === 0) {
    return {
      status: "error",
      message:
        "Không parse được dữ liệu. Hãy kiểm tra lại JSON hoặc format từng dòng.",
    };
  }

  const now = nowIso();
  lesson.items.push(
    ...rows.map((row) => ({
      id: crypto.randomUUID(),
      base: row.base,
      reading: row.reading || "",
      kanji: row.kanji || "",
      hanviet: row.hanviet || "",
      partOfSpeech: row.partOfSpeech || "",
      meaning: row.meaning,
      note: row.note || "",
      forms: row.forms.map((form) => ({
        id: crypto.randomUUID(),
        label: form.label,
        value: form.value,
      })),
      createdAt: now,
      updatedAt: now,
    }))
  );
  lesson.updatedAt = now;

  await saveAdminConjugationLibrary(library);
  touchPaths();

  return {
    status: "success",
    message: `Đã thêm ${rows.length} mục chia thể vào lesson "${lesson.title}".`,
  };
}

export async function clearAdminConjugationLessonAction(formData: FormData) {
  await requireAdmin();

  const parsed = clearLessonSchema.safeParse({
    lessonId: formData.get("lessonId"),
  });
  if (!parsed.success) {
    return;
  }

  const library = await loadAdminConjugationLibrary();
  const lesson = findLesson(library.lessons, parsed.data.lessonId);
  if (!lesson) {
    return;
  }

  lesson.items = [];
  lesson.updatedAt = nowIso();
  await saveAdminConjugationLibrary(library);
  touchPaths();
}

export async function deleteAdminConjugationItemAction(formData: FormData) {
  await requireAdmin();

  const parsed = deleteItemSchema.safeParse({
    lessonId: formData.get("lessonId"),
    itemId: formData.get("itemId"),
  });
  if (!parsed.success) {
    return;
  }

  const library = await loadAdminConjugationLibrary();
  const lesson = findLesson(library.lessons, parsed.data.lessonId);
  if (!lesson) {
    return;
  }

  lesson.items = lesson.items.filter((item) => item.id !== parsed.data.itemId);
  lesson.updatedAt = nowIso();
  await saveAdminConjugationLibrary(library);
  touchPaths();
}

