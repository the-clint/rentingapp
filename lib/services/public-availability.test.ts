import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type TerminalResult = { data: unknown; error: unknown };

const blockedResult: TerminalResult = { data: [], error: null };
const bookingResult: TerminalResult = { data: [], error: null };

function makeBlockedBuilder() {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    lte: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    then: (resolve: (value: TerminalResult) => void) => {
      resolve(blockedResult);
      return Promise.resolve(blockedResult);
    },
  };
  return builder;
}

function makeBookingBuilder() {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    lte: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    then: (resolve: (value: TerminalResult) => void) => {
      resolve(bookingResult);
      return Promise.resolve(bookingResult);
    },
  };
  return builder;
}

const fromMock = vi.fn((table: string) => {
  if (table === "listing_blocked_dates") return makeBlockedBuilder();
  if (table === "booking_dates") return makeBookingBuilder();
  throw new Error(`Unexpected table: ${table}`);
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: fromMock }),
}));

import { fetchPublicAvailability } from "./public-availability";

describe("fetchPublicAvailability", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-10T12:00:00Z"));
    blockedResult.data = [];
    blockedResult.error = null;
    bookingResult.data = [];
    bookingResult.error = null;
    fromMock.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns all available dates for a clean window", async () => {
    const result = await fetchPublicAvailability({
      listingId: "listing-1",
      startDate: "2026-04-10",
      endDate: "2026-04-12",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toEqual([
      { date: "2026-04-10", state: "available" },
      { date: "2026-04-11", state: "available" },
      { date: "2026-04-12", state: "available" },
    ]);
  });

  it("marks past dates relative to today", async () => {
    const result = await fetchPublicAvailability({
      listingId: "listing-1",
      startDate: "2026-04-08",
      endDate: "2026-04-11",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data[0]).toEqual({ date: "2026-04-08", state: "past" });
    expect(result.data[1]).toEqual({ date: "2026-04-09", state: "past" });
    expect(result.data[2]).toEqual({ date: "2026-04-10", state: "available" });
    expect(result.data[3]).toEqual({ date: "2026-04-11", state: "available" });
  });

  it("marks operator_block ranges as blocked", async () => {
    blockedResult.data = [
      { start_date: "2026-04-11", end_date: "2026-04-12", reason: "operator_block" },
    ];
    const result = await fetchPublicAvailability({
      listingId: "listing-1",
      startDate: "2026-04-10",
      endDate: "2026-04-13",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.map((d) => d.state)).toEqual([
      "available",
      "blocked",
      "blocked",
      "available",
    ]);
  });

  it("marks maintenance_buffer ranges as maintenance", async () => {
    blockedResult.data = [
      {
        start_date: "2026-04-11",
        end_date: "2026-04-11",
        reason: "maintenance_buffer",
      },
    ];
    const result = await fetchPublicAvailability({
      listingId: "listing-1",
      startDate: "2026-04-10",
      endDate: "2026-04-12",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data[1]).toEqual({
      date: "2026-04-11",
      state: "maintenance",
    });
  });

  it("marks booking_dates rows as booked and wins over operator blocks", async () => {
    blockedResult.data = [
      { start_date: "2026-04-11", end_date: "2026-04-11", reason: "operator_block" },
    ];
    bookingResult.data = [{ date: "2026-04-11" }];
    const result = await fetchPublicAvailability({
      listingId: "listing-1",
      startDate: "2026-04-10",
      endDate: "2026-04-12",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data[1]).toEqual({ date: "2026-04-11", state: "booked" });
  });

  it("collapses past + booked into past (past wins)", async () => {
    bookingResult.data = [{ date: "2026-04-09" }];
    const result = await fetchPublicAvailability({
      listingId: "listing-1",
      startDate: "2026-04-08",
      endDate: "2026-04-10",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data[1]).toEqual({ date: "2026-04-09", state: "past" });
  });

  it("returns DATABASE_ERROR when startDate > endDate", async () => {
    const result = await fetchPublicAvailability({
      listingId: "listing-1",
      startDate: "2026-04-12",
      endDate: "2026-04-10",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("DATABASE_ERROR");
  });

  it("propagates blocked-query errors as DATABASE_ERROR", async () => {
    blockedResult.error = { message: "boom" };
    const result = await fetchPublicAvailability({
      listingId: "listing-1",
      startDate: "2026-04-10",
      endDate: "2026-04-12",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("DATABASE_ERROR");
    expect(result.error.message).toBe("boom");
  });
});
