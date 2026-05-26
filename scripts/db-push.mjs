#!/usr/bin/env node
/**
 * Apply pending Supabase migrations to the cloud project for the current
 * APP_ENV. Invoked by `npm run db:push`, which the Netlify build command
 * runs (wrapped in `varlock run`) before `next build`.
 *
 * Env vars (resolved by varlock from the per-environment BWS project):
 *   - SUPABASE_ACCESS_TOKEN   personal/CI access token (consumed by the CLI)
 *   - SUPABASE_DB_PASSWORD    project DB password     (consumed by the CLI)
 *   - SUPABASE_PROJECT_ID     cloud project ref       (used for `link`)
 *
 * If any of the three is missing the script no-ops and exits 0 — this lets
 * local development (APP_ENV=development, no remote credentials) run
 * `npm run build` without trying to push to a cloud project that does not
 * exist.
 */

import { spawnSync } from "node:child_process";

const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const dbPassword = process.env.SUPABASE_DB_PASSWORD;
const projectId = process.env.SUPABASE_PROJECT_ID;

if (!accessToken || !dbPassword || !projectId) {
  console.log(
    "[db:push] Skipping — SUPABASE_ACCESS_TOKEN, SUPABASE_DB_PASSWORD, and " +
      "SUPABASE_PROJECT_ID must all be set (expected in preview/production " +
      "builds, not in local dev).",
  );
  process.exit(0);
}

function run(args) {
  console.log(`[db:push] $ supabase ${args.join(" ")}`);
  const result = spawnSync("npx", ["supabase", ...args], {
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run(["link", "--project-ref", projectId]);
run(["db", "push", "--include-all", "-y"]);
console.log("[db:push] Done.");
