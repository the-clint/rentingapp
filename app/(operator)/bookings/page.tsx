/**
 * Operator bookings index (Story 5-1).
 *
 * Server Component. Loads the operator's bookings from
 * `fetchOperatorBookings`, respects the `?status=` filter param, and
 * hands the result to `OperatorBookingsList`. Auth is guaranteed by
 * the operator-group middleware.
 */

import { notFound } from "next/navigation";
import { Suspense } from "react";

import { OperatorBookingsList } from "@/components/operator/bookings-list";
import {
  fetchOperatorBookings,
  OPERATOR_BOOKINGS_STATUS_FILTERS,
  type OperatorBookingsStatusFilter,
} from "@/lib/services/operator-bookings";
import { createClient } from "@/lib/supabase/server";

interface BookingsPageProps {
  searchParams?: Promise<{ status?: string | string[] }>;
}

function parseFilter(raw: string | undefined): OperatorBookingsStatusFilter {
  if (!raw) return "all";
  if ((OPERATOR_BOOKINGS_STATUS_FILTERS as readonly string[]).includes(raw)) {
    return raw as OperatorBookingsStatusFilter;
  }
  return "all";
}

async function BookingsPageBody({ searchParams }: BookingsPageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const params = (await searchParams) ?? {};
  const rawStatus = Array.isArray(params.status)
    ? params.status[0]
    : params.status;
  const filter = parseFilter(rawStatus);

  const result = await fetchOperatorBookings({
    operatorId: user.id,
    today: new Date(),
    statusFilter: filter,
  });

  if (!result.success) {
    return (
      <p className="text-small text-destructive">
        Could not load bookings: {result.error.message}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-space-4">
      <h1 className="text-h1 lg:text-h1-lg">Bookings</h1>
      <OperatorBookingsList bookings={result.data} activeFilter={filter} />
    </div>
  );
}

export default function BookingsPage(props: BookingsPageProps) {
  return (
    <Suspense fallback={<BookingsLoadingSkeleton />}>
      <BookingsPageBody {...props} />
    </Suspense>
  );
}

function BookingsLoadingSkeleton() {
  return (
    <div className="flex flex-col gap-space-4" data-testid="bookings-skeleton">
      <div className="h-8 w-36 animate-pulse rounded bg-amber-100/60" />
      <div className="h-10 w-full animate-pulse rounded bg-amber-100/40" />
      <div className="flex flex-col gap-space-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-16 w-full animate-pulse rounded bg-amber-100/30"
          />
        ))}
      </div>
    </div>
  );
}
