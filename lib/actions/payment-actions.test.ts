import { beforeEach, describe, expect, it, vi } from "vitest";

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
  bookingUpdateError: null,
  lastBookingUpdate: null,
  rpcError: null,
  rpcResult: null,
};

const stripeMocks = {
  createBookingHoldIntent: vi.fn(),
  cancelPaymentIntent: vi.fn(),
  paymentIntentsRetrieve: vi.fn(),
};

vi.mock("@/lib/services/stripe", () => ({
  createBookingHoldIntent: (...args: unknown[]) =>
    stripeMocks.createBookingHoldIntent(...args),
  cancelPaymentIntent: (...args: unknown[]) =>
    stripeMocks.cancelPaymentIntent(...args),
  getStripeServerClient: () => ({
    paymentIntents: {
      retrieve: (...args: unknown[]) =>
        stripeMocks.paymentIntentsRetrieve(...args),
    },
  }),
}));

const notificationsMock = vi.fn();
vi.mock("@/lib/services/notifications", () => ({
  sendBookingConfirmationSms: (...args: unknown[]) =>
    notificationsMock(...args),
}));

function makeBookingsBuilder() {
  let mode: "load" | "update" | "unknown" = "unknown";
  let updatePayload: Row | null = null;
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
      updatePayload = payload;
      mockState.lastBookingUpdate = payload;
      // After update(...).eq(...) resolves. Make .eq return a thenable.
      return {
        eq: () =>
          Promise.resolve({
            data: null,
            error: mockState.bookingUpdateError,
          }),
      };
    },
    _getUpdatePayload: () => updatePayload,
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

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === "bookings") return makeBookingsBuilder();
      if (table === "listings") return makeListingsBuilder();
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

import {
  confirmBookingAfterPayment,
  createBookingHold,
} from "./payment-actions";

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
    status: "pending_payment",
    start_date: "2026-05-01",
    end_date: "2026-05-03",
    total_cents: 30000,
    stripe_payment_intent_id: null,
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
  mockState.bookingUpdateError = null;
  mockState.lastBookingUpdate = null;
  mockState.rpcError = null;
  mockState.rpcResult = { id: BOOKING_ID };

  stripeMocks.createBookingHoldIntent.mockReset();
  stripeMocks.cancelPaymentIntent.mockReset();
  stripeMocks.paymentIntentsRetrieve.mockReset();
  stripeMocks.createBookingHoldIntent.mockResolvedValue({
    clientSecret: "pi_test_secret",
    paymentIntentId: "pi_test",
  });
  stripeMocks.cancelPaymentIntent.mockResolvedValue(undefined);

  notificationsMock.mockReset();
  notificationsMock.mockResolvedValue({ delivered: true, stub: true });

  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_xyz";
}

beforeEach(reset);

describe("createBookingHold", () => {
  it("rejects when no renter session", async () => {
    mockState.currentUser = null;
    const result = await createBookingHold(BOOKING_ID);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("PAYMENT_UNAUTHENTICATED");
    }
  });

  it("rejects when the booking is owned by a different renter", async () => {
    mockState.bookingRow = { ...mockState.bookingRow!, renter_id: "renter-2" };
    const result = await createBookingHold(BOOKING_ID);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("PAYMENT_FORBIDDEN");
  });

  it("rejects when the booking is not pending_payment", async () => {
    mockState.bookingRow = {
      ...mockState.bookingRow!,
      status: "confirmed",
    };
    const result = await createBookingHold(BOOKING_ID);
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.code).toBe("PAYMENT_INVALID_STATUS");
  });

  it("happy path: recomputes total, creates intent, persists id", async () => {
    const result = await createBookingHold(BOOKING_ID);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.clientSecret).toBe("pi_test_secret");
      expect(result.data.amountCents).toBe(30000); // 10000 * 3 days
      expect(result.data.publishableKey).toBe("pk_test_xyz");
    }
    expect(stripeMocks.createBookingHoldIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingId: BOOKING_ID,
        amountCents: 30000,
      }),
    );
    expect(mockState.lastBookingUpdate).toMatchObject({
      stripe_payment_intent_id: "pi_test",
      total_cents: 30000,
    });
  });

  it("rolls back the Stripe intent when the DB update fails", async () => {
    mockState.bookingUpdateError = { message: "update failed" };
    const result = await createBookingHold(BOOKING_ID);
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.code).toBe("PAYMENT_DATABASE_ERROR");
    expect(stripeMocks.cancelPaymentIntent).toHaveBeenCalledWith("pi_test");
  });

  it("fails when the publishable key is missing", async () => {
    delete process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    const result = await createBookingHold(BOOKING_ID);
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.code).toBe("PAYMENT_MISSING_PUBLISHABLE_KEY");
  });
});

describe("confirmBookingAfterPayment", () => {
  beforeEach(() => {
    mockState.bookingRow = {
      ...mockState.bookingRow!,
      stripe_payment_intent_id: "pi_test",
    };
  });

  it("returns SESSION_EXPIRED when the renter session dropped mid-flow (Story 3-6)", async () => {
    mockState.currentUser = null;
    const result = await confirmBookingAfterPayment(BOOKING_ID);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("SESSION_EXPIRED");
  });

  it("rejects when booking owned by another renter", async () => {
    mockState.bookingRow = { ...mockState.bookingRow!, renter_id: "renter-2" };
    const result = await confirmBookingAfterPayment(BOOKING_ID);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("PAYMENT_FORBIDDEN");
  });

  it("returns success idempotently when booking already confirmed", async () => {
    mockState.bookingRow = {
      ...mockState.bookingRow!,
      status: "confirmed",
    };
    const result = await confirmBookingAfterPayment(BOOKING_ID);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.redirectTo).toContain("confirmed");
    }
    expect(notificationsMock).not.toHaveBeenCalled();
  });

  it("happy path: calls RPC, sends SMS stub, returns redirectTo", async () => {
    const result = await confirmBookingAfterPayment(BOOKING_ID);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.bookingId).toBe(BOOKING_ID);
      expect(result.data.listingId).toBe(LISTING_ID);
      expect(result.data.redirectTo).toBe(
        `/book/${LISTING_ID}/confirmed?bookingId=${BOOKING_ID}`,
      );
    }
    expect(notificationsMock).toHaveBeenCalledTimes(1);
  });

  it("cancels the PaymentIntent and returns BOOKING_CONFLICT on race loss", async () => {
    mockState.rpcError = {
      message: "BOOKING_CONFLICT: one or more dates were just booked",
    };
    const result = await confirmBookingAfterPayment(BOOKING_ID);
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.code).toBe("BOOKING_CONFLICT");
    expect(stripeMocks.cancelPaymentIntent).toHaveBeenCalledWith("pi_test");
  });

  it("returns BOOKING_NOT_FOUND on missing booking", async () => {
    mockState.bookingRow = null;
    const result = await confirmBookingAfterPayment(BOOKING_ID);
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.code).toBe("PAYMENT_BOOKING_NOT_FOUND");
  });
});
