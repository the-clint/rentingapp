"use client";

import { Star, Trash2, Upload, X, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import {
  LISTING_PHOTOS_BUCKET,
  getListingPhotoUploadPath,
} from "@/lib/services/storage-paths";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface PhotoDraft {
  path: string;
  isHero: boolean;
  position: number;
  previewUrl?: string;
  fileName?: string;
}

interface PhotoUploaderProps {
  operatorId: string;
  draftId: string;
  photos: PhotoDraft[];
  onChange: (photos: PhotoDraft[]) => void;
  maxPhotos?: number;
}

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

/** Try to decode the file as an image. Returns an error message or null. */
function validateImageContent(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      if (img.naturalWidth === 0 || img.naturalHeight === 0) {
        resolve(`${file.name}: image has no dimensions — the file may be corrupt`);
      } else {
        resolve(null);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(
        `${file.name}: file could not be read as an image — it may be corrupt or not a real image`,
      );
    };
    img.src = url;
  });
}

// TODO(a11y): keyboard drag-and-drop reordering is intentionally NOT
// implemented for Story 2.1 (see story spec, Task 6.4). A future
// accessibility story will add keyboard reorder controls.

function normalizePositions(photos: PhotoDraft[]): PhotoDraft[] {
  return photos.map((p, i) => ({ ...p, position: i }));
}

export function PhotoUploader({
  operatorId,
  draftId,
  photos,
  onChange,
  maxPhotos = 10,
}: PhotoUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const dragFromIdx = useRef<number | null>(null);

  // Mirror the latest `photos` prop in a ref so the async upload loop can
  // always reconcile against the parent's CURRENT state. Without this,
  // an upload that resolves after the user has removed a different photo
  // would resurrect the removed photo from a stale closure.
  const photosRef = useRef(photos);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  const addError = (msg: string) =>
    setErrors((prev) => [...prev, msg]);

  const dismissError = (idx: number) =>
    setErrors((prev) => prev.filter((_, i) => i !== idx));

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const incoming = Array.from(files);

      if (photosRef.current.length + incoming.length > maxPhotos) {
        addError(`You can upload at most ${maxPhotos} photos`);
        return;
      }

      const valid: File[] = [];
      for (const file of incoming) {
        if (!ALLOWED_MIME.has(file.type)) {
          addError("Only JPEG, PNG, or WebP images are allowed");
          continue;
        }
        if (file.size > MAX_FILE_BYTES) {
          addError(`${file.name} is too large (max 10 MB)`);
          continue;
        }
        valid.push(file);
      }

      if (valid.length === 0) return;

      // Validate that files are actual decodable images (catches corrupt files,
      // renamed non-images, etc.) before spending time on the upload.
      const decoded: File[] = [];
      for (const file of valid) {
        const err = await validateImageContent(file);
        if (err) {
          addError(err);
        } else {
          decoded.push(file);
        }
      }
      if (decoded.length === 0) return;

      const supabase = createClient();

      setUploadingCount((c) => c + decoded.length);

      for (const file of decoded) {
        const path = getListingPhotoUploadPath(operatorId, draftId, file.name);
        const { error } = await supabase.storage
          .from(LISTING_PHOTOS_BUCKET)
          .upload(path, file, { upsert: false });

        if (error) {
          addError(`${file.name}: ${error.message}`);
          setUploadingCount((c) => Math.max(0, c - 1));
          continue;
        }

        const publicUrl = supabase.storage
          .from(LISTING_PHOTOS_BUCKET)
          .getPublicUrl(path).data.publicUrl;

        // Reconcile against the LATEST parent state (via photosRef), not the
        // closed-over `photos` from when handleFiles was called. If the user
        // removed an in-flight photo while we were uploading, this iteration
        // will not bring it back.
        const current = photosRef.current;
        const next = normalizePositions([
          ...current,
          {
            path,
            isHero: current.length === 0,
            position: current.length,
            previewUrl: publicUrl,
            fileName: file.name,
          },
        ]);
        // Optimistically update the ref so the NEXT iteration in this same
        // batch sees the freshly-uploaded photo, even before React re-renders.
        photosRef.current = next;

        onChange(next);
        setUploadingCount((c) => Math.max(0, c - 1));
      }
    },
    [operatorId, draftId, maxPhotos, onChange],
  );

  const handleRemove = (idx: number) => {
    const next = normalizePositions(photos.filter((_, i) => i !== idx));
    // If we just removed the hero, promote the new first photo.
    if (next.length > 0 && !next.some((p) => p.isHero)) {
      next[0] = { ...next[0], isHero: true };
    }
    onChange(next);
  };

  const handleSetHero = (idx: number) => {
    onChange(
      photos.map((p, i) => ({ ...p, isHero: i === idx })),
    );
  };

  const handleDragStart = (idx: number) => {
    dragFromIdx.current = idx;
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDragOverIdx(idx);
  };

  const handleDrop = (e: React.DragEvent, toIdx: number) => {
    e.preventDefault();
    const fromIdx = dragFromIdx.current;
    dragFromIdx.current = null;
    setDragOverIdx(null);
    if (fromIdx === null || fromIdx === toIdx) return;

    const next = [...photos];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    const normalized = normalizePositions(next);
    // Reordering to position 0 also reassigns hero.
    if (toIdx === 0) {
      onChange(normalized.map((p, i) => ({ ...p, isHero: i === 0 })));
    } else {
      onChange(normalized);
    }
  };

  const openPicker = () => fileInputRef.current?.click();

  return (
    <div className="flex flex-col gap-space-4">
      {errors.length > 0 && (
        <ul className="flex flex-col gap-1">
          {errors.map((msg, i) => (
            <li
              key={`${msg}-${i}`}
              className="flex items-center justify-between gap-space-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              <span>{msg}</span>
              <button
                type="button"
                aria-label="Dismiss error"
                onClick={() => dismissError(i)}
                className="rounded-sm p-1 hover:bg-destructive/10"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={openPicker}
        className="flex flex-col items-center justify-center gap-space-2 rounded-lg border-2 border-dashed border-neutral-300 bg-neutral-50 p-space-8 text-center transition-colors hover:border-primary hover:bg-primary-light/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Add photos"
      >
        <Upload className="h-8 w-8 text-neutral-500" aria-hidden="true" />
        <span className="text-base font-medium">
          Click to upload photos
        </span>
        <span className="text-sm text-neutral-700">
          JPEG, PNG, or WebP · up to 10 MB each · 1–{maxPhotos} photos
        </span>
        {uploadingCount > 0 && (
          <span className="flex items-center gap-2 text-sm text-primary-dark">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Uploading {uploadingCount}…
          </span>
        )}
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        hidden
        onChange={(e) => {
          void handleFiles(e.target.files);
          // Reset so the same file can be selected again after an error.
          e.target.value = "";
        }}
      />

      {photos.length > 0 && (
        <ul
          aria-label="Uploaded photos"
          className="grid grid-cols-2 gap-space-2 sm:grid-cols-3 md:grid-cols-4"
        >
          {photos.map((photo, idx) => (
            <li
              key={photo.path}
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDrop={(e) => handleDrop(e, idx)}
              onDragEnd={() => {
                dragFromIdx.current = null;
                setDragOverIdx(null);
              }}
              className={cn(
                "group relative overflow-hidden rounded-lg border border-neutral-200 bg-neutral-100",
                dragOverIdx === idx && "ring-2 ring-primary",
              )}
            >
              <div className="aspect-square w-full">
                {photo.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photo.previewUrl}
                    alt={photo.fileName ?? `Photo ${idx + 1}`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-sm text-neutral-500">
                    Photo
                  </div>
                )}
              </div>

              {photo.isHero && (
                <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-white">
                  <Star className="h-3 w-3" aria-hidden="true" />
                  Hero
                </span>
              )}

              <div className="absolute right-2 top-2 flex flex-col items-end gap-1">
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  aria-label={`Remove ${photo.fileName ?? `photo ${idx + 1}`}`}
                  onClick={() => handleRemove(idx)}
                  className="h-8 w-8"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>

              {!photo.isHero && (
                <div className="absolute bottom-0 left-0 right-0 flex justify-center bg-black/50 p-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                  <button
                    type="button"
                    onClick={() => handleSetHero(idx)}
                    aria-label={`Set ${photo.fileName ?? `photo ${idx + 1}`} as hero photo`}
                    className="text-xs font-medium text-white underline-offset-2 hover:underline"
                  >
                    Set as hero
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
