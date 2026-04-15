#!/usr/bin/env node
/**
 * Dev-server bootstrap for environments where `BWS_SECRETS_TOKEN` is set
 * in the OS user scope (e.g. Windows User env vars) but NOT inherited by
 * the parent process (e.g. Claude Code started before `setx` ran).
 *
 * Flow:
 *   1. If `BWS_SECRETS_TOKEN` is already in process.env, use it.
 *   2. Otherwise, on Windows, read it from the User environment scope
 *      via a short PowerShell call and inject it into the child env.
 *   3. Spawn `next dev` with the populated env and stream its stdio.
 *
 * The token is NEVER written to disk or passed on the command line. It
 * lives only in the child process's env block.
 *
 * Regular `npm run dev` continues to work unchanged — this script is only
 * invoked by `.claude/launch.json` so `preview_start` from Claude Code
 * can boot the dev server without requiring the whole Claude Code
 * process to be restarted after the user ran `setx`.
 */

import { spawn, execFileSync } from "node:child_process";
import { platform } from "node:os";

function getTokenFromWindowsUserScope() {
  if (platform() !== "win32") return null;
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
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

const childEnv = { ...process.env };

if (!childEnv.BWS_SECRETS_TOKEN) {
  const fromUserScope = getTokenFromWindowsUserScope();
  if (fromUserScope) {
    childEnv.BWS_SECRETS_TOKEN = fromUserScope;
    console.log(
      "[dev-with-bws] hydrated BWS_SECRETS_TOKEN from Windows User scope",
    );
  } else {
    console.warn(
      "[dev-with-bws] BWS_SECRETS_TOKEN is not set and could not be read from the OS user scope. varlock validation will fail — see docs/bitwarden-secrets-setup.md.",
    );
  }
}

// Spawn `next dev` as a child process, inheriting our (possibly-augmented)
// env. Using npm so devDependency bin resolution matches what a normal
// `npm run dev` would get.
//
// `shell: true` is required on Windows: `npm` resolves to `npm.cmd`, which
// Node's `child_process.spawn` can only launch through cmd.exe — a direct
// CreateProcess against a .cmd file fails with `EINVAL`. Same class of bug
// the postinstall patch fixes inside varlock itself.
const isWindows = platform() === "win32";
const child = spawn("npm", ["run", "dev"], {
  stdio: "inherit",
  env: childEnv,
  shell: isWindows,
});

child.on("exit", (code, signal) => {
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
