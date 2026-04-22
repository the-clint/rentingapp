# Story 4-5: SMS Return Reminder

Status: done
Epic: 4 — Renter Self-Service (Manage-My-Rental)
Completed: 2026-04-10

## Summary

Ships the day-of return-reminder SMS path. A `/api/cron/return-reminders`
POST endpoint is called once per day by an external scheduler (Netlify
Scheduled Functions or equivalent); for every booking whose `end_date === today` and
`status === 'confirmed'`, it sends a concise SMS via the notification
stub (real Twilio delivery lands in Story 6-4) and records the result
in a new `sms_log` table. Failures are persisted with the `operator_id`
so Story 6-5's notification badge can count them.

## Acceptance criteria mapping

| AC | Implementation |
|----|----------------|
| Concise emoji-accented SMS under 160 chars with manage link | `lib/services/return-reminders.ts` constructs `"📦 Your {name} rental return is today. Manage: {url}"` |
| SMS fires on the return date | `dispatchReturnReminders` selects by `end_date = today` |
| Failure logged in `sms_log` | `00012_sms_log.sql` + `insertQueuedReminder` flow — row starts `queued`, flipped to `sent` or `failed` after delivery |
| Operator notified of failure | Failed rows carry `operator_id` — Story 6-5 badges pick them up. Stub already in place. |
| Tapping the manage link lands on `/rentals` after OTP auth | Link template `{base}/rentals`; the existing middleware + Story 3-3 OTP flow already gate the target. |

## Files touched

- `supabase/migrations/00012_sms_log.sql` — new `sms_log` table, per-day
  idempotency partial unique index on `(booking_id, purpose, created_at::date)`.
- `lib/services/notifications.ts` — added `sendReturnReminderSms` stub.
- `lib/services/return-reminders.ts` — `dispatchReturnReminders` worker.
- `app/api/cron/return-reminders/route.ts` — POST endpoint, shared-secret
  auth via `x-cron-secret` header.

## Notes

- The cron endpoint is idempotent: re-running the same day just skips
  bookings that already have a `sms_log` row for today — the unique
  partial index converts collisions into a clean skip path.
- The `CRON_SHARED_SECRET` env var is optional in dev to keep the
  smoke-test experience painless. Production deployments MUST set it.
- "Today" is currently computed in UTC. Pre-launch, when the operator's
  local cut-off matters, this should read the operator's timezone; for
  the MVP Utah market that's close enough.
