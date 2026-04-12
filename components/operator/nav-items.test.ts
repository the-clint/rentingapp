import { describe, expect, it } from "vitest";
import { MOBILE_TAB_ITEMS, NAV_ITEMS } from "./nav-items";

describe("NAV_ITEMS", () => {
  it("contains exactly 5 items in the specified order", () => {
    expect(NAV_ITEMS).toHaveLength(5);
    expect(NAV_ITEMS.map((item) => item.label)).toEqual([
      "Dashboard",
      "Listings",
      "Bookings",
      "Messages",
      "Settings",
    ]);
  });

  it("maps each label to the correct href", () => {
    const byLabel = Object.fromEntries(
      NAV_ITEMS.map((item) => [item.label, item.href]),
    );
    expect(byLabel).toEqual({
      Dashboard: "/dashboard",
      Listings: "/listings",
      Bookings: "/bookings",
      Messages: "/messages",
      Settings: "/settings",
    });
  });

  it("gives every nav item an icon component", () => {
    for (const item of NAV_ITEMS) {
      expect(item.icon).toBeDefined();
      expect(typeof item.icon).toBe("object");
    }
  });
});

describe("MOBILE_TAB_ITEMS", () => {
  it("contains exactly 4 items (Listings, Bookings, Messages, More)", () => {
    expect(MOBILE_TAB_ITEMS).toHaveLength(4);
    expect(MOBILE_TAB_ITEMS.map((item) => item.label)).toEqual([
      "Listings",
      "Bookings",
      "Messages",
      "More",
    ]);
  });

  it("maps More to /more", () => {
    const more = MOBILE_TAB_ITEMS.find((item) => item.label === "More");
    expect(more?.href).toBe("/more");
  });

  it("does NOT include a Dashboard entry (per UX spec)", () => {
    expect(
      MOBILE_TAB_ITEMS.find((item) => item.label === "Dashboard"),
    ).toBeUndefined();
  });
});
