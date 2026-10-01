"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

type SignupResult =
  | {
      error: string;
      success?: never;
      requiresEmailConfirmation?: never;
      redirectTo?: never;
    }
  | {
      success: true;
      requiresEmailConfirmation: true;
      redirectTo?: never;
      error?: never;
    }
  | {
      success: true;
      requiresEmailConfirmation: false;
      redirectTo: string;
      error?: never;
    };

export async function signupWithEmail(
  _prevState: SignupResult | null,
  formData: FormData,
): Promise<SignupResult> {
  const name = formData.get("name") as string;
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirm-password") as string;

  if (!name || !email || !password || !confirmPassword) {
    return { error: "All fields are required" };
  }

  if (password.length < 8) {
    return { error: "Password must be at least 8 characters long" };
  }

  if (password !== confirmPassword) {
    return { error: "Passwords do not match" };
  }

  const supabase = await createClient();

  const { data, error: signupError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: name },
    },
  });

  if (signupError) {
    return { error: signupError.message };
  }

  // Supabase returns a user with no identities (and no error) when the
  // email is already registered -- this avoids leaking which emails exist.
  if (data.user && data.user.identities?.length === 0) {
    return { error: "An account with this email already exists" };
  }

  revalidatePath("/", "layout");

  // No session means email confirmation is required before the account is usable.
  if (!data.session) {
    return { success: true, requiresEmailConfirmation: true };
  }

  return {
    success: true,
    requiresEmailConfirmation: false,
    redirectTo: "/dashboard",
  };
}
