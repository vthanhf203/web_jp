import type { JlptLevel } from "@/lib/admin-vocab-library";

export type HandwritingSource = "core" | "personal" | "mixed";

export type HandwritingRadical = {
  symbol: string;
  name: string;
  meaning: string;
  position: string;
  note: string;
};

export type HandwritingComponent = {
  symbol: string;
  name: string;
  meaning: string;
  position: string;
  role: string;
};

export type HandwritingStructure = {
  type: string;
  formula: string;
  meaning: string;
  note: string;
};

export type HandwritingRelatedWord = {
  id: string;
  word: string;
  reading: string;
  kanji: string;
  hanviet: string;
  meaning: string;
  type: string;
  jlptLevel: JlptLevel;
  exampleSentence: string;
  exampleMeaning: string;
  sourceLabel: string;
};

export type KanjiHandwritingItem = {
  id: string;
  character: string;
  meaning: string;
  hanviet: string;
  onReading: string;
  kunReading: string;
  strokeCount: number;
  jlptLevel: JlptLevel;
  source: HandwritingSource;
  sourceLabel: string;
  deckNames: string[];
  strokeHint: string;
  radical: HandwritingRadical | null;
  radicalHint: string;
  mnemonic: string;
  components: HandwritingComponent[];
  structure: HandwritingStructure | null;
  tags: string[];
  relatedWords: HandwritingRelatedWord[];
};
