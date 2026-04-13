import Link from "next/link";

import { VocabStudyClient, type StudyMode } from "@/app/components/vocab-study-client";
import { loadAdminVocabLibrary } from "@/lib/admin-vocab-library";
import { requireUser } from "@/lib/auth";
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
        <h1 className="text-2xl font-bold text-slate-800">Chua chon bai hoc</h1>
        <p className="mt-2 text-slate-600">Hay quay lai trang tu vung va chon mot bai.</p>
        <Link href="/vocab" className="btn-primary mt-5">
          Quay lai /vocab
        </Link>
      </section>
    );
  }

  if (groupId) {
    const group = adminLibrary.lessons.find((entry) => entry.id === groupId);
    if (!group) {
      return (
        <section className="panel p-8">
          <h1 className="text-2xl font-bold text-slate-800">Khong tim thay chu de admin</h1>
          <p className="mt-2 text-slate-600">Chu de nay co the da bi xoa hoac thay doi.</p>
          <Link href="/vocab" className="btn-primary mt-5">
            Quay lai /vocab
          </Link>
        </section>
      );
    }

    if (group.items.length === 0) {
      return (
        <section className="panel p-8">
          <h1 className="text-2xl font-bold text-slate-800">Chu de admin chua co tu vung</h1>
          <p className="mt-2 text-slate-600">Admin can cap nhat du lieu truoc khi hoc.</p>
          <Link href="/vocab" className="btn-primary mt-5">
            Quay lai /vocab
          </Link>
        </section>
      );
    }

    return (
      <VocabStudyClient
        lessonTitle={`${group.jlptLevel} | ${group.title}`}
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
        <h1 className="text-2xl font-bold text-slate-800">Khong tim thay bai hoc</h1>
        <p className="mt-2 text-slate-600">Bai nay co the da bi xoa hoac khong thuoc tai khoan nay.</p>
        <Link href="/vocab" className="btn-primary mt-5">
          Quay lai /vocab
        </Link>
      </section>
    );
  }

  if (lesson.items.length === 0) {
    return (
      <section className="panel p-8">
        <h1 className="text-2xl font-bold text-slate-800">Bai hoc chua co tu vung</h1>
        <p className="mt-2 text-slate-600">Hay nhap du lieu vao bai truoc khi hoc 3 che do.</p>
        <Link href={`/vocab?lesson=${lesson.id}`} className="btn-primary mt-5">
          Ve bai hoc
        </Link>
      </section>
    );
  }

  return (
    <VocabStudyClient
      lessonTitle={lesson.title}
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
