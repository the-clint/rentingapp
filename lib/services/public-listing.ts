/**
 * Public (anon-visible) listing fetch used by the renter-facing booking page
 * at `app/(renter)/book/[listingId]/page.tsx`.
 *
 * The query relies on the "Public can read published listings" RLS policy and
 * the column-level grant from `supabase/migrations/00003_listings.sql`. Both
 * were shipped by Story 2.1 with an explicit comment pointing at this story
 * (3.1) as the entry point. As a defense-in-depth measure we also filter on
 * `status = 'published' AND deleted_at IS NULL` in the query itself.
 *
 * IMPORTANT: this helper does NOT select `pickup_instructions`. The anon role
 * has no column-level grant on that column (intentionally — it may contain
 * gate codes / lockbox combos) and requesting it would hard-fail the query.
 *
 * Story 3.1: Renter Listing Page & Photo Carousel.
 */

import { createClient } from "@/lib/supabase/server";
import { LISTING_PHOTOS_BUCKET } from "@/lib/services/storage-paths";
import { ok, err, type Result } from "@/lib/utils/result";

export interface PublicListingPhoto {
  path: string;
  isHero: boolean;
  position: number;
  url: string;
}

export interface PublicListing {
  id: string;
  name: string;
  description: string;
  dailyRateCents: number;
  /**
   * Public-safe location label, e.g. "Provo, UT 84601". The street address is
   * intentionally omitted — full pickup details are only revealed to a renter
   * after their booking is confirmed (see lib/services/renter-rentals.ts).
   */
  publicLocation: string;
  addressCity: string;
  addressState: string;
  addressZip: string;
  photos: PublicListingPhoto[];
}

export type ListingFetchError = "DATABASE_ERROR";

interface PublicListingRow {
  id: string;
  name: string;
  description: string;
  daily_rate_cents: number;
  address_city: string;
  address_state: string;
  address_zip: string;
  photos: Array<{ path: string; isHero: boolean; position: number }> | null;
}

/**
 * Fetch a single published listing by id for renter consumption.
 *
 * Returns:
 *  - `ok(PublicListing)` on happy path
 *  - `ok(null)` when no row is visible to anon (draft, archived, deleted,
 *    missing — all collapsed into "not found" so the URL does not leak
 *    status information)
 *  - `err("DATABASE_ERROR", ...)` when the query itself fails
 */
export async function fetchPublicListing(
  listingId: string,
): Promise<Result<PublicListing | null>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("listings")
    .select(
      "id, name, description, daily_rate_cents, address_city, address_state, address_zip, photos",
    )
    .eq("id", listingId)
    .eq("status", "published")
    .is("deleted_at", null)
    .maybeSingle<PublicListingRow>();

  if (error) {
    return err("DATABASE_ERROR", error.message);
  }
  if (!data) {
    return ok(null);
  }

  const rawPhotos = data.photos ?? [];
  const sorted = [...rawPhotos].sort((a, b) => a.position - b.position);
  const photos: PublicListingPhoto[] = sorted.map((p) => ({
    path: p.path,
    isHero: p.isHero,
    position: p.position,
    url: supabase.storage.from(LISTING_PHOTOS_BUCKET).getPublicUrl(p.path).data
      .publicUrl,
  }));

  const publicLocation = [
    data.address_city,
    [data.address_state, data.address_zip].filter(Boolean).join(" "),
  ]
    .filter((s) => s && s.trim().length > 0)
    .join(", ");

  return ok({
    id: data.id,
    name: data.name,
    description: data.description,
    dailyRateCents: data.daily_rate_cents,
    publicLocation,
    addressCity: data.address_city,
    addressState: data.address_state,
    addressZip: data.address_zip,
    photos,
  });
}
