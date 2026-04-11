# Story 6-4: Automated Lifecycle SMS Notifications

Status: done
Epic: 6 — Communication Hub & Notifications
Completed: 2026-04-10

## Summary

Swaps the notification stubs for real Twilio calls via the
`lib/services/twilio.ts` facade. Every outbound lifecycle SMS is
also mirrored into `sms_log` so the operator audit trail + Story 6-5
failure toasts have a single source of truth.

All existing stub call sites (`payment-actions`, `extension-actions`,
`cancellation-actions`, `check-in-actions`, `return-reminders`) keep
their existing signatures — `notifications.ts` now does the Twilio
call and `sms_log` insert internally. In environments without
Twilio env vars the facade falls back to a logging stub so dev/CI
behavior is unchanged.

## Files touched

- `lib/services/notifications.ts` — real Twilio send + sms_log
  insert for every lifecycle event.
- `lib/services/twilio.ts` — HTTP facade with signature verification
  and stubbed delivery fallback (shared with Story 6-1).
