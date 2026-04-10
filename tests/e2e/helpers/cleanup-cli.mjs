#!/usr/bin/env node
// Standalone cleanup: delete all Supabase auth users whose email starts with
// the e2e test prefix. Run via `npm run test:e2e:cleanup`.
import { createClient } from "@supabase/supabase-js";

const TEST_EMAIL_PREFIX = "e2e-test-";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. " +
      "Run via `npm run test:e2e:cleanup` so varlock loads env.",
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let deleted = 0;
let page = 1;
const perPage = 200;

while (true) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
  if (error) {
    console.error("listUsers failed:", error.message);
    process.exit(1);
  }

  const users = data?.users ?? [];
  if (users.length === 0) break;

  for (const user of users) {
    if (user.email?.startsWith(TEST_EMAIL_PREFIX)) {
      const { error: delError } = await admin.auth.admin.deleteUser(user.id);
      if (delError) {
        console.error(`Failed to delete ${user.email}:`, delError.message);
        continue;
      }
      console.log(`Deleted ${user.email}`);
      deleted += 1;
    }
  }

  if (users.length < perPage) break;
  page += 1;
}

console.log(`Done. Deleted ${deleted} test user(s).`);
