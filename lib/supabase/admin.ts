import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Service-role client -- bypasses RLS entirely. Only use for the specific operations
// that legitimately need to (storage uploads to the private payslips bucket, looking
// up an existing auth user by email during onboarding). Never use this to satisfy a
// query that RLS is blocking -- that's a sign the policy or RPC is wrong, not this.
//
// Deliberately untyped (see lib/supabase/client.ts for why).
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
  