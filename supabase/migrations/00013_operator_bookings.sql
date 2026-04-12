-- Migration: operator bookings support columns + transactions table (Epic 5)
-- Stories: 5-1 (list), 5-2 (detail), 5-3 (no-show), 5-4 (capture + fees)
--
-- A single migration for Epic 5 because all five stories share the
-- same underlying schema additions:
--
--   - `bookings.no_show_at` / `bookings.no_show_flagged_by`
--   - `bookings.payment_captured_at` / `bookings.payment_captured_cents`
--   - `public.transactions` — one row per capture (completion or
--     no-show), stores Stripe fees, estimated SMS cost, platform fee,
--     and net operator revenue (FR31/32).
--   - `rpc_flag_no_show` / `rpc_record_payment_capture` helpers that
--     the Server Actions call.
--
-- Keeping it in one migration makes Epic 5 easier to rollback if the
-- operator dashboard needs to be pulled back for any reason.

-- =============================================================================
-- 1. Additional columns on bookings
-- =============================================================================
ALTER TABLE public.bookings
  ADD COLUMN no_show_at              timestamptz,
  ADD COLUMN no_show_flagged_by      uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  ADD COLUMN payment_captured_at     timestamptz,
  ADD COLUMN payment_captured_cents  integer CHECK (
    payment_captured_cents IS NULL OR payment_captured_cents >= 0
  );

COMMENT ON COLUMN public.bookings.no_show_at IS
  'Timestamp when the operator flagged this booking as a no-show (Story 5-3).';
COMMENT ON COLUMN public.bookings.payment_captured_at IS
  'Timestamp when the Stripe PaymentIntent was captured (Story 5-3 or 5-4).';
COMMENT ON COLUMN public.bookings.payment_captured_cents IS
  'Total amount captured in cents across the main + extension intents.';

-- =============================================================================
-- 2. transactions table (Story 5-4)
-- =============================================================================
CREATE TABLE public.transactions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id            uuid NOT NULL REFERENCES public.bookings (id) ON DELETE CASCADE,
  listing_id            uuid NOT NULL REFERENCES public.listings (id) ON DELETE CASCADE,
  operator_id           uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  kind                  text NOT NULL CHECK (kind IN ('completion_capture', 'no_show_capture')),
  captured_cents        integer NOT NULL CHECK (captured_cents >= 0),
  stripe_fee_cents      integer NOT NULL CHECK (stripe_fee_cents >= 0),
  platform_fee_cents    integer NOT NULL CHECK (platform_fee_cents >= 0),
  twilio_cost_cents     integer NOT NULL CHECK (twilio_cost_cents >= 0),
  net_operator_cents    integer NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX transactions_operator_id_created_at_idx
  ON public.transactions (operator_id, created_at DESC);

CREATE INDEX transactions_booking_id_idx
  ON public.transactions (booking_id);

COMMENT ON TABLE public.transactions IS
  'Captured payment audit trail. One row per Stripe capture (Story 5-4).';

-- No renter-facing reads; enable RLS with an operator-only SELECT policy.
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operators can select own transactions"
  ON public.transactions FOR SELECT
  TO authenticated
  USING (operator_id = auth.uid());

-- =============================================================================
-- 3. rpc_flag_no_show — transactional no-show flag
-- =============================================================================
CREATE OR REPLACE FUNCTION public.rpc_flag_no_show(
  booking_id uuid,
  operator_id uuid
)
RETURNS TABLE (
  id uuid,
  new_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_operator_id uuid;
BEGIN
  SELECT l.operator_id INTO v_operator_id
    FROM public.bookings b
    JOIN public.listings l ON l.id = b.listing_id
   WHERE b.id = rpc_flag_no_show.booking_id;

  IF v_operator_id IS NULL THEN
    RAISE EXCEPTION 'NO_SHOW_NOT_FOUND: booking % not found', booking_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_operator_id <> rpc_flag_no_show.operator_id THEN
    RAISE EXCEPTION 'NO_SHOW_FORBIDDEN: booking is not owned by this operator'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_booking
    FROM public.bookings
   WHERE public.bookings.id = rpc_flag_no_show.booking_id
   FOR UPDATE;

  IF v_booking.status = 'no_show' THEN
    -- Idempotent replay.
    RETURN QUERY SELECT v_booking.id, v_booking.status;
    RETURN;
  END IF;

  IF v_booking.status <> 'confirmed' THEN
    RAISE EXCEPTION 'NO_SHOW_NOT_ELIGIBLE: booking status is %, expected confirmed', v_booking.status
      USING ERRCODE = 'P0001';
  END IF;

  IF v_booking.start_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'NO_SHOW_TOO_EARLY: booking has not started yet'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.bookings
     SET status             = 'no_show',
         no_show_at         = now(),
         no_show_flagged_by = rpc_flag_no_show.operator_id,
         updated_at         = now()
   WHERE public.bookings.id = v_booking.id;

  RETURN QUERY SELECT v_booking.id, 'no_show'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_flag_no_show(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_flag_no_show(uuid, uuid)
  TO authenticated, service_role;

-- =============================================================================
-- 4. rpc_record_payment_capture — stamp capture cols + insert transaction
-- =============================================================================
CREATE OR REPLACE FUNCTION public.rpc_record_payment_capture(
  booking_id           uuid,
  operator_id          uuid,
  kind                 text,
  captured_cents       integer,
  stripe_fee_cents     integer,
  platform_fee_cents   integer,
  twilio_cost_cents    integer
)
RETURNS TABLE (
  transaction_id uuid,
  new_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_listing_operator uuid;
  v_tx_id uuid;
  v_net integer;
  v_final_status text;
BEGIN
  IF kind NOT IN ('completion_capture', 'no_show_capture') THEN
    RAISE EXCEPTION 'CAPTURE_INVALID_KIND: %', kind
      USING ERRCODE = 'P0001';
  END IF;

  SELECT l.operator_id INTO v_listing_operator
    FROM public.bookings b
    JOIN public.listings l ON l.id = b.listing_id
   WHERE b.id = rpc_record_payment_capture.booking_id;

  IF v_listing_operator IS NULL THEN
    RAISE EXCEPTION 'CAPTURE_NOT_FOUND: booking % not found', booking_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_listing_operator <> rpc_record_payment_capture.operator_id THEN
    RAISE EXCEPTION 'CAPTURE_FORBIDDEN: booking is not owned by this operator'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_booking
    FROM public.bookings
   WHERE public.bookings.id = rpc_record_payment_capture.booking_id
   FOR UPDATE;

  IF v_booking.payment_captured_at IS NOT NULL THEN
    -- Already captured. Return the existing transaction row if there
    -- is one, otherwise report the idempotent success with a null id.
    SELECT t.id INTO v_tx_id
      FROM public.transactions t
     WHERE t.booking_id = v_booking.id
     LIMIT 1;
    RETURN QUERY SELECT v_tx_id, v_booking.status;
    RETURN;
  END IF;

  v_net := captured_cents
         - stripe_fee_cents
         - platform_fee_cents
         - twilio_cost_cents;

  INSERT INTO public.transactions (
    booking_id, listing_id, operator_id, kind,
    captured_cents, stripe_fee_cents, platform_fee_cents,
    twilio_cost_cents, net_operator_cents
  )
  VALUES (
    v_booking.id, v_booking.listing_id, rpc_record_payment_capture.operator_id, kind,
    captured_cents, stripe_fee_cents, platform_fee_cents,
    twilio_cost_cents, v_net
  )
  RETURNING id INTO v_tx_id;

  v_final_status := CASE
    WHEN kind = 'no_show_capture' THEN 'no_show'
    ELSE 'completed'
  END;

  UPDATE public.bookings
     SET status                 = v_final_status,
         payment_captured_at    = now(),
         payment_captured_cents = captured_cents,
         updated_at             = now()
   WHERE public.bookings.id = v_booking.id;

  RETURN QUERY SELECT v_tx_id, v_final_status;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_record_payment_capture(uuid, uuid, text, integer, integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_record_payment_capture(uuid, uuid, text, integer, integer, integer, integer)
  TO authenticated, service_role;
