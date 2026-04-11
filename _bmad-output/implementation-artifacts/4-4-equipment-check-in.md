# Story 4-4: Equipment Check-In

Status: done
Epic: 4 — Renter Self-Service (Manage-My-Rental)
Completed: 2026-04-10

## Summary

Ships the renter-submitted equipment check-in: from
`/rentals/[bookingId]/check-in` the renter confirms the return location,
picks a condition (good / damage / issue), optionally describes + photographs
the state of the equipment, and submits. The Server Action writes a
`check_ins` row and flips the booking to `completed` inside a single
transactional RPC (`rpc_submit_check_in`). The operator-side surfacing of
the report lands in Stories 5-1 / 5-2; Story 5-4 still owns the Stripe
capture side of "rental is done."

## Acceptance criteria mapping

| AC | Implementation |
|----|----------------|
| Check-In screen shows equipment name + photo, return confirmation checkbox, and card-style condition radios | `components/rentals/check-in-flow.tsx` |
| "Good condition" → optional comment → 3-tap submit | Happy path: confirm checkbox, pick "good", tap submit. Optional comment textarea appears in-place. |
| "Damage to report" → description + photo upload | Required description + `<input type="file">` that uploads to `check-in-photos` bucket directly via the browser client |
| "Operational issue" → description textarea | Required description textarea (photos optional/not surfaced) |
| Server Action writes check-in record and transitions booking toward completion | `submitCheckIn` → `rpc_submit_check_in` (atomic insert + `bookings.status = 'completed'`) |
| Confirmation screen "Check-in complete — thanks!" | `done` state of `CheckInFlow` |
| Operator receives check-in report on dashboard | Notification stub via `notifyOperatorCheckInSubmitted`; real fan-out lands in Stories 5-2 / 6-5 |

## Files touched

- `supabase/migrations/00011_check_ins.sql` — new `check_ins` table,
  `bookings.completed_at` column, `check-in-photos` storage bucket with
  RLS (renter uploads scoped to their own booking id; public reads),
  `rpc_submit_check_in` SECURITY DEFINER function.
- `lib/actions/check-in-actions.ts` — `previewCheckIn` + `submitCheckIn`
  Server Actions with photo-path validation + lifecycle gating.
- `lib/services/notifications.ts` — `notifyOperatorCheckInSubmitted`
  stub (real delivery in Stories 6-4/6-5).
- `components/rentals/check-in-flow.tsx` — client component with the
  confirm checkbox, condition radios, conditional description textarea,
  and direct-to-storage photo uploader.
- `app/(renter)/rentals/[bookingId]/check-in/page.tsx` — replaces the
  Story 4-1 placeholder with a real Server Component that validates
  session + eligibility via `previewCheckIn` and renders the flow.

## Notes

- The DB-level unique constraint on `check_ins.booking_id` means a racing
  double-submit is converted to an RPC error that surfaces as
  `CHECK_IN_NOT_ELIGIBLE` (second call finds `status = 'completed'`).
- Photo paths from the client must begin with `{bookingId}/` — the
  Server Action validates this and the storage RLS policy re-validates
  via a join to `bookings.renter_id`.
- The page redirects to `/rentals` on any preview failure; the error
  toast is intentionally NOT surfaced because the user is already back
  on their dashboard with an updated state.
