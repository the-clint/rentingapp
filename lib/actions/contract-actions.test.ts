import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Contract Server Action tests.
 *
 * The admin-client is mocked with a small hand-rolled builder that covers
 * the exact call shapes used by `createContractDraft` and `signContract`:
 *
 *   admin.from("listings")
 *     .select(...).eq("id", ...).maybeSingle()
 *
 *   admin.from("contracts")
 *     .select(...).eq(...).eq(...).eq(...).eq(...).is(...).maybeSingle()
 *     .insert({...}).select("id").single()
 *     .select(...).eq("id", ...).maybeSingle()
 *     .update({...}).eq("id", ...).is("signed_at", null)
 *
 *   admin.from("bookings")
 *     .select(...).eq(...).not(...).lte(...).gte(...)  // conflict probe
 *     .insert({...}).select("id").single()
 */

type Row = Record<string, unknown>;

interface MockState {
  currentUser: {
    id: string;
    phone: string | null;
    app_metadata: { role?: string };
  } | null;

  listingRow: Row | null;
  listingError: { message: string } | null;

  existingContract: Row | null;
  existingContractError: { message: string } | null;

  contractRow: Row | null;
  contractLoadError: { message: string } | null;

  contractInsertError: { message: string } | null;
  insertedContract: Row | null;

  contractUpdateError: { message: string } | null;
  lastContractUpdate: Row | null;

  bookingConflictRows: Row[];
  bookingConflictError: { message: string } | null;

  bookingInsertError: { message: string } | null;
  insertedBooking: Row | null;
}

const mockState: MockState = {
  currentUser: {
    id: "renter-1",
    phone: "+18015551234",
    app_metadata: { role: "renter" },
  },
  listingRow: null,
  listingError: null,
  existingContract: null,
  existingContractError: null,
  contractRow: null,
  contractLoadError: null,
  contractInsertError: null,
  insertedContract: null,
  contractUpdateError: null,
  lastContractUpdate: null,
  bookingConflictRows: [],
  bookingConflictError: null,
  bookingInsertError: null,
  insertedBooking: null,
};

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

function makeContractsBuilder() {
  // The module issues: select().eq().eq().eq().eq().is().maybeSingle() for
  // the idempotency probe, select().eq().maybeSingle() for the single-row
  // load in signContract, insert().select().single() for the draft insert,
  // and update().eq().is() for the sign stamp. A single chain that collects
  // calls into closure state handles all of them.
  let mode: "probe" | "load" | "insert" | "update" | "unknown" = "unknown";
  let inserted: Row | null = null;
  let updated: Row | null = null;

  const chain = {
    select: () => {
      if (mode === "insert") {
        // .insert().select("id").single() — fall through to single()
        return chain;
      }
      if (mode !== "unknown") return chain;
      // First call of select() — stay in "unknown", we'll pick probe vs load
      // based on which terminal gets called.
      return chain;
    },
    eq: () => chain,
    is: () => {
      if (mode === "unknown") mode = "probe";
      if (mode === "update") {
        // terminal for update path in our code: update(...).eq().is() returns a promise
        return Promise.resolve({
          data: null,
          error: mockState.contractUpdateError,
        });
      }
      return chain;
    },
    maybeSingle: async () => {
      if (mode === "probe") {
        mode = "unknown";
        return {
          data: mockState.existingContractError
            ? null
            : mockState.existingContract,
          error: mockState.existingContractError,
        };
      }
      // load path: select().eq().maybeSingle()
      return {
        data: mockState.contractLoadError ? null : mockState.contractRow,
        error: mockState.contractLoadError,
      };
    },
    single: async () => {
      // Used after insert(...).select("id")
      return {
        data: mockState.contractInsertError ? null : inserted,
        error: mockState.contractInsertError,
      };
    },
    insert: (row: Row) => {
      mode = "insert";
      inserted = { id: "contract-new", ...row };
      mockState.insertedContract = inserted;
      return chain;
    },
    update: (row: Row) => {
      mode = "update";
      updated = row;
      mockState.lastContractUpdate = updated;
      return chain;
    },
  };
  return chain;
}

function makeBookingsBuilder() {
  // createContractDraft never touches bookings. signContract issues:
  //   select("id,start_date,end_date,status").eq("listing_id",…)
  //     .not("status","in","(cancelled)").lte(...).gte(...)
  //   insert({...}).select("id").single()
  let mode: "conflict" | "insert" = "conflict";
  let inserted: Row | null = null;

  const chain = {
    select: () => chain,
    eq: () => chain,
    not: () => chain,
    lte: () => chain,
    gte: () => {
      // Terminal: return the promise result for the conflict probe
      return Promise.resolve({
        data: mockState.bookingConflictError
          ? null
          : mockState.bookingConflictRows,
        error: mockState.bookingConflictError,
      });
    },
    insert: (row: Row) => {
      mode = "insert";
      inserted = { id: "booking-new", ...row };
      mockState.insertedBooking = inserted;
      return chain;
    },
    single: async () => {
      if (mode !== "insert") {
        throw new Error("single() called in unexpected mode");
      }
      return {
        data: mockState.bookingInsertError ? null : inserted,
        error: mockState.bookingInsertError,
      };
    },
  };
  return chain;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === "listings") return makeListingsBuilder();
      if (table === "contracts") return makeContractsBuilder();
      if (table === "bookings") return makeBookingsBuilder();
      throw new Error(`Unexpected table: ${table}`);
    }),
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

import { createContractDraft, signContract } from "./contract-actions";

const VALID_LISTING_ID = "11111111-1111-1111-1111-111111111111";
const VALID_CONTRACT_ID = "22222222-2222-2222-2222-222222222222";

function resetState() {
  mockState.currentUser = {
    id: "renter-1",
    phone: "+18015551234",
    app_metadata: { role: "renter" },
  };
  mockState.listingRow = {
    id: VALID_LISTING_ID,
    name: "Kubota Mini Excavator",
    daily_rate_cents: 17500,
    pickup_location: "Provo, UT",
    pickup_instructions: "Lockbox 4321",
    status: "published",
    deleted_at: null,
  };
  mockState.listingError = null;
  mockState.existingContract = null;
  mockState.existingContractError = null;
  mockState.contractRow = null;
  mockState.contractLoadError = null;
  mockState.contractInsertError = null;
  mockState.insertedContract = null;
  mockState.contractUpdateError = null;
  mockState.lastContractUpdate = null;
  mockState.bookingConflictRows = [];
  mockState.bookingConflictError = null;
  mockState.bookingInsertError = null;
  mockState.insertedBooking = null;
}

describe("createContractDraft", () => {
  beforeEach(resetState);

  it("rejects a non-UUID listing id", async () => {
    const result = await createContractDraft({
      listingId: "not-a-uuid",
      startDate: "2026-05-01",
      endDate: "2026-05-03",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("CONTRACT_INVALID_INPUT");
    }
  });

  it("rejects when there is no renter session", async () => {
    mockState.currentUser = null;
    const result = await createContractDraft({
      listingId: VALID_LISTING_ID,
      startDate: "2026-05-01",
      endDate: "2026-05-03",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("CONTRACT_UNAUTHENTICATED");
    }
  });

  it("rejects when the listing has been soft-deleted", async () => {
    mockState.listingRow = {
      ...mockState.listingRow!,
      deleted_at: new Date().toISOString(),
    };
    const result = await createContractDraft({
      listingId: VALID_LISTING_ID,
      startDate: "2026-05-01",
      endDate: "2026-05-03",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("CONTRACT_LISTING_NOT_FOUND");
    }
  });

  it("inserts a new draft contract when no existing draft is found", async () => {
    const result = await createContractDraft({
      listingId: VALID_LISTING_ID,
      startDate: "2026-05-01",
      endDate: "2026-05-03",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.contractId).toBe("contract-new");
      expect(result.data.totalCents).toBe(17500 * 3);
      expect(result.data.body).toContain("Kubota Mini Excavator");
      expect(result.data.summary.cancellationLine).toContain(
        "Cancel 48+ hours",
      );
    }
    expect(mockState.insertedContract?.renter_id).toBe("renter-1");
    expect(mockState.insertedContract?.start_date).toBe("2026-05-01");
  });

  it("returns the existing draft id when one already exists (idempotent)", async () => {
    mockState.existingContract = { id: "existing-draft", body: "old body" };
    const result = await createContractDraft({
      listingId: VALID_LISTING_ID,
      startDate: "2026-05-01",
      endDate: "2026-05-03",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.contractId).toBe("existing-draft");
    }
    // No new insert happened.
    expect(mockState.insertedContract).toBeNull();
  });
});

describe("signContract", () => {
  beforeEach(() => {
    resetState();
    mockState.contractRow = {
      id: VALID_CONTRACT_ID,
      renter_id: "renter-1",
      listing_id: VALID_LISTING_ID,
      start_date: "2026-05-01",
      end_date: "2026-05-03",
      total_cents: 52500,
      signed_at: null,
      booking_id: null,
    };
  });

  it("rejects when agreeChecked is false", async () => {
    const result = await signContract({
      contractId: VALID_CONTRACT_ID,
      agreeChecked: false,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("CONTRACT_INVALID_INPUT");
    }
  });

  it("happy path: creates booking, stamps signed_at, returns bookingId", async () => {
    const result = await signContract({
      contractId: VALID_CONTRACT_ID,
      agreeChecked: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.bookingId).toBe("booking-new");
      expect(result.data.signedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
    expect(mockState.insertedBooking).toMatchObject({
      listing_id: VALID_LISTING_ID,
      renter_id: "renter-1",
      status: "pending_payment",
      contract_id: VALID_CONTRACT_ID,
    });
    expect(mockState.lastContractUpdate).toMatchObject({
      booking_id: "booking-new",
    });
    expect(mockState.lastContractUpdate?.signed_at).toBeDefined();
  });

  it("short-circuits with CONTRACT_ALREADY_SIGNED when signed_at is set", async () => {
    mockState.contractRow = {
      ...mockState.contractRow!,
      signed_at: "2026-04-10T12:00:00Z",
    };
    const result = await signContract({
      contractId: VALID_CONTRACT_ID,
      agreeChecked: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("CONTRACT_ALREADY_SIGNED");
    }
    expect(mockState.insertedBooking).toBeNull();
    expect(mockState.lastContractUpdate).toBeNull();
  });

  it("rejects when the contract belongs to a different renter", async () => {
    mockState.contractRow = {
      ...mockState.contractRow!,
      renter_id: "other-renter",
    };
    const result = await signContract({
      contractId: VALID_CONTRACT_ID,
      agreeChecked: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("CONTRACT_FORBIDDEN");
    }
  });

  it("returns BOOKING_CONFLICT when the dates overlap an active booking", async () => {
    mockState.bookingConflictRows = [
      {
        id: "booking-existing",
        start_date: "2026-05-02",
        end_date: "2026-05-04",
        status: "confirmed",
      },
    ];
    const result = await signContract({
      contractId: VALID_CONTRACT_ID,
      agreeChecked: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("BOOKING_CONFLICT");
    }
    expect(mockState.insertedBooking).toBeNull();
  });

  it("returns SESSION_EXPIRED when the renter session dropped mid-flow (Story 3-6)", async () => {
    mockState.currentUser = null;
    const result = await signContract({
      contractId: VALID_CONTRACT_ID,
      agreeChecked: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("SESSION_EXPIRED");
    }
  });
});
