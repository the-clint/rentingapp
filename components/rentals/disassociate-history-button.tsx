"use client";

/**
 * Disassociate rental history (Story 7-1).
 *
 * Renders a small destructive-styled link at the bottom of the
 * renter dashboard. Opening the confirm dialog explains what will
 * happen and asks for explicit confirmation. On success, the page
 * refreshes so the list reflects the hidden state.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { disassociateRenterHistory } from "@/lib/actions/renter-privacy-actions";

export function DisassociateHistoryButton() {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);
    const result = await disassociateRenterHistory();
    setSubmitting(false);
    if (!result.success) {
      setError(result.error.message);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col items-center gap-space-2">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-small text-neutral-600 underline"
        data-testid="disassociate-trigger"
      >
        I don&rsquo;t recognize these rentals
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-space-4"
          data-testid="disassociate-dialog"
        >
          <div className="w-full max-w-md rounded-lg bg-white p-space-5 shadow-lg">
            <h3 className="text-h3 font-semibold text-neutral-900">
              Remove rental history from this dashboard?
            </h3>
            <p className="mt-space-2 text-small text-neutral-800">
              This will remove all current rental history from your
              dashboard. Any future bookings you make will appear
              normally. Your phone number stays linked to future
              rentals until you disassociate again.
            </p>
            {error ? (
              <p role="alert" className="mt-space-2 text-small text-destructive">
                {error}
              </p>
            ) : null}
            <div className="mt-space-4 flex justify-end gap-space-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleConfirm}
                disabled={submitting}
                data-testid="disassociate-confirm"
              >
                {submitting ? "Working…" : "Confirm Disassociation"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
