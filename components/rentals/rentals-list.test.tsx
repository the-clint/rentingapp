import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}));

import { RentalsList } from "./rentals-list";
import type { RentalCardViewModel } from "@/lib/services/renter-rentals";

function vm(id: string, name: string): RentalCardViewModel {
  return {
    bookingId: id,
    listingId: `listing-${id}`,
    listingName: name,
    pickupLocation: "Salt Lake City, UT",
    heroPhoto: null,
    startDate: "2026-04-10",
    endDate: "2026-04-12",
    totalCents: 50000,
    lifecycle: {
      state: "upcoming",
      statusLabel: "Confirmed",
      badgeTone: "success",
      isPast: false,
      actionsAvailable: ["cancel"],
    },
  };
}

describe("RentalsList", () => {
  it("renders one card per rental, keyed by bookingId", () => {
    render(
      <RentalsList
        rentals={[vm("a", "Generator"), vm("b", "Pressure Washer")]}
      />,
    );
    expect(screen.getByTestId("rentals-list")).toBeInTheDocument();
    expect(screen.getAllByTestId("rental-card")).toHaveLength(2);
    expect(screen.getByText("Generator")).toBeInTheDocument();
    expect(screen.getByText("Pressure Washer")).toBeInTheDocument();
  });

  it("renders an empty list when given zero rentals", () => {
    render(<RentalsList rentals={[]} />);
    expect(screen.getByTestId("rentals-list")).toBeInTheDocument();
    expect(screen.queryAllByTestId("rental-card")).toHaveLength(0);
  });
});
