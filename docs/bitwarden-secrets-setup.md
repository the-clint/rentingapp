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
  Bitwarden Secrets Manager                 your dev machine                   Next.js
  +-------------------------------+         +------------------------+         +---------+
  | everything-rent-dev/          |  REST   | varlock + @varlock/    |         |         |
  |   SUPABASE_URL                | <------ |  bitwarden-plugin      | ------> | process |
  |   STRIPE_SECRET_KEY ...       |         |                        |         |  .env   |
  +-------------------------------+         | 1. reads `.env.schema` | @varlock+---------+
  | everything-rent-preview/      | <------ |    (types only)        | nextjs-
  |   SUPABASE_URL                |         | 2. auto-loads          | integr.
  |   STRIPE_SECRET_KEY ...       |         |    `.env.${APP_ENV}`   |
  +-------------------------------+         | 3. evaluates           |
  | everything-rent-prod/         | <------ |    `bitwarden("<uuid>")|
  |   SUPABASE_URL                |         |    calls in that file, |
  |   STRIPE_SECRET_KEY ...       |         |    fetches by UUID     |
  +-------------------------------+         +------------------------+
                                                     ^
                                                     |  process.env.BWS_SECRETS_TOKEN
                                                     |  process.env.APP_ENV  (development|preview|production)
                                                     |  (set in OS / shell / CI / Netlify context)
```

- **Three BWS projects, three environments, three Supabase instances.** Each environment has its own dedicated Bitwarden project, its own machine-account token, and (for preview/production) its own cloud Supabase project; development runs against a local Supabase emulator. A leaked dev or preview token cannot reach production secrets.
- **`$APP_ENV` picks the per-env file.** Types and decorators are declared in `.env.schema`; concrete values — including `bitwarden("<uuid>")` calls — live in `.env.development`, `.env.preview`, and `.env.production`. Varlock auto-loads `.env.${APP_ENV}`, evaluates any `bitwarden(...)` expressions inside, and merges the result over the schema's type declarations. `scripts/dev.mjs` sets `APP_ENV=development` locally; `netlify.toml` sets `preview` for deploy-preview/branch-deploy contexts and `production` for the production context.
- **Per-env files hold every value the app uses at runtime.** `.env.development`, `.env.preview`, and `.env.production` are committed. Non-secret values (URLs, Stripe publishable keys, Turnstile site keys) appear as literal strings; secrets appear as `bitwarden("<uuid>")` calls pointing at the matching project in that environment's BWS project.
- **`.env.schema`** is committed and type-only. It declares every env var with its `@required`/`@optional`, `@sensitive`/`@public`, and `@type=` decorators, registers the Bitwarden plugin, and pins `$APP_ENV` as the environment flag. It holds no UUIDs and no `remap()` calls.
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
2. **Three BWS projects**, one per environment: `everything-rent-dev`, `everything-rent-preview`, and `everything-rent-prod`. Each holds the same set of secret keys with environment-appropriate values (test keys for dev/preview, live keys for prod).
3. **One machine account per project**, with **Can read** permission on its own project only. Separate accounts mean a leaked dev or preview token cannot reach production secrets.
4. **The access tokens** for those machine accounts, copied at creation time. Bitwarden only displays each token **once** — if you lose it, create a new machine account.
5. **The secrets themselves populated in BWS** — see [Secret naming convention](#secret-naming-convention) below. Create the same set of secrets in each of the three projects with environment-appropriate values.
6. **The UUIDs pasted into the matching `.env.<env>` file** — dev UUIDs into `.env.development`, preview UUIDs into `.env.preview`, prod UUIDs into `.env.production`. Each file holds its env's complete picture. `.env.schema` has no UUIDs.
7. **`BWS_SECRETS_TOKEN` set as an OS / shell env var** on your dev machine (dev token), and in Netlify's Site configuration → Environment variables (preview token scoped to Deploy Previews + Branch Deploys, prod token scoped to Production).
8. **`APP_ENV` set to `development`, `preview`, or `production`** — `scripts/dev.mjs` auto-sets it for local dev; CI sets it in `.github/workflows/ci.yml`; `netlify.toml` sets it per deploy context.
9. **A dedicated cloud Supabase project for preview and production.** Development runs against the local Supabase emulator (auto-started by `npm run dev`); preview and production each have their own cloud Supabase project, with the URL and keys stored in the matching BWS project.

Until the prerequisites for your target environment are met, `varlock load`, `npm run dev`, and `npm run build` will all fail — loudly and with useful errors. Running with `APP_ENV=preview` or `APP_ENV=production` while the per-env file's UUIDs are still `TODO-*-UUID` placeholders will report the placeholder strings as invalid UUIDs; that is the intended behavior.

---

## One-time setup

### 1. Create a machine account in Bitwarden

Do this once per environment — one for `dev`, one for `preview`, one for `prod`.

1. Log in to your Bitwarden web vault.
2. Open the **Secrets Manager** app (grid icon, top-right).
3. **Machine accounts** → **New machine account**.
4. Name it so the scope is unambiguous — e.g. `everything-rent-dev-local` for your laptop, `everything-rent-dev-ci` for GitHub Actions, `everything-rent-preview-netlify` for preview deploys, `everything-rent-prod-netlify` for production. Never share one token across environments.
5. Click **Save**, then click into the account and copy the **Access token** from the banner at the top. **Do this immediately — it will never be shown again.**

### 2. Populate the secrets

In Secrets Manager, create three **Projects**: `everything-rent-dev`, `everything-rent-preview`, and `everything-rent-prod`. Create one secret per row in the table below **in each project**, with environment-appropriate values (test keys in dev/preview, live keys in prod). Secret *names* don't have to match these exactly (varlock looks them up by UUID, not name), but consistent naming keeps the dashboard usable.

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

After creating each secret, **grant the matching machine account read access to its project** (Machine accounts → click the account → Projects tab → add the one project that matches). Each machine account should only have access to the project for its environment. Otherwise every `bitwarden()` lookup will return **Permission denied** at resolve time.

### 3. Copy the UUIDs into the matching per-env file

Each secret appears in its per-env file as a `bitwarden("<uuid>")` call:

```env
# in .env.development
STRIPE_SECRET_KEY=bitwarden("<dev-project-uuid>")

# in .env.preview
STRIPE_SECRET_KEY=bitwarden("<preview-project-uuid>")

# in .env.production
STRIPE_SECRET_KEY=bitwarden("<prod-project-uuid>")
```

For each secret in each project:

1. Click the secret in the BWS dashboard.
2. Copy the UUID from the URL or the **Secret ID** field (format: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`).
3. Open the matching `.env.<env>` file in your editor.
4. Paste the UUID inside the `bitwarden("...")` call for that secret, replacing any `TODO-*-UUID` placeholder.

Commit the per-env files to the repo — **UUIDs are not secrets**, they're just pointers. The actual values stay in BWS. `.env.schema` holds no UUIDs and does not need updating when secrets are added or rotated.

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

Treat `BWS_SECRETS_TOKEN` as a CI secret, and always pair it with an explicit `APP_ENV`:

- **GitHub Actions (build/test CI):** `.github/workflows/ci.yml` sets `APP_ENV: development` at the job level and overrides every `@sensitive` env var with a distinctive placeholder — varlock never calls BWS in CI, so the dev UUIDs in `.env.development` are never resolved. The `BWS_SECRETS_TOKEN` placeholder exists only to satisfy the `@initBitwarden` format validator.
- **Netlify (build + runtime):** `APP_ENV` is pinned per deploy context in `netlify.toml` — don't set it manually in the UI. The site uses a two-track model: `main` → Production context → `everything.rent`; `preview` → Branch-deploy context → `preview.everything.rent`. Deploy Previews (ephemeral per-PR URLs) are **disabled** in **Site settings → Build & deploy → Deploy Previews**. Only the `preview` branch is allowlisted under **Branch deploys**. What you DO set in **Site configuration → Environment variables**:
  - `BWS_SECRETS_TOKEN=<prod machine-account token>`, scoped to the **Production** context, **Builds** scope only.
  - `BWS_SECRETS_TOKEN=<preview machine-account token>`, scoped to **Branch Deploys**, **Builds** scope only.
  - `NETLIFY_AUTH_TOKEN=<personal access token>`, scoped to **All deploy contexts**, **Builds** scope only. See [Why NETLIFY_AUTH_TOKEN is required](#why-netlify_auth_token-is-required) below.

  Netlify's per-context scoping lets the same variable name resolve to different values depending on the deploy. The `sync-resolved-env` build plugin (`plugins/sync-resolved-env/`) reads `BWS_SECRETS_TOKEN` and `NETLIFY_AUTH_TOKEN` at build time, calls varlock to pull the matching BWS project's secrets, and pushes each resolved value into Netlify's env-var store via the Netlify API with `functions` scope and the current deploy context. The deployed Next.js function then reads them via plain `process.env.X`. Rotating a secret is: edit it in Bitwarden → trigger a Netlify redeploy for that context.

### Why NETLIFY_AUTH_TOKEN is required

`netlify.toml` env vars and build-time `process.env` mutations are **not visible to deployed functions at runtime** — only env vars stored via Netlify's UI/CLI/API with `functions` scope are. The `sync-resolved-env` build plugin uses the Netlify API to write resolved values into that store on every build, so secrets stay out of the deploy artifact and remain UI-visible / rotatable.

Create the token at <https://app.netlify.com/user/applications#personal-access-tokens>. The plugin only needs site env-var write access on this site, so a single short-description PAT is fine. Rotate alongside your other Netlify credentials.

Use **separate machine accounts per environment**, scoped to separate BWS projects, so a leaked dev/preview/CI token can't reach production secrets. Rotate each account independently.

---

## Troubleshooting

### `bitwarden(): Invalid secret ID format: "TODO-*-UUID"`

You tried to run with `APP_ENV=preview` or `APP_ENV=production` before filling in that env's UUIDs. Paste the real UUIDs from the matching BWS project into `.env.preview` or `.env.production` — see [One-time setup → step 3](#3-copy-the-uuids-into-the-matching-per-env-file).

### `$APP_ENV is not set` / per-env file not loaded

`APP_ENV` is unset or misspelled. Varlock auto-loads `.env.${APP_ENV}`, so a typo means the file is silently skipped and every secret falls back to the empty schema default. Local dev: run `npm run dev` (which sets it via `scripts/dev.mjs`). CI: confirm the `APP_ENV` line in `.github/workflows/ci.yml`. Netlify: `netlify.toml` pins it per deploy context — if this fires on a Netlify build the `[context.*.environment]` blocks have been tampered with.

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
5. Update the CI secret in GitHub Actions / Netlify / wherever.
6. Verify: `npx varlock load` should print ✅ against every entry.

The individual secrets inside BWS (Supabase keys, Stripe keys, etc.) are independent — rotating the access token does not rotate the secrets themselves. Rotate those separately via their respective dashboards.
