import { createClient } from "@supabase/supabase-js";

/**
 * Admin Supabase client using the service role key.
 * NEVER import this from client components — server-only.
 * Always call inside a function, never at module scope.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}
