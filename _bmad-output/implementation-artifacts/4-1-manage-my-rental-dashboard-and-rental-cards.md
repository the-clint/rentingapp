# Story 4-1: Manage-My-Rental Dashboard & Rental Cards

Status: done
Epic: 4 — Renter Self-Service (Manage-My-Rental)
Completed: 2026-04-10

## Summary

First renter-facing post-booking surface. Implements `/rentals`, the
universal manage-my-rental dashboard that authenticated renters land on
after confirming a booking (or anytime via the shareable link SMS'd by
Story 3-5). This story delivers the shell: auth gating, card list with
lifecycle-driven status badges and contextual action buttons, and route
stubs for the follow-on stories 4-2 (extend), 4-3 (cancel), 4-4 (check-in).

The lifecycle state machine is factored into a pure helper so every
downstream story can reuse it without re-implementing the date math.

## Acceptance criteria mapping

| AC                                                          | Implementation                                                                               |
|-------------------------------------------------------------|----------------------------------------------------------------------------------------------|
| Unauth visitor → OTP prompt                                 | `/rentals` server component redirects to `/rentals/verify?returnTo=/rentals`; proxy also gates it at the middleware layer. |
| Auth renter sees rental cards w/ thumbnail, name, dates, badge, actions | `RentalCard` renders `RentalCardViewModel` from `fetchRenterRentals`.               |
| Ordering: active → upcoming → past                          | `compareCards` in `renter-rentals.ts` (active/return_due bucket 0, upcoming asc 1, completed desc 2, cancelled 3). |
| Past rentals visible 45 days then removed (FR17)            | SQL `end_date >= today - 45d` cutoff + lifecycle `past_completed` filter drop.               |
| Empty state copy                                            | `RentalsEmptyState`.                                                                         |
| Single column, 480px max-width, simple header               | `app/(renter)/rentals/page.tsx` layout.                                                      |
| Lifecycle badge colors + return_due pulse                   | `BADGE_TONE_CLASSES` in `rental-card.tsx` → `motion-safe:animate-pulse` on warning tone.      |
| Contextual actions: Extend / Cancel / Check In              | `actionsAvailable` on the lifecycle → conditional render of Button → Link in `RentalCard`.   |

## Lifecycle state machine

Pure helper at `lib/services/rental-lifecycle.ts`:

| State            | Condition (given today)                                          | Badge tone   | Actions                  |
|------------------|------------------------------------------------------------------|--------------|--------------------------|
| `cancelled`      | `status === 'cancelled'`                                         | destructive  | — (view only)            |
| `past_completed` | `end_date < today − 45d` (any status)                            | muted        | — (filtered out of dash) |
| `completed`      | `status === 'completed'` AND within 45-day window; or buffer-expired confirmed | muted | — (view only)     |
| `return_due`     | `today ∈ (end_date, end_date + 5d]` AND status ∈ (confirmed,pending) | warning   | extend, check-in          |
| `active`         | `today ∈ [start_date, end_date]` AND status confirmed (last-day also offers check-in) | primary | extend (+ check-in on last day) |
| `upcoming`       | `today < start_date` AND status confirmed                        | success      | cancel                    |

## Data fetch rules (`fetchRenterRentals`)

- Admin Supabase client (we already verified the session in the page);
  the join reads anon-restricted `listings.pickup_location`.
- SQL filters: `renter_id = :uid`, `status != 'pending'`,
  `end_date >= cutoff` where cutoff = today − 45 days.
- Defense-in-depth: any row whose `renter_id` doesn't match (e.g. an
  RLS bug in a future migration) is dropped post-fetch.
- Lifecycle helper is the final authority on the 45-day window; any
  row that rolls over to `past_completed` between the SQL cutoff and
  `new Date()` is dropped here too.
- Sort: active/return_due (end_date asc) → upcoming (start_date asc)
  → completed (end_date desc) → cancelled (end_date desc).

## Auth + routing

- Proxy (`lib/supabase/proxy.ts`):
  - Added `/rentals/verify` to `PUBLIC_ROUTES`.
  - New `isRenterDashboardRoute(pathname)` classifier — matches
    `/rentals` and every sub-path EXCEPT `/rentals/verify`.
  - `isPublicRoute` excludes the dashboard routes (renter role required).
  - `updateSession` adds a renter-role gate branch for
    `isRenterDashboardRoute`: unauthenticated → `/auth/login`,
    non-renter → `/`. (A future polish could redirect unauth'd
    visitors directly to `/rentals/verify?returnTo=…` at the
    middleware layer; for now the page-level redirect handles it.)
- `/rentals/verify` reuses `RenterOtpFlow` with `listingId=""` + an
  allowlist of `returnTo` values (currently only `/rentals`). The
  unused `listingId` is safe because we always supply `returnTo`, so
  the component's `buildNextHref` fallback is never hit.
- Placeholder pages (`/rentals/[bookingId]/{cancel,extend,check-in}`)
  are async Server Components wrapped in `<Suspense>` per the Next 16
  Cache Components requirement.

## Files added

Pages / routes:
- `app/(renter)/rentals/page.tsx`
- `app/(renter)/rentals/verify/page.tsx`
- `app/(renter)/rentals/[bookingId]/cancel/page.tsx`
- `app/(renter)/rentals/[bookingId]/extend/page.tsx`
- `app/(renter)/rentals/[bookingId]/check-in/page.tsx`

Services + helpers:
- `lib/services/rental-lifecycle.ts` + `.test.ts`
- `lib/services/renter-rentals.ts` + `.test.ts`

Components:
- `components/rentals/rental-card.tsx` + `.test.tsx`
- `components/rentals/rentals-empty-state.tsx` + `.test.tsx`
- `components/rentals/rentals-list.tsx` + `.test.tsx`

Story + status:
- `_bmad-output/implementation-artifacts/4-1-manage-my-rental-dashboard-and-rental-cards.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (4-1 → done, epic-4 → in-progress)

## Files modified

- `lib/supabase/proxy.ts` — `/rentals/verify` public, `isRenterDashboardRoute` + gate branch.
- `lib/supabase/proxy.test.ts` — dashboard classifier + decision matrix cases.

## Quality gates

- `npm run test` — 57 files / 461 tests passing (includes 18 new: 15 lifecycle, 8 renter-rentals, 7 rental-card, 1 empty state, 2 list, 2 proxy dashboard classifier, 2 decision matrix additions).
- `npm run lint` — 0 errors (2 pre-existing warnings in scripts/dev-with-bws.mjs, unchanged).
- `npm run type-check` — pass.
- `npm run build` — pass; `/rentals`, `/rentals/verify`, `/rentals/[bookingId]/...` all compile and prerender.

## Out of scope (handed to follow-on stories)

- Actual Stripe hold extension (Story 4-2).
- Actual cancellation policy + refund math (Story 4-3).
- Actual check-in record + operator dashboard delivery (Story 4-4).
- SMS return reminder scheduler (Story 4-5).
- Realtime dashboard updates (nice-to-have; deliberately punted — a
  page refresh is fine for v1).

## Follow-ups / risks

- **Unauth deep link UX.** Middleware currently sends unauthenticated
  visitors to `/auth/login` for any `/rentals/*` path. Only the page
  component itself redirects to `/rentals/verify?returnTo=/rentals`.
  For deep links like `/rentals/abc/extend` an unauth renter will hit
  `/auth/login` (wrong auth surface) first. Follow-up: have the
  middleware redirect renter-dashboard routes to
  `/rentals/verify?returnTo=<path>` when there are no claims, with the
  same sanitizer pattern used by Story 3-6.
- **`RenterOtpFlow` coupling.** The component was designed around a
  `listingId` so `/rentals/verify` has to pass `""`. Story 4-2 onward
  should consider extracting a listing-agnostic variant or making
  `listingId` optional (`returnTo` already covers the navigation case).
- **Placeholder pages don't verify ownership.** The cancel/extend/
  check-in stubs render for any booking id, even one the renter doesn't
  own. 4-2/4-3/4-4 each need to add an ownership check via the admin
  client (mirror the pattern in the confirmed page) before rendering
  any real UI or executing Server Actions.
- **Last-day active → check-in.** I chose to also show "Check In" on
  the last day of an `active` rental (in addition to `return_due`),
  so a conscientious renter can return equipment before midnight
  rolls the state over. If 4-4's designers disagree, swap back by
  dropping the `todayMs === endMs` branch in `computeRentalLifecycle`.
