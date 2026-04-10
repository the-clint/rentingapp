import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  BookingStepIndicator,
  BOOKING_STEPS,
} from "./booking-step-indicator";

describe("BookingStepIndicator", () => {
  it("renders all five steps", () => {
    render(<BookingStepIndicator currentStep="verify" />);
    expect(screen.getByText("Dates")).toBeInTheDocument();
    expect(screen.getByText("Verify")).toBeInTheDocument();
    expect(screen.getByText("Contract")).toBeInTheDocument();
    expect(screen.getByText("Payment")).toBeInTheDocument();
    expect(screen.getByText("Confirmed")).toBeInTheDocument();
  });

  it("marks the current step with aria-current='step'", () => {
    const { container } = render(
      <BookingStepIndicator currentStep="contract" />,
    );
    const contract = container.querySelector('[data-step="contract"]');
    expect(contract).toHaveAttribute("aria-current", "step");
    expect(contract).toHaveAttribute("data-state", "current");
  });

  it("marks earlier steps as complete", () => {
    const { container } = render(
      <BookingStepIndicator currentStep="payment" />,
    );
    expect(
      container.querySelector('[data-step="dates"]'),
    ).toHaveAttribute("data-state", "complete");
    expect(
      container.querySelector('[data-step="verify"]'),
    ).toHaveAttribute("data-state", "complete");
    expect(
      container.querySelector('[data-step="contract"]'),
    ).toHaveAttribute("data-state", "complete");
  });

  it("marks later steps as pending", () => {
    const { container } = render(
      <BookingStepIndicator currentStep="verify" />,
    );
    expect(
      container.querySelector('[data-step="contract"]'),
    ).toHaveAttribute("data-state", "pending");
    expect(
      container.querySelector('[data-step="payment"]'),
    ).toHaveAttribute("data-state", "pending");
  });

  it("exports the canonical step order", () => {
    expect(BOOKING_STEPS).toEqual([
      "dates",
      "verify",
      "contract",
      "payment",
      "confirmed",
    ]);
  });
});
