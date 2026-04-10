import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";

import { BookingStickyBar } from "./booking-sticky-bar";

// Assert that a span exists with textContent containing the substring.
function expectSpanText(substring: string) {
  const spans = Array.from(document.querySelectorAll("span"));
  const found = spans.some((s) => (s.textContent ?? "").includes(substring));
  if (!found) {
    throw new Error(
      `Expected a <span> containing "${substring}", but none matched.`,
    );
  }
}

describe("BookingStickyBar", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // rAF polyfill for jsdom — schedule on next tick.
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) =>
      setTimeout(() => cb(performance.now()), 0),
    );
    vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("is hidden when no start date is selected", () => {
    render(
      <BookingStickyBar
        startDate={null}
        endDate={null}
        totalDays={0}
        totalCents={0}
        isVisible={false}
        onBookNow={vi.fn()}
      />,
    );
    const bar = screen.getByTestId("booking-sticky-bar");
    expect(bar.getAttribute("data-visible")).toBe("false");
    expect(bar.getAttribute("aria-hidden")).toBe("true");
  });

  it("shows 'Select return date' when only start is set and disables CTA", () => {
    render(
      <BookingStickyBar
        startDate="2026-04-11"
        endDate={null}
        totalDays={1}
        totalCents={0}
        isVisible
        onBookNow={vi.fn()}
      />,
    );
    expect(screen.getByText(/Select return date/)).toBeInTheDocument();
    const cta = screen.getByRole("button", { name: "Book Now" });
    expect(cta).toBeDisabled();
  });

  it("enables the CTA once both start and end are set", () => {
    render(
      <BookingStickyBar
        startDate="2026-04-11"
        endDate="2026-04-12"
        totalDays={2}
        totalCents={70000}
        isVisible
        onBookNow={vi.fn()}
      />,
    );
    const cta = screen.getByRole("button", { name: "Book Now" });
    expect(cta).toBeEnabled();
    expectSpanText("2 days · $700");
    expect(screen.getByText(/Apr 11 – Apr 12/)).toBeInTheDocument();
  });

  it("fires onBookNow when CTA clicked", () => {
    const onBookNow = vi.fn();
    render(
      <BookingStickyBar
        startDate="2026-04-11"
        endDate="2026-04-12"
        totalDays={2}
        totalCents={70000}
        isVisible
        onBookNow={onBookNow}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Book Now" }));
    expect(onBookNow).toHaveBeenCalledTimes(1);
  });

  it("animates the total counter toward the target over ~300ms", () => {
    const { rerender } = render(
      <BookingStickyBar
        startDate="2026-04-11"
        endDate="2026-04-11"
        totalDays={1}
        totalCents={35000}
        isVisible
        onBookNow={vi.fn()}
      />,
    );
    // Initial render shows target (first mount short-circuits).
    expectSpanText("1 day · $350");
    rerender(
      <BookingStickyBar
        startDate="2026-04-11"
        endDate="2026-04-12"
        totalDays={2}
        totalCents={70000}
        isVisible
        onBookNow={vi.fn()}
      />,
    );
    // Run the rAF / timers to completion. The animated counter should
    // arrive at the new target of $700.
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expectSpanText("2 days · $700");
  });
});
