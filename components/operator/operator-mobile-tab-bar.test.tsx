import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const pathnameRef = { current: "/listings" };
vi.mock("next/navigation", () => ({
  usePathname: () => pathnameRef.current,
}));

import { OperatorMobileTabBar } from "./operator-mobile-tab-bar";

describe("OperatorMobileTabBar", () => {
  beforeEach(() => {
    pathnameRef.current = "/listings";
  });

  it("renders a Primary mobile nav landmark", () => {
    render(<OperatorMobileTabBar />);
    expect(
      screen.getByRole("navigation", { name: "Primary mobile" }),
    ).toBeInTheDocument();
  });

  it("renders exactly 4 tabs: Listings, Bookings, Messages, More", () => {
    render(<OperatorMobileTabBar />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(4);
    expect(links.map((l) => l.getAttribute("aria-label"))).toEqual([
      "Listings",
      "Bookings",
      "Messages",
      "More",
    ]);
  });

  it("applies primary color classes to the active tab", () => {
    pathnameRef.current = "/messages";
    render(<OperatorMobileTabBar />);
    const messages = screen.getByRole("link", { name: "Messages" });
    expect(messages.className).toContain("text-primary");
    const bookings = screen.getByRole("link", { name: "Bookings" });
    expect(bookings.className).toContain("text-neutral-500");
  });

  it("sets aria-current=page on the active tab", () => {
    pathnameRef.current = "/more";
    render(<OperatorMobileTabBar />);
    const more = screen.getByRole("link", { name: "More" });
    expect(more).toHaveAttribute("aria-current", "page");
  });

  it("uses safe-area padding for the bottom inset", () => {
    render(<OperatorMobileTabBar />);
    const nav = screen.getByRole("navigation", { name: "Primary mobile" });
    expect(nav.className).toContain("pb-[env(safe-area-inset-bottom)]");
  });
});
