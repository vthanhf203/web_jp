import "server-only";

import { dayDiffInTokyo } from "@/lib/date";
import { prisma } from "@/lib/prisma";

export async function awardXp(userId: string, xp: number) {
  if (xp <= 0) {
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { streak: true, lastStudyAt: true },
  });

  if (!user) {
    return;
  }

  const now = new Date();
  let nextStreak = user.streak;

  if (!user.lastStudyAt) {
    nextStreak = 1;
  } else {
    const dayDiff = dayDiffInTokyo(now, user.lastStudyAt);
    if (dayDiff === 1) {
      nextStreak = user.streak + 1;
    } else if (dayDiff > 1) {
      nextStreak = 1;
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      xp: { increment: xp },
      streak: nextStreak,
      lastStudyAt: now,
    },
  });
}
