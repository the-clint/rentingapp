import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock next/navigation — pathname is configurable per test via the mock ref.
const pathnameRef = { current: "/dashboard" };
vi.mock("next/navigation", () => ({
  usePathname: () => pathnameRef.current,
}));

// Mock the signOut server action so the <form action={signOut}> renders.
vi.mock("@/lib/actions/auth-actions", () => ({
  signOut: vi.fn(),
}));

import { OperatorSidebar } from "./operator-sidebar";
import { NAV_ITEMS } from "./nav-items";

const noop = () => {};

function renderExpanded(
  overrides: Partial<React.ComponentProps<typeof OperatorSidebar>> = {},
) {
  return render(
    <OperatorSidebar
      userEmailSlot={<span>owner@example.com</span>}
      widthClass="w-[240px]"
      isCollapsed={false}
      showLabels={true}
      onToggle={noop}
      {...overrides}
    />,
  );
}

describe("OperatorSidebar", () => {
  beforeEach(() => {
    pathnameRef.current = "/dashboard";
  });

  it("renders a Primary nav landmark", () => {
    renderExpanded();
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(nav).toBeInTheDocument();
  });

  it("renders every NAV_ITEMS entry as a link", () => {
    renderExpanded();
    for (const item of NAV_ITEMS) {
      const link = screen.getByRole("link", { name: new RegExp(item.label) });
      expect(link).toHaveAttribute("href", item.href);
    }
  });

  it("marks the link matching usePathname with aria-current=page", () => {
    pathnameRef.current = "/listings";
    renderExpanded();
    const active = screen.getByRole("link", { name: /Listings/ });
    expect(active).toHaveAttribute("aria-current", "page");
    const inactive = screen.getByRole("link", { name: /Dashboard/ });
    expect(inactive).not.toHaveAttribute("aria-current");
  });

  it("applies active highlight styling to the active item", () => {
    pathnameRef.current = "/bookings";
    renderExpanded();
    const active = screen.getByRole("link", { name: /Bookings/ });
    expect(active.className).toContain("bg-primary-light");
    expect(active.className).toContain("border-primary");
  });

  it("matches nested routes to their parent section (startsWith)", () => {
    pathnameRef.current = "/listings/new";
    renderExpanded();
    const active = screen.getByRole("link", { name: /Listings/ });
    expect(active).toHaveAttribute("aria-current", "page");
  });

  it("does NOT match a sibling route that merely shares a prefix", () => {
    // Edge case: /listings should not be active when on /listingstwo.
    pathnameRef.current = "/listingstwo";
    renderExpanded();
    const listings = screen.getByRole("link", { name: /Listings/ });
    expect(listings).not.toHaveAttribute("aria-current");
  });

  it("renders the sign-out button inside a form", () => {
    renderExpanded();
    const signOutButton = screen.getByRole("button", { name: /Sign out/ });
    expect(signOutButton).toBeInTheDocument();
    expect(signOutButton.closest("form")).not.toBeNull();
  });

  it("renders a collapse toggle with an accessible label and aria-expanded", () => {
    renderExpanded();
    const toggle = screen.getByRole("button", { name: /Collapse sidebar/ });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("flips the toggle label and aria-expanded when collapsed", () => {
    renderExpanded({ isCollapsed: true, showLabels: false });
    const toggle = screen.getByRole("button", { name: /Expand sidebar/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("calls onToggle when the collapse button is clicked", () => {
    const onToggle = vi.fn();
    renderExpanded({ onToggle });
    const toggle = screen.getByRole("button", { name: /Collapse sidebar/ });
    toggle.click();
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("uses aria-label on icon-only nav items when collapsed", () => {
    renderExpanded({ isCollapsed: true, showLabels: false });
    const link = screen.getByRole("link", { name: "Dashboard" });
    expect(link).toHaveAttribute("aria-label", "Dashboard");
  });

  it("hides the user email slot when collapsed", () => {
    renderExpanded({
      isCollapsed: true,
      showLabels: false,
      userEmailSlot: <span data-testid="email">hidden@example.com</span>,
    });
    expect(screen.queryByTestId("email")).toBeNull();
  });
});
