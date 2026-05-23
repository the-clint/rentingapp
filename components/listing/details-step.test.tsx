import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { DetailsStep, type DetailsDraft } from "./details-step";

function emptyDetails(): DetailsDraft {
  return {
    name: "",
    description: "",
    dailyRateCents: null,
    addressStreet: "",
    addressCity: "",
    addressState: "UT",
    addressZip: "",
    pickupInstructions: "",
  };
}

function validDetails(): DetailsDraft {
  return {
    name: "Honda EU2200i Generator",
    description:
      "A quiet, portable inverter generator perfect for camping or backup power.",
    dailyRateCents: 7500,
    addressStreet: "123 Main St",
    addressCity: "Salt Lake City",
    addressState: "UT",
    addressZip: "84101",
    pickupInstructions: "",
  };
}

describe("DetailsStep", () => {
  it("renders all required field labels", () => {
    render(
      <DetailsStep
        details={emptyDetails()}
        onDetailChange={vi.fn()}
        onBack={vi.fn()}
        onNext={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Equipment name")).toBeInTheDocument();
    expect(screen.getByLabelText("Description")).toBeInTheDocument();
    expect(screen.getByLabelText("Daily rate")).toBeInTheDocument();
    expect(screen.getByLabelText("Street address")).toBeInTheDocument();
    expect(screen.getByLabelText("City")).toBeInTheDocument();
    expect(screen.getByLabelText("State")).toBeInTheDocument();
    expect(screen.getByLabelText("ZIP")).toBeInTheDocument();
    expect(screen.getByLabelText("Pickup instructions")).toBeInTheDocument();
  });

  it("disables the Next: Availability button when details are empty", () => {
    render(
      <DetailsStep
        details={emptyDetails()}
        onDetailChange={vi.fn()}
        onBack={vi.fn()}
        onNext={vi.fn()}
      />,
    );
    const next = screen.getByRole("button", { name: /next: availability/i });
    expect(next).toBeDisabled();
  });

  it("enables the Next: Availability button when all required details are valid", () => {
    render(
      <DetailsStep
        details={validDetails()}
        onDetailChange={vi.fn()}
        onBack={vi.fn()}
        onNext={vi.fn()}
      />,
    );
    const next = screen.getByRole("button", { name: /next: availability/i });
    expect(next).toBeEnabled();
  });

  it("renders the description character counter", () => {
    render(
      <DetailsStep
        details={{ ...emptyDetails(), description: "hello" }}
        onDetailChange={vi.fn()}
        onBack={vi.fn()}
        onNext={vi.fn()}
      />,
    );
    expect(screen.getByText("5 / 2000")).toBeInTheDocument();
  });
});
