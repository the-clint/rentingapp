import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

interface MockState {
  currentUser: {
    id: string;
    phone: string | null;
    app_metadata: { role?: string };
  } | null;

  bookingRow: Row | null;
  bookingError: { message: string } | null;

  listingRow: Row | null;
  listingError: { message: string } | null;

  bufferRows: Row[] | null;
  bufferError: { message: string } | null;

  bookingUpdateError: { message: string } | null;
  lastBookingUpdate: Row | null;

  rpcError: { message: string } | null;
  rpcResult: Row | null;
}

const mockState: MockState = {
  currentUser: null,
  bookingRow: null,
  bookingError: null,
  listingRow: null,
  listingError: null,
  bufferRows: null,
  bufferError: null,
  bookingUpdateError: null,
  lastBookingUpdate: null,
  rpcError: null,
  rpcResult: null,
};

const stripeMocks = {
  createExtensionHoldIntent: vi.fn(),
  cancelExtensionIntent: vi.fn(),
};

vi.mock("@/lib/services/stripe", () => ({
  createExtensionHoldIntent: (...args: unknown[]) =>
    stripeMocks.createExtensionHoldIntent(...args),
  cancelExtensionIntent: (...args: unknown[]) =>
    stripeMocks.cancelExtensionIntent(...args),
}));

const notificationsMock = vi.fn();
vi.mock("@/lib/services/notifications", () => ({
  sendBookingExtensionSms: (...args: unknown[]) =>
    notificationsMock(...args),
}));

function makeBookingsBuilder() {
  let mode: "load" | "update" | "unknown" = "unknown";
  const chain: Record<string, unknown> = {
    select: () => {
      if (mode === "unknown") mode = "load";
      return chain;
    },
    eq: () => chain,
    maybeSingle: async () => {
      mode = "unknown";
      return {
        data: mockState.bookingError ? null : mockState.bookingRow,
        error: mockState.bookingError,
      };
    },
    update: (payload: Row) => {
      mode = "update";
      mockState.lastBookingUpdate = payload;
      return {
        eq: () =>
          Promise.resolve({
            data: null,
            error: mockState.bookingUpdateError,
          }),
      };
    },
  };
  return chain;
}

function makeListingsBuilder() {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => ({
      data: mockState.listingError ? null : mockState.listingRow,
      error: mockState.listingError,
    }),
  };
  return chain;
}

function makeBlockedDatesBuilder() {
  const chain = {
    select: () => chain,
    eq: () => chain,
    lte: () => chain,
    gte: async () => ({
      data: mockState.bufferError ? null : mockState.bufferRows ?? [],
      error: mockState.bufferError,
    }),
  };
  return chain;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === "bookings") return makeBookingsBuilder();
      if (table === "listings") return makeListingsBuilder();
      if (table === "listing_blocked_dates") return makeBlockedDatesBuilder();
      throw new Error(`Unexpected table: ${table}`);
    }),
    rpc: vi.fn(async () => ({
      data: mockState.rpcResult,
      error: mockState.rpcError,
    })),
  })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: async () => ({
        data: { user: mockState.currentUser },
      }),
    },
  })),
}));

// Freeze the system clock inside the booking's active window.
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-05-02T12:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

import {
  commitExtension,
  prepareExtension,
} from "./extension-actions";

const BOOKING_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const LISTING_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function reset() {
  mockState.currentUser = {
    id: "renter-1",
    phone: "+18015551234",
    app_metadata: { role: "renter" },
  };
  mockState.bookingRow = {
    id: BOOKING_ID,
    listing_id: LISTING_ID,
    renter_id: "renter-1",
    status: "confirmed",
    start_date: "2026-05-01",
    end_date: "2026-05-03",
    total_cents: 30000,
    stripe_extension_intent_id: null,
  };
  mockState.bookingError = null;
  mockState.listingRow = {
    id: LISTING_ID,
    name: "Kubota Mini Excavator",
    daily_rate_cents: 10000,
    status: "published",
    deleted_at: null,
  };
  mockState.listingError = null;
  mockState.bufferRows = [
    {
      id: "buffer-1",
      start_date: "2026-05-04", // end_date + 1
      end_date: "2026-05-08", // end_date + 5 → 5 days total, 4 available
    },
  ];
  mockState.bufferError = null;
  mockState.bookingUpdateError = null;
  mockState.lastBookingUpdate = null;
  mockState.rpcError = null;
  mockState.rpcResult = null;

  stripeMocks.createExtensionHoldIntent.mockReset();
  stripeMocks.cancelExtensionIntent.mockReset();
  stripeMocks.createExtensionHoldIntent.mockResolvedValue({
    clientSecret: "pi_ext_secret",
    paymentIntentId: "pi_ext_1",
  });
  stripeMocks.cancelExtensionIntent.mockResolvedValue(undefined);

  notificationsMock.mockReset();
  notificationsMock.mockResolvedValue({ delivered: true, stub: true });

  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_xyz";
}

beforeEach(reset);

describe("prepareExtension", () => {
  it("rejects when no renter session", async () => {
    mockState.currentUser = null;
    const result = await prepareExtension(BOOKING_ID, 2);
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.code).toBe("EXTENSION_UNAUTHENTICATED");
  });

  it("rejects when the booking is owned by a different renter", async () => {
    mockState.bookingRow = { ...mockState.bookingRow!, renter_id: "renter-2" };
    const result = await prepareExtension(BOOKING_ID, 2);
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.code).toBe("EXTENSION_FORBIDDEN");
  });

  it("rejects when booking status is not confirmed", async () => {
    mockState.bookingRow = {
      ...mockState.bookingRow!,
      status: "cancelled",
    };
    const result = await prepareExtension(BOOKING_ID, 2);
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.code).toBe("EXTENSION_NOT_ELIGIBLE");
  });

  it("rejects when lifecycle is not active/return_due (upcoming)", async () => {
    // Today = 2026-05-02; start = 2026-06-01 → upcoming.
    mockState.bookingRow = {
      ...mockState.bookingRow!,
      start_date: "2026-06-01",
      end_date: "2026-06-03",
    };
    mockState.bufferRows = [
      { id: "buffer-1", start_date: "2026-06-04", end_date: "2026-06-08" },
    ];
    const result = await prepareExtension(BOOKING_ID, 2);
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.code).toBe("EXTENSION_NOT_ELIGIBLE");
  });

  it("rejects extendDays outside 1..4", async () => {
    const r1 = await prepareExtension(BOOKING_ID, 0);
    const r2 = await prepareExtension(BOOKING_ID, 5);
    expect(r1.success).toBe(false);
    expect(r2.success).toBe(false);
    if (!r1.success) expect(r1.error.code).toBe("EXTENSION_LIMIT_EXCEEDED");
    if (!r2.success) expect(r2.error.code).toBe("EXTENSION_LIMIT_EXCEEDED");
  });

  it("rejects extendDays beyond remaining buffer", async () => {
    // Buffer reduced to 2 days total → maxExtendDays = 1.
    mockState.bufferRows = [
      { id: "buffer-1", start_date: "2026-05-07", end_date: "2026-05-08" },
    ];
    const result = await prepareExtension(BOOKING_ID, 3);
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.code).toBe("EXTENSION_LIMIT_EXCEEDED");
  });

  it("happy path: creates Stripe intent, persists id, returns new end date", async () => {
    const result = await prepareExtension(BOOKING_ID, 2);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.amountCents).toBe(20000); // 10000 * 2
      expect(result.data.extendDays).toBe(2);
      expect(result.data.newEndDate).toBe("2026-05-05");
      expect(result.data.clientSecret).toBe("pi_ext_secret");
      expect(result.data.publishableKey).toBe("pk_test_xyz");
    }
    expect(stripeMocks.createExtensionHoldIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingId: BOOKING_ID,
        amountCents: 20000,
      }),
    );
    expect(mockState.lastBookingUpdate).toMatchObject({
      stripe_extension_intent_id: "pi_ext_1",
    });
  });

  it("rolls back the Stripe intent when the DB update fails", async () => {
    mockState.bookingUpdateError = { message: "update failed" };
    const result = await prepareExtension(BOOKING_ID, 1);
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.code).toBe("EXTENSION_DATABASE_ERROR");
    expect(stripeMocks.cancelExtensionIntent).toHaveBeenCalledWith(
      "pi_ext_1",
    );
  });

  it("fails when the publishable key is missing", async () => {
    delete process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    const result = await prepareExtension(BOOKING_ID, 1);
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.code).toBe("EXTENSION_MISSING_PUBLISHABLE_KEY");
  });

  it("fails with EXTENSION_NOT_ELIGIBLE when no buffer row exists", async () => {
    mockState.bufferRows = [];
    const result = await prepareExtension(BOOKING_ID, 1);
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.code).toBe("EXTENSION_NOT_ELIGIBLE");
  });
});

describe("commitExtension", () => {
  beforeEach(() => {
    mockState.bookingRow = {
      ...mockState.bookingRow!,
      stripe_extension_intent_id: "pi_ext_1",
    };
  });

  it("returns SESSION_EXPIRED when the renter session dropped mid-flow", async () => {
    mockState.currentUser = null;
    const result = await commitExtension({
      bookingId: BOOKING_ID,
      extendDays: 2,
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("SESSION_EXPIRED");
  });

  it("rejects when booking owned by another renter", async () => {
    mockState.bookingRow = { ...mockState.bookingRow!, renter_id: "renter-2" };
    const result = await commitExtension({
      bookingId: BOOKING_ID,
      extendDays: 2,
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("EXTENSION_FORBIDDEN");
  });

  it("rejects when no extension intent is on file", async () => {
    mockState.bookingRow = {
      ...mockState.bookingRow!,
      stripe_extension_intent_id: null,
    };
    const result = await commitExtension({
      bookingId: BOOKING_ID,
      extendDays: 2,
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.code).toBe("EXTENSION_NOT_ELIGIBLE");
  });

  it("happy path: calls the RPC, fires SMS stub, returns new end date + total", async () => {
    const result = await commitExtension({
      bookingId: BOOKING_ID,
      extendDays: 2,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.newEndDate).toBe("2026-05-05");
      expect(result.data.newTotalCents).toBe(50000); // 30000 + 10000*2
      expect(result.data.extendDays).toBe(2);
    }
    expect(notificationsMock).toHaveBeenCalledTimes(1);
  });

  it("cancels the delta intent and returns EXTENSION_CONFLICT on race loss", async () => {
    mockState.rpcError = {
      message: "EXTENSION_CONFLICT: one or more extension dates were just booked",
    };
    const result = await commitExtension({
      bookingId: BOOKING_ID,
      extendDays: 2,
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.code).toBe("EXTENSION_CONFLICT");
    expect(stripeMocks.cancelExtensionIntent).toHaveBeenCalledWith("pi_ext_1");
  });

  it("maps EXTENSION_LIMIT_EXCEEDED from RPC", async () => {
    mockState.rpcError = {
      message: "EXTENSION_LIMIT_EXCEEDED: requested 4 days, only 2 available",
    };
    const result = await commitExtension({
      bookingId: BOOKING_ID,
      extendDays: 2,
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.code).toBe("EXTENSION_LIMIT_EXCEEDED");
  });
});
