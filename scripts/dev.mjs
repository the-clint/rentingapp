#!/usr/bin/env node
/**
 * Single-command dev environment launcher.
 *
 * 1. Checks if local Supabase is already running (via `supabase status`).
 * 2. If not, starts it with `supabase start`.
 * 3. Starts Caddy reverse proxy (via docker compose).
 * 4. Hydrates BWS_SECRETS_TOKEN on Windows (same logic as dev-with-bws.mjs).
 * 5. Spawns `next dev` on port 3000 (Caddy fronts it at https://everything.test).
 *
 * Usage:  node scripts/dev.mjs        (or `npm run dev`)
 */

import { spawn, execFileSync, execSync } from "node:child_process";
import { platform } from "node:os";

const isWindows = platform() === "win32";

// ---------------------------------------------------------------------------
// Supabase: ensure the local emulator is running
// ---------------------------------------------------------------------------
function isSupabaseRunning() {
  try {
    const output = execSync("npx supabase status", {
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
      timeout: 15_000,
    });
    // `supabase status` prints service URLs when running.
    return output.includes("API URL");
  } catch {
    return false;
  }
}

if (isSupabaseRunning()) {
  // eslint-disable-next-line no-console
  console.log("[dev] Supabase is already running.");
} else {
  // eslint-disable-next-line no-console
  console.log("[dev] Starting Supabase...");
  try {
    execSync("npx supabase start", {
      stdio: "inherit",
      timeout: 120_000,
    });
    // eslint-disable-next-line no-console
    console.log("[dev] Supabase started.");
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[dev] Failed to start Supabase. Is Docker running?");
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Caddy: start the reverse proxy (https://everything.test -> localhost:3000)
// ---------------------------------------------------------------------------
// eslint-disable-next-line no-console
console.log("[dev] Starting Caddy...");
try {
  execSync("docker compose up -d caddy", {
    stdio: "inherit",
    timeout: 30_000,
  });
  // eslint-disable-next-line no-console
  console.log("[dev] Caddy started. App will be available at https://everything.test");
} catch (err) {
  // eslint-disable-next-line no-console
  console.error("[dev] Failed to start Caddy. Is Docker running?");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// BWS token: hydrate from Windows User scope if needed
// ---------------------------------------------------------------------------
const childEnv = { ...process.env };

if (!childEnv.BWS_SECRETS_TOKEN) {
  if (isWindows) {
    try {
      const out = execFileSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "[Environment]::GetEnvironmentVariable('BWS_SECRETS_TOKEN','User')",
        ],
        { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" },
      );
      const trimmed = out.trim();
      if (trimmed.length > 0) {
        childEnv.BWS_SECRETS_TOKEN = trimmed;
        // eslint-disable-next-line no-console
        console.log(
          "[dev] Hydrated BWS_SECRETS_TOKEN from Windows User scope.",
        );
      }
    } catch {
      // Swallow — token is optional for local dev
    }
  }

  if (!childEnv.BWS_SECRETS_TOKEN) {
    // eslint-disable-next-line no-console
    console.log(
      "[dev] BWS_SECRETS_TOKEN not set — Stripe/Twilio features will be unavailable. This is fine for basic local dev.",
    );
  }
}

// ---------------------------------------------------------------------------
// Launch Next.js dev server
// ---------------------------------------------------------------------------
// eslint-disable-next-line no-console
console.log("[dev] Starting Next.js...");

const child = spawn("npx", ["next", "dev", "--port", "3000"], {
  stdio: "inherit",
  env: childEnv,
  shell: isWindows,
});

function cleanup() {
  try {
    execSync("docker compose down", { stdio: "inherit", timeout: 10_000 });
  } catch {
    // Best-effort — container may already be stopped
  }
}

child.on("exit", (code, signal) => {
  cleanup();
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    if (!child.killed) child.kill(sig);
  });
}
