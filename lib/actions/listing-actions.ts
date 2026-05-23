"use server";

/**
 * Listing Server Actions.
 *
 * `createListing` (Story 2.1), `updateListing` (Story 2.3), and
 * `deleteListing` (Story 2.3) are the only write paths for the `listings`
 * table from the operator shell. All three rely on the defense-in-depth
 * ownership probe pattern established by Story 2.2's review fixes: every
 * mutation filters on BOTH `id` and `operator_id` so a silently-widened
 * `listings` SELECT policy could never make these actions cross-tenant
 * writable.
 *
 * `deleteListing` is a SOFT delete only — it sets `deleted_at` to the
 * current timestamp. Hard purge / data retention lives in the future Epic 7
 * Story 7-2. The `listings.deleted_at` column and the
 * `status = 'published' AND deleted_at IS NULL` public-read RLS policy
 * (from `supabase/migrations/00003_listings.sql`) already enforce renter
 * invisibility.
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { ok, err, type Result } from "@/lib/utils/result";
import { listingSchema, type PhotoInput } from "@/lib/schemas/listing-schema";

// The generated `lib/types/database.ts` does not exist in this repo yet
// (see Story 2.1 Task 1.5). Type the insert payload explicitly instead of
// casting to `any`.
interface ListingInsertRow {
  operator_id: string;
  name: string;
  description: string;
  daily_rate_cents: number;
  address_street: string;
  address_city: string;
  address_state: string;
  address_zip: string;
  pickup_location: string;
  pickup_instructions: string | null;
  photos: PhotoInput[];
  status: "draft" | "published" | "archived";
}

/**
 * Columns writable by `updateListing`. Excludes `operator_id`, `status`,
 * `available_from`, `deleted_at`, `created_at` — none of which the edit
 * form is allowed to touch. `updated_at` is maintained by the
 * `listings_set_updated_at` trigger from Story 2.1.
 */
interface ListingUpdateRow {
  name: string;
  description: string;
  daily_rate_cents: number;
  address_street: string;
  address_city: string;
  address_state: string;
  address_zip: string;
  pickup_location: string;
  pickup_instructions: string | null;
  photos: PhotoInput[];
}

/**
 * Combine the structured address parts into the legacy `pickup_location`
 * column. The DB still stores this concatenated string because authenticated
 * post-booking surfaces (renter dashboard, check-in flow, operator views)
 * read it directly. The anon column grant in 00018 excludes it, so the
 * public booking page never sees the street.
 */
function formatFullAddress(parts: {
  addressStreet: string;
  addressCity: string;
  addressState: string;
  addressZip: string;
}): string {
  const cityStateZip = `${parts.addressCity}, ${parts.addressState} ${parts.addressZip}`.trim();
  if (!parts.addressStreet) return cityStateZip;
  return `${parts.addressStreet}, ${cityStateZip}`;
}

function parseListingFormData(formData: FormData): Result<{
  name: string;
  description: string;
  dailyRateCents: number;
  addressStreet: string;
  addressCity: string;
  addressState: string;
  addressZip: string;
  pickupInstructions: string;
  photos: PhotoInput[];
}> {
  let parsedPhotos: unknown;
  try {
    parsedPhotos = JSON.parse(String(formData.get("photos") ?? "[]"));
  } catch {
    return err("VALIDATION_ERROR", "Photos payload was not valid JSON");
  }

  const raw = {
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    dailyRateCents: Number(formData.get("dailyRateCents") ?? 0),
    addressStreet: String(formData.get("addressStreet") ?? ""),
    addressCity: String(formData.get("addressCity") ?? ""),
    addressState: String(formData.get("addressState") ?? ""),
    addressZip: String(formData.get("addressZip") ?? ""),
    pickupInstructions: String(formData.get("pickupInstructions") ?? ""),
    photos: parsedPhotos,
  };

  const parsed = listingSchema.safeParse(raw);
  if (!parsed.success) {
    return err("VALIDATION_ERROR", parsed.error.issues[0].message);
  }

  return ok({
    name: parsed.data.name,
    description: parsed.data.description,
    dailyRateCents: parsed.data.dailyRateCents,
    addressStreet: parsed.data.addressStreet,
    addressCity: parsed.data.addressCity,
    addressState: parsed.data.addressState,
    addressZip: parsed.data.addressZip,
    pickupInstructions: parsed.data.pickupInstructions ?? "",
    photos: parsed.data.photos,
  });
}

export async function createListing(
  formData: FormData,
): Promise<Result<{ listingId: string }>> {
  const parsed = parseListingFormData(formData);
  if (!parsed.success) {
    return parsed;
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return err("UNAUTHENTICATED", "You must be signed in to create a listing");
  }

  // Role enforcement is handled by `lib/supabase/proxy.ts`, which redirects
  // non-operator users away from `/listings/*` before any request can hit this
  // action. Roles now live only in `public.profiles.role` and the JWT
  // `user_role` claim — `app_metadata.role` was intentionally removed in
  // Story 1-3's code-review fix, so reading it here would be incorrect.
  // See Story 2.1 Completion Notes for the full rationale.

  const insertRow: ListingInsertRow = {
    operator_id: user.id,
    name: parsed.data.name,
    description: parsed.data.description,
    daily_rate_cents: parsed.data.dailyRateCents,
    address_street: parsed.data.addressStreet,
    address_city: parsed.data.addressCity,
    address_state: parsed.data.addressState,
    address_zip: parsed.data.addressZip,
    pickup_location: formatFullAddress(parsed.data),
    pickup_instructions:
      parsed.data.pickupInstructions.length > 0
        ? parsed.data.pickupInstructions
        : null,
    photos: parsed.data.photos,
    status: "published",
  };

  const { data, error: insertError } = await supabase
    .from("listings")
    .insert(insertRow)
    .select("id")
    .single();

  if (insertError) {
    return err("DATABASE_ERROR", insertError.message);
  }

  if (!data?.id) {
    return err("DATABASE_ERROR", "Insert returned no row id");
  }

  return ok({ listingId: data.id as string });
}

/**
 * Persist edits to an existing listing. Uses the defense-in-depth
 * ownership-probe pattern from Story 2.2: filters on BOTH `id` and
 * `operator_id` for the probe and the update. Never touches `status`,
 * `available_from`, `deleted_at`, `operator_id`, or `created_at`; the
 * `updated_at` column is maintained by the `listings_set_updated_at`
 * trigger (see `supabase/migrations/00003_listings.sql`).
 */
export async function updateListing(
  listingId: string,
  formData: FormData,
): Promise<Result<{ listingId: string }>> {
  const parsed = parseListingFormData(formData);
  if (!parsed.success) {
    return parsed;
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return err("UNAUTHENTICATED", "You must be signed in to update a listing");
  }

  // Ownership probe — defense-in-depth beyond the `listings` RLS. Mirrors
  // `availability-actions.ts` `saveAvailability` after Story 2.2's review
  // fixes. `maybeSingle()` distinguishes "row does not exist / not owned /
  // soft-deleted" (data === null) from a real probe error.
  const owned = await supabase
    .from("listings")
    .select("id")
    .eq("id", listingId)
    .eq("operator_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (owned.error) {
    return err("DATABASE_ERROR", owned.error.message);
  }

  if (!owned.data) {
    return err("NOT_FOUND", "Listing not found");
  }

  const updateRow: ListingUpdateRow = {
    name: parsed.data.name,
    description: parsed.data.description,
    daily_rate_cents: parsed.data.dailyRateCents,
    address_street: parsed.data.addressStreet,
    address_city: parsed.data.addressCity,
    address_state: parsed.data.addressState,
    address_zip: parsed.data.addressZip,
    pickup_location: formatFullAddress(parsed.data),
    pickup_instructions:
      parsed.data.pickupInstructions.length > 0
        ? parsed.data.pickupInstructions
        : null,
    photos: parsed.data.photos,
  };

  const update = await supabase
    .from("listings")
    .update(updateRow)
    .eq("id", listingId)
    .eq("operator_id", user.id);

  if (update.error) {
    return err("DATABASE_ERROR", update.error.message);
  }

  revalidatePath(`/listings/${listingId}`);
  revalidatePath("/listings");

  return ok({ listingId });
}

const AD_COPY_MAX = 10000;

export async function saveAdCopy(
  listingId: string,
  adCopy: string,
): Promise<Result<null>> {
  const trimmed = adCopy.trim();
  if (trimmed.length > AD_COPY_MAX) {
    return err(
      "VALIDATION_ERROR",
      `Ad copy must be ${AD_COPY_MAX.toLocaleString()} characters or fewer`,
    );
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return err("UNAUTHENTICATED", "You must be signed in to save ad copy");
  }

  const owned = await supabase
    .from("listings")
    .select("id")
    .eq("id", listingId)
    .eq("operator_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (owned.error) {
    return err("DATABASE_ERROR", owned.error.message);
  }
  if (!owned.data) {
    return err("NOT_FOUND", "Listing not found");
  }

  const update = await supabase
    .from("listings")
    .update({ ad_copy: trimmed.length > 0 ? trimmed : null })
    .eq("id", listingId)
    .eq("operator_id", user.id);

  if (update.error) {
    return err("DATABASE_ERROR", update.error.message);
  }

  revalidatePath(`/listings/${listingId}`);

  return ok(null);
}

/**
 * Soft-delete a listing by setting `deleted_at` to the current timestamp.
 *
 * Idempotent: re-deleting an already-deleted row still returns `ok(null)`.
 * The ownership probe deliberately omits the `deleted_at IS NULL` filter so
 * a second delete attempt on the same row still resolves cleanly.
 *
 * NEVER performs a hard DELETE — renter invisibility is enforced by the
 * `status = 'published' AND deleted_at IS NULL` public-read RLS policy, and
 * hard purge / data retention is a future Epic 7 Story 7-2 concern.
 */
export async function deleteListing(
  listingId: string,
): Promise<Result<null>> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return err("UNAUTHENTICATED", "You must be signed in to delete a listing");
  }

  // No `.is("deleted_at", null)` here — deleting an already-deleted row must
  // be idempotent. We still re-issue the update; the DB `updated_at` trigger
  // is itself idempotent.
  const owned = await supabase
    .from("listings")
    .select("id, deleted_at")
    .eq("id", listingId)
    .eq("operator_id", user.id)
    .maybeSingle();

  if (owned.error) {
    return err("DATABASE_ERROR", owned.error.message);
  }

  if (!owned.data) {
    return err("NOT_FOUND", "Listing not found");
  }

  const update = await supabase
    .from("listings")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", listingId)
    .eq("operator_id", user.id);

  if (update.error) {
    return err("DATABASE_ERROR", update.error.message);
  }

  return ok(null);
}
