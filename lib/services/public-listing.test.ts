import { beforeEach, describe, expect, it, vi } from "vitest";

// Chainable Supabase query builder mock. Each `.eq()`, `.is()`, `.select()`
// returns the same builder so we can spy on the call chain and then force a
// terminal result via `maybeSingle`.
const maybeSingleMock = vi.fn();
const eqMock = vi.fn();
const isMock = vi.fn();
const selectMock = vi.fn();
const fromMock = vi.fn();
const getPublicUrlMock = vi.fn();
const storageFromMock = vi.fn();

function buildChain() {
  const chain = {
    select: selectMock,
    eq: eqMock,
    is: isMock,
    maybeSingle: maybeSingleMock,
  };
  selectMock.mockReturnValue(chain);
  eqMock.mockReturnValue(chain);
  isMock.mockReturnValue(chain);
  return chain;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: fromMock,
    storage: { from: storageFromMock },
  }),
}));

import { fetchPublicListing } from "./public-listing";

describe("fetchPublicListing", () => {
  beforeEach(() => {
    maybeSingleMock.mockReset();
    eqMock.mockReset();
    isMock.mockReset();
    selectMock.mockReset();
    fromMock.mockReset();
    getPublicUrlMock.mockReset();
    storageFromMock.mockReset();

    const chain = buildChain();
    fromMock.mockReturnValue(chain);
    storageFromMock.mockReturnValue({ getPublicUrl: getPublicUrlMock });
    getPublicUrlMock.mockImplementation((path: string) => ({
      data: { publicUrl: `https://cdn.example/${path}` },
    }));
  });

  it("is a function (smoke import)", () => {
    expect(typeof fetchPublicListing).toBe("function");
  });

  it("returns ok with the listing on happy path and resolves photo URLs", async () => {
    maybeSingleMock.mockResolvedValue({
      data: {
        id: "listing-1",
        name: "Honda Generator",
        description: "Quiet inverter generator.",
        daily_rate_cents: 7500,
        address_city: "Salt Lake City",
        address_state: "UT",
        address_zip: "84101",
        photos: [
          { path: "op-1/listing-1/b.jpg", isHero: false, position: 1 },
          { path: "op-1/listing-1/a.jpg", isHero: true, position: 0 },
        ],
      },
      error: null,
    });

    const result = await fetchPublicListing("listing-1");

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).not.toBeNull();
    expect(result.data?.id).toBe("listing-1");
    expect(result.data?.name).toBe("Honda Generator");
    expect(result.data?.dailyRateCents).toBe(7500);
    expect(result.data?.publicLocation).toBe("Salt Lake City, UT 84101");
    // Sorted by position ascending so the hero (position 0) is first.
    expect(result.data?.photos[0].path).toBe("op-1/listing-1/a.jpg");
    expect(result.data?.photos[0].url).toBe(
      "https://cdn.example/op-1/listing-1/a.jpg",
    );
    expect(result.data?.photos[1].path).toBe("op-1/listing-1/b.jpg");
  });

  it("filters on status = 'published' (draft/archived excluded)", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    await fetchPublicListing("listing-1");
    expect(eqMock).toHaveBeenCalledWith("status", "published");
  });

  it("filters on deleted_at IS NULL (soft-deleted excluded)", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    await fetchPublicListing("listing-1");
    expect(isMock).toHaveBeenCalledWith("deleted_at", null);
  });

  it("returns ok(null) when no row is visible", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    const result = await fetchPublicListing("missing-id");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toBeNull();
  });

  it("returns err DATABASE_ERROR when the query fails", async () => {
    maybeSingleMock.mockResolvedValue({
      data: null,
      error: { message: "connection reset" },
    });
    const result = await fetchPublicListing("listing-1");
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("DATABASE_ERROR");
    expect(result.error.message).toBe("connection reset");
  });

  it("does NOT select pickup_instructions or full street address (anon has no column grant)", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    await fetchPublicListing("listing-1");
    const selectArg = selectMock.mock.calls[0]?.[0] as string | undefined;
    expect(selectArg).toBeDefined();
    expect(selectArg).not.toContain("pickup_instructions");
    expect(selectArg).not.toContain("address_street");
    expect(selectArg).not.toContain("pickup_location");
    expect(selectArg).toContain("address_city");
    expect(selectArg).toContain("address_state");
    expect(selectArg).toContain("address_zip");
  });

  it("handles a null photos array defensively", async () => {
    maybeSingleMock.mockResolvedValue({
      data: {
        id: "listing-1",
        name: "Honda Generator",
        description: "Quiet inverter generator.",
        daily_rate_cents: 7500,
        address_city: "Salt Lake City",
        address_state: "UT",
        address_zip: "84101",
        photos: null,
      },
      error: null,
    });
    const result = await fetchPublicListing("listing-1");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data?.photos).toEqual([]);
  });
});
