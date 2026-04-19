import Link from "next/link";

import { VocabStudyClient, type StudyMode } from "@/app/components/vocab-study-client";
import { JLPT_LEVELS, normalizeJlptLevel, type JlptLevel } from "@/lib/admin-vocab-library";
import { loadAdminVocabLibrary } from "@/lib/admin-vocab-library";
import { requireUser } from "@/lib/auth";
import { buildKanjiCompoundWords } from "@/lib/kanji-compound";
import { loadAdminKanjiMetadata } from "@/lib/kanji-metadata";
import { prisma } from "@/lib/prisma";

type SearchParams = Promise<{
  level?: string | string[];
  mode?: string | string[];
  char?: string | string[];
  source?: string | string[];
}>;

type RelatedStudyWord = {
  id: string;
  word: string;
  reading: string;
  kanji: string;
  hanviet: string;
  meaning: string;
  sourceRank: number;
};

function pickSingle(value?: string | string[]): string {
  if (!value) {
    return "";
  }
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value;
}

function isMode(value: string): value is StudyMode {
  return value === "flashcard" || value === "quiz" || value === "recall";
}

function buildBackHref(level: JlptLevel, char: string): string {
  const backParams = new URLSearchParams();
  if (level && JLPT_LEVELS.includes(level)) {
    backParams.set("level", level);
  }
  if (char) {
    backParams.set("selected", char);
  }
  const backQuery = backParams.toString();
  return backQuery ? `/kanji?${backQuery}` : "/kanji";
}

function dedupeRelatedStudyWords(items: RelatedStudyWord[]): RelatedStudyWord[] {
  const uniqueMap = new Map<string, RelatedStudyWord>();
  for (const item of items) {
    const key = `${item.kanji || item.word}|${item.reading}|${item.meaning}`;
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, item);
    }
  }
  return Array.from(uniqueMap.values()).sort((a, b) => {
    const sourceDiff = a.sourceRank - b.sourceRank;
    if (sourceDiff !== 0) {
      return sourceDiff;
    }
    return (a.kanji || a.word).localeCompare(b.kanji || b.word, "ja");
  });
}

export default async function KanjiWordLearnPage(props: { searchParams: SearchParams }) {
  await requireUser();
  const params = await props.searchParams;
  const levelRaw = pickSingle(params.level).trim();
  const modeRaw = pickSingle(params.mode).trim().toLowerCase();
  const char = pickSingle(params.char).trim();
  const sourceRaw = pickSingle(params.source).trim().toLowerCase();

  const level = normalizeJlptLevel(levelRaw || "N5");
  const mode: StudyMode = isMode(modeRaw) ? modeRaw : "flashcard";
  const source: "compound" | "related" = sourceRaw === "related" ? "related" : "compound";

  if (source === "related") {
    const [vocabList, adminLibrary, kanjiMetadata] = await Promise.all([
      prisma.vocab.findMany({
        orderBy: [{ jlptLevel: "asc" }, { word: "asc" }],
        select: {
          id: true,
          word: true,
          reading: true,
          meaning: true,
        },
      }),
      loadAdminVocabLibrary(),
      loadAdminKanjiMetadata(),
    ]);

    const merged: RelatedStudyWord[] = [];
    if (char) {
      const metadataEntry = kanjiMetadata.entries.find((entry) => entry.character === char);
      for (const item of metadataEntry?.relatedWords ?? []) {
        const displayWord = (item.word || item.kanji || "").trim();
        const displayKanji = (item.kanji || item.word || "").trim();
        const meaning = (item.meaning || "").trim();
        if (!displayWord || !meaning) {
          continue;
        }
        merged.push({
          id: `meta-${char}-${item.id}`,
          word: displayWord,
          reading: (item.reading || "").trim(),
          kanji: displayKanji,
          hanviet: (item.hanviet || "").trim(),
          meaning,
          sourceRank: 0,
        });
      }

      for (const lesson of adminLibrary.lessons) {
        for (const item of lesson.items) {
          const sourceText = `${item.kanji} ${item.word}`;
          if (!sourceText.includes(char)) {
            continue;
          }
          const displayWord = (item.word || item.kanji || "").trim();
          const displayKanji = (item.kanji || item.word || "").trim();
          const meaning = (item.meaning || "").trim();
          if (!displayWord || !meaning) {
            continue;
          }
          merged.push({
            id: `admin-${lesson.id}-${item.id}`,
            word: displayWord,
            reading: (item.reading || "").trim(),
            kanji: displayKanji,
            hanviet: (item.hanviet || "").trim(),
            meaning,
            sourceRank: 1,
          });
        }
      }

      for (const item of vocabList) {
        if (!item.word.includes(char)) {
          continue;
        }
        const displayWord = (item.word || "").trim();
        const meaning = (item.meaning || "").trim();
        if (!displayWord || !meaning) {
          continue;
        }
        merged.push({
          id: `core-${item.id}`,
          word: displayWord,
          reading: (item.reading || "").trim(),
          kanji: displayWord,
          hanviet: "",
          meaning,
          sourceRank: 2,
        });
      }
    }

    const relatedWords = dedupeRelatedStudyWords(merged);
    const backHref = buildBackHref(level, char);

    if (relatedWords.length === 0) {
      return (
        <section className="panel p-8">
          <h1 className="text-2xl font-bold text-slate-800">Chua co tu vung lien quan de hoc</h1>
          <p className="mt-2 text-slate-600">
            {char
              ? `Chua tim thay tu nao chua chu \"${char}\" tu JSON Kanji, admin upload, hoac CSDL he thong.`
              : "Ban chua chon chu Kanji de hoc tu lien quan."}
          </p>
          <Link href={backHref} className="btn-primary mt-5">
            Quay lai /kanji
          </Link>
        </section>
      );
    }

    const titleParts = [
      "Tu lien quan Kanji",
      char ? `Chu: ${char}` : "",
      `${relatedWords.length} tu`,
    ].filter(Boolean);

    return (
      <VocabStudyClient
        lessonTitle={titleParts.join(" | ")}
        mode={mode}
        items={relatedWords.map((item) => ({
          id: item.id,
          word: item.word,
          reading: item.reading,
          kanji: item.kanji,
          hanviet: item.hanviet,
          meaning: item.meaning,
        }))}
      />
    );
  }

  const [kanjiList, vocabList, adminLibrary, kanjiMetadata] = await Promise.all([
    prisma.kanji.findMany({
      where: { jlptLevel: level },
      select: {
        character: true,
        jlptLevel: true,
      },
    }),
    prisma.vocab.findMany({
      where: {
        jlptLevel: level,
      },
      select: {
        id: true,
        word: true,
        reading: true,
        meaning: true,
        jlptLevel: true,
      },
    }),
    loadAdminVocabLibrary(),
    loadAdminKanjiMetadata(),
  ]);

  const metadataWords = kanjiMetadata.entries
    .filter((entry) => kanjiList.some((kanji) => kanji.character === entry.character))
    .flatMap((entry) => entry.relatedWords);

  const allCompoundWords = buildKanjiCompoundWords({
    targetLevel: level,
    kanjiList,
    vocabList,
    adminLibrary,
    extraWords: metadataWords,
  });

  const compounds = char
    ? allCompoundWords.filter((item) => `${item.kanji} ${item.word}`.includes(char))
    : allCompoundWords;

  const backHref = buildBackHref(level, char);

  if (compounds.length === 0) {
    return (
      <section className="panel p-8">
        <h1 className="text-2xl font-bold text-slate-800">Chua co tu ghep de hoc</h1>
        <p className="mt-2 text-slate-600">
          Chua tim thay tu ghep dung theo bo Kanji {level}
          {char ? ` va chu \"${char}\"` : ""}. Hay bo sung them du lieu tu vung.
        </p>
        <Link href={backHref} className="btn-primary mt-5">
          Quay lai /kanji
        </Link>
      </section>
    );
  }

  const titleParts = [
    `${level} | Tu ghep Kanji`,
    char ? `Chu: ${char}` : "",
    `${compounds.length} tu`,
  ].filter(Boolean);

  return (
    <VocabStudyClient
      lessonTitle={titleParts.join(" | ")}
      mode={mode}
      items={compounds.map((item) => ({
        id: item.id,
        word: item.word,
        reading: item.reading,
        kanji: item.kanji,
        hanviet: item.hanviet,
        meaning: item.meaning,
      }))}
    />
  );
}
