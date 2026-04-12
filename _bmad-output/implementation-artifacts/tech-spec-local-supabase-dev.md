---
title: 'Local Supabase Dev Environment'
type: 'chore'
created: '2026-04-11'
status: 'done'
baseline_commit: 'f7ebe84'
context: ['docs/bitwarden-secrets-setup.md']
---

# Local Supabase Dev Environment

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** All development currently hits the cloud Supabase instance. There is no local, isolated environment for development — risking data pollution, slower iteration cycles, and dependency on internet connectivity.

**Approach:** Stand up a local dockerized Supabase via `supabase start`, wire `.env.local` to point at it, and add npm convenience scripts for the local Supabase lifecycle. Cloud Supabase remains the production target via Varlock/Bitwarden.

## Boundaries & Constraints

**Always:** Keep `.env.local` gitignored (already is). Use the well-known Supabase local credentials from `supabase start` output. All existing migrations must apply cleanly to the local instance.

**Ask First:** Changes to Varlock or `.env.schema` configuration. Any modifications to the Supabase client modules (`lib/supabase/*`).

**Never:** Commit real credentials to version control. Modify the cloud Supabase instance. Change how production env vars are resolved.

</frozen-after-approval>

## Code Map

- `.env.local` -- New file with local Supabase URL + keys (gitignored)
- `package.json` -- Add `supabase:start`, `supabase:stop`, `supabase:reset` scripts
- `supabase/config.toml` -- Already configured, no changes needed
- `supabase/seed.sql` -- Already exists (placeholder), no changes needed

## Tasks & Acceptance

**Execution:**
- [ ] `.env.local` -- Create with local Supabase credentials (URL, anon key, service role key from `supabase start` defaults)
- [ ] `package.json` -- Add `supabase:start`, `supabase:stop`, `supabase:reset`, `supabase:status` scripts

**Acceptance Criteria:**
- Given Docker is running, when `npm run supabase:start` is executed, then the local Supabase stack starts and all 15 migrations apply
- Given local Supabase is running, when `npm run dev` is executed, then the Next.js app connects to the local Supabase instance (verified via Supabase Studio at localhost:54323)
- Given local Supabase is running, when `npm run supabase:reset` is executed, then the database is wiped and migrations + seed are re-applied
- Given the `.env.local` file exists, when a production deployment occurs (using Varlock), then cloud Supabase credentials from Bitwarden are used (`.env.local` is not deployed)

## Verification

**Commands:**
- `npm run supabase:start` -- expected: all containers start, migrations apply, Studio accessible at http://127.0.0.1:54323
- `npm run supabase:status` -- expected: shows running services and their URLs/ports

**Manual checks (if no CLI):**
- Open Supabase Studio at http://127.0.0.1:54323 and confirm all tables from migrations are present
- Run `npm run dev` and verify the app loads without Supabase connection errors
