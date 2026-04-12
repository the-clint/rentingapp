# Story 5-4: Payment Capture on Completion & Transaction Fee Tracking

Status: done
Epic: 5 — Operator Dashboard & Business Operations
Completed: 2026-04-10

## Summary

Ships `capturePaymentOnCompletion`, the Server Action the operator
calls from the booking detail page to capture a confirmed or
completed rental's payment hold (both the main + extension intents).
The action:

  1. Re-authorizes ownership via `loadBooking`.
  2. Captures both Stripe intents via the shared `capturePaymentIntent`
     helper (idempotent — already-captured intents are skipped).
  3. Reads back the actual `amount_received` to compute accurate fee
     math.
  4. Calls `rpc_record_payment_capture` to write a `transactions` row
     with Stripe fees (2.9% + 30c), platform fee (6%), estimated
     Twilio cost (4c / booking), and the net operator revenue.
  5. Returns the final breakdown to the client which renders the
     "Captured $X — Net $Y" success card.

## Acceptance criteria mapping

| AC | Implementation |
|----|----------------|
| Capture Payment action on completed rentals | "Capture Payment" button in `OperatorBookingDetailView` |
| Stripe captures full held amount | `captureIntentsAndComputeFees` iterates both intent ids |
| Platform transaction fee recorded | `PLATFORM_FEE_BPS = 600` → 6% |
| Stripe fees, Twilio cost, and net revenue stored | `transactions` table columns set on insert via `rpc_record_payment_capture` |
| Data in a `transactions` table linked to the booking | `public.transactions` per migration 00013 |
| Dashboard monthly revenue reflects captured amounts | `fetchOperatorDashboardStats` sums `payment_captured_cents` from the last 30 days |
