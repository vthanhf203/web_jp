import Link from "next/link";
import {
  BookOpenText,
  ChevronLeft,
  Clock3,
  FileText,
  Layers3,
  Trash2,
} from "lucide-react";

import { deleteReadingTextAction } from "@/app/actions/reading-practice";
import { ReadingTextImportForm } from "@/app/components/reading-text-import-form";
import { SpeakJpButton } from "@/app/components/speak-jp-button";
import { requireUser } from "@/lib/auth";
import { loadReadingPracticeStore } from "@/lib/reading-practice-store";

type SearchParams = Promise<{
  text?: string | string[];
  level?: string | string[];
}>;

function pickSingle(value?: string | string[]): string {
  if (!value) {
    return "";
  }
  return Array.isArray(value) ? value[0] ?? "" : value;
}

function levelClass(level: string, active: boolean): string {
  if (active) {
    return "border-[#123c69] bg-[#123c69] text-white";
  }
  if (level === "N5") {
    return "border-[#a7e8cf] bg-[#effdf7] text-[#11795e]";
  }
  if (level === "N4") {
    return "border-[#bdd7ff] bg-[#f1f6ff] text-[#2557a7]";
  }
  if (level === "N3") {
    return "border-[#ffe0a8] bg-[#fff8e8] text-[#a35b00]";
  }
  return "border-[#e0e7ef] bg-white text-[#526070]";
}

export default async function SelfStudyReadingPage(props: { searchParams: SearchParams }) {
  const user = await requireUser();
  const params = await props.searchParams;
  const requestedTextId = pickSingle(params.text).trim();
  const requestedLevel = pickSingle(params.level).trim().toUpperCase();

  const store = await loadReadingPracticeStore(user.id);
  const allItems = [...store.items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const filteredItems =
    requestedLevel && requestedLevel !== "ALL"
      ? allItems.filter((item) => item.jlptLevel === requestedLevel)
      : allItems;
  const selectedText =
    filteredItems.find((item) => item.id === requestedTextId) ??
    filteredItems[0] ??
    allItems[0] ??
    null;

  const levelCounts = ["N5", "N4", "N3", "N2", "N1"].map((level) => ({
    level,
    count: allItems.filter((item) => item.jlptLevel === level).length,
  }));
  const totalWords = allItems.reduce((sum, item) => sum + item.vocabulary.length, 0);
  const readingText = selectedText?.paragraphs.join("\n") ?? "";

  return (
    <section className="mx-auto max-w-[1360px] space-y-6 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            href="/self-study"
            className="grid h-11 w-11 place-items-center rounded-2xl border border-[#d8e2ee] bg-white text-[#123c69] shadow-[0_10px_24px_rgba(18,60,105,0.08)] transition hover:bg-[#f4fbfb]"
            aria-label="Quay lại tự học"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#22a6a1]">
              Tự học đọc hiểu
            </p>
            <h1 className="mt-1 text-3xl font-black text-[#111827]">Luyện đọc văn bản</h1>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/self-study/reading"
            className={`rounded-full border px-4 py-2 text-sm font-black transition ${levelClass(
              "ALL",
              !requestedLevel || requestedLevel === "ALL"
            )}`}
          >
            Tất cả ({allItems.length})
          </Link>
          {levelCounts.map((entry) => (
            <Link
              key={entry.level}
              href={`/self-study/reading?level=${entry.level}`}
              className={`rounded-full border px-4 py-2 text-sm font-black transition ${levelClass(
                entry.level,
                requestedLevel === entry.level
              )}`}
            >
              {entry.level} ({entry.count})
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <article className="rounded-2xl border border-[#d8e2ee] bg-white px-5 py-4 shadow-[0_14px_28px_rgba(18,60,105,0.06)]">
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-[#64748b]">
            <Layers3 className="h-4 w-4 text-[#22a6a1]" />
            Bài đọc
          </p>
          <p className="mt-2 text-3xl font-black text-[#111827]">{allItems.length}</p>
        </article>
        <article className="rounded-2xl border border-[#d8e2ee] bg-white px-5 py-4 shadow-[0_14px_28px_rgba(18,60,105,0.06)]">
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-[#64748b]">
            <BookOpenText className="h-4 w-4 text-[#e68a2e]" />
            Từ mới
          </p>
          <p className="mt-2 text-3xl font-black text-[#111827]">{totalWords}</p>
        </article>
        <article className="rounded-2xl border border-[#d8e2ee] bg-white px-5 py-4 shadow-[0_14px_28px_rgba(18,60,105,0.06)]">
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-[#64748b]">
            <Clock3 className="h-4 w-4 text-[#4f7cff]" />
            Bài đang mở
          </p>
          <p className="mt-2 text-3xl font-black text-[#111827]">
            {selectedText ? `${selectedText.estimatedMinutes} phút` : "0 phút"}
          </p>
        </article>
      </div>

      <div className="space-y-5">
        <article className="overflow-hidden rounded-[28px] border border-[#d8e2ee] bg-white shadow-[0_18px_42px_rgba(18,60,105,0.08)]">
          {selectedText ? (
            <>
              <div className="border-b border-[#e6edf5] bg-[#f8fcff] px-6 py-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-[#e8fbf8] px-3 py-1 text-xs font-black text-[#108373]">
                        {selectedText.jlptLevel}
                      </span>
                      <span className="rounded-full bg-[#fff3df] px-3 py-1 text-xs font-black text-[#b45b10]">
                        {selectedText.topic}
                      </span>
                      <span className="rounded-full bg-[#eef3ff] px-3 py-1 text-xs font-black text-[#3554a8]">
                        {selectedText.difficulty}
                      </span>
                    </div>
                    <h2 className="mt-3 font-[var(--font-jp-serif)] text-4xl font-black text-[#111827]">
                      {selectedText.title}
                    </h2>
                  </div>
                  <div className="flex items-start gap-2">
                    <SpeakJpButton
                      text={readingText}
                      title="Phát bài đọc"
                      showStopButton
                      showProgressBar
                      profile="jlpt-listening"
                      className="w-[240px] sm:w-[300px]"
                    />
                    <form action={deleteReadingTextAction}>
                      <input type="hidden" name="textId" value={selectedText.id} />
                      <button
                        type="submit"
                        className="grid h-11 w-11 place-items-center rounded-full border border-rose-200 bg-rose-50 text-rose-600 transition hover:bg-rose-100"
                        aria-label="Xóa bài đọc"
                        title="Xóa bài đọc"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </form>
                  </div>
                </div>
              </div>

              <div className="space-y-5 px-6 py-6">
                <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.72fr)_minmax(320px,0.96fr)]">
                  <div className="rounded-2xl border border-[#e3ebf5] bg-[#fbfdff] px-5 py-5">
                    <div className="max-h-[64vh] space-y-5 overflow-y-auto pr-2 font-[var(--font-jp)] text-[1.35rem] font-semibold leading-[2.25] text-[#111827]">
                      {selectedText.paragraphs.map((paragraph, index) => (
                        <p key={`${selectedText.id}-p-${index}`}>{paragraph}</p>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[#d8e2ee] bg-white p-4">
                    <h3 className="text-xl font-black text-[#111827]">Từ mới trong bài</h3>
                    {selectedText.vocabulary.length > 0 ? (
                      <div className="mt-4 max-h-[64vh] space-y-2 overflow-y-auto pr-1">
                        {selectedText.vocabulary.map((word, index) => (
                          <div
                            key={`${word.word}-${index}`}
                            className="flex items-center justify-between gap-3 rounded-2xl border border-[#edf1f6] bg-[#fbfdff] px-3 py-2"
                          >
                            <div className="min-w-0">
                              <p className="font-[var(--font-jp)] text-lg font-black text-[#111827]">{word.word}</p>
                              <p className="text-xs font-bold text-[#667085]">
                                {word.reading || "-"} · {word.meaning}
                              </p>
                            </div>
                            <SpeakJpButton text={word.word} title="Phát âm từ" />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-4 text-sm text-[#667085]">Bài này chưa có danh sách từ mới.</p>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-[#d7efe7] bg-[#f3fff9] px-5 py-4">
                  <h3 className="text-sm font-black uppercase tracking-[0.14em] text-[#256055]">
                    Bản dịch tiếng Việt
                  </h3>
                  {selectedText.translation ? (
                    <p className="mt-2 whitespace-pre-line text-base leading-8 text-[#245447]">
                      {selectedText.translation}
                    </p>
                  ) : (
                    <p className="mt-2 text-sm leading-7 text-[#537f73]">
                      Chưa có bản dịch cho bài này. Bạn có thể import lại JSON có trường dịch để hiển thị ở đây.
                    </p>
                  )}
                </div>

                {selectedText.questions.length > 0 ? (
                  <div className="rounded-2xl border border-[#e3ebf5] bg-white p-4">
                    <h3 className="text-sm font-black uppercase tracking-[0.14em] text-[#526070]">
                      Câu hỏi nhanh
                    </h3>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {selectedText.questions.map((question, index) => (
                        <div
                          key={`${selectedText.id}-q-${index}`}
                          className="rounded-2xl border border-[#edf1f6] bg-[#f8fafc] px-4 py-3"
                        >
                          <p className="text-sm font-black text-[#172033]">{question.prompt}</p>
                          {question.answer ? (
                            <p className="mt-2 text-sm leading-6 text-[#667085]">{question.answer}</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <div className="p-8">
              <div className="grid min-h-[320px] place-items-center rounded-3xl border border-dashed border-[#cbd8e7] bg-[#f8fcff] text-center">
                <div className="max-w-md px-6">
                  <FileText className="mx-auto h-12 w-12 text-[#22a6a1]" />
                  <h2 className="mt-4 text-2xl font-black text-[#111827]">Chưa có bài đọc</h2>
                  <p className="mt-2 text-sm leading-6 text-[#667085]">
                    Hãy import JSON ở cuối trang để tạo kho bài đọc riêng của bạn.
                  </p>
                </div>
              </div>
            </div>
          )}
        </article>

        {allItems.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredItems.map((item) => {
              const active = selectedText?.id === item.id;
              const href = `/self-study/reading?${new URLSearchParams({
                ...(requestedLevel ? { level: requestedLevel } : {}),
                text: item.id,
              }).toString()}`;
              return (
                <Link
                  key={item.id}
                  href={href}
                  className={`rounded-2xl border bg-white p-4 shadow-[0_10px_24px_rgba(18,60,105,0.05)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_28px_rgba(18,60,105,0.08)] ${
                    active ? "border-[#22a6a1] ring-4 ring-[#d9f5f1]" : "border-[#d8e2ee]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-full bg-[#eef3ff] px-2.5 py-1 text-xs font-black text-[#3554a8]">
                      {item.jlptLevel}
                    </span>
                    <span className="text-xs font-bold text-[#667085]">{item.estimatedMinutes} phút</span>
                  </div>
                  <h3 className="mt-3 truncate font-[var(--font-jp-serif)] text-xl font-black text-[#111827]">
                    {item.title}
                  </h3>
                  <p className="mt-1 text-sm font-semibold text-[#667085]">{item.topic}</p>
                </Link>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="rounded-[24px] border border-[#d8e2ee] bg-white p-5 shadow-[0_18px_42px_rgba(18,60,105,0.08)]">
        <h2 className="text-xl font-black text-[#111827]">Import JSON văn bản</h2>
        <p className="mt-1 text-sm text-[#667085]">
          Dán JSON hoặc tải file để thêm/cập nhật bài đọc. Hỗ trợ cả dữ liệu có trường dịch tiếng Việt.
        </p>
        <div className="mt-4">
          <ReadingTextImportForm />
        </div>
      </div>
    </section>
  );
}
