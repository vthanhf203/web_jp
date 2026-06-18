import Link from "next/link";
import type { ReactNode } from "react";
import { BookOpenText, ChevronDown, ChevronLeft, Flame, Gamepad2, Library, Trash2, Upload } from "lucide-react";

import { startReadingVocabStudyFromHubAction } from "@/app/actions/reading-vocab-hub";
import { deleteReadingVocabTextAction } from "@/app/actions/reading-vocab-import";
import { ReadingVocabImportForm } from "@/app/components/reading-vocab-import-form";
import { requireUser } from "@/lib/auth";
import type { ReadingTextItem } from "@/lib/reading-practice-store";
import { loadReadingVocabStore } from "@/lib/reading-vocab-store";

type SearchParams = Promise<{
  text?: string | string[];
}>;

type HighlightTone = "new" | "review" | "other";

type HighlightRule = {
  token: string;
  tone: HighlightTone;
};

type PlainTextMap = {
  plain: string;
  map: Array<{
    start: number;
    end: number;
  }>;
};

type HighlightRange = {
  start: number;
  end: number;
  tone: HighlightTone;
};

type ReadingSentenceGroup = {
  paragraphIndex: number;
  lines: Array<{
    jp: string;
    vi: string;
  }>;
  paragraphFallbackTranslation: string;
};

type ReadingVocabWord = ReadingTextItem["vocabulary"][number];

const JP_SENTENCE_BOUNDARY_PATTERN = /[^\u3002\uFF01\uFF1F!?]+[\u3002\uFF01\uFF1F!?]?/gu;
const VI_SENTENCE_BOUNDARY_PATTERN = /[^.!?\u2026]+[.!?\u2026]?/g;

function pickSingle(value?: string | string[]): string {
  if (!value) {
    return "";
  }
  return Array.isArray(value) ? value[0] ?? "" : value;
}

function toTone(role?: string): HighlightTone {
  const normalized = (role ?? "").trim().toLowerCase();
  if (normalized.includes("new") || normalized.includes("target")) {
    return "new";
  }
  if (normalized.includes("review") || normalized.includes("core")) {
    return "review";
  }
  return "other";
}

function tonePriority(tone: HighlightTone): number {
  if (tone === "new") {
    return 3;
  }
  if (tone === "review") {
    return 2;
  }
  return 1;
}

function addRule(
  rules: Map<string, HighlightTone>,
  token: string,
  tone: HighlightTone
) {
  const clean = token.trim();
  if (!clean || clean.length < 2) {
    return;
  }
  const existing = rules.get(clean);
  if (!existing || tonePriority(tone) > tonePriority(existing)) {
    rules.set(clean, tone);
  }
}

function stripFuriganaText(value: string): string {
  return toPlainTextMap(value).plain;
}

function toPlainTextMap(value: string): PlainTextMap {
  let plain = "";
  const map: PlainTextMap["map"] = [];
  let cursor = 0;

  while (cursor < value.length) {
    const char = value[cursor];
    const closeParen = char === "(" ? ")" : char === "\uff08" ? "\uff09" : "";

    if (closeParen) {
      const end = value.indexOf(closeParen, cursor + 1);
      if (end !== -1) {
        cursor = end + 1;
        continue;
      }
    }

    plain += char;
    map.push({ start: cursor, end: cursor + 1 });
    cursor += 1;
  }

  return { plain, map };
}

function addMasuVariants(rules: Map<string, HighlightTone>, token: string, tone: HighlightTone) {
  if (!token.endsWith("\u307e\u3059")) {
    return;
  }

  const masuStem = token.slice(0, -"\u307e\u3059".length);
  addRule(rules, masuStem, tone);

  if (token.endsWith("\u3057\u307e\u3059")) {
    const suruBase = token.slice(0, -"\u3057\u307e\u3059".length);
    addRule(rules, `${suruBase}\u3057`, tone);
    addRule(rules, `${suruBase}\u3059`, tone);
  }

  const godanRules: Array<[string, string]> = [
    ["\u3044\u307e\u3059", "\u3063"],
    ["\u3061\u307e\u3059", "\u3063"],
    ["\u308a\u307e\u3059", "\u3063"],
    ["\u307f\u307e\u3059", "\u3093"],
    ["\u3073\u307e\u3059", "\u3093"],
    ["\u306b\u307e\u3059", "\u3093"],
    ["\u304d\u307e\u3059", "\u3044"],
    ["\u304e\u307e\u3059", "\u3044"],
  ];

  for (const [ending, replacement] of godanRules) {
    if (token.endsWith(ending)) {
      addRule(rules, `${token.slice(0, -ending.length)}${replacement}`, tone);
    }
  }
}

function addHighlightToken(rules: Map<string, HighlightTone>, token: string, tone: HighlightTone) {
  const clean = stripFuriganaText(token).replace(/\s+/g, "").trim();
  addRule(rules, clean, tone);
  addMasuVariants(rules, clean, tone);
}

function buildHighlightRules(vocabulary: ReadingTextItem["vocabulary"]): HighlightRule[] {
  const map = new Map<string, HighlightTone>();

  for (const item of vocabulary) {
    const tone = toTone(item.role);
    addHighlightToken(map, item.word, tone);
    addHighlightToken(map, item.reading, tone);
  }

  return Array.from(map.entries())
    .map(([token, tone]) => ({ token, tone }))
    .sort((a, b) => b.token.length - a.token.length);
}

function toneClass(tone: HighlightTone): string {
  if (tone === "new") {
    return "underline decoration-[2.5px] underline-offset-[0.22em] decoration-[#4d86e7]";
  }
  if (tone === "review") {
    return "underline decoration-[2.5px] underline-offset-[0.22em] decoration-[#e5a34b]";
  }
  return "underline decoration-[2.5px] underline-offset-[0.22em] decoration-[#32a79a]";
}

function findHighlightRanges(paragraph: string, rules: HighlightRule[]): HighlightRange[] {
  const { plain, map } = toPlainTextMap(paragraph);
  const ranges: HighlightRange[] = [];
  let plainCursor = 0;

  while (plainCursor < plain.length) {
    let matched: HighlightRule | null = null;
    for (const rule of rules) {
      if (plain.startsWith(rule.token, plainCursor)) {
        matched = rule;
        break;
      }
    }

    if (!matched) {
      plainCursor += 1;
      continue;
    }

    const start = map[plainCursor]?.start;
    const end = map[plainCursor + matched.token.length - 1]?.end;
    if (typeof start === "number" && typeof end === "number" && end > start) {
      ranges.push({ start, end, tone: matched.tone });
    }
    plainCursor += matched.token.length;
  }

  return ranges;
}

function highlightParagraph(paragraph: string, rules: HighlightRule[]) {
  if (!paragraph.trim() || rules.length === 0) {
    return paragraph;
  }

  const nodes: ReactNode[] = [];
  const ranges = findHighlightRanges(paragraph, rules);
  let cursor = 0;

  for (const range of ranges) {
    if (range.start < cursor) {
      continue;
    }

    if (range.start > cursor) {
      nodes.push(paragraph.slice(cursor, range.start));
    }
    nodes.push(
      <span key={`${range.start}-${range.end}`} className={toneClass(range.tone)}>
        {paragraph.slice(range.start, range.end)}
      </span>
    );
    cursor = range.end;
  }

  if (cursor < paragraph.length) {
    nodes.push(paragraph.slice(cursor));
  }

  return nodes.length > 0 ? nodes : paragraph;
}

function readingVocabHref(textId: string): string {
  const query = new URLSearchParams();
  query.set("text", textId);
  return `/reading-vocab?${query.toString()}`;
}

function splitTranslationText(value: string): string[] {
  return value
    .split(/\n{2,}|\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function splitJapaneseSentences(value: string): string[] {
  const normalized = value.replace(/\r/g, "").trim();
  if (!normalized) {
    return [];
  }

  return (normalized.match(JP_SENTENCE_BOUNDARY_PATTERN) ?? [normalized]).map((entry) => entry.trim()).filter(Boolean);
}

function splitVietnameseSentences(value: string): string[] {
  const normalized = value.replace(/\r/g, "\n").trim();
  if (!normalized) {
    return [];
  }

  const lines = normalized
    .split(/\n+/)
    .map((entry) => entry.trim())
    .filter(Boolean);

  const output: string[] = [];
  for (const line of lines) {
    const sentenceParts = line.match(VI_SENTENCE_BOUNDARY_PATTERN) ?? [line];
    for (const sentence of sentenceParts) {
      const clean = sentence.trim();
      if (clean) {
        output.push(clean);
      }
    }
  }
  return output;
}

function buildSentenceGroups(paragraphs: string[], translation: string): ReadingSentenceGroup[] {
  const paragraphGroups = paragraphs.map((paragraph, paragraphIndex) => ({
    paragraphIndex,
    jpSentences: splitJapaneseSentences(paragraph),
  }));

  const totalJpSentences = paragraphGroups.reduce((sum, group) => sum + group.jpSentences.length, 0);
  const globalViSentences = splitVietnameseSentences(translation);
  if (totalJpSentences > 0 && globalViSentences.length === totalJpSentences) {
    let cursor = 0;
    return paragraphGroups.map((group) => ({
      paragraphIndex: group.paragraphIndex,
      lines: group.jpSentences.map((jp) => {
        const vi = globalViSentences[cursor] ?? "";
        cursor += 1;
        return { jp, vi };
      }),
      paragraphFallbackTranslation: "",
    }));
  }

  const translationParagraphs = splitTranslationText(translation);
  const canAlignByParagraph = paragraphGroups.every((group, paragraphIndex) => {
    if (group.jpSentences.length === 0) {
      return true;
    }
    const viParagraph = translationParagraphs[paragraphIndex] ?? "";
    if (!viParagraph.trim()) {
      return false;
    }
    return splitVietnameseSentences(viParagraph).length === group.jpSentences.length;
  });

  if (canAlignByParagraph) {
    return paragraphGroups.map((group, paragraphIndex) => {
      const viSentences = splitVietnameseSentences(translationParagraphs[paragraphIndex] ?? "");
      return {
        paragraphIndex: group.paragraphIndex,
        lines: group.jpSentences.map((jp, sentenceIndex) => ({
          jp,
          vi: viSentences[sentenceIndex] ?? "",
        })),
        paragraphFallbackTranslation: "",
      };
    });
  }

  return paragraphGroups.map((group, paragraphIndex) => ({
    paragraphIndex: group.paragraphIndex,
    lines: group.jpSentences.map((jp) => ({ jp, vi: "" })),
    paragraphFallbackTranslation: translationParagraphs[paragraphIndex] ?? "",
  }));
}

function VocabularyCard({ word, index }: { word: ReadingVocabWord; index: number }) {
  return (
    <div
      key={`${word.word}-${word.meaning}-${index}`}
      className="rounded-2xl border border-[#cfe0fb] bg-[#fbfdff] px-4 py-3"
    >
      <p className="font-[var(--font-jp)] text-xl font-black leading-tight text-[#111827]">{word.word}</p>
      <p className="mt-1 text-sm font-bold leading-6 text-[#667085]">
        {word.reading ? `${word.reading} - ` : ""}
        {word.meaning}
      </p>
    </div>
  );
}

export default async function ReadingVocabPage(props: { searchParams: SearchParams }) {
  const user = await requireUser();
  const params = await props.searchParams;
  const requestedTextId = pickSingle(params.text).trim();

  const store = await loadReadingVocabStore(user.id);
  const texts = [...store.items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const selectedText = texts.find((item) => item.id === requestedTextId) ?? texts[0] ?? null;
  const highlightRules = selectedText ? buildHighlightRules(selectedText.vocabulary) : [];
  const sentenceGroups = selectedText ? buildSentenceGroups(selectedText.paragraphs, selectedText.translation) : [];

  return (
    <section className="mx-auto max-w-[1360px] space-y-5 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            href="/self-study"
            className="grid h-11 w-11 place-items-center rounded-2xl border border-[#d8e2ee] bg-white text-[#123c69] shadow-[0_10px_24px_rgba(18,60,105,0.08)] transition hover:bg-[#f4fbfb]"
            aria-label="Quay lai"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#22a6a1]">
              Chuc nang rieng tren taskbar
            </p>
            <h1 className="mt-1 text-3xl font-black text-[#111827]">Hoc tu vung qua bai doc</h1>
          </div>
        </div>
        <div className="rounded-2xl border border-[#d8e2ee] bg-white px-4 py-3 text-sm font-bold text-[#526070]">
          {texts.length} bai doc - {texts.reduce((sum, item) => sum + item.vocabulary.length, 0)} tu vung
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-[#d8e2ee] bg-white p-4 shadow-[0_14px_28px_rgba(18,60,105,0.06)]">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[#22a6a1]">Danh sach bai doc</p>
          <div className="mt-3 max-h-[480px] space-y-2 overflow-y-auto pr-1">
            {texts.length > 0 ? (
              texts.map((item) => {
                const active = selectedText?.id === item.id;
                return (
                  <div
                    key={item.id}
                    className={
                      active
                        ? "group/item relative rounded-2xl border border-[#22a6a1] bg-[#e8fbf8] px-3 py-2 pr-11"
                        : "group/item relative rounded-2xl border border-[#d8e2ee] bg-[#fbfdff] px-3 py-2 pr-11 hover:bg-white"
                    }
                  >
                    <Link href={readingVocabHref(item.id)} className="block">
                      <p className="line-clamp-2 font-[var(--font-jp-serif)] text-base font-black text-[#111827]">
                        {item.title}
                      </p>
                      <p className="mt-1 text-xs font-bold text-[#667085]">
                        {item.jlptLevel} - {item.vocabulary.length} tu
                      </p>
                    </Link>
                    <form action={deleteReadingVocabTextAction} className="absolute right-2 top-2">
                      <input type="hidden" name="textId" value={item.id} />
                      <button
                        type="submit"
                        aria-label="Xoa bai doc"
                        title="Xoa bai doc"
                        className="grid h-8 w-8 place-items-center rounded-full border border-rose-100 bg-white/90 text-rose-500 opacity-80 shadow-[0_8px_16px_rgba(225,29,72,0.08)] transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 group-hover/item:opacity-100"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </form>
                  </div>
                );
              })
            ) : (
              <p className="rounded-xl border border-dashed border-[#cbd8e7] bg-[#f8fcff] px-3 py-3 text-sm font-semibold text-[#667085]">
                Chua co bai doc. Import JSON ben duoi de bat dau.
              </p>
            )}
          </div>
        </aside>

        <article className="rounded-2xl border border-[#d8e2ee] bg-white shadow-[0_18px_42px_rgba(18,60,105,0.08)]">
          {selectedText ? (
            <>
              <div className="border-b border-[#e6edf5] bg-[#f8fcff] px-6 py-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-[#e8fbf8] px-3 py-1 text-xs font-black text-[#108373]">
                    {selectedText.jlptLevel}
                  </span>
                  <span className="rounded-full bg-[#eef3ff] px-3 py-1 text-xs font-black text-[#3554a8]">
                    {selectedText.topic}
                  </span>
                  <span className="rounded-full bg-[#fff3df] px-3 py-1 text-xs font-black text-[#b45b10]">
                    {selectedText.estimatedMinutes} phut
                  </span>
                </div>
                <h2 className="mt-3 font-[var(--font-jp-serif)] text-4xl font-black text-[#111827]">
                  {selectedText.title}
                </h2>
              </div>

              <div className="space-y-5 px-6 py-6">
                <section className="rounded-2xl border border-[#d8e2ee] bg-[#fbfdff] px-5 py-4">
                  <div className="flex flex-wrap gap-2 text-xs font-black">
                    <span className="inline-flex items-center rounded-full border border-[#cfe0fb] bg-[#eef4ff] px-3 py-1 text-[#3554a8]">
                      <span className="mr-2 inline-block h-[2.5px] w-5 rounded-full bg-[#4d86e7]" />
                      Tu moi
                    </span>
                    <span className="inline-flex items-center rounded-full border border-[#ffe2bc] bg-[#fff7eb] px-3 py-1 text-[#9a4f05]">
                      <span className="mr-2 inline-block h-[2.5px] w-5 rounded-full bg-[#e5a34b]" />
                      Tu on lai
                    </span>
                    <span className="inline-flex items-center rounded-full border border-[#cfeee9] bg-[#eefcf8] px-3 py-1 text-[#0f766e]">
                      <span className="mr-2 inline-block h-[2.5px] w-5 rounded-full bg-[#32a79a]" />
                      Cum khac
                    </span>
                  </div>
                  <div className="mt-3 space-y-4 font-[var(--font-jp)] text-[1.08rem] font-bold leading-9 text-[#111827]">
                    {sentenceGroups.map((group) => (
                      <div key={`paragraph-${group.paragraphIndex}`} className="space-y-2">
                        {group.lines.map((line, sentenceIndex) => (
                          <div
                            key={`sentence-${group.paragraphIndex}-${sentenceIndex}`}
                            className="rounded-2xl bg-white/70 px-2 py-1"
                          >
                            <p>{highlightParagraph(line.jp, highlightRules)}</p>
                            {line.vi ? (
                              <p className="mt-0.5 font-sans text-[0.93rem] font-semibold leading-7 text-[#4b5b71]">
                                {line.vi}
                              </p>
                            ) : null}
                          </div>
                        ))}
                        {group.paragraphFallbackTranslation ? (
                          <p className="rounded-2xl bg-[#eef4ff] px-3 py-2 font-sans text-[0.92rem] font-semibold leading-7 text-[#3c5072]">
                            {group.paragraphFallbackTranslation}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </section>

                <details
                  open
                  className="group rounded-2xl border border-[#d8e2ee] bg-white shadow-[0_10px_24px_rgba(18,60,105,0.04)]"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
                    <div>
                      <h3 className="text-sm font-black uppercase tracking-[0.14em] text-[#123c69]">
                        Danh sach tu vung
                      </h3>
                      <p className="mt-1 text-xs font-bold text-[#667085]">
                        {selectedText.vocabulary.length} tu trong bai - cuon trong khung neu danh sach dai.
                      </p>
                    </div>
                    <span
                      className="grid h-9 w-9 place-items-center rounded-full border border-[#cfeee9] bg-[#eefcf8] text-[#0f766e] shadow-[0_8px_18px_rgba(34,166,161,0.12)] transition group-hover:bg-[#ddf7f1]"
                      aria-hidden="true"
                    >
                      <ChevronDown className="h-4 w-4 transition-transform duration-200 group-open:rotate-180" />
                    </span>
                  </summary>
                  <div className="border-t border-[#e6edf5] px-5 pb-5 pt-4">
                    {selectedText.vocabulary.length > 0 ? (
                      <div className="max-h-[430px] overflow-y-auto pr-2">
                        <div className="grid gap-2 sm:grid-cols-2">
                          {selectedText.vocabulary.map((word, index) => (
                            <VocabularyCard key={`${word.word}-${word.meaning}-${index}`} word={word} index={index} />
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm font-semibold text-[#667085]">Bai nay chua co tu vung.</p>
                    )}
                  </div>
                </details>

                <section className="rounded-2xl border border-[#d8e2ee] bg-[#f8fcff] px-5 py-4">
                  <h3 className="text-sm font-black uppercase tracking-[0.14em] text-[#123c69]">
                    Hoc ngay tu bai nay
                  </h3>
                  <p className="mt-2 text-sm font-semibold text-[#526070]">
                    Tu dong tao mot lesson tu danh sach tu vung cua bai roi chuyen thang vao che do hoc.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <form action={startReadingVocabStudyFromHubAction}>
                      <input type="hidden" name="textId" value={selectedText.id} />
                      <input type="hidden" name="mode" value="flashcard" />
                      <button
                        type="submit"
                        disabled={selectedText.vocabulary.length === 0}
                        className="inline-flex items-center gap-2 rounded-full bg-[#14635d] px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-white transition hover:bg-[#104f4a] disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        <Library className="h-4 w-4" />
                        Flashcard tu bai nay
                      </button>
                    </form>

                    <form action={startReadingVocabStudyFromHubAction}>
                      <input type="hidden" name="textId" value={selectedText.id} />
                      <input type="hidden" name="mode" value="quiz" />
                      <button
                        type="submit"
                        disabled={selectedText.vocabulary.length === 0}
                        className="inline-flex items-center gap-2 rounded-full bg-[#3155c8] px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-white transition hover:bg-[#2543a3] disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        <span className="grid h-4 w-4 place-items-center rounded-full border border-white/70 text-[10px]">?</span>
                        Quiz tu bai nay
                      </button>
                    </form>

                    <form action={startReadingVocabStudyFromHubAction}>
                      <input type="hidden" name="textId" value={selectedText.id} />
                      <input type="hidden" name="mode" value="recall" />
                      <button
                        type="submit"
                        disabled={selectedText.vocabulary.length === 0}
                        className="inline-flex items-center gap-2 rounded-full bg-orange-600 px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-white transition hover:bg-orange-500 disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        <Flame className="h-4 w-4" />
                        Nhoi tu bai nay
                      </button>
                    </form>

                    {selectedText.vocabulary.length > 0 ? (
                      <Link
                        href={`/vocab/match?reading=${encodeURIComponent(selectedText.id)}`}
                        className="inline-flex items-center gap-2 rounded-full bg-violet-600 px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-white transition hover:bg-violet-500"
                      >
                        <Gamepad2 className="h-4 w-4" />
                        Game noi tu
                      </Link>
                    ) : null}
                  </div>
                </section>
              </div>
            </>
          ) : (
            <div className="p-8 text-center">
              <BookOpenText className="mx-auto h-12 w-12 text-[#22a6a1]" />
              <h2 className="mt-4 text-2xl font-black text-[#111827]">Chua co bai doc</h2>
              <p className="mt-2 text-sm leading-6 text-[#667085]">
                Import JSON bai doc ben duoi de bat dau hoc tu vung theo ngu canh.
              </p>
            </div>
          )}
        </article>
      </div>

      <div className="rounded-[24px] border border-[#d8e2ee] bg-white p-5 shadow-[0_18px_42px_rgba(18,60,105,0.08)]">
        <div className="flex items-center gap-2">
          <Upload className="h-4 w-4 text-[#22a6a1]" />
          <h2 className="text-xl font-black text-[#111827]">Import JSON bai doc</h2>
        </div>
        <p className="mt-1 text-sm text-[#667085]">
          Du lieu import o day duoc luu rieng, khong anh huong trang bai doc tu hoc.
        </p>
        <div className="mt-4">
          <ReadingVocabImportForm />
        </div>
      </div>
    </section>
  );
}
