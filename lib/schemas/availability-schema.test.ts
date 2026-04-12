import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  blockedRangeSchema,
  blockedRangesSchema,
} from "./availability-schema";

describe("availability-schema", () => {
  beforeEach(() => {
    vi.setSystemTime(new Date("2026-04-09T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("accepts a happy single range", () => {
    const result = blockedRangeSchema.safeParse({
      startDate: "2026-04-15",
      endDate: "2026-04-17",
    });
    expect(result.success).toBe(true);
  });

  it("rejects startDate > endDate with the right message", () => {
    const result = blockedRangeSchema.safeParse({
      startDate: "2026-04-17",
      endDate: "2026-04-15",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "Start date must be on or before end date",
      );
    }
  });

  it("rejects a startDate in the past", () => {
    const result = blockedRangeSchema.safeParse({
      startDate: "2026-04-08",
      endDate: "2026-04-10",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "You cannot block a date in the past",
      );
    }
  });

  it("rejects a malformed date string", () => {
    const result = blockedRangeSchema.safeParse({
      startDate: "04/15/2026",
      endDate: "2026-04-17",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "Date must be in YYYY-MM-DD format",
      );
    }
  });

  it("rejects two overlapping ranges in the payload", () => {
    const result = blockedRangesSchema.safeParse([
      { startDate: "2026-04-15", endDate: "2026-04-17" },
      { startDate: "2026-04-16", endDate: "2026-04-20" },
    ]);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "Blocked date ranges cannot overlap",
      );
    }
  });

  it("accepts two adjacent non-overlapping ranges", () => {
    const result = blockedRangesSchema.safeParse([
      { startDate: "2026-04-15", endDate: "2026-04-17" },
      { startDate: "2026-04-19", endDate: "2026-04-21" },
    ]);
    expect(result.success).toBe(true);
  });
});
