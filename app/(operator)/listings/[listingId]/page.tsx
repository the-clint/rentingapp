import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import {
  ListingDetailView,
  type ListingDetailPhoto,
  type ListingDetailViewData,
} from "@/components/listing/listing-detail-view";
import { createClient } from "@/lib/supabase/server";
import { LISTING_PHOTOS_BUCKET } from "@/lib/services/storage-paths";

interface ListingDetailPageProps {
  params: Promise<{ listingId: string }>;
  searchParams: Promise<{ posted?: string }>;
}

/**
 * Build the renter-facing booking URL. Priority (per Story 2.5 AC #9):
 *   1. `NEXT_PUBLIC_SITE_URL` env var (strip trailing slash)
 *   2. `x-forwarded-proto` + `host` request headers
 *   3. `http://everything.test` fallback for local dev
 *
 * The `/book/{listingId}` route itself ships in Epic 3 Story 3.1 — clicking
 * today will 404, which is expected.
 */
async function buildBookingUrl(listingId: string): Promise<string> {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (envUrl) {
    return `${envUrl.replace(/\/$/, "")}/book/${listingId}`;
  }
  const h = await headers();
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  if (host) {
    return `${proto}://${host}/book/${listingId}`;
  }
  return `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://everything.test"}/book/${listingId}`;
}

interface ListingRow {
  id: string;
  name: string;
  description: string;
  daily_rate_cents: number;
  pickup_location: string;
  pickup_instructions: string | null;
  photos: Array<{ path: string; isHero: boolean; position: number }> | null;
  ad_copy: string | null;
}

async function ListingDetailBody({
  params,
  searchParams,
}: {
  params: Promise<{ listingId: string }>;
  searchParams: Promise<{ posted?: string }>;
}) {
  const { listingId } = await params;
  const awaitedSearchParams = await searchParams;
  const bookingUrl = await buildBookingUrl(listingId);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    notFound();
  }

  const { data: listing } = await supabase
    .from("listings")
    .select(
      "id, name, description, daily_rate_cents, pickup_location, pickup_instructions, photos, ad_copy",
    )
    .eq("id", listingId)
    .eq("operator_id", user.id)
    .is("deleted_at", null)
    .maybeSingle<ListingRow>();

  if (!listing) {
    notFound();
  }

  // Resolve public URLs for every photo. `getPublicUrl` is a pure string
  // operation under the hood so we can do this inline without a per-photo
  // round-trip.
  const photos: ListingDetailPhoto[] = (listing.photos ?? []).map((p) => ({
    path: p.path,
    isHero: p.isHero,
    position: p.position,
    url: supabase.storage.from(LISTING_PHOTOS_BUCKET).getPublicUrl(p.path).data
      .publicUrl,
  }));

  const data: ListingDetailViewData = {
    id: listing.id,
    name: listing.name,
    description: listing.description,
    daily_rate_cents: listing.daily_rate_cents,
    pickup_location: listing.pickup_location,
    pickup_instructions: listing.pickup_instructions,
    photos,
    ad_copy: listing.ad_copy,
  };

  return (
    <div className="flex flex-col gap-space-4">
      <Link
        href="/listings"
        className="text-sm text-primary-dark underline-offset-4 hover:underline"
      >
        ← Back to listings
      </Link>
      <h1 className="text-h1 lg:text-h1-lg">{listing.name}</h1>
      <ListingDetailView
        listing={data}
        bookingUrl={bookingUrl}
        initialAssistantOpen={awaitedSearchParams.posted === "1"}
      />
    </div>
  );
}

export function ListingDetailPage({
  params,
  searchParams,
}: ListingDetailPageProps) {
  return (
    <Suspense
      fallback={<p className="text-body text-neutral-700">Loading…</p>}
    >
      <ListingDetailBody params={params} searchParams={searchParams} />
    </Suspense>
  );
}

export default ListingDetailPage;
