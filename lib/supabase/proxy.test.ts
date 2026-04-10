import { describe, expect, it } from "vitest";

import {
  isAuthRoute,
  isOperatorRoute,
  isPublicRoute,
} from "./proxy";

describe("Route classification", () => {
  describe("isPublicRoute", () => {
    it("treats root as public", () => {
      expect(isPublicRoute("/")).toBe(true);
    });

    it("treats auth routes as public", () => {
      expect(isPublicRoute("/auth/login")).toBe(true);
      expect(isPublicRoute("/auth/sign-up")).toBe(true);
      expect(isPublicRoute("/auth/forgot-password")).toBe(true);
      expect(isPublicRoute("/auth/callback")).toBe(true);
    });

    it("treats booking routes as public", () => {
      expect(isPublicRoute("/book/some-listing-id")).toBe(true);
    });

    it("treats operator routes as non-public", () => {
      expect(isPublicRoute("/dashboard")).toBe(false);
      expect(isPublicRoute("/listings")).toBe(false);
      expect(isPublicRoute("/bookings")).toBe(false);
      expect(isPublicRoute("/messages")).toBe(false);
    });
  });

  describe("isOperatorRoute", () => {
    it("identifies dashboard as operator route", () => {
      expect(isOperatorRoute("/dashboard")).toBe(true);
    });

    it("identifies listings as operator route", () => {
      expect(isOperatorRoute("/listings")).toBe(true);
      expect(isOperatorRoute("/listings/new")).toBe(true);
      expect(isOperatorRoute("/listings/some-id")).toBe(true);
    });

    it("identifies bookings as operator route", () => {
      expect(isOperatorRoute("/bookings")).toBe(true);
      expect(isOperatorRoute("/bookings/some-id")).toBe(true);
    });

    it("identifies messages as operator route", () => {
      expect(isOperatorRoute("/messages")).toBe(true);
    });

    it("identifies settings as operator route", () => {
      expect(isOperatorRoute("/settings")).toBe(true);
    });

    it("identifies more as operator route", () => {
      expect(isOperatorRoute("/more")).toBe(true);
      expect(isOperatorRoute("/more/sub")).toBe(true);
    });

    it("does not match non-operator routes", () => {
      expect(isOperatorRoute("/")).toBe(false);
      expect(isOperatorRoute("/auth/login")).toBe(false);
      expect(isOperatorRoute("/book/some-id")).toBe(false);
      expect(isOperatorRoute("/manage-rental")).toBe(false);
    });
  });

  describe("isAuthRoute", () => {
    it("identifies auth routes", () => {
      expect(isAuthRoute("/auth/login")).toBe(true);
      expect(isAuthRoute("/auth/sign-up")).toBe(true);
      expect(isAuthRoute("/auth/callback")).toBe(true);
    });

    it("does not match non-auth routes", () => {
      expect(isAuthRoute("/dashboard")).toBe(false);
      expect(isAuthRoute("/")).toBe(false);
    });
  });
});

describe("Routing decision matrix", () => {
  // Mirrors the decision logic in updateSession() — kept here as a thin
  // composition over the (now exported, not duplicated) classification
  // helpers, so the actual rules in proxy.ts remain the source of truth.

  type RouteDecision =
    | "allow"
    | "redirect-login"
    | "redirect-dashboard"
    | "redirect-home";

  function decide(
    pathname: string,
    claims: { user_role?: string } | null,
  ): RouteDecision {
    if (isPublicRoute(pathname)) {
      if (
        isAuthRoute(pathname) &&
        claims?.user_role === "operator"
      ) {
        return "redirect-dashboard";
      }
      return "allow";
    }
    if (!claims) return "redirect-login";
    if (isOperatorRoute(pathname) && claims.user_role !== "operator") {
      return "redirect-home";
    }
    return "allow";
  }

  it("allows unauthenticated users on public routes", () => {
    expect(decide("/", null)).toBe("allow");
    expect(decide("/auth/login", null)).toBe("allow");
    expect(decide("/book/listing-1", null)).toBe("allow");
  });

  it("redirects unauthenticated users to login for protected routes", () => {
    expect(decide("/dashboard", null)).toBe("redirect-login");
    expect(decide("/listings", null)).toBe("redirect-login");
    expect(decide("/bookings", null)).toBe("redirect-login");
    expect(decide("/more", null)).toBe("redirect-login");
  });

  it("redirects authenticated operators away from auth pages", () => {
    const operator = { user_role: "operator" };
    expect(decide("/auth/login", operator)).toBe("redirect-dashboard");
    expect(decide("/auth/sign-up", operator)).toBe("redirect-dashboard");
  });

  it("allows operators to access operator routes", () => {
    const operator = { user_role: "operator" };
    expect(decide("/dashboard", operator)).toBe("allow");
    expect(decide("/listings", operator)).toBe("allow");
    expect(decide("/bookings", operator)).toBe("allow");
    expect(decide("/more", operator)).toBe("allow");
  });

  it("redirects renter users from operator routes", () => {
    const renter = { user_role: "renter" };
    expect(decide("/dashboard", renter)).toBe("redirect-home");
    expect(decide("/listings", renter)).toBe("redirect-home");
  });

  it("allows renter users on public routes", () => {
    const renter = { user_role: "renter" };
    expect(decide("/", renter)).toBe("allow");
    expect(decide("/book/listing-1", renter)).toBe("allow");
  });

  it("redirects users with no role claim from operator routes", () => {
    const noRole = {} as { user_role?: string };
    expect(decide("/dashboard", noRole)).toBe("redirect-home");
  });
});
