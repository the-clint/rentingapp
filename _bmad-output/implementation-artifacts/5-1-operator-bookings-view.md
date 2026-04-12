# Story 5-1: Operator Bookings View

Status: done
Epic: 5 — Operator Dashboard & Business Operations
Completed: 2026-04-10

## Summary

Ships the operator Bookings page at `/bookings`. Loads every non-pending
booking for the authenticated operator via a single join through
`listings`, decorates each row with the rental lifecycle state + the
operator-facing status label, and renders a filter-tab navigation
(All / Active / Upcoming / Completed / No-Show). Filter state lives in
the `?status=` query param so the list stays server-rendered.

## Acceptance criteria mapping

| AC | Implementation |
|----|----------------|
| Status filter tabs | `OperatorBookingsList` renders one link per entry in `OPERATOR_BOOKINGS_STATUS_FILTERS` |
| Row shows renter avatar (initials), renter, equipment, dates, status badge, held/captured amount | `BookingRow` component |
| Empty state "No bookings yet…" | `EmptyState` with the `all`-filter copy from the AC |
| "No bookings match this filter." + clear link | `EmptyState` filter branch |
| Desktop single horizontal row, mobile stacked card | `flex flex-col gap-space-3 lg:flex-row lg:items-center` on the row |
| Warm-tinted skeleton during loading | `BookingsLoadingSkeleton` with amber-100 pulses |

## Files touched

- `supabase/migrations/00013_operator_bookings.sql` — Epic 5 schema
  additions (`no_show_at`, `payment_captured_*`, `transactions`,
  `rpc_flag_no_show`, `rpc_record_payment_capture`). Shared by
  Stories 5-1 through 5-4.
- `lib/services/operator-bookings.ts` — `fetchOperatorBookings`
  decorates each row with status label and normalized status, also
  `fetchOperatorBookingDetail` for Story 5-2.
- `components/operator/bookings-list.tsx` — presentational list.
- `app/(operator)/bookings/page.tsx` — Server Component page with
  search-param filter parsing and a Suspense skeleton.

## Notes

- Renter display name is derived from the phone number on the signed
  contract: the MVP does not collect names, so the list shows
  "Renter •1234" with the last four digits. Initials use the last two
  digits of the phone.
- The join uses `listings!inner(...)` with `listings.operator_id =
  operatorId` to enforce the operator scope at the DB layer; we
  additionally re-check in JS as defense-in-depth.
