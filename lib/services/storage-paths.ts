// Pure helpers for Supabase Storage object paths. Imported by both server
// code (Server Actions, services) AND Client Components (photo uploader).
// Must NOT import anything from `@/lib/supabase/server` or `next/headers`.

export const LISTING_PHOTOS_BUCKET = "listing-photos";

const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);

function extractExtension(originalFileName: string): string {
  const trimmed = originalFileName.trim().toLowerCase();
  const dot = trimmed.lastIndexOf(".");
  if (dot === -1 || dot === trimmed.length - 1) return "jpg";
  const ext = trimmed.slice(dot + 1);
  return ALLOWED_EXTENSIONS.has(ext) ? ext : "jpg";
}

/**
 * Build the deterministic object path for a new listing photo upload.
 *
 * Path shape: `{operatorId}/{draftId}/{photoUuid}.{ext}`.
 *
 * The RLS policy on `storage.objects` (see migration 00003_listings.sql)
 * requires `(storage.foldername(name))[1] = auth.uid()::text`, which is why
 * the operator id is the first path segment.
 */
export function getListingPhotoUploadPath(
  operatorId: string,
  draftId: string,
  originalFileName: string,
): string {
  const ext = extractExtension(originalFileName);
  const photoUuid =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${operatorId}/${draftId}/${photoUuid}.${ext}`;
}
