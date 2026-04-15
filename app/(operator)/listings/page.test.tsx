import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { render, screen, within } from "@testing-library/react";

type ListingFixtureRow = {
  id: string;
  name: string;
  daily_rate_cents: number;
  pickup_location: string;
  photos: Array<{ path: string; isHero: boolean; position: number }>;
  created_at: string;
};

type MockState = {
  userId: string | null;
  listingsRows: ListingFixtureRow[] | null;
  listingsError: { code?: string; message?: string } | null;
};

const mockState: MockState = {
  userId: "user-123",
  listingsRows: [],
  listingsError: null,
};

const orderSpy = vi.fn();
const eqSpy = vi.fn();
const isSpy = vi.fn();
const selectSpy = vi.fn();

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

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
    from: vi.fn(() => {
      const order = vi.fn(async (column: string, opts: unknown) => {
        orderSpy(column, opts);
        return {
          data: mockState.listingsRows,
          error: mockState.listingsError,
        };
      });
      const is = vi.fn((column: string, value: unknown) => {
        isSpy(column, value);
        return { order };
      });
      const eq = vi.fn((column: string, value: unknown) => {
        eqSpy(column, value);
        return { is };
      });
      const select = vi.fn((columns: string) => {
        selectSpy(columns);
        return { eq };
      });
      return { select };
    }),
    storage: {
      from: vi.fn(() => ({
        getPublicUrl: vi.fn((path: string) => ({
          data: { publicUrl: `https://example.test/${path}` },
        })),
      })),
    },
  })),
}));

import { ListingsIndexBody } from "./page";

const NOW = new Date("2026-04-09T12:00:00.000Z");

function isoDaysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString();
}

function fixtureRow(
  id: string,
  name: string,
  daysAgo: number,
): ListingFixtureRow {
  return {
    id,
    name,
    daily_rate_cents: 5000,
    pickup_location: "SLC, UT",
    photos: [{ path: `${id}/hero.jpg`, isHero: true, position: 0 }],
    created_at: isoDaysAgo(daysAgo),
  };
}

async function renderAsync(element: React.ReactNode) {
  const resolved = await (element as unknown as Promise<React.ReactElement>);
  return render(resolved);
}

describe("ListingsIndexBody", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    mockState.userId = "user-123";
    mockState.listingsRows = [];
    mockState.listingsError = null;
    orderSpy.mockClear();
    eqSpy.mockClear();
    isSpy.mockClear();
    selectSpy.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the EmptyListingsCard when there are zero rows", async () => {
    mockState.listingsRows = [];
    await renderAsync(ListingsIndexBody());
    expect(
      screen.getByRole("heading", {
        name: /haven't created any listings yet/i,
      }),
    ).toBeInTheDocument();
    const ctas = screen.getAllByRole("link", { name: "New Listing" });
    expect(ctas).toHaveLength(2);
    for (const cta of ctas) {
      expect(cta).toHaveAttribute("href", "/listings/new");
    }
  });

  it("renders one ListingCard per row when rows are present", async () => {
    mockState.listingsRows = [
      fixtureRow("a", "Alpha Drill", 1),
      fixtureRow("b", "Bravo Saw", 2),
      fixtureRow("c", "Charlie Mower", 3),
    ];
    await renderAsync(ListingsIndexBody());
    const headings = screen.getAllByRole("heading", { level: 2 });
    expect(headings).toHaveLength(3);
    expect(headings[0]).toHaveTextContent("Alpha Drill");
    expect(headings[1]).toHaveTextContent("Bravo Saw");
    expect(headings[2]).toHaveTextContent("Charlie Mower");
  });

  it("renders the header 'New Listing' CTA even when listings exist", async () => {
    mockState.listingsRows = [fixtureRow("a", "Alpha Drill", 1)];
    await renderAsync(ListingsIndexBody());
    const headerCta = screen.getByRole("link", { name: "New Listing" });
    expect(headerCta).toHaveAttribute("href", "/listings/new");
  });

  it("applies both defense-in-depth filters: operator_id + deleted_at IS NULL", async () => {
    // Review finding M2: the soft-delete leak guarantee is the spec's
    // headline correctness concern. Assert that the query passes BOTH
    // filters so a regression (e.g. someone dropping the `.is("deleted_at", null)`
    // call) fails this test, not just end-to-end QA.
    mockState.listingsRows = [fixtureRow("a", "Alpha Drill", 1)];
    await renderAsync(ListingsIndexBody());
    expect(eqSpy).toHaveBeenCalledWith("operator_id", "user-123");
    expect(isSpy).toHaveBeenCalledWith("deleted_at", null);
  });

  it("falls back to photos[0] when no photo has isHero=true (L3)", async () => {
    // Defensive path in the index query: if the `photos` JSONB array
    // exists but no element has `isHero: true`, the resolver picks index
    // 0. Row previously only covered the happy path where [0] IS the hero.
    mockState.listingsRows = [
      {
        id: "no-hero",
        name: "No Hero Listing",
        daily_rate_cents: 2500,
        pickup_location: "Ogden, UT",
        photos: [
          { path: "no-hero/first.jpg", isHero: false, position: 0 },
          { path: "no-hero/second.jpg", isHero: false, position: 1 },
        ],
        created_at: isoDaysAgo(1),
      },
    ];
    await renderAsync(ListingsIndexBody());
    const img = screen.getByAltText("No Hero Listing") as HTMLImageElement;
    // photos[0] is `first.jpg` — resolver should pick it when no hero flag.
    expect(img.src).toBe("https://example.test/no-hero/first.jpg");
  });

  it("preserves the query's created_at DESC order in the DOM", async () => {
    mockState.listingsRows = [
      fixtureRow("new", "Newest", 1),
      fixtureRow("mid", "Middle", 5),
      fixtureRow("old", "Oldest", 20),
    ];
    await renderAsync(ListingsIndexBody());
    const headings = screen.getAllByRole("heading", { level: 2 });
    expect(headings.map((h) => h.textContent)).toEqual([
      "Newest",
      "Middle",
      "Oldest",
    ]);
    expect(orderSpy).toHaveBeenCalledWith("created_at", { ascending: false });
  });

  it("resolves the hero photo URL and renders it as the card image src", async () => {
    mockState.listingsRows = [fixtureRow("a", "Alpha Drill", 1)];
    await renderAsync(ListingsIndexBody());
    const img = screen.getByAltText("Alpha Drill") as HTMLImageElement;
    expect(img.src).toBe("https://example.test/a/hero.jpg");
    // The outer <a> wrapping the card should point at the detail page.
    const link = screen.getByRole("link", { name: /Alpha Drill/i });
    expect(link).toHaveAttribute("href", "/listings/a");
  });

  it("skips rows with empty photos arrays defensively", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockState.listingsRows = [
      {
        id: "no-photos",
        name: "Broken Row",
        daily_rate_cents: 1000,
        pickup_location: "Provo, UT",
        photos: [],
        created_at: isoDaysAgo(1),
      },
    ];
    await renderAsync(ListingsIndexBody());
    expect(
      screen.getByRole("heading", {
        name: /haven't created any listings yet/i,
      }),
    ).toBeInTheDocument();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("propagates a database error instead of silently falling back", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockState.listingsRows = null;
    mockState.listingsError = {
      code: "42501",
      message: "permission denied",
    };
    await expect(renderAsync(ListingsIndexBody())).rejects.toBeDefined();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("calls notFound when there is no authenticated user", async () => {
    mockState.userId = null;
    await expect(renderAsync(ListingsIndexBody())).rejects.toThrow(
      /NEXT_NOT_FOUND/,
    );
  });

  it("renders the page h1 'Listings'", async () => {
    mockState.listingsRows = [fixtureRow("a", "Alpha Drill", 1)];
    const { container } = await renderAsync(ListingsIndexBody());
    const h1 = within(container).getByRole("heading", { level: 1 });
    expect(h1).toHaveTextContent("Listings");
  });
});
