/**
 * Operator dashboard home (Stories 1-4 / 5-5).
 *
 * Async Server Component. For operators with zero listings we still
 * render the empty-listings CTA from Story 2-4. For operators with
 * listings, we now render 4 stat cards + an alerts strip + a recent
 * bookings preview.
 */

import Link from "next/link";

import { EmptyListingsCard } from "@/components/listing/empty-listings-card";
import { fetchOperatorBookings } from "@/lib/services/operator-bookings";
import { fetchOperatorDashboardStats } from "@/lib/services/operator-dashboard-stats";
import { createClient } from "@/lib/supabase/server";

function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export async function DashboardHome() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { count: listingCount } = await supabase
    .from("listings")
    .select("id", { count: "exact", head: true })
    .eq("operator_id", user.id)
    .is("deleted_at", null);

  if (!listingCount || listingCount === 0) {
    return <EmptyListingsCard />;
  }

  const today = new Date();
  const [statsResult, bookingsResult] = await Promise.all([
    fetchOperatorDashboardStats(user.id, today),
    fetchOperatorBookings({ operatorId: user.id, today }),
  ]);

  if (!statsResult.success) {
    return (
      <p className="text-small text-destructive">
        Could not load dashboard stats: {statsResult.error.message}
      </p>
    );
  }

  const stats = statsResult.data;
  const recent = bookingsResult.success
    ? bookingsResult.data.slice(0, 5)
    : [];

  return (
    <div className="flex flex-col gap-space-6" data-testid="dashboard-home">
      <div className="grid grid-cols-2 gap-space-3 lg:grid-cols-4">
        <StatCard
          label="Active Rentals"
          value={String(stats.activeRentalsCount)}
          testId="stat-active-rentals"
        />
        <StatCard
          label="Monthly Revenue"
          value={formatUsd(stats.monthlyRevenueCents)}
          testId="stat-monthly-revenue"
        />
        <StatCard
          label="Upcoming Bookings"
          value={String(stats.upcomingBookingsCount)}
          testId="stat-upcoming-bookings"
        />
        <StatCard
          label="Utilization"
          value={`${stats.utilizationPercent}%`}
          testId="stat-utilization"
        />
      </div>

      {stats.alerts.length > 0 ? (
        <div
          className="flex flex-col gap-space-2 rounded-lg border border-[hsl(var(--warning))]/30 bg-[hsl(var(--warning))]/10 p-space-3"
          data-testid="dashboard-alerts"
        >
          <p className="text-small font-semibold text-[hsl(var(--warning))]">
            Needs attention
          </p>
          <ul className="flex flex-col gap-space-1">
            {stats.alerts.map((alert) => (
              <li key={alert.id}>
                <Link
                  href={alert.href}
                  className="text-small text-neutral-900 underline"
                >
                  {alert.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div
          className="rounded-lg border border-[hsl(var(--success))]/30 bg-[hsl(var(--success))]/10 p-space-3"
          data-testid="dashboard-all-clear"
        >
          <p className="text-small font-medium text-[hsl(var(--success))]">
            ✓ Everything&rsquo;s handled.
          </p>
        </div>
      )}

      <section className="flex flex-col gap-space-3">
        <div className="flex items-center justify-between">
          <h2 className="text-h3 font-semibold text-neutral-900">
            Recent activity
          </h2>
          <Link
            href="/bookings"
            className="text-small font-medium text-primary-dark underline"
          >
            View all bookings
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="text-small text-neutral-700">
            No bookings yet. Post your listing to classifieds to get started.
          </p>
        ) : (
          <ul className="flex flex-col gap-space-2">
            {recent.map((b) => (
              <li
                key={b.bookingId}
                className="flex items-center justify-between rounded-md border border-neutral-200 bg-white p-space-3"
                data-testid="dashboard-recent-booking"
              >
                <div className="min-w-0">
                  <p className="truncate text-small font-semibold text-neutral-900">
                    {b.listingName}
                  </p>
                  <p className="text-xs text-neutral-700">
                    {b.renterDisplayName} &middot; {b.statusLabel}
                  </p>
                </div>
                <Link
                  href={`/bookings/${b.bookingId}`}
                  className="text-small font-medium text-primary-dark underline"
                >
                  View
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId: string;
}) {
  return (
    <div
      className="flex flex-col gap-space-1 rounded-lg border border-neutral-200 bg-white p-space-4 shadow-sm"
      data-testid={testId}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-600">
        {label}
      </p>
      <p className="text-h2 font-semibold text-neutral-900">{value}</p>
    </div>
  );
}
