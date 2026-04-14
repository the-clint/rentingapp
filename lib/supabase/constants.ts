/**
 * Shared Supabase auth cookie name.
 *
 * The Supabase JS client derives the cookie name from the URL hostname:
 *   `sb-${hostname.split(".")[0]}-auth-token`
 *
 * Because the browser client and server client use different URLs
 * (browser goes through Caddy at `everything.test/supabase`, server
 * goes direct to `127.0.0.1:54321`), they would generate different
 * cookie names. This constant ensures both sides use the same name.
 */
export const SUPABASE_COOKIE_NAME = "sb-everything-auth-token";
