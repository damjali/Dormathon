// app/action/auth.ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

type LoginResult =
  | {
      error: string;
      success?: never;
      requiresPasswordSetup?: never;
      redirectTo?: never;
    }
  | {
      success: true;
      requiresPasswordSetup: true;
      redirectTo?: never;
      error?: never;
    }
  | {
      success: true;
      requiresPasswordSetup: false;
      redirectTo: string;
      error?: never;
    };

function sanitizeNext(raw: FormDataEntryValue | null): string | null {
  if (typeof raw !== "string" || !raw) return null;
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return null;
  return raw;
}

export async function loginWithEmail(
  _prevState: LoginResult | null,
  formData: FormData,
): Promise<LoginResult> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const next = sanitizeNext(formData.get("next"));

  if (!email || !password) {
    return { error: "Email and password are required" };
  }

  const supabase = await createClient();

  // Auth first — this is now the ONLY thing gating access to account data.
  const { data: authData, error: authError } =
    await supabase.auth.signInWithPassword({
      email,
      password,
    });

  if (authError || !authData?.user) {
    return { error: "Invalid email or password" };
  }

  return {
    success: true,
    requiresPasswordSetup: false,
    redirectTo: next ?? "/dashboard",
  };
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}
