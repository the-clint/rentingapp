# Story 4-3: Cancel Booking

Status: done
Epic: 4 — Renter Self-Service (Manage-My-Rental)
Completed: 2026-04-10

## Summary

Ships the second write-path story in Epic 4: a renter can cancel an
`upcoming` confirmed booking from `/rentals/[bookingId]/cancel` and see
exactly what will happen to their money BEFORE they confirm. The 48-hour
cancellation policy from the Story 3-4 contract is enforced server-side:

- **`hours_until_start >= 48`** → **full refund** (`paymentIntents.cancel`
  releases the hold, and any extension intent is also released).
- **`hours_until_start < 48`**  → **non-refundable hold capture**
  (`paymentIntents.capture` charges the full original total, and any
  extension intent is also captured).

The boundary is EXACTLY 48 hours — 48:00 refunds, 47:59 captures. The
boundary math lives in a pair of pure helpers (`computeHoursUntilStart`
/ `outcomeFromHours`) that are unit-tested on both sides of the edge.

The page stub from Story 4-1 is replaced with a real Server Component
that computes the outcome via `previewCancellation` and hands it to the
`CancelBookingFlow` client component.

## Acceptance criteria mapping

| AC                                                          | Implementation |
|-------------------------------------------------------------|----------------|
| "Cancel Booking" action on `upcoming` rentals               | Already wired by Story 4-1 (`RentalCard` → `/rentals/[id]/cancel`). Story 4-3 does not touch the lifecycle. |
| > 48h: "Full refund — hold will be released" + confirm      | `CancelBookingFlow` `outcome === 'refund'` path renders the green card with `formatUsd(amountCents)`. |
| Confirm button destructive-styled                           | `<Button variant="destructive">Confirm cancellation</Button>`. |
| ≤ 48h: amber warning "No refund within 48 hours" + still a confirm | `outcome === 'hold_captured'` path renders the amber note + the SAME destructive confirm. |
| Confirm → booking status `cancelled`                         | `rpc_cancel_booking` flips `status` + `cancelled_at` + `cancellation_outcome`. |
| Hold released OR captured per policy (FR29)                 | `confirmCancellation` runs `cancelPaymentIntent` (refund) or `capturePaymentIntent` (hold_captured) on BOTH the main intent and the extension intent (if present). |
| `booking_dates` rows removed, calendar freed                | `rpc_cancel_booking` deletes from `public.booking_dates`. |
| Calendar updates via Realtime                               | `booking_dates` is already in the `supabase_realtime` publication (migration 00005) — anon calendar subscribers get the delete automatically. |
| SMS confirmation (refund status)                            | `sendBookingCancellationSms({ phone, outcome })` stub; real Twilio in Story 6-4. |
| Operator notification with freed dates                      | Out of scope; owned by Story 6-5 (real-time notifications). |

## 48-hour boundary — the exact policy

```
hoursUntilStart  outcome
---------------  --------------
>= 48.00         refund
<  48.00         hold_captured
```

Examples:

| now (UTC)            | start_date   | hoursUntilStart | outcome        |
|----------------------|--------------|-----------------|----------------|
| 2026-05-01 00:00     | 2026-05-03   | 48.00           | refund         |
| 2026-05-01 00:01     | 2026-05-03   | 47.983…         | hold_captured  |
| 2026-05-01 12:00     | 2026-05-03   | 36.00           | hold_captured  |
| 2026-05-01 00:00     | 2026-05-10   | 216.00          | refund         |

`start_date` is treated as midnight UTC — consistent with every other
date column in the app (see `rental-lifecycle.ts` for the same
convention).

## Ordering: Stripe FIRST, RPC SECOND

This was the single load-bearing design decision in the story. The
Server Action runs the Stripe side-effect BEFORE the DB mutation. The
reasoning:

1. **Stripe side-effects are idempotent at the service layer.** Both
   `cancelPaymentIntent` and `capturePaymentIntent` swallow
   `StripeInvalidRequestError` ("already cancelled" / "already
   captured"), so a retry after a partial failure is safe.
2. **RPC mutations are expensive to reverse.** If we ran the RPC first
   and Stripe failed, the `booking_dates` would already be gone. A
   concurrent booking could grab those freed days before the operator
   retried, and the `booking_dates` unique constraint would prevent
   re-inserting the original rows. Running Stripe first means the
   worst case is "hold released/captured but dates still reserved" —
   a retry by the same renter re-runs the (idempotent) Stripe call and
   re-runs the RPC (which has its own idempotency branch on
   `status = 'cancelled'`).
3. **`rpc_cancel_booking` has an idempotent short-circuit.** If it sees
   `v_booking.status = 'cancelled'`, it returns the row unchanged
   without raising. The retry path is safe by construction.

The failure window is:
- Stripe OK, RPC fails → the Server Action logs loudly via
  `console.error` with the booking id and the RPC error message, and
  returns `CANCELLATION_DATABASE_ERROR`. The caller sees an inline
  error and can retry. Follow-up operators would spot it in logs.

## Drift handling (`OUTCOME_DRIFT`)

`previewCancellation` is computed on the server when the page renders.
The client gets back a concrete `outcome` and passes it as
`acknowledgedOutcome` to `confirmCancellation`. Scenarios the drift
check defends against:

- Renter opens the page at T-49h (preview says `refund`), goes to
  lunch, and hits confirm at T-47h → the server recomputes the outcome
  as `hold_captured`, notices the acknowledgment disagrees, and returns
  `OUTCOME_DRIFT` without touching Stripe.
- Renter re-opens a stale tab cached from before a policy change (not
  currently possible, but future-proofs the contract).
- Any invalid `acknowledgedOutcome` value in the payload is treated as
  `OUTCOME_DRIFT` too — never silently coerced.

The client surfaces the drift with an inline `role="alert"` box and a
"Refresh to see the updated policy" button that calls `router.refresh()`
(re-runs the Server Component + preview). The confirm button is
disabled until the user refreshes.

## Files added

Migration:
- `supabase/migrations/00010_booking_cancellation.sql` — adds
  `bookings.cancelled_at` + `bookings.cancellation_outcome` columns and
  creates the `rpc_cancel_booking(booking_id, cancellation_outcome)`
  SECURITY DEFINER function.

Services:
- `lib/services/stripe.ts` — adds `capturePaymentIntent(id)` wrapper
  (mirrors `cancelPaymentIntent` error-swallowing for idempotency).
- `lib/services/notifications.ts` — adds `sendBookingCancellationSms`
  stub with a typed `outcome` enum instead of a free-form body (so the
  Twilio layer in Story 6-4 can template on the outcome).

Server Actions:
- `lib/actions/cancellation-actions.ts` — `previewCancellation` +
  `confirmCancellation`, with the `CancellationError` discriminated
  union, the `computeHoursUntilStart` / `outcomeFromHours` pure
  helpers, and the ordering-decision comment.
- `lib/actions/cancellation-actions.test.ts` — full coverage.

Client component:
- `components/rentals/cancel-booking-flow.tsx` — review → confirm →
  done state machine with drift branch.
- `components/rentals/cancel-booking-flow.test.tsx` — coverage for
  both outcomes, drift, session expiry, generic error.

Page:
- `app/(renter)/rentals/[bookingId]/cancel/page.tsx` — replaces the
  Story 4-1 stub.

Story + status:
- `_bmad-output/implementation-artifacts/4-3-cancel-booking.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — 4-3 → done.

## Files modified

- `lib/services/stripe.ts` — added `capturePaymentIntent`.
- `lib/services/stripe.test.ts` — added `capturePaymentIntent` suite +
  extended the fake Stripe shape to include `paymentIntents.capture`.
- `lib/services/notifications.ts` — added `sendBookingCancellationSms`.
- `lib/services/notifications.test.ts` — added the corresponding suite.

## Quality gates

- `npm run test`
- `npm run lint`
- `npm run type-check`
- `npm run build`

## Out of scope

- Operator-initiated cancellation (explicitly not in MVP).
- Partial refunds — either full release or full capture.
- Cancellation of `active` / `return_due` rentals — the AC is scoped to
  "upcoming" and the Story 4-1 lifecycle only exposes the action there.
- Real-time operator notification (Story 6-5).
- Real Twilio SMS delivery (Story 6-4).

## Follow-ups / risks

- **Stripe-OK / RPC-fail retry UX.** Today the renter sees an inline
  error and clicks again; the Server Action re-runs Stripe (idempotent)
  and re-runs the RPC (also idempotent because of the status
  short-circuit). If the RPC is persistently down, the renter will
  bounce off the error repeatedly. Follow-up: add an operator-side
  reconciliation sweep that detects bookings with a cancelled/captured
  PaymentIntent but `status != 'cancelled'` and flips them.
- **`cancelled_at` vs `updated_at`.** Both are stamped by the RPC. The
  audit story (future Epic 7 or an ops dashboard) should prefer
  `cancelled_at` because `updated_at` is touched by every UPDATE via
  the `set_updated_at` trigger.
- **Extension intent idempotency.** Releasing or capturing the
  extension intent on cancel is symmetric with the main intent. A
  booking that was extended and then cancelled within 48h will have
  BOTH holds captured — i.e. the renter is charged the full extended
  total. That's the intended reading of the contract ("no refund
  within 48 hours" → forfeit the hold, whatever its amount).
- **Hours math uses `start_date` midnight UTC.** This is consistent
  with the rest of the app's date handling but does mean a renter in a
  very-late time zone can see the policy flip a few hours earlier in
  their local evening than a naive "48 hours before the start of the
  rental day" reading. Acceptable for MVP (Utah-only).

## Change log

| Date       | Version | Description                      | Author    |
| ---------- | ------- | -------------------------------- | --------- |
| 2026-04-10 | 1.0     | Story implemented end to end     | Dev Agent |
