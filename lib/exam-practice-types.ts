export type ExamPracticeSectionKind = "grammar" | "reading" | "kanji" | "sentence";

export type ExamPracticeChoice = {
  id: string;
  label: string;
  sub?: string;
};

export type ExamPracticeQuestion = {
  id: string;
  number: number;
  type: string;
  prompt: string;
  instruction?: string;
  target?: string;
  viPrompt?: string;
  passage?: string;
  choices?: ExamPracticeChoice[];
  tokens?: string[];
  answerSlots?: number;
  correctAnswer?: string;
  explanation?: string;
};

export type ExamPracticeSection = {
  id: string;
  title: string;
  label: string;
  kind: ExamPracticeSectionKind;
  questions: ExamPracticeQuestion[];
};

export type ExamPracticeTest = {
  id: string;
  title: string;
  level: string;
  minutes: number;
  tags: string[];
  status?: "new" | "done" | "review";
  lastScore?: number;
  sections: ExamPracticeSection[];
  createdAt: string;
  updatedAt: string;
};

export type ExamPracticeStore = {
  updatedAt: string;
  tests: ExamPracticeTest[];
};
