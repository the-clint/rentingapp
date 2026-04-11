-- Migration: renter phone disassociation (Story 7-1)
-- Story: 7-1-renter-phone-number-disassociation
--
-- Adds `bookings.renter_dashboard_hidden_at` — when set, the renter
-- dashboard query filters the row out, but the booking row + its
-- signed contract + check-in + transaction records all remain in
-- place for operator access and the 3-year retention window
-- (NFR11 / NFR18). Operator-side queries intentionally IGNORE this
-- column; the disassociation is a renter-UI concern only.
--
-- The disassociation Server Action flips every booking for the
-- current renter to hidden in a single UPDATE, scoped to rows whose
-- `renter_id = auth.uid()`. See `lib/actions/renter-privacy-actions.ts`.

ALTER TABLE public.bookings
  ADD COLUMN renter_dashboard_hidden_at timestamptz;

COMMENT ON COLUMN public.bookings.renter_dashboard_hidden_at IS
  'When set, the renter dashboard query filters this row out. Operator-side views ignore this column. Set by the Story 7-1 disassociation action.';

CREATE INDEX bookings_renter_dashboard_visible_idx
  ON public.bookings (renter_id)
  WHERE renter_dashboard_hidden_at IS NULL;
