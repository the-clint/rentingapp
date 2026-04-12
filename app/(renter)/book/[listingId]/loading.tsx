// Skeleton for the renter booking page. Mirrors the final layout so there is
// minimal shift when the real content swaps in. Warm-tinted neutrals only.
//
// Story 3.1: Renter Listing Page & Photo Carousel.
export function BookingPageLoading() {
  return (
    <div className="mx-auto flex max-w-[480px] flex-col gap-space-5 px-space-4 py-space-6">
      {/* Hero carousel placeholder */}
      <div
        aria-hidden="true"
        className="aspect-[4/3] w-full animate-pulse rounded-lg bg-neutral-100"
      />

      {/* Title + price + pickup */}
      <div className="flex flex-col gap-space-3">
        <div
          aria-hidden="true"
          className="h-8 w-3/5 animate-pulse rounded bg-neutral-100"
        />
        <div
          aria-hidden="true"
          className="h-6 w-1/3 animate-pulse rounded bg-neutral-100"
        />
        <div
          aria-hidden="true"
          className="h-4 w-2/5 animate-pulse rounded bg-neutral-100"
        />
      </div>

      {/* Description lines */}
      <div className="flex flex-col gap-space-2">
        <div
          aria-hidden="true"
          className="h-4 w-full animate-pulse rounded bg-neutral-100"
        />
        <div
          aria-hidden="true"
          className="h-4 w-full animate-pulse rounded bg-neutral-100"
        />
        <div
          aria-hidden="true"
          className="h-4 w-4/5 animate-pulse rounded bg-neutral-100"
        />
      </div>

      <span className="sr-only" role="status">
        Loading listing details
      </span>
    </div>
  );
}

export default BookingPageLoading;
