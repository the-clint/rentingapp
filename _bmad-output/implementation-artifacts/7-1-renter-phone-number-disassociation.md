# Story 7-1: Renter Phone Number Disassociation

Status: done
Epic: 7 — Renter Identity & Data Management
Completed: 2026-04-10

## Summary

A renter can tap "I don't recognize these rentals" on the `/rentals`
dashboard and confirm a disassociation. The Server Action marks every
booking they own with `renter_dashboard_hidden_at = now()`; the
booking row and all joined records (contract, check-in, transactions,
messages) stay intact for operator access and the 3-year retention
window (NFR11 / NFR18).

## Files touched

- `supabase/migrations/00015_renter_disassociation.sql` — adds the
  `bookings.renter_dashboard_hidden_at` column + partial index.
- `lib/actions/renter-privacy-actions.ts` — `disassociateRenterHistory`
  Server Action.
- `lib/services/renter-rentals.ts` — dashboard query filters out
  hidden rows.
- `components/rentals/disassociate-history-button.tsx` — client
  component with confirm dialog.
- `app/(renter)/rentals/page.tsx` — mounts the button below the
  rentals list.
