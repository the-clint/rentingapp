import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasEnvVars } from "../utils";

function copyCookies(from: NextResponse, to: NextResponse): void {
  from.cookies.getAll().forEach(({ name, value, ...options }) => {
    to.cookies.set(name, value, options);
  });
}

export const PUBLIC_ROUTES = ["/", "/auth", "/book"] as const;

// Operator routes (Next.js route groups like (operator) resolve to their child paths).
export const OPERATOR_PREFIXES = [
  "/dashboard",
  "/listings",
  "/bookings",
  "/messages",
  "/settings",
  "/more",
] as const;

export function isPublicRoute(pathname: string): boolean {
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
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!,
    {
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

  // IMPORTANT: You *must* return the supabaseResponse object as it is.
  return supabaseResponse;
}
