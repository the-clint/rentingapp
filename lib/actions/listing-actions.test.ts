import { beforeEach, describe, expect, it, vi } from "vitest";

type QueryKind = "insert" | "select" | "update";

interface RecordedQuery {
  kind: QueryKind;
  // For insert: the row passed to insert(). For update: the patch passed to update().
  payload?: Record<string, unknown>;
  // Chained `.eq()` calls in order — each one captures [column, value].
  eqs: Array<[string, unknown]>;
  // Chained `.is()` calls in order — each one captures [column, value].
  iss: Array<[string, unknown]>;
}

type MockState = {
  userId: string | null;

  // Insert path (createListing).
  insertError: { message: string } | null;
  insertedRow: Record<string, unknown> | null;

  // Ownership-probe path (updateListing / deleteListing — a select that ends in maybeSingle()).
  probeError: { message: string } | null;
  probeData: Record<string, unknown> | null;

  // Update path (updateListing / deleteListing — an update that ends with .eq() chains).
  updateError: { message: string } | null;
  updatedRow: Record<string, unknown> | null;

  // Capture of every from("listings") query built in a test run.
  queries: RecordedQuery[];
};

const mockState: MockState = {
  userId: "op-1",
  insertError: null,
  insertedRow: null,
  probeError: null,
  probeData: { id: "listing-1" },
  updateError: null,
  updatedRow: null,
  queries: [],
};

// Build a chainable query object that matches the Supabase JS surface we
// actually use in the action code: select/insert/update -> .eq() -> .eq()
// -> (.is())? -> (.single() | .maybeSingle() | resolve).
//
// `select()` is used two different ways in this module:
//   1. createListing -> insert(...).select("id").single()
//   2. updateListing / deleteListing ownership probe -> from(...).select("id", ...).eq(...).eq(...).is(...).maybeSingle()
//
// We therefore expose a single chain with all possible terminal methods.
function makeSelectChain(record: RecordedQuery) {
  const chain: {
    eq: (column: string, value: unknown) => typeof chain;
    is: (column: string, value: unknown) => typeof chain;
    maybeSingle: () => Promise<{
      data: Record<string, unknown> | null;
      error: { message: string } | null;
    }>;
    single: () => Promise<{
      data: Record<string, unknown> | null;
      error: { message: string } | null;
    }>;
  } = {
    eq(column, value) {
      record.eqs.push([column, value]);
      return chain;
    },
    is(column, value) {
      record.iss.push([column, value]);
      return chain;
    },
    async maybeSingle() {
      return {
        data: mockState.probeError ? null : mockState.probeData,
        error: mockState.probeError,
      };
    },
    async single() {
      return {
        data: mockState.insertError ? null : { id: "listing-1" },
        error: mockState.insertError,
      };
    },
  };
  return chain;
}

function makeUpdateChain(record: RecordedQuery) {
  // The update path resolves when the last .eq() is awaited directly.
  // We implement it as a thenable that stores any .eq() call.
  const resolution = {
    get data() {
      return null;
    },
    get error() {
      return mockState.updateError;
    },
  };
  const chain: {
    eq: (column: string, value: unknown) => typeof chain;
    then: <T>(
      onfulfilled: (v: { data: null; error: { message: string } | null }) => T,
    ) => Promise<T>;
  } = {
    eq(column, value) {
      record.eqs.push([column, value]);
      return chain;
    },
    then(onfulfilled) {
      return Promise.resolve(onfulfilled({ data: null, error: resolution.error }));
    },
  };
  return chain;
}

function makeInsertChain(record: RecordedQuery) {
  return {
    select(_columns: string) {
      void _columns;
      return makeSelectChain(record);
    },
  };
}

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
    from: vi.fn((_table: string) => {
      void _table;
      return ({
      insert(row: Record<string, unknown>) {
        mockState.insertedRow = row;
        const record: RecordedQuery = {
          kind: "insert",
          payload: row,
          eqs: [],
          iss: [],
        };
        mockState.queries.push(record);
        return makeInsertChain(record);
      },
      select(_columns: string) {
        void _columns;
        const record: RecordedQuery = { kind: "select", eqs: [], iss: [] };
        mockState.queries.push(record);
        return makeSelectChain(record);
      },
      update(patch: Record<string, unknown>) {
        mockState.updatedRow = patch;
        const record: RecordedQuery = {
          kind: "update",
          payload: patch,
          eqs: [],
          iss: [],
        };
        mockState.queries.push(record);
        return makeUpdateChain(record);
      },
      });
    }),
  })),
}));

import { createListing, updateListing, deleteListing } from "./listing-actions";

function buildFormData(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("name", "Honda EU2200i Generator");
  fd.set(
    "description",
    "A quiet, portable inverter generator perfect for camping or backup power.",
  );
  fd.set("dailyRateCents", "7500");
  fd.set("pickupLocation", "Salt Lake City, UT");
  fd.set("pickupInstructions", "");
  fd.set(
    "photos",
    JSON.stringify([
      { path: "op-1/draft-1/photo-1.jpg", isHero: true, position: 0 },
    ]),
  );
  for (const [k, v] of Object.entries(overrides)) {
    fd.set(k, v);
  }
  return fd;
}

function resetMockState() {
  mockState.userId = "op-1";
  mockState.insertError = null;
  mockState.insertedRow = null;
  mockState.probeError = null;
  mockState.probeData = { id: "listing-1" };
  mockState.updateError = null;
  mockState.updatedRow = null;
  mockState.queries = [];
}

describe("createListing", () => {
  beforeEach(() => {
    resetMockState();
  });

  it("returns ok({ listingId }) on a successful insert", async () => {
    const result = await createListing(buildFormData());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.listingId).toBe("listing-1");
    }
    expect(mockState.insertedRow).toMatchObject({
      operator_id: "op-1",
      daily_rate_cents: 7500,
      status: "published",
      pickup_instructions: null,
    });
  });

  it("returns UNAUTHENTICATED when there is no signed-in user", async () => {
    mockState.userId = null;
    const result = await createListing(buildFormData());
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("UNAUTHENTICATED");
    }
    expect(mockState.insertedRow).toBeNull();
  });

  it("returns DATABASE_ERROR when the insert fails at the DB layer", async () => {
    mockState.insertError = {
      message: "duplicate key value violates unique constraint",
    };
    const result = await createListing(buildFormData());
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("DATABASE_ERROR");
      expect(result.error.message).toContain("duplicate key");
    }
  });

  it("returns VALIDATION_ERROR when the name is too short", async () => {
    const result = await createListing(buildFormData({ name: "Hi" }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
      expect(result.error.message).toBe(
        "Equipment name must be at least 3 characters",
      );
    }
    expect(mockState.insertedRow).toBeNull();
  });
});

describe("updateListing", () => {
  beforeEach(() => {
    resetMockState();
  });

  it("returns ok({ listingId }) on a successful update and filters on both id and operator_id", async () => {
    const result = await updateListing("listing-1", buildFormData());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.listingId).toBe("listing-1");
    }

    // Ownership probe + update were both issued.
    const probe = mockState.queries.find((q) => q.kind === "select");
    const update = mockState.queries.find((q) => q.kind === "update");
    expect(probe).toBeDefined();
    expect(update).toBeDefined();

    // Probe filters on id AND operator_id AND deleted_at IS NULL.
    expect(probe!.eqs).toEqual([
      ["id", "listing-1"],
      ["operator_id", "op-1"],
    ]);
    expect(probe!.iss).toEqual([["deleted_at", null]]);

    // Update filters on id AND operator_id (no `.is()`).
    expect(update!.eqs).toEqual([
      ["id", "listing-1"],
      ["operator_id", "op-1"],
    ]);

    // Update payload excludes operator_id / status / deleted_at.
    expect(update!.payload).toMatchObject({
      name: "Honda EU2200i Generator",
      daily_rate_cents: 7500,
      pickup_instructions: null,
    });
    expect(update!.payload).not.toHaveProperty("operator_id");
    expect(update!.payload).not.toHaveProperty("status");
    expect(update!.payload).not.toHaveProperty("deleted_at");
  });

  it("returns UNAUTHENTICATED when there is no signed-in user", async () => {
    mockState.userId = null;
    const result = await updateListing("listing-1", buildFormData());
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("UNAUTHENTICATED");
    }
    // No queries should have been issued.
    expect(mockState.queries.length).toBe(0);
  });

  it("returns VALIDATION_ERROR when the name is too short", async () => {
    const result = await updateListing(
      "listing-1",
      buildFormData({ name: "Hi" }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
    }
    expect(mockState.queries.length).toBe(0);
  });

  it("returns NOT_FOUND when the ownership probe returns no row", async () => {
    mockState.probeData = null;
    const result = await updateListing("listing-1", buildFormData());
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("NOT_FOUND");
    }
    // No update should have been issued after a failed ownership probe.
    expect(mockState.queries.find((q) => q.kind === "update")).toBeUndefined();
  });

  it("returns DATABASE_ERROR when the ownership probe errors", async () => {
    mockState.probeError = { message: "probe exploded" };
    const result = await updateListing("listing-1", buildFormData());
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("DATABASE_ERROR");
      expect(result.error.message).toBe("probe exploded");
    }
  });

  it("returns DATABASE_ERROR when the update errors", async () => {
    mockState.updateError = { message: "constraint violation" };
    const result = await updateListing("listing-1", buildFormData());
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("DATABASE_ERROR");
      expect(result.error.message).toBe("constraint violation");
    }
  });
});

describe("deleteListing", () => {
  beforeEach(() => {
    resetMockState();
  });

  it("returns ok(null) on a successful soft delete and filters on both id and operator_id", async () => {
    const result = await deleteListing("listing-1");
    expect(result.success).toBe(true);

    const probe = mockState.queries.find((q) => q.kind === "select");
    const update = mockState.queries.find((q) => q.kind === "update");
    expect(probe).toBeDefined();
    expect(update).toBeDefined();

    // Ownership probe: id + operator_id only (no deleted_at filter — idempotent).
    expect(probe!.eqs).toEqual([
      ["id", "listing-1"],
      ["operator_id", "op-1"],
    ]);
    expect(probe!.iss).toEqual([]);

    // Update: id + operator_id.
    expect(update!.eqs).toEqual([
      ["id", "listing-1"],
      ["operator_id", "op-1"],
    ]);

    // Update payload is exactly { deleted_at: <iso string> }.
    expect(update!.payload).toBeDefined();
    expect(Object.keys(update!.payload as object)).toEqual(["deleted_at"]);
    const deletedAt = (update!.payload as { deleted_at: string }).deleted_at;
    expect(typeof deletedAt).toBe("string");
    expect(Number.isNaN(Date.parse(deletedAt))).toBe(false);
  });

  it("returns UNAUTHENTICATED when there is no signed-in user", async () => {
    mockState.userId = null;
    const result = await deleteListing("listing-1");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("UNAUTHENTICATED");
    }
    expect(mockState.queries.length).toBe(0);
  });

  it("returns NOT_FOUND when the ownership probe returns no row", async () => {
    mockState.probeData = null;
    const result = await deleteListing("listing-1");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("NOT_FOUND");
    }
    expect(mockState.queries.find((q) => q.kind === "update")).toBeUndefined();
  });

  it("returns DATABASE_ERROR when the ownership probe errors", async () => {
    mockState.probeError = { message: "probe exploded" };
    const result = await deleteListing("listing-1");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("DATABASE_ERROR");
    }
  });

  it("returns DATABASE_ERROR when the update errors", async () => {
    mockState.updateError = { message: "rls denied" };
    const result = await deleteListing("listing-1");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("DATABASE_ERROR");
      expect(result.error.message).toBe("rls denied");
    }
  });

  it("is idempotent when the row is already soft-deleted", async () => {
    mockState.probeData = {
      id: "listing-1",
      deleted_at: "2026-04-01T00:00:00.000Z",
    };
    const result = await deleteListing("listing-1");
    expect(result.success).toBe(true);
    // Still issues an update (fine — DB trigger is idempotent).
    expect(mockState.queries.find((q) => q.kind === "update")).toBeDefined();
  });
});
