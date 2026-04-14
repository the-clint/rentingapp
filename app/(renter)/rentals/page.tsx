/**
 * Renter dashboard root (Story 4-1).
 *
 * Server Component. Confirms the caller has a renter session, fetches
 * their (filtered + sorted) rentals, and renders either the empty-state
 * card or the stack of rental cards. No client-side state — all
 * interactions happen by navigating to the action-specific pages stubbed
 * out in this same route group (4-2, 4-3, 4-4 will flesh them out).
 *
 * Next 16 Cache Components: the data fetch is user-scoped so we wrap
 * the async body in `<Suspense>` to signal to the framework that this
 * segment is intentionally dynamic (same pattern as the Story 3-5
 * confirmed page).
 */

import { Suspense } from "react";
import { redirect } from "next/navigation";

import { DisassociateHistoryButton } from "@/components/rentals/disassociate-history-button";
import { RentalsEmptyState } from "@/components/rentals/rentals-empty-state";
import { RentalsList } from "@/components/rentals/rentals-list";
import { fetchRenterRentals } from "@/lib/services/renter-rentals";
import { createClient } from "@/lib/supabase/server";

async function RentalsPageBody() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/rentals/verify?returnTo=/rentals");
  }

  const result = await fetchRenterRentals({
    renterId: user.id,
    today: new Date(),
  });

  return (
    <div className="mx-auto flex max-w-[480px] flex-col gap-space-6 px-space-4 py-space-6">
      <header className="flex flex-col gap-space-1">
        <p className="text-small font-medium uppercase tracking-wide text-neutral-500">
          Everything.Rent
        </p>
        <h1 className="text-h2 font-semibold text-neutral-900">My Rentals</h1>
      </header>

      {!result.success ? (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 p-space-4 text-small text-destructive"
        >
          We couldn&rsquo;t load your rentals. Please refresh to try again.
        </div>
      ) : result.data.length === 0 ? (
        <RentalsEmptyState />
      ) : (
        <>
          <RentalsList rentals={result.data} />
          <DisassociateHistoryButton />
        </>
      )}
    </div>
  );
}

export default function RentalsPage() {
  return (
    <Suspense fallback={null}>
      <RentalsPageBody />
    </Suspense>
  );
}
