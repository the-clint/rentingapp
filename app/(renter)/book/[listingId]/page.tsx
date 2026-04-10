import { Suspense } from "react";
import { notFound } from "next/navigation";
import { MapPin } from "lucide-react";

import { ListingPhotoCarousel } from "@/components/booking/listing-photo-carousel";
import { fetchPublicListing } from "@/lib/services/public-listing";

interface BookingPageProps {
  params: Promise<{ listingId: string }>;
}

function formatDailyRate(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

async function BookingPageBody({ params }: BookingPageProps) {
  const { listingId } = await params;
  const result = await fetchPublicListing(listingId);

  // Collapse "query error" and "not visible" into 404 so the URL does not
  // leak status (draft vs archived vs deleted vs genuinely missing).
  if (!result.success || result.data === null) {
    notFound();
  }

  const listing = result.data;
  const photos = listing.photos.map((p) => ({ path: p.path, url: p.url }));

  return (
    <div className="mx-auto flex max-w-[480px] flex-col gap-space-5 px-space-4 py-space-6">
      <ListingPhotoCarousel photos={photos} listingName={listing.name} />

      <div className="flex flex-col gap-space-3">
        <h1 className="text-display lg:text-display-lg font-bold text-neutral-900">
          {listing.name}
        </h1>
        <p className="text-price font-bold text-neutral-900">
          {formatDailyRate(listing.dailyRateCents)}
          <span className="ml-space-2 text-body font-normal text-neutral-700">
            / day
          </span>
        </p>
        <p className="flex items-center gap-space-2 text-body text-neutral-700">
          <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{listing.pickupLocation}</span>
        </p>
      </div>

      <div className="flex flex-col gap-space-2">
        <h2 className="text-h3 font-semibold text-neutral-900">Description</h2>
        <p className="whitespace-pre-wrap text-body text-neutral-900">
          {listing.description}
        </p>
      </div>
    </div>
  );
}

export function BookingPage({ params }: BookingPageProps) {
  return (
    <Suspense fallback={null}>
      <BookingPageBody params={params} />
    </Suspense>
  );
}

export default BookingPage;
