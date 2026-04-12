import { beforeEach, describe, expect, it, vi } from "vitest";

// Chainable Supabase query builder mock. The query used by
// `fetchRenterRentals` is:
//   from().select().eq().is().neq().gte()
// where the final `.gte()` resolves the rows. (Story 7-1 added the
// `.is("renter_dashboard_hidden_at", null)` filter between `.eq`
// and `.neq`.) We mock each step to return the same chain.
const gteMock = vi.fn();
const isMock = vi.fn();
const neqMock = vi.fn();
const eqMock = vi.fn();
const selectMock = vi.fn();
const fromMock = vi.fn();
const getPublicUrlMock = vi.fn();
const storageFromMock = vi.fn();

function buildChain() {
  const chain = {
    select: selectMock,
    eq: eqMock,
    is: isMock,
    neq: neqMock,
    gte: gteMock,
  };
  selectMock.mockReturnValue(chain);
  eqMock.mockReturnValue(chain);
  isMock.mockReturnValue(chain);
  neqMock.mockReturnValue(chain);
  return chain;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: fromMock,
    storage: { from: storageFromMock },
  }),
}));

import { fetchRenterRentals } from "./renter-rentals";

const RENTER_ID = "renter-abc";
const OTHER_RENTER = "renter-xyz";

const TODAY = new Date(Date.UTC(2026, 3, 10)); // 2026-04-10

function row(
  id: string,
  overrides: {
    status?: "pending" | "confirmed" | "cancelled" | "completed" | "no_show";
    startDate?: string;
    endDate?: string;
    renterId?: string;
    photos?: Array<{ path: string; isHero: boolean; position: number }> | null;
  } = {},
) {
  return {
    id,
    listing_id: `listing-${id}`,
    renter_id: overrides.renterId ?? RENTER_ID,
    status: overrides.status ?? "confirmed",
    start_date: overrides.startDate ?? "2026-04-10",
    end_date: overrides.endDate ?? "2026-04-12",
    total_cents: 50000,
    listings: {
      id: `listing-${id}`,
      name: `Equipment ${id}`,
      pickup_location: "Salt Lake City, UT",
      photos: overrides.photos ?? [
        { path: `op/listing-${id}/hero.jpg`, isHero: true, position: 0 },
      ],
    },
  };
}

describe("fetchRenterRentals", () => {
  beforeEach(() => {
    gteMock.mockReset();
    neqMock.mockReset();
    eqMock.mockReset();
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

  it("filters by renter_id and excludes pending bookings", async () => {
    gteMock.mockResolvedValue({ data: [], error: null });
    await fetchRenterRentals({ renterId: RENTER_ID, today: TODAY });

    expect(fromMock).toHaveBeenCalledWith("bookings");
    expect(eqMock).toHaveBeenCalledWith("renter_id", RENTER_ID);
    expect(neqMock).toHaveBeenCalledWith("status", "pending");
  });

  it("applies a 45-day end_date cutoff at the SQL layer", async () => {
    gteMock.mockResolvedValue({ data: [], error: null });
    await fetchRenterRentals({ renterId: RENTER_ID, today: TODAY });
    // 2026-04-10 minus 45 days = 2026-02-24
    expect(gteMock).toHaveBeenCalledWith("end_date", "2026-02-24");
  });

  it("returns DATABASE_ERROR when the query fails", async () => {
    gteMock.mockResolvedValue({
      data: null,
      error: { message: "connection reset" },
    });
    const result = await fetchRenterRentals({
      renterId: RENTER_ID,
      today: TODAY,
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("DATABASE_ERROR");
    expect(result.error.message).toBe("connection reset");
  });

  it("defense-in-depth: drops rows whose renter_id does not match", async () => {
    gteMock.mockResolvedValue({
      data: [
        row("mine"),
        row("stranger", { renterId: OTHER_RENTER }),
      ],
      error: null,
    });
    const result = await fetchRenterRentals({
      renterId: RENTER_ID,
      today: TODAY,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.bookingId).toBe("mine");
  });

  it("drops rows beyond the lifecycle helper's 45-day history window", async () => {
    gteMock.mockResolvedValue({
      data: [
        row("old", {
          status: "completed",
          startDate: "2025-01-01",
          endDate: "2025-01-03",
        }),
        row("kept"),
      ],
      error: null,
    });
    const result = await fetchRenterRentals({
      renterId: RENTER_ID,
      today: TODAY,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.map((c) => c.bookingId)).toEqual(["kept"]);
  });

  it("resolves a hero photo URL via the listing-photos bucket", async () => {
    gteMock.mockResolvedValue({
      data: [
        row("with-photo", {
          photos: [
            { path: "op/listing/b.jpg", isHero: false, position: 1 },
            { path: "op/listing/a.jpg", isHero: true, position: 0 },
          ],
        }),
      ],
      error: null,
    });
    const result = await fetchRenterRentals({
      renterId: RENTER_ID,
      today: TODAY,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(storageFromMock).toHaveBeenCalledWith("listing-photos");
    expect(result.data[0]?.heroPhoto?.path).toBe("op/listing/a.jpg");
    expect(result.data[0]?.heroPhoto?.url).toBe(
      "https://cdn.example/op/listing/a.jpg",
    );
  });

  it("returns null heroPhoto when the listing has no photos", async () => {
    gteMock.mockResolvedValue({
      data: [row("no-photos", { photos: [] })],
      error: null,
    });
    const result = await fetchRenterRentals({
      renterId: RENTER_ID,
      today: TODAY,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data[0]?.heroPhoto).toBeNull();
  });

  it("sorts active/return_due first, then upcoming asc, then completed desc, then cancelled last", async () => {
    gteMock.mockResolvedValue({
      data: [
        // upcoming B (later)
        row("upcoming-b", {
          startDate: "2026-05-10",
          endDate: "2026-05-12",
        }),
        // cancelled
        row("cancelled", {
          status: "cancelled",
          startDate: "2026-04-20",
          endDate: "2026-04-22",
        }),
        // completed recent
        row("completed-recent", {
          status: "completed",
          startDate: "2026-03-20",
          endDate: "2026-03-25",
        }),
        // active (today is 2026-04-10, in range)
        row("active", {
          startDate: "2026-04-09",
          endDate: "2026-04-11",
        }),
        // upcoming A (sooner)
        row("upcoming-a", {
          startDate: "2026-04-20",
          endDate: "2026-04-22",
        }),
        // completed older
        row("completed-older", {
          status: "completed",
          startDate: "2026-03-01",
          endDate: "2026-03-05",
        }),
        // return_due (ended 2 days ago, still confirmed)
        row("return-due", {
          startDate: "2026-04-05",
          endDate: "2026-04-08",
        }),
      ],
      error: null,
    });
    const result = await fetchRenterRentals({
      renterId: RENTER_ID,
      today: TODAY,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.map((c) => c.bookingId)).toEqual([
      // active + return_due first; within that bucket sorted by end_date asc
      "return-due", // end 2026-04-08
      "active", // end 2026-04-11
      // then upcoming ascending by start
      "upcoming-a", // start 2026-04-20
      "upcoming-b", // start 2026-05-10
      // then completed descending by end
      "completed-recent", // end 2026-03-25
      "completed-older", // end 2026-03-05
      // cancelled last
      "cancelled",
    ]);
  });
});
