import { describe, expect, it } from "vitest";

import {
  computeRentalLifecycle,
  RENTAL_BUFFER_DAYS,
  RENTAL_HISTORY_VISIBILITY_DAYS,
  type RentalLifecycleInput,
} from "./rental-lifecycle";

const iso = (year: number, month: number, day: number): string =>
  `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

const utc = (year: number, month: number, day: number): Date =>
  new Date(Date.UTC(year, month - 1, day));

function booking(
  overrides: Partial<RentalLifecycleInput> = {},
): RentalLifecycleInput {
  return {
    status: "confirmed",
    startDate: iso(2026, 4, 10),
    endDate: iso(2026, 4, 12),
    ...overrides,
  };
}

describe("computeRentalLifecycle", () => {
  describe("cancelled", () => {
    it("classifies any cancelled booking as `cancelled`, regardless of dates", () => {
      const lc = computeRentalLifecycle(
        booking({ status: "cancelled" }),
        utc(2026, 4, 1),
      );
      expect(lc.state).toBe("cancelled");
      expect(lc.statusLabel).toBe("Cancelled");
      expect(lc.badgeTone).toBe("destructive");
      expect(lc.isPast).toBe(true);
      expect(lc.actionsAvailable).toEqual([]);
    });

    it("still cancels even if the end date is way in the past", () => {
      const lc = computeRentalLifecycle(
        booking({
          status: "cancelled",
          startDate: iso(2020, 1, 1),
          endDate: iso(2020, 1, 5),
        }),
        utc(2026, 4, 10),
      );
      expect(lc.state).toBe("cancelled");
    });
  });

  describe("upcoming", () => {
    it("classifies a confirmed booking with a future start as upcoming", () => {
      const lc = computeRentalLifecycle(
        booking({ startDate: iso(2026, 5, 1), endDate: iso(2026, 5, 3) }),
        utc(2026, 4, 10),
      );
      expect(lc.state).toBe("upcoming");
      expect(lc.statusLabel).toBe("Confirmed");
      expect(lc.badgeTone).toBe("success");
      expect(lc.actionsAvailable).toEqual(["cancel"]);
    });
  });

  describe("active", () => {
    it("classifies a booking as active on the start date", () => {
      const lc = computeRentalLifecycle(
        booking({ startDate: iso(2026, 4, 10), endDate: iso(2026, 4, 12) }),
        utc(2026, 4, 10),
      );
      expect(lc.state).toBe("active");
      expect(lc.statusLabel).toBe("Active");
      expect(lc.badgeTone).toBe("primary");
      expect(lc.actionsAvailable).toEqual(["extend"]);
    });

    it("classifies a booking as active mid-rental", () => {
      const lc = computeRentalLifecycle(
        booking({ startDate: iso(2026, 4, 10), endDate: iso(2026, 4, 14) }),
        utc(2026, 4, 12),
      );
      expect(lc.state).toBe("active");
    });

    it("offers extend + check-in on the last day of the rental", () => {
      const lc = computeRentalLifecycle(
        booking({ startDate: iso(2026, 4, 10), endDate: iso(2026, 4, 12) }),
        utc(2026, 4, 12),
      );
      expect(lc.state).toBe("active");
      expect(lc.actionsAvailable).toEqual(["extend", "check-in"]);
    });
  });

  describe("return_due", () => {
    it("classifies a confirmed booking one day past end as return_due", () => {
      const lc = computeRentalLifecycle(
        booking({ startDate: iso(2026, 4, 10), endDate: iso(2026, 4, 12) }),
        utc(2026, 4, 13),
      );
      expect(lc.state).toBe("return_due");
      expect(lc.statusLabel).toBe("Return Due");
      expect(lc.badgeTone).toBe("warning");
      expect(lc.actionsAvailable).toEqual(["extend", "check-in"]);
    });

    it("stays return_due through the entire buffer window", () => {
      const lc = computeRentalLifecycle(
        booking({ startDate: iso(2026, 4, 10), endDate: iso(2026, 4, 12) }),
        utc(2026, 4, 12 + RENTAL_BUFFER_DAYS),
      );
      expect(lc.state).toBe("return_due");
    });

    it("falls off to completed one day after the buffer window", () => {
      const lc = computeRentalLifecycle(
        booking({ startDate: iso(2026, 4, 10), endDate: iso(2026, 4, 12) }),
        utc(2026, 4, 12 + RENTAL_BUFFER_DAYS + 1),
      );
      expect(lc.state).toBe("completed");
      expect(lc.badgeTone).toBe("muted");
      expect(lc.actionsAvailable).toEqual([]);
    });
  });

  describe("completed", () => {
    it("classifies an explicitly-completed booking within 45 days as completed", () => {
      const lc = computeRentalLifecycle(
        booking({
          status: "completed",
          startDate: iso(2026, 3, 1),
          endDate: iso(2026, 3, 5),
        }),
        utc(2026, 4, 10),
      );
      expect(lc.state).toBe("completed");
      expect(lc.isPast).toBe(true);
      expect(lc.actionsAvailable).toEqual([]);
    });
  });

  describe("past_completed (45-day boundary)", () => {
    it("stays visible on the dashboard at exactly 45 days", () => {
      const lc = computeRentalLifecycle(
        booking({
          status: "completed",
          startDate: iso(2026, 2, 20),
          endDate: iso(2026, 2, 24),
        }),
        utc(2026, 2, 24 + RENTAL_HISTORY_VISIBILITY_DAYS),
      );
      expect(lc.state).toBe("completed");
      expect(lc.isPast).toBe(true);
    });

    it("rolls to past_completed at 46 days (filtered out of dashboard)", () => {
      // 46 days after end
      const lc = computeRentalLifecycle(
        booking({
          status: "completed",
          startDate: iso(2026, 2, 20),
          endDate: iso(2026, 2, 24),
        }),
        utc(2026, 2, 24 + RENTAL_HISTORY_VISIBILITY_DAYS + 1),
      );
      expect(lc.state).toBe("past_completed");
      expect(lc.isPast).toBe(true);
      expect(lc.actionsAvailable).toEqual([]);
    });

    it("also rolls past 45 days even if the status is still confirmed", () => {
      const lc = computeRentalLifecycle(
        booking({
          status: "confirmed",
          startDate: iso(2025, 1, 1),
          endDate: iso(2025, 1, 3),
        }),
        utc(2026, 4, 10),
      );
      expect(lc.state).toBe("past_completed");
    });
  });
});
