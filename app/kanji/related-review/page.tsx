import {
  KanjiRelatedReviewClient,
  type KanjiGroup,
  type RelatedReviewMode,
  type RelatedReviewSource,
  type RelatedWord,
} from "@/app/components/kanji-related-review-client";
import {
  JLPT_LEVELS,
  loadAdminVocabLibrary,
  normalizeJlptLevel,
  type JlptLevel,
} from "@/lib/admin-vocab-library";
import { requireUser } from "@/lib/auth";
import { sortKanjiByLearningOrder } from "@/lib/kanji-compound";
import { loadAdminKanjiMetadata } from "@/lib/kanji-metadata";
import { prisma } from "@/lib/prisma";
import { loadUserKanjiStore } from "@/lib/user-kanji-store";

type SearchParams = Promise<{
  chars?: string | string[];
  level?: string | string[];
  mode?: string | string[];
  source?: string | string[];
}>;

type RelatedWordWithRank = RelatedWord & {
  sourceRank: number;
};

type BaseKanji = {
  id: string;
  character: string;
  hanviet: string;
  meaning: string;
  strokeCount: number;
  jlptLevel: JlptLevel;
  order: number | null;
};

function pickSingle(value?: string | string[]): string {
  if (!value) {
    return "";
  }
  return Array.isArray(value) ? (value[0] ?? "") : value;
}

function parseMode(value: string): RelatedReviewMode | null {
  const normalized = value.trim().toLowerCase();
  return normalized === "flashcard" || normalized === "quiz" ? normalized : null;
}

function parseSource(value: string): RelatedReviewSource {
  return value.trim().toLowerCase() === "json" ? "json" : "system";
}

function parseChars(value: string): string[] {
  if (!value.trim()) {
    return [];
  }
  return Array.from(
    new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

function dedupeWords(items: RelatedWordWithRank[]): RelatedWord[] {
  const uniqueMap = new Map<string, RelatedWordWithRank>();

  for (const item of items) {
    const key = `${item.kanji || item.word}|${item.reading}|${item.meaning}`;
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, item);
    }
  }

  return Array.from(uniqueMap.values())
    .sort((a, b) => {
      const rankDiff = a.sourceRank - b.sourceRank;
      if (rankDiff !== 0) {
        return rankDiff;
      }
      return (a.kanji || a.word).localeCompare(b.kanji || b.word, "ja");
    })
    .map(({ sourceRank: _sourceRank, ...item }) => item);
}

function pickHanvietFromWords(
  character: string,
  explicitHanviet: string,
  words: Array<{ word?: string; kanji?: string; hanviet?: string }>
): string {
  const direct = explicitHanviet.trim();
  if (direct) {
    return direct;
  }

  const exact = words.find((word) => {
    const hanviet = (word.hanviet ?? "").trim();
    return hanviet && (word.kanji === character || word.word === character);
  });
  if (exact?.hanviet?.trim()) {
    return exact.hanviet.trim();
  }

  return words.find((word) => word.hanviet?.trim())?.hanviet?.trim() ?? "";
}

function pushRelatedWord(
  target: RelatedWordWithRank[],
  item: {
    id: string;
    word: string;
    reading: string;
    kanji: string;
    hanviet: string;
    meaning: string;
    sourceLabel: string;
    sourceBucket: RelatedWord["sourceBucket"];
    sourceRank: number;
  },
  sourceCharacter: string
) {
  const word = (item.word || item.kanji || "").trim();
  const kanji = (item.kanji || item.word || "").trim();
  const meaning = item.meaning.trim();
  if (!word || !meaning) {
    return;
  }

  target.push({
    id: item.id,
    sourceCharacter,
    word,
    reading: item.reading.trim(),
    kanji,
    hanviet: item.hanviet.trim(),
    meaning,
    sourceLabel: item.sourceLabel,
    sourceBucket: item.sourceBucket,
    sourceRank: item.sourceRank,
  });
}

async function buildSystemGroups(userId: string, selectedLevel: JlptLevel) {
  const [kanjiList, vocabList, adminLibrary, kanjiMetadata, userKanjiStore] = await Promise.all([
    prisma.kanji.findMany({
      select: {
        id: true,
        character: true,
        meaning: true,
        strokeCount: true,
        jlptLevel: true,
      },
    }),
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
    loadUserKanjiStore(userId),
  ]);

  const metadataMap = new Map(kanjiMetadata.entries.map((entry) => [entry.character, entry]));
  const personalMap = new Map(userKanjiStore.items.map((entry) => [entry.character, entry]));
  const adminItems = adminLibrary.lessons.flatMap((lesson) =>
    lesson.items.map((item) => ({
      lessonId: lesson.id,
      lessonTitle: lesson.title,
      ...item,
    }))
  );

  const baseMap = new Map<string, BaseKanji>();
  for (const item of kanjiList) {
    const level = normalizeJlptLevel(item.jlptLevel);
    baseMap.set(item.character, {
      id: item.id,
      character: item.character,
      hanviet: "",
      meaning: item.meaning,
      strokeCount: item.strokeCount,
      jlptLevel: level,
      order: metadataMap.get(item.character)?.order ?? null,
    });
  }

  const levelCounts = JLPT_LEVELS.reduce(
    (acc, level) => {
      acc[level] = Array.from(baseMap.values()).filter((item) => item.jlptLevel === level).length;
      return acc;
    },
    {} as Record<JlptLevel, number>
  );

  const baseKanji = sortKanjiByLearningOrder(
    Array.from(baseMap.values()).filter((item) => item.jlptLevel === selectedLevel),
    {
      getOrder: (item) => item.order,
    }
  );

  const groups: KanjiGroup[] = baseKanji.map((kanji) => {
    const words: RelatedWordWithRank[] = [];
    const personalEntry = personalMap.get(kanji.character);
    const metadataEntry = metadataMap.get(kanji.character);

    for (const item of personalEntry?.relatedWords ?? []) {
      pushRelatedWord(
        words,
        {
          id: `personal-${kanji.character}-${item.id}`,
          word: item.word,
          reading: item.reading,
          kanji: item.kanji,
          hanviet: item.hanviet,
          meaning: item.meaning,
          sourceLabel: item.sourceLabel || "JSON cá nhân",
          sourceBucket: "personal",
          sourceRank: 0,
        },
        kanji.character
      );
    }

    for (const item of metadataEntry?.relatedWords ?? []) {
      pushRelatedWord(
        words,
        {
          id: `kanji-json-${kanji.character}-${item.id}`,
          word: item.word,
          reading: item.reading,
          kanji: item.kanji,
          hanviet: item.hanviet,
          meaning: item.meaning,
          sourceLabel: item.sourceLabel || "Kanji JSON",
          sourceBucket: "kanji-json",
          sourceRank: 1,
        },
        kanji.character
      );
    }

    for (const item of adminItems) {
      const sourceText = `${item.kanji} ${item.word}`;
      if (!sourceText.includes(kanji.character)) {
        continue;
      }
      pushRelatedWord(
        words,
        {
          id: `admin-${item.lessonId}-${item.id}`,
          word: item.word,
          reading: item.reading,
          kanji: item.kanji || item.word,
          hanviet: item.hanviet,
          meaning: item.meaning,
          sourceLabel: item.lessonTitle || "Nguồn admin upload",
          sourceBucket: "admin",
          sourceRank: 2,
        },
        kanji.character
      );
    }

    for (const item of vocabList) {
      if (!item.word.includes(kanji.character)) {
        continue;
      }
      pushRelatedWord(
        words,
        {
          id: `core-${item.id}`,
          word: item.word,
          reading: item.reading,
          kanji: item.word,
          hanviet: "",
          meaning: item.meaning,
          sourceLabel: "Từ vựng hệ thống",
          sourceBucket: "system",
          sourceRank: 3,
        },
        kanji.character
      );
    }

    const allWordsForHanviet = [
      ...(personalEntry?.relatedWords ?? []),
      ...(metadataEntry?.relatedWords ?? []),
      ...adminItems,
    ];

    return {
      character: kanji.character,
      hanviet: pickHanvietFromWords(kanji.character, kanji.hanviet, allWordsForHanviet),
      meaning: kanji.meaning,
      jlptLevel: kanji.jlptLevel,
      words: dedupeWords(words),
    };
  });

  return {
    groups,
    levelCounts,
  };
}

export default async function KanjiRelatedReviewPage(props: { searchParams: SearchParams }) {
  const user = await requireUser();
  const params = await props.searchParams;
  const selectedLevel = normalizeJlptLevel(pickSingle(params.level) || "N5");
  const mode = parseMode(pickSingle(params.mode));
  const source = parseSource(pickSingle(params.source));
  const initialChars = parseChars(pickSingle(params.chars));
  const systemData = await buildSystemGroups(user.id, selectedLevel);

  return (
    <KanjiRelatedReviewClient
      initialChars={initialChars}
      initialMode={mode}
      initialSource={source}
      levelCounts={systemData.levelCounts}
      selectedLevel={selectedLevel}
      systemGroups={systemData.groups}
    />
  );
}
