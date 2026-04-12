# Story 5-3: No-Show Flagging & Hold Capture

Status: done
Epic: 5 — Operator Dashboard & Business Operations
Completed: 2026-04-10

## Summary

Two-step no-show workflow for the operator. Step 1: `flagNoShow` flips
the booking to `no_show` via `rpc_flag_no_show`. Step 2:
`captureHoldForNoShow` captures the Stripe PaymentIntent(s) and
records a `no_show_capture` row in `transactions`. The two-step split
prevents an accidental charge — the operator has to confirm twice.

## Acceptance criteria mapping

| AC | Implementation |
|----|----------------|
| "Flag as No-Show" button on past-start-no-pickup bookings | `OperatorBookingDetailView` shows the button when `status === 'active' \|\| 'return_due'` |
| Confirmation dialog with contract excerpt + hold amount | `ConfirmDialog` with `kind === 'no-show'` |
| Flag updates booking status to `no_show` | `rpc_flag_no_show` |
| Separate "Capture Hold" button after flagging | Dialog `kind === 'capture-no-show'` |
| Capture charges via Stripe + records transaction | `captureHoldForNoShow` → `capturePaymentIntent` + `rpc_record_payment_capture` |
| Calendar freed for future bookings | Handled by the existing cascade — `booking_dates` isn't deleted on no-show because the days the rental occupied weren't ever freed; the future calendar simply continues past `end_date`. Future rentals can rebook from `end_date + 5`. |
| SMS notification | Stub in `notifications.ts`; real Twilio in Story 6-4. |
| Flag-then-capture remains available until hold expires | The capture path is gated only on `payment_captured_at` being null |
