-- Migration: check-ins (Story 4-4)
-- Story: 4-4-equipment-check-in
--
-- Adds the `check_ins` table — one row per renter-submitted check-in —
-- plus an `rpc_submit_check_in` SECURITY DEFINER function that writes
-- the check-in row and flips the booking to 'completed' inside a single
-- transaction. Keeping the dual write in a DB function means we never
-- end up with a submitted check-in pointing at a non-completed booking.
--
-- Design choices:
--   - `condition` is a text column with a CHECK constraint (good | damage |
--     issue). We mirror the enum from the UI so AC language stays aligned.
--   - `photo_paths` is a `text[]`. Photos are uploaded client-side via
--     `supabase.storage.from('check-in-photos').upload(...)` and only the
--     object paths are persisted here. The storage bucket + RLS are
--     created below.
--   - Booking status transitions: 'confirmed' → 'completed'. The RPC
--     rejects any other status so a double-submit from an impatient
--     renter is idempotent-ish (second call raises CHECK_IN_NOT_ELIGIBLE
--     and the UI treats it as a "nothing to do, redirect" signal).
--   - Operator-facing access is provided via RLS: operators can read
--     check-ins for their own listings (via join through bookings →
--     listings.operator_id). Renters can read their own.

-- =============================================================================
-- 1. check_ins table
-- =============================================================================
CREATE TABLE public.check_ins (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id      uuid NOT NULL REFERENCES public.bookings (id) ON DELETE CASCADE,
  renter_id       uuid NOT NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  condition       text NOT NULL
    CHECK (condition IN ('good', 'damage', 'issue')),
  comments        text,
  photo_paths     text[] NOT NULL DEFAULT '{}'::text[],
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX check_ins_booking_id_idx
  ON public.check_ins (booking_id);

CREATE INDEX check_ins_renter_id_idx
  ON public.check_ins (renter_id);

-- A booking can only be checked in once; enforce at the DB level.
CREATE UNIQUE INDEX check_ins_booking_id_unique_idx
  ON public.check_ins (booking_id);

COMMENT ON TABLE public.check_ins IS
  'Renter-submitted equipment check-ins (Story 4-4). One row per booking.';

-- =============================================================================
-- 2. completed_at column on bookings
-- =============================================================================
ALTER TABLE public.bookings
  ADD COLUMN completed_at timestamptz;

COMMENT ON COLUMN public.bookings.completed_at IS
  'Timestamp when the renter submitted the equipment check-in (Story 4-4).';

-- =============================================================================
-- 3. Storage bucket for check-in photos
-- =============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('check-in-photos', 'check-in-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Authenticated (renter) clients can upload into paths shaped like
-- `{bookingId}/{filename}`. Story 4-4 validates the booking ownership on
-- the server side before the path is ever used, but we also restrict
-- storage writes so an authenticated renter can only write to their own
-- bookings. We check that the first path segment is a booking owned by
-- the caller. Reads are public (so operator dashboards can show the
-- photos via a simple <img src={publicUrl} />).
CREATE POLICY "Authenticated can upload check-in photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'check-in-photos'
    AND EXISTS (
      SELECT 1
      FROM public.bookings b
      WHERE b.id = ((storage.foldername(name))[1])::uuid
        AND b.renter_id = auth.uid()
    )
  );

CREATE POLICY "Public can read check-in photos"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'check-in-photos');

-- =============================================================================
-- 4. RLS — check_ins
-- =============================================================================
ALTER TABLE public.check_ins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Renters can select own check-ins"
  ON public.check_ins FOR SELECT
  TO authenticated
  USING (renter_id = auth.uid());

CREATE POLICY "Operators can select check-ins for their listings"
  ON public.check_ins FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.bookings b
      JOIN public.listings l ON l.id = b.listing_id
      WHERE b.id = check_ins.booking_id
        AND l.operator_id = auth.uid()
    )
  );

-- No direct INSERT/UPDATE/DELETE policies: all writes go through the
-- RPC below (which runs SECURITY DEFINER, bypassing RLS).

-- =============================================================================
-- 5. rpc_submit_check_in — transactional check-in function
-- =============================================================================
CREATE OR REPLACE FUNCTION public.rpc_submit_check_in(
  booking_id     uuid,
  p_renter_id    uuid,
  p_condition    text,
  p_comments     text,
  p_photo_paths  text[]
)
RETURNS TABLE (
  check_in_id uuid,
  new_status  text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_new_id  uuid;
BEGIN
  IF p_condition IS NULL
     OR p_condition NOT IN ('good', 'damage', 'issue') THEN
    RAISE EXCEPTION 'CHECK_IN_INVALID_CONDITION: expected good | damage | issue, got %', p_condition
      USING ERRCODE = 'P0001';
  END IF;

  SELECT *
    INTO v_booking
    FROM public.bookings
   WHERE public.bookings.id = rpc_submit_check_in.booking_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CHECK_IN_NOT_FOUND: no booking with id %', booking_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_booking.renter_id IS DISTINCT FROM p_renter_id THEN
    RAISE EXCEPTION 'CHECK_IN_FORBIDDEN: booking % is not owned by renter', booking_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_booking.status <> 'confirmed' THEN
    RAISE EXCEPTION 'CHECK_IN_NOT_ELIGIBLE: booking status is %, expected confirmed', v_booking.status
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.check_ins (
    booking_id, renter_id, condition, comments, photo_paths
  )
  VALUES (
    v_booking.id,
    p_renter_id,
    p_condition,
    NULLIF(p_comments, ''),
    COALESCE(p_photo_paths, '{}'::text[])
  )
  RETURNING id INTO v_new_id;

  UPDATE public.bookings
     SET status       = 'completed',
         completed_at = now(),
         updated_at   = now()
   WHERE public.bookings.id = v_booking.id;

  RETURN QUERY
    SELECT v_new_id, 'completed'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_submit_check_in(uuid, uuid, text, text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_submit_check_in(uuid, uuid, text, text, text[])
  TO authenticated, service_role;
