-- Migration: bookings + booking_dates tables, RLS, anon column grants, realtime
-- Story: 3-2-availability-calendar-renter-mode-and-date-selection
--
-- This migration lands the `bookings` and `booking_dates` schema early (ahead
-- of Story 3-5 which actually creates bookings) so that the renter-facing
-- availability calendar in Story 3-2 has a stable read-surface to query and
-- to subscribe to via Supabase Realtime. Every write-side concern (Stripe
-- payment intent, booking status transitions, 5-day post-rental buffer,
-- unique-constraint collision handling) is owned by Story 3-5.
--
-- Design choices:
--   - Two tables. `bookings` is the canonical row-per-booking; `booking_dates`
--     is a day-index projection with a unique(listing_id, date) constraint
--     that PostgreSQL enforces to prevent double-booking at the DB layer
--     (FR23 / Story 3.5 AC). Story 3.5 inserts N rows into `booking_dates`
--     inside the same Server Action that inserts the `bookings` row.
--   - The 5-day post-rental buffer (4 extension days + 1 maintenance day,
--     FR25) is enforced by Story 3.5's Server Action, not by a trigger —
--     keeping the policy in application code makes it easier to evolve as
--     the rules change and avoids coupling the schema to business rules.
--     Story 3.5 inserts `booking_dates` rows for `start..end + 5 days`
--     and `listing_blocked_dates` rows flagged as `maintenance_buffer`.
--   - Anon access to `booking_dates` is granted column-level — anon can
--     SELECT only the `listing_id` and `date` columns, never `booking_id`.
--     This is exactly enough to render a "this date is booked" marker on
--     the renter calendar without leaking who booked it or what the
--     associated booking row looks like.
--   - Realtime is enabled on `booking_dates` and `listing_blocked_dates`
--     so the renter calendar can `.on("postgres_changes", ...)` and
--     re-fetch the month on any availability change. The anon role is the
--     one subscribing (no renter auth yet at the calendar stage).

-- =============================================================================
-- 1. bookings table
-- =============================================================================
CREATE TABLE public.bookings (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id               uuid NOT NULL REFERENCES public.listings (id) ON DELETE CASCADE,
  -- Renter id is nullable during Story 3-2 because OTP auth ships in Story
  -- 3-3. Story 3-5 flips this to NOT NULL once the renter session exists at
  -- booking time.
  renter_id                uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  status                   text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed', 'no_show')),
  start_date               date NOT NULL,
  end_date                 date NOT NULL,
  total_cents              integer NOT NULL CHECK (total_cents >= 0),
  stripe_payment_intent_id text,
  contract_id              uuid,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CHECK (start_date <= end_date)
);

CREATE INDEX bookings_listing_id_idx
  ON public.bookings (listing_id);

CREATE INDEX bookings_renter_id_idx
  ON public.bookings (renter_id)
  WHERE renter_id IS NOT NULL;

CREATE INDEX bookings_status_idx
  ON public.bookings (status);

-- Reuse the hardened updated_at trigger function from migration 00003.
CREATE TRIGGER bookings_set_updated_at
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

-- =============================================================================
-- 2. booking_dates table
-- =============================================================================
-- One row per booked calendar day. The unique constraint on
-- (listing_id, date) is the DB-level guarantee against double-booking:
-- Story 3-5's Server Action relies on this to convert race conditions into
-- a clean `BOOKING_CONFLICT` error (FR23, Story 3.5 AC).
CREATE TABLE public.booking_dates (
  booking_id  uuid NOT NULL REFERENCES public.bookings (id) ON DELETE CASCADE,
  listing_id  uuid NOT NULL REFERENCES public.listings (id) ON DELETE CASCADE,
  date        date NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (booking_id, date),
  UNIQUE (listing_id, date)
);

CREATE INDEX booking_dates_listing_date_idx
  ON public.booking_dates (listing_id, date);

-- =============================================================================
-- 3. RLS — bookings
-- =============================================================================
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- Operator can read bookings for listings they own.
CREATE POLICY "Operators can select bookings for own listings"
  ON public.bookings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.listings
       WHERE id = bookings.listing_id
         AND operator_id = auth.uid()
    )
  );

-- Renter can read their own bookings (once OTP auth lands in Story 3-3).
CREATE POLICY "Renters can select own bookings"
  ON public.bookings FOR SELECT
  TO authenticated
  USING (renter_id = auth.uid());

-- Renter (authenticated) inserts their own booking. Story 3-5 will tighten
-- this with a WITH CHECK on renter_id = auth.uid() once the renter role
-- exists; left permissive-for-authenticated here so Story 3-3 doesn't need
-- to back-edit this migration.
CREATE POLICY "Renters can insert own bookings"
  ON public.bookings FOR INSERT
  TO authenticated
  WITH CHECK (renter_id = auth.uid());

-- Operator can update bookings on their listings (to mark completed/no-show
-- in Epic 5). Renter can update their own bookings (to cancel in Epic 4).
CREATE POLICY "Operators can update bookings for own listings"
  ON public.bookings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.listings
       WHERE id = bookings.listing_id
         AND operator_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.listings
       WHERE id = bookings.listing_id
         AND operator_id = auth.uid()
    )
  );

CREATE POLICY "Renters can update own bookings"
  ON public.bookings FOR UPDATE
  TO authenticated
  USING (renter_id = auth.uid())
  WITH CHECK (renter_id = auth.uid());

-- No anon row-level access to `bookings`. The calendar only needs
-- `booking_dates` (see below), never the booking row itself — that keeps
-- stripe_payment_intent_id, contract_id, renter_id fully private from anon.
REVOKE ALL ON public.bookings FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bookings TO authenticated;

-- =============================================================================
-- 4. RLS — booking_dates
-- =============================================================================
ALTER TABLE public.booking_dates ENABLE ROW LEVEL SECURITY;

-- Operator can read booking_dates for their listings.
CREATE POLICY "Operators can select booking dates for own listings"
  ON public.booking_dates FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.listings
       WHERE id = booking_dates.listing_id
         AND operator_id = auth.uid()
    )
  );

-- Renter can read booking_dates for their own bookings.
CREATE POLICY "Renters can select own booking dates"
  ON public.booking_dates FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bookings
       WHERE id = booking_dates.booking_id
         AND renter_id = auth.uid()
    )
  );

-- Anon (the renter-facing calendar BEFORE OTP auth) can read ALL
-- booking_dates rows — but only the two "safe" columns (see column grants
-- below). This is the only way to show "this date is booked" to an
-- unauthenticated browser without exposing renter identity.
CREATE POLICY "Public can read booking dates"
  ON public.booking_dates FOR SELECT
  TO anon, authenticated
  USING (true);

-- Renter inserts booking_dates as part of the Story 3-5 booking Server
-- Action. The insert check joins through to `bookings` to verify the caller
-- owns the booking row.
CREATE POLICY "Renters can insert own booking dates"
  ON public.booking_dates FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.bookings
       WHERE id = booking_dates.booking_id
         AND renter_id = auth.uid()
    )
  );

-- Column-level grants: anon gets `listing_id` and `date` ONLY. Never
-- `booking_id` or `created_at`. This mirrors the `listings` column-grant
-- pattern from migration 00003 (anon is denied `pickup_instructions`).
REVOKE ALL ON public.booking_dates FROM anon;
GRANT SELECT (listing_id, date) ON public.booking_dates TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_dates TO authenticated;

-- =============================================================================
-- 5. Anon read surface for listing_blocked_dates
-- =============================================================================
-- Story 2-2 shipped `listing_blocked_dates` with zero anon access and a
-- comment promising that Story 3-2 would add "a projection view or a
-- Postgres function" for the renter calendar. We take the simpler path:
-- grant anon SELECT directly on the three safe columns. This means the
-- renter calendar can subscribe to `listing_blocked_dates` via Realtime as
-- anon, and an anon fetch of a specific listing's blocked dates returns
-- only `listing_id`, `start_date`, `end_date`, `reason` — never `id` or
-- `created_at`, both of which are internal bookkeeping.
CREATE POLICY "Public can read listing blocked dates"
  ON public.listing_blocked_dates FOR SELECT
  TO anon, authenticated
  USING (true);

GRANT SELECT (listing_id, start_date, end_date, reason)
  ON public.listing_blocked_dates TO anon;

-- =============================================================================
-- 6. Realtime publication
-- =============================================================================
-- Supabase Realtime streams changes from the `supabase_realtime` publication.
-- Add the two tables the renter calendar subscribes to. `DO $$ ... $$` guards
-- against re-running the migration against a database where the publication
-- already contains the table (idempotent).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'booking_dates'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.booking_dates';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'listing_blocked_dates'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.listing_blocked_dates';
  END IF;
END
$$;
