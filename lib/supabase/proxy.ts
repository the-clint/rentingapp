import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasEnvVars } from "../utils";

function copyCookies(from: NextResponse, to: NextResponse): void {
  from.cookies.getAll().forEach(({ name, value, ...options }) => {
    to.cookies.set(name, value, options);
  });
}

const PUBLIC_ROUTES = ["/", "/auth", "/book"];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

function isOperatorRoute(pathname: string): boolean {
  // Next.js route groups like (operator) resolve to their child paths.
  // Operator routes: /dashboard, /listings, /bookings, /messages, /settings
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
      const role =
        (claims as Record<string, unknown>).user_role ??
        ((claims as Record<string, unknown>).app_metadata as Record<string, unknown> | undefined)?.role;
      if (role === "operator") {
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
    const role =
      (claims as Record<string, unknown>).user_role ??
      ((claims as Record<string, unknown>).app_metadata as Record<string, unknown> | undefined)?.role;
    if (role !== "operator") {
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
