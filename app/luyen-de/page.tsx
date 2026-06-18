import type { Metadata } from "next";

import { ExamPracticeClient } from "@/app/components/exam-practice-client";
import { requireUser } from "@/lib/auth";
import { loadExamPracticeStore } from "@/lib/exam-practice-store";

export const metadata: Metadata = {
  title: "Luyện Đề | JP Lab",
  description: "Giao diện luyện đề gồm ngữ pháp, đọc hiểu, Kanji và sắp xếp câu.",
};

export default async function ExamPracticePage() {
  const user = await requireUser();
  const store = await loadExamPracticeStore(user.id);

  return <ExamPracticeClient tests={store.tests} />;
}
