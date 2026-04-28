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
  type JlptLevel,
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
  formLabel: z.preprocess(
    (value) => (typeof value === "string" ? value : undefined),
    z.string().trim().max(40).optional()
  ),
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

const moveLessonLevelSchema = z.object({
  lessonId: z.string().min(1),
  targetLevel: z.preprocess(
    (value) => normalizeJlptLevel(value),
    z.enum(JLPT_LEVELS).default("N5")
  ),
});

const importItemsSchema = z.object({
  lessonId: z.preprocess(
    (value) => {
      if (typeof value !== "string") {
        return undefined;
      }
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    },
    z.string().min(1).optional()
  ),
  jlptLevel: z.preprocess(
    (value) => normalizeJlptLevel(value),
    z.enum(JLPT_LEVELS).default("N5")
  ),
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
  revalidatePath("/conjugation");
}

function findLesson(
  lessons: AdminConjugationLesson[],
  lessonId: string
): AdminConjugationLesson | null {
  return lessons.find((lesson) => lesson.id === lessonId) ?? null;
}

function normalizeLookupKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

function valueToString(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return "";
}

function pickString(source: Record<string, unknown>, keys: string[]): string {
  const entries = Object.entries(source);
  const normalizedEntryPairs = entries.map(([rawKey, rawValue]) => [
    normalizeLookupKey(rawKey),
    rawValue,
  ] as const);

  for (const key of keys) {
    const directValue = valueToString(source[key]);
    if (directValue) {
      return directValue;
    }

    const normalizedTarget = normalizeLookupKey(key);
    const matched = normalizedEntryPairs.find(([normalizedKey]) => normalizedKey === normalizedTarget);
    const value = matched ? valueToString(matched[1]) : "";
    if (value) {
      return value;
    }
  }
  return "";
}

function toFormLabelFromKey(rawKey: string): string {
  const raw = rawKey.trim();
  const key = normalizeLookupKey(raw);
  if (!key) {
    return "";
  }

  const aliases: Record<string, string> = {
    teform: "Thể て",
    taform: "Thể た",
    naiform: "Thể ない",
    masuform: "Thể ます",
    dictionaryform: "Thể từ điển",
  };
  if (aliases[key]) {
    return aliases[key];
  }

  return raw
    .replace(/[_-]+/g, " ")
    .replace(/\bform\b/i, "thể")
    .replace(/\s+/g, " ")
    .trim();
}

function hasImportPayload(source: Record<string, unknown>): boolean {
  return (
    Array.isArray(source.items) ||
    Array.isArray(source.rows) ||
    Array.isArray(source.data) ||
    Array.isArray(source.sections) ||
    Array.isArray(source["item list"]) ||
    Array.isArray(source["section list"])
  );
}

function firstImportContainer(rawInput: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(rawInput) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const source = parsed as Record<string, unknown>;
      if (hasImportPayload(source)) {
        return source;
      }
    }
    if (Array.isArray(parsed)) {
      for (const entry of parsed) {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
          continue;
        }
        const source = entry as Record<string, unknown>;
        if (hasImportPayload(source)) {
          return source;
        }
      }
    }
  } catch {
    return null;
  }
  return null;
}

function firstSection(source: Record<string, unknown>): Record<string, unknown> | null {
  const rawSections =
    source.sections ??
    source.sectionList ??
    source.section_list ??
    source["section list"];
  if (!Array.isArray(rawSections)) {
    return null;
  }
  for (const section of rawSections) {
    if (!section || typeof section !== "object" || Array.isArray(section)) {
      continue;
    }
    return section as Record<string, unknown>;
  }
  return null;
}

type ImportLessonMeta = {
  title: string;
  description: string;
  jlptLevel: JlptLevel;
  formKey: string;
  formLabel: string;
};

function extractImportLessonMeta(
  rawInput: string,
  fallbackLevel: JlptLevel
): ImportLessonMeta {
  const container = firstImportContainer(rawInput);
  if (!container) {
    return {
      title: "Bài nhập JSON",
      description: "",
      jlptLevel: fallbackLevel,
      formKey: "",
      formLabel: "",
    };
  }

  const section = firstSection(container);
  const metadataSource = section ?? container;
  const levelRaw =
    pickString(container, ["jlptLevel", "jlpt", "level", "nLevel"]) ||
    pickString(metadataSource, ["jlptLevel", "jlpt", "level", "nLevel"]);
  const jlptLevel = normalizeJlptLevel(levelRaw || fallbackLevel);
  const description = pickString(metadataSource, ["description", "desc", "topic"]).slice(0, 180);
  const titleFromInput = pickString(metadataSource, [
    "title",
    "lesson_title",
    "lessonTitle",
    "section_title",
    "sectionTitle",
    "name",
  ]);

  const formKey = pickString(metadataSource, [
    "form",
    "target_form",
    "targetForm",
    "form_key",
    "formKey",
  ]).toLowerCase();
  const lessonNo = pickString(container, [
    "lesson",
    "lesson_no",
    "lessonNumber",
    "lesson_number",
  ]);
  const explicitFormLabel = pickString(metadataSource, ["form_label", "formLabel"]);
  const formLabel = explicitFormLabel || toFormLabelFromKey(formKey);

  const fallbackTitleBase = lessonNo ? `Bài ${lessonNo}` : "Bài nhập JSON";
  const fallbackTitle = formLabel
    ? `${fallbackTitleBase} - ${formLabel}`
    : fallbackTitleBase;

  return {
    title: (titleFromInput || fallbackTitle).slice(0, 64),
    description,
    jlptLevel,
    formKey,
    formLabel,
  };
}

function findLessonByTitle(
  lessons: AdminConjugationLesson[],
  title: string,
  level: JlptLevel
): AdminConjugationLesson | null {
  const key = title.trim().toLowerCase();
  if (!key) {
    return null;
  }
  return (
    lessons.find(
      (lesson) =>
        lesson.jlptLevel === level && lesson.title.trim().toLowerCase() === key
    ) ?? null
  );
}

function normalizeIdentityText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function lessonLooksLikeFormLabel(lessonTitle: string, formLabel: string): boolean {
  const normalizedTitle = normalizeIdentityText(lessonTitle);
  const normalizedForm = normalizeIdentityText(formLabel);
  if (!normalizedTitle || !normalizedForm) {
    return false;
  }
  return (
    normalizedTitle === normalizedForm ||
    normalizedTitle.endsWith(`- ${normalizedForm}`) ||
    normalizedTitle.includes(` ${normalizedForm}`)
  );
}

function findLessonByFormIdentity(
  lessons: AdminConjugationLesson[],
  meta: ImportLessonMeta
): AdminConjugationLesson | null {
  const formKey = normalizeLookupKey(meta.formKey);
  const formLabel = normalizeIdentityText(meta.formLabel);

  return (
    lessons.find((lesson) => {
      if (lesson.jlptLevel !== meta.jlptLevel) {
        return false;
      }
      if (formKey && normalizeLookupKey(lesson.formKey || "") === formKey) {
        return true;
      }
      if (formLabel && normalizeIdentityText(lesson.formLabel || "") === formLabel) {
        return true;
      }
      if (formLabel && lessonLooksLikeFormLabel(lesson.title, meta.formLabel)) {
        return true;
      }
      return false;
    }) ?? null
  );
}

function getOrCreateLessonByMeta(
  lessons: AdminConjugationLesson[],
  meta: ImportLessonMeta
): { lesson: AdminConjugationLesson; createdLesson: boolean } {
  const existing =
    findLessonByFormIdentity(lessons, meta) ??
    findLessonByTitle(lessons, meta.title, meta.jlptLevel);
  if (existing) {
    if (meta.formKey && !existing.formKey) {
      existing.formKey = meta.formKey;
    }
    if (meta.formLabel && !existing.formLabel) {
      existing.formLabel = meta.formLabel;
    }
    if (meta.description && !existing.description) {
      existing.description = meta.description;
    }
    return { lesson: existing, createdLesson: false };
  }

  const now = nowIso();
  const lesson: AdminConjugationLesson = {
    id: crypto.randomUUID(),
    title: meta.title,
    description: meta.description,
    formKey: meta.formKey,
    formLabel: meta.formLabel,
    jlptLevel: meta.jlptLevel,
    createdAt: now,
    updatedAt: now,
    items: [],
  };
  lessons.push(lesson);
  return { lesson, createdLesson: true };
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
    formKey: "",
    formLabel: "",
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
    formLabel: formData.get("formLabel"),
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
  lesson.formLabel = parsed.data.formLabel || "";
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

export async function moveAdminConjugationLessonLevelAction(formData: FormData) {
  await requireAdmin();

  const parsed = moveLessonLevelSchema.safeParse({
    lessonId: formData.get("lessonId"),
    targetLevel: formData.get("targetLevel"),
  });
  if (!parsed.success) {
    return;
  }

  const library = await loadAdminConjugationLibrary();
  const lesson = findLesson(library.lessons, parsed.data.lessonId);
  if (!lesson) {
    return;
  }

  lesson.jlptLevel = parsed.data.targetLevel;
  lesson.updatedAt = nowIso();

  await saveAdminConjugationLibrary(library);
  touchPaths();
  redirect(`/admin/conjugation?level=${lesson.jlptLevel}&lesson=${lesson.id}`);
}

export async function importAdminConjugationItemsAction(
  _prevState: AdminConjugationImportState,
  formData: FormData
): Promise<AdminConjugationImportState> {
  await requireAdmin();

  const parsed = importItemsSchema.safeParse({
    lessonId: formData.get("lessonId"),
    jlptLevel: formData.get("jlptLevel"),
    rawInput: formData.get("rawInput"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Hãy nhập JSON hợp lệ.",
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

  const library = await loadAdminConjugationLibrary();
  const meta = extractImportLessonMeta(parsed.data.rawInput, parsed.data.jlptLevel);
  const hasContainerPayload = firstImportContainer(parsed.data.rawInput) !== null;
  const hasFormIdentity = Boolean(meta.formKey || meta.formLabel);
  const requestedLessonId = parsed.data.lessonId ?? "";
  let lesson: AdminConjugationLesson;
  let createdLesson = false;

  if (hasContainerPayload && hasFormIdentity) {
    const result = getOrCreateLessonByMeta(library.lessons, meta);
    lesson = result.lesson;
    createdLesson = result.createdLesson;
  } else if (requestedLessonId) {
    const selectedLesson = findLesson(library.lessons, requestedLessonId);
    if (selectedLesson) {
      lesson = selectedLesson;
    } else {
      const result = getOrCreateLessonByMeta(library.lessons, meta);
      lesson = result.lesson;
      createdLesson = result.createdLesson;
    }
  } else {
    const result = getOrCreateLessonByMeta(library.lessons, meta);
    lesson = result.lesson;
    createdLesson = result.createdLesson;
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
    message: createdLesson
      ? `Đã tạo lesson "${lesson.title}" và thêm ${rows.length} mục chia thể.`
      : `Đã thêm ${rows.length} mục chia thể vào lesson "${lesson.title}".`,
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
