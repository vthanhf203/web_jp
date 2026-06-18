export type VocabularyExamQuestion = {
  id: string;
  number: number;
  type: string;
  targetWord?: string;
  sourceLesson: string;
  difficulty: string;
  prompt: string;
  choices: string[];
  correctAnswer: string;
  explanation: string;
  choiceExplanations: Partial<Record<string, string>>;
};

export type VocabularyExamSection = {
  id: string;
  title: string;
  kind: string;
  description: string;
  questions: VocabularyExamQuestion[];
};

export type VocabularyExamTest = {
  id: string;
  title: string;
  level: string;
  minutes: number;
  tags: string[];
  questionMode: string;
  sourceLessons: string[];
  furiganaPolicy?: {
    prompt?: string;
    choices?: string;
    explanation?: string;
  };
  sections: VocabularyExamSection[];
  createdAt?: string;
  updatedAt?: string;
};

export type VocabularyExamStore = {
  updatedAt: string;
  tests: VocabularyExamTest[];
};
