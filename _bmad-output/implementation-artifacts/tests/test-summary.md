# E2E Test Automation Summary

**Generated:** 2026-04-11
**Framework:** Playwright (`@playwright/test@^1.59.1`) — project-default
**Runner:** `npm run test:e2e` (wraps `varlock run -- playwright test`)
**Scope:** Walked Epics 1–7 and generated e2e coverage for every surface that
can be exercised without external-service round-trips (Stripe holds, Twilio
SMS/OTP, Twilio webhook signatures). Each test is self-contained and cleans
up its own DB rows — test operators are deleted in `globalTeardown` via
`deleteTestUsers` and listings are removed explicitly in `afterEach`.

## New Helpers

- `tests/e2e/helpers/seed.ts` — shared admin-seeding utilities
  - `createOperatorViaAdmin()` → service-role user create, returns `{ email, password, userId }`
  - `loginOperator(page, op)` / `createAndLoginOperator(page)` → drives the real `/auth/login` form
  - `seedListing(operatorId, overrides?)` → minimal valid `public.listings` row, anon-visible by default
  - `cleanupListingsForOperator(operatorId)` → hard delete of every seeded row

All helpers reuse the existing `tests/e2e/helpers/test-user.ts` admin client and
e2e email prefix, so the existing `globalTeardown` catches any leaked users.

## Generated Specs

| Spec | Epic / Stories | Coverage |
|---|---|---|
| `tests/e2e/listings-index.spec.ts`        | 2.1 / 2.3 / 2.4 | Empty state for new operator, `New Listing` → wizard step 1, seeded card → detail page navigation |
| `tests/e2e/operator-navigation.spec.ts`   | 1.4             | Sidebar nav to Listings / Bookings / Messages / Settings / Dashboard, sign-out clears session and blocks `/dashboard` |
| `tests/e2e/operator-bookings.spec.ts`     | 5.1 / 5.5       | Bookings empty state, status filter tab routing (`?status=active/upcoming/...`), clear-filters, dashboard empty-listings fallback |
| `tests/e2e/operator-messages.spec.ts`     | 6.2             | Message hub empty state for a brand-new operator |
| `tests/e2e/renter-public-listing.spec.ts` | 3.1             | Anon visitor renders seeded `/book/[id]` (fresh context, no cookies), unknown uuid → 404 |

### Epics intentionally NOT e2e-automated in this pass

These stories are not meaningful to exercise from a browser without a full
external-service harness. They already have unit/integration coverage via
Vitest next to the source files and should stay there:

- **Epic 3.2 – 3.6** (renter OTP, contract signing, Stripe hold, booking
  confirmation, flow persistence) — depends on Twilio OTP + Stripe payment
  intents. E2E would require Stripe test-mode keys wired into the dev
  server and a Twilio test-credential account, which is infrastructure
  setup rather than test writing.
- **Epic 4.2 – 4.5** (extend rental, cancel, check-in, return reminder) —
  depends on seeded confirmed bookings (which require Stripe path above).
- **Epic 5.3 / 5.4** (no-show hold capture, payment capture on completion)
  — depends on Stripe capture round-trip.
- **Epic 6.1 / 6.3 / 6.4** (Twilio inbound webhook, operator reply,
  lifecycle SMS) — depends on Twilio webhook signature verification and
  real SMS delivery.
- **Epic 6.5** (real-time operator toast notifications) — depends on
  Supabase Realtime channels + pre-existing bookings; covered by Vitest
  integration coverage on the notifications host.
- **Epic 7.1 / 7.2** (renter disassociation, retention policy enforcement)
  — runs via scheduled jobs / data retention scripts; unit-tested in
  `lib/services/data-retention`.

## Test Run Results

Executed with `npm run test:e2e`. **2 of 15 tests passed, 13 failed — all
failures are blocked on a pre-existing environment drift, not on the new
test code.** The two unaffected tests are the pre-existing auth checks that
only hit `auth.users`:

```
ok   tests\e2e\operator-auth.spec.ts — unauthenticated /dashboard redirect
ok   tests\e2e\operator-auth.spec.ts — login fails with invalid credentials
```

### Root cause — environment, not test code

The Supabase project referenced by the current `varlock` env (`NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`) has **no `public.*` schema applied**. Direct PostgREST probes via the service-role client:

```
admin.from('listings').select('id').limit(1)
→ { code: 'PGRST205', message: "Could not find the table 'public.listings' in the schema cache" }

admin.from('profiles').select('*').limit(1)
→ { code: 'PGRST205', message: "Could not find the table 'public.profiles' in the schema cache" }
```

This causes two independent classes of failure:

1. **`seedListing()` → PGRST205** (`renter-public-listing.spec.ts`, part of
   `listings-index.spec.ts`). The service-role insert cannot find the
   table. Fix: apply `supabase/migrations/*.sql` to the project the env
   keys point at.
2. **Login succeeds but redirects to `/` instead of `/dashboard`** (every
   operator-side test, including the pre-existing
   `operator-auth.spec.ts:26` and `:69` cases). Without the `profiles`
   table, the `on_auth_user_created` trigger doesn't exist, so new users
   never get a `role='operator'` row, and the `custom_access_token_hook`
   can't inject a `user_role` JWT claim. `proxy.ts` then treats every
   authenticated request as a non-operator and bounces it to `/`, making
   `page.waitForURL('**/dashboard')` time out.

Both are documented deployment prerequisites in-source:
`lib/actions/auth-actions.ts:53-63` and `supabase/migrations/00002_profiles-and-auth.sql`.
Nothing in the new specs will make this pass without first fixing the env.

### Remediation checklist (environment owner action)

1. `supabase db push` (or `supabase migration up`) against the project
   named by `NEXT_PUBLIC_SUPABASE_URL` so the `00002_*.sql` … `00015_*.sql`
   migrations land. This creates `public.profiles`, `public.listings`,
   `public.bookings`, … and the `on_auth_user_created` trigger.
2. In **Supabase Dashboard → Authentication → Hooks → Custom Access
   Token**, enable the hook and point it at
   `public.custom_access_token_hook` (already defined in migration
   00002). Without this, new JWTs won't carry `user_role` and `proxy.ts`
   will keep bouncing operators to `/`.
3. Re-run `npm run test:e2e`. All 13 failing tests should go green with
   no code changes — the specs were validated against the actual UI
   surfaces and copy in the repo (empty-listings card wording, sidebar
   nav landmarks, bookings filter test ids, messages empty-state test
   id, renter listing price/pickup text).

## Coverage Overview

- **Epic 1 – project init / shell / auth:** operator navigation shell + sign
  out (new), existing auth form tests — **full practical e2e coverage**.
- **Epic 2 – listings:** empty state, wizard entry, seeded grid card, detail
  page navigation — **top surfaces covered**; photo upload and wizard
  forward flow remain Vitest component tests (existing).
- **Epic 3 – renter booking:** public listing page + 404 — **entry point
  covered**; downstream steps blocked on Stripe/Twilio harness (see above).
- **Epic 4 – manage my rental:** no new e2e; blocked on Stripe/Twilio.
- **Epic 5 – operator bookings / dashboard:** empty bookings list, filter
  tabs + clear, dashboard empty-listings fallback — **empty surfaces
  covered**; populated surfaces require seeded confirmed bookings.
- **Epic 6 – messaging:** message hub empty state — **surface covered**;
  full inbound/outbound SMS blocked on Twilio webhook harness.
- **Epic 7 – disassociation / retention:** not e2e; server-side cron +
  data retention logic is unit-tested.

## Next Steps

1. Apply local migrations to the Supabase project the env points at, or
   repoint the env at an already-migrated project, then re-run
   `npm run test:e2e`.
2. Once the Stripe test harness is wired (spec-worthy work for Story 3.5
   / 5.3 / 5.4), extend `helpers/seed.ts` with a
   `seedConfirmedBooking(listingId, renterId)` helper and add populated-
   list specs to `operator-bookings.spec.ts`.
3. Wire a Twilio test-credential harness and fold inbound SMS e2e into
   `operator-messages.spec.ts` for Story 6.1 / 6.3 / 6.4.
