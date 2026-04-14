"use client";

/**
 * CheckInFlow — client component for Story 4-4.
 *
 * Renders the condition selector (3 card-style radios), a conditional
 * comment/description textarea, and (for the damage path) a small
 * photo uploader that writes directly to the `check-in-photos` bucket.
 * On submit, calls the `submitCheckIn` Server Action with the chosen
 * condition + comments + object paths.
 *
 * Three taps for the happy path:
 *   1. "Confirm returned" checkbox
 *   2. "Good condition" radio card
 *   3. "Submit Check-In" button
 */

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import {
  submitCheckIn,
  type CheckInCondition,
} from "@/lib/actions/check-in-actions";

const CHECK_IN_PHOTOS_BUCKET = "check-in-photos";
const MAX_PHOTOS = 6;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

export interface CheckInFlowProps {
  bookingId: string;
  listingName: string;
  heroPhotoUrl: string | null;
  pickupLocation: string;
  startDate: string;
  endDate: string;
}

interface UploadedPhoto {
  path: string;
  previewUrl: string;
}

const CONDITION_OPTIONS: Array<{
  value: CheckInCondition;
  title: string;
  description: string;
}> = [
  {
    value: "good",
    title: "Good condition",
    description: "Everything is as it should be.",
  },
  {
    value: "damage",
    title: "Damage to report",
    description: "Something broke or was damaged.",
  },
  {
    value: "issue",
    title: "Operational issue",
    description: "The equipment didn't work correctly.",
  },
];

function formatDateReadable(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function CheckInFlow(props: CheckInFlowProps) {
  const [confirmReturned, setConfirmReturned] = useState(false);
  const [condition, setCondition] = useState<CheckInCondition | null>(null);
  const [comments, setComments] = useState("");
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const router = useRouter();

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const incoming = Array.from(files);
    if (photos.length + incoming.length > MAX_PHOTOS) {
      setError(`You can upload at most ${MAX_PHOTOS} photos`);
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const supabase = createClient();
      const next: UploadedPhoto[] = [];
      for (const file of incoming) {
        if (!ALLOWED_MIME.has(file.type)) {
          setError("Only JPG, PNG, or WebP images are allowed");
          continue;
        }
        if (file.size > MAX_FILE_BYTES) {
          setError("Photos must be 10MB or smaller");
          continue;
        }
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
        const rand =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        const objectPath = `${props.bookingId}/${rand}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from(CHECK_IN_PHOTOS_BUCKET)
          .upload(objectPath, file, { upsert: false });
        if (uploadError) {
          setError(uploadError.message);
          continue;
        }
        const { data } = supabase.storage
          .from(CHECK_IN_PHOTOS_BUCKET)
          .getPublicUrl(objectPath);
        next.push({ path: objectPath, previewUrl: data.publicUrl });
      }
      setPhotos((prev) => [...prev, ...next]);
    } finally {
      setUploading(false);
    }
  }

  function removePhoto(path: string) {
    setPhotos((prev) => prev.filter((p) => p.path !== path));
  }

  async function handleSubmit() {
    setError(null);
    if (!confirmReturned) {
      setError("Please confirm you returned the equipment.");
      return;
    }
    if (!condition) {
      setError("Please select a condition option.");
      return;
    }
    if (
      (condition === "damage" || condition === "issue") &&
      comments.trim().length < 4
    ) {
      setError("Please describe the issue before submitting.");
      return;
    }
    setSubmitting(true);
    const result = await submitCheckIn(props.bookingId, {
      condition,
      comments: comments.trim(),
      photoPaths: photos.map((p) => p.path),
    });
    setSubmitting(false);

    if (!result.success) {
      if (result.error.code === "SESSION_EXPIRED") {
        const returnTo = `/rentals/${props.bookingId}/check-in`;
        router.push(
          `/rentals/verify?returnTo=${encodeURIComponent(returnTo)}`,
        );
        return;
      }
      setError(result.error.message ?? "Could not submit your check-in.");
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div
        className="flex flex-col gap-space-4"
        data-testid="check-in-flow-done"
      >
        <div className="rounded-md border border-[hsl(var(--success))]/30 bg-[hsl(var(--success))]/10 p-space-4">
          <p
            className="text-base font-semibold text-[hsl(var(--success))]"
            data-testid="check-in-flow-success"
          >
            ✓ Check-in complete — thanks!
          </p>
          <p className="text-small text-neutral-900">
            We&rsquo;ve let the operator know the rental is back.
          </p>
        </div>
        <Button asChild>
          <Link href="/rentals" data-testid="check-in-back-to-rentals">
            Back to My Rentals
          </Link>
        </Button>
      </div>
    );
  }

  const showDescription = condition === "damage" || condition === "issue";
  const showPhotos = condition === "damage";

  return (
    <div
      className="flex flex-col gap-space-5"
      data-testid="check-in-flow"
    >
      <div className="flex items-center gap-space-3 rounded-md border border-border bg-neutral-100 p-space-3">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-muted">
          {props.heroPhotoUrl ? (
            <Image
              src={props.heroPhotoUrl}
              alt={props.listingName}
              fill
              sizes="64px"
              className="object-cover"
              unoptimized
            />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-small font-semibold text-neutral-900">
            {props.listingName}
          </p>
          <p className="text-xs text-neutral-700">
            {formatDateReadable(props.startDate)} &rarr;{" "}
            {formatDateReadable(props.endDate)}
          </p>
        </div>
      </div>

      <label className="flex items-start gap-space-2 text-small text-neutral-900">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4"
          checked={confirmReturned}
          onChange={(e) => setConfirmReturned(e.target.checked)}
          data-testid="check-in-confirm-returned"
        />
        <span>
          I confirm I returned this equipment to{" "}
          <strong>{props.pickupLocation}</strong>.
        </span>
      </label>

      <fieldset
        className="flex flex-col gap-space-2"
        data-testid="check-in-condition-group"
      >
        <legend className="text-small font-semibold text-neutral-900">
          How did the rental go?
        </legend>
        {CONDITION_OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className={cn(
              "flex cursor-pointer items-start gap-space-2 rounded-md border p-space-3 transition-colors",
              condition === opt.value
                ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10"
                : "border-border bg-card hover:bg-muted",
            )}
            data-testid={`check-in-condition-${opt.value}`}
          >
            <input
              type="radio"
              name="condition"
              value={opt.value}
              className="mt-1 h-4 w-4"
              checked={condition === opt.value}
              onChange={() => setCondition(opt.value)}
            />
            <span className="flex min-w-0 flex-col">
              <span className="text-small font-semibold text-neutral-900">
                {opt.title}
              </span>
              <span className="text-xs text-neutral-700">
                {opt.description}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      {showDescription ? (
        <label className="flex flex-col gap-space-1">
          <span className="text-small font-semibold text-neutral-900">
            {condition === "damage"
              ? "Describe the damage"
              : "Describe the issue"}
          </span>
          <textarea
            rows={4}
            className="rounded-md border border-neutral-300 p-space-2 text-small"
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            data-testid="check-in-description"
            placeholder={
              condition === "damage"
                ? "e.g. Cracked housing on the left side…"
                : "e.g. Motor wouldn't start after the second day…"
            }
          />
        </label>
      ) : condition === "good" ? (
        <label className="flex flex-col gap-space-1">
          <span className="text-small font-semibold text-neutral-900">
            Anything to add? (optional)
          </span>
          <textarea
            rows={3}
            className="rounded-md border border-neutral-300 p-space-2 text-small"
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            data-testid="check-in-optional-comment"
            placeholder="Share any feedback for the operator…"
          />
        </label>
      ) : null}

      {showPhotos ? (
        <div className="flex flex-col gap-space-2">
          <span className="text-small font-semibold text-neutral-900">
            Add photos (optional)
          </span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            disabled={uploading}
            onChange={(e) => handleFiles(e.target.files)}
            data-testid="check-in-photo-input"
            className="text-xs"
          />
          {uploading ? (
            <p className="text-xs text-neutral-700">Uploading…</p>
          ) : null}
          {photos.length > 0 ? (
            <ul className="grid grid-cols-3 gap-space-2">
              {photos.map((photo) => (
                <li
                  key={photo.path}
                  className="relative overflow-hidden rounded-md border border-border"
                  data-testid="check-in-photo-item"
                >
                  <Image
                    src={photo.previewUrl}
                    alt=""
                    width={120}
                    height={120}
                    className="h-20 w-full object-cover"
                    unoptimized
                  />
                  <button
                    type="button"
                    onClick={() => removePhoto(photo.path)}
                    className="absolute right-1 top-1 rounded-md bg-black/60 px-1.5 py-0.5 text-xs text-white"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="text-small text-destructive"
          data-testid="check-in-error"
        >
          {error}
        </p>
      ) : null}

      <Button
        type="button"
        disabled={submitting || uploading}
        onClick={handleSubmit}
        data-testid="check-in-submit-button"
      >
        {submitting ? "Submitting…" : "Submit Check-In"}
      </Button>

      <Link
        href="/rentals"
        className="text-small font-medium text-primary-dark underline"
        data-testid="check-in-back-link"
      >
        &larr; Back to My Rentals
      </Link>
    </div>
  );
}
