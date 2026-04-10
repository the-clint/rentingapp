-- Migration: listings table, RLS, storage bucket + policies
-- Story: 2-1-create-listing-with-photos-and-details

-- =============================================================================
-- 1. listings table
-- =============================================================================
CREATE TABLE public.listings (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id           uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name                  text NOT NULL CHECK (char_length(trim(name)) BETWEEN 3 AND 80),
  description           text NOT NULL CHECK (char_length(trim(description)) BETWEEN 20 AND 2000),
  daily_rate_cents      integer NOT NULL CHECK (daily_rate_cents >= 100),
  pickup_location       text NOT NULL CHECK (char_length(trim(pickup_location)) BETWEEN 3 AND 120),
  pickup_instructions   text CHECK (pickup_instructions IS NULL OR char_length(pickup_instructions) <= 1000),
  photos                jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(photos) = 'array' AND jsonb_array_length(photos) BETWEEN 1 AND 10),
  status                text NOT NULL DEFAULT 'published'
    CHECK (status IN ('draft', 'published', 'archived')),
  available_from        date NOT NULL DEFAULT current_date,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  deleted_at            timestamptz
);

CREATE INDEX listings_operator_id_idx ON public.listings (operator_id) WHERE deleted_at IS NULL;
CREATE INDEX listings_status_idx      ON public.listings (status)      WHERE deleted_at IS NULL;

-- updated_at trigger
-- SECURITY DEFINER + empty search_path mirrors the hardening in 00002 and
-- silences the Supabase `function_search_path_mutable` lint.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = pg_catalog.now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER listings_set_updated_at
  BEFORE UPDATE ON public.listings
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

-- =============================================================================
-- 2. RLS policies for listings
-- =============================================================================
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;

-- Operators have full access to their own rows (including soft-deleted ones).
-- Defense-in-depth: every write policy ALSO requires the calling user to have
-- a profile row with `role = 'operator'`. This way the data layer enforces
-- the role check even if a future routing change accidentally exposes a
-- Server Action to a non-operator session — proxy.ts is no longer the only
-- gate. Reads on own rows are unrestricted (matches dashboard ownership).
CREATE POLICY "Operators can select own listings"
  ON public.listings FOR SELECT
  TO authenticated
  USING (operator_id = auth.uid());

CREATE POLICY "Operators can insert own listings"
  ON public.listings FOR INSERT
  TO authenticated
  WITH CHECK (
    operator_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles
       WHERE id = auth.uid() AND role = 'operator'
    )
  );

CREATE POLICY "Operators can update own listings"
  ON public.listings FOR UPDATE
  TO authenticated
  USING (operator_id = auth.uid())
  WITH CHECK (
    operator_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles
       WHERE id = auth.uid() AND role = 'operator'
    )
  );

CREATE POLICY "Operators can delete own listings"
  ON public.listings FOR DELETE
  TO authenticated
  USING (operator_id = auth.uid());

-- Anyone (anon + authenticated) can read published, non-deleted listings.
-- This powers the renter-facing /book/[listing-id] page in Epic 3.
CREATE POLICY "Public can read published listings"
  ON public.listings FOR SELECT
  TO anon, authenticated
  USING (status = 'published' AND deleted_at IS NULL);

-- =============================================================================
-- 2b. Column-level privacy: hide pickup_instructions from anon
-- =============================================================================
-- `pickup_instructions` is intended to hold renter-sensitive details such as
-- gate codes, lockbox combinations, or door entry instructions. The public
-- read policy above grants ROW access to anon visitors of the booking page,
-- but those rows must NOT include the pickup instructions column. PostgreSQL
-- column-level grants are the right tool here — they apply on top of RLS, so
-- anon SELECTs will fail loudly if they request the omitted column.
-- Operators (authenticated) keep full column access via the policies above.
REVOKE SELECT ON public.listings FROM anon;
GRANT SELECT (
  id,
  operator_id,
  name,
  description,
  daily_rate_cents,
  pickup_location,
  photos,
  status,
  available_from,
  created_at,
  updated_at,
  deleted_at
) ON public.listings TO anon;

-- =============================================================================
-- 3. listing-photos Storage bucket
-- =============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('listing-photos', 'listing-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Public anonymous read (renter booking pages)
CREATE POLICY "Public can read listing photos"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'listing-photos');

-- Authenticated users can upload ONLY under their own {auth.uid()}/ prefix
CREATE POLICY "Operators can upload their own listing photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'listing-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Operators can update their own listing photos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'listing-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Operators can delete their own listing photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'listing-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
