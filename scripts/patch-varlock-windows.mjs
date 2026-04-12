#!/usr/bin/env node
/**
 * Patches varlock's internal `execSyncVarlock` for Windows compatibility.
 * Two bugs in upstream (varlock@0.7.2):
 *
 *   1. `findVarlockBin` only looks for `varlock.exe` in `node_modules/.bin`
 *      on Windows. But npm ships `.cmd` + `.ps1` + no-extension shims —
 *      never a real `.exe`. The lookup fails.
 *
 *   2. Even with (1) fixed to return the `.cmd` path, Node's `execFileSync`
 *      cannot directly spawn a `.cmd` / `.bat` file on Windows without
 *      `shell: true` — `CreateProcess` expects a PE binary. Attempting it
 *      fails with `EINVAL` at `spawnSync`.
 *
 * This patch fixes both: extends `findVarlockBin` to fall through to
 * `.cmd` and adds `shell: true` to the `execFileSync` call site when the
 * resolved path is a batch file. On non-Windows hosts both edits are
 * effectively no-ops (`isWindows` gates the first, `shell: true` is
 * harmless on posix where the path has no `.cmd` extension).
 *
 * The patch is idempotent: it runs on every `npm install` via a
 * `postinstall` script in package.json. On non-Windows hosts it is a
 * no-op. When upstream varlock ships a Windows-aware resolver, delete
 * this file and the `postinstall` script entry.
 *
 * Issue tracking: https://github.com/dmno-dev/varlock/issues (add link
 * when filed).
 */

import { existsSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(HERE);

// The chunk filename contains a content hash that may change across
// varlock versions — find it by content match instead of hardcoding.
const VARLOCK_DIST = join(REPO_ROOT, "node_modules", "varlock", "dist");

function findChunkFile() {
  if (!existsSync(VARLOCK_DIST)) return null;
  const chunks = readdirSync(VARLOCK_DIST).filter(
    (f) => f.startsWith("chunk-") && f.endsWith(".js"),
  );
  for (const name of chunks) {
    const full = join(VARLOCK_DIST, name);
    const contents = readFileSync(full, "utf8");
    if (contents.includes("findVarlockBin") && contents.includes("varlock.exe")) {
      return { path: full, contents };
    }
  }
  return null;
}

const PATCH_MARKER_LOOKUP = "// [rentingapp] patched: fall through to .cmd on Windows";
const PATCH_MARKER_SPAWN = "// [rentingapp] patched: shell spawn for .cmd";

function patchWindowsBinaryLookup() {
  const found = findChunkFile();
  if (!found) {
    console.warn(
      "[patch-varlock-windows] could not locate varlock's exec-sync chunk; skipping (varlock may not be installed yet).",
    );
    return;
  }

  let contents = found.contents;
  let changed = false;

  // --- Patch 1: findVarlockBin candidates ---
  if (!contents.includes(PATCH_MARKER_LOOKUP)) {
    const ORIGINAL_LOOKUP = `const possibleVarlockPath = path.join(possibleBinPath, isWindows ? "varlock.exe" : "varlock");
      if (fs.existsSync(possibleVarlockPath)) {
        return possibleVarlockPath;
      }`;

    const REPLACEMENT_LOOKUP = `${PATCH_MARKER_LOOKUP}
      const candidates = isWindows
        ? ["varlock.exe", "varlock.cmd", "varlock"]
        : ["varlock"];
      for (const candidate of candidates) {
        const possibleVarlockPath = path.join(possibleBinPath, candidate);
        if (fs.existsSync(possibleVarlockPath)) {
          return possibleVarlockPath;
        }
      }`;

    if (!contents.includes(ORIGINAL_LOOKUP)) {
      console.warn(
        "[patch-varlock-windows] lookup-site shape changed in varlock — upstream may have fixed Windows support. Review scripts/patch-varlock-windows.mjs.",
      );
      return;
    }
    contents = contents.replace(ORIGINAL_LOOKUP, REPLACEMENT_LOOKUP);
    changed = true;
  }

  // --- Patch 2: execFileSync shell for .cmd/.bat ---
  if (!contents.includes(PATCH_MARKER_SPAWN)) {
    const ORIGINAL_SPAWN = `const result = execFileSync(varlockPath, command.split(" "), {
          ...opts,
          stdio: "pipe"
        });`;

    const REPLACEMENT_SPAWN = `${PATCH_MARKER_SPAWN}
        const needsShell = /\\.(cmd|bat)$/i.test(varlockPath);
        const result = execFileSync(varlockPath, command.split(" "), {
          ...opts,
          stdio: "pipe",
          ...(needsShell && { shell: true })
        });`;

    if (!contents.includes(ORIGINAL_SPAWN)) {
      console.warn(
        "[patch-varlock-windows] spawn-site shape changed in varlock — upstream may have fixed Windows support. Review scripts/patch-varlock-windows.mjs.",
      );
      return;
    }
    contents = contents.replace(ORIGINAL_SPAWN, REPLACEMENT_SPAWN);
    changed = true;
  }

  if (changed) {
    writeFileSync(found.path, contents, "utf8");
    console.log(
      `[patch-varlock-windows] patched ${found.path} — varlock now spawns .cmd shims on Windows.`,
    );
  }
}

patchWindowsBinaryLookup();
