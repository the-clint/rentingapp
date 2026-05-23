import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { MapPin } from "lucide-react";

import { BookingFlow } from "@/components/booking/booking-flow";
import { ListingPhotoCarousel } from "@/components/booking/listing-photo-carousel";
import { PreBookingInquiry } from "@/components/booking/pre-booking-inquiry";
import { fetchPublicAvailability } from "@/lib/services/public-availability";
import { fetchPublicListing } from "@/lib/services/public-listing";
import { getBookingFlowResumePoint } from "@/lib/services/booking-flow-state";
import { createClient } from "@/lib/supabase/server";
import { toDateKey } from "@/lib/utils/date-range";

interface BookingPageProps {
  params: Promise<{ listingId: string }>;
  searchParams: Promise<{ start?: string; end?: string }>;
}

function formatDailyRate(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

async function BookingPageBody({ params, searchParams }: BookingPageProps) {
  const { listingId } = await params;
  const { start, end } = await searchParams;
  const result = await fetchPublicListing(listingId);

  // Collapse "query error" and "not visible" into 404 so the URL does not
  // leak status (draft vs archived vs deleted vs genuinely missing).
  if (!result.success || result.data === null) {
    notFound();
  }

  const listing = result.data;

  // Story 3-6: if the renter has already made progress on this listing for
  // the dates in the URL, short-circuit them forward to the right step.
  // Gated on having both dates AND a renter session — without those we
  // can't meaningfully resume.
  if (start && end) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const resume = await getBookingFlowResumePoint({
        renterId: user.id,
        listingId: listing.id,
        startDate: start,
        endDate: end,
      });
      if (resume.success) {
        const qs = `start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&resumed=1`;
        if (resume.data.step === "confirmed" && resume.data.bookingId) {
          redirect(
            `/book/${listing.id}/confirmed?bookingId=${encodeURIComponent(resume.data.bookingId)}&resumed=1`,
          );
        }
        if (resume.data.step === "payment" && resume.data.bookingId) {
          redirect(
            `/book/${listing.id}/payment?bookingId=${encodeURIComponent(resume.data.bookingId)}&resumed=1`,
          );
        }
        if (resume.data.step === "contract") {
          redirect(`/book/${listing.id}/contract?${qs}`);
        }
      }
    }
  }
  const photos = listing.photos.map((p) => ({ path: p.path, url: p.url }));

  // Current-month window for the initial server-rendered availability paint.
  const now = new Date();
  const year = now.getUTCFullYear();
  const monthZeroIndexed = now.getUTCMonth();
  const startKey = toDateKey(new Date(Date.UTC(year, monthZeroIndexed, 1)));
  const endKey = toDateKey(new Date(Date.UTC(year, monthZeroIndexed + 1, 0)));
  const availabilityResult = await fetchPublicAvailability({
    listingId: listing.id,
    startDate: startKey,
    endDate: endKey,
  });
  const initialAvailability = availabilityResult.success
    ? availabilityResult.data
    : [];

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
          <span>{listing.publicLocation}</span>
        </p>
      </div>

      <div className="flex flex-col gap-space-2">
        <h2 className="text-h3 font-semibold text-neutral-900">Description</h2>
        <p className="whitespace-pre-wrap text-body text-neutral-900">
          {listing.description}
        </p>
      </div>

      <PreBookingInquiry listingId={listing.id} />

      <BookingFlow
        listingId={listing.id}
        dailyRateCents={listing.dailyRateCents}
        initialAvailability={initialAvailability}
        initialYear={year}
        initialMonthZeroIndexed={monthZeroIndexed}
      />
    </div>
  );
}

export function BookingPage({ params, searchParams }: BookingPageProps) {
  return (
    <Suspense fallback={null}>
      <BookingPageBody params={params} searchParams={searchParams} />
    </Suspense>
  );
}

export default BookingPage;
