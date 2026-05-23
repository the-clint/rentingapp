"use client";

import { Check, Copy, ExternalLink, Megaphone, RotateCcw, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { BookingQrCode } from "@/components/booking/booking-qr-code";
import { Button } from "@/components/ui/button";
import { saveAdCopy } from "@/lib/actions/listing-actions";
import {
  generatePostingCopy,
  type ListingForTemplates,
} from "@/lib/utils/posting-templates";

type CopyTarget = "ad" | "link";
type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved" }
  | { status: "error"; message: string };

interface PostingAssistantDialogProps {
  listing: {
    name: string;
    description: string;
    daily_rate_cents: number;
    pickup_location: string;
  };
  bookingUrl: string;
  listingId: string;
  savedAdCopy?: string | null;
  initialOpen?: boolean;
}

export function PostingAssistantDialog({
  listing,
  bookingUrl,
  listingId,
  savedAdCopy = null,
  initialOpen = false,
}: PostingAssistantDialogProps) {
  const router = useRouter();
  const pathname = usePathname();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [copiedTarget, setCopiedTarget] = useState<CopyTarget | null>(null);
  const [erroredTarget, setErroredTarget] = useState<CopyTarget | null>(null);
  const [hasConsumedInitialOpen, setHasConsumedInitialOpen] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (initialOpen && !hasConsumedInitialOpen && dialogRef.current) {
      dialogRef.current.showModal();
      setHasConsumedInitialOpen(true);
    }
  }, [initialOpen, hasConsumedInitialOpen]);

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
    if (
      hasConsumedInitialOpen &&
      typeof window !== "undefined" &&
      window.location.search.includes("posted=1")
    ) {
      router.replace(pathname);
    }
  };

  const handleBackdropClick = (
    event: React.MouseEvent<HTMLDialogElement>,
  ) => {
    if (event.target === dialogRef.current) {
      closeDialog();
    }
  };

  async function handleCopy(key: CopyTarget, text: string) {
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

  const defaultAdCopy = generatePostingCopy(listingForTemplates, bookingUrl);
  const [adCopy, setAdCopy] = useState<string>(savedAdCopy ?? defaultAdCopy);
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });
  const [isSaving, startSaving] = useTransition();
  const savedSnapshotRef = useRef<string>(savedAdCopy ?? defaultAdCopy);
  const isDirty = adCopy !== savedSnapshotRef.current;

  // When the saved copy prop changes (e.g. after revalidatePath), resync
  // unless the operator has unsaved edits.
  useEffect(() => {
    const next = savedAdCopy ?? defaultAdCopy;
    if (!isDirty) {
      setAdCopy(next);
      savedSnapshotRef.current = next;
    }
  }, [savedAdCopy, defaultAdCopy, isDirty]);

  function handleSave() {
    setSaveState({ status: "saving" });
    startSaving(async () => {
      const result = await saveAdCopy(listingId, adCopy);
      if (result.success) {
        savedSnapshotRef.current = adCopy;
        setSaveState({ status: "saved" });
        setTimeout(() => {
          setSaveState((s) => (s.status === "saved" ? { status: "idle" } : s));
        }, 2000);
      } else {
        setSaveState({ status: "error", message: result.error.message });
      }
    });
  }

  function handleResetToDefault() {
    setAdCopy(defaultAdCopy);
    setSaveState({ status: "idle" });
  }

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
        className="max-w-4xl w-[min(94vw,56rem)] rounded-lg border border-border bg-card text-foreground p-space-8 shadow-lg backdrop:bg-black/50 m-auto"
      >
        <div className="flex flex-col gap-space-8">
          <header className="flex items-start justify-between gap-space-4">
            <div className="flex flex-col gap-space-1">
              <h2
                id="posting-assistant-dialog-title"
                className="text-h2 font-semibold"
              >
                Posting assistant
              </h2>
              <p className="text-sm text-neutral-700">
                Copy ad text to paste anywhere — KSL, Facebook Marketplace,
                Craigslist, and more. Share your booking link or print the QR
                code.
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
                  className="w-fit"
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

          <article className="flex flex-col gap-space-3 rounded-lg border border-border bg-card p-space-4">
            <h3 className="text-h3 font-semibold">Ad copy</h3>
            <div className="flex flex-wrap gap-space-2">
              <span className="text-sm text-neutral-500 self-center mr-space-1">
                Post on:
              </span>
              <Button asChild type="button" variant="outline" size="sm">
                <a
                  href="https://classifieds.ksl.com/post"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  KSL
                </a>
              </Button>
              <Button asChild type="button" variant="outline" size="sm">
                <a
                  href="https://www.facebook.com/marketplace/create/item"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  Facebook Marketplace
                </a>
              </Button>
              <Button asChild type="button" variant="outline" size="sm">
                <a
                  href="https://post.craigslist.org/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  Craigslist
                </a>
              </Button>
            </div>
            <textarea
              id="posting-assistant-ad-copy"
              value={adCopy}
              onChange={(e) => {
                setAdCopy(e.target.value);
                if (saveState.status !== "idle") {
                  setSaveState({ status: "idle" });
                }
              }}
              rows={12}
              aria-label="Ad copy"
              className="w-full resize-y rounded-md border border-border bg-muted p-space-2 font-mono text-sm"
            />
            <div className="flex flex-wrap items-center justify-end gap-space-2">
              {adCopy !== defaultAdCopy && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleResetToDefault}
                  className="mr-auto"
                >
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  Reset to default
                </Button>
              )}
              {saveState.status === "saved" && (
                <span
                  className="text-xs text-neutral-500"
                  aria-live="polite"
                >
                  Saved
                </span>
              )}
              {saveState.status === "error" && (
                <span
                  className="text-xs text-destructive"
                  role="alert"
                >
                  {saveState.message}
                </span>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() => handleCopy("ad", adCopy)}
              >
                {copiedTarget === "ad" ? (
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
              <Button
                type="button"
                onClick={handleSave}
                disabled={!isDirty || isSaving}
              >
                {isSaving ? "Saving…" : "Save"}
              </Button>
            </div>
            <span className="sr-only" aria-live="polite">
              {copiedTarget === "ad" ? "Copied ad copy" : ""}
            </span>
            {erroredTarget === "ad" && (
              <p className="text-xs text-destructive" role="alert">
                Copy failed — select the text and press Ctrl+C manually.
              </p>
            )}
          </article>
        </div>
      </dialog>
    </>
  );
}
