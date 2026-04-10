import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildMonthGrid,
  collapseConsecutiveDates,
  enumerateDateRange,
  fromDateKey,
  rangesOverlap,
  toDateKey,
  todayKey,
} from "./date-range";

describe("toDateKey / fromDateKey", () => {
  it("round-trips a UTC-constructed Date", () => {
    const d = new Date(Date.UTC(2026, 3, 9)); // April 9, 2026
    expect(toDateKey(d)).toBe("2026-04-09");
    const back = fromDateKey("2026-04-09");
    expect(back.getUTCFullYear()).toBe(2026);
    expect(back.getUTCMonth()).toBe(3);
    expect(back.getUTCDate()).toBe(9);
  });
});

describe("todayKey", () => {
  beforeEach(() => {
    vi.setSystemTime(new Date("2026-04-09T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the current UTC day as a YYYY-MM-DD key", () => {
    expect(todayKey()).toBe("2026-04-09");
  });
});

describe("enumerateDateRange", () => {
  it("single-day range returns one key", () => {
    expect(enumerateDateRange("2026-04-09", "2026-04-09")).toEqual([
      "2026-04-09",
    ]);
  });

  it("crosses a month boundary correctly", () => {
    expect(enumerateDateRange("2026-04-29", "2026-05-02")).toEqual([
      "2026-04-29",
      "2026-04-30",
      "2026-05-01",
      "2026-05-02",
    ]);
  });

  it("crosses a year boundary correctly", () => {
    expect(enumerateDateRange("2026-12-30", "2027-01-02")).toEqual([
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
    ]);
  });

  it("returns empty when start > end", () => {
    expect(enumerateDateRange("2026-05-02", "2026-04-29")).toEqual([]);
  });
});

describe("rangesOverlap", () => {
  const A = { startDate: "2026-04-10", endDate: "2026-04-12" };

  it("detects overlap", () => {
    expect(
      rangesOverlap(A, { startDate: "2026-04-11", endDate: "2026-04-13" }),
    ).toBe(true);
  });

  it("touching edges count as overlap (inclusive)", () => {
    expect(
      rangesOverlap(A, { startDate: "2026-04-12", endDate: "2026-04-15" }),
    ).toBe(true);
  });

  it("gap returns false", () => {
    expect(
      rangesOverlap(A, { startDate: "2026-04-13", endDate: "2026-04-15" }),
    ).toBe(false);
  });

  it("reverse order still detects overlap", () => {
    expect(
      rangesOverlap(
        { startDate: "2026-04-15", endDate: "2026-04-18" },
        { startDate: "2026-04-16", endDate: "2026-04-17" },
      ),
    ).toBe(true);
  });
});

describe("buildMonthGrid", () => {
  it("renders April 2026 with the 1st on Wednesday", () => {
    // April 1, 2026 is a Wednesday (dow=3).
    const grid = buildMonthGrid(2026, 3);
    expect(grid.weeks).toHaveLength(6);
    expect(grid.weeks[0]).toHaveLength(7);
    // First three cells are placeholders.
    expect(grid.weeks[0][0].key).toBeNull();
    expect(grid.weeks[0][1].key).toBeNull();
    expect(grid.weeks[0][2].key).toBeNull();
    expect(grid.weeks[0][3].key).toBe("2026-04-01");
    expect(grid.weeks[0][3].inMonth).toBe(true);
    // April has 30 days; row 4 col 4 is April 30.
    const flat = grid.weeks.flat();
    const april30 = flat.find((c) => c.key === "2026-04-30");
    expect(april30).toBeDefined();
  });
});

describe("collapseConsecutiveDates", () => {
  it("empty input", () => {
    expect(collapseConsecutiveDates([])).toEqual([]);
  });

  it("single date becomes a 1-day range", () => {
    expect(collapseConsecutiveDates(["2026-04-15"])).toEqual([
      { startDate: "2026-04-15", endDate: "2026-04-15" },
    ]);
  });

  it("collapses consecutive runs and splits on gaps", () => {
    expect(
      collapseConsecutiveDates([
        "2026-04-11",
        "2026-04-12",
        "2026-04-13",
        "2026-04-20",
      ]),
    ).toEqual([
      { startDate: "2026-04-11", endDate: "2026-04-13" },
      { startDate: "2026-04-20", endDate: "2026-04-20" },
    ]);
  });

  it("collapses across a month boundary", () => {
    expect(
      collapseConsecutiveDates(["2026-04-30", "2026-05-01", "2026-05-02"]),
    ).toEqual([{ startDate: "2026-04-30", endDate: "2026-05-02" }]);
  });
});
