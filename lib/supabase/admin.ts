import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client for Server Actions that need to bypass RLS.
 *
 * Story 3-3 uses this for:
 *   - Reading/writing `public.otp_attempts` for phone-OTP rate limiting
 *     (the table is RLS-locked so no anon/authenticated caller can touch it).
 *   - Updating `auth.users.app_metadata.role` after a successful OTP verify.
 *
 * CRITICAL: this module MUST NEVER be imported from a Client Component or
 * from code that ships to the browser. It reads `SUPABASE_SERVICE_ROLE_KEY`
 * which is a secret. Any import of this module from a file with "use client"
 * at the top will throw at build time because the env var is server-only.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing Supabase admin credentials (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)",
    );
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
