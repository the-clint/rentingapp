import { Suspense } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";

import { BookingStepIndicator } from "@/components/booking/booking-step-indicator";
import { Button } from "@/components/ui/button";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Renter booking-confirmed page (Story 3-5).
 *
 * Server Component that renders the post-payment celebration screen:
 *   - Step indicator at "Confirmed".
 *   - Green checkmark draw-on animation (600ms, gated on
 *     `prefers-reduced-motion` via `app/globals.css`).
 *   - Booking summary card: equipment name, dates, total held, pickup
 *     location + instructions.
 *   - "Manage Your Rental" link button → `/rentals` (Story 4-1 will
 *     flesh out that route; a 404 link follows the Story 2-5 precedent).
 */

interface ConfirmedPageProps {
  params: Promise<{ listingId: string }>;
  searchParams: Promise<{ bookingId?: string }>;
}

function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

async function ConfirmedPageBody({ params, searchParams }: ConfirmedPageProps) {
  const { listingId } = await params;
  const { bookingId } = await searchParams;

  if (!bookingId) {
    redirect(`/book/${listingId}`);
  }

  // Confirm the caller is the booking owner via their normal session,
  // then re-fetch the booking + listing via the admin client so we can
  // display pickup_instructions (anon-restricted).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/book/${listingId}`);
  }

  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select(
      "id, listing_id, renter_id, status, start_date, end_date, total_cents",
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (!booking || booking.renter_id !== user.id) {
    redirect(`/book/${listingId}`);
  }

  const { data: listing } = await admin
    .from("listings")
    .select("id, name, pickup_location, pickup_instructions")
    .eq("id", booking.listing_id)
    .maybeSingle();

  return (
    <div className="mx-auto flex max-w-[560px] flex-col gap-space-6 px-space-4 py-space-6">
      <BookingStepIndicator currentStep="confirmed" />

      <div className="flex flex-col items-center gap-space-3 text-center">
        <svg
          data-testid="confirmation-checkmark"
          className="booking-confirmed-check h-16 w-16 text-[hsl(var(--success))]"
          viewBox="0 0 52 52"
          aria-hidden="true"
        >
          <circle
            className="booking-confirmed-check__circle"
            cx="26"
            cy="26"
            r="24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
          />
          <path
            className="booking-confirmed-check__path"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14 27 l8 8 l16 -18"
          />
        </svg>
        <h1 className="text-h2 font-semibold text-neutral-900">
          Booking confirmed!
        </h1>
        <p className="text-small text-neutral-700">
          Your hold is authorized. We&rsquo;ll only charge when the rental
          completes.
        </p>
      </div>

      <div className="flex flex-col gap-space-3 rounded-md border border-neutral-200 p-space-4">
        <h2 className="text-h3 font-semibold text-neutral-900">
          {listing?.name ?? "Your rental"}
        </h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-space-3 gap-y-space-2 text-small text-neutral-900">
          <dt className="font-medium text-neutral-700">Dates</dt>
          <dd>
            {booking.start_date} through {booking.end_date}
          </dd>
          <dt className="font-medium text-neutral-700">Total held</dt>
          <dd>{formatUsd(booking.total_cents as number)}</dd>
          {listing?.pickup_location ? (
            <>
              <dt className="font-medium text-neutral-700">Pickup</dt>
              <dd>{listing.pickup_location}</dd>
            </>
          ) : null}
          {listing?.pickup_instructions ? (
            <>
              <dt className="font-medium text-neutral-700">Instructions</dt>
              <dd>{listing.pickup_instructions}</dd>
            </>
          ) : null}
        </dl>
      </div>

      <Button asChild>
        <Link href="/rentals">Manage Your Rental</Link>
      </Button>
    </div>
  );
}

export function ConfirmedPage({ params, searchParams }: ConfirmedPageProps) {
  return (
    <Suspense fallback={null}>
      <ConfirmedPageBody params={params} searchParams={searchParams} />
    </Suspense>
  );
}

export default ConfirmedPage;
