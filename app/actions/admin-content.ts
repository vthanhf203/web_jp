"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin";
import {
  GRAMMAR_LEVELS,
  loadGrammarDataset,
  saveGrammarDataset,
  type GrammarLesson,
  type GrammarLevel,
} from "@/lib/grammar-dataset";
import { parseGrammarInput } from "@/lib/grammar-import";
import { parseKanjiInput } from "@/lib/kanji-import";
import { prisma } from "@/lib/prisma";

export type AdminImportState = {
  status: "idle" | "success" | "error";
  message: string;
};

const createGrammarLessonSchema = z.object({
  level: z.enum(GRAMMAR_LEVELS).default("N5"),
  title: z.preprocess(
    (value) => (typeof value === "string" ? value : undefined),
    z.string().trim().max(100).optional()
  ),
  topic: z.preprocess(
    (value) => (typeof value === "string" ? value : undefined),
    z.string().trim().max(120).optional()
  ),
  lessonNumber: z.preprocess((value) => {
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
  }, z.number().int().min(1).max(200).optional()),
});

const updateGrammarLessonSchema = z.object({
  lessonId: z.string().min(1),
  title: z.string().trim().min(1).max(100),
  topic: z.preprocess(
    (value) => (typeof value === "string" ? value : undefined),
    z.string().trim().max(120).optional()
  ),
  lessonNumber: z.preprocess((value) => {
    if (typeof value === "string") {
      return Number(value.trim());
    }
    return value;
  }, z.number().int().min(1).max(200)),
});

const deleteGrammarLessonSchema = z.object({
  lessonId: z.string().min(1),
});

const importGrammarSchema = z.object({
  lessonId: z.string().min(1),
  rawInput: z.string().min(1),
});

const clearGrammarPointsSchema = z.object({
  lessonId: z.string().min(1),
});

const deleteGrammarPointSchema = z.object({
  lessonId: z.string().min(1),
  pointId: z.string().min(1),
});

const importKanjiSchema = z.object({
  rawInput: z.string().min(1),
});

const uploadGrammarImageSchema = z.object({
  lessonId: z.string().min(1),
  title: z.preprocess(
    (value) => (typeof value === "string" ? value : undefined),
    z.string().trim().max(120).optional()
  ),
  meaning: z.preprocess(
    (value) => (typeof value === "string" ? value : undefined),
    z.string().trim().max(200).optional()
  ),
});

const deleteKanjiSchema = z.object({
  kanjiId: z.string().min(1),
});

function touchGrammarPaths() {
  revalidatePath("/admin");
  revalidatePath("/admin/grammar");
  revalidatePath("/grammar");
  revalidatePath("/api/grammar");
}

function touchKanjiPaths() {
  revalidatePath("/admin");
  revalidatePath("/admin/kanji");
  revalidatePath("/kanji");
  revalidatePath("/api/kanji-library");
}

function normalizeLevel(value: string): GrammarLevel {
  return value === "N4" ? "N4" : "N5";
}

function nextLessonNumber(lessons: GrammarLesson[], level: GrammarLevel): number {
  const maxNumber = lessons
    .filter((lesson) => lesson.level === level)
    .reduce((max, lesson) => Math.max(max, lesson.lessonNumber), 0);
  return maxNumber + 1;
}

function uniqueLessonId(lessons: GrammarLesson[], level: GrammarLevel, lessonNumber: number): string {
  const baseId = `lesson-${String(lessonNumber).padStart(2, "0")}-${level.toLowerCase()}`;
  if (!lessons.some((lesson) => lesson.id === baseId)) {
    return baseId;
  }
  return `${baseId}-${crypto.randomUUID().slice(0, 6)}`;
}

function sortLessons(lessons: GrammarLesson[]): GrammarLesson[] {
  const levelRank = {
    N5: 0,
    N4: 1,
  } as const;

  return [...lessons].sort((a, b) => {
    const levelOrder = levelRank[a.level] - levelRank[b.level];
    if (levelOrder !== 0) {
      return levelOrder;
    }
    return a.lessonNumber - b.lessonNumber;
  });
}

export async function createAdminGrammarLessonAction(formData: FormData) {
  await requireAdmin();

  const parsed = createGrammarLessonSchema.safeParse({
    level: formData.get("level"),
    title: formData.get("title"),
    topic: formData.get("topic"),
    lessonNumber: formData.get("lessonNumber"),
  });
  if (!parsed.success) {
    return;
  }

  const dataset = await loadGrammarDataset();
  const level = normalizeLevel(parsed.data.level);
  const lessonNumber = parsed.data.lessonNumber ?? nextLessonNumber(dataset.lessons, level);
  const lessonId = uniqueLessonId(dataset.lessons, level, lessonNumber);

  const lesson: GrammarLesson = {
    id: lessonId,
    level,
    lessonNumber,
    title: parsed.data.title || `Bai ${lessonNumber}`,
    topic: parsed.data.topic || "",
    pointCount: 0,
    points: [],
  };

  dataset.lessons = sortLessons([...dataset.lessons, lesson]);
  dataset.lessonCount = dataset.lessons.length;

  await saveGrammarDataset(dataset);
  touchGrammarPaths();
  redirect(`/admin/grammar?level=${level}&lesson=${lesson.id}`);
}

export async function updateAdminGrammarLessonAction(formData: FormData) {
  await requireAdmin();

  const parsed = updateGrammarLessonSchema.safeParse({
    lessonId: formData.get("lessonId"),
    title: formData.get("title"),
    topic: formData.get("topic"),
    lessonNumber: formData.get("lessonNumber"),
  });
  if (!parsed.success) {
    return;
  }

  const dataset = await loadGrammarDataset();
  const lesson = dataset.lessons.find((entry) => entry.id === parsed.data.lessonId);
  if (!lesson) {
    return;
  }

  lesson.title = parsed.data.title;
  lesson.topic = parsed.data.topic || "";
  lesson.lessonNumber = parsed.data.lessonNumber;
  lesson.pointCount = lesson.points.length;
  lesson.points = lesson.points.map((point, index) => ({
    ...point,
    order: index + 1,
  }));

  dataset.lessons = sortLessons(dataset.lessons);
  dataset.lessonCount = dataset.lessons.length;
  await saveGrammarDataset(dataset);
  touchGrammarPaths();
  redirect(`/admin/grammar?level=${lesson.level}&lesson=${lesson.id}`);
}

export async function deleteAdminGrammarLessonAction(formData: FormData) {
  await requireAdmin();

  const parsed = deleteGrammarLessonSchema.safeParse({
    lessonId: formData.get("lessonId"),
  });
  if (!parsed.success) {
    return;
  }

  const dataset = await loadGrammarDataset();
  const lesson = dataset.lessons.find((entry) => entry.id === parsed.data.lessonId);
  if (!lesson) {
    return;
  }
  const level = lesson.level;

  dataset.lessons = dataset.lessons.filter((entry) => entry.id !== parsed.data.lessonId);
  dataset.lessonCount = dataset.lessons.length;
  await saveGrammarDataset(dataset);
  touchGrammarPaths();
  redirect(`/admin/grammar?level=${level}`);
}

export async function importAdminGrammarPointsAction(
  _prevState: AdminImportState,
  formData: FormData
): Promise<AdminImportState> {
  await requireAdmin();

  const parsed = importGrammarSchema.safeParse({
    lessonId: formData.get("lessonId"),
    rawInput: formData.get("rawInput"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Hay chon bai va nhap du lieu ngu phap hop le.",
    };
  }

  const dataset = await loadGrammarDataset();
  const lesson = dataset.lessons.find((entry) => entry.id === parsed.data.lessonId);
  if (!lesson) {
    return {
      status: "error",
      message: "Khong tim thay bai ngu phap.",
    };
  }

  const rows = parseGrammarInput(parsed.data.rawInput).slice(0, 500);
  if (rows.length === 0) {
    return {
      status: "error",
      message: "Khong parse duoc du lieu. Hay thu JSON hoac JSON-lines.",
    };
  }

  const startOrder = lesson.points.length;
  lesson.points.push(
    ...rows.map((row, index) => ({
      id: crypto.randomUUID(),
      order: startOrder + index + 1,
      title: row.title,
      meaning: row.meaning || "",
      usage: row.usage || [],
      examples: row.examples || [],
      notes: row.notes || [],
      content: row.content || "",
      image: row.image || undefined,
    }))
  );
  lesson.pointCount = lesson.points.length;

  await saveGrammarDataset(dataset);
  touchGrammarPaths();
  return {
    status: "success",
    message: `Da them ${rows.length} mau ngu phap vao bai.`, 
  };
}

export async function uploadAdminGrammarImageAction(formData: FormData) {
  await requireAdmin();

  const parsed = uploadGrammarImageSchema.safeParse({
    lessonId: formData.get("lessonId"),
    title: formData.get("title"),
    meaning: formData.get("meaning"),
  });
  if (!parsed.success) {
    return;
  }

  const fileValue = formData.get("imageFile");
  if (!(fileValue instanceof File) || fileValue.size <= 0) {
    return;
  }
  if (fileValue.size > 2_500_000) {
    return;
  }

  const dataset = await loadGrammarDataset();
  const lesson = dataset.lessons.find((entry) => entry.id === parsed.data.lessonId);
  if (!lesson) {
    return;
  }

  const buffer = Buffer.from(await fileValue.arrayBuffer());
  const mimeType = fileValue.type?.startsWith("image/") ? fileValue.type : "image/png";
  const imageDataUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;

  const nextOrder = lesson.points.length + 1;
  lesson.points.push({
    id: crypto.randomUUID(),
    order: nextOrder,
    title: parsed.data.title || `Máº«u áº£nh ${nextOrder}`,
    meaning: parsed.data.meaning || "",
    usage: [],
    examples: [],
    notes: [],
    content: "",
    image: imageDataUrl,
  });
  lesson.pointCount = lesson.points.length;

  await saveGrammarDataset(dataset);
  touchGrammarPaths();
  redirect(`/admin/grammar?level=${lesson.level}&lesson=${lesson.id}`);
}

export async function clearAdminGrammarPointsAction(formData: FormData) {
  await requireAdmin();

  const parsed = clearGrammarPointsSchema.safeParse({
    lessonId: formData.get("lessonId"),
  });
  if (!parsed.success) {
    return;
  }

  const dataset = await loadGrammarDataset();
  const lesson = dataset.lessons.find((entry) => entry.id === parsed.data.lessonId);
  if (!lesson) {
    return;
  }

  lesson.points = [];
  lesson.pointCount = 0;
  await saveGrammarDataset(dataset);
  touchGrammarPaths();
}

export async function deleteAdminGrammarPointAction(formData: FormData) {
  await requireAdmin();

  const parsed = deleteGrammarPointSchema.safeParse({
    lessonId: formData.get("lessonId"),
    pointId: formData.get("pointId"),
  });
  if (!parsed.success) {
    return;
  }

  const dataset = await loadGrammarDataset();
  const lesson = dataset.lessons.find((entry) => entry.id === parsed.data.lessonId);
  if (!lesson) {
    return;
  }

  lesson.points = lesson.points
    .filter((point) => point.id !== parsed.data.pointId)
    .map((point, index) => ({
      ...point,
      order: index + 1,
    }));
  lesson.pointCount = lesson.points.length;
  await saveGrammarDataset(dataset);
  touchGrammarPaths();
}

export async function importAdminKanjiAction(
  _prevState: AdminImportState,
  formData: FormData
): Promise<AdminImportState> {
  await requireAdmin();

  const parsed = importKanjiSchema.safeParse({
    rawInput: formData.get("rawInput"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Hay nhap du lieu Kanji hop le.",
    };
  }

  const rows = parseKanjiInput(parsed.data.rawInput).slice(0, 1000);
  if (rows.length === 0) {
    return {
      status: "error",
      message: "Khong parse duoc du lieu Kanji. Hay thu JSON hoac JSON-lines.",
    };
  }

  const uniqueCharacters = Array.from(new Set(rows.map((row) => row.character)));
  const existing = await prisma.kanji.findMany({
    where: {
      character: {
        in: uniqueCharacters,
      },
    },
    select: {
      character: true,
    },
  });
  const existingSet = new Set(existing.map((entry) => entry.character));

  let createdCount = 0;
  let updatedCount = 0;

  for (const row of rows) {
    if (existingSet.has(row.character)) {
      await prisma.kanji.update({
        where: { character: row.character },
        data: {
          meaning: row.meaning,
          onReading: row.onReading || "-",
          kunReading: row.kunReading || "-",
          strokeCount: Math.max(1, row.strokeCount),
          jlptLevel: row.jlptLevel || "N5",
          exampleWord: row.exampleWord || row.character,
          exampleMeaning: row.exampleMeaning || row.meaning,
        },
      });
      updatedCount += 1;
    } else {
      await prisma.kanji.create({
        data: {
          character: row.character,
          meaning: row.meaning,
          onReading: row.onReading || "-",
          kunReading: row.kunReading || "-",
          strokeCount: Math.max(1, row.strokeCount),
          jlptLevel: row.jlptLevel || "N5",
          exampleWord: row.exampleWord || row.character,
          exampleMeaning: row.exampleMeaning || row.meaning,
        },
      });
      existingSet.add(row.character);
      createdCount += 1;
    }
  }

  touchKanjiPaths();
  return {
    status: "success",
    message: `Da xu ly ${rows.length} kanji (${createdCount} moi, ${updatedCount} cap nhat).`, 
  };
}

export async function deleteAdminKanjiAction(formData: FormData) {
  await requireAdmin();

  const parsed = deleteKanjiSchema.safeParse({
    kanjiId: formData.get("kanjiId"),
  });
  if (!parsed.success) {
    return;
  }

  const kanjiId = parsed.data.kanjiId;

  // Delete dependent review rows first to avoid FK differences across environments.
  await prisma.$transaction([
    prisma.review.deleteMany({
      where: { kanjiId },
    }),
    prisma.kanji.deleteMany({
      where: { id: kanjiId },
    }),
  ]);

  touchKanjiPaths();
}
