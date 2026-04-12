import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type MockState = {
  userId: string | null;
  ownershipRow: { id: string } | null;
  ownershipError: { message: string } | null;
  deleteError: { message: string } | null;
  insertError: { message: string } | null;
  insertedRows: Record<string, unknown>[] | null;
};

const mockState: MockState = {
  userId: "op-1",
  ownershipRow: { id: "listing-1" },
  ownershipError: null,
  deleteError: null,
  insertError: null,
  insertedRows: null,
};

// Ownership probe chain:
//   from("listings").select("id").eq("id", ...).eq("operator_id", ...).maybeSingle()
// Two `.eq()` calls (id + operator_id) — the second one returns the
// maybeSingle terminator. Track both args so tests can assert that the
// operator_id filter is applied defensively in addition to RLS.
const listingsMaybeSingle = vi.fn(async () => ({
  data: mockState.ownershipRow,
  error: mockState.ownershipError,
}));
const listingsEqOperator = vi.fn(() => ({ maybeSingle: listingsMaybeSingle }));
const listingsEqId = vi.fn(() => ({ eq: listingsEqOperator }));
const listingsSelect = vi.fn(() => ({ eq: listingsEqId }));

// Delete chain: from("listing_blocked_dates").delete().eq(..).eq(..)
const deleteEqInner = vi.fn(async () => ({
  data: null,
  error: mockState.deleteError,
}));
const deleteEqOuter = vi.fn(() => ({ eq: deleteEqInner }));
const deleteMock = vi.fn(() => ({ eq: deleteEqOuter }));

// Insert chain: from("listing_blocked_dates").insert(rows)
const insertMock = vi.fn(async (rows: Record<string, unknown>[]) => {
  mockState.insertedRows = rows;
  return { data: null, error: mockState.insertError };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: {
          user: mockState.userId ? { id: mockState.userId } : null,
        },
        error: null,
      })),
    },
    from: vi.fn((table: string) => {
      if (table === "listings") {
        return { select: listingsSelect };
      }
      if (table === "listing_blocked_dates") {
        return { delete: deleteMock, insert: insertMock };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  })),
}));

import { saveAvailability } from "./availability-actions";

describe("saveAvailability", () => {
  beforeEach(() => {
    vi.setSystemTime(new Date("2026-04-09T12:00:00Z"));
    mockState.userId = "op-1";
    mockState.ownershipRow = { id: "listing-1" };
    mockState.ownershipError = null;
    mockState.deleteError = null;
    mockState.insertError = null;
    mockState.insertedRows = null;
    listingsMaybeSingle.mockClear();
    listingsEqOperator.mockClear();
    listingsEqId.mockClear();
    listingsSelect.mockClear();
    deleteEqInner.mockClear();
    deleteEqOuter.mockClear();
    deleteMock.mockClear();
    insertMock.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("replaces operator_block rows on happy path", async () => {
    const result = await saveAvailability("listing-1", [
      { startDate: "2026-04-15", endDate: "2026-04-17" },
    ]);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.blockedCount).toBe(1);
    }
    // Ownership probe: BOTH `id` AND `operator_id` are filtered — the
    // operator_id filter is the defense-in-depth against RLS drift.
    expect(listingsEqId).toHaveBeenCalledWith("id", "listing-1");
    expect(listingsEqOperator).toHaveBeenCalledWith("operator_id", "op-1");
    expect(deleteMock).toHaveBeenCalledTimes(1);
    expect(deleteEqOuter).toHaveBeenCalledWith("listing_id", "listing-1");
    expect(deleteEqInner).toHaveBeenCalledWith("reason", "operator_block");
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(mockState.insertedRows).toEqual([
      {
        listing_id: "listing-1",
        start_date: "2026-04-15",
        end_date: "2026-04-17",
        reason: "operator_block",
      },
    ]);
  });

  it("returns DATABASE_ERROR when the ownership probe itself errors", async () => {
    mockState.ownershipError = { message: "connection terminated" };
    const result = await saveAvailability("listing-1", [
      { startDate: "2026-04-15", endDate: "2026-04-17" },
    ]);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("DATABASE_ERROR");
      expect(result.error.message).toContain("connection terminated");
    }
    expect(deleteMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("returns DATABASE_ERROR when the delete fails", async () => {
    mockState.deleteError = { message: "deadlock detected" };
    const result = await saveAvailability("listing-1", [
      { startDate: "2026-04-15", endDate: "2026-04-17" },
    ]);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("DATABASE_ERROR");
      expect(result.error.message).toContain("deadlock detected");
    }
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("returns DATABASE_ERROR when the insert fails after a successful delete", async () => {
    mockState.insertError = { message: "check constraint violated" };
    const result = await saveAvailability("listing-1", [
      { startDate: "2026-04-15", endDate: "2026-04-17" },
    ]);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("DATABASE_ERROR");
      expect(result.error.message).toContain("check constraint violated");
    }
    expect(deleteMock).toHaveBeenCalledTimes(1);
    expect(insertMock).toHaveBeenCalledTimes(1);
  });

  it("returns UNAUTHENTICATED when there is no user", async () => {
    mockState.userId = null;
    const result = await saveAvailability("listing-1", [
      { startDate: "2026-04-15", endDate: "2026-04-17" },
    ]);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("UNAUTHENTICATED");
    }
    expect(deleteMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("returns VALIDATION_ERROR when a range fails schema parsing", async () => {
    const result = await saveAvailability("listing-1", [
      { startDate: "2026-04-17", endDate: "2026-04-15" },
    ]);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
      expect(result.error.message).toBe(
        "Start date must be on or before end date",
      );
    }
    expect(deleteMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND when the ownership probe finds nothing", async () => {
    mockState.ownershipRow = null;
    const result = await saveAvailability("listing-1", [
      { startDate: "2026-04-15", endDate: "2026-04-17" },
    ]);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("NOT_FOUND");
      expect(result.error.message).toBe("Listing not found");
    }
    expect(deleteMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });
});
