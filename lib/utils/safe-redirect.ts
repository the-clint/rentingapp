/**
 * Safe-redirect helpers (Story 3-6).
 *
 * When the renter's OTP session expires mid-flow we bounce them to
 * `/book/[id]/verify?returnTo=<current>` and, on successful re-verify,
 * push them back to the `returnTo` path. An open redirect here would
 * be a phishing vector — the user sees our domain, we send them
 * somewhere attacker-controlled. We lock the whitelist down tight:
 *
 *   - Must be a relative path (no scheme, no `//` authority).
 *   - Must start with `/book/{listingId}/`.
 *   - Must not contain `..` segments (path traversal).
 *   - Must not contain control characters or backslashes.
 *
 * The function returns `true` iff the path is safe to redirect to
 * under the given `listingId`. Anything else is rejected.
 */

const UUID_SHAPE = /^[0-9a-zA-Z_-]+$/;

export function isSafeRenterBookingPath(
  listingId: string,
  path: string | null | undefined,
): boolean {
  if (!listingId || !UUID_SHAPE.test(listingId)) return false;
  if (typeof path !== "string" || path.length === 0) return false;

  // Reject absolute URLs (scheme, protocol-relative, backslash tricks).
  if (path.includes("\\")) return false;
  if (/^[a-z][a-z0-9+\-.]*:/i.test(path)) return false;
  if (path.startsWith("//")) return false;

  // Reject control characters.
  for (let i = 0; i < path.length; i += 1) {
    const code = path.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return false;
  }

  if (!path.startsWith("/")) return false;

  // Split off query / hash for the prefix check.
  const pathnameEnd = path.search(/[?#]/);
  const pathname = pathnameEnd === -1 ? path : path.slice(0, pathnameEnd);

  const prefix = `/book/${listingId}/`;
  if (!pathname.startsWith(prefix) && pathname !== `/book/${listingId}`) {
    return false;
  }

  // No path traversal.
  const segments = pathname.split("/");
  if (segments.some((segment) => segment === "..")) return false;

  return true;
}

/**
 * Return the input path if it is safe under the given listingId,
 * otherwise `null`. Small convenience wrapper for page components.
 */
export function sanitizeRenterBookingReturnTo(
  listingId: string,
  path: string | null | undefined,
): string | null {
  return isSafeRenterBookingPath(listingId, path) ? (path as string) : null;
}
