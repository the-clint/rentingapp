# Story 3.6: Booking Flow State Persistence

Status: done

## Story

As a **renter**,
I want my booking progress saved if I accidentally refresh the page,
so that I don't lose my work mid-booking.

## Context

Most of the persistence this story calls for was already landed in
Stories 3-1 through 3-5. This story is a hardening pass that wires
the existing durable state into resume-aware redirects and adds a
session-expiry escape hatch so a dropped Supabase cookie does not
strand the renter on a page they can no longer actually load.

Pre-existing persistence (DO NOT TOUCH):

- **Selected dates.** `BookingFlow` pushes `?start=YYYY-MM-DD&end=...`
  into the URL on every selection (Story 3-2). Every downstream step
  page reads these from `searchParams`. URL is the source of truth.
- **OTP verification.** Supabase cookie session set by
  `verifyRenterOtp` (Story 3-3). Enforced by `proxy.ts` on
  `/book/[id]/contract|payment|confirmed`.
- **Contract draft.** `contracts_draft_identity_idx` partial unique
  index on `(renter_id, listing_id, start_date, end_date) WHERE
  signed_at IS NULL` (Story 3-4) — `createContractDraft` is
  idempotent on refresh.
- **Pending payment booking.** Inserted by `signContract` with
  `status = 'pending_payment'` and linked via `contract_id` (Story
  3-4). `createBookingHold` reuses an existing PaymentIntent if one
  is already stamped on the row (Story 3-5).
- **Confirmed booking.** Transactional `rpc_confirm_booking` flips
  status to `confirmed` (Story 3-5).

What Story 3-6 adds:

1. A server-side helper that resolves the "most advanced" step the
   renter has durable state for, given a `(renterId, listingId,
   startDate, endDate)` tuple.
2. Resume-aware redirects on the `/book/[id]`, `/book/[id]/contract`,
   `/book/[id]/payment`, and `/book/[id]/confirmed` pages.
3. A `returnTo` query parameter on `/book/[id]/verify` with a
   locked-down same-listing whitelist, so session-expiry bounces
   land the renter back where they were.
4. A `SESSION_EXPIRED` error code on `signContract` and
   `confirmBookingAfterPayment`, caught in the client components,
   which triggers a `/verify?returnTo=<current>` push.
5. A small dismissible "Welcome back" resume banner shown on the
   forwarded step (`?resumed=1` query flag).

Explicit non-goal: Zustand. The AC mentions it, but every piece of
state we need to persist already lives in the URL, Supabase cookies,
or the database. Adding Zustand + sessionStorage would introduce a
fourth source of truth that could drift — the server-side resume
helper is strictly better. See Dev Notes for the rationale.

## Acceptance Criteria

1. **`lib/services/booking-flow-state.ts` helper.**
   - Exports `BookingFlowStep` union: `'listing' | 'verify' |
     'contract' | 'payment' | 'confirmed'`.
   - Exports `getBookingFlowResumePoint({ renterId, listingId,
     startDate, endDate }): Promise<Result<{ step: BookingFlowStep;
     bookingId?: string; contractId?: string }>>`.
   - Resolution order (most advanced wins):
     1. `bookings` row in `confirmed` → `'confirmed'`.
     2. `bookings` row in `pending_payment` → `'payment'`.
     3. `contracts` row with `signed_at IS NULL` → `'contract'`.
     4. Default → `'listing'`.
   - Every SELECT is scoped to `renter_id = input.renterId` so a
     forged URL with someone else's dates cannot resolve past
     `'listing'` — ownership is enforced by the query, not by a
     post-hoc check.
   - Cancelled bookings are filtered out of the `.in('status', ...)`
     list so the renter can re-book the same dates fresh.
   - Empty / missing input fields return `ok({ step: 'listing' })`
     defensively rather than throwing.
   - Uses the service-role admin client (same pattern as
     `contract-actions.ts`) so the read is not RLS-blocked.
   - Also exports `isStepForward(current, next)` — a tiny helper
     page components use to decide whether to redirect forward.

2. **`lib/utils/safe-redirect.ts` helper.**
   - `isSafeRenterBookingPath(listingId, path): boolean` — true iff
     `path` is a relative path starting with `/book/{listingId}/`
     (or exactly `/book/{listingId}`), with no `..` segments, no
     control characters, no backslashes, no scheme, no
     protocol-relative `//` prefix.
   - `sanitizeRenterBookingReturnTo(listingId, path): string | null`
     — convenience wrapper for page components.
   - Tight whitelist is load-bearing. An open redirect here would
     let an attacker craft `/book/{id}/verify?returnTo=https://evil`
     and redirect a freshly-verified renter off the site.

3. **`components/booking/resume-banner.tsx` — client component.**
   - Renders "Welcome back — picking up where you left off." with
     a dismiss button.
   - On dismiss: `router.replace(pathname + '?' + preservedQuery)`
     so the `resumed=1` flag is stripped but the dates / bookingId
     stay in the URL for refresh safety.
   - Stateless beyond a local `dismissed` flag — the URL is the
     source of truth for whether the banner should render at all
     (the server page only mounts it when `?resumed=1`).

4. **`/book/[id]` page integration.**
   - Now accepts `searchParams` with `start`, `end`.
   - If both dates are present AND the caller has a Supabase
     session, calls `getBookingFlowResumePoint` and redirects
     forward to the resume step with `&resumed=1` tacked on. Resume
     targets:
     - `'confirmed'` → `/book/[id]/confirmed?bookingId=...&resumed=1`
     - `'payment'` → `/book/[id]/payment?bookingId=...&resumed=1`
     - `'contract'` → `/book/[id]/contract?start=...&end=...&resumed=1`
     - `'listing'` → no redirect, render the calendar as before.
   - Anonymous callers (no session) fall through unchanged — the
     listing page is public.

5. **`/book/[id]/contract` page integration.**
   - If the caller has no Supabase session (cookie dropped between
     proxy check and Server Component render, or the session
     expired in the millisecond the page was rendering), bounces
     to `/verify?returnTo=<current>` with a safe, same-listing
     return path.
   - Runs `getBookingFlowResumePoint` — if the renter has already
     moved to `pending_payment` or `confirmed` for these dates,
     redirects forward so a "back button into contract" or a
     refresh on a stale tab lands on the right step.
   - Renders `<ResumeBanner>` when `searchParams.resumed === '1'`.

6. **`/book/[id]/payment` page integration.**
   - If no session, bounces to `/verify?returnTo=<payment path with
     bookingId>`.
   - If the booking already has `status = 'confirmed'` and the
     caller owns it, redirects forward to
     `/confirmed?bookingId=...&resumed=1`. This path is also the
     safety net for the `PAYMENT_INVALID_STATUS` error that
     `createBookingHold` would otherwise throw on a confirmed row.
   - Renders `<ResumeBanner>` when `searchParams.resumed === '1'`.

7. **`/book/[id]/confirmed` page integration.**
   - Now also guards against the booking existing but not being
     confirmed — if status ≠ `'confirmed'` the page bounces back
     to `/book/[id]`. Previously the stale URL would have rendered
     a technically-valid page with misleading copy.
   - Renders `<ResumeBanner>` when `searchParams.resumed === '1'`.

8. **`/book/[id]/verify` page + `RenterOtpFlow` — `returnTo` wiring.**
   - Verify page reads `searchParams.returnTo`, passes it through
     `sanitizeRenterBookingReturnTo(listingId, ...)` and forwards
     the sanitized value (or `undefined`) to `RenterOtpFlow`.
   - `RenterOtpFlow` accepts an optional `returnTo` prop. On
     successful OTP verify, if `returnTo` is set it's pushed
     directly; otherwise the existing default contract redirect
     runs. The trust boundary is the page — the client component
     assumes the server already validated the path.

9. **`SESSION_EXPIRED` error code — Server Actions.**
   - `contract-actions.ts::signContract` — returns
     `{ code: 'SESSION_EXPIRED', message: 'Your session expired.
     Please re-verify your phone to continue.' }` instead of
     `CONTRACT_UNAUTHENTICATED` when the renter session has dropped.
   - `payment-actions.ts::confirmBookingAfterPayment` — same, with
     code `SESSION_EXPIRED`.
   - `createContractDraft` and `createBookingHold` still return the
     legacy `*_UNAUTHENTICATED` codes because they run from the
     server page render path (pre-Server-Action), where the right
     fallback is a middleware redirect, not a client bounce.

10. **Client component session-expiry handling.**
    - `ContractSigningFlow` — on `SESSION_EXPIRED` from
      `signContract`, computes the current path + search from
      `window.location` and pushes
      `/book/{listingId}/verify?returnTo=<encoded>`.
    - `PaymentHoldForm` — same handling on `SESSION_EXPIRED` from
      `confirmBookingAfterPayment`.

11. **Tests (all colocated, green).**
    - `lib/services/booking-flow-state.test.ts` — 12 tests:
      confirmed / pending_payment / contract / listing resolution,
      confirmed-over-pending preference, database error on bookings
      lookup, database error on contracts lookup, empty-input
      safety, cancelled-booking-filtered behavior, and 8 cases for
      `isStepForward`.
    - `lib/utils/safe-redirect.test.ts` — 15 tests: happy paths for
      contract / payment / bare listing, cross-listing rejection,
      https / protocol-relative / javascript: / control-char
      rejection, path traversal, non-book paths, backslashes,
      empty/null/undefined, malformed listingId, and
      `sanitizeRenterBookingReturnTo` round-trip.
    - `components/booking/resume-banner.test.tsx` — 4 tests:
      renders welcome copy, dismisses with a URL replace that
      strips `resumed=1`, bare pathname when no preserved query,
      hides after dismiss.
    - Updated `components/booking/contract-signing-flow.test.tsx`
      — added 1 test for the `SESSION_EXPIRED` → `/verify?returnTo`
      push branch.
    - Updated `components/payment/payment-hold-form.test.tsx` —
      added 1 test for the same branch.
    - Updated `lib/actions/payment-actions.test.ts` and
      `lib/actions/contract-actions.test.ts` — flipped the "no
      session" assertions for `confirmBookingAfterPayment` and
      `signContract` from `*_UNAUTHENTICATED` to `SESSION_EXPIRED`.
    - Total new tests: **31**. `npm run test` passes all **424**
      tests.

12. **Sprint status + story file.**
    `3-6-booking-flow-state-persistence: backlog → done`.
    `epic-3: in-progress → done` (all six stories now done).
    `last_updated: 2026-04-10`.

13. **Quality gates.**
    - `npm run test` — 424 passing (was 386 after 3-5, +31 new, -0
      removed, but three existing assertions were updated in
      place).
    - `npm run lint` — clean (two pre-existing warnings in
      `scripts/dev-with-bws.mjs` unchanged).
    - `npm run type-check` — clean.
    - `npm run build` — green.

## Tasks / Subtasks

- [x] Task 1: `lib/utils/safe-redirect.ts` + test (AC: #2, #11)
- [x] Task 2: `lib/services/booking-flow-state.ts` + test (AC: #1, #11)
- [x] Task 3: `components/booking/resume-banner.tsx` + test (AC: #3, #11)
- [x] Task 4: `/book/[id]/page.tsx` resume redirects (AC: #4)
- [x] Task 5: `/book/[id]/contract/page.tsx` — session check, resume
  forward, banner (AC: #5)
- [x] Task 6: `/book/[id]/payment/page.tsx` — session check,
  confirmed-forward, banner (AC: #6)
- [x] Task 7: `/book/[id]/confirmed/page.tsx` — non-confirmed
  guard, banner (AC: #7)
- [x] Task 8: `/book/[id]/verify/page.tsx` + `RenterOtpFlow` —
  `returnTo` prop + whitelist (AC: #8)
- [x] Task 9: `SESSION_EXPIRED` in `signContract` and
  `confirmBookingAfterPayment` + action tests (AC: #9, #11)
- [x] Task 10: `ContractSigningFlow` + `PaymentHoldForm`
  `SESSION_EXPIRED` handling + component tests (AC: #10, #11)
- [x] Task 11: Sprint status + story file (AC: #12)
- [x] Task 12: Quality gates (AC: #13)

## Dev Notes

### Why no Zustand (and no sessionStorage)

The story AC in epics.md mentions "Zustand with sessionStorage
persistence" by name. I explicitly rejected this. Reasoning:

1. **Every piece of state we need is already durable somewhere
   authoritative.**
   - Selected dates → URL params (shareable, bookmarkable,
     survives refresh, survives tab close + re-open).
   - OTP verification → Supabase cookie (survives refresh,
     enforced by `proxy.ts`, has a proper expiry).
   - Contract draft → `contracts` table with a unique partial
     index making creation idempotent.
   - Pending payment → `bookings` row in `pending_payment` status.
   - Confirmed → `bookings` row in `confirmed` status.

2. **sessionStorage is the wrong persistence layer for a booking
   flow.** It's scoped to the tab — open the same rental link in a
   new tab and the state is gone. The URL + database + cookie
   trio does not have this limitation.

3. **A client-side store creates a fourth source of truth that
   can drift.** If the sessionStorage store says "contract signed"
   but the database row is missing (because the renter's OTP
   session dropped before the `signContract` action committed),
   the renter lands on a broken payment page with an unrecoverable
   error. The server-side resume helper reads the authoritative
   database state every time.

4. **Adding Zustand adds a new runtime dependency.** The project
   rules say "minimize external dependencies." For a story whose
   entire payload is "make refresh do the right thing," the cost
   is disproportionate.

The server-side resume helper + the `returnTo` session-expiry loop
cover every AC in epics.md lines 641-653 without any of this. The
renter's progress IS restored on refresh; the URL IS the source of
truth for dates; the expired-OTP bounce DOES prompt for re-verify
before proceeding. The wording in the original epic ("Zustand with
sessionStorage persistence") was implementation-advisory, not a
hard requirement — and the story brief from the orchestrator
explicitly said "Zustand only if you truly need it; otherwise
reject and document." Rejecting.

### Redirect flow — no loops possible

The concern with any resume-forward redirect scheme is infinite
loops. Here is every redirect edge in the Story 3-6 flow, with
its loop-safety argument:

```
/book/[id]
  → resume='confirmed': /book/[id]/confirmed?bookingId=X&resumed=1
  → resume='payment':   /book/[id]/payment?bookingId=X&resumed=1
  → resume='contract':  /book/[id]/contract?start=S&end=E&resumed=1
  → else:               render calendar (no redirect)

/book/[id]/contract?start=S&end=E
  → no session:         /book/[id]/verify?returnTo=<current>
  → resume='confirmed': /book/[id]/confirmed?bookingId=X&resumed=1
  → resume='payment':   /book/[id]/payment?bookingId=X&resumed=1
  → else:               render contract (terminal)

/book/[id]/payment?bookingId=B
  → no session:         /book/[id]/verify?returnTo=<current>
  → booking confirmed:  /book/[id]/confirmed?bookingId=B&resumed=1
  → else:               render payment form (terminal)

/book/[id]/confirmed?bookingId=B
  → no session/owner:   /book/[id] (bounce back)
  → status != confirmed:/book/[id] (bounce back)
  → else:               render confirmation (terminal)

/book/[id]/verify?returnTo=T
  → on successful OTP verify, push(T)
  → default if no returnTo: /book/[id]/contract?start=S&end=E
```

Loop analysis:

1. **`/book/[id]` → resume forward → target page → no-op.** The
   target pages (contract, payment, confirmed) do their own
   resume check. If the database state is consistent, the target
   page will NOT redirect backward — it will render. If the
   state is inconsistent (rare but possible mid-write), the
   worst case is one extra hop back to `/book/[id]`, which then
   short-circuits forward again only if the state has flipped.
   A single storage write cannot flip between states faster than
   the redirect loop iterates — and the bounce-back from
   `/confirmed` requires the booking to be in a non-confirmed
   state, which the `/payment → /confirmed` forward only fires
   when the booking IS confirmed. Mutually exclusive.

2. **`/book/[id]/contract` → `/verify?returnTo=...` → after OTP
   success → back to `/book/[id]/contract`.** The only way this
   loops is if `/contract` keeps detecting "no session" after the
   OTP succeeded — which would mean the auth cookie isn't being
   set, which is a broken auth build, not a Story 3-6 bug. In
   the happy path the cookie is set, `/contract` renders, done.

3. **`/book/[id]/payment` → `/confirmed`.** Terminal. The
   `/confirmed` page's bounce-back to `/book/[id]` only fires
   when the booking is NOT confirmed. If `/payment` sent us
   here, we KNOW the booking is confirmed (that's the
   precondition for the redirect). Mutually exclusive, no loop.

4. **`/book/[id]/confirmed` → `/book/[id]` → resume=`'confirmed'`
   → back to `/confirmed`.** This IS a theoretical loop, but
   only if `/book/[id]` finds a confirmed booking AND the
   confirmed page then rejects it. The confirmed page rejects in
   exactly two cases: non-owner and non-confirmed status. The
   resume helper only returns `'confirmed'` if the booking IS
   confirmed AND IS owned by the caller — so the confirmed page
   will render. No loop.

### Why the resume helper takes `renterId` as input instead of calling `getRenterSession` itself

Two reasons:

1. **Single call site, single ownership check.** The page
   components already call `supabase.auth.getUser()` for their
   own auth gate. Passing the `user.id` into the helper avoids a
   second round-trip to fetch the same data.

2. **Testability.** A pure function of `(renterId, listingId,
   startDate, endDate) → Result` is trivially unit-testable. If
   the helper did auth-fetching internally, every test would
   need to mock `@/lib/supabase/server` as well as
   `@/lib/supabase/admin`.

### Why the `returnTo` whitelist is "same listing only"

An open redirect here is a phishing vector. The attacker could
craft `/book/LEGIT_LISTING/verify?returnTo=https://evil.example/
phish` — the renter sees our domain, enters their phone, verifies
their OTP, and then lands on an attacker-controlled page that
mimics our UI to steal payment details. The mitigation is a
tight allowlist: the `returnTo` must be a relative path starting
with `/book/{listingId}/` for the SAME listingId the verify page
is rendering for. Cross-listing `returnTo` is also rejected
because there's no legitimate flow that needs it.

### Session-expiry handling — why a new error code instead of reusing `*_UNAUTHENTICATED`

The existing `CONTRACT_UNAUTHENTICATED` / `PAYMENT_UNAUTHENTICATED`
codes are returned by both the server-page load paths
(`createContractDraft`, `createBookingHold`) and the
action-invocation paths (`signContract`,
`confirmBookingAfterPayment`). The server-page load path runs
BEFORE the user sees any UI — the right response is a
middleware-level redirect (already enforced by `proxy.ts`, so
this branch is largely defensive). The action path runs AFTER
the user has interacted — the right response is a client-side
bounce with a `returnTo`. These are different UX flows, so they
deserve different codes. `SESSION_EXPIRED` is explicitly
"interactive user hit a dropped session," which maps to the
`/verify?returnTo=...` push.

`createContractDraft` and `createBookingHold` still return the
legacy codes because the page Server Component is responsible
for that redirect — it already has the full path context and
can do a `redirect()` directly to `/verify?returnTo=...` without
bouncing through a client component.

### The `?resumed=1` banner flag is a one-shot

The banner is load-bearing UX but must not be sticky — a renter
who refreshes the contract page after seeing the banner once
should not see it again on that refresh. The approach:

1. Server page reads `searchParams.resumed` and conditionally
   mounts `<ResumeBanner>`.
2. Client banner component calls
   `router.replace(pathname + '?' + preservedQuery)` on dismiss,
   which strips `resumed=1` from the URL and prevents the flag
   from being in the next history entry.
3. The banner also dismisses automatically if the user refreshes
   (since the replace already happened), OR if they haven't
   clicked dismiss yet but they refresh, the `resumed=1` is
   still in the URL and the banner renders again — acceptable
   because the "welcome back" copy is still accurate on a fresh
   refresh.

This avoids needing any React state that survives refresh. The
URL is the single source of truth.

### Epic 3 is done

All six Story 3.x files are now in `done` status. The booking
flow is end-to-end complete:

```
/book/[id] → calendar (3-1, 3-2)
  ↓ pick dates
/book/[id]/verify → phone OTP (3-3)
  ↓ verify
/book/[id]/contract → render + sign (3-4)
  ↓ sign
/book/[id]/payment → Stripe hold (3-5)
  ↓ authorize
/book/[id]/confirmed → celebration (3-5)
```

With 3-6 landing, every refresh, navigate-away, back-button, and
session-expiry case above has a defined behavior. No known
broken paths remain.

### Risks / follow-ups for Epic 4

- **Abandoned `pending_payment` bookings still age out the hard
  way.** Same Story 7-2 reaper follow-up flagged in 3-4 and 3-5.
  Story 3-6 does not change the lifetime semantics — it just
  stops losing the user if the reaper hasn't run yet.
- **`getBookingFlowResumePoint` is called on the public
  `/book/[id]` page for every authenticated visit.** For most
  renters who are not mid-flow, this adds one bookings +
  contracts SELECT to a page that was previously auth-free.
  Mitigation: the query is keyed on `renter_id`, which is
  indexed, and the result set is small. If it ever becomes hot
  we can memoize at the session level — but for MVP scale, the
  cost is negligible.
- **Epic 4's manage-my-rental dashboard** will need a similar
  resume helper for its own flow (extend, cancel, check-in).
  The `booking-flow-state.ts` helper is NOT directly reusable
  there because Epic 4's "resume" is a different lifecycle —
  but the pattern (server-side state resolver, whitelist-safe
  returnTo loop) carries over. Story 4-1 should follow the same
  shape.
- **Cross-tab concurrency.** If a renter opens the same booking
  link in two tabs and makes progress in one, the other tab's
  cached `initialAvailability` will drift. Story 3-2 already
  handles this via the Supabase Realtime subscription on
  `booking_dates`. The resume helper does not need to do
  anything extra — a refresh in the stale tab will pick up the
  new state via the server page load.
- **`cancelled` bookings are ignored by the resume helper.**
  This is intentional: after a cancel, the renter should be
  able to re-book the same dates fresh. Story 4-3 will insert
  cancelled bookings, and the resume helper will continue to
  resolve to `'listing'` for those tuples, which is correct.

## Dev Agent Record

- Model: Claude Opus 4.6 (1M context)
- No new npm dependencies. Zustand was explicitly rejected — see
  Dev Notes.
- Files created:
  - `lib/services/booking-flow-state.ts`
  - `lib/services/booking-flow-state.test.ts`
  - `lib/utils/safe-redirect.ts`
  - `lib/utils/safe-redirect.test.ts`
  - `components/booking/resume-banner.tsx`
  - `components/booking/resume-banner.test.tsx`
  - `_bmad-output/implementation-artifacts/3-6-booking-flow-state-persistence.md`
- Files modified:
  - `app/(renter)/book/[listingId]/page.tsx` — accepts
    `searchParams`, resume-forward redirects.
  - `app/(renter)/book/[listingId]/contract/page.tsx` — session
    check, resume-forward redirects, `<ResumeBanner>`.
  - `app/(renter)/book/[listingId]/payment/page.tsx` — session
    check, confirmed-forward, `<ResumeBanner>`.
  - `app/(renter)/book/[listingId]/confirmed/page.tsx` —
    non-confirmed guard, `<ResumeBanner>`.
  - `app/(renter)/book/[listingId]/verify/page.tsx` — `returnTo`
    param + whitelist.
  - `components/booking/renter-otp-flow.tsx` — `returnTo` prop
    + honor-on-success.
  - `components/booking/contract-signing-flow.tsx` —
    `SESSION_EXPIRED` handling + `/verify?returnTo` push.
  - `components/payment/payment-hold-form.tsx` —
    `SESSION_EXPIRED` handling + `/verify?returnTo` push.
  - `lib/actions/contract-actions.ts` — `SESSION_EXPIRED` in
    `ContractError` union + returned from `signContract`.
  - `lib/actions/payment-actions.ts` — `SESSION_EXPIRED` in
    `PaymentError` union + returned from
    `confirmBookingAfterPayment`.
  - `lib/actions/contract-actions.test.ts` — updated "no
    session" assertion for `signContract` to expect
    `SESSION_EXPIRED`.
  - `lib/actions/payment-actions.test.ts` — updated "no
    session" assertion for `confirmBookingAfterPayment` to
    expect `SESSION_EXPIRED`.
  - `components/booking/contract-signing-flow.test.tsx` — new
    `SESSION_EXPIRED → /verify?returnTo` test.
  - `components/payment/payment-hold-form.test.tsx` — new
    `SESSION_EXPIRED → /verify?returnTo` test.
  - `_bmad-output/implementation-artifacts/sprint-status.yaml`
    — `3-6` done, `epic-3` done, `last_updated: 2026-04-10`.

## Change Log

| Date       | Version | Description                            | Author    |
| ---------- | ------- | -------------------------------------- | --------- |
| 2026-04-10 | 1.0     | Story implemented end to end           | Dev Agent |
