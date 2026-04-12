import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { ListingCard } from "./listing-card";

const NOW = new Date("2026-04-09T12:00:00.000Z");

const baseProps = {
  id: "listing-abc",
  name: "Kubota Mini Excavator",
  dailyRateCents: 7500,
  pickupLocation: "Salt Lake City, UT",
  heroUrl: "https://example.test/listing-photos/hero.jpg",
  createdAtIso: new Date(NOW.getTime() - 3 * 86_400_000).toISOString(),
};

describe("ListingCard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the listing name as an h2", () => {
    render(<ListingCard {...baseProps} />);
    expect(
      screen.getByRole("heading", { level: 2, name: "Kubota Mini Excavator" }),
    ).toBeInTheDocument();
  });

  it("renders the formatted daily rate", () => {
    render(<ListingCard {...baseProps} />);
    expect(screen.getByText("$75.00 / day")).toBeInTheDocument();
  });

  it("renders the pickup location", () => {
    render(<ListingCard {...baseProps} />);
    expect(screen.getByText("Salt Lake City, UT")).toBeInTheDocument();
  });

  it("renders the hero image with src and alt bound to props", () => {
    render(<ListingCard {...baseProps} />);
    const img = screen.getByAltText("Kubota Mini Excavator") as HTMLImageElement;
    expect(img.src).toBe(baseProps.heroUrl);
  });

  it("renders the relative time label using the pinned system clock", () => {
    render(<ListingCard {...baseProps} />);
    expect(screen.getByText("Created 3 days ago")).toBeInTheDocument();
  });

  it("wraps the card in a link pointing at /listings/{id}", () => {
    render(<ListingCard {...baseProps} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/listings/listing-abc");
  });
});
