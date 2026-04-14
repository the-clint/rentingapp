/**
 * Operator bookings list (Story 5-1).
 *
 * Pure presentational component: receives a decorated list of
 * `OperatorBookingRow`s from the Server Component and renders them
 * as desktop rows / mobile cards. Filter tabs are server-rendered
 * links that round-trip through `?status=...` query params so the
 * list stays server-driven.
 */

import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  OperatorBookingRow,
  OperatorBookingsStatusFilter,
} from "@/lib/services/operator-bookings";
import { OPERATOR_BOOKINGS_STATUS_FILTERS } from "@/lib/services/operator-bookings";

export interface OperatorBookingsListProps {
  bookings: OperatorBookingRow[];
  activeFilter: OperatorBookingsStatusFilter;
}

const FILTER_LABELS: Record<OperatorBookingsStatusFilter, string> = {
  all: "All",
  active: "Active",
  upcoming: "Upcoming",
  completed: "Completed",
  "no-show": "No-Show",
};

const STATUS_BADGE_CLASSES: Record<OperatorBookingRow["status"], string> = {
  active:
    "bg-[hsl(var(--primary))]/15 text-[hsl(var(--primary-dark))]",
  return_due:
    "bg-[hsl(var(--warning))]/20 text-[hsl(var(--warning))] motion-safe:animate-pulse",
  upcoming:
    "bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]",
  completed:
    "bg-muted text-neutral-700",
  cancelled:
    "bg-[hsl(var(--destructive))]/10 text-[hsl(var(--destructive))]",
  no_show:
    "bg-[hsl(var(--destructive))]/10 text-[hsl(var(--destructive))]",
};

function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDateRange(start: string, end: string): string {
  const opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  };
  const s = new Date(`${start}T00:00:00Z`).toLocaleDateString("en-US", opts);
  const e = new Date(`${end}T00:00:00Z`).toLocaleDateString("en-US", opts);
  const year = new Date(`${end}T00:00:00Z`).getUTCFullYear();
  return `${s} – ${e}, ${year}`;
}

export function OperatorBookingsList({
  bookings,
  activeFilter,
}: OperatorBookingsListProps) {
  return (
    <div className="flex flex-col gap-space-4">
      <nav
        className="flex flex-wrap gap-space-2 border-b border-border"
        aria-label="Booking status filter"
      >
        {OPERATOR_BOOKINGS_STATUS_FILTERS.map((filter) => {
          const active = filter === activeFilter;
          return (
            <Link
              key={filter}
              href={filter === "all" ? "/bookings" : `/bookings?status=${filter}`}
              data-testid={`bookings-filter-${filter}`}
              data-active={active ? "true" : undefined}
              className={cn(
                "px-space-3 py-space-2 text-small font-medium -mb-px border-b-2",
                active
                  ? "border-[hsl(var(--primary))] text-[hsl(var(--primary-dark))]"
                  : "border-transparent text-neutral-700 hover:text-neutral-900",
              )}
            >
              {FILTER_LABELS[filter]}
            </Link>
          );
        })}
      </nav>

      {bookings.length === 0 ? (
        <EmptyState filter={activeFilter} />
      ) : (
        <ul
          className="flex flex-col gap-space-3"
          data-testid="operator-bookings-list"
        >
          {bookings.map((b) => (
            <BookingRow key={b.bookingId} booking={b} />
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyState({ filter }: { filter: OperatorBookingsStatusFilter }) {
  if (filter === "all") {
    return (
      <div
        className="rounded-lg border border-dashed border-neutral-300 bg-muted p-space-6 text-center"
        data-testid="operator-bookings-empty-all"
      >
        <p className="text-small text-neutral-900">
          No bookings yet. Once you post your listing on classifieds,
          bookings will appear here.
        </p>
      </div>
    );
  }
  return (
    <div
      className="rounded-lg border border-dashed border-neutral-300 bg-muted p-space-6 text-center"
      data-testid="operator-bookings-empty-filter"
    >
      <p className="text-small text-neutral-900">
        No bookings match this filter.
      </p>
      <Link
        href="/bookings"
        className="mt-space-2 inline-block text-small font-medium text-primary-dark underline"
      >
        Clear filters
      </Link>
    </div>
  );
}

function BookingRow({ booking }: { booking: OperatorBookingRow }) {
  return (
    <li
      data-testid="operator-booking-row"
      data-booking-id={booking.bookingId}
      data-status={booking.status}
      className="rounded-lg border border-border bg-card p-space-3 shadow-sm"
    >
      <div className="flex flex-col gap-space-3 lg:flex-row lg:items-center">
        <div
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-neutral-900"
        >
          {booking.renterInitials}
        </div>
        <div className="relative h-12 w-16 shrink-0 overflow-hidden rounded-md bg-neutral-100">
          {booking.heroPhotoUrl ? (
            <Image
              src={booking.heroPhotoUrl}
              alt={booking.listingName}
              fill
              sizes="64px"
              className="object-cover"
              unoptimized
            />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-small font-semibold text-neutral-900">
            {booking.renterDisplayName}
          </p>
          <p className="truncate text-xs text-neutral-700">
            {booking.listingName} &middot;{" "}
            {formatDateRange(booking.startDate, booking.endDate)}
          </p>
        </div>
        <div className="flex items-center gap-space-3">
          <span
            className={cn(
              "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold",
              STATUS_BADGE_CLASSES[booking.status],
            )}
            data-testid="operator-booking-status-badge"
          >
            {booking.statusLabel}
          </span>
          <p className="text-small font-semibold tabular-nums text-neutral-900">
            {booking.amountCapturedCents > 0
              ? `${formatUsd(booking.amountCapturedCents)} captured`
              : booking.amountHeldCents > 0
                ? `${formatUsd(booking.amountHeldCents)} held`
                : formatUsd(booking.totalCents)}
          </p>
          <Button asChild size="sm" variant="outline">
            <Link
              href={`/bookings/${booking.bookingId}`}
              data-testid="operator-booking-view"
            >
              View
            </Link>
          </Button>
        </div>
      </div>
    </li>
  );
}
