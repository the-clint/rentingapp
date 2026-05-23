import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { EditListingForm } from "@/components/listing/edit-listing-form";
import type { PhotoDraft } from "@/components/listing/photo-uploader";
import type { DetailsDraft } from "@/components/listing/listing-details-fields";
import { createClient } from "@/lib/supabase/server";
import { LISTING_PHOTOS_BUCKET } from "@/lib/services/storage-paths";

interface ListingEditPageProps {
  params: Promise<{ listingId: string }>;
}

interface ListingRow {
  id: string;
  name: string;
  description: string;
  daily_rate_cents: number;
  address_street: string;
  address_city: string;
  address_state: string;
  address_zip: string;
  pickup_instructions: string | null;
  photos: Array<{ path: string; isHero: boolean; position: number }> | null;
}

async function ListingEditBody({
  params,
}: {
  params: Promise<{ listingId: string }>;
}) {
  const { listingId } = await params;

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
      "id, name, description, daily_rate_cents, address_street, address_city, address_state, address_zip, pickup_instructions, photos",
    )
    .eq("id", listingId)
    .eq("operator_id", user.id)
    .is("deleted_at", null)
    .maybeSingle<ListingRow>();

  if (!listing) {
    notFound();
  }

  const details: DetailsDraft = {
    name: listing.name,
    description: listing.description,
    dailyRateCents: listing.daily_rate_cents,
    addressStreet: listing.address_street,
    addressCity: listing.address_city,
    addressState: listing.address_state,
    addressZip: listing.address_zip,
    pickupInstructions: listing.pickup_instructions ?? "",
  };

  // Existing photos are synthesized as `PhotoDraft` entries with resolved
  // public URLs so the `PhotoUploader` tiles render their previews.
  const photos: PhotoDraft[] = (listing.photos ?? []).map((p) => ({
    path: p.path,
    isHero: p.isHero,
    position: p.position,
    previewUrl: supabase.storage
      .from(LISTING_PHOTOS_BUCKET)
      .getPublicUrl(p.path).data.publicUrl,
  }));

  return (
    <div className="flex flex-col gap-space-4">
      <Link
        href={`/listings/${listing.id}`}
        className="text-sm text-primary-dark underline-offset-4 hover:underline"
      >
        ← Cancel
      </Link>
      <h1 className="text-h1 lg:text-h1-lg">Edit listing</h1>
      <p className="text-h2 text-neutral-700">{listing.name}</p>
      <EditListingForm
        listingId={listing.id}
        operatorId={user.id}
        initialValues={{ details, photos }}
      />
    </div>
  );
}

export function ListingEditPage({ params }: ListingEditPageProps) {
  return (
    <Suspense
      fallback={<p className="text-body text-neutral-700">Loading…</p>}
    >
      <ListingEditBody params={params} />
    </Suspense>
  );
}

export default ListingEditPage;
