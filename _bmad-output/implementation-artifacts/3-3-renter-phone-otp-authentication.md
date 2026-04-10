# Story 3.3: Renter Phone OTP Authentication

Status: done

## Story

As a **renter**,
I want to verify my identity with my phone number and a text code,
so that I can proceed to book securely without creating an account.

## Acceptance Criteria

1. **Phone entry screen.** `/book/[listingId]/verify` is a public route that
   renders a phone input pre-filled with `+1`, uses `inputmode="tel"` and
   auto-formats as `(801) 555-1234`. The "Send Code" button is disabled until
   `toE164US(raw)` returns a non-null string (10 digits, or 11 digits with a
   leading 1). A step progress indicator shows `Dates → **Verify** →
   Contract → Payment → Confirmed` with "Verify" as the current step. The
   selected `start` / `end` date params from the previous step are carried
   through the URL so the post-verify redirect can resume the booking flow.

2. **Rate-limited `requestRenterOtp` Server Action.** Validates + normalizes
   the phone to E.164 via `requestOtpSchema`. Queries `public.otp_attempts`
   (bypassing RLS via the service-role admin client) for any row on that
   phone in the last 60 seconds. If a row is found, returns
   `err("OTP_RATE_LIMITED", "Please wait 60 seconds before requesting
   another code.")`. Otherwise calls `supabase.auth.signInWithOtp({ phone })`
   and inserts an audit row into `otp_attempts`. Error paths:
   - Schema failure → `OTP_INVALID_PHONE`.
   - Supabase send error → `OTP_SEND_FAILED`.
   - Rate-limit probe error → `OTP_SEND_FAILED`.

3. **`verifyRenterOtp` Server Action.** Validates phone + 6-digit code via
   `verifyOtpSchema`, calls `supabase.auth.verifyOtp({ phone, token, type:
   "sms" })`, and on success stamps `app_metadata.role = 'renter'` on the
   auth.users record via the admin client (skipped if already set). Returns
   `ok({ userId })` on success, `OTP_INVALID_CODE` on a bad code,
   `OTP_VERIFY_FAILED` on missing user, `OTP_INVALID_INPUT` on schema failure.

4. **`otp_attempts` table (migration 00006).** `id uuid pk`, `phone text
   NOT NULL`, `created_at timestamptz NOT NULL DEFAULT now()`, `ip text`
   (nullable). Index `otp_attempts_phone_created_at_idx` on
   `(phone, created_at DESC)` for the rate-limit lookup. RLS is enabled but
   no policies exist for anon / authenticated — the table is only accessible
   to the service role (which bypasses RLS). `REVOKE ALL ... FROM anon,
   authenticated, public` makes the lockdown explicit.

5. **Custom access token hook propagates `role = 'renter'` for phone users.**
   Migration 00006 replaces the hook defined in 00002 with a new version
   that (a) reads `auth.users.phone` and `auth.users.email`, and (b) sets
   `user_role = 'renter'` whenever `phone IS NOT NULL AND email IS NULL`,
   regardless of what `public.profiles.role` says. Operators (email auth)
   keep getting their role from `profiles.role` as before. The
   `handle_new_user` trigger is not modified — it still inserts a
   `profiles` row for every new auth.users row, but for phone users that
   row is effectively ignored by the hook.

6. **OTP entry screen.** 6 individual `<input>` boxes with `inputmode="numeric"`
   and `autocomplete="one-time-code"`. Auto-advances focus on each digit,
   auto-submits the form when the 6th digit is entered (no separate "Verify"
   button). Paste of a 6-digit string in any box distributes the digits and
   auto-submits. Backspace moves focus back when the current box is empty.
   A 5-minute countdown timer displays `m:ss`. The "Resend code" link is
   disabled until 30 seconds have elapsed since the last send.

7. **Error path: shake + clear + refocus.** On a failed verify, the boxes
   row briefly gets the `animate-otp-shake` class (defined in `globals.css`
   as a 400ms horizontal shake with `prefers-reduced-motion` respected),
   the borders turn `destructive`, the error message "Invalid code, try
   again" renders below, and the boxes clear + refocus the first box.

8. **Success path: flash + navigate.** On a successful verify, the boxes
   flash `success` color briefly, then `router.push('/book/[listingId]/
   contract?start=...&end=...')`. The contract page is a new placeholder
   added by this story (Story 3-4 replaces the body).

9. **Proxy gate.** `lib/supabase/proxy.ts` is updated so:
   - `/book/[id]` and `/book/[id]/verify` remain public.
   - `/book/[id]/contract`, `/book/[id]/payment`, and
     `/book/[id]/confirmed` are renter-only (`user_role === 'renter'` in
     the JWT). Unauthenticated visitors get redirected to `/auth/login`;
     operators or any other role get redirected to `/`.
   - A new `isRenterProtectedBookingRoute(pathname)` helper is exported so
     `proxy.test.ts` can directly assert the matcher behavior.

10. **Wire the sticky bar CTA.** `components/booking/booking-flow.tsx`
    passes a concrete `onBookNow` to `BookingStickyBar` that calls
    `router.push('/book/{listingId}/verify?start=...&end=...')`. It is
    only armed when both start and end dates are selected (the sticky bar
    already disables the button in that state).

11. **Quality gates.** `npm run test`, `npm run lint`, `npm run type-check`
    all green. `npm run build` is environment-dependent on
    `BWS_SECRETS_TOKEN` (varlock); per precedent (Story 3-2), it is
    attempted and any failures that trace solely to the missing token are
    documented.

12. **Tests** (all colocated and green):
    - `lib/schemas/renter-auth-schema.test.ts` — strip, normalize,
      progressive format, phone schema, OTP schema, request/verify
      composite schemas.
    - `lib/actions/renter-auth-actions.test.ts` — invalid phone, rate
      limited, happy path send, Supabase send failure, rate-limit probe
      error, verify happy path + metadata stamp, verify skip when already
      stamped, verify invalid code, verify invalid input.
    - `components/booking/booking-step-indicator.test.tsx` — rendering,
      current-step aria, complete/pending data-state.
    - `components/booking/renter-otp-flow.test.tsx` — auto-format phone,
      disable/enable send button, transition to OTP step, server error
      surface, auto-advance + auto-submit, navigation on success,
      shake/clear on failure, resend timer, countdown.
    - `lib/supabase/proxy.test.ts` — verify is public, contract/payment/
      confirmed are renter-gated, matcher helper exposed.

## Tasks / Subtasks

- [x] Task 1: Schema + helpers (AC: #1)
  - [x] 1.1 Create `lib/schemas/renter-auth-schema.ts` with
    `stripPhoneFormatting`, `toE164US`, `formatPhoneDisplay`,
    `phoneNumberSchema`, `otpCodeSchema`, `requestOtpSchema`,
    `verifyOtpSchema`.
  - [x] 1.2 Colocate `renter-auth-schema.test.ts` with exhaustive cases
    on format and validation.

- [x] Task 2: Migration 00006 (AC: #4, #5)
  - [x] 2.1 Create `supabase/migrations/00006_otp_attempts.sql` with the
    `otp_attempts` table, RLS lockdown, and revoke grants.
  - [x] 2.2 Extend the custom access token hook to read `auth.users.phone`
    / `email` and propagate `role='renter'` for phone-only users.

- [x] Task 3: Admin client + Server Actions (AC: #2, #3)
  - [x] 3.1 Create `lib/supabase/admin.ts` (service-role factory). The
    file was deleted earlier in the branch; Story 3-3 reintroduces it
    scoped only to server-side use.
  - [x] 3.2 Create `lib/actions/renter-auth-actions.ts` with
    `requestRenterOtp` and `verifyRenterOtp`, using the typed
    `RequestOtpError` / `VerifyOtpError` unions and the shared
    `Result<T>` type.
  - [x] 3.3 Colocate `renter-auth-actions.test.ts` with mocks for both
    `@/lib/supabase/admin` and `@/lib/supabase/server`.

- [x] Task 4: Step indicator (AC: #1)
  - [x] 4.1 Create `components/booking/booking-step-indicator.tsx` with
    the `BOOKING_STEPS` tuple, `BookingStep` union, and the visual
    `BookingStepIndicator` component.
  - [x] 4.2 Colocate `booking-step-indicator.test.tsx`.

- [x] Task 5: OTP flow client component (AC: #1, #6, #7, #8)
  - [x] 5.1 Create `components/booking/renter-otp-flow.tsx`. Two-step
    internal state machine (`phone` | `otp`). URL-backed start/end.
  - [x] 5.2 Phone step: auto-format, disabled-until-valid Send Code
    button, error banner surface.
  - [x] 5.3 OTP step: 6 boxes, auto-advance, auto-submit on 6th,
    backspace-moves-back, paste support, arrow-key navigation, countdown,
    resend gated to 30s, shake + clear on error.
  - [x] 5.4 Success path: router.push to contract step with preserved
    start/end query params.
  - [x] 5.5 Add `animate-otp-shake` keyframe + utility to `globals.css`
    (respects `prefers-reduced-motion`).
  - [x] 5.6 Colocate `renter-otp-flow.test.tsx` with mocks for
    `next/navigation` and `@/lib/actions/renter-auth-actions`.

- [x] Task 6: Pages + sticky bar wiring (AC: #1, #8, #10)
  - [x] 6.1 Create `app/(renter)/book/[listingId]/verify/page.tsx` as a
    Server Component that awaits `params` and `searchParams` (Next 16)
    and renders `<RenterOtpFlow />`.
  - [x] 6.2 Create `app/(renter)/book/[listingId]/contract/page.tsx` as a
    placeholder Server Component (Story 3-4 will replace the body).
  - [x] 6.3 Update `components/booking/booking-flow.tsx` so the sticky
    bar's `onBookNow` calls `router.push('/book/[listingId]/verify?
    start=...&end=...')`.

- [x] Task 7: Proxy + middleware update (AC: #9)
  - [x] 7.1 Add `RENTER_BOOKING_SUFFIXES` and
    `isRenterProtectedBookingRoute(pathname)` to `lib/supabase/proxy.ts`.
  - [x] 7.2 Update `isPublicRoute` to exclude protected booking
    sub-paths even though `/book` is in `PUBLIC_ROUTES`.
  - [x] 7.3 Update `updateSession` to redirect non-renter visitors away
    from `/book/[id]/contract|payment|confirmed`.
  - [x] 7.4 Extend `lib/supabase/proxy.test.ts` with cases for the
    matcher and the routing decision matrix.

- [x] Task 8: Sprint status + story file (AC: #11)
  - [x] 8.1 Mark `3-3-renter-phone-otp-authentication: done` in
    `sprint-status.yaml` and bump `last_updated` to 2026-04-10.
  - [x] 8.2 Write this story file.

- [x] Task 9: Quality gates
  - [x] 9.1 `npm run test`
  - [x] 9.2 `npm run lint`
  - [x] 9.3 `npm run type-check`
  - [x] 9.4 `npm run build` (attempted; `BWS_SECRETS_TOKEN` may gate it).

## Dev Notes

### Rate-limit strategy: Server Action + service role, not a SECURITY DEFINER RPC

The task guidance offered two options for enforcing the 60-second OTP
rate limit:
1. A SECURITY DEFINER `rpc_request_renter_otp(phone text)` that does the
   probe, send, and insert inside one Postgres function.
2. Do the check inside the Server Action using the admin client.

Story 3-3 goes with option 2 because:
- The Server Action already has the admin client on hand (needed to insert
  into the RLS-locked `otp_attempts` table), so the rate-limit probe is
  "free" — one extra select, no round trip to an RPC.
- SECURITY DEFINER functions are harder to unit test in isolation than a
  Server Action that mocks `@supabase/ssr`. The existing test harness for
  `auth-actions.ts` and `availability-actions.ts` uses the latter pattern
  exclusively, so staying consistent reduces onboarding friction.
- The TOCTOU race between "probe" and "insert" is not a meaningful
  attack surface at 60-second granularity: Twilio's upstream per-phone
  rate limits (documented in Supabase Auth + Twilio docs) are the real
  protection against abuse. Our check just serves the UX contract.

### Why stamp `app_metadata.role` in addition to the JWT hook

The JWT role claim comes from the custom access token hook in migration
00006, which reads `auth.users.phone` / `email` directly. That's enough
for `proxy.ts` to gate requests correctly. So why also stamp
`app_metadata.role`?

Two reasons:
1. Defense in depth. If a future refactor moves away from the custom
   access token hook (e.g., Supabase ships a native "role" field on
   phone-auth users), `app_metadata.role` is a portable shape that any
   downstream code can inspect without re-reading the token.
2. Observability. Admin queries and the Supabase dashboard both show
   `app_metadata` on user records. Having `role: 'renter'` visible there
   makes it trivial to answer "how many renters signed up this week"
   without grep-hunting through tokens.

The stamp is a no-op when the role is already set (early return in the
Server Action), so the cost is one extra `updateUserById` per unique
renter per verify event.

### Why the hook looks at `auth.users.phone IS NOT NULL AND email IS NULL`

The cleanest way to distinguish an operator from a renter at the auth
layer is "does this user have an email address?" Operators sign up via
`signUp({ email, password })`, which always populates `auth.users.email`.
Renters sign in via `signInWithOtp({ phone })`, which populates
`auth.users.phone` and leaves `email` null. So `phone IS NOT NULL AND
email IS NULL` is a robust discriminant — a future feature where
operators link a phone number won't flip them to renters because their
email is still present.

The alternative — reading `raw_user_meta_data.role` or adding a
`user_type` column — was rejected because it requires a trigger change
or schema change every time we add a new user type. The current shape
is zero-new-columns and zero-new-triggers.

### Why we keep the existing `handle_new_user` trigger

A phone-only signup still gets a `public.profiles` row inserted by the
existing trigger (with the default `role='operator'`). That row is now
effectively ignored by the hook for phone users, which looks a little
wasteful. We kept the trigger anyway because:
- Modifying it would require updating migration 00002, which is risky
  on a live DB (this app doesn't have one yet, but best practice is
  forward-only migrations).
- A stale `profiles` row with `role='operator'` that never gets read is
  cheap; the table has no indexes that care about the role value.
- Epic 4 (manage-my-rental) may decide it wants renter profile rows
  after all, at which point the trigger is already doing half the work.

A follow-up in Story 7-1 (phone disassociation) or Story 7-2 (retention)
may clean this up.

### OTP box UX micro-behaviors

The acceptance criteria mention auto-advance, auto-submit, and paste
support. A few secondary behaviors that fall out naturally:
- **Backspace moves focus back** when the current box is empty. Users
  who over-type one digit and want to correct the previous one get the
  behavior they expect.
- **Arrow keys move focus** between adjacent boxes, consistent with
  most OTP widgets.
- **Paste of a 6-digit string** spreads the digits across all six boxes
  starting from the box that received the paste (so pasting into box 0
  fills the whole field; pasting into box 3 fills 3/4/5 and leaves 0-2
  alone, matching the user's explicit intent).
- **Shake is CSS-only** and gated by `prefers-reduced-motion: reduce`.
  The JavaScript path just toggles the class for 400ms then removes it.

### Phone formatting: hand-rolled regex vs libphonenumber-js

US-only MVP. A 10-digit check + progressive format string is ~15 lines
of code; `libphonenumber-js` would add ~30kb to the bundle and solve a
problem we don't have yet. When the product ships outside the US, swap
in `libphonenumber-js` behind the existing `toE164US` / `formatPhoneDisplay`
interface and the rest of the flow keeps working.

### Verify page is public; everything after it is renter-only

The AC calls out that the verify page itself is public (an unverified
renter arriving from a classifieds link needs to be able to reach it
without an existing session). The post-verify steps — contract, payment,
confirmed — all require a renter session. The proxy gate is the single
chokepoint that enforces this, so each page doesn't need its own
auth check in the layout or page body. A renter who successfully
verifies their phone gets a Supabase session cookie; the next navigation
hits `proxy.ts`, the JWT carries `user_role='renter'` via the custom
access token hook, and the gate lets them through.

### Redirect target on verify success

We redirect with a 400ms delay to let the "success flash" visual land
on the user's eye. Any shorter and the flash is imperceptible; any
longer and the user feels the flow is sluggish. The timer is started
with `window.setTimeout` inside the happy-path branch of `submitOtp`.

### Verify page does not pre-fill based on the URL

The `start` / `end` query params are purely pass-through. The OTP flow
doesn't care about them — they exist so the post-verify redirect to
`/book/[id]/contract` can carry the renter's chosen dates forward
without re-consulting the URL. Story 3-6 will introduce a Zustand store
for booking-flow state and collapse this into a cleaner transport.

## Dev Agent Record

- Model: Claude Opus 4.6 (1M context)
- No new npm dependencies
- Files created:
  - `supabase/migrations/00006_otp_attempts.sql`
  - `lib/schemas/renter-auth-schema.ts`
  - `lib/schemas/renter-auth-schema.test.ts`
  - `lib/supabase/admin.ts` (re-introduced from the pre-branch delete)
  - `lib/actions/renter-auth-actions.ts`
  - `lib/actions/renter-auth-actions.test.ts`
  - `components/booking/booking-step-indicator.tsx`
  - `components/booking/booking-step-indicator.test.tsx`
  - `components/booking/renter-otp-flow.tsx`
  - `components/booking/renter-otp-flow.test.tsx`
  - `app/(renter)/book/[listingId]/verify/page.tsx`
  - `app/(renter)/book/[listingId]/contract/page.tsx`
- Files modified:
  - `app/globals.css` — add `@keyframes otp-shake` and `.animate-otp-shake`
    utility gated by `prefers-reduced-motion`.
  - `components/booking/booking-flow.tsx` — wire `onBookNow` to a
    `router.push` into the verify step.
  - `lib/supabase/proxy.ts` — add the `RENTER_BOOKING_SUFFIXES` matcher
    and the renter-role gate inside `updateSession`.
  - `lib/supabase/proxy.test.ts` — cover the new matcher and the new
    routing decisions.
  - `_bmad-output/implementation-artifacts/sprint-status.yaml` — mark
    story 3-3 done and bump `last_updated` to 2026-04-10.

## Follow-ups for Stories 3-4, 3-5, 4-1

- **Story 3-4 (Contract):** Replace the body of
  `app/(renter)/book/[listingId]/contract/page.tsx` with the actual
  contract summary, expand-accordion, sign button, and `contracts` table
  insert. The step indicator at the top already renders the correct
  "Contract" step and can be reused as-is.
- **Story 3-5 (Payment):** Create
  `app/(renter)/book/[listingId]/payment/page.tsx` and
  `app/(renter)/book/[listingId]/confirmed/page.tsx`. Both will be
  automatically renter-gated by `proxy.ts` because they match the
  `RENTER_BOOKING_SUFFIXES` list. Flip `bookings.renter_id` to NOT NULL
  at that point — the Story 3-2 migration left it nullable on the
  assumption Story 3-3 would land OTP auth first, which it now has.
- **Story 4-1 (Manage-my-rental):** The same phone-OTP flow will be
  used for the manage-my-rental landing page. The existing
  `requestRenterOtp` / `verifyRenterOtp` Server Actions and
  `RenterOtpFlow` component should be reusable verbatim — only the
  success redirect target needs to change. Consider parameterizing
  `RenterOtpFlow` with a `redirectTo` prop at that time.
- **Rate limit header (future):** The AC only covers per-phone rate
  limiting. When we add per-IP rate limiting (Story 7-2 retention or a
  separate abuse hardening story), the `otp_attempts.ip` column is
  already in place — populate it from the Server Action via `headers()`
  and extend the probe to include an IP bucket.
- **Custom access token hook cleanup:** Migration 00006 replaces the
  hook function body; it does NOT drop and recreate the hook entry in
  the Supabase dashboard. A human deployment step is still required.
  Document this in the deployment runbook before Epic 3 ships.
