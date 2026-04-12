-- Migration: Booking cancellation (Story 4-3)
-- Story: 4-3-cancel-booking
--
-- Responsibilities:
--   1. Extend the `bookings` row with two nullable cancellation audit
--      columns:
--        - `cancelled_at timestamptz` — when the cancellation Server Action
--          flipped the booking to cancelled.
--        - `cancellation_outcome text` — 'refunded' (hold released) or
--          'hold_captured' (within-48h policy forced the capture of the
--          full hold instead of a refund). Constrained by a CHECK.
--      The `cancelled` status value was already present in
--      `bookings.status`'s CHECK in migration 00005 — no enum change here.
--   2. Create `rpc_cancel_booking(booking_id, cancellation_outcome)` —
--      a SECURITY DEFINER transactional function that:
--        - Locks the booking row FOR UPDATE.
--        - Verifies the booking exists and is still in a cancellable
--          status ('confirmed' today; 'pending' is intentionally rejected
--          — the renter only lands on /rentals after Story 3-5 confirms).
--        - Deletes the booking_dates rows that project this booking onto
--          the day grid (frees the calendar).
--        - Deletes the matching `maintenance_buffer` row from
--          `listing_blocked_dates` (also freeing the buffer).
--        - Stamps `cancelled_at = now()`, `cancellation_outcome`, and
--          flips status to 'cancelled'.
--        - Raises P0001 with stable error prefixes the Server Action
--          pattern-matches: CANCELLATION_NOT_FOUND,
--          CANCELLATION_NOT_ELIGIBLE, CANCELLATION_INVALID_OUTCOME.
--
-- Design notes:
--   - The Server Action is responsible for the Stripe side-effect
--     (capture vs cancel the PaymentIntent, plus the extension intent if
--     one exists). The Server Action runs Stripe FIRST, then calls this
--     RPC. Rationale: Stripe state transitions (canceled / succeeded) are
--     authoritative and queryable; the RPC mutation is expensive to
--     reverse (we'd have to re-insert booking_dates and the buffer row,
--     then race any newly-landed booking that grabbed the freed calendar
--     day). So we'd rather fail-closed on the DB side: if Stripe succeeds
--     and then the RPC fails, the dates are still reserved and the
--     renter can retry. The Server Action is idempotent — a second
--     attempt re-runs the Stripe call (cancel/capture both swallow
--     "already cancelled / already captured" errors) and re-runs the RPC.
--   - We keep the `maintenance_buffer` lookup intentionally narrow: it
--     matches on `listing_id + reason = 'maintenance_buffer' + overlap
--     with [end_date + 1, end_date + 5]`. Story 4-2 already shrinks this
--     row on extend, so the overlap test uses the CURRENT end_date of
--     the booking (which may have advanced). A booking that was never
--     extended still has a row at [end + 1, end + 5].
--   - SECURITY DEFINER + `SET search_path = ''` mirrors 00008 / 00009.
--   - REVOKE from PUBLIC, GRANT EXECUTE to authenticated + service_role.
--     The admin client (service_role) is what the Server Action uses.

-- =============================================================================
-- 1. Add cancellation audit columns
-- =============================================================================
ALTER TABLE public.bookings
  ADD COLUMN cancelled_at          timestamptz,
  ADD COLUMN cancellation_outcome  text
    CHECK (cancellation_outcome IN ('refunded', 'hold_captured'));

COMMENT ON COLUMN public.bookings.cancelled_at IS
  'Timestamp when the booking was cancelled (Story 4-3). NULL for non-cancelled bookings.';
COMMENT ON COLUMN public.bookings.cancellation_outcome IS
  'Outcome of the cancellation (Story 4-3): refunded = Stripe hold released in full; hold_captured = within 48h of start so the hold was captured (non-refundable). NULL for non-cancelled bookings.';

-- =============================================================================
-- 2. rpc_cancel_booking — transactional cancellation function
-- =============================================================================
CREATE OR REPLACE FUNCTION public.rpc_cancel_booking(
  booking_id             uuid,
  cancellation_outcome   text
)
RETURNS TABLE (
  id         uuid,
  listing_id uuid,
  new_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_booking public.bookings%ROWTYPE;
BEGIN
  IF cancellation_outcome IS NULL
     OR cancellation_outcome NOT IN ('refunded', 'hold_captured') THEN
    RAISE EXCEPTION 'CANCELLATION_INVALID_OUTCOME: expected refunded | hold_captured, got %', cancellation_outcome
      USING ERRCODE = 'P0001';
  END IF;

  -- Load + lock the booking row.
  SELECT *
    INTO v_booking
    FROM public.bookings
   WHERE public.bookings.id = rpc_cancel_booking.booking_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CANCELLATION_NOT_FOUND: no booking with id %', booking_id
      USING ERRCODE = 'P0001';
  END IF;

  -- Idempotency: if the booking is already cancelled, return the row
  -- unchanged. The Server Action's outer Stripe step is also idempotent
  -- (cancel + capture swallow "already done"), so a retry path returns
  -- the same success to the caller.
  IF v_booking.status = 'cancelled' THEN
    RETURN QUERY
      SELECT v_booking.id, v_booking.listing_id, v_booking.status;
    RETURN;
  END IF;

  -- Only confirmed bookings can be cancelled by the renter. pending_payment
  -- is handled by the booking flow abandon path, not here. completed /
  -- no_show are historical. The Server Action's lifecycle gate is the
  -- primary guard; this is a belt-and-suspenders check.
  IF v_booking.status <> 'confirmed' THEN
    RAISE EXCEPTION 'CANCELLATION_NOT_ELIGIBLE: booking status is %, expected confirmed', v_booking.status
      USING ERRCODE = 'P0001';
  END IF;

  -- Free the calendar: drop the per-day projection rows for this booking.
  -- The foreign key from booking_dates → bookings has ON DELETE CASCADE,
  -- but we delete explicitly (rather than deleting the booking itself)
  -- because we want to keep the booking row for history / audit.
  DELETE FROM public.booking_dates
    WHERE booking_id = v_booking.id;

  -- Free the maintenance buffer that migration 00008 inserted (and that
  -- Story 4-2 may have shrunk). Scope the delete to the booking's listing
  -- and overlap the window [end + 1, end + 5], which tolerates a buffer
  -- that was shrunk by a prior extension.
  DELETE FROM public.listing_blocked_dates
    WHERE listing_id = v_booking.listing_id
      AND reason = 'maintenance_buffer'
      AND start_date <= (v_booking.end_date + 5)
      AND end_date   >= (v_booking.end_date + 1);

  -- Flip status + stamp audit columns.
  UPDATE public.bookings
     SET status                = 'cancelled',
         cancelled_at          = now(),
         cancellation_outcome  = rpc_cancel_booking.cancellation_outcome,
         updated_at            = now()
   WHERE public.bookings.id = v_booking.id;

  RETURN QUERY
    SELECT v_booking.id, v_booking.listing_id, 'cancelled'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_cancel_booking(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_cancel_booking(uuid, text)
  TO authenticated, service_role;
