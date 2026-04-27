"use server";

import { compare, hash } from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createSession, deleteSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type AuthActionState = {
  error?: string;
};

const RegisterSchema = z.object({
  name: z.string().trim().min(2, "Tên cần ít nhất 2 ký tự.").max(48, "Tên quá dài."),
  email: z.email("Email không hợp lệ.").trim().toLowerCase(),
  password: z
    .string()
    .min(8, "Mật khẩu cần ít nhất 8 ký tự.")
    .regex(/[A-Za-z]/, "Mật khẩu cần có chữ cái.")
    .regex(/[0-9]/, "Mật khẩu cần có số."),
});

const LoginSchema = z.object({
  email: z.email("Email không hợp lệ.").trim().toLowerCase(),
  password: z.string().min(1, "Vui lòng nhập mật khẩu."),
});

export async function registerAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const parsed = RegisterSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }

  let user: { id: string; name: string };

  try {
    const existing = await prisma.user.findUnique({
      where: { email: parsed.data.email },
      select: { id: true },
    });

    if (existing) {
      return { error: "Email này đã đăng ký." };
    }

    const passwordHash = await hash(parsed.data.password, 12);

    user = await prisma.user.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        passwordHash,
      },
      select: { id: true, name: true },
    });
  } catch {
    return { error: "Không kết nối được cơ sở dữ liệu. Vui lòng thử lại sau." };
  }

  await createSession(user);
  revalidatePath("/");
  redirect("/dashboard");
}

export async function loginAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }

  let user: { id: string; name: string; passwordHash: string } | null;

  try {
    user = await prisma.user.findUnique({
      where: { email: parsed.data.email },
      select: {
        id: true,
        name: true,
        passwordHash: true,
      },
    });
  } catch {
    return { error: "Không kết nối được cơ sở dữ liệu. Vui lòng thử lại sau." };
  }

  if (!user) {
    return { error: "Email hoặc mật khẩu chưa đúng." };
  }

  const isValid = await compare(parsed.data.password, user.passwordHash);
  if (!isValid) {
    return { error: "Email hoặc mật khẩu chưa đúng." };
  }

  await createSession(user);
  revalidatePath("/");
  redirect("/dashboard");
}

export async function logoutAction() {
  await deleteSession();
  revalidatePath("/");
  redirect("/");
}
