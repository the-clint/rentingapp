"use client";

/**
 * Resume banner (Story 3-6).
 *
 * Small inline "Welcome back — picking up where you left off." banner
 * shown when the booking-flow resume logic in the server pages has
 * short-circuited a renter forward to the contract or payment step.
 *
 * The server page passes the current pathname and the query string it
 * wants to keep (e.g., `start`, `end`, `bookingId`) — on dismiss we
 * `router.replace(cleanHref)` which strips the `resumed=1` flag so
 * a subsequent refresh won't re-show the banner.
 *
 * This component intentionally holds no state beyond "dismissed yes/no"
 * — the source of truth for "is the flow resumed" is the URL param,
 * not React state, so the back button + shareable URLs still work.
 */

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export interface ResumeBannerProps {
  /** Pathname (no query string) to replace to on dismiss. */
  pathname: string;
  /** Query string WITHOUT the `resumed=1` flag. Omit leading `?`. */
  preservedQuery?: string;
}

export function ResumeBanner({ pathname, preservedQuery }: ResumeBannerProps) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    const href = preservedQuery ? `${pathname}?${preservedQuery}` : pathname;
    router.replace(href);
  };

  return (
    <div
      role="status"
      data-testid="resume-banner"
      className="flex items-center justify-between gap-space-3 rounded-md border border-primary/30 bg-primary/5 px-space-3 py-space-2 text-small text-neutral-900"
    >
      <span>Welcome back — picking up where you left off.</span>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss"
        data-testid="resume-banner-dismiss"
        className="inline-flex h-6 w-6 items-center justify-center rounded-md text-neutral-700 hover:bg-primary/10"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
