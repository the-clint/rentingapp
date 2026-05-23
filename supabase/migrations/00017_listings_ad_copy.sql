-- Migration: add ad_copy column to listings for the posting assistant
-- Operators can edit and persist a customized ad copy per listing. NULL
-- means "use the generated default". Not exposed to anon — this column is
-- intentionally omitted from the anon GRANT in migration 00003.

ALTER TABLE public.listings
  ADD COLUMN ad_copy text
    CHECK (ad_copy IS NULL OR char_length(ad_copy) <= 10000);
