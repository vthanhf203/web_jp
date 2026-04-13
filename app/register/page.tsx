import { redirect } from "next/navigation";

import { AuthForm } from "@/app/components/auth-form";
import { getCurrentUser } from "@/lib/auth";

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) {
    redirect("/dashboard");
  }

  return (
    <section className="flex justify-center py-6">
      <AuthForm mode="register" />
    </section>
  );
}
