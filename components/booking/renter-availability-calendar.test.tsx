import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { RenterAvailabilityCalendar } from "./renter-availability-calendar";
import type { AvailabilityDateState } from "@/lib/services/public-availability";
import type { DateKey } from "@/lib/utils/date-range";

function makeProps(
  overrides: Partial<
    Parameters<typeof RenterAvailabilityCalendar>[0]
  > = {},
): Parameters<typeof RenterAvailabilityCalendar>[0] {
  const availability = new Map<DateKey, AvailabilityDateState>();
  return {
    year: 2026,
    monthZeroIndexed: 3, // April
    availability,
    todayKey: "2026-04-10",
    selectedStart: null,
    selectedEnd: null,
    onPickDate: vi.fn(),
    onNavigate: vi.fn(),
    minMonthKey: "2026-04-01",
    selectionSummary: null,
    ...overrides,
  };
}

describe("RenterAvailabilityCalendar", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-10T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the month label and a grid with 7 day headers", () => {
    render(<RenterAvailabilityCalendar {...makeProps()} />);
    expect(screen.getByText("April 2026")).toBeInTheDocument();
    expect(screen.getByRole("grid")).toBeInTheDocument();
    // S M T W T F S
    expect(screen.getAllByRole("columnheader")).toHaveLength(7);
  });

  it("renders past, available, booked, blocked, and maintenance states", () => {
    const availability = new Map<DateKey, AvailabilityDateState>([
      ["2026-04-11", "booked"],
      ["2026-04-12", "blocked"],
      ["2026-04-13", "maintenance"],
    ]);
    render(
      <RenterAvailabilityCalendar
        {...makeProps({ availability })}
      />,
    );
    // April 9 is past (before todayKey=2026-04-10).
    const apr9 = screen.getByRole("button", { name: /April 9, 2026, past/ });
    expect(apr9).toBeDisabled();
    const apr10 = screen.getByRole("button", {
      name: /April 10, 2026, available/,
    });
    expect(apr10).toBeEnabled();
    expect(
      screen.getByRole("button", { name: /April 11, 2026, booked/ }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /April 12, 2026, unavailable/ }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", {
        name: /April 13, 2026, maintenance buffer/,
      }),
    ).toBeDisabled();
  });

  it("calls onPickDate when an available cell is clicked", () => {
    const onPickDate = vi.fn();
    render(
      <RenterAvailabilityCalendar
        {...makeProps({ onPickDate })}
      />,
    );
    const apr14 = screen.getByRole("button", {
      name: /April 14, 2026, available/,
    });
    fireEvent.click(apr14);
    expect(onPickDate).toHaveBeenCalledWith("2026-04-14");
  });

  it("ignores clicks on past / booked / blocked cells", () => {
    const onPickDate = vi.fn();
    const availability = new Map<DateKey, AvailabilityDateState>([
      ["2026-04-11", "booked"],
    ]);
    render(
      <RenterAvailabilityCalendar
        {...makeProps({ onPickDate, availability })}
      />,
    );
    const apr9 = screen.getByRole("button", { name: /April 9, 2026, past/ });
    fireEvent.click(apr9);
    const apr11 = screen.getByRole("button", {
      name: /April 11, 2026, booked/,
    });
    fireEvent.click(apr11);
    expect(onPickDate).not.toHaveBeenCalled();
  });

  it("renders selected-start and selected-end roles when the range is set", () => {
    render(
      <RenterAvailabilityCalendar
        {...makeProps({
          selectedStart: "2026-04-11",
          selectedEnd: "2026-04-13",
        })}
      />,
    );
    const apr11 = screen.getByRole("button", {
      name: /April 11, 2026, available/,
    });
    expect(apr11.getAttribute("data-role")).toBe("selected-start");
    const apr13 = screen.getByRole("button", {
      name: /April 13, 2026, available/,
    });
    expect(apr13.getAttribute("data-role")).toBe("selected-end");
    const apr12 = screen.getByRole("button", {
      name: /April 12, 2026, available/,
    });
    expect(apr12.getAttribute("data-role")).toBe("in-range");
  });

  it("the Previous button is disabled at the min month floor", () => {
    render(
      <RenterAvailabilityCalendar
        {...makeProps({ minMonthKey: "2026-04-01" })}
      />,
    );
    const prev = screen.getByRole("button", { name: "Previous month" });
    expect(prev).toBeDisabled();
  });

  it("calls onNavigate when Next month is clicked", () => {
    const onNavigate = vi.fn();
    render(
      <RenterAvailabilityCalendar {...makeProps({ onNavigate })} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(onNavigate).toHaveBeenCalledWith(1);
  });

  it("Enter key on a focused available cell fires onPickDate", () => {
    const onPickDate = vi.fn();
    render(
      <RenterAvailabilityCalendar {...makeProps({ onPickDate })} />,
    );
    const apr15 = screen.getByRole("button", {
      name: /April 15, 2026, available/,
    });
    apr15.focus();
    fireEvent.keyDown(apr15, { key: "Enter" });
    expect(onPickDate).toHaveBeenCalledWith("2026-04-15");
  });

  it("ArrowRight moves focus to the next day within the month", () => {
    render(<RenterAvailabilityCalendar {...makeProps()} />);
    const apr15 = screen.getByRole("button", {
      name: /April 15, 2026, available/,
    });
    apr15.focus();
    fireEvent.keyDown(apr15, { key: "ArrowRight" });
    // Assert the next-day cell now has focus. Use document.activeElement
    // because fireEvent doesn't emit the focusin.
    expect(document.activeElement?.getAttribute("aria-label")).toMatch(
      /April 16, 2026/,
    );
  });

  it("exposes a polite status live region with the selection summary", () => {
    render(
      <RenterAvailabilityCalendar
        {...makeProps({
          selectionSummary:
            "Selected April 11, 2026 to April 12, 2026, 2 days, $700.00",
        })}
      />,
    );
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(
      "Selected April 11, 2026 to April 12, 2026, 2 days, $700.00",
    );
  });
});
