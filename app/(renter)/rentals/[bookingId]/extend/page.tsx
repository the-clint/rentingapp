/**
 * Extend rental page (Story 4-2).
 *
 * Server Component. Validates the renter session, verifies booking
 * ownership, re-computes eligibility + remaining buffer capacity from
 * the authoritative tables (never trusts query params for price or
 * eligibility), and hands control to the `ExtendRentalFlow` client
 * component. Ineligible bookings are redirected to `/rentals`.
 *
 * `searchParams.days` (1..4) optionally pre-selects a day chip — used
 * when the renter card eventually links with a hint (not in 4-1 yet,
 * but harmless to support from day one).
 */

import { redirect } from "next/navigation";
import { Suspense } from "react";

import { ExtendRentalFlow } from "@/components/rentals/extend-rental-flow";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeRentalLifecycle } from "@/lib/services/rental-lifecycle";
import { createClient } from "@/lib/supabase/server";

interface ExtendRentalPageParams {
  params: Promise<{ bookingId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

interface BufferRow {
  id: string;
  start_date: string;
  end_date: string;
}

function daysInclusive(startIso: string, endIso: string): number {
  const s = new Date(`${startIso}T00:00:00Z`).getTime();
  const e = new Date(`${endIso}T00:00:00Z`).getTime();
  return Math.round((e - s) / (24 * 60 * 60 * 1000)) + 1;
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function ExtendRentalPageBody({
  params,
  searchParams,
}: ExtendRentalPageParams) {
  const { bookingId } = await params;
  const sp = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(
      `/rentals/verify?returnTo=${encodeURIComponent(`/rentals/${bookingId}/extend`)}`,
    );
  }

  const admin = createAdminClient();

  const { data: bookingRow } = await admin
    .from("bookings")
    .select(
      "id, listing_id, renter_id, status, start_date, end_date, total_cents",
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (!bookingRow) {
    redirect("/rentals");
  }
  const booking = bookingRow as {
    id: string;
    listing_id: string;
    renter_id: string;
    status: string;
    start_date: string;
    end_date: string;
    total_cents: number;
  };

  if (booking.renter_id !== user.id) {
    redirect("/rentals");
  }

  if (booking.status !== "confirmed") {
    redirect("/rentals");
  }

  const lifecycle = computeRentalLifecycle(
    {
      status: "confirmed",
      startDate: booking.start_date,
      endDate: booking.end_date,
    },
    new Date(),
  );

  if (lifecycle.state !== "active" && lifecycle.state !== "return_due") {
    redirect("/rentals");
  }

  const { data: listingRow } = await admin
    .from("listings")
    .select("id, name, daily_rate_cents")
    .eq("id", booking.listing_id)
    .maybeSingle();

  if (!listingRow) {
    redirect("/rentals");
  }
  const listing = listingRow as {
    id: string;
    name: string;
    daily_rate_cents: number;
  };

  // Look up the maintenance buffer row to compute maxExtendDays.
  const { data: bufferData } = await admin
    .from("listing_blocked_dates")
    .select("id, start_date, end_date")
    .eq("listing_id", booking.listing_id)
    .eq("reason", "maintenance_buffer")
    .lte("start_date", addDaysIso(booking.end_date, 5))
    .gte("end_date", addDaysIso(booking.end_date, 1));

  const buffer = ((bufferData ?? [])[0] ?? null) as BufferRow | null;
  const bufferDaysTotal = buffer
    ? daysInclusive(buffer.start_date, buffer.end_date)
    : 0;
  const maxExtendDays = Math.min(4, Math.max(0, bufferDaysTotal - 1));

  if (maxExtendDays < 1) {
    redirect("/rentals");
  }

  const publishableKey =
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";

  // Parse optional days query parameter (1..4).
  const rawDays = Array.isArray(sp.days) ? sp.days[0] : sp.days;
  const parsedDays = rawDays ? Number.parseInt(rawDays, 10) : NaN;
  const initialExtendDays =
    Number.isInteger(parsedDays) && parsedDays >= 1 && parsedDays <= 4
      ? Math.min(parsedDays, maxExtendDays)
      : undefined;

  if (!publishableKey) {
    return (
      <div className="mx-auto flex max-w-[480px] flex-col gap-space-4 px-space-4 py-space-6">
        <h1 className="text-h2 font-semibold text-neutral-900">
          Extend rental
        </h1>
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 p-space-3 text-small text-destructive"
        >
          Extensions are temporarily unavailable. Please try again later.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[480px] flex-col gap-space-6 px-space-4 py-space-6">
      <header className="flex flex-col gap-space-1">
        <p className="text-small font-medium uppercase tracking-wide text-neutral-500">
          Everything.Rent
        </p>
        <h1 className="text-h2 font-semibold text-neutral-900">
          Extend rental
        </h1>
      </header>
      <ExtendRentalFlow
        bookingId={booking.id}
        listingName={listing.name}
        currentEndDate={booking.end_date}
        currentTotalCents={booking.total_cents}
        dailyRateCents={listing.daily_rate_cents}
        maxExtendDays={maxExtendDays}
        publishableKey={publishableKey}
        initialExtendDays={initialExtendDays}
      />
    </div>
  );
}

export default function ExtendRentalPage(props: ExtendRentalPageParams) {
  return (
    <Suspense fallback={null}>
      <ExtendRentalPageBody {...props} />
    </Suspense>
  );
}
