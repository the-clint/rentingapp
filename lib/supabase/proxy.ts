import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasEnvVars } from "../utils";
import { SUPABASE_COOKIE_NAME } from "./constants";

function copyCookies(from: NextResponse, to: NextResponse): void {
  from.cookies.getAll().forEach(({ name, value, ...options }) => {
    to.cookies.set(name, value, options);
  });
}

export const PUBLIC_ROUTES = ["/", "/auth", "/book", "/rentals/verify"] as const;

// Operator routes (Next.js route groups like (operator) resolve to their child paths).
export const OPERATOR_PREFIXES = [
  "/dashboard",
  "/listings",
  "/bookings",
  "/messages",
  "/settings",
  "/more",
] as const;

/**
 * Renter-only protected steps inside the booking flow (Story 3-3).
 *
 * The listing page (`/book/[id]`) and verify page (`/book/[id]/verify`) are
 * public — anyone with a classifieds link can reach them. Everything after
 * phone-OTP verification requires a renter session:
 *   - `/book/[id]/contract`  (Story 3-4)
 *   - `/book/[id]/payment`   (Story 3-5)
 *   - `/book/[id]/confirmed` (Story 3-5)
 *
 * We match by suffix because the listingId in the middle is dynamic.
 */
export const RENTER_BOOKING_SUFFIXES = [
  "/contract",
  "/payment",
  "/confirmed",
] as const;

export function isRenterProtectedBookingRoute(pathname: string): boolean {
  if (!pathname.startsWith("/book/")) return false;
  return RENTER_BOOKING_SUFFIXES.some(
    (suffix) =>
      pathname.endsWith(suffix) || pathname.includes(`${suffix}/`),
  );
}

/**
 * Manage-my-rental dashboard (Story 4-1). `/rentals` and everything
 * under it require a renter session — EXCEPT `/rentals/verify`, which
 * is the OTP entry point and is listed in `PUBLIC_ROUTES` above.
 */
export function isRenterDashboardRoute(pathname: string): boolean {
  if (pathname === "/rentals/verify") return false;
  if (pathname.startsWith("/rentals/verify/")) return false;
  return pathname === "/rentals" || pathname.startsWith("/rentals/");
}

export function isPublicRoute(pathname: string): boolean {
  // Renter-protected booking sub-paths are NOT public even though `/book` is
  // in the public allowlist. Check the exclusion first.
  if (isRenterProtectedBookingRoute(pathname)) return false;
  // Similarly, `/rentals` and its sub-paths are renter-gated even though
  // `/rentals/verify` is public (Story 4-1).
  if (isRenterDashboardRoute(pathname)) return false;
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

export function isOperatorRoute(pathname: string): boolean {
  return OPERATOR_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function isAuthRoute(pathname: string): boolean {
  return pathname.startsWith("/auth");
}

interface JwtClaims {
  user_role?: string;
}

function getUserRole(claims: unknown): string | undefined {
  if (!claims || typeof claims !== "object") return undefined;
  const role = (claims as JwtClaims).user_role;
  return typeof role === "string" ? role : undefined;
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  // If the env vars are not set, skip proxy check.
  if (!hasEnvVars) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!,
    {
      cookieOptions: { name: SUPABASE_COOKIE_NAME },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and
  // supabase.auth.getClaims(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const pathname = request.nextUrl.pathname;

  // Public routes: always accessible
  if (isPublicRoute(pathname)) {
    // Authenticated operators on auth pages → redirect to dashboard
    if (isAuthRoute(pathname) && claims) {
      if (getUserRole(claims) === "operator") {
        const url = request.nextUrl.clone();
        url.pathname = "/dashboard";
        const redirectResponse = NextResponse.redirect(url);
        copyCookies(supabaseResponse, redirectResponse);
        return redirectResponse;
      }
    }
    return supabaseResponse;
  }

  // Protected routes: require authentication
  if (!claims) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    const redirectResponse = NextResponse.redirect(url);
    copyCookies(supabaseResponse, redirectResponse);
    return redirectResponse;
  }

  // Role-based protection for operator routes
  if (isOperatorRoute(pathname)) {
    if (getUserRole(claims) !== "operator") {
      // Non-operator users cannot access operator routes
      const url = request.nextUrl.clone();
      url.pathname = "/";
      const redirectResponse = NextResponse.redirect(url);
      copyCookies(supabaseResponse, redirectResponse);
      return redirectResponse;
    }
  }

  // Role-based protection for renter booking steps (contract / payment /
  // confirmed). A valid Supabase session isn't enough — the JWT must carry
  // `user_role = 'renter'` (set by the custom access token hook in migration
  // 00006 for phone-only auth.users rows).
  if (isRenterProtectedBookingRoute(pathname)) {
    if (getUserRole(claims) !== "renter") {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      const redirectResponse = NextResponse.redirect(url);
      copyCookies(supabaseResponse, redirectResponse);
      return redirectResponse;
    }
  }

  // Story 4-1: manage-my-rental dashboard (`/rentals` + sub-paths other
  // than `/rentals/verify`) is renter-only. Unauthenticated callers are
  // caught by the `!claims` branch above and redirected to `/auth/login`;
  // authenticated non-renters are bounced home.
  if (isRenterDashboardRoute(pathname)) {
    if (getUserRole(claims) !== "renter") {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      const redirectResponse = NextResponse.redirect(url);
      copyCookies(supabaseResponse, redirectResponse);
      return redirectResponse;
    }
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is.
  return supabaseResponse;
}
