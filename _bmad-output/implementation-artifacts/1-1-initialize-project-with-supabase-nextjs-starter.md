# Story 1.1: Initialize Project with Supabase Next.js Starter

Status: done

## Story

As a developer,
I want the project scaffolded with the Supabase Next.js starter template, Varlock environment management, and CI/CD pipeline,
so that I have a working development environment with all foundational tooling in place.

## Acceptance Criteria

1. **Project Initialization (DONE):** Next.js 16+ with App Router, TypeScript strict mode, Tailwind CSS, and shadcn/ui are configured via `npx create-next-app@latest rentingapp -e with-supabase`
2. **Supabase Local Dev:** Supabase local development is configured via `supabase start` (Docker). Verify `supabase/config.toml` exists and local Supabase starts successfully
3. **Varlock Environment Management:** `@varlock/nextjs-integration` is installed with `.env.schema` defining all required env vars (see env var list below). Varlock log redaction is enabled. Runtime validation catches missing/invalid vars at startup
4. **Testing Framework:** Vitest + React Testing Library are configured with a passing sample test
5. **CI/CD Pipeline:** GitHub Actions CI pipeline runs: lint, type-check, varlock scan, tests, build
6. **Git & Secrets:** `.gitignore` excludes `.env.local` and Supabase local data
7. **Result Type Utility:** `Result<T>` type utility exists in `lib/utils/result.ts` with `ok()` and `err()` helper functions

## What Already Exists (from initial scaffold commit `71ef227`)

The Supabase Next.js starter has already been scaffolded. The following are **already in place** — do NOT recreate:

- `package.json` with Next.js, React 19, Supabase client, Tailwind CSS, shadcn/ui, next-themes, lucide-react
- `tsconfig.json` with strict mode, bundler module resolution, `@/*` path alias
- `tailwind.config.ts` with custom color system (CSS variables), dark mode, animation plugin
- `next.config.ts` with component caching
- `eslint.config.mjs` extending Next.js core web vitals + TypeScript
- `postcss.config.mjs` with Tailwind + Autoprefixer
- `components.json` for shadcn/ui (New York style, RSC enabled, Lucide icons)
- `vitest.config.ts` + `vitest.setup.ts` with jsdom environment and testing-library/jest-dom
- `app/` directory with App Router structure, auth pages, protected route
- `components/` with auth components, theme switcher, shadcn/ui primitives (badge, button, card, checkbox, dropdown-menu, input, label)
- `lib/supabase/` with client.ts, server.ts, proxy.ts
- `lib/utils/result.ts` + `lib/utils/result.test.ts` — Result type already implemented
- `.env.example` with NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
- `.env.schema` with Supabase, Stripe, and Twilio env vars defined
- `proxy.ts` middleware for Supabase session management
- Dev dependencies: vitest, @testing-library/react, @testing-library/dom, @testing-library/jest-dom, jsdom, @vitejs/plugin-react
- Scripts: dev, build, start, lint, test, test:watch

## Remaining Work

### 1. Verify & Fix Supabase Local Development
- Ensure `supabase/config.toml` exists (may need `supabase init` if not present)
- Verify `supabase start` works with Docker
- Add `supabase/` local data directories to `.gitignore` if not already excluded
- Create `supabase/migrations/` directory for future migration files
- Create `supabase/seed.sql` placeholder for dev seed data

### 2. Varlock Integration Verification
- Verify `@varlock/nextjs-integration` is installed (check package.json)
- If not installed, add it: `npm install @varlock/nextjs-integration`
- Verify `.env.schema` includes ALL required variables with correct validation:
  - `NEXT_PUBLIC_SUPABASE_URL` (not sensitive)
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (not sensitive) — NOTE: starter may use `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, rename to match architecture spec
  - `SUPABASE_SERVICE_ROLE_KEY` (sensitive)
  - `STRIPE_SECRET_KEY` (sensitive, prefix `sk_`)
  - `STRIPE_WEBHOOK_SECRET` (sensitive, prefix `whsec_`)
  - `TWILIO_ACCOUNT_SID` (sensitive, prefix `AC`)
  - `TWILIO_AUTH_TOKEN` (sensitive)
  - `TWILIO_PHONE_NUMBER` (sensitive, prefix `+`)
- Enable Varlock log redaction in Next.js config
- Ensure `varlock scan` CLI command works

### 3. CI/CD Pipeline (GitHub Actions)
- Create `.github/workflows/ci.yml` with these steps in order:
  1. **Lint:** `npm run lint`
  2. **Type-check:** `npx tsc --noEmit` (add `type-check` script to package.json if missing)
  3. **Varlock scan:** `npx varlock scan`
  4. **Tests:** `npm test`
  5. **Build:** `npm run build`
- Use Node.js 20.x, cache npm dependencies
- Trigger on push to main and pull requests

### 4. Project Structure Scaffolding
Create the following empty directory structure with `.gitkeep` files to establish the architecture:

```
app/
  (operator)/              # Operator-authenticated routes (empty for now)
  (renter)/                # Renter-facing routes (empty for now)
  api/
    webhooks/
      stripe/              # Stripe webhook Route Handler (empty for now)
      twilio/              # Twilio webhook Route Handler (empty for now)
lib/
  actions/                 # Server Actions grouped by domain (empty for now)
  schemas/                 # Zod schemas shared client + server (empty for now)
  services/                # Third-party service wrappers (empty for now)
  types/
    database.ts            # Placeholder: Supabase generated types
    domain.ts              # Placeholder: App-level types
components/
  booking/                 # Domain components (empty for now)
  listing/
  messaging/
  payment/
  shared/
stores/                    # Zustand stores (empty for now)
```

### 5. Verify Testing Setup
- Run `npm test` and confirm existing `result.test.ts` passes
- Verify test configuration covers `**/*.test.{ts,tsx}` pattern
- Ensure test:watch script works: `npm run test:watch`

### 6. Add Missing npm Scripts
Check `package.json` and add if missing:
- `"type-check": "tsc --noEmit"` — needed for CI pipeline

### 7. Update .gitignore
Ensure these entries exist:
- `.env.local`
- `.env*.local`
- `supabase/.temp/`
- `supabase/.branches/`
- `.supabase/`

## Tasks / Subtasks

- [x] Task 1: Supabase local dev setup (AC: #2)
  - [x] Run `supabase init` if `supabase/config.toml` doesn't exist
  - [x] Verify `supabase start` works (requires Docker running)
  - [x] Create `supabase/migrations/` directory
  - [x] Create `supabase/seed.sql` placeholder
  - [x] Add Supabase local data dirs to `.gitignore`
- [x] Task 2: Varlock integration (AC: #3)
  - [x] Verify or install `@varlock/nextjs-integration`
  - [x] Audit `.env.schema` against required variable list
  - [x] Fix any variable naming mismatches (e.g., PUBLISHABLE_KEY vs ANON_KEY)
  - [x] Enable log redaction
  - [x] Test `varlock scan` passes
- [x] Task 3: CI/CD pipeline (AC: #5)
  - [x] Create `.github/workflows/ci.yml`
  - [x] Add `type-check` script to `package.json`
  - [x] Verify all 5 pipeline steps work locally before committing
- [x] Task 4: Project structure scaffolding
  - [x] Create route group directories: `(operator)`, `(renter)`, `api/webhooks/`
  - [x] Create `lib/` subdirectories: `actions/`, `schemas/`, `services/`, `types/`
  - [x] Create `components/` subdirectories: `booking/`, `listing/`, `messaging/`, `payment/`, `shared/`
  - [x] Create `stores/` directory
  - [x] Create placeholder type files: `database.ts`, `domain.ts`
- [x] Task 5: Verification & cleanup (AC: #1, #4, #6, #7)
  - [x] Run `npm test` — confirm result.test.ts passes
  - [x] Run `npm run lint` — passes
  - [x] Run `npm run build` — passes
  - [x] Verify `.gitignore` covers all sensitive/local files
  - [x] Verify Result type in `lib/utils/result.ts` matches spec: `{ success: true, data: T } | { success: false, error: { code: string, message: string } }`

## Dev Notes

### Architecture Compliance

**Starter Template:** Already applied (`npx create-next-app@latest rentingapp -e with-supabase`). Do NOT re-scaffold.

**Result Type Pattern:** Already exists at `lib/utils/result.ts`. Verify it matches:
```typescript
type Result<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } };
```
All Server Actions in future stories MUST return `Result<T>`. Never throw from business logic.

**Error Codes:** Use `SCREAMING_SNAKE_CASE` — `BOOKING_CONFLICT`, `OTP_RATE_LIMITED`, `PAYMENT_FAILED`, `UNAUTHORIZED`

**Naming Conventions:**
- Files: `kebab-case.ts` (e.g., `booking-actions.ts`)
- Components: PascalCase (e.g., `ListingCard`)
- Functions/variables: camelCase (e.g., `createBooking`)
- Types/interfaces: PascalCase (e.g., `Booking`)
- Zod schemas: camelCase + `Schema` suffix (e.g., `createBookingSchema`)
- Constants: `SCREAMING_SNAKE_CASE` (e.g., `MAX_RENTAL_DAYS`)
- DB tables: `snake_case` plural (e.g., `bookings`)
- DB columns: `snake_case` (e.g., `rental_start_date`)
- DB foreign keys: `{table_singular}_id` (e.g., `listing_id`)

**Anti-Patterns — NEVER do:**
- `export default` — always use named exports
- `any` type — use proper types or `unknown` with narrowing
- Throw from Server Actions — return `Result<T>`
- Inline SQL — use Supabase query builder
- Manual `isLoading` for Server Actions — use `useTransition`

**Data Exchange:**
- Dates: ISO 8601 strings in DB/API, format at UI layer only
- Currency: Integers (cents) in DB, format to dollars at UI layer only

### API Patterns (for future reference)
- **Reads:** Supabase client direct from browser (RLS-protected)
- **Mutations:** Next.js Server Actions with Zod validation
- **Webhooks:** Route Handlers at `/api/webhooks/stripe` and `/api/webhooks/twilio`

### Environment Variables
All env vars defined in `.env.schema`. Actual values in `.env.local` (gitignored). AI agents read `.env.schema` for context, never `.env.local`.

### Deployment
- **Local:** `supabase start` + `npm run dev` (Turbopack)
- **Production:** Vercel auto-deploys on merge to main
- **CI:** GitHub Actions runs lint → type-check → varlock scan → tests → build

### Project Structure Notes

The architecture specifies a feature-based layout with route groups:
- `(auth)/` — already exists from starter (sign-in, sign-up, forgot-password, etc.)
- `(operator)/` — operator-authenticated routes (create in this story, populate in later stories)
- `(renter)/` — renter-facing routes (create in this story, populate in later stories)

The starter's existing `app/protected/` route is a demo page — it can remain for now but will be replaced by `(operator)/dashboard/` in Story 1.4.

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 1, Story 1.1]
- [Source: _bmad-output/planning-artifacts/architecture.md — Technical Stack, Project Structure, API Patterns, Deployment Strategy]
- [Source: _bmad-output/planning-artifacts/prd.md — NFR19-20 (Stripe/Twilio core deps), Technical Architecture]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Design System Foundation, shadcn/ui configuration]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

### Completion Notes List

- Ran `supabase init` — created `supabase/config.toml`, `supabase/migrations/`, `supabase/seed.sql`
- Renamed `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` → `NEXT_PUBLIC_SUPABASE_ANON_KEY` across 4 source files + `.env.example` to match architecture spec and `.env.schema`
- `@varlock/nextjs-integration` already installed; `varlock scan` passes
- CI workflow already existed; updated to use `npm run type-check` script instead of direct `npx tsc --noEmit`
- Added `type-check` script to `package.json`
- Created full architectural directory structure with `.gitkeep` files for 13 directories
- Created `lib/types/database.ts` and `lib/types/domain.ts` placeholder files
- Updated `.gitignore` with `supabase/.branches/` and `.supabase/`
- All verification passes: tests (4/4), lint, type-check, build

### Change Log

- 2026-04-06: Story 1.1 implementation complete — all 5 tasks finished
- 2026-04-07: Code review fixes — ESLint .next/ ignore, supabase project_id, TWILIO_PHONE_NUMBER @sensitive

## Senior Developer Review (AI)

**Review Date:** 2026-04-07
**Review Outcome:** Approve (with minor fixes applied)
**Reviewers:** Blind Hunter, Edge Case Hunter, Acceptance Auditor (3 parallel layers)

### Action Items

- [x] P1: Add `.next/` to ESLint ignores in `eslint.config.mjs` — lint was failing with 8085 errors after build
- [x] P2: Change `project_id` in `supabase/config.toml` from worktree name to `"rentingapp"`
- [x] P3: Add `@sensitive` annotation to `TWILIO_PHONE_NUMBER` in `.env.schema`

### Deferred Items

- D1: Non-null assertions on env vars in Supabase client files (pre-existing from starter template — Varlock runtime validation covers this)

### File List

**New files:**
- supabase/config.toml (generated by `supabase init`)
- supabase/seed.sql
- supabase/migrations/.gitkeep
- lib/types/database.ts
- lib/types/domain.ts
- app/(operator)/.gitkeep
- app/(renter)/.gitkeep
- app/api/webhooks/stripe/.gitkeep
- app/api/webhooks/twilio/.gitkeep
- lib/actions/.gitkeep
- lib/schemas/.gitkeep
- lib/services/.gitkeep
- components/booking/.gitkeep
- components/listing/.gitkeep
- components/messaging/.gitkeep
- components/payment/.gitkeep
- components/shared/.gitkeep
- stores/.gitkeep

**Modified files:**
- .env.example (PUBLISHABLE_KEY → ANON_KEY)
- .gitignore (added supabase/.branches/, .supabase/)
- lib/supabase/client.ts (PUBLISHABLE_KEY → ANON_KEY)
- lib/supabase/server.ts (PUBLISHABLE_KEY → ANON_KEY)
- lib/supabase/proxy.ts (PUBLISHABLE_KEY → ANON_KEY)
- lib/utils.ts (PUBLISHABLE_KEY → ANON_KEY)
- package.json (added type-check script)
- .github/workflows/ci.yml (use npm run type-check)
- eslint.config.mjs (added .next/ to ignores)
- supabase/config.toml (project_id → rentingapp)
- .env.schema (added @sensitive to TWILIO_PHONE_NUMBER)
