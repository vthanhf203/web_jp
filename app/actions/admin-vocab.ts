"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin";
import {
  JLPT_LEVELS,
  loadAdminVocabLibrary,
  loadAdminVocabImportHistory,
  normalizeJlptLevel,
  saveAdminVocabImportHistory,
  saveAdminVocabLibrary,
  type AdminVocabLesson,
  type AdminVocabImportHistoryEntry,
  type AdminVocabImportLessonChange,
} from "@/lib/admin-vocab-library";
import { parseVocabInput, parseVocabLessonBundleInput } from "@/lib/vocab-import";

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

const importLessonBundleSchema = z.object({
  rawInput: z.string().min(1),
  defaultJlptLevel: z.preprocess(
    (value) => normalizeJlptLevel(value),
    z.enum(JLPT_LEVELS).default("N5")
  ),
});

const rollbackImportSchema = z.object({
  entryId: z.string().min(1),
});

const deleteImportHistorySchema = z.object({
  entryId: z.string().min(1),
});

const syncItemsFromUrlSchema = z.object({
  lessonId: z.string().min(1),
  sourceUrl: z.string().url(),
  limit: z.preprocess((value) => {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) {
        return undefined;
      }
      return Number(trimmed);
    }
    if (typeof value === "number") {
      return value;
    }
    return undefined;
  }, z.number().int().min(1).max(2000).optional()),
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

const moveItemTopicSchema = z.object({
  sourceLessonId: z.string().min(1),
  targetLessonId: z.string().min(1),
  itemId: z.string().min(1),
  currentLevel: z.preprocess(
    (value) => (typeof value === "string" ? value : undefined),
    z.string().trim().optional()
  ),
  returnLessonId: z.preprocess(
    (value) => (typeof value === "string" ? value : undefined),
    z.string().trim().optional()
  ),
});

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeLessonIdentity(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

function findLesson(lessons: AdminVocabLesson[], lessonId: string): AdminVocabLesson | null {
  return lessons.find((lesson) => lesson.id === lessonId) ?? null;
}

function touchSharedPaths() {
  revalidatePath("/admin/vocab");
  revalidatePath("/vocab");
  revalidatePath("/api/vocab-library");
}

async function appendImportHistoryEntry(
  entry: Omit<AdminVocabImportHistoryEntry, "id" | "createdAt">
) {
  const history = await loadAdminVocabImportHistory();
  const payload: AdminVocabImportHistoryEntry = {
    ...entry,
    id: crypto.randomUUID(),
    createdAt: nowIso(),
  };
  history.unshift(payload);
  await saveAdminVocabImportHistory(history);
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
      message: "Hãy chọn lesson và nhập dữ liệu hợp lệ.",
    };
  }

  const library = await loadAdminVocabLibrary();
  const lesson = findLesson(library.lessons, parsed.data.lessonId);
  if (!lesson) {
    return {
      status: "error",
      message: "Không tìm thấy lesson admin.",
    };
  }

  const rows = parseVocabInput(parsed.data.rawInput).slice(0, 500);
  if (rows.length === 0) {
    return {
      status: "error",
      message: "Không parse được dữ liệu. Thử lại với JSON hoặc mỗi dòng 1 từ.",
    };
  }
  const noKanjiCount = rows.filter((row) => !row.kanji.trim()).length;

  const now = nowIso();
  const mappedRows = rows.map((row) => ({
    id: crypto.randomUUID(),
    word: row.word,
    reading: row.reading,
    kanji: row.kanji || "",
    hanviet: row.hanviet || "",
    partOfSpeech: row.partOfSpeech || "",
    meaning: row.meaning,
    createdAt: now,
    updatedAt: now,
  }));

  lesson.items.push(...mappedRows);
  lesson.updatedAt = now;

  await saveAdminVocabLibrary(library);
  await appendImportHistoryEntry({
    source: "single_lesson",
    importedRows: mappedRows.length,
    noKanjiCount,
    createdLessonIds: [],
    lessonChanges: [
      {
        lessonId: lesson.id,
        lessonTitle: lesson.title,
        jlptLevel: lesson.jlptLevel,
        itemIds: mappedRows.map((row) => row.id),
      },
    ],
  });
  touchSharedPaths();

  return {
    status: "success",
    message:
      noKanjiCount > 0
        ? `Đã thêm ${rows.length} từ vào kho admin. Lưu ý: ${noKanjiCount} từ chưa có field kanji nên có thể không hiện ở mục liên quan trên trang Kanji.`
        : `Đã thêm ${rows.length} từ vào kho admin.`,
  };
}

export async function importAdminVocabLessonBundleAction(
  _prevState: AdminImportState,
  formData: FormData
): Promise<AdminImportState> {
  await requireAdmin();

  const parsed = importLessonBundleSchema.safeParse({
    rawInput: formData.get("rawInput"),
    defaultJlptLevel: formData.get("defaultJlptLevel"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Dữ liệu JSON không hợp lệ.",
    };
  }

  const bundle = parseVocabLessonBundleInput(parsed.data.rawInput);
  if (bundle.lessons.length === 0) {
    return {
      status: "error",
      message:
        "Không tìm thấy cấu trúc JSON hợp lệ. Hỗ trợ 3 dạng: { lessons: { bai_1: [...] } }, { xung_ho_chao_hoi: [{..., lesson:'bai_1'}], ... } hoặc [{ categoryKey, categoryName, items:[...] }, ...].",
    };
  }

  const hardRowLimit = 5000;
  let remainingRows = hardRowLimit;
  let importedRows = 0;
  let createdLessons = 0;
  let updatedLessons = 0;
  let noKanjiCount = 0;

  const library = await loadAdminVocabLibrary();
  const now = nowIso();
  const lessonChangeMap = new Map<string, AdminVocabImportLessonChange>();
  const createdLessonIds: string[] = [];

  for (const lessonInput of bundle.lessons) {
    if (remainingRows <= 0) {
      break;
    }

    const rows = lessonInput.rows.slice(0, remainingRows);
    if (rows.length === 0) {
      continue;
    }
    remainingRows -= rows.length;
    importedRows += rows.length;
    noKanjiCount += rows.filter((row) => !row.kanji.trim()).length;

    const lessonLevel = normalizeJlptLevel(
      lessonInput.jlptLevel || parsed.data.defaultJlptLevel
    );
    const lessonTitle = lessonInput.title.trim() || `Admin lesson ${library.lessons.length + 1}`;
    const normalizedTitle = lessonTitle.toLowerCase();
    const candidateKeys = new Set<string>([
      normalizeLessonIdentity(lessonTitle),
      normalizeLessonIdentity(lessonInput.key || lessonTitle),
    ]);

    const existingLesson = library.lessons.find((lesson) => {
      if (lesson.jlptLevel !== lessonLevel) {
        return false;
      }

      if (lesson.title.trim().toLowerCase() === normalizedTitle) {
        return true;
      }

      const lessonIdentity = normalizeLessonIdentity(lesson.title);
      return lessonIdentity.length > 0 && candidateKeys.has(lessonIdentity);
    });

    const mappedRows = rows.map((row) => ({
      id: crypto.randomUUID(),
      word: row.word,
      reading: row.reading,
      kanji: row.kanji || "",
      hanviet: row.hanviet || "",
      partOfSpeech: row.partOfSpeech || "",
      meaning: row.meaning,
      createdAt: now,
      updatedAt: now,
    }));

    if (existingLesson) {
      existingLesson.items.push(...mappedRows);
      existingLesson.updatedAt = now;
      const existingChange = lessonChangeMap.get(existingLesson.id);
      if (existingChange) {
        existingChange.itemIds.push(...mappedRows.map((row) => row.id));
      } else {
        lessonChangeMap.set(existingLesson.id, {
          lessonId: existingLesson.id,
          lessonTitle: existingLesson.title,
          jlptLevel: existingLesson.jlptLevel,
          itemIds: mappedRows.map((row) => row.id),
        });
      }
      updatedLessons += 1;
      continue;
    }

    const newLesson: AdminVocabLesson = {
      id: crypto.randomUUID(),
      title: lessonTitle,
      description: "",
      jlptLevel: lessonLevel,
      createdAt: now,
      updatedAt: now,
      items: mappedRows,
    };
    library.lessons.push(newLesson);
    createdLessonIds.push(newLesson.id);
    lessonChangeMap.set(newLesson.id, {
      lessonId: newLesson.id,
      lessonTitle: newLesson.title,
      jlptLevel: newLesson.jlptLevel,
      itemIds: mappedRows.map((row) => row.id),
    });
    createdLessons += 1;
  }

  if (importedRows === 0) {
    return {
      status: "error",
      message: "JSON hợp lệ nhưng không có dòng từ vựng nào để import.",
    };
  }

  await saveAdminVocabLibrary(library);
  await appendImportHistoryEntry({
    source: "bundle",
    importedRows,
    noKanjiCount,
    createdLessonIds,
    lessonChanges: Array.from(lessonChangeMap.values()).map((change) => ({
      ...change,
      itemIds: Array.from(new Set(change.itemIds)),
    })),
  });
  touchSharedPaths();

  const groupNote =
    bundle.groups.length > 0 ? ` Nhận diện ${bundle.groups.length} group trong JSON.` : "";
  const limitNote = remainingRows === 0 ? ` Đã đạt giới hạn ${hardRowLimit} dòng.` : "";

  return {
    status: "success",
    message:
      noKanjiCount > 0
        ? `Đã xử lý ${createdLessons + updatedLessons} lesson (${createdLessons} mới, ${updatedLessons} cập nhật), tổng ${importedRows} từ. ${noKanjiCount} từ chưa có kanji.${groupNote}${limitNote}`
        : `Đã xử lý ${createdLessons + updatedLessons} lesson (${createdLessons} mới, ${updatedLessons} cập nhật), tổng ${importedRows} từ.${groupNote}${limitNote}`,
  };
}

export async function syncAdminVocabFromUrlAction(
  _prevState: AdminImportState,
  formData: FormData
): Promise<AdminImportState> {
  await requireAdmin();

  const parsed = syncItemsFromUrlSchema.safeParse({
    lessonId: formData.get("lessonId"),
    sourceUrl: formData.get("sourceUrl"),
    limit: formData.get("limit"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "URL hoặc lesson không hợp lệ.",
    };
  }

  const library = await loadAdminVocabLibrary();
  const lesson = findLesson(library.lessons, parsed.data.lessonId);
  if (!lesson) {
    return {
      status: "error",
      message: "Không tìm thấy lesson admin.",
    };
  }

  const timeoutMs = 15000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(parsed.data.sourceUrl, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json,text/plain,*/*",
      },
    });

    if (!response.ok) {
      return {
        status: "error",
        message: `Không tải được dữ liệu từ URL (HTTP ${response.status}).`,
      };
    }

    const rawText = await response.text();
    const limit = parsed.data.limit ?? 500;
    const rows = parseVocabInput(rawText).slice(0, limit);
    if (rows.length === 0) {
      return {
        status: "error",
        message: "URL có dữ liệu nhưng không parse được theo form từ vựng.",
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
          ? `Đã sync ${rows.length} từ vào kho admin. Lưu ý: ${noKanjiCount} từ chưa có field kanji.`
          : `Đã sync ${rows.length} từ vào kho admin.`,
    };
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "Timeout khi gọi URL. Thử lại hoặc giảm giới hạn số dòng."
        : "Không thể kết nối tới URL này. Kiểm tra lại link và cho phép truy cập.";
    return {
      status: "error",
      message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function rollbackAdminVocabImportAction(formData: FormData) {
  await requireAdmin();

  const parsed = rollbackImportSchema.safeParse({
    entryId: formData.get("entryId"),
  });
  if (!parsed.success) {
    return;
  }

  const [library, history] = await Promise.all([
    loadAdminVocabLibrary(),
    loadAdminVocabImportHistory(),
  ]);
  const target = history.find((entry) => entry.id === parsed.data.entryId);
  if (!target || target.rolledBackAt) {
    return;
  }

  const now = nowIso();
  let libraryChanged = false;

  for (const lessonChange of target.lessonChanges) {
    if (lessonChange.itemIds.length === 0) {
      continue;
    }
    const lesson = findLesson(library.lessons, lessonChange.lessonId);
    if (!lesson) {
      continue;
    }

    const removeIds = new Set(lessonChange.itemIds);
    const beforeCount = lesson.items.length;
    lesson.items = lesson.items.filter((item) => !removeIds.has(item.id));
    if (lesson.items.length !== beforeCount) {
      lesson.updatedAt = now;
      libraryChanged = true;
    }
  }

  if (target.createdLessonIds.length > 0) {
    const createdIds = new Set(target.createdLessonIds);
    const beforeCount = library.lessons.length;
    library.lessons = library.lessons.filter(
      (lesson) => !(createdIds.has(lesson.id) && lesson.items.length === 0)
    );
    if (library.lessons.length !== beforeCount) {
      libraryChanged = true;
    }
  }

  target.rolledBackAt = now;

  const writes: Promise<unknown>[] = [saveAdminVocabImportHistory(history)];
  if (libraryChanged) {
    writes.unshift(saveAdminVocabLibrary(library));
  }
  await Promise.all(writes);
  touchSharedPaths();
}

export async function deleteAdminVocabImportHistoryAction(formData: FormData) {
  await requireAdmin();

  const parsed = deleteImportHistorySchema.safeParse({
    entryId: formData.get("entryId"),
  });
  if (!parsed.success) {
    return;
  }

  const history = await loadAdminVocabImportHistory();
  const nextHistory = history.filter((entry) => entry.id !== parsed.data.entryId);
  if (nextHistory.length === history.length) {
    return;
  }

  await saveAdminVocabImportHistory(nextHistory);
  revalidatePath("/admin/vocab");
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
  redirect(`/admin/vocab?level=${lesson.jlptLevel}&lesson=${lesson.id}`);
}

export async function moveAdminVocabItemTopicAction(formData: FormData) {
  await requireAdmin();

  const parsed = moveItemTopicSchema.safeParse({
    sourceLessonId: formData.get("sourceLessonId"),
    targetLessonId: formData.get("targetLessonId"),
    itemId: formData.get("itemId"),
    currentLevel: formData.get("currentLevel"),
    returnLessonId: formData.get("returnLessonId"),
  });
  if (!parsed.success) {
    return;
  }

  const {
    sourceLessonId,
    targetLessonId,
    itemId,
    currentLevel: currentLevelRaw,
    returnLessonId,
  } = parsed.data;

  if (sourceLessonId === targetLessonId) {
    const redirectLevel = normalizeJlptLevel(currentLevelRaw);
    const redirectLesson = returnLessonId || sourceLessonId;
    redirect(`/admin/vocab?level=${redirectLevel}&lesson=${redirectLesson}`);
  }

  const library = await loadAdminVocabLibrary();
  const sourceLesson = findLesson(library.lessons, sourceLessonId);
  const targetLesson = findLesson(library.lessons, targetLessonId);
  if (!sourceLesson || !targetLesson) {
    return;
  }

  const itemIndex = sourceLesson.items.findIndex((entry) => entry.id === itemId);
  if (itemIndex < 0) {
    return;
  }

  const [item] = sourceLesson.items.splice(itemIndex, 1);
  if (!item) {
    return;
  }

  const now = nowIso();
  item.updatedAt = now;
  sourceLesson.updatedAt = now;
  targetLesson.updatedAt = now;
  targetLesson.items.push(item);

  await saveAdminVocabLibrary(library);
  touchSharedPaths();

  const redirectLevel = normalizeJlptLevel(currentLevelRaw || sourceLesson.jlptLevel);
  const redirectLesson = returnLessonId || sourceLesson.id;
  redirect(`/admin/vocab?level=${redirectLevel}&lesson=${redirectLesson}`);
}
