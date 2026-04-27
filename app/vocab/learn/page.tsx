import Link from "next/link";

import { VocabStudyClient, type StudyMode } from "@/app/components/vocab-study-client";
import { loadAdminVocabLibrary } from "@/lib/admin-vocab-library";
import { requireUser } from "@/lib/auth";
import { formatVocabLabel } from "@/lib/vietnamese-labels";
import { loadUserVocabStore } from "@/lib/vocab-store";

type SearchParams = Promise<{
  lesson?: string | string[];
  group?: string | string[];
  mode?: string | string[];
}>;

function pickSingle(value?: string | string[]): string | null {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function isMode(value: string | null): value is StudyMode {
  return value === "flashcard" || value === "quiz" || value === "recall";
}

export default async function VocabLearnPage(props: { searchParams: SearchParams }) {
  const user = await requireUser();
  const params = await props.searchParams;
  const lessonId = pickSingle(params.lesson);
  const groupId = pickSingle(params.group);
  const modeParam = pickSingle(params.mode);
  const mode: StudyMode = isMode(modeParam) ? modeParam : "flashcard";

  const store = await loadUserVocabStore(user.id);
  const adminLibrary = await loadAdminVocabLibrary();

  if (!lessonId && !groupId) {
    return (
      <section className="panel p-8">
        <h1 className="text-2xl font-bold text-slate-800">Chưa chọn bài học</h1>
        <p className="mt-2 text-slate-600">Hãy quay lại trang từ vựng và chọn một bài.</p>
        <Link href="/vocab" className="btn-primary mt-5">
          Quay lại /vocab
        </Link>
      </section>
    );
  }

  if (groupId) {
    const group = adminLibrary.lessons.find((entry) => entry.id === groupId);
    if (!group) {
      return (
        <section className="panel p-8">
          <h1 className="text-2xl font-bold text-slate-800">Không tìm thấy chủ đề admin</h1>
          <p className="mt-2 text-slate-600">Chủ đề này có thể đã bị xóa hoặc thay đổi.</p>
          <Link href="/vocab" className="btn-primary mt-5">
            Quay lại /vocab
          </Link>
        </section>
      );
    }

    if (group.items.length === 0) {
      return (
        <section className="panel p-8">
          <h1 className="text-2xl font-bold text-slate-800">Chủ đề admin chưa có từ vựng</h1>
          <p className="mt-2 text-slate-600">Admin cần cập nhật dữ liệu trước khi học.</p>
          <Link href="/vocab" className="btn-primary mt-5">
            Quay lại /vocab
          </Link>
        </section>
      );
    }

    return (
      <VocabStudyClient
        lessonTitle={`${group.jlptLevel} | ${formatVocabLabel(group.title)}`}
        mode={mode}
        items={group.items.map((item) => ({
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

  const lesson = store.lessons.find((entry) => entry.id === lessonId);
  if (!lesson) {
    return (
      <section className="panel p-8">
        <h1 className="text-2xl font-bold text-slate-800">Không tìm thấy bài học</h1>
        <p className="mt-2 text-slate-600">Bài này có thể đã bị xóa hoặc không thuộc tài khoản này.</p>
        <Link href="/vocab" className="btn-primary mt-5">
          Quay lại /vocab
        </Link>
      </section>
    );
  }

  if (lesson.items.length === 0) {
    return (
      <section className="panel p-8">
        <h1 className="text-2xl font-bold text-slate-800">Bài học chưa có từ vựng</h1>
        <p className="mt-2 text-slate-600">Hãy nhập dữ liệu vào bài trước khi học 3 chế độ.</p>
        <Link href={`/vocab?lesson=${lesson.id}`} className="btn-primary mt-5">
          Về bài học
        </Link>
      </section>
    );
  }

  return (
    <VocabStudyClient
      lessonTitle={formatVocabLabel(lesson.title)}
      mode={mode}
      items={lesson.items.map((item) => ({
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
