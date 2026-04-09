import { describe, expect, it } from "vitest";

// Test the route classification logic from proxy.ts
// We extract and test the pure logic functions separately

const PUBLIC_ROUTES = ["/", "/auth", "/book"];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

function isOperatorRoute(pathname: string): boolean {
  const operatorPrefixes = [
    "/dashboard",
    "/listings",
    "/bookings",
    "/messages",
    "/settings",
  ];
  return operatorPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isAuthRoute(pathname: string): boolean {
  return pathname.startsWith("/auth");
}

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

describe("Middleware routing logic", () => {
  // Test the decision matrix without mocking Next.js/Supabase internals

  type RouteDecision = "allow" | "redirect-login" | "redirect-dashboard" | "redirect-home";

  function getRouteDecision(
    pathname: string,
    claims: { user_role?: string } | null,
  ): RouteDecision {
    // Public routes
    if (isPublicRoute(pathname)) {
      // Authenticated operators on auth pages → redirect to dashboard
      if (isAuthRoute(pathname) && claims?.user_role === "operator") {
        return "redirect-dashboard";
      }
      return "allow";
    }

    // Protected routes require authentication
    if (!claims) {
      return "redirect-login";
    }

    // Operator routes require operator role
    if (isOperatorRoute(pathname) && claims.user_role !== "operator") {
      return "redirect-home";
    }

    return "allow";
  }

  it("allows unauthenticated users on public routes", () => {
    expect(getRouteDecision("/", null)).toBe("allow");
    expect(getRouteDecision("/auth/login", null)).toBe("allow");
    expect(getRouteDecision("/book/listing-1", null)).toBe("allow");
  });

  it("redirects unauthenticated users to login for protected routes", () => {
    expect(getRouteDecision("/dashboard", null)).toBe("redirect-login");
    expect(getRouteDecision("/listings", null)).toBe("redirect-login");
    expect(getRouteDecision("/bookings", null)).toBe("redirect-login");
  });

  it("redirects authenticated operators away from auth pages", () => {
    const operatorClaims = { user_role: "operator" };
    expect(getRouteDecision("/auth/login", operatorClaims)).toBe(
      "redirect-dashboard",
    );
    expect(getRouteDecision("/auth/sign-up", operatorClaims)).toBe(
      "redirect-dashboard",
    );
  });

  it("allows operators to access operator routes", () => {
    const operatorClaims = { user_role: "operator" };
    expect(getRouteDecision("/dashboard", operatorClaims)).toBe("allow");
    expect(getRouteDecision("/listings", operatorClaims)).toBe("allow");
    expect(getRouteDecision("/bookings", operatorClaims)).toBe("allow");
  });

  it("redirects renter users from operator routes", () => {
    const renterClaims = { user_role: "renter" };
    expect(getRouteDecision("/dashboard", renterClaims)).toBe("redirect-home");
    expect(getRouteDecision("/listings", renterClaims)).toBe("redirect-home");
  });

  it("allows renter users on public routes", () => {
    const renterClaims = { user_role: "renter" };
    expect(getRouteDecision("/", renterClaims)).toBe("allow");
    expect(getRouteDecision("/book/listing-1", renterClaims)).toBe("allow");
  });
});
