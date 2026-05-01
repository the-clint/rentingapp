/**
 * Local Netlify Build Plugin: sync-resolved-env
 *
 * Resolves env vars via varlock at build time (which fans out to Bitwarden
 * Secrets Manager) and pushes them into Netlify's encrypted env-var store
 * with `Functions` scope, scoped to the current deploy context. The next
 * deploy of the function reads them via plain `process.env.X` — no varlock
 * runtime resolution, no secrets bundled into the deploy artifact.
 *
 * This is the canonical Netlify path for build-time secret resolution.
 * `netlify.toml` env vars and `netlifyConfig.env` plugin mutations are
 * NOT visible to functions at runtime — only env vars stored via the
 * Netlify API/UI/CLI with `functions` scope are.
 *
 * Required env vars at build time:
 *   - BWS_SECRETS_TOKEN   (already configured for varlock)
 *   - APP_ENV             (set per context in netlify.toml)
 *   - NETLIFY_AUTH_TOKEN  (PAT with site-write access; see docs/bitwarden-secrets-setup.md)
 *
 * Skipped (never synced):
 *   - BWS_SECRETS_TOKEN   — varlock auth, must stay scoped to Builds only
 *   - NETLIFY_AUTH_TOKEN  — this plugin's auth, not a runtime secret
 *   - APP_ENV             — build-only flag
 */

import { execFileSync } from "node:child_process";

const NETLIFY_API = "https://api.netlify.com/api/v1";
const NEVER_SYNC = new Set([
  "BWS_SECRETS_TOKEN",
  "NETLIFY_AUTH_TOKEN",
  "APP_ENV",
]);

async function netlifyFetch(path, { method = "GET", token, body } = {}) {
  const res = await fetch(`${NETLIFY_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  if (!res.ok) {
    const detail = typeof parsed === "string" ? parsed : JSON.stringify(parsed);
    throw new Error(
      `Netlify API ${method} ${path} → ${res.status}: ${detail}`,
    );
  }
  return parsed;
}

function resolveEnvViaVarlock() {
  const stdout = execFileSync(
    "npx",
    ["varlock", "load", "--format", "json-full", "--compact"],
    {
      stdio: ["ignore", "pipe", "inherit"],
      encoding: "utf8",
      env: process.env,
      shell: process.platform === "win32",
    },
  );
  const parsed = JSON.parse(stdout);
  const out = [];
  for (const [key, item] of Object.entries(parsed.config || {})) {
    if (NEVER_SYNC.has(key)) continue;
    const value = item?.value;
    if (value === undefined || value === null || value === "") continue;
    out.push({ key, value: String(value), isSensitive: !!item.isSensitive });
  }
  return out;
}

export async function onPreBuild({ constants, utils }) {
  if (process.env.NETLIFY !== "true") {
    console.log(
      "[sync-resolved-env] not running on Netlify (NETLIFY!=true), skipping.",
    );
    return;
  }

  const token = process.env.NETLIFY_AUTH_TOKEN;
  if (!token) {
    utils.build.failBuild(
      "[sync-resolved-env] NETLIFY_AUTH_TOKEN missing. Add a Netlify PAT in Site settings → Environment variables, scoped to Builds. See docs/bitwarden-secrets-setup.md.",
    );
    return;
  }

  const siteId = constants.SITE_ID || process.env.SITE_ID;
  const buildContext = process.env.CONTEXT;
  if (!siteId || !buildContext) {
    utils.build.failBuild(
      `[sync-resolved-env] missing SITE_ID (${!!siteId}) or CONTEXT (${!!buildContext}).`,
    );
    return;
  }

  let resolved;
  try {
    resolved = resolveEnvViaVarlock();
  } catch (err) {
    utils.build.failBuild(
      `[sync-resolved-env] varlock load failed: ${err.message}`,
    );
    return;
  }

  let site;
  try {
    site = await netlifyFetch(`/sites/${siteId}`, { token });
  } catch (err) {
    utils.build.failBuild(
      `[sync-resolved-env] failed to fetch site info: ${err.message}`,
    );
    return;
  }
  const accountId = site.account_id || site.account_slug;
  if (!accountId) {
    utils.build.failBuild(
      "[sync-resolved-env] could not determine account_id from site.",
    );
    return;
  }

  let existing;
  try {
    existing = await netlifyFetch(
      `/accounts/${accountId}/env?site_id=${siteId}`,
      { token },
    );
  } catch (err) {
    utils.build.failBuild(
      `[sync-resolved-env] failed to list env vars: ${err.message}`,
    );
    return;
  }
  const existingByKey = new Map(
    Array.isArray(existing) ? existing.map((v) => [v.key, v]) : [],
  );

  let created = 0;
  let updated = 0;
  let unchanged = 0;
  const errors = [];

  for (const { key, value, isSensitive } of resolved) {
    try {
      const current = existingByKey.get(key);
      if (current) {
        const valueForCtx = (current.values || []).find(
          (v) => v.context === buildContext,
        );
        const valueForAll = (current.values || []).find(
          (v) => v.context === "all",
        );
        const effective = valueForCtx?.value ?? valueForAll?.value;
        if (effective === value) {
          unchanged++;
          continue;
        }
        await netlifyFetch(
          `/accounts/${accountId}/env/${encodeURIComponent(key)}?site_id=${siteId}`,
          {
            method: "PATCH",
            token,
            body: { context: buildContext, value },
          },
        );
        updated++;
      } else {
        await netlifyFetch(
          `/accounts/${accountId}/env?site_id=${siteId}`,
          {
            method: "POST",
            token,
            body: [
              {
                key,
                // Omit `scopes` — explicit scopes are a paid-tier feature
                // ("Upgrade your Netlify account to set specific scopes").
                // Default behavior on free tier is "all scopes", which is
                // what we want: the function runtime can read them.
                values: [{ value, context: buildContext }],
                is_secret: isSensitive,
              },
            ],
          },
        );
        created++;
      }
    } catch (err) {
      errors.push(`${key}: ${err.message}`);
    }
  }

  console.log(
    `[sync-resolved-env] context=${buildContext}: created=${created}, updated=${updated}, unchanged=${unchanged}`,
  );

  if (errors.length) {
    utils.build.failBuild(
      `[sync-resolved-env] ${errors.length} env var sync failure(s):\n  - ${errors.join("\n  - ")}`,
    );
  }
}
