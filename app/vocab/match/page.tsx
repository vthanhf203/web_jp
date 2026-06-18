import Link from "next/link";

import { VocabMatchGame, type MatchGameItem, type MatchSourceOption } from "@/app/components/vocab-match-game";
import {
  JLPT_LEVELS,
  loadAdminVocabLibrary,
  normalizeJlptLevel,
  type JlptLevel,
} from "@/lib/admin-vocab-library";
import { requireUser } from "@/lib/auth";
import { loadAdminKanjiMetadata } from "@/lib/kanji-metadata";
import { prisma } from "@/lib/prisma";
import type { ReadingVocabularyItem } from "@/lib/reading-practice-store";
import { loadReadingVocabStore } from "@/lib/reading-vocab-store";
import { loadUserKanjiStore } from "@/lib/user-kanji-store";
import { formatVocabLabel } from "@/lib/vietnamese-labels";
import { loadUserVocabStore } from "@/lib/vocab-store";

type SearchParams = Promise<{
  lesson?: string | string[];
  group?: string | string[];
  reading?: string | string[];
  level?: string | string[];
  kanjiLevel?: string | string[];
  kanjiDeck?: string | string[];
  relatedLevel?: string | string[];
  relatedDeck?: string | string[];
  relatedKanji?: string | string[];
}>;

type RelatedGameSource = {
  id: string;
  sourceCharacters: string;
  word: string;
  reading: string;
  kanji: string;
  meaning: string;
};

function pickSingle(value?: string | string[]): string {
  if (!value) {
    return "";
  }
  return Array.isArray(value) ? value[0] ?? "" : value;
}

function toGameItems(
  sourcePrefix: string,
  items: Array<{
    id: string;
    word: string;
    reading: string;
    kanji: string;
    meaning: string;
  }>
): MatchGameItem[] {
  return items
    .filter((item) => item.word.trim() && item.meaning.trim())
    .map((item) => ({
      id: `${sourcePrefix}:${item.id}`,
      word: item.kanji.trim() || item.word.trim(),
      reading: item.reading.trim() || item.word.trim(),
      meaning: item.meaning.trim(),
      kind: "vocab",
    }));
}

function toReadingGameItems(sourcePrefix: string, items: ReadingVocabularyItem[]): MatchGameItem[] {
  return items
    .filter((item) => item.word.trim() && item.meaning.trim())
    .map((item, index) => ({
      id: `${sourcePrefix}:${index}:${item.word}:${item.meaning}`,
      word: item.word.trim(),
      reading: item.reading.trim() || item.word.trim(),
      meaning: item.meaning.trim(),
      kind: "vocab",
    }));
}

function toKanjiGameItems(
  sourcePrefix: string,
  items: Array<{
    id: string;
    character: string;
    meaning: string;
    onReading: string;
    kunReading: string;
  }>
): MatchGameItem[] {
  return items
    .filter((item) => item.character.trim() && item.meaning.trim())
    .map((item) => ({
      id: `${sourcePrefix}:${item.id}`,
      word: item.character.trim(),
      reading: [item.onReading.trim(), item.kunReading.trim()].filter(Boolean).join(" / "),
      meaning: item.meaning.trim(),
      kind: "kanji",
    }));
}

function toRelatedGameItems(
  sourcePrefix: string,
  characters: string[],
  sources: RelatedGameSource[]
): MatchGameItem[] {
  const targetChars = new Set(characters.map((character) => character.trim()).filter(Boolean));
  const unique = new Map<string, MatchGameItem>();

  for (const item of sources) {
    if (!Array.from(targetChars).some((character) => item.sourceCharacters.includes(character))) {
      continue;
    }
    const word = (item.kanji || item.word).trim();
    const meaning = item.meaning.trim();
    if (!word || !meaning) {
      continue;
    }
    const reading = item.reading.trim() || item.word.trim() || word;
    const key = `${word}|${reading}|${meaning}`.toLowerCase();
    if (!unique.has(key)) {
      unique.set(key, {
        id: `${sourcePrefix}:${item.id}`,
        word,
        reading,
        meaning,
        kind: "related",
      });
    }
  }

  return Array.from(unique.values());
}

export default async function VocabMatchPage(props: { searchParams: SearchParams }) {
  const user = await requireUser();
  const params = await props.searchParams;
  const lessonId = pickSingle(params.lesson);
  const groupId = pickSingle(params.group);
  const readingTextId = pickSingle(params.reading);
  const requestedLevel = normalizeJlptLevel(pickSingle(params.level));
  const kanjiLevelParam = pickSingle(params.kanjiLevel);
  const kanjiDeckParam = pickSingle(params.kanjiDeck).trim();
  const relatedLevelParam = pickSingle(params.relatedLevel);
  const relatedDeckParam = pickSingle(params.relatedDeck).trim();
  const relatedKanji = pickSingle(params.relatedKanji).trim();
  const requestedKanjiLevel = normalizeJlptLevel(kanjiLevelParam || relatedLevelParam || requestedLevel);

  const [store, library, readingStore, dbKanji, coreVocab, kanjiMetadata, userKanjiStore] = await Promise.all([
    loadUserVocabStore(user.id),
    loadAdminVocabLibrary(),
    loadReadingVocabStore(user.id),
    prisma.kanji.findMany({
      select: {
        id: true,
        character: true,
        meaning: true,
        onReading: true,
        kunReading: true,
        jlptLevel: true,
      },
    }),
    prisma.vocab.findMany({
      select: {
        id: true,
        word: true,
        reading: true,
        meaning: true,
      },
    }),
    loadAdminKanjiMetadata(),
    loadUserKanjiStore(user.id),
  ]);

  const kanjiByCharacter = new Map<
    string,
    {
      id: string;
      character: string;
      meaning: string;
      onReading: string;
      kunReading: string;
      jlptLevel: JlptLevel;
    }
  >();
  for (const item of dbKanji) {
    kanjiByCharacter.set(item.character, {
      ...item,
      jlptLevel: normalizeJlptLevel(item.jlptLevel),
    });
  }
  for (const item of userKanjiStore.items) {
    kanjiByCharacter.set(item.character, {
      id: item.id,
      character: item.character,
      meaning: item.meaning,
      onReading: item.onReading,
      kunReading: item.kunReading,
      jlptLevel: item.jlptLevel,
    });
  }
  const allKanji = Array.from(kanjiByCharacter.values());

  const relatedSources: RelatedGameSource[] = [
    ...userKanjiStore.items.flatMap((entry) =>
      entry.relatedWords.map((word) => ({
        id: `personal:${entry.character}:${word.id}`,
        sourceCharacters: entry.character,
        word: word.word,
        reading: word.reading,
        kanji: word.kanji,
        meaning: word.meaning,
      }))
    ),
    ...kanjiMetadata.entries.flatMap((entry) =>
      entry.relatedWords.map((word) => ({
        id: `metadata:${entry.character}:${word.id}`,
        sourceCharacters: entry.character,
        word: word.word,
        reading: word.reading,
        kanji: word.kanji,
        meaning: word.meaning,
      }))
    ),
    ...library.lessons.flatMap((lesson) =>
      lesson.items.map((word) => ({
        id: `admin:${lesson.id}:${word.id}`,
        sourceCharacters: `${word.kanji} ${word.word}`,
        word: word.word,
        reading: word.reading,
        kanji: word.kanji,
        meaning: word.meaning,
      }))
    ),
    ...coreVocab.map((word) => ({
      id: `core:${word.id}`,
      sourceCharacters: word.word,
      word: word.word,
      reading: word.reading,
      kanji: word.word,
      meaning: word.meaning,
    })),
  ];

  const kanjiItemsByLevel = new Map<JlptLevel, MatchGameItem[]>();
  const relatedItemsByLevel = new Map<JlptLevel, MatchGameItem[]>();
  const personalKanjiDeckItems = new Map<string, MatchGameItem[]>();
  const personalRelatedSourcesByDeck = new Map<string, RelatedGameSource[]>();
  for (const deckName of userKanjiStore.decks) {
    const normalizedDeckName = deckName.trim();
    if (normalizedDeckName) {
      personalKanjiDeckItems.set(normalizedDeckName, []);
      personalRelatedSourcesByDeck.set(normalizedDeckName, []);
    }
  }
  for (const item of userKanjiStore.items) {
    const deckName = item.deckName.trim() || "Chua phan loai";
    const deckItems = personalKanjiDeckItems.get(deckName) ?? [];
    deckItems.push(...toKanjiGameItems(`kanji-deck:${deckName}`, [item]));
    personalKanjiDeckItems.set(deckName, deckItems);

    const deckRelatedSources = personalRelatedSourcesByDeck.get(deckName) ?? [];
    deckRelatedSources.push(
      ...item.relatedWords.map((word) => ({
        id: `personal:${deckName}:${item.character}:${word.id}`,
        sourceCharacters: item.character,
        word: word.word,
        reading: word.reading,
        kanji: word.kanji,
        meaning: word.meaning,
      }))
    );
    personalRelatedSourcesByDeck.set(deckName, deckRelatedSources);
  }
  const personalRelatedDeckItems = new Map<string, MatchGameItem[]>();
  for (const [deckName, deckItems] of personalKanjiDeckItems) {
    personalRelatedDeckItems.set(
      deckName,
      toRelatedGameItems(
        `kanji-related-deck:${deckName}`,
        deckItems.map((item) => item.word),
        personalRelatedSourcesByDeck.get(deckName) ?? []
      )
    );
  }
  for (const level of JLPT_LEVELS) {
    const levelKanji = allKanji.filter((item) => item.jlptLevel === level);
    kanjiItemsByLevel.set(level, toKanjiGameItems(`kanji-level:${level}`, levelKanji));
    relatedItemsByLevel.set(
      level,
      toRelatedGameItems(
        `kanji-related-level:${level}`,
        levelKanji.map((item) => item.character),
        relatedSources
      )
    );
  }
  const selectedRelatedKanjiItems = relatedKanji
    ? toRelatedGameItems(`kanji-related:${relatedKanji}`, [relatedKanji], relatedSources)
    : [];

  const levelCounts = new Map<JlptLevel, number>();
  for (const level of JLPT_LEVELS) {
    levelCounts.set(
      level,
      library.lessons
        .filter((lesson) => normalizeJlptLevel(lesson.jlptLevel) === level)
        .reduce((sum, lesson) => sum + lesson.items.length, 0)
    );
  }

  const sourceOptions: MatchSourceOption[] = [
    ...Array.from(personalKanjiDeckItems.keys())
      .sort((left, right) => left.localeCompare(right, "vi"))
      .flatMap<MatchSourceOption>((deckName) => {
        const kanjiItems = personalKanjiDeckItems.get(deckName) ?? [];
        const relatedItems = personalRelatedDeckItems.get(deckName) ?? [];
        return [
          ...(kanjiItems.length > 0
            ? [
                {
                  value: `kanji-deck:${deckName}`,
                  label: `Kanji - ${deckName}`,
                  href: `/vocab/match?kanjiDeck=${encodeURIComponent(deckName)}`,
                  group: "Kanji cá nhân và từ liên quan",
                  count: kanjiItems.length,
                },
              ]
            : []),
          ...(relatedItems.length > 0
            ? [
                {
                  value: `kanji-related-deck:${deckName}`,
                  label: `Từ liên quan - ${deckName}`,
                  href: `/vocab/match?relatedDeck=${encodeURIComponent(deckName)}`,
                  group: "Kanji cá nhân và từ liên quan",
                  count: relatedItems.length,
                },
              ]
            : []),
        ];
      }),
    ...JLPT_LEVELS.filter((level) => (kanjiItemsByLevel.get(level)?.length ?? 0) > 0).map((level) => ({
      value: `kanji-level:${level}`,
      label: `${level} - Kanji với nghĩa`,
      href: `/vocab/match?kanjiLevel=${level}`,
      group: "Kanji theo cấp độ",
      count: kanjiItemsByLevel.get(level)?.length ?? 0,
    })),
    ...JLPT_LEVELS.filter((level) => (relatedItemsByLevel.get(level)?.length ?? 0) > 0).map((level) => ({
      value: `kanji-related-level:${level}`,
      label: `${level} - Từ liên quan Kanji`,
      href: `/vocab/match?relatedLevel=${level}`,
      group: "Từ liên quan Kanji",
      count: relatedItemsByLevel.get(level)?.length ?? 0,
    })),
    ...(relatedKanji && selectedRelatedKanjiItems.length > 0
      ? [
          {
            value: `kanji-related:${relatedKanji}`,
            label: `${relatedKanji} - Từ liên quan riêng`,
            href: `/vocab/match?relatedKanji=${encodeURIComponent(relatedKanji)}`,
            group: "Từ liên quan Kanji",
            count: selectedRelatedKanjiItems.length,
          },
        ]
      : []),
    ...JLPT_LEVELS.filter((level) => (levelCounts.get(level) ?? 0) > 0).map((level) => ({
      value: `level:${level}`,
      label: `${level} - Trộn tất cả chủ đề`,
      href: `/vocab/match?level=${level}`,
      group: "Theo cấp độ",
      count: levelCounts.get(level) ?? 0,
    })),
    ...library.lessons
      .filter((lesson) => lesson.items.length > 0)
      .map((lesson) => ({
        value: `group:${lesson.id}`,
        label: `${lesson.jlptLevel} - ${formatVocabLabel(lesson.title)}`,
        href: `/vocab/match?group=${lesson.id}`,
        group: "Chủ đề admin",
        count: lesson.items.length,
      })),
    ...store.lessons
      .filter((lesson) => lesson.items.length > 0)
      .map((lesson) => ({
        value: `lesson:${lesson.id}`,
        label: formatVocabLabel(lesson.title),
        href: `/vocab/match?lesson=${lesson.id}`,
        group: "Bài cá nhân",
        count: lesson.items.length,
      })),
    ...readingStore.items
      .filter((text) => text.vocabulary.length > 0)
      .map((text) => ({
        value: `reading:${text.id}`,
        label: `${text.jlptLevel} - ${formatVocabLabel(text.title)}`,
        href: `/vocab/match?reading=${encodeURIComponent(text.id)}`,
        group: "Từ vựng bài đọc",
        count: text.vocabulary.length,
      })),
  ];

  const selectedPersonalLesson = lessonId
    ? store.lessons.find((lesson) => lesson.id === lessonId && lesson.items.length > 0)
    : null;
  const selectedAdminGroup = groupId
    ? library.lessons.find((lesson) => lesson.id === groupId && lesson.items.length > 0)
    : null;
  const selectedReadingText = readingTextId
    ? readingStore.items.find((text) => text.id === readingTextId && text.vocabulary.length > 0)
    : null;
  const selectedPersonalKanjiDeckItems = kanjiDeckParam
    ? personalKanjiDeckItems.get(kanjiDeckParam) ?? []
    : [];
  const selectedPersonalRelatedDeckItems = relatedDeckParam
    ? personalRelatedDeckItems.get(relatedDeckParam) ?? []
    : [];
  const selectedLevelLessons = library.lessons.filter(
    (lesson) =>
      normalizeJlptLevel(lesson.jlptLevel) === requestedLevel && lesson.items.length > 0
  );

  let selectedSource = `level:${requestedLevel}`;
  let title = `${requestedLevel} - Trộn tất cả chủ đề`;
  let subtitle = "Nối từ tiếng Nhật với nghĩa tiếng Việt đúng trước khi hết nhịp.";
  let returnHref = `/vocab?mode=library&level=${requestedLevel}`;
  let items = selectedLevelLessons.flatMap((lesson) =>
    toGameItems(`group:${lesson.id}`, lesson.items)
  );

  if (kanjiDeckParam && selectedPersonalKanjiDeckItems.length > 0) {
    selectedSource = `kanji-deck:${kanjiDeckParam}`;
    title = `${kanjiDeckParam} - Kanji cá nhân`;
    subtitle = "Ghép chữ Kanji viết tay với nghĩa và âm đọc tương ứng trong mục cá nhân này.";
    returnHref = `/kanji?scope=personal&personalDeck=${encodeURIComponent(kanjiDeckParam)}`;
    items = selectedPersonalKanjiDeckItems;
  } else if (relatedDeckParam && selectedPersonalRelatedDeckItems.length > 0) {
    selectedSource = `kanji-related-deck:${relatedDeckParam}`;
    title = `${relatedDeckParam} - Từ liên quan Kanji`;
    subtitle = "Ôn các từ ghép và từ liên quan đến những Kanji trong mục cá nhân này.";
    returnHref = `/kanji?scope=personal&personalDeck=${encodeURIComponent(relatedDeckParam)}`;
    items = selectedPersonalRelatedDeckItems;
  } else if (kanjiLevelParam) {
    selectedSource = `kanji-level:${requestedKanjiLevel}`;
    title = `${requestedKanjiLevel} - Kanji với nghĩa`;
    subtitle = "Ghép đúng từng chữ Kanji với nghĩa tiếng Việt tương ứng.";
    returnHref = `/kanji?level=${requestedKanjiLevel}`;
    items = kanjiItemsByLevel.get(requestedKanjiLevel) ?? [];
  } else if (relatedLevelParam) {
    selectedSource = `kanji-related-level:${requestedKanjiLevel}`;
    title = `${requestedKanjiLevel} - Từ liên quan Kanji`;
    subtitle = "Ôn các từ ghép và từ liên quan đến những Kanji trong cấp độ này.";
    returnHref = `/kanji?level=${requestedKanjiLevel}`;
    items = relatedItemsByLevel.get(requestedKanjiLevel) ?? [];
  } else if (relatedKanji) {
    selectedSource = `kanji-related:${relatedKanji}`;
    title = `${relatedKanji} - Từ liên quan`;
    subtitle = `Ghép nghĩa các từ chứa hoặc được liên kết với Kanji ${relatedKanji}.`;
    returnHref = `/kanji?selected=${encodeURIComponent(relatedKanji)}`;
    items = selectedRelatedKanjiItems;
  } else if (selectedAdminGroup) {
    selectedSource = `group:${selectedAdminGroup.id}`;
    title = `${selectedAdminGroup.jlptLevel} - ${formatVocabLabel(selectedAdminGroup.title)}`;
    subtitle = "Ôn nhanh toàn bộ từ trong chủ đề bằng cách ghép đúng từng cặp.";
    returnHref = `/vocab/group/${selectedAdminGroup.id}?level=${selectedAdminGroup.jlptLevel}`;
    items = toGameItems(`group:${selectedAdminGroup.id}`, selectedAdminGroup.items);
  } else if (selectedReadingText) {
    selectedSource = `reading:${selectedReadingText.id}`;
    title = `${selectedReadingText.jlptLevel} - ${formatVocabLabel(selectedReadingText.title)}`;
    subtitle = "Ôn lại các từ xuất hiện trong bài đọc bằng cách nối với nghĩa đúng.";
    returnHref = `/reading-vocab?text=${encodeURIComponent(selectedReadingText.id)}`;
    items = toReadingGameItems(`reading:${selectedReadingText.id}`, selectedReadingText.vocabulary);
  } else if (selectedPersonalLesson) {
    selectedSource = `lesson:${selectedPersonalLesson.id}`;
    title = formatVocabLabel(selectedPersonalLesson.title);
    subtitle = "Biến bài từ vựng cá nhân thành một ván nối cặp ngắn và dễ nhớ.";
    returnHref = `/vocab?mode=self&lesson=${selectedPersonalLesson.id}`;
    items = toGameItems(`lesson:${selectedPersonalLesson.id}`, selectedPersonalLesson.items);
  } else if (items.length === 0 && sourceOptions.length > 0) {
    const fallback = sourceOptions[0];
    const fallbackLevel = fallback.value.startsWith("level:")
      ? normalizeJlptLevel(fallback.value.slice("level:".length))
      : null;
    const fallbackGroup = fallback.value.startsWith("group:")
      ? library.lessons.find((lesson) => `group:${lesson.id}` === fallback.value)
      : null;
    const fallbackLesson = fallback.value.startsWith("lesson:")
      ? store.lessons.find((lesson) => `lesson:${lesson.id}` === fallback.value)
      : null;
    const fallbackReadingText = fallback.value.startsWith("reading:")
      ? readingStore.items.find((text) => `reading:${text.id}` === fallback.value)
      : null;
    const fallbackKanjiLevel = fallback.value.startsWith("kanji-level:")
      ? normalizeJlptLevel(fallback.value.slice("kanji-level:".length))
      : null;
    const fallbackKanjiDeck = fallback.value.startsWith("kanji-deck:")
      ? fallback.value.slice("kanji-deck:".length)
      : null;
    const fallbackRelatedLevel = fallback.value.startsWith("kanji-related-level:")
      ? normalizeJlptLevel(fallback.value.slice("kanji-related-level:".length))
      : null;
    const fallbackRelatedDeck = fallback.value.startsWith("kanji-related-deck:")
      ? fallback.value.slice("kanji-related-deck:".length)
      : null;

    selectedSource = fallback.value;
    title = fallback.label;
    if (fallbackKanjiDeck) {
      items = personalKanjiDeckItems.get(fallbackKanjiDeck) ?? [];
      returnHref = `/kanji?scope=personal&personalDeck=${encodeURIComponent(fallbackKanjiDeck)}`;
    } else if (fallbackRelatedDeck) {
      items = personalRelatedDeckItems.get(fallbackRelatedDeck) ?? [];
      returnHref = `/kanji?scope=personal&personalDeck=${encodeURIComponent(fallbackRelatedDeck)}`;
    } else if (fallbackKanjiLevel) {
      items = kanjiItemsByLevel.get(fallbackKanjiLevel) ?? [];
      returnHref = `/kanji?level=${fallbackKanjiLevel}`;
    } else if (fallbackRelatedLevel) {
      items = relatedItemsByLevel.get(fallbackRelatedLevel) ?? [];
      returnHref = `/kanji?level=${fallbackRelatedLevel}`;
    } else if (fallbackLevel) {
      items = library.lessons
        .filter((lesson) => normalizeJlptLevel(lesson.jlptLevel) === fallbackLevel)
        .flatMap((lesson) => toGameItems(`group:${lesson.id}`, lesson.items));
      returnHref = `/vocab?mode=library&level=${fallbackLevel}`;
    } else if (fallbackGroup) {
      items = toGameItems(`group:${fallbackGroup.id}`, fallbackGroup.items);
      returnHref = `/vocab/group/${fallbackGroup.id}?level=${fallbackGroup.jlptLevel}`;
    } else if (fallbackLesson) {
      items = toGameItems(`lesson:${fallbackLesson.id}`, fallbackLesson.items);
      returnHref = `/vocab?mode=self&lesson=${fallbackLesson.id}`;
    } else if (fallbackReadingText) {
      items = toReadingGameItems(`reading:${fallbackReadingText.id}`, fallbackReadingText.vocabulary);
      returnHref = `/reading-vocab?text=${encodeURIComponent(fallbackReadingText.id)}`;
    }
  }

  if (items.length < 2) {
    return (
      <section className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-black text-slate-900">Chưa đủ dữ liệu để mở game</h1>
        <p className="mt-2 text-slate-600">Cần ít nhất 2 mục có nghĩa để tạo một bàn nối cặp.</p>
        <Link href={returnHref} className="btn-primary mt-5">
          Quay lại nguồn học
        </Link>
      </section>
    );
  }

  return (
    <VocabMatchGame
      key={selectedSource}
      title={title}
      subtitle={subtitle}
      items={items}
      sourceOptions={sourceOptions}
      selectedSource={selectedSource}
      returnHref={returnHref}
    />
  );
}
