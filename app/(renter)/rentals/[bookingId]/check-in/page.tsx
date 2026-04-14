/**
 * Check-in rental page (Story 4-4).
 *
 * Server Component. Verifies the renter session, loads booking + listing
 * via `previewCheckIn`, and hands the result to `CheckInFlow`. Ineligible
 * or unauthenticated visitors bounce to `/rentals/verify` or `/rentals`
 * respectively — matching the pattern established in the cancel page.
 */

import { redirect } from "next/navigation";
import { Suspense } from "react";

import { CheckInFlow } from "@/components/rentals/check-in-flow";
import { previewCheckIn } from "@/lib/actions/check-in-actions";
import { createClient } from "@/lib/supabase/server";

interface CheckInRentalPageParams {
  params: Promise<{ bookingId: string }>;
}

async function CheckInRentalPageBody({ params }: CheckInRentalPageParams) {
  const { bookingId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(
      `/rentals/verify?returnTo=${encodeURIComponent(`/rentals/${bookingId}/check-in`)}`,
    );
  }

  const preview = await previewCheckIn(bookingId);
  if (!preview.success) {
    redirect("/rentals");
  }

  const data = preview.data;

  return (
    <div className="mx-auto flex max-w-[480px] flex-col gap-space-6 px-space-4 py-space-6">
      <header className="flex flex-col gap-space-1">
        <p className="text-small font-medium uppercase tracking-wide text-neutral-500">
          Everything.Rent
        </p>
        <h1 className="text-h2 font-semibold text-neutral-900">Check in</h1>
      </header>
      <CheckInFlow
        bookingId={data.bookingId}
        listingName={data.listingName}
        heroPhotoUrl={data.heroPhotoUrl}
        pickupLocation={data.pickupLocation}
        startDate={data.startDate}
        endDate={data.endDate}
      />
    </div>
  );
}

export default function CheckInRentalPage(props: CheckInRentalPageParams) {
  return (
    <Suspense fallback={null}>
      <CheckInRentalPageBody {...props} />
    </Suspense>
  );
}
