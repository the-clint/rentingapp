import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { CalendarGrid } from "./calendar-grid";

describe("CalendarGrid", () => {
  beforeEach(() => {
    vi.setSystemTime(new Date("2026-04-09T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the month label for April 2026", () => {
    render(
      <CalendarGrid
        year={2026}
        monthZeroIndexed={3}
        cells={new Map()}
        todayKey="2026-04-09"
        onToggle={vi.fn()}
        onRangeToggle={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );
    expect(screen.getByText(/April 2026/)).toBeInTheDocument();
    // April 15 is in the future relative to the pinned today, so it is
    // rendered as an available cell.
    expect(
      screen.getByRole("button", { name: /April 15, 2026, available/ }),
    ).toBeInTheDocument();
  });

  it("fires onNavigate(+1) when Next is clicked", () => {
    const onNavigate = vi.fn();
    render(
      <CalendarGrid
        year={2026}
        monthZeroIndexed={3}
        cells={new Map()}
        todayKey="2026-04-09"
        onToggle={vi.fn()}
        onRangeToggle={vi.fn()}
        onNavigate={onNavigate}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(onNavigate).toHaveBeenCalledWith(1);
  });

  it("fires onToggle when an available cell is clicked", () => {
    const onToggle = vi.fn();
    render(
      <CalendarGrid
        year={2026}
        monthZeroIndexed={3}
        cells={new Map()}
        todayKey="2026-04-09"
        onToggle={onToggle}
        onRangeToggle={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );
    // April 15, 2026 — an in-month future date, so "available".
    const cell = screen.getByRole("button", { name: /April 15, 2026, available/ });
    fireEvent.click(cell);
    expect(onToggle).toHaveBeenCalledWith("2026-04-15");
  });

  it("fires onToggle when Enter is pressed on an available cell", () => {
    const onToggle = vi.fn();
    render(
      <CalendarGrid
        year={2026}
        monthZeroIndexed={3}
        cells={new Map()}
        todayKey="2026-04-09"
        onToggle={onToggle}
        onRangeToggle={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );
    const cell = screen.getByRole("button", { name: /April 15, 2026, available/ });
    fireEvent.keyDown(cell, { key: "Enter" });
    expect(onToggle).toHaveBeenCalledWith("2026-04-15");
  });
});
