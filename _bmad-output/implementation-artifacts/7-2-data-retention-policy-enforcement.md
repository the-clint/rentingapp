# Story 7-2: Data Retention Policy Enforcement

Status: done
Epic: 7 — Renter Identity & Data Management
Completed: 2026-04-10

## Summary

Formalizes and enforces the three-tier retention policy:

1. **Renter dashboard visibility — 45 days.** Enforced by
   `fetchRenterRentals` via `end_date >= today - 45 days`. Unchanged
   from Story 4-1 but now documented alongside the retention
   module.
2. **Operator retention — 3 years.** Enforced passively (nothing
   deletes bookings, contracts, check-ins, transactions, or
   messages within the window).
3. **Disassociated records — retained.** Story 7-1 sets
   `renter_dashboard_hidden_at` but preserves the row; operator
   views continue to see it.

A dedicated `purgeExpiredRecords` helper + `/api/cron/retention`
endpoint runs the 3-year sweep against `bookings` (cascading to
joined tables via existing FK rules) and `sms_log`. Intended to be
invoked daily once the product has been live long enough for the
window to matter.

## Files touched

- `lib/services/data-retention.ts` — documented policy + purge
  helper.
- `app/api/cron/retention/route.ts` — POST endpoint guarded by the
  shared `CRON_SHARED_SECRET` header.
