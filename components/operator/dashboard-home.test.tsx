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

// Story 5-5: DashboardHome now renders stat cards + recent bookings on
// top of the listings-count gate. We mock the supabase server client
// at the call site and stub out the dashboard-stats + operator-bookings
// services so the empty-state branch still passes.
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
          is: vi.fn(async () => ({
            count: mockState.listingsCount,
            error: mockState.listingsError,
          })),
        })),
      })),
    })),
  })),
}));

vi.mock("@/lib/services/operator-dashboard-stats", () => ({
  fetchOperatorDashboardStats: vi.fn(async () => ({
    success: true,
    data: {
      activeRentalsCount: 2,
      upcomingBookingsCount: 1,
      utilizationPercent: 40,
      monthlyRevenueCents: 12345,
      unreadMessagesCount: 0,
      alerts: [],
    },
  })),
}));

vi.mock("@/lib/services/operator-bookings", () => ({
  fetchOperatorBookings: vi.fn(async () => ({
    success: true,
    data: [],
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
    const cta = screen.getByRole("link", { name: "Create Listing" });
    expect(cta).toHaveAttribute("href", "/listings/new");
  });

  it("renders stat cards when the operator has listings", async () => {
    mockState.listingsCount = 3;
    await renderAsync(DashboardHome());
    expect(screen.getByTestId("stat-active-rentals")).toHaveTextContent("2");
    expect(screen.getByTestId("stat-monthly-revenue")).toHaveTextContent(
      "$123.45",
    );
    expect(screen.getByTestId("stat-upcoming-bookings")).toHaveTextContent(
      "1",
    );
    expect(screen.getByTestId("stat-utilization")).toHaveTextContent("40%");
  });

  it("renders an all-clear card when there are no alerts", async () => {
    mockState.listingsCount = 1;
    await renderAsync(DashboardHome());
    expect(screen.getByTestId("dashboard-all-clear")).toBeInTheDocument();
  });
});
