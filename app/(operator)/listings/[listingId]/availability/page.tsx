import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { OperatorAvailabilityCalendar } from "@/components/availability/operator-availability-calendar";
import { CalendarSkeleton } from "@/components/availability/calendar-skeleton";
import { getListingBlockedDates } from "@/lib/actions/availability-actions";
import { createClient } from "@/lib/supabase/server";

interface ListingAvailabilityPageProps {
  params: Promise<{ listingId: string }>;
}

interface ListingRow {
  id: string;
  name: string;
}

async function ListingAvailabilityBody({
  params,
}: {
  params: Promise<{ listingId: string }>;
}) {
  const { listingId } = await params;

  const supabase = await createClient();
  const { data: listing } = await supabase
    .from("listings")
    .select("id, name")
    .eq("id", listingId)
    .maybeSingle<ListingRow>();

  if (!listing) {
    notFound();
  }

  const blocksResult = await getListingBlockedDates(listing.id);
  const initialBlocks = blocksResult.success ? blocksResult.data : [];

  return (
    <div className="flex flex-col gap-space-4">
      <div className="flex flex-col gap-space-2">
        <Link
          href={`/listings/${listing.id}`}
          className="text-sm text-primary-dark underline-offset-4 hover:underline"
        >
          ← Back to listing
        </Link>
        <h1 className="text-h1 lg:text-h1-lg">{listing.name}</h1>
        <p className="text-h2 text-neutral-700">Manage availability</p>
      </div>
      <OperatorAvailabilityCalendar
        listingId={listing.id}
        initialBlocks={initialBlocks}
      />
    </div>
  );
}

export function ListingAvailabilityPage({ params }: ListingAvailabilityPageProps) {
  return (
    <Suspense fallback={<CalendarSkeleton />}>
      <ListingAvailabilityBody params={params} />
    </Suspense>
  );
}

export default ListingAvailabilityPage;
