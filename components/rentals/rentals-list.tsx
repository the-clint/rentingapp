/**
 * Rentals list (Story 4-1).
 *
 * Thin presentational wrapper that renders a stack of `RentalCard`s.
 * All sorting and filtering is handled upstream by `fetchRenterRentals`
 * — this component is intentionally dumb (no client state, no filters)
 * so it stays a Server Component by default.
 */

import type { RentalCardViewModel } from "@/lib/services/renter-rentals";
import { RentalCard } from "./rental-card";

export interface RentalsListProps {
  rentals: readonly RentalCardViewModel[];
}

export function RentalsList({ rentals }: RentalsListProps) {
  return (
    <ul
      data-testid="rentals-list"
      className="flex flex-col gap-space-4"
    >
      {rentals.map((rental) => (
        <li key={rental.bookingId}>
          <RentalCard rental={rental} />
        </li>
      ))}
    </ul>
  );
}
