import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// next/image spews warnings in jsdom when fed absolute URLs; stub it with
// a plain <img>.
vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}));

import { RentalCard } from "./rental-card";
import type { RentalCardViewModel } from "@/lib/services/renter-rentals";
import type {
  RentalLifecycleState,
  RentalBadgeTone,
  RentalLifecycleAction,
} from "@/lib/services/rental-lifecycle";

function viewModel(
  overrides: Partial<RentalCardViewModel> & {
    state: RentalLifecycleState;
    statusLabel: string;
    badgeTone: RentalBadgeTone;
    actions: readonly RentalLifecycleAction[];
    isPast?: boolean;
  },
): RentalCardViewModel {
  return {
    bookingId: overrides.bookingId ?? "booking-1",
    listingId: overrides.listingId ?? "listing-1",
    listingName: overrides.listingName ?? "Mini Excavator",
    pickupLocation: overrides.pickupLocation ?? "Salt Lake City, UT",
    heroPhoto:
      overrides.heroPhoto !== undefined
        ? overrides.heroPhoto
        : {
            path: "op/hero.jpg",
            url: "https://cdn.example/op/hero.jpg",
          },
    startDate: overrides.startDate ?? "2026-04-10",
    endDate: overrides.endDate ?? "2026-04-12",
    totalCents: overrides.totalCents ?? 100000,
    lifecycle: {
      state: overrides.state,
      statusLabel: overrides.statusLabel,
      badgeTone: overrides.badgeTone,
      isPast: overrides.isPast ?? false,
      actionsAvailable: overrides.actions,
    },
  };
}

describe("RentalCard", () => {
  it("renders the listing name, dates, pickup, and status badge", () => {
    render(
      <RentalCard
        rental={viewModel({
          state: "upcoming",
          statusLabel: "Confirmed",
          badgeTone: "success",
          actions: ["cancel"],
        })}
      />,
    );
    expect(screen.getByText("Mini Excavator")).toBeInTheDocument();
    expect(screen.getByText("Salt Lake City, UT")).toBeInTheDocument();
    expect(screen.getByTestId("rental-status-badge")).toHaveTextContent(
      "Confirmed",
    );
    // Date range rendered as "Apr 10 – Apr 12, 2026"
    expect(screen.getByText(/Apr 10.*Apr 12.*2026/)).toBeInTheDocument();
  });

  it("upcoming → shows only Cancel Booking → /rentals/[id]/cancel", () => {
    render(
      <RentalCard
        rental={viewModel({
          state: "upcoming",
          statusLabel: "Confirmed",
          badgeTone: "success",
          actions: ["cancel"],
        })}
      />,
    );
    const cancel = screen.getByTestId("rental-action-cancel");
    expect(cancel).toHaveAttribute("href", "/rentals/booking-1/cancel");
    expect(screen.queryByTestId("rental-action-extend")).toBeNull();
    expect(screen.queryByTestId("rental-action-check-in")).toBeNull();
  });

  it("active → shows only Extend Rental → /rentals/[id]/extend", () => {
    render(
      <RentalCard
        rental={viewModel({
          state: "active",
          statusLabel: "Active",
          badgeTone: "primary",
          actions: ["extend"],
        })}
      />,
    );
    const extend = screen.getByTestId("rental-action-extend");
    expect(extend).toHaveAttribute("href", "/rentals/booking-1/extend");
    expect(screen.queryByTestId("rental-action-cancel")).toBeNull();
    expect(screen.queryByTestId("rental-action-check-in")).toBeNull();
  });

  it("return_due → shows Extend + Check In with pulse badge", () => {
    render(
      <RentalCard
        rental={viewModel({
          state: "return_due",
          statusLabel: "Return Due",
          badgeTone: "warning",
          actions: ["extend", "check-in"],
        })}
      />,
    );
    expect(screen.getByTestId("rental-action-extend")).toHaveAttribute(
      "href",
      "/rentals/booking-1/extend",
    );
    expect(screen.getByTestId("rental-action-check-in")).toHaveAttribute(
      "href",
      "/rentals/booking-1/check-in",
    );
    const badge = screen.getByTestId("rental-status-badge");
    expect(badge.className).toContain("animate-pulse");
  });

  it("completed → renders view-only with no action buttons", () => {
    render(
      <RentalCard
        rental={viewModel({
          state: "completed",
          statusLabel: "Completed",
          badgeTone: "muted",
          actions: [],
          isPast: true,
        })}
      />,
    );
    expect(screen.getByTestId("rental-status-badge")).toHaveTextContent(
      "Completed",
    );
    expect(screen.queryByTestId("rental-action-extend")).toBeNull();
    expect(screen.queryByTestId("rental-action-cancel")).toBeNull();
    expect(screen.queryByTestId("rental-action-check-in")).toBeNull();
  });

  it("cancelled → renders with destructive tone and no actions", () => {
    render(
      <RentalCard
        rental={viewModel({
          state: "cancelled",
          statusLabel: "Cancelled",
          badgeTone: "destructive",
          actions: [],
          isPast: true,
        })}
      />,
    );
    expect(screen.getByTestId("rental-status-badge")).toHaveTextContent(
      "Cancelled",
    );
    expect(screen.queryByTestId("rental-action-extend")).toBeNull();
  });

  it("renders a placeholder when there is no hero photo", () => {
    render(
      <RentalCard
        rental={viewModel({
          state: "upcoming",
          statusLabel: "Confirmed",
          badgeTone: "success",
          actions: ["cancel"],
          heroPhoto: null,
        })}
      />,
    );
    expect(screen.getByText("No photo")).toBeInTheDocument();
  });
});
