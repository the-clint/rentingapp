/**
 * Operator dashboard at-a-glance stats (Story 5-5).
 *
 * Pure fetch that counts active rentals, upcoming bookings,
 * utilization % across the last 30 days, and sums captured payments
 * (net of fees) for monthly revenue. Returns a `DashboardStats`
 * view-model for the stat cards + a list of "alert" items so the
 * dashboard can badge items needing attention.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { err, ok, type Result } from "@/lib/utils/result";

export interface DashboardStats {
  activeRentalsCount: number;
  upcomingBookingsCount: number;
  utilizationPercent: number;
  monthlyRevenueCents: number;
  unreadMessagesCount: number;
  alerts: Array<{
    id: string;
    label: string;
    href: string;
  }>;
}

export async function fetchOperatorDashboardStats(
  operatorId: string,
  today: Date,
): Promise<Result<DashboardStats>> {
  const admin = createAdminClient();

  const todayIso = today.toISOString().slice(0, 10);

  // All operator bookings, decorated with listing ownership.
  const { data: bookingsData, error: bookingsError } = await admin
    .from("bookings")
    .select(
      `id, status, start_date, end_date, total_cents, payment_captured_at, payment_captured_cents,
       listings!inner(id, operator_id)`,
    )
    .eq("listings.operator_id", operatorId)
    .in("status", ["confirmed", "completed", "no_show"]);

  if (bookingsError) {
    return err("DATABASE_ERROR", bookingsError.message);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bookings = (bookingsData ?? []) as any[];

  // Listing count for utilization denominator.
  const { data: listingsData, error: listingsError } = await admin
    .from("listings")
    .select("id")
    .eq("operator_id", operatorId)
    .is("deleted_at", null);

  if (listingsError) {
    return err("DATABASE_ERROR", listingsError.message);
  }
  const listingCount = (listingsData ?? []).length;

  let activeRentalsCount = 0;
  let upcomingBookingsCount = 0;
  let monthlyRevenueCents = 0;
  let bookedDaysLast30 = 0;
  const alerts: DashboardStats["alerts"] = [];

  const monthStart = new Date(today);
  monthStart.setUTCDate(monthStart.getUTCDate() - 30);
  const monthStartMs = monthStart.getTime();

  for (const row of bookings) {
    const start = row.start_date as string;
    const end = row.end_date as string;

    if (row.status === "confirmed") {
      if (todayIso >= start && todayIso <= end) {
        activeRentalsCount += 1;
        if (todayIso === end) {
          alerts.push({
            id: row.id,
            label: `Return due today — booking ${row.id.slice(0, 8)}`,
            href: `/bookings/${row.id}`,
          });
        }
      } else if (todayIso < start) {
        upcomingBookingsCount += 1;
      } else if (todayIso > end) {
        alerts.push({
          id: row.id,
          label: `Rental past end date — needs check-in`,
          href: `/bookings/${row.id}`,
        });
      }
    }

    if (row.payment_captured_at) {
      const capturedMs = new Date(row.payment_captured_at as string).getTime();
      if (capturedMs >= monthStartMs) {
        monthlyRevenueCents += (row.payment_captured_cents as number) ?? 0;
      }
    }

    // Count booked days in the trailing 30-day window for utilization.
    bookedDaysLast30 += countOverlapDays(start, end, monthStart, today);
  }

  const totalAvailableDays = Math.max(1, listingCount * 30);
  const utilizationPercent = Math.min(
    100,
    Math.round((bookedDaysLast30 / totalAvailableDays) * 100),
  );

  return ok({
    activeRentalsCount,
    upcomingBookingsCount,
    utilizationPercent,
    monthlyRevenueCents,
    unreadMessagesCount: 0,
    alerts,
  });
}

function countOverlapDays(
  startIso: string,
  endIso: string,
  windowStart: Date,
  windowEnd: Date,
): number {
  const start = new Date(`${startIso}T00:00:00Z`).getTime();
  const end = new Date(`${endIso}T00:00:00Z`).getTime();
  const ws = Date.UTC(
    windowStart.getUTCFullYear(),
    windowStart.getUTCMonth(),
    windowStart.getUTCDate(),
  );
  const we = Date.UTC(
    windowEnd.getUTCFullYear(),
    windowEnd.getUTCMonth(),
    windowEnd.getUTCDate(),
  );
  const lo = Math.max(start, ws);
  const hi = Math.min(end, we);
  if (hi < lo) return 0;
  return Math.round((hi - lo) / (24 * 60 * 60 * 1000)) + 1;
}
