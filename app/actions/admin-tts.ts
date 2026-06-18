"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin";
import {
  addGeminiApiKey,
  deleteGeminiApiKey,
  selectGeminiApiKey,
} from "@/lib/gemini-key-store";

export type AdminTtsActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

const addKeySchema = z.object({
  label: z.string().trim().min(1, "Hay nhap ten de phan biet key.").max(80),
  apiKey: z
    .string()
    .trim()
    .min(20, "API key qua ngan.")
    .max(300, "API key qua dai.")
    .refine((value) => !/\s/.test(value), "API key khong duoc chua khoang trang."),
});

const keyIdSchema = z.object({
  keyId: z.string().uuid(),
});

function refreshPage() {
  revalidatePath("/admin/tts");
}

export async function addGeminiApiKeyAction(
  _previousState: AdminTtsActionState,
  formData: FormData
): Promise<AdminTtsActionState> {
  await requireAdmin();
  const parsed = addKeySchema.safeParse({
    label: formData.get("label"),
    apiKey: formData.get("apiKey"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message || "Du lieu API key khong hop le.",
    };
  }
  try {
    await addGeminiApiKey(parsed.data.label, parsed.data.apiKey);
    refreshPage();
    return {
      status: "success",
      message: "Da ma hoa va luu Gemini API key. Key moi se duoc chon neu chua co key dang dung.",
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Khong luu duoc API key.",
    };
  }
}

export async function selectGeminiApiKeyAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const parsed = keyIdSchema.safeParse({ keyId: formData.get("keyId") });
  if (!parsed.success) {
    return;
  }
  await selectGeminiApiKey(parsed.data.keyId);
  refreshPage();
}

export async function useEnvironmentGeminiKeyAction(): Promise<void> {
  await requireAdmin();
  await selectGeminiApiKey(null);
  refreshPage();
}

export async function deleteGeminiApiKeyAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const parsed = keyIdSchema.safeParse({ keyId: formData.get("keyId") });
  if (!parsed.success) {
    return;
  }
  await deleteGeminiApiKey(parsed.data.keyId);
  refreshPage();
}
