import type { Metadata } from "next";

import { VocabularyExamClient } from "@/app/components/vocabulary-exam-client";
import vocabularyExamData from "@/data/vocabulary-exams/n4-lessons-001-005.json";
import { requireUser } from "@/lib/auth";
import { loadVocabularyExamStore } from "@/lib/vocabulary-exam-store";
import type { VocabularyExamTest } from "@/lib/vocabulary-exam-types";

export const metadata: Metadata = {
  title: "Luyện đề từ vựng | JP Lab",
  description: "Luyện trắc nghiệm từ vựng tiếng Nhật theo ngữ cảnh với furigana và giải thích chi tiết.",
};

export default async function VocabularyExamPage() {
  const user = await requireUser();
  const store = await loadVocabularyExamStore(user.id);
  const builtInTests = vocabularyExamData as unknown as VocabularyExamTest[];
  const importedIds = new Set(store.tests.map((test) => test.id));
  const tests = [...store.tests, ...builtInTests.filter((test) => !importedIds.has(test.id))];

  return <VocabularyExamClient tests={tests} importedTestIds={Array.from(importedIds)} />;
}
