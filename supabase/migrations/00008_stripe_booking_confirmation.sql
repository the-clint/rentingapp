-- Migration: Stripe booking confirmation RPC + webhook idempotency table
-- Story: 3-5-stripe-payment-hold-and-booking-confirmation
--
-- Responsibilities:
--   1. Create `public.stripe_webhook_events` for Stripe webhook idempotency
--      (Story 3-5, reused by Story 5-4 capture path + Story 4-3 cancel).
--   2. Create `public.rpc_confirm_booking(...)` — the transactional
--      confirmation function that flips a `pending_payment` booking to
--      `confirmed`, inserts `booking_dates` rows (hit the unique
--      `(listing_id, date)` constraint if another renter won the race),
--      inserts `listing_blocked_dates` rows for the 5-day post-rental
--      maintenance buffer (4 extension days + 1 mandatory maintenance
--      day — FR25), and stores the Stripe PaymentIntent id.
--   3. Tighten `bookings.renter_id` to NOT NULL now that the OTP auth
--      path (Story 3-3) guarantees a renter session at booking time.
--      Story 3-3 / 3-4 Dev Notes both flagged this as the 3-5 follow-up.
--
-- Design choices:
--   - The transaction lives in Postgres. The alternative — `begin; ...
--     commit;` from the admin client — does not play well with the
--     supabase-js PostgREST abstraction, and splitting the inserts across
--     separate PostgREST calls would leak a half-written booking on
--     partial failure. A SECURITY DEFINER function that runs the whole
--     confirmation in one atomic unit is strictly safer.
--   - On unique-constraint violation we RAISE EXCEPTION with a stable
--     hint string that the Server Action pattern-matches to return
--     `BOOKING_CONFLICT`. Caller is then responsible for cancelling the
--     orphaned Stripe PaymentIntent (the RPC has no Stripe knowledge).
--   - `listing_blocked_dates` already has a `reason` CHECK that includes
--     `maintenance_buffer` (migration 00004) — no schema change needed.
--   - Why BOOKING_CONFLICT is raised via `errcode 'P0001'` + a distinctive
--     MESSAGE: Supabase's PostgREST surfaces the raised message in the
--     error.message field. We prefix with `BOOKING_CONFLICT:` so the
--     Server Action can do a cheap string match rather than decoding
--     Postgres error codes.

-- =============================================================================
-- 1. stripe_webhook_events — webhook idempotency ledger
-- =============================================================================
CREATE TABLE public.stripe_webhook_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id  text NOT NULL UNIQUE,
  event_type       text NOT NULL,
  received_at      timestamptz NOT NULL DEFAULT now(),
  payload          jsonb
);

CREATE INDEX stripe_webhook_events_received_at_idx
  ON public.stripe_webhook_events (received_at DESC);

-- Lock it down. Only the service role touches this table — the webhook
-- route uses the admin client.
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.stripe_webhook_events FROM anon, authenticated;

-- (No policies added — service role bypasses RLS, and no other caller
--  should ever read or write this table.)

-- =============================================================================
-- 2. Tighten bookings.renter_id
-- =============================================================================
-- Story 3-3 relaxed this to nullable during the Story 3-2 calendar stage.
-- Story 3-5 now requires a renter session at booking time (OTP auth
-- shipped in 3-3, contract sign in 3-4), so we flip it back to NOT NULL.
-- No data exists in any environment yet, so this is a safe forward-only
-- change.
ALTER TABLE public.bookings
  ALTER COLUMN renter_id SET NOT NULL;

-- =============================================================================
-- 3. rpc_confirm_booking — the transactional confirmation function
-- =============================================================================
CREATE OR REPLACE FUNCTION public.rpc_confirm_booking(
  booking_id         uuid,
  payment_intent_id  text,
  buffer_days        integer DEFAULT 5
)
RETURNS TABLE (
  id         uuid,
  listing_id uuid,
  status     text,
  start_date date,
  end_date   date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_booking       public.bookings%ROWTYPE;
  v_buffer_start  date;
  v_buffer_end    date;
BEGIN
  -- Load + lock the booking row.
  SELECT *
    INTO v_booking
    FROM public.bookings
   WHERE public.bookings.id = rpc_confirm_booking.booking_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND: no booking with id %', booking_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_booking.status <> 'pending_payment' THEN
    RAISE EXCEPTION 'BOOKING_INVALID_STATUS: expected pending_payment, got %', v_booking.status
      USING ERRCODE = 'P0001';
  END IF;

  -- Insert one booking_dates row per day in [start_date, end_date]. The
  -- unique (listing_id, date) constraint converts a concurrent-race loss
  -- into a unique_violation (SQLSTATE 23505) which we re-raise as
  -- BOOKING_CONFLICT so the Server Action can map it to a clean error.
  BEGIN
    INSERT INTO public.booking_dates (booking_id, listing_id, date)
    SELECT v_booking.id,
           v_booking.listing_id,
           gs::date
      FROM generate_series(
        v_booking.start_date::timestamp,
        v_booking.end_date::timestamp,
        interval '1 day'
      ) AS gs;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'BOOKING_CONFLICT: one or more dates were just booked'
        USING ERRCODE = 'P0001';
  END;

  -- Insert the 5-day post-rental maintenance buffer (FR25). We store it
  -- as ONE listing_blocked_dates row covering [end + 1, end + buffer].
  IF buffer_days > 0 THEN
    v_buffer_start := v_booking.end_date + 1;
    v_buffer_end   := v_booking.end_date + buffer_days;
    INSERT INTO public.listing_blocked_dates (
      listing_id,
      start_date,
      end_date,
      reason
    ) VALUES (
      v_booking.listing_id,
      v_buffer_start,
      v_buffer_end,
      'maintenance_buffer'
    );
  END IF;

  -- Flip the booking to confirmed + store the PaymentIntent id.
  UPDATE public.bookings
     SET status = 'confirmed',
         stripe_payment_intent_id = rpc_confirm_booking.payment_intent_id,
         updated_at = now()
   WHERE public.bookings.id = v_booking.id;

  RETURN QUERY
    SELECT v_booking.id,
           v_booking.listing_id,
           'confirmed'::text,
           v_booking.start_date,
           v_booking.end_date;
END;
$$;

-- Only authenticated callers can invoke. The Server Action uses the admin
-- client (service role), which always has EXECUTE on SECURITY DEFINER
-- functions it owns.
REVOKE ALL ON FUNCTION public.rpc_confirm_booking(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_confirm_booking(uuid, text, integer)
  TO authenticated, service_role;
