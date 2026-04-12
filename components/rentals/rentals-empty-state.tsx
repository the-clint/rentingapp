/**
 * Empty state for the renter dashboard (Story 4-1).
 *
 * Rendered when `fetchRenterRentals` returns zero visible cards — copy
 * pointing the renter to the classifieds channels where operators
 * actually list equipment (RentingApp does not run its own marketplace).
 */

export function RentalsEmptyState() {
  return (
    <div
      data-testid="rentals-empty-state"
      className="flex flex-col items-center gap-space-3 rounded-lg border border-dashed border-neutral-200 bg-white p-space-6 text-center"
    >
      <h2 className="text-base font-semibold text-neutral-900">
        No rentals yet
      </h2>
      <p className="text-small text-neutral-700">
        You don&rsquo;t have any rentals. Find equipment on KSL or Facebook
        Marketplace to get started.
      </p>
    </div>
  );
}
