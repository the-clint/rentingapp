-- Migration: contracts table, RLS, immutability trigger
-- Story: 3-4-digital-contract-signing
--
-- The `contracts` table stores the rendered rental agreement body, the
-- identifying listing + renter + date range, and a `signed_at` timestamp.
-- The row is created in draft form (`signed_at IS NULL`) when the renter
-- lands on the contract page, then updated once and only once when the
-- renter taps "I Agree & Sign".
--
-- Design choices:
--   1. The rendered body is denormalized — we store the full generated
--      text, not a template id + placeholder map. This makes the signed
--      contract a true immutable artifact: if we ever change the template
--      wording, historical contracts still display exactly what the renter
--      agreed to. It also makes Story 5-2 (operator contract access)
--      trivial — the operator just reads `body` and renders it.
--
--   2. Immutability is enforced at the DB layer via a BEFORE UPDATE/DELETE
--      trigger that raises when `OLD.signed_at IS NOT NULL`. Three options
--      were considered:
--        (a) RLS policy denying UPDATE/DELETE on signed rows.
--        (b) A trigger that RAISE EXCEPTIONs.
--        (c) A CHECK constraint.
--      We picked (b) because: RLS policies are per-role and the admin/
--      service client bypasses RLS, so a buggy admin-client write could
--      still mutate a signed row. A CHECK constraint can't compare OLD
--      and NEW columns. A trigger fires for ALL writers, including the
--      service role, which is exactly the guarantee we want. The trigger
--      lives in the `public` schema with `SECURITY DEFINER SET search_path
--      = ''` to match the 00003/00005 hardening pattern.
--
--   3. `booking_id` is nullable in the schema but is populated at sign
--      time. We chose to create the `bookings` row at CONTRACT-SIGN time
--      (not at payment time) so Story 3-5 has a stable `bookingId` to
--      pass to Stripe on the PaymentIntent. The booking starts in status
--      `pending_payment`, which Story 3-5 will transition to `confirmed`
--      once the hold is authorized. See story 3-4 Dev Notes for the full
--      rationale. Migration 00005 left `bookings.status` CHECK allowing
--      only `pending | confirmed | cancelled | completed | no_show`, so
--      this migration extends the CHECK to include `pending_payment`.
--
--   4. RLS:
--        - Renter SELECT: `renter_id = auth.uid()`.
--        - Operator SELECT: join through `bookings` (when populated) OR
--          directly through `listings.operator_id = auth.uid()` — we take
--          the direct listings path since `listing_id` is always populated
--          and it avoids an extra join during draft state.
--        - INSERT is not granted to anon/authenticated — only the service
--          role (admin client) writes. This is consistent with how
--          `otp_attempts` is locked down; Story 3-4's Server Action always
--          uses the admin client because we need to bypass RLS across the
--          read-listing-then-write-contract transaction.
--
--   5. We do NOT tighten `bookings.renter_id` to NOT NULL in this story.
--      Story 3-5 owns that change (follow-up documented in the story file).

-- =============================================================================
-- 1. Extend bookings.status CHECK to allow 'pending_payment'
-- =============================================================================
-- Drop the old check and recreate with the new status added. Forward-only
-- migration; no data exists yet in bookings for any environment.
ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_status_check;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_status_check
  CHECK (status IN (
    'pending',
    'pending_payment',
    'confirmed',
    'cancelled',
    'completed',
    'no_show'
  ));

-- =============================================================================
-- 2. contracts table
-- =============================================================================
CREATE TABLE public.contracts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- `booking_id` is populated at sign time (Story 3-4 creates the booking
  -- row as part of the sign Server Action). Nullable to allow the draft
  -- row to exist before the booking row.
  booking_id      uuid REFERENCES public.bookings (id) ON DELETE SET NULL,
  listing_id      uuid NOT NULL REFERENCES public.listings (id) ON DELETE CASCADE,
  renter_id       uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  renter_phone    text NOT NULL,
  start_date      date NOT NULL,
  end_date        date NOT NULL,
  total_cents     integer NOT NULL CHECK (total_cents >= 0),
  body            text NOT NULL CHECK (char_length(body) >= 100),
  signed_at       timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (start_date <= end_date)
);

CREATE INDEX contracts_listing_id_idx
  ON public.contracts (listing_id);

CREATE INDEX contracts_renter_id_idx
  ON public.contracts (renter_id);

-- Idempotency key for the "one draft per (renter, listing, range)" lookup
-- that `createContractDraft` uses. A renter who reloads the contract page
-- within the same date range gets the same draft id back.
CREATE UNIQUE INDEX contracts_draft_identity_idx
  ON public.contracts (renter_id, listing_id, start_date, end_date)
  WHERE signed_at IS NULL;

-- =============================================================================
-- 3. Immutability trigger — raises on UPDATE/DELETE of signed rows
-- =============================================================================
CREATE OR REPLACE FUNCTION public.contracts_prevent_mutation_after_sign()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.signed_at IS NOT NULL THEN
      RAISE EXCEPTION 'contracts row % is signed and cannot be modified', OLD.id
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.signed_at IS NOT NULL THEN
      RAISE EXCEPTION 'contracts row % is signed and cannot be deleted', OLD.id
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER contracts_prevent_mutation_after_sign_update
  BEFORE UPDATE ON public.contracts
  FOR EACH ROW
  EXECUTE PROCEDURE public.contracts_prevent_mutation_after_sign();

CREATE TRIGGER contracts_prevent_mutation_after_sign_delete
  BEFORE DELETE ON public.contracts
  FOR EACH ROW
  EXECUTE PROCEDURE public.contracts_prevent_mutation_after_sign();

-- =============================================================================
-- 4. RLS — contracts
-- =============================================================================
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

-- Renter can read their own contracts. `auth.uid()` on a phone-OTP session
-- is the `auth.users.id` from the renter's verified phone number.
CREATE POLICY "Renters can select own contracts"
  ON public.contracts FOR SELECT
  TO authenticated
  USING (renter_id = auth.uid());

-- Operator can read contracts for listings they own. We join through
-- `listings` rather than `bookings` because `listing_id` is always
-- populated even for draft (pre-booking) contract rows.
CREATE POLICY "Operators can select contracts for own listings"
  ON public.contracts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.listings
       WHERE id = contracts.listing_id
         AND operator_id = auth.uid()
    )
  );

-- No anon access; no authenticated INSERT/UPDATE/DELETE. All writes go
-- through the Story 3-4 Server Action using the service-role admin client.
REVOKE ALL ON public.contracts FROM anon, authenticated, public;
GRANT SELECT ON public.contracts TO authenticated;
