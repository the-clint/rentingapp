# Story 5-2: Booking Detail & Contract Access

Status: done
Epic: 5 — Operator Dashboard & Business Operations
Completed: 2026-04-10

## Summary

Adds the operator booking detail page at `/bookings/[bookingId]`. Loads
the full booking row + signed contract + check-in report (if any) via
`fetchOperatorBookingDetail`, renders them in a single
`OperatorBookingDetailView` client component, and exposes the
downstream action buttons (flag no-show, capture, etc.) that Stories
5-3 / 5-4 wire up.

## Acceptance criteria mapping

| AC | Implementation |
|----|----------------|
| Detail shows renter, phone, equipment, dates, status, amount, signed contract, pickup, check-in | `OperatorBookingDetailView` renders header, contract section, check-in report, pickup section |
| Contract viewer shows immutable body + signed date + download | `<details>` block with the full contract body + `data:text/plain` download link |
| Check-in report shows condition, comments, photos, submission timestamp | `booking-detail-check-in` section reads from `check_ins` rows |

## Files touched

- `lib/services/operator-bookings.ts` — `fetchOperatorBookingDetail`
  Server Action (single-row read with contract + check-in joins).
- `components/operator/booking-detail-view.tsx` — client component
  with contract + check-in rendering. Shared between Stories 5-2/5-3/5-4.
- `app/(operator)/bookings/[bookingId]/page.tsx` — Server Component
  route that loads + authorizes the booking.
