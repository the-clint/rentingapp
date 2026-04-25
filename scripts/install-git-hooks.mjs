#!/usr/bin/env node
// Wires up `varlock scan` as a git pre-commit hook so accidental secret
// commits get blocked locally. Runs once per `npm install` on a fresh clone.
//
// Why not `varlock scan --install-hook`? That subcommand assumes `.git` is a
// directory and fails with ENOTDIR in git worktrees (where `.git` is a file
// pointing at the shared worktree metadata). We resolve the real hooks path
// via `git rev-parse` instead, which works for both regular checkouts and
// worktrees.
//
// Intentionally non-fatal: if there's no git dir, no git on PATH, or writing
// the hook fails for any reason, we warn and exit 0 so `npm install` itself
// still succeeds.

import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve, join } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const MARKER_BEGIN = "# --- BEGIN VARLOCK SCAN HOOK ---";
const MARKER_END = "# --- END VARLOCK SCAN HOOK ---";

const VARLOCK_SECTION = `${MARKER_BEGIN}
# Blocks commits that introduce plaintext values matching any @sensitive entry
# in .env.schema. Installed by scripts/install-git-hooks.mjs.
# --staged keeps the scan focused on files actually being committed; without
# it, varlock walks the entire repo and false-positives on docs that mention
# env-name strings like "development".
if command -v npx >/dev/null 2>&1; then
  npx --no-install varlock scan --staged || exit 1
fi
${MARKER_END}
`;

function warnAndExit(msg) {
  console.warn(`[install-git-hooks] ${msg} — you can re-run this via \`node scripts/install-git-hooks.mjs\``);
  process.exit(0);
}

const gitPath = spawnSync("git", ["rev-parse", "--git-path", "hooks"], {
  cwd: repoRoot,
  encoding: "utf8",
});

if (gitPath.status !== 0) {
  warnAndExit("`git rev-parse` failed — is git installed and is this a git checkout?");
}

const hooksDir = resolve(repoRoot, gitPath.stdout.trim());
if (!existsSync(hooksDir)) {
  try {
    mkdirSync(hooksDir, { recursive: true });
  } catch (err) {
    warnAndExit(`failed to create hooks dir at ${hooksDir}: ${err.message}`);
  }
}

const hookPath = join(hooksDir, "pre-commit");
let existing = "";
if (existsSync(hookPath)) {
  existing = readFileSync(hookPath, "utf8");
}

if (existing.includes(MARKER_BEGIN)) {
  process.exit(0);
}

let next;
if (existing.trim() === "") {
  next = `#!/usr/bin/env sh\n${VARLOCK_SECTION}`;
} else {
  next = existing.endsWith("\n") ? `${existing}${VARLOCK_SECTION}` : `${existing}\n${VARLOCK_SECTION}`;
}

try {
  writeFileSync(hookPath, next, "utf8");
  chmodSync(hookPath, 0o755);
} catch (err) {
  warnAndExit(`failed to write ${hookPath}: ${err.message}`);
}

console.log(`[install-git-hooks] varlock scan hook installed at ${hookPath}`);
process.exit(0);
