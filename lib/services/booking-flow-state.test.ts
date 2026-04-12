import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

interface MockState {
  bookingRows: Row[] | null;
  bookingError: { message: string } | null;
  contractRow: Row | null;
  contractError: { message: string } | null;
}

const mockState: MockState = {
  bookingRows: null,
  bookingError: null,
  contractRow: null,
  contractError: null,
};

function makeBookingsBuilder() {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    in: () =>
      Promise.resolve({
        data: mockState.bookingError ? null : mockState.bookingRows,
        error: mockState.bookingError,
      }),
  };
  return chain;
}

function makeContractsBuilder() {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    is: () => chain,
    maybeSingle: async () => ({
      data: mockState.contractError ? null : mockState.contractRow,
      error: mockState.contractError,
    }),
  };
  return chain;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === "bookings") return makeBookingsBuilder();
      if (table === "contracts") return makeContractsBuilder();
      throw new Error(`Unexpected table: ${table}`);
    }),
  })),
}));

import {
  getBookingFlowResumePoint,
  isStepForward,
  type BookingFlowStep,
} from "./booking-flow-state";

const INPUT = {
  renterId: "11111111-1111-1111-1111-111111111111",
  listingId: "22222222-2222-2222-2222-222222222222",
  startDate: "2026-05-01",
  endDate: "2026-05-03",
} as const;

beforeEach(() => {
  mockState.bookingRows = null;
  mockState.bookingError = null;
  mockState.contractRow = null;
  mockState.contractError = null;
});

describe("getBookingFlowResumePoint", () => {
  it("returns 'confirmed' when a confirmed booking exists", async () => {
    mockState.bookingRows = [{ id: "book-1", status: "confirmed" }];
    const result = await getBookingFlowResumePoint(INPUT);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.step).toBe("confirmed");
      expect(result.data.bookingId).toBe("book-1");
    }
  });

  it("returns 'payment' when a pending_payment booking exists", async () => {
    mockState.bookingRows = [{ id: "book-2", status: "pending_payment" }];
    const result = await getBookingFlowResumePoint(INPUT);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.step).toBe("payment");
      expect(result.data.bookingId).toBe("book-2");
    }
  });

  it("prefers confirmed over pending_payment when both exist", async () => {
    mockState.bookingRows = [
      { id: "book-2", status: "pending_payment" },
      { id: "book-1", status: "confirmed" },
    ];
    const result = await getBookingFlowResumePoint(INPUT);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.step).toBe("confirmed");
      expect(result.data.bookingId).toBe("book-1");
    }
  });

  it("returns 'contract' when only an unsigned contract exists", async () => {
    mockState.bookingRows = [];
    mockState.contractRow = { id: "contract-1" };
    const result = await getBookingFlowResumePoint(INPUT);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.step).toBe("contract");
      expect(result.data.contractId).toBe("contract-1");
    }
  });

  it("returns 'listing' when nothing is persisted", async () => {
    mockState.bookingRows = [];
    mockState.contractRow = null;
    const result = await getBookingFlowResumePoint(INPUT);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.step).toBe("listing");
      expect(result.data.bookingId).toBeUndefined();
      expect(result.data.contractId).toBeUndefined();
    }
  });

  it("returns 'listing' when any input field is empty (ownership-safe default)", async () => {
    const result = await getBookingFlowResumePoint({
      ...INPUT,
      renterId: "",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.step).toBe("listing");
  });

  it("surfaces a database error on the bookings lookup", async () => {
    mockState.bookingError = { message: "boom" };
    const result = await getBookingFlowResumePoint(INPUT);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("BOOKING_FLOW_STATE_DATABASE_ERROR");
    }
  });

  it("surfaces a database error on the contracts lookup", async () => {
    mockState.bookingRows = [];
    mockState.contractError = { message: "boom" };
    const result = await getBookingFlowResumePoint(INPUT);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("BOOKING_FLOW_STATE_DATABASE_ERROR");
    }
  });

  it("ignores cancelled bookings (they never make it into the query result)", async () => {
    // The SQL query uses `.in('status', ['confirmed', 'pending_payment'])`
    // so cancelled rows are filtered at the database. Simulate: the
    // builder receives an empty array, we fall through to contract,
    // then to listing.
    mockState.bookingRows = [];
    mockState.contractRow = null;
    const result = await getBookingFlowResumePoint(INPUT);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.step).toBe("listing");
  });
});

describe("isStepForward", () => {
  const cases: ReadonlyArray<[BookingFlowStep, BookingFlowStep, boolean]> = [
    ["listing", "contract", true],
    ["listing", "payment", true],
    ["contract", "payment", true],
    ["payment", "confirmed", true],
    ["contract", "listing", false],
    ["payment", "contract", false],
    ["confirmed", "payment", false],
    ["contract", "contract", false],
  ];
  for (const [current, next, expected] of cases) {
    it(`${current} → ${next} = ${expected}`, () => {
      expect(isStepForward(current, next)).toBe(expected);
    });
  }
});
