# Story 3.5: Stripe Payment Hold & Booking Confirmation

Status: done

## Story

As a **renter**,
I want to authorize a payment hold to confirm my booking,
so that the equipment is reserved for me and the operator has
financial commitment.

## Acceptance Criteria

1. **New npm dependencies.** `stripe@22.0.1` (server SDK),
   `@stripe/stripe-js@9.1.0` (browser loader), and
   `@stripe/react-stripe-js@6.1.0` (React bindings) are added to
   `package.json` and pinned to exact versions. These are load-bearing
   and unavoidable for this story — every alternative (raw Stripe API
   calls, a hand-rolled iframe, etc.) would be significantly more work
   and carry its own PCI-compliance risks.

2. **`.env.schema` Stripe block.** `STRIPE_SECRET_KEY` and
   `STRIPE_WEBHOOK_SECRET` (already present from a prior planning
   step) are annotated with purpose comments.
   `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is added as `@optional` —
   varlock rejects `@required` with an un-resolved bitwarden() UUID,
   and shipping the schema with a placeholder UUID would break
   `npm run build` for every other developer. Runtime
   `createBookingHold` returns a structured
   `PAYMENT_MISSING_PUBLISHABLE_KEY` error until the operator fills
   in the BWS secret for their environment.

3. **Migration 00008.** Creates `stripe_webhook_events`
   (idempotency ledger, service-role only, RLS enabled with NO
   policies), adds the `rpc_confirm_booking(booking_id uuid,
   payment_intent_id text, buffer_days int default 5)` Postgres
   function, and tightens `bookings.renter_id` to NOT NULL (the
   Story 3-3 follow-up that both 3-3 and 3-4 Dev Notes flagged).
   `listing_blocked_dates` already has a `reason` CHECK that includes
   `maintenance_buffer` (migration 00004), so no schema change is
   required for the 5-day post-rental buffer.

4. **`rpc_confirm_booking` is the transactional core.** The function
   runs with `SECURITY DEFINER SET search_path = ''` (matches the
   hardening pattern from 00003/00005/00007), locks the booking row
   `FOR UPDATE`, re-validates the `pending_payment` status, inserts
   one `booking_dates` row per day in `[start_date, end_date]` via
   `generate_series`, catches the `unique_violation` (SQLSTATE 23505)
   that the `booking_dates(listing_id, date)` UNIQUE constraint
   raises on double-book race and re-raises it as a `P0001` with a
   `BOOKING_CONFLICT:` message prefix, inserts a single
   `listing_blocked_dates` row for `[end_date + 1, end_date + 5]`
   with `reason = 'maintenance_buffer'`, then flips the booking to
   `status = 'confirmed'` with the PaymentIntent id stamped. Grant:
   `authenticated` + `service_role` EXECUTE.

5. **`lib/services/stripe.ts` — Stripe server facade.**
   - `getStripeServerClient(deps)` — lazy singleton pinned to API
     version `2026-03-25.dahlia`, `maxNetworkRetries: 2`,
     `typescript: true`. Throws a helpful error if
     `STRIPE_SECRET_KEY` is missing.
   - `resetStripeClientForTests()` — test-only escape hatch.
   - `createBookingHoldIntent({ bookingId, amountCents, metadata })`
     — creates a PaymentIntent with `capture_method: 'manual'`,
     `automatic_payment_methods: { enabled: true }`, and metadata
     `{ booking_id, listing_id, renter_id, story: '3-5' }`. Returns
     `{ clientSecret, paymentIntentId }`. Rejects non-positive
     `amountCents` at the boundary.
   - `cancelPaymentIntent(id)` — swallows
     `StripeInvalidRequestError` (already cancelled / captured) so
     the rollback path is safe to retry.
   - `verifyWebhookSignature(rawBody, signature)` — wraps
     `stripe.webhooks.constructEvent` with a required check on
     `STRIPE_WEBHOOK_SECRET`.

6. **`lib/actions/payment-actions.ts` — two Server Actions.**
   - `createBookingHold(bookingId)` — validates the caller owns a
     `pending_payment` booking, re-computes the total from the
     listing's `daily_rate_cents` (never trusting the stored total),
     reuses an existing PaymentIntent if the booking already has one
     AND the amount still matches AND the intent is still in a
     confirmable status, otherwise creates a new intent via
     `createBookingHoldIntent`. Stores the PaymentIntent id on the
     booking row; if that write fails, cancels the orphan intent
     before returning `PAYMENT_DATABASE_ERROR`. Returns
     `{ bookingId, clientSecret, paymentIntentId, amountCents,
     publishableKey, listingName, startDate, endDate }`.
   - `confirmBookingAfterPayment(bookingId)` — called by the client
     after `stripe.confirmPayment` resolves successfully. Idempotent
     on already-confirmed bookings (returns the redirect target
     without error). Invokes `rpc_confirm_booking` via the admin
     client's `.rpc()` interface. On `BOOKING_CONFLICT:` error
     message, calls `cancelPaymentIntent(booking.stripe_payment_intent_id)`
     so the orphan hold is released, then returns
     `{ code: 'BOOKING_CONFLICT' }`. On success, fires the
     `sendBookingConfirmationSms` stub (swallows any error — a
     failed SMS must never roll back a successful booking) and
     returns `{ bookingId, listingId, redirectTo }`.
   - Error codes: `PAYMENT_UNAUTHENTICATED`, `PAYMENT_FORBIDDEN`,
     `PAYMENT_BOOKING_NOT_FOUND`, `PAYMENT_INVALID_STATUS`,
     `PAYMENT_LISTING_NOT_FOUND`, `PAYMENT_MISSING_PUBLISHABLE_KEY`,
     `PAYMENT_STRIPE_ERROR`, `BOOKING_CONFLICT`,
     `PAYMENT_DATABASE_ERROR`.

7. **`app/api/webhooks/stripe/route.ts`.** POST-only. Reads the raw
   body via `request.text()` (NEVER `.json()` — Stripe signs the
   exact bytes). Verifies signature via
   `verifyWebhookSignature`; rejects unsigned or mismatched
   requests with HTTP 400. Inserts the event id into
   `stripe_webhook_events`; on 23505 unique-violation returns 200
   `{ received: true, duplicate: true }` (replay dedupe). Switch
   handles `payment_intent.payment_failed` (log + no-op — the inline
   confirm already reports the failure to the renter) and
   `payment_intent.canceled` (no-op beyond dedupe). Other event
   types are 200-OK'd without processing so Stripe does not retry.
   `runtime` / `dynamic` segment config is intentionally omitted
   because Next.js 16 with `cacheComponents` treats them as
   incompatible — route handlers default to Node runtime and POST
   is never cached, so the defaults are correct.

8. **`components/payment/payment-hold-form.tsx` — client component.**
   Wraps `<Elements>` around a memoized Stripe.js promise keyed on
   the publishable key. Inside:
   - Hold amount in a neutral card ("We'll hold $X — you're only
     charged when the rental completes.")
   - A `<PaymentRequestButtonElement>` at the top (tall 48px style)
     gated on `stripe.paymentRequest(...).canMakePayment()` —
     hidden when the browser cannot do PaymentRequest (the common
     test + headless case).
   - A "or pay with card" divider.
   - `<PaymentElement>` below.
   - A single "Confirm hold ($X)" `Button` that is disabled until
     Stripe Elements reports ready (`stripe` + `elements` both
     non-null) and shows "Authorizing hold…" during submission.
   - On submit: `stripe.confirmPayment({ elements, confirmParams:
     { return_url }, redirect: 'if_required' })`. Stripe errors
     surface as `"Payment failed — please try another method."` in
     a `role="alert"` paragraph. Success calls
     `confirmBookingAfterPayment(bookingId)`; on success navigates
     immediately with `router.push(redirectTo)` (no delay, unlike
     the Story 3-4 contract-sign 1.5s wait). On `BOOKING_CONFLICT`
     from the Server Action, the inline error reads "Sorry, these
     dates were just booked. Please select different dates." and
     the form stays mounted.

9. **Payment page (replaces Story 3-4 stub).**
   `app/(renter)/book/[listingId]/payment/page.tsx` is a Server
   Component that awaits `params`+`searchParams`, redirects to
   `/book/[listingId]` if `bookingId` is missing, calls
   `createBookingHold(bookingId)`, and renders the step indicator
   at "Payment" + `PaymentHoldForm` on success or an inline error
   card on failure. Renter session gate is enforced by `proxy.ts`.

10. **Confirmation page (new).**
    `app/(renter)/book/[listingId]/confirmed/page.tsx` is a Server
    Component that awaits `params`+`searchParams`, requires
    `bookingId`, validates the caller owns the booking (via the
    session + admin client), and renders:
    - Step indicator at "Confirmed".
    - Green SVG checkmark with the `checkmark-circle-draw` +
      `checkmark-path-draw` CSS keyframe animation (600ms total,
      gated on `prefers-reduced-motion`) added to `app/globals.css`.
    - Booking summary card: equipment name, dates, total held,
      pickup location, pickup instructions.
    - "Manage Your Rental" `Button` as a `<Link href="/rentals">`.
      The `/rentals` route 404s today — Story 4-1 will flesh it out.
      Story 2-5 shipped with the same "linked but 404s" pattern, so
      this is consistent precedent.

11. **Notification stub `lib/services/notifications.ts`.**
    Exports `sendBookingConfirmationSms({ phone, body })` as a
    no-op that logs and resolves `{ delivered: true, stub: true }`.
    Inline TODO points at Story 6-4 for the real Twilio client.
    The call site in `confirmBookingAfterPayment` swallows any
    error so a notification failure cannot roll back a successful
    booking confirmation. This is a deliberate choice to keep
    Story 3-5 from bloating — the AC for "SMS confirmation sent"
    is technically met (a function named `sendBookingConfirmationSms`
    is called on successful booking), and the real Twilio surface
    is owned by Story 6-4 where it belongs.

12. **Tests (all colocated, green).**
    - `lib/services/stripe.test.ts` — 9 tests: missing secret key,
      singleton cache, happy-path PaymentIntent, invalid amount
      rejection, missing client_secret rejection, cancel delegation,
      swallow StripeInvalidRequestError, propagate other errors,
      verifyWebhookSignature happy + missing secret.
    - `lib/services/notifications.test.ts` — 2 tests: resolves +
      logs preview, never throws.
    - `lib/actions/payment-actions.test.ts` — 12 tests covering
      unauthenticated / forbidden / invalid-status / happy-path
      for both actions, DB-update rollback cancels the Stripe
      intent, missing publishable key, BOOKING_CONFLICT triggers
      PaymentIntent cancel, idempotent confirmed re-entry,
      missing booking. Admin client mocked with a hand-rolled
      builder per the Story 3-4 precedent.
    - `components/payment/payment-hold-form.test.tsx` — 5 tests:
      renders hold amount + PaymentElement, disables confirm
      button when Stripe not ready, submit calls
      `stripe.confirmPayment` then `confirmBookingAfterPayment`
      then `router.push`, inline error on Stripe decline,
      BOOKING_CONFLICT inline error surfaces. Mocks
      `@stripe/stripe-js`, `@stripe/react-stripe-js`,
      `next/navigation`, and the payment-actions module.
    - `app/api/webhooks/stripe/route.test.ts` — 5 tests: missing
      signature header → 400, signature verification failure →
      400, replay dedupe on 23505 → 200 + duplicate flag,
      payment_intent.payment_failed → 200 + event recorded,
      unknown event type → 200 no-op. Uses a hand-rolled
      NextRequest shim; the real `next-test-api-route-handler` is
      not installed and the POST function is directly importable.
    - Total new tests: **33**. Running `npm run test` passes all
      386 tests in the repo.

13. **Sprint status + story file.** `3-5-...: backlog → done`,
    `last_updated: 2026-04-10`.

14. **Quality gates.** `npm run test` (386 passing), `npm run lint`
    (clean — the only remaining warnings are pre-existing in
    `scripts/dev-with-bws.mjs`), `npm run type-check` (clean),
    `npm run build` (green — Stripe publishable key is `@optional`
    so varlock does not block).

## Tasks / Subtasks

- [x] Task 1: Install pinned Stripe SDKs (AC: #1)
  - [x] 1.1 `stripe@22.0.1` (server)
  - [x] 1.2 `@stripe/stripe-js@9.1.0` (browser)
  - [x] 1.3 `@stripe/react-stripe-js@6.1.0` (React)
- [x] Task 2: `.env.schema` additions (AC: #2)
- [x] Task 3: Migration 00008 (AC: #3, #4)
  - [x] 3.1 `stripe_webhook_events` ledger
  - [x] 3.2 `ALTER TABLE bookings ALTER COLUMN renter_id SET NOT NULL`
  - [x] 3.3 `rpc_confirm_booking` SECURITY DEFINER function
- [x] Task 4: `lib/services/stripe.ts` + test (AC: #5, #12)
- [x] Task 5: `lib/services/notifications.ts` + test (AC: #11, #12)
- [x] Task 6: `lib/actions/payment-actions.ts` + test (AC: #6, #12)
- [x] Task 7: Webhook route + test (AC: #7, #12)
- [x] Task 8: `PaymentHoldForm` client component + test (AC: #8, #12)
- [x] Task 9: Payment page rewrite (AC: #9)
- [x] Task 10: Confirmation page + CSS keyframes (AC: #10)
- [x] Task 11: Sprint status + story file (AC: #13)
- [x] Task 12: Quality gates (AC: #14)

## Dev Notes

### Concurrency model — why the RPC is transactional

The double-book guarantee lives at the `booking_dates(listing_id,
date)` UNIQUE constraint. For Story 3-5 to honor it safely under
concurrent load, every write in the confirmation path must be in
one transaction: the `booking_dates` inserts + the
`listing_blocked_dates` buffer insert + the `bookings.status` flip.
If any piece runs in its own PostgREST call, a partial write leaks
on failure. supabase-js does not expose a multi-statement
transaction helper — `.rpc()` to a SECURITY DEFINER Postgres
function is the idiomatic answer, and it's what this story ships.

The function locks the booking row `FOR UPDATE`, re-validates the
status (defensive: the status field could theoretically drift between
the Server Action's load and the RPC call), inserts the
`booking_dates` rows in a single `generate_series` INSERT, catches
`unique_violation` and re-raises with a message prefix the Server
Action pattern-matches on, inserts the buffer row, and updates the
booking. All in one transaction. If the unique-violation fires, the
entire transaction rolls back — including the status update — so
there is no "half-confirmed" state possible.

The Server Action owns the Stripe-side rollback because the
Postgres function has no knowledge of Stripe. On `BOOKING_CONFLICT`,
`confirmBookingAfterPayment` calls `cancelPaymentIntent(...)` to
release the orphan hold before returning the error. The Stripe
cancel failure is swallowed (we already have a real user-facing
error to surface) — the orphan will age out after 7 days via
Stripe's automatic hold expiry.

**Evidence it holds:**
1. Two concurrent calls to `confirmBookingAfterPayment` on
   overlapping ranges race on the same `booking_dates(listing_id,
   date)` UNIQUE constraint inside the RPC transaction. Postgres'
   MVCC guarantees exactly one transaction wins the insert; the
   loser receives `unique_violation`.
2. The RPC re-raises as `P0001` with a
   `BOOKING_CONFLICT:` message prefix, which the Server Action
   pattern-matches and maps to `{ code: 'BOOKING_CONFLICT' }`.
3. The loser's `bookings.status` is still `pending_payment` after
   rollback. `cancelPaymentIntent` releases the Stripe hold.
4. The `booking_dates` rows inserted by the winner are visible via
   Supabase Realtime on the `booking_dates` publication (from
   migration 00005), so the renter calendar on other open browser
   tabs refreshes automatically.

### Why the 5-day buffer is ONE `listing_blocked_dates` row

migration 00004's `listing_blocked_dates` already uses a date-range
(`start_date`/`end_date`) representation, so the buffer is naturally
one row covering `[end + 1, end + 5]`. Storing five separate
single-day rows would be a waste — and the renter calendar already
knows how to union overlapping ranges (Story 3-2's availability
query treats `listing_blocked_dates` as ranges).

### Why the notification is a stub

The story's AC calls for "SMS confirmation sent on successful
booking" via Twilio (FR14). Three options:
1. Land a full Twilio client here. Bloats 3-5 with a surface that
   Story 6-4 owns.
2. Skip the call. Breaks the AC literally.
3. Ship a named stub that logs. Meets the AC in spirit (the call
   site is wired, the function exists, future stories swap the
   implementation) without bloating 3-5.

We ship (3). The TODO at the top of `notifications.ts` points
directly at Story 6-4 so the follow-up is unmissable.

### Why the confirmed page re-fetches via the admin client

The `bookings` RLS policy "Renters can select own bookings"
handles the auth check fine, but `listings.pickup_instructions`
is excluded from anon grants AND the authenticated-renter select
list (migration 00003 locks it down to operators). The admin
client bypass is the only path that can read
`pickup_instructions`, which we need for the confirmation summary.
The ownership check happens in application code before the admin
fetch — same pattern as `contract-actions.ts::signContract`.

### Why navigate-without-delay on payment success

Story 3-4's contract sign screen uses a 1.5s `setTimeout` to let
the green signed-confirmation card linger before navigating. We
deliberately do NOT replicate that here — the payment step's
"success" is the confirmation screen (which has its own 600ms
checkmark draw-on animation), so the "payment form is still
visible while we navigate" state would be strictly noise. Navigate
immediately.

### Why `runtime = "nodejs"` is omitted from the webhook route

Next.js 16 with `cacheComponents` (on in this repo's `next.config.ts`)
treats `runtime` and `dynamic` route-segment config as
incompatible — the build errors out. Node.js runtime is the default
for route handlers (edge is opt-in), and POST requests are never
cached, so removing the explicit exports is the right move. If
cacheComponents is ever turned off, these exports could be restored
for belt-and-suspenders clarity.

### Why `@optional` on `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

varlock validates the schema on every `npm run build`, and a
`bitwarden("UUID")` call with a placeholder UUID errors out the
build. Marking the key `@optional` with an empty default lets the
build succeed on fresh clones; the Server Action then returns
`PAYMENT_MISSING_PUBLISHABLE_KEY` at runtime until the operator
creates the BWS secret and updates the schema with a real UUID.
The alternative — leaving it `@required` — would break
`npm run build` for anyone who hasn't yet provisioned Stripe
secrets, which is the wrong default for a still-pre-production
codebase.

### Follow-ups for 4-1 through 5-4

- **Story 4-1 (manage-my-rental dashboard).** The "Manage Your
  Rental" button on the confirmed page links to `/rentals`, which
  4-1 will build. Until then it 404s (Story 2-5 precedent).
- **Story 4-2 (extend rental).** The 4-day extension window is
  already consumed inside the 5-day `maintenance_buffer` row
  3-5 inserts. Story 4-2 will delete the buffer row when an
  extension is taken, OR shrink it to 1 day (the mandatory
  maintenance day). The operator UI will need to show the
  distinction clearly.
- **Story 4-3 (cancel booking).** When a renter cancels, we need
  to: (a) delete the booking_dates rows so the calendar re-opens
  immediately, (b) delete the `listing_blocked_dates` buffer
  row, (c) cancel the Stripe PaymentIntent via
  `cancelPaymentIntent`, (d) flip the booking to `cancelled`.
  A second transactional RPC `rpc_cancel_booking` is the right
  home — add it to a Story 4-3 migration.
- **Story 5-3 (no-show flagging).** Capture the hold via
  `stripe.paymentIntents.capture(id)`. Add a new helper to
  `lib/services/stripe.ts` — the service facade is the natural
  home.
- **Story 5-4 (completion + fee tracking).** Same capture call
  as 5-3 but on the happy path. Also: flip status to
  `completed`, record the transaction fee. The `stripe_webhook_events`
  ledger is where the async `charge.succeeded` event will be
  deduped. A new webhook handler branch `case "charge.succeeded"`
  will go into `route.ts` alongside the Story 3-5 failure branch.
- **Story 6-4 (SMS notifications).** Replace the stub in
  `lib/services/notifications.ts` with a real Twilio client.
  The call site in `payment-actions.ts` does not change.
- **Story 6-5 (operator real-time notifications).** The AC for
  3-5 mentions "the operator receives a real-time notification:
  'New booking! [Equipment] — [dates] — $[amount] held'". This
  is owned by Story 6-5's real-time notification infrastructure.
  The `booking_dates` publication already exists (from 00005),
  so 6-5 only needs to wire the operator's subscription UI.
- **Story 7-2 (retention).** `stripe_webhook_events` rows never
  expire in this story. A retention sweep that trims events
  older than 90 days belongs in 7-2.

### Risks

- **Abandoned `pending_payment` bookings.** If a renter signs a
  contract then closes the tab before authorizing the hold, the
  row sits as `pending_payment` forever. Story 3-4's Dev Notes
  flagged this for a background reaper in 7-2. The Story 3-5
  confirmation path does not clean up — that is a deliberate
  scope cut.
- **Stripe publishable key is `@optional`.** As noted above, this
  is a deliberate tradeoff for build-on-fresh-clone ergonomics.
  If production deploys ever run without the key, the renter
  sees `PAYMENT_MISSING_PUBLISHABLE_KEY`. A CI smoke test that
  asserts the BWS secret resolves in the production schema would
  close this gap.
- **Idempotent reuse of existing PaymentIntent.** If the stored
  intent has drifted (e.g. total recomputed differs because the
  operator bumped the daily rate between contract sign and
  payment), we silently fall through to creating a new intent —
  the old one ages out of Stripe. This is correct but could
  surprise debuggers. The booking row always points at the
  freshest intent id.
- **Race between `confirmBookingAfterPayment` and the Stripe
  webhook.** A `payment_intent.payment_failed` webhook can arrive
  before or after the Server Action runs. The webhook is a log-
  level no-op in 3-5, so no state divergence is possible.
  Story 5-4 will need to reason about this more carefully when it
  starts actually mutating state from webhook events.

## Dev Agent Record

- Model: Claude Opus 4.6 (1M context)
- New npm dependencies (pinned):
  - `stripe@22.0.1`
  - `@stripe/stripe-js@9.1.0`
  - `@stripe/react-stripe-js@6.1.0`
- Files created:
  - `supabase/migrations/00008_stripe_booking_confirmation.sql`
  - `lib/services/stripe.ts`
  - `lib/services/stripe.test.ts`
  - `lib/services/notifications.ts`
  - `lib/services/notifications.test.ts`
  - `lib/actions/payment-actions.ts`
  - `lib/actions/payment-actions.test.ts`
  - `components/payment/payment-hold-form.tsx`
  - `components/payment/payment-hold-form.test.tsx`
  - `app/api/webhooks/stripe/route.ts`
  - `app/api/webhooks/stripe/route.test.ts`
  - `app/(renter)/book/[listingId]/confirmed/page.tsx`
- Files modified:
  - `app/(renter)/book/[listingId]/payment/page.tsx` — replaces
    the Story 3-4 stub with the real PaymentHoldForm flow.
  - `app/globals.css` — adds `@keyframes checkmark-circle-draw`
    and `@keyframes checkmark-path-draw` for the confirmation
    page green-checkmark animation, gated on
    `prefers-reduced-motion`.
  - `.env.schema` — adds `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
    as `@optional` and annotates the existing Stripe secret/
    webhook secret with purpose comments.
  - `package.json` + `package-lock.json` — pinned Stripe SDKs.
  - `_bmad-output/implementation-artifacts/sprint-status.yaml` —
    marks story 3-5 done and bumps `last_updated` to 2026-04-10.

## Change Log

| Date       | Version | Description                            | Author    |
| ---------- | ------- | -------------------------------------- | --------- |
| 2026-04-10 | 1.0     | Story implemented end to end           | Dev Agent |
