"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { deleteListing } from "@/lib/actions/listing-actions";

interface DeleteListingDialogProps {
  listingId: string;
  listingName: string;
}

/**
 * Destructive confirmation for soft-deleting a listing. Uses the native
 * HTML `<dialog>` element (no `@radix-ui/react-dialog` dependency) because
 * the native element already provides focus trap, ESC dismiss, and backdrop
 * click in all modern browsers. Per Story 2.3 anti-patterns: do NOT add a
 * modal library for a single confirmation dialog.
 */
export function DeleteListingDialog({
  listingId,
  listingName,
}: DeleteListingDialogProps) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const openDialog = () => {
    setErrorMessage(null);
    dialogRef.current?.showModal();
  };

  const closeDialog = () => {
    dialogRef.current?.close();
  };

  // Backdrop click: when a native <dialog> is clicked on its backdrop,
  // the click's target is the dialog element itself (its internal content
  // sits in a box inside it). Intercept and close.
  const handleDialogClick = (event: React.MouseEvent<HTMLDialogElement>) => {
    if (event.target === dialogRef.current) {
      closeDialog();
    }
  };

  const handleDelete = () => {
    if (isPending) return;
    startTransition(async () => {
      const result = await deleteListing(listingId);
      if (!result.success) {
        setErrorMessage(result.error.message);
        return;
      }
      dialogRef.current?.close();
      router.push("/listings");
      router.refresh();
    });
  };

  return (
    <>
      <Button
        type="button"
        variant="destructive"
        onClick={openDialog}
        aria-label={`Delete ${listingName}`}
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
        Delete
      </Button>

      <dialog
        ref={dialogRef}
        onClick={handleDialogClick}
        onClose={() => setErrorMessage(null)}
        aria-labelledby="delete-listing-dialog-title"
        className="rounded-lg border border-neutral-200 p-space-6 shadow-lg backdrop:bg-black/50 max-w-md w-[min(90vw,28rem)]"
      >
        <div className="flex flex-col gap-space-4">
          <h2
            id="delete-listing-dialog-title"
            className="text-h2 font-semibold"
          >
            Delete listing
          </h2>
          <p className="text-body text-neutral-700">
            Are you sure you want to delete <strong>{listingName}</strong>?
            This cannot be undone from the UI.
          </p>

          {errorMessage && (
            <p role="alert" className="text-sm text-destructive">
              {errorMessage}
            </p>
          )}

          <div className="flex justify-end gap-space-2">
            <Button
              type="button"
              variant="outline"
              onClick={closeDialog}
              autoFocus
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={isPending}
            >
              {isPending ? "Deleting…" : "Delete"}
            </Button>
          </div>
        </div>
      </dialog>
    </>
  );
}
