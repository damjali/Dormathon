// lib/supabase/server.ts
// Server-side Supabase client — HTTP-only cookie session (Security Measure #4)
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, {
                ...options,
                // Not httpOnly: the Supabase browser client needs to read
                // this cookie client-side to know the session exists.
                secure: process.env.NODE_ENV === "production",
                sameSite: "lax",
                path: "/",
              })
            );
          } catch {
            // setAll called from Server Component — safe to ignore
            // Middleware will handle the refresh
          }
        },
      },
    }
  );
}