import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

type MockState = {
  userId: string | null;
  listingsCount: number | null;
  listingsError: { code?: string; message?: string } | null;
};

const mockState: MockState = {
  userId: "user-123",
  listingsCount: 0,
  listingsError: null,
};

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
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          // Story 2.4 review fix (L2): the count query now also filters
          // `.is("deleted_at", null)` to exclude soft-deleted rows. The
          // mock chain terminates on `.is()`, not on `.eq()`.
          is: vi.fn(async () => ({
            count: mockState.listingsCount,
            error: mockState.listingsError,
          })),
        })),
      })),
    })),
  })),
}));

import { DashboardHome } from "./dashboard-home";

async function renderAsync(element: React.ReactNode) {
  const resolved = await (element as unknown as Promise<React.ReactElement>);
  return render(resolved);
}

describe("DashboardHome", () => {
  beforeEach(() => {
    mockState.userId = "user-123";
    mockState.listingsCount = 0;
    mockState.listingsError = null;
  });

  it("renders the empty-state card when the user has zero listings", async () => {
    mockState.listingsCount = 0;
    await renderAsync(DashboardHome());
    expect(
      screen.getByRole("heading", {
        name: /haven't created any listings yet/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/List your first piece of equipment/i),
    ).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: "Create Listing" });
    expect(cta).toHaveAttribute("href", "/listings/new");
  });

  it("renders the listings count when the table exists and has rows", async () => {
    mockState.listingsCount = 3;
    mockState.listingsError = null;
    await renderAsync(DashboardHome());
    expect(screen.getByText(/You have/)).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("uses the singular noun when there is exactly one listing", async () => {
    mockState.listingsCount = 1;
    await renderAsync(DashboardHome());
    expect(screen.getByText(/listing\./)).toBeInTheDocument();
  });

  it("propagates a database error instead of silently falling back", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockState.listingsCount = null;
    mockState.listingsError = {
      code: "42501",
      message: "permission denied",
    };
    await expect(renderAsync(DashboardHome())).rejects.toBeDefined();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
