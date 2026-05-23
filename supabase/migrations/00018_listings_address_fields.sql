-- Migration: structured address fields for listings
--
-- Splits the freeform `pickup_location` into four columns so we can publicly
-- expose only city/state/zip while keeping the street address gated behind a
-- confirmed booking. The legacy `pickup_location` column is retained as the
-- "full address" string and is kept in sync by `lib/actions/listing-actions.ts`
-- on every insert/update. Anon (renter-facing booking page) reads only the
-- city/state/zip columns via the updated column-level grant below.

-- 1. Add new columns (nullable for backfill)
ALTER TABLE public.listings
  ADD COLUMN address_street text,
  ADD COLUMN address_city   text,
  ADD COLUMN address_state  text,
  ADD COLUMN address_zip    text;

-- 2. Backfill: dump the existing freeform string into city so no data is lost.
-- Operators can re-edit to structure it properly via the new address form.
UPDATE public.listings
SET
  address_street = '',
  address_city   = pickup_location,
  address_state  = 'UT',
  address_zip    = ''
WHERE address_city IS NULL;

-- 3. Constrain
ALTER TABLE public.listings
  ALTER COLUMN address_street SET NOT NULL,
  ALTER COLUMN address_city   SET NOT NULL,
  ALTER COLUMN address_state  SET NOT NULL,
  ALTER COLUMN address_zip    SET NOT NULL,
  ADD CONSTRAINT listings_address_street_check CHECK (char_length(address_street) <= 120),
  ADD CONSTRAINT listings_address_city_check   CHECK (char_length(trim(address_city)) BETWEEN 1 AND 80),
  ADD CONSTRAINT listings_address_state_check  CHECK (char_length(address_state) = 2),
  ADD CONSTRAINT listings_address_zip_check    CHECK (address_zip = '' OR address_zip ~ '^[0-9]{5}(-[0-9]{4})?$');

-- 4. Update anon column-level grants: remove `pickup_location` (full address),
-- add city/state/zip. Street is intentionally NOT granted to anon. Authenticated
-- users (operators on their own rows; admin client used by post-booking
-- services) keep full access via the RLS policies in 00003.
REVOKE SELECT ON public.listings FROM anon;
GRANT SELECT (
  id,
  operator_id,
  name,
  description,
  daily_rate_cents,
  address_city,
  address_state,
  address_zip,
  photos,
  status,
  available_from,
  created_at,
  updated_at,
  deleted_at
) ON public.listings TO anon;
