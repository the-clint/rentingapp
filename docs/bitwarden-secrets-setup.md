# Bitwarden Secrets Manager + varlock setup

Everything.Rent loads its runtime secrets from [Bitwarden Secrets Manager](https://bitwarden.com/products/secrets-manager/) (BWS) via the [`@varlock/bitwarden-plugin`](https://varlock.dev/plugins/bitwarden/). The goal is that **the only sensitive material ever written to disk is a single BWS access token**, and even that lives in an OS env var — never in a file.

This document covers:

1. [How the pieces fit together](#architecture)
2. [Prerequisites](#prerequisites) — must be true BEFORE any `varlock` command will succeed
3. [One-time setup](#one-time-setup)
4. [Everyday commands](#everyday-commands)
5. [Running the dev server / tests / build](#running-the-project)
6. [CI/CD](#cicd)
7. [Troubleshooting](#troubleshooting)
8. [Rotating the access token](#rotating-the-access-token)

---

## Architecture

```
  Bitwarden Secrets Manager              your dev machine                  Next.js
  +---------------------+                +------------------------+        +---------+
  | everything-rent/dev/*    |  REST API      | varlock + @varlock/   |        |         |
  | SUPABASE_URL        | <------------  |  bitwarden-plugin      | -----> | process |
  | STRIPE_SECRET_KEY   |   (HTTPS,      |                        |        |  .env   |
  | TWILIO_AUTH_TOKEN   |    BWS_        | reads `.env.schema`,   |        |         |
  | ...                 |    SECRETS_    | pulls each `bitwarden()| @varlock
  +---------------------+    TOKEN)      | secret by UUID         | nextjs-|         |
                                         +------------------------+ integr. +---------+
                                                  ^
                                                  |  process.env.BWS_SECRETS_TOKEN
                                                  |  (set in OS / shell / CI secret)
```

- **`.env.schema`** is committed to the repo. It declares every env var the app needs, with types and validators, and uses the `bitwarden("<uuid>")` resolver function for values that must be fetched from BWS.
- **`@varlock/nextjs-integration`** replaces Next's built-in env loader. It's wired via TWO pieces — both are required:
    1. A plugin wrapper in `next.config.ts` (`varlockNextConfigPlugin()(nextConfig)`).
    2. A package.json `overrides` entry that aliases the nested `@next/env` dependency to `@varlock/nextjs-integration`. Without this, Next boots with its own loader, the plugin sees `__VARLOCK_ENV is not set`, and `next dev` fails. See [package.json override](#packagejson-override) below.
- **`BWS_SECRETS_TOKEN`** is the machine-account access token. It's the ONLY sensitive value that lives outside BWS. It must be present in `process.env` for any varlock command to authenticate.
- **`.env`** in this repo is intentionally empty. Do NOT put secrets in it. Use `.env.local` only for temporary local overrides of non-secret values.

### package.json override

This block is already present in `package.json` — included here for reference and in case someone needs to restore it:

```json
"overrides": {
  "next": {
    "@next/env": "npm:@varlock/nextjs-integration@^0.3.2"
  }
}
```

After editing `overrides`, always run `npm install` to apply the substitution. You can verify it took effect by checking that `node_modules/next/node_modules/@next/env/package.json` reports `"name": "@varlock/nextjs-integration"`.

---

## Prerequisites

Before running any of the commands in this document, you must have:

1. **A Bitwarden organization with Secrets Manager enabled.** (Free tier works for small teams; paid plans have more secrets.)
2. **A machine account** created inside that org, with **Can read** permission on every secret this project uses.
3. **The access token** for that machine account, copied at creation time. Bitwarden only displays it **once** — if you lose it, create a new machine account.
4. **The secrets themselves populated in BWS** — see [Secret naming convention](#secret-naming-convention) below for the list.
5. **The UUIDs for each secret pasted into `.env.schema`**, replacing the `TODO-*-UUID` placeholders.
6. **`BWS_SECRETS_TOKEN` set as an OS / shell env var** on your dev machine.

Until all six are true, `varlock load`, `npm run dev`, and `npm run build` will all fail — loudly and with useful errors.

---

## One-time setup

### 1. Create a machine account in Bitwarden

1. Log in to your Bitwarden web vault.
2. Open the **Secrets Manager** app (grid icon, top-right).
3. **Machine accounts** → **New machine account**.
4. Name it something like `everything-rent-local-dev` (use a separate account for CI).
5. Click **Save**, then click into the account and copy the **Access token** from the banner at the top. **Do this immediately — it will never be shown again.**

### 2. Populate the secrets

In Secrets Manager, create a **Project** called `everything-rent-dev` (or whatever makes sense for your env). Then create one secret per row in the table below. Secret *names* don't have to match these exactly (varlock looks them up by UUID, not name), but consistent naming makes the dashboard usable.

| Env var | BWS secret name (suggested) | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `everything-rent/dev/NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (public, but still centrally managed) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` | `everything-rent/dev/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | `everything-rent/dev/SUPABASE_SERVICE_ROLE_KEY` | Service role key — server-only, never leaks to client |
| `STRIPE_SECRET_KEY` | `everything-rent/dev/STRIPE_SECRET_KEY` | Must start with `sk_` (see validator in `.env.schema`) |
| `STRIPE_WEBHOOK_SECRET` | `everything-rent/dev/STRIPE_WEBHOOK_SECRET` | Must start with `whsec_` |
| `TWILIO_ACCOUNT_SID` | `everything-rent/dev/TWILIO_ACCOUNT_SID` | Must start with `AC` |
| `TWILIO_AUTH_TOKEN` | `everything-rent/dev/TWILIO_AUTH_TOKEN` | |
| `TWILIO_PHONE_NUMBER` | `everything-rent/dev/TWILIO_PHONE_NUMBER` | Must start with `+` (E.164) |

After creating each secret, **grant the machine account read access to the project** (Machine accounts → click the account → Projects tab → add `everything-rent-dev`). Otherwise every `bitwarden()` lookup will return **Permission denied** at resolve time.

### 3. Copy the UUIDs into `.env.schema`

For each secret you just created:

1. Click the secret in the BWS dashboard.
2. Copy the UUID from the URL or the **Secret ID** field (format: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`).
3. Open `.env.schema` in your editor.
4. Replace the matching `"TODO-*-UUID"` string with the real UUID. Keep the surrounding `bitwarden("...")` intact.

Example:

```env
# before
NEXT_PUBLIC_SUPABASE_URL=bitwarden("TODO-SUPABASE-URL-UUID")

# after
NEXT_PUBLIC_SUPABASE_URL=bitwarden("a1b2c3d4-e5f6-7890-abcd-ef1234567890")
```

Commit `.env.schema` to the repo — **UUIDs are not secrets**, they're just pointers. The actual values stay in BWS.

### 4. Set `BWS_SECRETS_TOKEN` in your shell env

The access token is the one piece of sensitive material that lives outside BWS, and it must be present in `process.env` for any varlock command to authenticate.

**Windows (PowerShell):**

```powershell
# Persist for your Windows user profile
[Environment]::SetEnvironmentVariable("BWS_SECRETS_TOKEN", "<paste-token-here>", "User")

# ⚠ setx and the command above only affect NEW shells. Close and reopen
#   your terminal (and Claude Code, if you're running this via Claude) so
#   the new session picks up the variable.
```

**Windows (cmd):**

```cmd
setx BWS_SECRETS_TOKEN "<paste-token-here>"
```

Same caveat — existing cmd sessions won't see the new value.

**macOS / Linux:**

```bash
# Add to ~/.zshrc or ~/.bashrc
echo 'export BWS_SECRETS_TOKEN="<paste-token-here>"' >> ~/.zshrc

# Reload
source ~/.zshrc
```

**Verify without echoing the value:**

```bash
# bash / zsh
[ -n "$BWS_SECRETS_TOKEN" ] && echo "present, length=${#BWS_SECRETS_TOKEN}" || echo "MISSING"
```

```powershell
# PowerShell
if ($env:BWS_SECRETS_TOKEN) { "present, length=$($env:BWS_SECRETS_TOKEN.Length)" } else { "MISSING" }
```

A valid BWS access token is typically ~94 characters.

> **Never paste the token into a file in this repo** — not `.env`, not `.env.local`, not a shell script. It belongs in OS env vars or a CI secret store.

---

## Everyday commands

All commands run from the project root.

### Load and validate all env vars (dry run)

```bash
npx varlock load
```

This resolves every entry in `.env.schema`, runs each validator, and prints the results. Values marked `@sensitive` are redacted in the output. Use this whenever you want to confirm your setup works without actually starting the server.

**Expected success output** (redacted):

```
✅ All items valid
   NEXT_PUBLIC_SUPABASE_URL: https://xxxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY: ••••••••
   SUPABASE_SERVICE_ROLE_KEY: ••••••••
   ...
```

### Print a single resolved value

```bash
npx varlock printenv NEXT_PUBLIC_SUPABASE_URL
```

> **Warning:** `printenv` prints the plaintext value to stdout even for `@sensitive` items (because its whole purpose is shell substitution, e.g. `MY_VAR=$(varlock printenv MY_VAR)`). Do **not** pipe the output into logs, screenshots, or chat messages. If you need to eyeball a non-sensitive value, use `varlock load` instead.

### Run an arbitrary command with env vars injected

```bash
npx varlock run -- <any-command>
# examples:
npx varlock run -- npx supabase db reset
npx varlock run -- node scripts/backfill.mjs
```

You only need this for commands that are **not** started via `npm run dev` / `npm run build`, because those already go through `@varlock/nextjs-integration`.

### Scan the working tree for leaked secrets

```bash
npx varlock scan
```

Scans tracked files for any value that looks like a secret from `.env.schema`. Run this before every commit that touches env/config — treat any finding as a stop-the-line bug.

### Regenerate TypeScript types

```bash
npx varlock typegen
```

Produces typed access to `process.env.*` based on the schema. Re-run this whenever you add or remove an entry in `.env.schema`.

---

## Running the project

Once the six prerequisites are met, **nothing changes about your day-to-day commands**:

```bash
npm run dev         # Next.js dev server — auto-loads via varlock plugin
npm run build       # Production build — same
npm run test        # Vitest does NOT load varlock by default. If a test
                    # needs a real secret, wrap it: `npx varlock run -- npm run test`
npm run lint
npm run type-check
```

If any required env var is missing, invalid, or fails its type check, `next dev` / `next build` will refuse to start and print varlock's validation report. That's the intended behavior — a broken config should fail loud, not silently fall back to defaults.

---

## CI/CD

Treat `BWS_SECRETS_TOKEN` as a CI secret:

- **GitHub Actions:** repository or org secret → inject as `env: BWS_SECRETS_TOKEN: ${{ secrets.BWS_SECRETS_TOKEN }}` at the job level.
- **Vercel:** project → Settings → Environment Variables → add `BWS_SECRETS_TOKEN` for each env (dev/preview/prod). Vercel will inject it at build and runtime; the varlock Next.js plugin takes it from there.

Use **separate machine accounts** for `dev`, `preview`, and `production`, scoped to separate BWS projects, so a leaked CI token can't reach production secrets. Rotate each account independently.

---

## Troubleshooting

### `bitwarden(): Invalid secret ID format: "TODO-*-UUID"`

You still have placeholder UUIDs in `.env.schema`. Replace them with the real UUIDs from your BWS dashboard (see [One-time setup → step 3](#3-copy-the-uuids-into-envschema)).

### `Authentication failed` / `401 Unauthorized`

`BWS_SECRETS_TOKEN` is missing, wrong, expired, or the machine account has been disabled.

1. Verify presence in your shell: `[ -n "$BWS_SECRETS_TOKEN" ] && echo "present, length=${#BWS_SECRETS_TOKEN}"`.
2. On Windows specifically: did you set the variable via `setx` or PowerShell, then **forget to open a new shell**? Existing sessions don't inherit the new value. Close and reopen your terminal (and Claude Code, if applicable).
3. Check the Bitwarden dashboard → Machine accounts → is your account still enabled? Was the token rotated?

### `Permission denied` on a specific secret

The machine account doesn't have read access to that secret's project. In BWS: Machine accounts → click the account → Projects tab → add the relevant project.

### `Configuration is currently invalid` (on `npm run dev` or `varlock load`)

Read the error list carefully — varlock tells you exactly which entries failed, whether the failure was at resolve time (plugin couldn't fetch) or validation time (value came back but didn't match the `@type=` validator). The latter usually means the secret stored in BWS is wrong (e.g. a Stripe test key instead of a live key, or an extra `https://` prefix).

### Windows: `setx` worked but the shell still can't see it

This is the Windows env-var-propagation trap. `setx` writes to the registry and takes effect in **new** processes only. Fix: close every terminal, Claude Code window, and editor, then reopen them. If you're in a pinch and just need the current session to pick it up:

```powershell
$env:BWS_SECRETS_TOKEN = [Environment]::GetEnvironmentVariable('BWS_SECRETS_TOKEN','User')
```

### I accidentally committed `.env` or pasted the token into a file

1. **Rotate the access token immediately** — see below.
2. `git rm --cached .env`, commit, force-push if it already made it to a remote.
3. Rewrite history with `git filter-repo` if the token reached a public or long-lived remote.

---

## Rotating the access token

Do this whenever the token has been exposed (even momentarily), whenever a laptop leaves your possession, or on a regular schedule (e.g. every 90 days).

1. Bitwarden → Secrets Manager → Machine accounts → find the account → **Revoke access token**.
2. Create a new token on the same account (same permissions, nothing else to configure).
3. Update the OS env var on every dev machine that needs it:
   ```powershell
   [Environment]::SetEnvironmentVariable("BWS_SECRETS_TOKEN", "<new-token>", "User")
   ```
4. Close and reopen your terminal / Claude Code.
5. Update the CI secret in GitHub Actions / Vercel / wherever.
6. Verify: `npx varlock load` should print ✅ against every entry.

The individual secrets inside BWS (Supabase keys, Stripe keys, etc.) are independent — rotating the access token does not rotate the secrets themselves. Rotate those separately via their respective dashboards.
