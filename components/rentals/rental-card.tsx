/**
 * Rental card (Story 4-1).
 *
 * Presentational card rendered on `/rentals` for each of a renter's
 * bookings. Layout: thumbnail left, info right, action buttons as
 * full-width buttons stacked underneath. Status badge tone comes from
 * `computeRentalLifecycle` so the coloring logic lives in exactly one
 * place.
 *
 * Mobile-first: the card itself is single-column with a max-width
 * enforced by the parent layout. Thumbnail is a fixed-size square.
 */

import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RentalCardViewModel } from "@/lib/services/renter-rentals";
import type { RentalBadgeTone } from "@/lib/services/rental-lifecycle";

export interface RentalCardProps {
  rental: RentalCardViewModel;
}

const BADGE_TONE_CLASSES: Record<RentalBadgeTone, string> = {
  success:
    "border-transparent bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]",
  primary:
    "border-transparent bg-[hsl(var(--primary))]/15 text-[hsl(var(--primary-dark))]",
  warning:
    "border-transparent bg-[hsl(var(--warning))]/20 text-[hsl(var(--warning))] motion-safe:animate-pulse",
  muted: "border-transparent bg-muted text-neutral-700",
  destructive:
    "border-transparent bg-[hsl(var(--destructive))]/10 text-[hsl(var(--destructive))]",
};

function formatDateRange(start: string, end: string): string {
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  const sameYear =
    startDate.getUTCFullYear() === endDate.getUTCFullYear();
  const startLabel = startDate.toLocaleDateString("en-US", {
    ...opts,
    timeZone: "UTC",
  });
  const endLabel = endDate.toLocaleDateString("en-US", {
    ...opts,
    timeZone: "UTC",
  });
  const year = endDate.getUTCFullYear();
  return sameYear
    ? `${startLabel} – ${endLabel}, ${year}`
    : `${startLabel}, ${startDate.getUTCFullYear()} – ${endLabel}, ${year}`;
}

export function RentalCard({ rental }: RentalCardProps) {
  const { lifecycle } = rental;
  const actions = lifecycle.actionsAvailable;

  return (
    <article
      data-testid="rental-card"
      data-lifecycle-state={lifecycle.state}
      className={cn(
        "flex flex-col gap-space-4 rounded-lg border border-border bg-card p-space-4 shadow-sm",
        lifecycle.isPast && "opacity-80",
      )}
    >
      <div className="flex gap-space-3">
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md bg-neutral-100">
          {rental.heroPhoto ? (
            <Image
              src={rental.heroPhoto.url}
              alt={rental.listingName}
              fill
              sizes="80px"
              className="object-cover"
              unoptimized
            />
          ) : (
            <div
              aria-hidden="true"
              className="flex h-full w-full items-center justify-center text-xs text-neutral-500"
            >
              No photo
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-space-1">
          <h2 className="truncate text-base font-semibold text-neutral-900">
            {rental.listingName}
          </h2>
          <p className="text-small text-neutral-700">
            {formatDateRange(rental.startDate, rental.endDate)}
          </p>
          <p className="truncate text-xs text-neutral-500">
            {rental.pickupLocation}
          </p>
          <span
            data-testid="rental-status-badge"
            className={cn(
              "mt-space-1 inline-flex w-fit items-center rounded-md border px-2 py-0.5 text-xs font-semibold",
              BADGE_TONE_CLASSES[lifecycle.badgeTone],
            )}
          >
            {lifecycle.statusLabel}
          </span>
        </div>
      </div>

      {actions.length > 0 ? (
        <div className="flex flex-col gap-space-2">
          {actions.includes("extend") ? (
            <Button asChild variant="default" className="w-full">
              <Link
                href={`/rentals/${rental.bookingId}/extend`}
                data-testid="rental-action-extend"
              >
                Extend Rental
              </Link>
            </Button>
          ) : null}
          {actions.includes("check-in") ? (
            <Button asChild variant="outline" className="w-full">
              <Link
                href={`/rentals/${rental.bookingId}/check-in`}
                data-testid="rental-action-check-in"
              >
                Check In
              </Link>
            </Button>
          ) : null}
          {actions.includes("cancel") ? (
            <Button asChild variant="outline" className="w-full">
              <Link
                href={`/rentals/${rental.bookingId}/cancel`}
                data-testid="rental-action-cancel"
              >
                Cancel Booking
              </Link>
            </Button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
