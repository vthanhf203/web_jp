"use server";

import { QuizOption } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { awardXp } from "@/lib/progress";
import { prisma } from "@/lib/prisma";

type SelectedAnswer = {
  questionId: string;
  selected: QuizOption;
};

function isQuizOption(value: string): value is QuizOption {
  return value === "A" || value === "B" || value === "C" || value === "D";
}

function parseSubmittedAnswers(formData: FormData): SelectedAnswer[] {
  return Array.from(formData.entries())
    .filter(
      (entry): entry is [string, string] =>
        entry[0].startsWith("q_") && typeof entry[1] === "string"
    )
    .map(([key, value]) => ({
      questionId: key.replace("q_", ""),
      selected: value,
    }))
    .filter((item): item is SelectedAnswer => isQuizOption(item.selected));
}

export async function submitQuizAction(formData: FormData) {
  const user = await requireUser();
  const selectedAnswers = parseSubmittedAnswers(formData);

  if (selectedAnswers.length === 0) {
    redirect("/quiz?status=empty");
  }

  const questionIds = selectedAnswers.map((item) => item.questionId);
  const answerMap = new Map(
    selectedAnswers.map((item) => [item.questionId, item.selected])
  );

  const questions = await prisma.quizQuestion.findMany({
    where: { id: { in: questionIds } },
    select: {
      id: true,
      correctOption: true,
    },
  });

  if (questions.length === 0) {
    redirect("/quiz?status=empty");
  }

  let score = 0;
  const answers = questions.map((question) => {
    const selected = answerMap.get(question.id) ?? QuizOption.A;
    const isCorrect = selected === question.correctOption;
    if (isCorrect) {
      score += 1;
    }
    return {
      questionId: question.id,
      selectedOption: selected,
      isCorrect,
    };
  });

  await prisma.quizAttempt.create({
    data: {
      userId: user.id,
      score,
      total: questions.length,
      answers: {
        create: answers,
      },
    },
  });

  await awardXp(user.id, score * 2);

  revalidatePath("/quiz");
  revalidatePath("/dashboard");
  redirect(`/quiz?score=${score}&total=${questions.length}`);
}
