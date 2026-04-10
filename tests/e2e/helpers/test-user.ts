import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const TEST_EMAIL_PREFIX = "e2e-test-";
// Supabase rejects RFC-reserved domains (example.com, .test, .invalid) as
// invalid at signup. gmail.com passes format validation; these mailboxes
// never receive mail and are deleted in globalTeardown via service role.
export const TEST_EMAIL_DOMAIN = "gmail.com";
export const TEST_PASSWORD = "E2eTestPassword!123";

export function generateTestEmail(): string {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `${TEST_EMAIL_PREFIX}${suffix}@${TEST_EMAIL_DOMAIN}`;
}

export async function createTestUserViaAdmin(
  email: string,
  password: string,
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) {
    throw new Error(
      `Failed to create test user ${email}: ${error.message}`,
    );
  }
}

export function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. " +
        "Run Playwright via `varlock run -- playwright test` so env is loaded.",
    );
  }

  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function deleteTestUsers(): Promise<number> {
  const admin = createAdminClient();
  let deleted = 0;
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const users = data?.users ?? [];
    if (users.length === 0) break;

    for (const user of users) {
      if (user.email?.startsWith(TEST_EMAIL_PREFIX)) {
        const { error: delError } = await admin.auth.admin.deleteUser(user.id);
        if (delError) {
          console.error(`Failed to delete ${user.email}:`, delError.message);
          continue;
        }
        deleted += 1;
      }
    }

    if (users.length < perPage) break;
    page += 1;
  }

  return deleted;
}
