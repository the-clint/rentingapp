/**
 * Cancel booking page (Story 4-3).
 *
 * Server Component. Validates the renter session, verifies booking
 * ownership + lifecycle eligibility via `previewCancellation`, and
 * hands the computed outcome to the `CancelBookingFlow` client
 * component. Ineligible bookings (not upcoming, not owned, already
 * cancelled, etc.) redirect to `/rentals`. Unauth'd visitors land on
 * `/rentals/verify?returnTo=...`.
 *
 * The preview is computed server-side so the client never sees the
 * raw 48h boundary math — only the outcome the server decided on.
 * `confirmCancellation` re-validates drift on commit.
 */

import { redirect } from "next/navigation";
import { Suspense } from "react";

import { CancelBookingFlow } from "@/components/rentals/cancel-booking-flow";
import { previewCancellation } from "@/lib/actions/cancellation-actions";
import { createClient } from "@/lib/supabase/server";

interface CancelRentalPageParams {
  params: Promise<{ bookingId: string }>;
}

async function CancelRentalPageBody({ params }: CancelRentalPageParams) {
  const { bookingId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(
      `/rentals/verify?returnTo=${encodeURIComponent(`/rentals/${bookingId}/cancel`)}`,
    );
  }

  const preview = await previewCancellation(bookingId);
  if (!preview.success) {
    // Any preview failure (not found, not eligible, forbidden, already
    // cancelled, etc.) bounces back to the dashboard. The user lands
    // on /rentals and sees the updated state of their booking.
    redirect("/rentals");
  }

  const {
    bookingId: confirmedId,
    outcome,
    hoursUntilStart,
    amountCents,
    listingName,
    startDate,
    endDate,
  } = preview.data;

  return (
    <div className="mx-auto flex max-w-[480px] flex-col gap-space-6 px-space-4 py-space-6">
      <header className="flex flex-col gap-space-1">
        <p className="text-small font-medium uppercase tracking-wide text-neutral-600">
          RentingApp
        </p>
        <h1 className="text-h2 font-semibold text-neutral-900">
          Cancel booking
        </h1>
      </header>
      <CancelBookingFlow
        bookingId={confirmedId}
        listingName={listingName}
        startDate={startDate}
        endDate={endDate}
        amountCents={amountCents}
        outcome={outcome}
        hoursUntilStart={hoursUntilStart}
      />
    </div>
  );
}

export default function CancelRentalPage(props: CancelRentalPageParams) {
  return (
    <Suspense fallback={null}>
      <CancelRentalPageBody {...props} />
    </Suspense>
  );
}
