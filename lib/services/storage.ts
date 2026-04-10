import { createClient } from "@/lib/supabase/server";
import { ok, err, type Result } from "@/lib/utils/result";
import {
  LISTING_PHOTOS_BUCKET,
  getListingPhotoUploadPath,
} from "./storage-paths";

// TODO(orphan-cleanup): If the operator abandons the Create Listing wizard
// mid-flow, photos uploaded under `{operator_id}/{draft_id}/*` will be
// orphaned in the `listing-photos` bucket. A future cleanup job should sweep
// for paths with no corresponding row in `public.listings.photos[].path`.

// Re-export the pure helpers so existing importers (and tests) keep working
// via this module. Client Components should import them from
// `@/lib/services/storage-paths` directly to avoid pulling in the server
// Supabase client.
export { LISTING_PHOTOS_BUCKET, getListingPhotoUploadPath };

/**
 * Build the public URL for a previously-uploaded listing photo object path.
 * Used by thumbnails on the wizard photo grid and (later) by the renter
 * booking page.
 */
export async function getPublicListingPhotoUrl(path: string): Promise<string> {
  const supabase = await createClient();
  return supabase.storage.from(LISTING_PHOTOS_BUCKET).getPublicUrl(path).data
    .publicUrl;
}

/**
 * Delete an uploaded listing photo object. Invoked by the "Remove" button on
 * the photo grid tile in the Create Listing wizard. Wraps storage-client
 * failures as a `STORAGE_ERROR` Result so callers never see a thrown value.
 */
export async function deleteListingPhoto(
  path: string,
): Promise<Result<null>> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.storage
      .from(LISTING_PHOTOS_BUCKET)
      .remove([path]);
    if (error) {
      return err("STORAGE_ERROR", error.message);
    }
    return ok(null);
  } catch (thrown: unknown) {
    const message =
      thrown instanceof Error ? thrown.message : "Unknown storage error";
    return err("STORAGE_ERROR", message);
  }
}
