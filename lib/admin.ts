import "server-only";

import { redirect } from "next/navigation";

import { requireUser, type SessionUser } from "@/lib/auth";

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function readAdminEmails(): Set<string> {
  const raw = process.env.ADMIN_EMAILS ?? "";
  if (!raw.trim()) {
    return new Set<string>();
  }

  return new Set(
    raw
      .split(/[,\n;]+/)
      .map((entry) => normalizeEmail(entry))
      .filter(Boolean)
  );
}

export function isAdminEmail(email: string): boolean {
  return readAdminEmails().has(normalizeEmail(email));
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!isAdminEmail(user.email)) {
    redirect("/dashboard");
  }
  return user;
}

