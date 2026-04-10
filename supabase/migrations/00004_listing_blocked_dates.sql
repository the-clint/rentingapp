-- Migration: listing_blocked_dates table, indexes, RLS
-- Story: 2-2-manage-availability-calendar-operator-mode

-- =============================================================================
-- 1. listing_blocked_dates table
-- =============================================================================
-- Tracks date ranges when a listing is NOT bookable. The `reason` column
-- distinguishes between three write paths:
--   - 'operator_block'     — operator manually blocked the dates (Story 2.2)
--   - 'booking'            — an active booking occupies the dates (Epic 3)
--   - 'maintenance_buffer' — 1-day mandatory buffer after a rental (Epic 3)
-- A single table with a range-lookup index is used instead of separate tables
-- so that the renter-facing availability query in Epic 3 can scan "all reasons
-- a date is unavailable" in one ordered pass.
CREATE TABLE public.listing_blocked_dates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id  uuid NOT NULL REFERENCES public.listings (id) ON DELETE CASCADE,
  start_date  date NOT NULL,
  end_date    date NOT NULL,
  reason      text NOT NULL
    CHECK (reason IN ('operator_block', 'booking', 'maintenance_buffer')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (start_date <= end_date)
);

-- Range lookup index (used by Epic 3 renter calendar and by the Story 2.2
-- initial fetch). Partial index for the write path in saveAvailability which
-- does a DELETE ... WHERE reason = 'operator_block' followed by an INSERT.
CREATE INDEX listing_blocked_dates_listing_start_idx
  ON public.listing_blocked_dates (listing_id, start_date);

CREATE INDEX listing_blocked_dates_listing_operator_block_idx
  ON public.listing_blocked_dates (listing_id)
  WHERE reason = 'operator_block';

-- =============================================================================
-- 2. RLS policies
-- =============================================================================
ALTER TABLE public.listing_blocked_dates ENABLE ROW LEVEL SECURITY;

-- Operators can SELECT rows for listings they own (all reasons).
CREATE POLICY "Operators can select blocked dates for own listings"
  ON public.listing_blocked_dates FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.listings
       WHERE id = listing_blocked_dates.listing_id
         AND operator_id = auth.uid()
    )
  );

-- Operators can INSERT new blocks on their own listings. The Server Action
-- only ever inserts `reason = 'operator_block'`; we still allow the other
-- reasons at the policy level so that the Epic 3 booking engine (also
-- authenticated, running under the renter's session via a different path)
-- does not need a new policy. If that turns out to be wrong, Epic 3 can
-- tighten this to `reason = 'operator_block'` only.
CREATE POLICY "Operators can insert blocked dates for own listings"
  ON public.listing_blocked_dates FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.listings
       WHERE id = listing_blocked_dates.listing_id
         AND operator_id = auth.uid()
    )
  );

CREATE POLICY "Operators can update blocked dates for own listings"
  ON public.listing_blocked_dates FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.listings
       WHERE id = listing_blocked_dates.listing_id
         AND operator_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.listings
       WHERE id = listing_blocked_dates.listing_id
         AND operator_id = auth.uid()
    )
  );

CREATE POLICY "Operators can delete blocked dates for own listings"
  ON public.listing_blocked_dates FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.listings
       WHERE id = listing_blocked_dates.listing_id
         AND operator_id = auth.uid()
    )
  );

-- =============================================================================
-- 3. Grants
-- =============================================================================
-- No anon access to this table at all. Epic 3 will add a projection (a
-- dedicated view or a Postgres function) that exposes the union of blocked
-- dates for renter calendar rendering without leaking row-level details
-- (e.g. the booking id for a `reason='booking'` row).
REVOKE ALL ON public.listing_blocked_dates FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.listing_blocked_dates TO authenticated;
