# Story 1.3: Operator Registration & Login

Status: review

## Story

As an **operator**,
I want to register with email/password and log in to the platform,
so that I can securely access my rental management dashboard.

## Acceptance Criteria

1. Operator visits sign-up page, submits email + password → Supabase Auth user created with `app_metadata.role = 'operator'`
2. Row created in `profiles` table with user ID and role
3. Operator redirected to dashboard after sign-up/login
4. Registered operator can sign in with valid credentials
5. Operator can request password reset via email
6. Unauthenticated users redirected to sign-in via middleware
7. Renter users redirected from operator routes via role-based protection

## Tasks / Subtasks

- [x] Task 1: Create Supabase migration for `profiles` table and auth trigger (AC: #1, #2)
  - [x] 1.1 Create migration file `supabase/migrations/00002_profiles-and-auth.sql`
  - [x] 1.2 Define `profiles` table with columns: `id` (uuid, FK to auth.users), `role` (text, default 'operator'), `created_at` (timestamptz)
  - [x] 1.3 Create `handle_new_user()` trigger function on `auth.users` INSERT to auto-create profile row
  - [x] 1.4 Create Custom Access Token Hook function to inject `user_role` claim from `profiles` table into JWT
  - [x] 1.5 Add RLS policies on `profiles` table (users can read/update own profile)
  - [x] 1.6 Grant `supabase_auth_admin` SELECT on `profiles` for the access token hook

- [x] Task 2: Create auth Zod schemas (AC: #1, #4)
  - [x] 2.1 Create `lib/schemas/auth-schema.ts` with `signUpSchema` and `signInSchema`
  - [x] 2.2 Validate email format and password strength (min 8 chars)

- [x] Task 3: Create auth Server Actions (AC: #1, #2, #3, #4, #5)
  - [x] 3.1 Create `lib/actions/auth-actions.ts` with named exports
  - [x] 3.2 Implement `signUp` action: validate with Zod, call `supabase.auth.signUp()`, then set `app_metadata.role = 'operator'` via admin client, return `Result<T>`
  - [x] 3.3 Implement `signIn` action: validate with Zod, call `supabase.auth.signInWithPassword()`, return `Result<T>`
  - [x] 3.4 Implement `resetPassword` action: call `supabase.auth.resetPasswordForEmail()`, return `Result<T>`
  - [x] 3.5 Implement `updatePassword` action: call `supabase.auth.updateUser()`, return `Result<T>`
  - [x] 3.6 Implement `signOut` action: call `supabase.auth.signOut()`, redirect to sign-in
  - [x] 3.7 Create admin Supabase client in `lib/supabase/admin.ts` using `SUPABASE_SERVICE_ROLE_KEY` (server-only, never import from client code)

- [x] Task 4: Create root proxy-based auth + role routing (AC: #6, #7)
  - [x] 4.1 Extended existing `proxy.ts` and `lib/supabase/proxy.ts` with role-based routing (Next.js 16 uses proxy.ts, not middleware.ts)
  - [x] 4.2 `updateSession()` in `lib/supabase/proxy.ts` handles session refresh
  - [x] 4.3 Add role-based route protection: unauthenticated users → `/auth/login` for protected routes
  - [x] 4.4 Renter role users accessing `(operator)` routes → redirect away
  - [x] 4.5 Authenticated operators accessing auth pages → redirect to dashboard
  - [x] 4.6 Allow public routes: `/`, `/auth/*`, `/book/*` (renter listing pages)
  - [x] 4.7 Matcher in root `proxy.ts` excludes static assets, `_next`, API routes

- [x] Task 5: Refactor existing auth forms to use Server Actions (AC: #1, #3, #4, #5)
  - [x] 5.1 Refactor `SignUpForm` → use `signUp` server action, redirect to `/dashboard`
  - [x] 5.2 Refactor `LoginForm` → use `signIn` server action, redirect to `/dashboard`
  - [x] 5.3 Refactor `ForgotPasswordForm` → use `resetPassword` server action
  - [x] 5.4 Refactor `UpdatePasswordForm` → use `updatePassword` server action, redirect to dashboard
  - [x] 5.5 Apply Desert Sunset design tokens to all auth forms (use existing shadcn/ui components)
  - [x] 5.6 Move auth form components from `components/` to `components/auth/` per architecture

- [x] Task 6: Wire up route structure (AC: #3, #6)
  - [x] 6.1 Kept `app/auth/*` structure (works with Supabase starter, `(auth)` grouping is cosmetic)
  - [x] 6.2 Create `app/auth/callback/route.ts` for Supabase PKCE token exchange + OTP verification
  - [x] 6.3 Create `app/(operator)/dashboard/page.tsx` placeholder with sign-out action
  - [x] 6.4 `app/protected/` left in place (non-breaking, can be cleaned up in future story)

- [x] Task 7: Add `SUPABASE_SERVICE_ROLE_KEY` to environment config (AC: #1)
  - [x] 7.1 Already present in `.env.schema` from story 1-1 (sensitive: true)
  - [x] 7.2 Varlock validates at runtime

- [x] Task 8: Write tests (AC: #1–#7)
  - [x] 8.1 Create `lib/actions/auth-actions.test.ts` — test Zod validation for sign-up/sign-in schemas, test Result types returned
  - [x] 8.2 Create `lib/schemas/auth-schema.test.ts` — test email and password validation rules
  - [x] 8.3 Create `lib/supabase/proxy.test.ts` — test route classification and middleware routing decision logic

## Dev Notes

### Critical Architecture Patterns — MUST Follow

**Result types for all Server Actions:**
```typescript
import { ok, err, type Result } from '@/lib/utils/result';
// Every Server Action returns Result<T>, NEVER throws
```

**Named exports only — NEVER `export default`:**
```typescript
export function signUp(...) { }  // Correct
export default function signUp(...) { }  // WRONG
```

**File naming — kebab-case:**
- `auth-actions.ts`, `auth-schema.ts`, `auth-actions.test.ts`

**Supabase client creation — ALWAYS inside functions, NEVER module-scope:**
```typescript
// CORRECT
export async function signUp() {
  const supabase = await createClient();
}
// WRONG — causes session leakage on Vercel Fluid Compute
const supabase = await createClient();
```

**Form handling pattern:** React Hook Form + Zod for client validation, Server Actions for mutations. However, the existing starter forms use `useState` + manual handlers. This story should migrate to `useActionState` or Server Action form pattern with Zod validation on the server side. Client-side Zod validation is optional (the server action is the source of truth).

### Existing Code to Reuse (DO NOT Recreate)

| File | What It Provides | Status |
|------|-----------------|--------|
| `lib/supabase/client.ts` | Browser Supabase client | Ready — use as-is |
| `lib/supabase/server.ts` | Server Supabase client | Ready — use as-is |
| `lib/supabase/proxy.ts` | `updateSession()` for middleware | Ready — extend, don't replace |
| `lib/utils/result.ts` | `Result<T>`, `ok()`, `err()` | Ready — use for all actions |
| `components/ui/*` | shadcn/ui components (Button, Card, Input, Label) | Ready — reuse in forms |
| `app/auth/*` pages | Sign-up, login, forgot-password, update-password, error pages | Refactor — don't recreate |
| `components/sign-up-form.tsx` | Sign-up form component | Refactor to use server actions |
| `components/login-form.tsx` | Login form component | Refactor to use server actions |
| `components/forgot-password-form.tsx` | Password reset form | Refactor to use server actions |
| `components/update-password-form.tsx` | Password update form | Refactor to use server actions |

### What Does NOT Exist Yet (Must Create)

- `middleware.ts` (root) — no root middleware exists; `proxy.ts` has `updateSession()` but nothing calls it
- `profiles` table — no Supabase migrations exist (only `.gitkeep`)
- `lib/actions/auth-actions.ts` — Server Actions for auth
- `lib/schemas/auth-schema.ts` — Zod schemas for auth
- `lib/supabase/admin.ts` — Admin client for setting `app_metadata`
- `app/(auth)/auth/callback/route.ts` — PKCE token exchange handler
- Role-based routing logic in middleware
- Custom Access Token Hook SQL function

### Admin Client Pattern (Setting operator role)

`app_metadata` CANNOT be set from the client. Create a server-only admin client:

```typescript
// lib/supabase/admin.ts — NEVER import this from client components
import { createClient } from '@supabase/supabase-js';

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
```

In the sign-up server action, after `supabase.auth.signUp()` succeeds:
```typescript
const admin = createAdminClient();
await admin.auth.admin.updateUserById(user.id, {
  app_metadata: { role: 'operator' }
});
```

### Custom Access Token Hook

The database trigger creates the profile row. The Custom Access Token Hook injects `user_role` into the JWT so RLS policies can use `auth.jwt()->>'user_role'`:

```sql
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE
  claims jsonb;
  user_role text;
BEGIN
  SELECT role INTO user_role FROM public.profiles
    WHERE id = (event->>'user_id')::uuid;
  claims := event->'claims';
  IF user_role IS NOT NULL THEN
    claims := jsonb_set(claims, '{user_role}', to_jsonb(user_role));
  ELSE
    claims := jsonb_set(claims, '{user_role}', '"anonymous"');
  END IF;
  event := jsonb_set(event, '{claims}', claims);
  RETURN event;
END;
$$;
```

**Note:** The Custom Access Token Hook must be enabled in Supabase Dashboard > Authentication > Hooks after deploying the migration. This cannot be automated via migration alone — document this as a manual step.

### Middleware Route Protection Logic

```
Public routes (no auth required):
  /, /auth/*, /book/* (renter listing pages)

Operator routes (require auth + role=operator):
  /(operator)/*

Auth pages redirect if already logged in:
  /auth/login, /auth/sign-up → /(operator)/dashboard
```

The existing `proxy.ts` `updateSession()` handles session refresh. The root middleware should:
1. Call `updateSession()` to refresh the session
2. Read JWT claims via `getClaims()`
3. Apply route protection based on role

### Route Restructure

The architecture spec defines `(auth)` as a route group. Current code has `auth/` (not grouped). Decision: keep the current `app/auth/*` structure for now since it works with the Supabase starter patterns. The `(auth)` grouping is cosmetic (doesn't affect URL paths) and can be done as a refactor later. What matters is the `(operator)` routes are properly protected.

**Critical:** The `app/auth/callback/route.ts` (or equivalent) MUST exist for Supabase PKCE flow. The starter template may have this at `app/auth/confirm/route.ts` — check and create if missing.

### Project Structure Notes

Files to create/modify align with architecture spec:
```
middleware.ts                          # NEW — root middleware
lib/supabase/admin.ts                  # NEW — admin client
lib/actions/auth-actions.ts            # NEW — auth server actions
lib/actions/auth-actions.test.ts       # NEW — tests
lib/schemas/auth-schema.ts             # NEW — Zod schemas
lib/schemas/auth-schema.test.ts        # NEW — schema tests
components/auth/sign-up-form.tsx       # MOVE from components/sign-up-form.tsx
components/auth/login-form.tsx         # MOVE from components/login-form.tsx
components/auth/forgot-password-form.tsx # MOVE from components/forgot-password-form.tsx
components/auth/update-password-form.tsx # MOVE from components/update-password-form.tsx
app/(operator)/dashboard/page.tsx      # NEW — placeholder dashboard
supabase/migrations/00002_profiles-and-auth.sql  # NEW — migration
```

### Previous Story Learnings (from 1-2)

- ESLint flat config needs explicit ignores for generated files
- Varlock validates env vars at runtime — add new env vars to `.env.schema`
- All CI pipeline steps (lint, type-check, varlock scan, vitest, build) must pass
- Use existing `globals.css` Desert Sunset tokens for styling consistency
- Colocate tests next to source files

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 1, Story 1.3]
- [Source: _bmad-output/planning-artifacts/architecture.md — Authentication & Security, Implementation Patterns, Project Structure]
- [Source: _bmad-output/planning-artifacts/prd.md — FR41, Authentication Strategy]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Operator Journey, Auth Pages]
- [Source: Supabase Docs — @supabase/ssr, Custom Access Token Hook, RLS]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- Next.js 16 uses `proxy.ts` instead of `middleware.ts` — had to delete `middleware.ts` and extend existing `proxy.ts`/`lib/supabase/proxy.ts`
- Zod v4 uses `.issues` not `.errors` on `ZodError` — fixed in auth-actions and tests
- Next.js 16 `ResponseCookies` doesn't have `setAll()` method — created `copyCookies()` helper
- Dashboard page needed `<Suspense>` wrapper for async `getUser()` call (Next.js partial prerender requirement)

### Completion Notes List

- All 52 tests passing (22 new + 30 existing), zero regressions
- TypeScript type-check clean
- ESLint clean
- Next.js build succeeds with all routes properly registered
- Manual step required: Enable Custom Access Token Hook in Supabase Dashboard > Authentication > Hooks after deploying migration

### Change Log

- 2026-04-08: Story 1.3 implementation complete — operator auth with profiles, role-based routing, server actions, Zod validation

### File List

**New files:**
- `supabase/migrations/00002_profiles-and-auth.sql`
- `lib/supabase/admin.ts`
- `lib/schemas/auth-schema.ts`
- `lib/schemas/auth-schema.test.ts`
- `lib/actions/auth-actions.ts`
- `lib/actions/auth-actions.test.ts`
- `lib/supabase/proxy.test.ts`
- `components/auth/sign-up-form.tsx`
- `components/auth/login-form.tsx`
- `components/auth/forgot-password-form.tsx`
- `components/auth/update-password-form.tsx`
- `app/auth/callback/route.ts`
- `app/(operator)/layout.tsx`
- `app/(operator)/dashboard/page.tsx`

**Modified files:**
- `lib/supabase/proxy.ts` — added role-based route protection logic
- `app/auth/sign-up/page.tsx` — updated import to `components/auth/`
- `app/auth/login/page.tsx` — updated import to `components/auth/`
- `app/auth/forgot-password/page.tsx` — updated import to `components/auth/`
- `app/auth/update-password/page.tsx` — updated import to `components/auth/`
- `package.json` — added `zod` dependency
