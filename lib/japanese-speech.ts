const FURIGANA_META_PATTERN = /\n?\[\[furigana:[\s\S]*?\]\]\s*$/;
const RUBY_RT_PATTERN = /<rt[\s\S]*?<\/rt>/gi;
const HTML_TAG_PATTERN = /<[^>]+>/g;
const AOZORA_RUBY_PATTERN = /(?:\|)?([\u3400-\u9fff々〆ヵヶ]+)《[ぁ-ゖァ-ヺー・\s]+》/g;
const BRACKETED_KANA_AFTER_KANJI_PATTERN =
  /([\u3400-\u9fff々〆ヵヶ]+)\s*[（(［\[]\s*[ぁ-ゖァ-ヺー・\s]+\s*[）)\］\]]/g;
const WHITESPACE_PATTERN = /[ \t\u3000]+/g;
const SENTENCE_BOUNDARY_PATTERN = /[^。！？!?]+[。！？!?]?/g;
const MAX_CHUNK_LENGTH = 110;

function compactSpeechText(value: string): string {
  return value
    .replace(FURIGANA_META_PATTERN, "")
    .replace(RUBY_RT_PATTERN, "")
    .replace(HTML_TAG_PATTERN, "")
    .replace(AOZORA_RUBY_PATTERN, "$1")
    .replace(BRACKETED_KANA_AFTER_KANJI_PATTERN, "$1")
    .replace(WHITESPACE_PATTERN, " ")
    .replace(/\s*\n+\s*/g, "\n")
    .trim();
}

export function cleanJapaneseSpeechText(value: string): string {
  return compactSpeechText(value);
}

function splitLongSentence(sentence: string): string[] {
  if (sentence.length <= MAX_CHUNK_LENGTH) {
    return [sentence];
  }

  const chunks: string[] = [];
  let current = "";
  const parts = sentence.split(/([、，,])/);

  for (const part of parts) {
    if (!part) {
      continue;
    }
    if ((current + part).length > MAX_CHUNK_LENGTH && current.trim()) {
      chunks.push(current.trim());
      current = part;
      continue;
    }
    current += part;
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks.length > 0 ? chunks : [sentence];
}

export function splitJapaneseSpeechText(value: string): string[] {
  const clean = cleanJapaneseSpeechText(value);
  if (!clean) {
    return [];
  }

  const sentences = clean
    .split(/\n+/)
    .flatMap((line) => line.match(SENTENCE_BOUNDARY_PATTERN) ?? [line])
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  return sentences.flatMap(splitLongSentence);
}
