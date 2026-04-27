export type ParsedCustomKanji = {
  character: string;
  meaning: string;
  reading: string;
  strokeHint: string;
};

const KANJI_CHAR_REGEX = /[\u3400-\u4dbf\u4e00-\u9fff]/;

function normalizeText(value: string): string {
  return value.trim();
}

export function extractKanjiChars(input: string): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const char of Array.from(input)) {
    if (!KANJI_CHAR_REGEX.test(char) || seen.has(char)) {
      continue;
    }
    seen.add(char);
    output.push(char);
  }

  return output;
}

export function parseCustomKanjiInput(rawInput: string): ParsedCustomKanji[] {
  const lines = rawInput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const output: ParsedCustomKanji[] = [];

  for (const line of lines) {
    const [characterSource, meaningSource = "", readingSource = "", strokeHintSource = ""] = line
      .split("|")
      .map((part) => normalizeText(part));
    const chars = extractKanjiChars(characterSource || line);

    for (const character of chars) {
      if (seen.has(character)) {
        continue;
      }
      seen.add(character);
      output.push({
        character,
        meaning: meaningSource,
        reading: readingSource,
        strokeHint: strokeHintSource,
      });
    }
  }

  return output;
}
