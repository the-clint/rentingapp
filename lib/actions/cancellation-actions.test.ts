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

  rpcError: { message: string } | null;
}

const mockState: MockState = {
  currentUser: null,
  bookingRow: null,
  bookingError: null,
  listingRow: null,
  listingError: null,
  rpcError: null,
};

const stripeMocks = {
  cancelPaymentIntent: vi.fn(),
  cancelExtensionIntent: vi.fn(),
  capturePaymentIntent: vi.fn(),
};

vi.mock("@/lib/services/stripe", () => ({
  cancelPaymentIntent: (...args: unknown[]) =>
    stripeMocks.cancelPaymentIntent(...args),
  cancelExtensionIntent: (...args: unknown[]) =>
    stripeMocks.cancelExtensionIntent(...args),
  capturePaymentIntent: (...args: unknown[]) =>
    stripeMocks.capturePaymentIntent(...args),
}));

const notificationsMock = vi.fn();
vi.mock("@/lib/services/notifications", () => ({
  sendBookingCancellationSms: (...args: unknown[]) =>
    notificationsMock(...args),
}));

function makeBookingsBuilder() {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => ({
      data: mockState.bookingError ? null : mockState.bookingRow,
      error: mockState.bookingError,
    }),
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
      data: null,
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

// Today = 2026-05-01T00:00:00Z for the eligibility / upcoming window.
// Most tests pin the booking start far enough in the future that the
// 48h boundary isn't hit — specific boundary tests then re-pin the
// system clock below.
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-05-01T00:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

import {
  CANCELLATION_REFUND_HOURS,
  computeHoursUntilStart,
  outcomeFromHours,
} from "../services/cancellation-policy";
import {
  confirmCancellation,
  previewCancellation,
} from "./cancellation-actions";

const BOOKING_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const LISTING_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd";

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
    // 2026-05-10 is 9 days after the frozen clock → hours = 216 → refund.
    start_date: "2026-05-10",
    end_date: "2026-05-12",
    total_cents: 45000,
    stripe_payment_intent_id: "pi_main_1",
    stripe_extension_intent_id: null,
  };
  mockState.bookingError = null;
  mockState.listingRow = {
    id: LISTING_ID,
    name: "Kubota Mini Excavator",
  };
  mockState.listingError = null;
  mockState.rpcError = null;

  stripeMocks.cancelPaymentIntent.mockReset();
  stripeMocks.cancelExtensionIntent.mockReset();
  stripeMocks.capturePaymentIntent.mockReset();
  stripeMocks.cancelPaymentIntent.mockResolvedValue(undefined);
  stripeMocks.cancelExtensionIntent.mockResolvedValue(undefined);
  stripeMocks.capturePaymentIntent.mockResolvedValue(undefined);

  notificationsMock.mockReset();
  notificationsMock.mockResolvedValue({ delivered: true, stub: true });
}

beforeEach(reset);

describe("outcomeFromHours (policy boundary)", () => {
  it("refund at exactly 48 hours", () => {
    expect(outcomeFromHours(CANCELLATION_REFUND_HOURS)).toBe("refund");
  });
  it("hold_captured just under 48 hours", () => {
    expect(outcomeFromHours(47.99)).toBe("hold_captured");
    expect(outcomeFromHours(47)).toBe("hold_captured");
    expect(outcomeFromHours(0)).toBe("hold_captured");
  });
  it("refund for ample lead time", () => {
    expect(outcomeFromHours(72)).toBe("refund");
    expect(outcomeFromHours(100)).toBe("refund");
  });
});

describe("computeHoursUntilStart", () => {
  it("computes hours from a UTC midnight start date", () => {
    const now = new Date("2026-05-01T00:00:00Z");
    expect(computeHoursUntilStart("2026-05-03", now)).toBe(48);
    expect(computeHoursUntilStart("2026-05-02", now)).toBe(24);
  });
  it("returns a fractional hour count", () => {
    const now = new Date("2026-05-01T00:01:00Z");
    // 2026-05-03 midnight - (2026-05-01 00:01) = 47h 59m
    expect(computeHoursUntilStart("2026-05-03", now)).toBeCloseTo(
      47 + 59 / 60,
      4,
    );
  });
});

describe("previewCancellation", () => {
  it("rejects when no renter session", async () => {
    mockState.currentUser = null;
    const result = await previewCancellation(BOOKING_ID);
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.code).toBe("CANCELLATION_UNAUTHENTICATED");
  });

  it("rejects when booking is owned by another renter", async () => {
    mockState.bookingRow = {
      ...mockState.bookingRow!,
      renter_id: "renter-2",
    };
    const result = await previewCancellation(BOOKING_ID);
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.code).toBe("CANCELLATION_FORBIDDEN");
  });

  it("rejects when booking is already cancelled", async () => {
    mockState.bookingRow = {
      ...mockState.bookingRow!,
      status: "cancelled",
    };
    const result = await previewCancellation(BOOKING_ID);
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.code).toBe("CANCELLATION_ALREADY_CANCELLED");
  });

  it("rejects when lifecycle is active (not upcoming)", async () => {
    // start_date 2026-05-01 = today, end 2026-05-03 → active.
    mockState.bookingRow = {
      ...mockState.bookingRow!,
      start_date: "2026-05-01",
      end_date: "2026-05-03",
    };
    const result = await previewCancellation(BOOKING_ID);
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.code).toBe("CANCELLATION_NOT_ELIGIBLE");
  });

  it("returns refund outcome with > 48h lead time", async () => {
    const result = await previewCancellation(BOOKING_ID);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.outcome).toBe("refund");
      expect(result.data.amountCents).toBe(45000);
      expect(result.data.hoursUntilStart).toBeGreaterThanOrEqual(48);
      expect(result.data.listingName).toBe("Kubota Mini Excavator");
    }
  });

  it("returns hold_captured when strictly within 48h", async () => {
    // now = 2026-05-01T00:01Z, start = 2026-05-03 midnight → 47h59m.
    vi.setSystemTime(new Date("2026-05-01T00:01:00Z"));
    mockState.bookingRow = {
      ...mockState.bookingRow!,
      start_date: "2026-05-03",
      end_date: "2026-05-04",
    };
    const result = await previewCancellation(BOOKING_ID);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.outcome).toBe("hold_captured");
      expect(result.data.hoursUntilStart).toBeLessThan(48);
    }
  });

  it("returns refund at the EXACT 48h boundary", async () => {
    // now = 2026-05-01T00:00Z, start = 2026-05-03 midnight → exactly 48h.
    vi.setSystemTime(new Date("2026-05-01T00:00:00Z"));
    mockState.bookingRow = {
      ...mockState.bookingRow!,
      start_date: "2026-05-03",
      end_date: "2026-05-04",
    };
    const result = await previewCancellation(BOOKING_ID);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.hoursUntilStart).toBe(48);
      expect(result.data.outcome).toBe("refund");
    }
  });
});

describe("confirmCancellation — happy paths", () => {
  it("refund outcome: cancels main intent, runs RPC, fires SMS", async () => {
    const result = await confirmCancellation(BOOKING_ID, {
      acknowledgedOutcome: "refund",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.outcome).toBe("refund");
      expect(result.data.newStatus).toBe("cancelled");
    }
    expect(stripeMocks.cancelPaymentIntent).toHaveBeenCalledWith("pi_main_1");
    expect(stripeMocks.capturePaymentIntent).not.toHaveBeenCalled();
    expect(notificationsMock).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "refund" }),
    );
  });

  it("refund outcome also cancels the extension intent when present", async () => {
    mockState.bookingRow = {
      ...mockState.bookingRow!,
      stripe_extension_intent_id: "pi_ext_1",
    };
    const result = await confirmCancellation(BOOKING_ID, {
      acknowledgedOutcome: "refund",
    });
    expect(result.success).toBe(true);
    expect(stripeMocks.cancelPaymentIntent).toHaveBeenCalledWith("pi_main_1");
    expect(stripeMocks.cancelExtensionIntent).toHaveBeenCalledWith("pi_ext_1");
  });

  it("hold_captured outcome captures both intents when within 48h", async () => {
    vi.setSystemTime(new Date("2026-05-01T00:01:00Z"));
    mockState.bookingRow = {
      ...mockState.bookingRow!,
      start_date: "2026-05-03",
      end_date: "2026-05-04",
      stripe_extension_intent_id: "pi_ext_1",
    };
    const result = await confirmCancellation(BOOKING_ID, {
      acknowledgedOutcome: "hold_captured",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.outcome).toBe("hold_captured");
    }
    expect(stripeMocks.capturePaymentIntent).toHaveBeenCalledWith("pi_main_1");
    expect(stripeMocks.capturePaymentIntent).toHaveBeenCalledWith("pi_ext_1");
    expect(stripeMocks.cancelPaymentIntent).not.toHaveBeenCalled();
  });
});

describe("confirmCancellation — drift detection", () => {
  it("returns OUTCOME_DRIFT when the user acknowledged refund but now it's within 48h", async () => {
    vi.setSystemTime(new Date("2026-05-01T00:01:00Z"));
    mockState.bookingRow = {
      ...mockState.bookingRow!,
      start_date: "2026-05-03",
      end_date: "2026-05-04",
    };
    const result = await confirmCancellation(BOOKING_ID, {
      acknowledgedOutcome: "refund",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("OUTCOME_DRIFT");
    // No Stripe side-effect should have run.
    expect(stripeMocks.cancelPaymentIntent).not.toHaveBeenCalled();
    expect(stripeMocks.capturePaymentIntent).not.toHaveBeenCalled();
  });

  it("returns OUTCOME_DRIFT when the user acknowledged hold_captured but lead time is still > 48h", async () => {
    const result = await confirmCancellation(BOOKING_ID, {
      acknowledgedOutcome: "hold_captured",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("OUTCOME_DRIFT");
  });

  it("rejects an invalid acknowledgedOutcome value as OUTCOME_DRIFT", async () => {
    const result = await confirmCancellation(BOOKING_ID, {
      acknowledgedOutcome: "nonsense" as never,
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("OUTCOME_DRIFT");
  });
});

describe("confirmCancellation — ineligibility + errors", () => {
  it("returns SESSION_EXPIRED when the renter session has dropped", async () => {
    mockState.currentUser = null;
    const result = await confirmCancellation(BOOKING_ID, {
      acknowledgedOutcome: "refund",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("SESSION_EXPIRED");
  });

  it("returns CANCELLATION_NOT_ELIGIBLE when the booking is already active", async () => {
    mockState.bookingRow = {
      ...mockState.bookingRow!,
      start_date: "2026-05-01",
      end_date: "2026-05-05",
    };
    const result = await confirmCancellation(BOOKING_ID, {
      acknowledgedOutcome: "refund",
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.code).toBe("CANCELLATION_NOT_ELIGIBLE");
  });

  it("returns CANCELLATION_ALREADY_CANCELLED when the booking is already cancelled", async () => {
    mockState.bookingRow = {
      ...mockState.bookingRow!,
      status: "cancelled",
    };
    const result = await confirmCancellation(BOOKING_ID, {
      acknowledgedOutcome: "refund",
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.code).toBe("CANCELLATION_ALREADY_CANCELLED");
  });

  it("returns CANCELLATION_STRIPE_ERROR when the Stripe cancel call fails", async () => {
    stripeMocks.cancelPaymentIntent.mockRejectedValueOnce(
      new Error("stripe down"),
    );
    const result = await confirmCancellation(BOOKING_ID, {
      acknowledgedOutcome: "refund",
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.code).toBe("CANCELLATION_STRIPE_ERROR");
    // RPC must not run if Stripe failed.
    expect(notificationsMock).not.toHaveBeenCalled();
  });

  it("returns CANCELLATION_DATABASE_ERROR if the RPC fails AFTER Stripe succeeded", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockState.rpcError = { message: "connection refused" };
    const result = await confirmCancellation(BOOKING_ID, {
      acknowledgedOutcome: "refund",
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.code).toBe("CANCELLATION_DATABASE_ERROR");
    // Stripe DID run — prior to the RPC.
    expect(stripeMocks.cancelPaymentIntent).toHaveBeenCalledWith("pi_main_1");
    // We log loudly when Stripe ran + RPC failed.
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
