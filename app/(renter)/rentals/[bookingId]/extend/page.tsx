/**
 * Extend rental placeholder (Story 4-1).
 *
 * Story 4-2 will flesh this out with day-chip selection, cost math,
 * and Stripe hold extension. For now we render a simple heading + back
 * link so the `RentalCard` Extend button has a valid destination.
 */

import { Suspense } from "react";
import Link from "next/link";

async function ExtendRentalPageBody({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;

  return (
    <div className="mx-auto flex max-w-[480px] flex-col gap-space-6 px-space-4 py-space-6">
      <header className="flex flex-col gap-space-1">
        <p className="text-small font-medium uppercase tracking-wide text-neutral-600">
          Step &mdash; Story 4-2
        </p>
        <h1 className="text-h2 font-semibold text-neutral-900">
          Extend rental
        </h1>
      </header>
      <p className="text-small text-neutral-700">
        The extend flow lands in Story 4-2. Booking ID:{" "}
        <code className="rounded bg-neutral-100 px-1 py-0.5">{bookingId}</code>.
      </p>
      <Link
        href="/rentals"
        className="text-small font-medium text-primary-dark underline"
      >
        &larr; Back to My Rentals
      </Link>
    </div>
  );
}

export default function ExtendRentalPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <ExtendRentalPageBody params={params} />
    </Suspense>
  );
}
