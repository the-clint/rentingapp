-- Migration: Booking extensions (Story 4-2)
-- Story: 4-2-extend-rental
--
-- Responsibilities:
--   1. Add `bookings.stripe_extension_intent_id` (text, nullable) to store
--      the PaymentIntent that holds the additional delta amount for an
--      extended rental. Story 4-2 uses a SEPARATE PaymentIntent for the
--      delta rather than mutating the original hold — see Dev Notes in
--      the story file for the tradeoff analysis.
--   2. Create `rpc_extend_booking(booking_id, extend_days, payment_intent_id)`
--      — transactional extension function that:
--        - Locks the booking row FOR UPDATE.
--        - Validates status = 'confirmed' (only live rentals can extend).
--        - Validates extend_days is between 1 and the remaining
--          maintenance-buffer days (5-day buffer minus the mandatory
--          1-day maintenance tail).
--        - Recomputes total_cents from the listing's daily_rate_cents
--          (NEVER trusts the stored total_cents or any caller input).
--        - Inserts new booking_dates rows for each added day. The unique
--          (listing_id, date) constraint converts a race-loss into
--          `EXTENSION_CONFLICT`.
--        - Shrinks the maintenance buffer row in listing_blocked_dates:
--          pushes `start_date` forward by extend_days, or deletes the
--          row entirely if the extension consumes all non-maintenance
--          buffer days.
--        - Flips `bookings.end_date`, `total_cents`,
--          `stripe_extension_intent_id`, `updated_at`.
--   3. Raises P0001 with stable message prefixes the Server Action
--      pattern-matches: `EXTENSION_NOT_ELIGIBLE`,
--      `EXTENSION_LIMIT_EXCEEDED`, `EXTENSION_CONFLICT`,
--      `EXTENSION_NOT_FOUND`.
--
-- Design choices:
--   - SECURITY DEFINER + `SET search_path = ''` mirrors
--     rpc_confirm_booking (migration 00008).
--   - Buffer shrink vs delete: if the extension consumes every buffer
--     day except the 1 mandatory maintenance day, we still preserve
--     exactly 1 buffer row covering [new_end + 1, new_end + 1]. The
--     row is only deleted if the original buffer had 0 days remaining
--     AFTER subtracting the mandatory maintenance day (which would
--     mean the operator configured a 1-day buffer with no extension
--     room — nothing to do in that case, and the function rejects the
--     attempt earlier with EXTENSION_LIMIT_EXCEEDED).
--   - The function has no Stripe knowledge. The Server Action owns
--     the Stripe rollback (cancelExtensionIntent on EXTENSION_CONFLICT).

-- =============================================================================
-- 1. Add stripe_extension_intent_id column
-- =============================================================================
ALTER TABLE public.bookings
  ADD COLUMN stripe_extension_intent_id text;

COMMENT ON COLUMN public.bookings.stripe_extension_intent_id IS
  'Stripe PaymentIntent id for the extension delta hold (Story 4-2). NULL for bookings that have not been extended. Story 5-4 captures both the original stripe_payment_intent_id and this one.';

-- =============================================================================
-- 2. rpc_extend_booking — transactional extension function
-- =============================================================================
CREATE OR REPLACE FUNCTION public.rpc_extend_booking(
  booking_id         uuid,
  extend_days        integer,
  payment_intent_id  text
)
RETURNS TABLE (
  id              uuid,
  listing_id      uuid,
  new_end_date    date,
  new_total_cents integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_booking            public.bookings%ROWTYPE;
  v_listing_daily_rate integer;
  v_new_end_date       date;
  v_new_total_cents    integer;
  v_buffer_row         public.listing_blocked_dates%ROWTYPE;
  v_buffer_days_total  integer;
  v_buffer_days_avail  integer;
  v_new_buffer_start   date;
BEGIN
  -- Input validation.
  IF extend_days IS NULL OR extend_days < 1 OR extend_days > 4 THEN
    RAISE EXCEPTION 'EXTENSION_LIMIT_EXCEEDED: extend_days must be 1..4, got %', extend_days
      USING ERRCODE = 'P0001';
  END IF;

  IF payment_intent_id IS NULL OR payment_intent_id = '' THEN
    RAISE EXCEPTION 'EXTENSION_NOT_ELIGIBLE: payment_intent_id is required'
      USING ERRCODE = 'P0001';
  END IF;

  -- Load + lock the booking row.
  SELECT *
    INTO v_booking
    FROM public.bookings
   WHERE public.bookings.id = rpc_extend_booking.booking_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'EXTENSION_NOT_FOUND: no booking with id %', booking_id
      USING ERRCODE = 'P0001';
  END IF;

  -- Only confirmed bookings can extend. pending_payment, cancelled,
  -- completed, no_show are all rejected. The lifecycle helper in
  -- `rental-lifecycle.ts` is a further gate at the Server Action layer.
  IF v_booking.status <> 'confirmed' THEN
    RAISE EXCEPTION 'EXTENSION_NOT_ELIGIBLE: booking status is %, expected confirmed', v_booking.status
      USING ERRCODE = 'P0001';
  END IF;

  -- Look up the maintenance buffer row. Migration 00008 inserts exactly
  -- one `maintenance_buffer` row per confirmed booking covering
  -- [end_date + 1, end_date + 5]. If a prior extension already shrank
  -- it, `start_date` is higher than `end_date + 1`.
  SELECT *
    INTO v_buffer_row
    FROM public.listing_blocked_dates
   WHERE listing_id = v_booking.listing_id
     AND reason = 'maintenance_buffer'
     AND start_date <= (v_booking.end_date + 5)
     AND end_date   >= (v_booking.end_date + 1)
   ORDER BY start_date
   LIMIT 1;

  IF NOT FOUND THEN
    -- No buffer row — the operator or a prior flow deleted it. Treat
    -- as ineligible rather than silently inserting dates that would
    -- collide with a new booking.
    RAISE EXCEPTION 'EXTENSION_NOT_ELIGIBLE: no maintenance buffer found for booking %', booking_id
      USING ERRCODE = 'P0001';
  END IF;

  -- Compute remaining buffer days. The maintenance buffer covers
  -- [start_date, end_date] inclusive. Subtract the mandatory 1
  -- maintenance tail day from the total to get the extension capacity.
  v_buffer_days_total := (v_buffer_row.end_date - v_buffer_row.start_date) + 1;
  v_buffer_days_avail := v_buffer_days_total - 1; -- reserve 1 mandatory day

  IF v_buffer_days_avail < 1 THEN
    RAISE EXCEPTION 'EXTENSION_LIMIT_EXCEEDED: no extension capacity remaining'
      USING ERRCODE = 'P0001';
  END IF;

  IF extend_days > v_buffer_days_avail THEN
    RAISE EXCEPTION 'EXTENSION_LIMIT_EXCEEDED: requested % days, only % available', extend_days, v_buffer_days_avail
      USING ERRCODE = 'P0001';
  END IF;

  -- Fetch listing daily rate server-side (NEVER trust client input).
  SELECT daily_rate_cents
    INTO v_listing_daily_rate
    FROM public.listings
   WHERE id = v_booking.listing_id;

  IF NOT FOUND OR v_listing_daily_rate IS NULL THEN
    RAISE EXCEPTION 'EXTENSION_NOT_ELIGIBLE: listing not found for booking %', booking_id
      USING ERRCODE = 'P0001';
  END IF;

  v_new_end_date    := v_booking.end_date + extend_days;
  v_new_total_cents := v_booking.total_cents + (v_listing_daily_rate * extend_days);

  -- Insert new booking_dates rows for each added day. The unique
  -- (listing_id, date) constraint will raise unique_violation if
  -- something has claimed those dates (shouldn't happen — the buffer
  -- row covered them — but handle it defensively).
  BEGIN
    INSERT INTO public.booking_dates (booking_id, listing_id, date)
    SELECT v_booking.id,
           v_booking.listing_id,
           gs::date
      FROM generate_series(
        (v_booking.end_date + 1)::timestamp,
        v_new_end_date::timestamp,
        interval '1 day'
      ) AS gs;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'EXTENSION_CONFLICT: one or more extension dates were just booked'
        USING ERRCODE = 'P0001';
  END;

  -- Shrink the buffer row: advance start_date by extend_days so the
  -- new buffer covers [new_end + (buffer_days_avail + 1 - extend_days),
  -- old_end + buffer_days_total]. In practice: the buffer row always
  -- ends at `old_end + buffer_days_total`, and the new start is
  -- `new_end_date + 1`. (If extend_days == buffer_days_avail, the new
  -- buffer is exactly the 1-day mandatory maintenance tail.)
  v_new_buffer_start := v_new_end_date + 1;

  IF v_new_buffer_start > v_buffer_row.end_date THEN
    -- Defensive: should never happen because extend_days is bounded by
    -- buffer_days_avail (total - 1), but if it did, delete the row
    -- rather than insert an inverted range.
    DELETE FROM public.listing_blocked_dates
      WHERE id = v_buffer_row.id;
  ELSE
    UPDATE public.listing_blocked_dates
       SET start_date = v_new_buffer_start
     WHERE id = v_buffer_row.id;
  END IF;

  -- Update the booking row.
  UPDATE public.bookings
     SET end_date                   = v_new_end_date,
         total_cents                = v_new_total_cents,
         stripe_extension_intent_id = rpc_extend_booking.payment_intent_id,
         updated_at                 = now()
   WHERE public.bookings.id = v_booking.id;

  RETURN QUERY
    SELECT v_booking.id,
           v_booking.listing_id,
           v_new_end_date,
           v_new_total_cents;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_extend_booking(uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_extend_booking(uuid, integer, text)
  TO authenticated, service_role;
