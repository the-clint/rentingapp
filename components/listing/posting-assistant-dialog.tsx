"use client";

import { Check, Copy, Megaphone, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { BookingQrCode } from "@/components/booking/booking-qr-code";
import { Button } from "@/components/ui/button";
import {
  generatePostingCopy,
  type ListingForTemplates,
  type PostingPlatform,
} from "@/lib/utils/posting-templates";

type CopyTarget = PostingPlatform | "link";

interface PostingAssistantDialogProps {
  listing: {
    name: string;
    description: string;
    daily_rate_cents: number;
    pickup_location: string;
  };
  bookingUrl: string;
  listingId: string;
  initialOpen?: boolean;
}

interface PlatformSection {
  platform: PostingPlatform;
  heading: string;
  copy: string;
}

/**
 * Native <dialog>-based posting assistant. Generates platform-tailored ad
 * copy for KSL, Facebook Marketplace, and Craigslist, and exposes the
 * renter booking link with a copy button. No new dependencies — everything
 * is built on `react`, `next`, `lucide-react`, and the pure template
 * generator in `lib/utils/posting-templates.ts`.
 *
 * Story 2.5.
 */
export function PostingAssistantDialog({
  listing,
  bookingUrl,
  listingId,
  initialOpen = false,
}: PostingAssistantDialogProps) {
  const router = useRouter();
  const pathname = usePathname();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [copiedTarget, setCopiedTarget] = useState<CopyTarget | null>(null);
  const [erroredTarget, setErroredTarget] = useState<CopyTarget | null>(null);
  const [hasConsumedInitialOpen, setHasConsumedInitialOpen] = useState(false);
  // Tracks the "Copied!" auto-revert timer so we can clear it on unmount,
  // on a subsequent copy, or on a failed copy. Without this, Strict Mode's
  // double-invoke schedules two overlapping timers and rapid Copy clicks
  // stack timers that silently fight over `copiedTarget`.
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-open exactly once when `initialOpen` is true (e.g. on
  // `?posted=1`). The `hasConsumedInitialOpen` guard prevents re-opens on
  // subsequent renders while the prop is still true.
  useEffect(() => {
    if (initialOpen && !hasConsumedInitialOpen && dialogRef.current) {
      dialogRef.current.showModal();
      setHasConsumedInitialOpen(true);
    }
  }, [initialOpen, hasConsumedInitialOpen]);

  // Cleanup: clear any pending "Copied!" revert timer when the dialog
  // component unmounts. This prevents a setState-on-unmounted warning in
  // edge cases where the parent unmounts mid-revert.
  useEffect(() => {
    return () => {
      if (copiedTimerRef.current !== null) {
        clearTimeout(copiedTimerRef.current);
        copiedTimerRef.current = null;
      }
    };
  }, []);

  const openDialog = () => {
    setCopiedTarget(null);
    setErroredTarget(null);
    dialogRef.current?.showModal();
  };

  const closeDialog = () => {
    dialogRef.current?.close();
  };

  const handleClose = () => {
    setCopiedTarget(null);
    setErroredTarget(null);
    // Scrub `?posted=1` from the URL so a later `router.refresh()` or a
    // parent re-render does not re-trigger the auto-open flag.
    if (
      hasConsumedInitialOpen &&
      typeof window !== "undefined" &&
      window.location.search.includes("posted=1")
    ) {
      router.replace(pathname);
    }
  };

  // Backdrop click: the native <dialog> reports the dialog element itself
  // as the click target when the user clicks outside the content box.
  const handleBackdropClick = (
    event: React.MouseEvent<HTMLDialogElement>,
  ) => {
    if (event.target === dialogRef.current) {
      closeDialog();
    }
  };

  async function handleCopy(key: CopyTarget, text: string) {
    // Cancel any in-flight revert timer before starting a new copy — an
    // operator rapidly clicking Copy on two cards should show the latest
    // "Copied!" marker without the previous timer clearing it prematurely.
    if (copiedTimerRef.current !== null) {
      clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = null;
    }
    try {
      await navigator.clipboard.writeText(text);
      setErroredTarget(null);
      setCopiedTarget(key);
      copiedTimerRef.current = setTimeout(() => {
        setCopiedTarget((current) => (current === key ? null : current));
        copiedTimerRef.current = null;
      }, 2000);
    } catch {
      setCopiedTarget(null);
      setErroredTarget(key);
    }
  }

  const listingForTemplates: ListingForTemplates = {
    name: listing.name,
    description: listing.description,
    dailyRateCents: listing.daily_rate_cents,
    pickupLocation: listing.pickup_location,
  };

  const sections: PlatformSection[] = [
    {
      platform: "ksl",
      heading: "KSL Classifieds",
      copy: generatePostingCopy(listingForTemplates, "ksl", bookingUrl),
    },
    {
      platform: "facebook",
      heading: "Facebook Marketplace",
      copy: generatePostingCopy(listingForTemplates, "facebook", bookingUrl),
    },
    {
      platform: "craigslist",
      heading: "Craigslist",
      copy: generatePostingCopy(listingForTemplates, "craigslist", bookingUrl),
    },
  ];

  return (
    <>
      <Button type="button" variant="outline" onClick={openDialog}>
        <Megaphone className="h-4 w-4" aria-hidden="true" />
        Posting assistant
      </Button>

      <dialog
        ref={dialogRef}
        onClick={handleBackdropClick}
        onClose={handleClose}
        aria-labelledby="posting-assistant-dialog-title"
        className="max-w-4xl w-[min(94vw,56rem)] rounded-lg border border-border bg-card text-foreground p-space-6 shadow-lg backdrop:bg-black/50"
      >
        <div className="flex flex-col gap-space-5">
          <header className="flex items-start justify-between gap-space-4">
            <div className="flex flex-col gap-space-1">
              <h2
                id="posting-assistant-dialog-title"
                className="text-h2 font-semibold"
              >
                Posting assistant
              </h2>
              <p className="text-sm text-neutral-700">
                Copy ad text for each classifieds platform, share your booking
                link, or print the QR code.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={closeDialog}
              aria-label="Close posting assistant"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </header>

          <section
            aria-labelledby="posting-assistant-booking-link-label"
            className="flex flex-col gap-space-3 rounded-lg border border-border bg-muted p-space-4 md:flex-row md:items-start md:gap-space-4"
          >
            <div className="flex flex-1 flex-col gap-space-3">
              <label
                id="posting-assistant-booking-link-label"
                className="text-sm font-medium text-neutral-500"
              >
                Booking link
              </label>
              <code className="block break-all rounded-md bg-neutral-100 px-space-3 py-space-2 text-sm">
                {bookingUrl}
              </code>
              <div className="flex flex-col gap-space-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleCopy("link", bookingUrl)}
                >
                  {copiedTarget === "link" ? (
                    <>
                      <Check className="h-4 w-4" aria-hidden="true" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" aria-hidden="true" />
                      Copy link
                    </>
                  )}
                </Button>
                <span className="sr-only" aria-live="polite">
                  {copiedTarget === "link" ? "Copied booking link" : ""}
                </span>
                {erroredTarget === "link" && (
                  <p className="text-xs text-destructive" role="alert">
                    Copy failed — select the text and press Ctrl+C manually.
                  </p>
                )}
              </div>
            </div>
            <BookingQrCode
              bookingUrl={bookingUrl}
              listingId={listingId}
              listingName={listing.name}
            />
          </section>

          <section className="grid gap-space-4 md:grid-cols-3">
            {sections.map((section) => (
              <PlatformCopyCard
                key={section.platform}
                platform={section.platform}
                heading={section.heading}
                copy={section.copy}
                copied={copiedTarget === section.platform}
                errored={erroredTarget === section.platform}
                onCopy={() => handleCopy(section.platform, section.copy)}
              />
            ))}
          </section>
        </div>
      </dialog>
    </>
  );
}

interface PlatformCopyCardProps {
  platform: PostingPlatform;
  heading: string;
  copy: string;
  copied: boolean;
  errored: boolean;
  onCopy: () => void;
}

function PlatformCopyCard({
  platform,
  heading,
  copy,
  copied,
  errored,
  onCopy,
}: PlatformCopyCardProps) {
  const textareaId = `posting-assistant-${platform}-copy`;
  return (
    <article className="flex flex-col gap-space-3 rounded-lg border border-border bg-card p-space-4">
      <h3 className="text-h3 font-semibold">{heading}</h3>
      <textarea
        id={textareaId}
        readOnly
        value={copy}
        rows={8}
        aria-label={`${heading} ad copy`}
        className="w-full resize-none rounded-md border border-border bg-muted p-space-2 font-mono text-sm"
      />
      <Button type="button" variant="outline" onClick={onCopy}>
        {copied ? (
          <>
            <Check className="h-4 w-4" aria-hidden="true" />
            Copied!
          </>
        ) : (
          <>
            <Copy className="h-4 w-4" aria-hidden="true" />
            Copy
          </>
        )}
      </Button>
      <span className="sr-only" aria-live="polite">
        {copied ? `Copied ${heading} ad copy` : ""}
      </span>
      {errored && (
        <p className="text-xs text-destructive" role="alert">
          Copy failed — select the text and press Ctrl+C manually.
        </p>
      )}
    </article>
  );
}
