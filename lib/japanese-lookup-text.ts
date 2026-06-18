const FURIGANA_META_PATTERN = /\n?\[\[furigana:[\s\S]*?\]\]\s*$/;
const RUBY_RT_PATTERN = /<rt[\s\S]*?<\/rt>/gi;
const RUBY_RP_PATTERN = /<rp[\s\S]*?<\/rp>/gi;
const HTML_TAG_PATTERN = /<[^>]+>/g;
const AOZORA_RUBY_PATTERN = /(?:[|｜])?([\u3400-\u9fff々〆ヵヶ]+)《([ぁ-ゖァ-ヺー・\s]+)》/g;
const BRACKETED_KANA_AFTER_KANJI_PATTERN =
  /([\u3400-\u9fff々〆ヵヶ]+)\s*[（(［\[]\s*([ぁ-ゖァ-ヺー・\s]+)\s*[）)\］\]]/g;
const EDGE_PUNCTUATION_PATTERN =
  /^[\s、。！？!?「」『』（）()\[\]【】〈〉《》"'“”‘’…・:：;；,.，]+|[\s、。！？!?「」『』（）()\[\]【】〈〉《》"'“”‘’…・:：;；,.，]+$/gu;
const JAPANESE_TEXT_PATTERN = /[\u3040-\u30ff\u3400-\u9fff]/u;
const KANJI_TEXT_PATTERN = /[\u3400-\u9fff々〆ヵヶ]/u;
const KANA_ONLY_PATTERN = /^[ぁ-ゖァ-ヺー・]+$/u;

function normalizeLookupWhitespace(value: string): string {
  return value.replace(/[\s\u3000]+/g, "");
}

function compactRubyReading(_match: string, _kanji: string, reading: string): string {
  return normalizeLookupWhitespace(reading);
}

function compactRubySurface(_match: string, kanji: string): string {
  return normalizeLookupWhitespace(kanji);
}

function stripHtmlRuby(value: string): string {
  return value
    .replace(FURIGANA_META_PATTERN, "")
    .replace(RUBY_RT_PATTERN, "")
    .replace(RUBY_RP_PATTERN, "")
    .replace(HTML_TAG_PATTERN, "");
}

function replaceRubyNotation(value: string, mode: "surface" | "reading"): string {
  const replacer = mode === "surface" ? compactRubySurface : compactRubyReading;
  return stripHtmlRuby(value)
    .replace(AOZORA_RUBY_PATTERN, replacer)
    .replace(BRACKETED_KANA_AFTER_KANJI_PATTERN, replacer);
}

function uniquePush(values: string[], value: string): void {
  if (!value || values.includes(value)) {
    return;
  }
  values.push(value);
}

function trailingKanaAfterLastKanji(value: string): string {
  const chars = Array.from(value);
  for (let index = chars.length - 1; index >= 0; index -= 1) {
    if (KANJI_TEXT_PATTERN.test(chars[index] ?? "")) {
      return chars.slice(index + 1).join("");
    }
  }
  return "";
}

function splitLikelyCopiedRuby(value: string): Array<{ surface: string; reading: string; score: number }> {
  const chars = Array.from(value);
  const splits: Array<{ surface: string; reading: string; score: number }> = [];

  for (let index = 1; index < chars.length - 1; index += 1) {
    const surface = chars.slice(0, index).join("");
    const reading = chars.slice(index).join("");
    if (!KANJI_TEXT_PATTERN.test(surface) || !KANA_ONLY_PATTERN.test(reading)) {
      continue;
    }
    if (surface.length < 2 || reading.length < 2) {
      continue;
    }

    const ratio = reading.length / Math.max(1, surface.length);
    if (ratio < 0.75 || ratio > 2.2) {
      continue;
    }

    const okurigana = trailingKanaAfterLastKanji(surface);
    if (!okurigana || !reading.endsWith(okurigana)) {
      continue;
    }

    const okuriganaScore =
      okurigana && reading.endsWith(okurigana) ? -okurigana.length * 2 : okurigana.length * 2;

    splits.push({
      surface,
      reading,
      score: Math.abs(surface.length - reading.length) + okuriganaScore,
    });
  }

  return splits.sort((left, right) => left.score - right.score || left.surface.length - right.surface.length);
}

export function normalizeJapaneseLookupText(value: string): string {
  return normalizeLookupWhitespace(value.normalize("NFKC"))
    .replace(EDGE_PUNCTUATION_PATTERN, "")
    .trim();
}

export function buildJapaneseLookupTextCandidates(value: string): string[] {
  const normalized = normalizeJapaneseLookupText(value);
  if (!normalized) {
    return [];
  }

  if (!JAPANESE_TEXT_PATTERN.test(normalized)) {
    return [value.trim()].filter(Boolean);
  }

  const surface = normalizeJapaneseLookupText(replaceRubyNotation(value, "surface"));
  const reading = normalizeJapaneseLookupText(replaceRubyNotation(value, "reading"));
  const copiedRubySplits = splitLikelyCopiedRuby(normalized).slice(0, 2);
  const candidates: string[] = [];

  for (const split of copiedRubySplits) {
    uniquePush(candidates, split.surface);
    uniquePush(candidates, split.reading);
  }

  uniquePush(candidates, surface);
  uniquePush(candidates, reading);
  uniquePush(candidates, normalized);

  return candidates;
}
