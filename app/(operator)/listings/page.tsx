import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { EmptyListingsCard } from "@/components/listing/empty-listings-card";
import { ListingCard } from "@/components/listing/listing-card";
import { ListingsIndexSkeleton } from "@/components/listing/listings-index-skeleton";
import { Button } from "@/components/ui/button";
import { LISTING_PHOTOS_BUCKET } from "@/lib/services/storage-paths";
import { createClient } from "@/lib/supabase/server";

/**
 * Minimum shape read from the `listings.photos` JSONB column. Declared
 * inline rather than imported from `@/lib/schemas/listing-schema` because
 * the schema's `PhotoInput` carries Zod refinement types that would require
 * extra narrowing here.
 */
interface ListingPhotoRow {
  path: string;
  isHero: boolean;
  position: number;
}

/**
 * Async Server Component body for the operator listings index. Fetches
 * every non-deleted listing owned by the authenticated operator, resolves
 * the hero photo public URL for each row, and hands the results to the
 * pure `<ListingCard>` grid.
 *
 * Exported as a named export so tests can render it directly via
 * `renderAsync` (rendering the outer `<Suspense>`-wrapped `ListingsPage`
 * from RTL would deadlock — same pattern as `DashboardHome`).
 */
export async function ListingsIndexBody() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    notFound();
  }

  // TODO(story-future): add "load more" pagination if any operator exceeds
  // ~30 listings. Current MVP assumes < 30 per operator and loads them all.
  //
  // The `.is("deleted_at", null)` filter is NON-NEGOTIABLE — the operator
  // SELECT RLS policy in 00003_listings.sql filters on operator_id only and
  // does NOT exclude soft-deleted rows. The `.eq("operator_id", user.id)`
  // filter is defense-in-depth, matching the Story 2.2/2.3 pattern.
  const { data: rows, error } = await supabase
    .from("listings")
    .select("id, name, daily_rate_cents, pickup_location, photos, created_at")
    .eq("operator_id", user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[listings-page] listings query failed:", error);
    throw error;
  }

  const listings = (rows ?? []).flatMap((row) => {
    // Supabase's JS client types JSONB columns as `Json`; this is the one
    // unavoidable cast. The shape matches the Story 2.1 wizard's photo
    // upload format and the DB CHECK constraint.
    const photos = row.photos as ListingPhotoRow[] | null;
    if (!photos || photos.length === 0) {
      console.warn("[listings-page] listing has no photos:", row.id);
      return [];
    }
    const hero = photos.find((p) => p.isHero) ?? photos[0];
    const {
      data: { publicUrl },
    } = supabase.storage.from(LISTING_PHOTOS_BUCKET).getPublicUrl(hero.path);
    return [
      {
        id: row.id as string,
        name: row.name as string,
        dailyRateCents: row.daily_rate_cents as number,
        pickupLocation: row.pickup_location as string,
        heroUrl: publicUrl,
        createdAtIso: row.created_at as string,
      },
    ];
  });

  return (
    <div className="flex flex-col gap-space-4">
      <header className="flex flex-wrap items-center justify-between gap-space-4">
        <h1 className="text-h1 lg:text-h1-lg">Listings</h1>
        <Button asChild>
          <Link href="/listings/new">New Listing</Link>
        </Button>
      </header>

      {listings.length === 0 ? (
        <EmptyListingsCard />
      ) : (
        <div className="grid gap-space-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((l) => (
            <ListingCard key={l.id} {...l} />
          ))}
        </div>
      )}
    </div>
  );
}

export function ListingsPage() {
  return (
    <Suspense fallback={<ListingsIndexSkeleton />}>
      <ListingsIndexBody />
    </Suspense>
  );
}

export default ListingsPage;
