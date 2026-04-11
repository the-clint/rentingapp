"use server";

/**
 * Check-in Server Actions (Story 4-4).
 *
 * Two exports:
 *
 * - `previewCheckIn(bookingId)` — read-only. Loads the booking +
 *   listing, validates ownership + lifecycle eligibility, and returns
 *   the minimal data the check-in page needs (listing name + hero
 *   photo URL). Only bookings in the `active`/`return_due` lifecycle
 *   states are eligible — `upcoming` / `completed` / `cancelled` all
 *   reject here.
 *
 * - `submitCheckIn(bookingId, input)` — the write path. Re-validates
 *   ownership + eligibility, then calls `rpc_submit_check_in` to
 *   write the check-in row AND flip the booking to 'completed' inside
 *   a single transaction. Fires the stub operator notification
 *   (TODO: Story 6-4 / 6-5) but never blocks success on it.
 *
 * Photos are uploaded client-side (see `check-in-flow.tsx`) directly
 * to the `check-in-photos` storage bucket and their object paths are
 * passed in here. The RLS policy on the bucket already restricts
 * uploads to bookings owned by the calling renter — we additionally
 * validate that every submitted path begins with `{bookingId}/` so a
 * malicious caller can't smuggle in paths from other bookings.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import {
  LISTING_PHOTOS_BUCKET,
} from "@/lib/services/storage-paths";
import { notifyOperatorCheckInSubmitted } from "@/lib/services/notifications";
import { computeRentalLifecycle } from "@/lib/services/rental-lifecycle";
import { createClient } from "@/lib/supabase/server";
import { err, ok, type Result } from "@/lib/utils/result";

export const CHECK_IN_CONDITIONS = ["good", "damage", "issue"] as const;
export type CheckInCondition = (typeof CHECK_IN_CONDITIONS)[number];

export interface SubmitCheckInInput {
  condition: CheckInCondition;
  comments?: string;
  photoPaths?: string[];
}

export interface PreviewCheckInResult {
  bookingId: string;
  listingName: string;
  heroPhotoUrl: string | null;
  startDate: string;
  endDate: string;
  pickupLocation: string;
}

export interface SubmitCheckInResult {
  bookingId: string;
  checkInId: string;
}

interface RenterSession {
  userId: string;
  phoneE164: string;
}

async function getRenterSession(): Promise<RenterSession | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const phone = user.phone;
  if (!phone) return null;
  const role = (user.app_metadata as { role?: string } | null)?.role;
  if (role && role !== "renter") return null;
  return {
    userId: user.id,
    phoneE164: phone.startsWith("+") ? phone : `+${phone}`,
  };
}

interface BookingForCheckIn {
  id: string;
  listing_id: string;
  renter_id: string;
  status: string;
  start_date: string;
  end_date: string;
}

interface ListingForCheckIn {
  id: string;
  name: string;
  pickup_location: string;
  photos:
    | Array<{ path: string; isHero: boolean; position: number }>
    | null;
}

async function loadBookingAndListing(
  bookingId: string,
  session: RenterSession,
): Promise<
  | { ok: true; booking: BookingForCheckIn; listing: ListingForCheckIn }
  | { ok: false; code: string; message: string }
> {
  const admin = createAdminClient();
  const { data: bookingRow, error: bookingError } = await admin
    .from("bookings")
    .select(
      "id, listing_id, renter_id, status, start_date, end_date",
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingError) {
    return {
      ok: false,
      code: "CHECK_IN_DATABASE_ERROR",
      message: bookingError.message ?? "Failed to load booking",
    };
  }
  if (!bookingRow) {
    return {
      ok: false,
      code: "CHECK_IN_BOOKING_NOT_FOUND",
      message: "Booking not found",
    };
  }
  const booking = bookingRow as BookingForCheckIn;

  if (booking.renter_id !== session.userId) {
    return {
      ok: false,
      code: "CHECK_IN_FORBIDDEN",
      message: "You do not have permission to check in this booking",
    };
  }

  if (booking.status !== "confirmed") {
    return {
      ok: false,
      code: "CHECK_IN_NOT_ELIGIBLE",
      message:
        "This booking has already been completed or cancelled — no check-in needed.",
    };
  }

  const lifecycle = computeRentalLifecycle(
    {
      status: "confirmed",
      startDate: booking.start_date,
      endDate: booking.end_date,
    },
    new Date(),
  );
  const canCheckIn = lifecycle.actionsAvailable.includes("check-in");
  if (!canCheckIn) {
    return {
      ok: false,
      code: "CHECK_IN_NOT_ELIGIBLE",
      message:
        "This rental is not yet due for check-in. Come back on your return date.",
    };
  }

  const { data: listingRow, error: listingError } = await admin
    .from("listings")
    .select("id, name, pickup_location, photos")
    .eq("id", booking.listing_id)
    .maybeSingle();
  if (listingError) {
    return {
      ok: false,
      code: "CHECK_IN_DATABASE_ERROR",
      message: listingError.message ?? "Failed to load listing",
    };
  }
  if (!listingRow) {
    return {
      ok: false,
      code: "CHECK_IN_LISTING_NOT_FOUND",
      message: "Listing not found",
    };
  }

  return {
    ok: true,
    booking,
    listing: listingRow as unknown as ListingForCheckIn,
  };
}

function resolveHeroPhotoUrl(
  listing: ListingForCheckIn,
  getPublicUrl: (path: string) => string,
): string | null {
  const photos = listing.photos;
  if (!photos || photos.length === 0) return null;
  const sorted = [...photos].sort((a, b) => a.position - b.position);
  const hero = sorted.find((p) => p.isHero) ?? sorted[0];
  return hero ? getPublicUrl(hero.path) : null;
}

export async function previewCheckIn(
  bookingId: string,
): Promise<Result<PreviewCheckInResult>> {
  if (!bookingId || typeof bookingId !== "string") {
    return err(
      "CHECK_IN_BOOKING_NOT_FOUND",
      "Missing booking id",
    ) as Result<PreviewCheckInResult>;
  }

  const session = await getRenterSession();
  if (!session) {
    return err(
      "CHECK_IN_UNAUTHENTICATED",
      "You must verify your phone to check in a rental",
    ) as Result<PreviewCheckInResult>;
  }

  const loaded = await loadBookingAndListing(bookingId, session);
  if (!loaded.ok) {
    return err(loaded.code, loaded.message) as Result<PreviewCheckInResult>;
  }

  const admin = createAdminClient();
  const getPublicUrl = (path: string): string =>
    admin.storage.from(LISTING_PHOTOS_BUCKET).getPublicUrl(path).data.publicUrl;

  return ok({
    bookingId: loaded.booking.id,
    listingName: loaded.listing.name,
    heroPhotoUrl: resolveHeroPhotoUrl(loaded.listing, getPublicUrl),
    startDate: loaded.booking.start_date,
    endDate: loaded.booking.end_date,
    pickupLocation: loaded.listing.pickup_location,
  });
}

function validatePhotoPaths(
  bookingId: string,
  paths: readonly string[] | undefined,
): { ok: true; paths: string[] } | { ok: false; message: string } {
  if (!paths || paths.length === 0) return { ok: true, paths: [] };
  if (paths.length > 6) {
    return { ok: false, message: "Too many photos (max 6)" };
  }
  const prefix = `${bookingId}/`;
  for (const p of paths) {
    if (typeof p !== "string" || p.length === 0) {
      return { ok: false, message: "Invalid photo path" };
    }
    if (!p.startsWith(prefix)) {
      return {
        ok: false,
        message: "Photo paths must be scoped to the current booking",
      };
    }
    // Reject any ".." traversal attempts.
    if (p.includes("..")) {
      return { ok: false, message: "Invalid photo path" };
    }
  }
  return { ok: true, paths: [...paths] };
}

export async function submitCheckIn(
  bookingId: string,
  input: SubmitCheckInInput,
): Promise<Result<SubmitCheckInResult>> {
  if (!bookingId || typeof bookingId !== "string") {
    return err(
      "CHECK_IN_BOOKING_NOT_FOUND",
      "Missing booking id",
    ) as Result<SubmitCheckInResult>;
  }
  if (!CHECK_IN_CONDITIONS.includes(input.condition)) {
    return err(
      "CHECK_IN_INVALID_CONDITION",
      "Please select a valid condition",
    ) as Result<SubmitCheckInResult>;
  }
  if ((input.condition === "damage" || input.condition === "issue")) {
    const trimmed = (input.comments ?? "").trim();
    if (trimmed.length < 4) {
      return err(
        "CHECK_IN_MISSING_DESCRIPTION",
        "Please describe the issue before submitting",
      ) as Result<SubmitCheckInResult>;
    }
  }

  const photoCheck = validatePhotoPaths(bookingId, input.photoPaths);
  if (!photoCheck.ok) {
    return err(
      "CHECK_IN_INVALID_PHOTO",
      photoCheck.message,
    ) as Result<SubmitCheckInResult>;
  }

  const session = await getRenterSession();
  if (!session) {
    return err(
      "SESSION_EXPIRED",
      "Your session expired. Please re-verify your phone to continue.",
    ) as Result<SubmitCheckInResult>;
  }

  const loaded = await loadBookingAndListing(bookingId, session);
  if (!loaded.ok) {
    return err(loaded.code, loaded.message) as Result<SubmitCheckInResult>;
  }

  const admin = createAdminClient();
  const { data: rpcRows, error: rpcError } = await admin.rpc(
    "rpc_submit_check_in",
    {
      booking_id: loaded.booking.id,
      p_renter_id: session.userId,
      p_condition: input.condition,
      p_comments: (input.comments ?? "").trim(),
      p_photo_paths: photoCheck.paths,
    },
  );

  if (rpcError) {
    const raw = rpcError.message ?? "";
    if (raw.includes("CHECK_IN_NOT_FOUND")) {
      return err(
        "CHECK_IN_BOOKING_NOT_FOUND",
        "Booking not found",
      ) as Result<SubmitCheckInResult>;
    }
    if (raw.includes("CHECK_IN_NOT_ELIGIBLE")) {
      return err(
        "CHECK_IN_NOT_ELIGIBLE",
        "This booking can no longer be checked in",
      ) as Result<SubmitCheckInResult>;
    }
    if (raw.includes("CHECK_IN_FORBIDDEN")) {
      return err(
        "CHECK_IN_FORBIDDEN",
        "You do not have permission to check in this booking",
      ) as Result<SubmitCheckInResult>;
    }
    return err(
      "CHECK_IN_DATABASE_ERROR",
      raw || "Failed to submit check-in",
    ) as Result<SubmitCheckInResult>;
  }

  const rows = (rpcRows ?? []) as Array<{ check_in_id: string }>;
  const checkInId = rows[0]?.check_in_id ?? "";

  // Fire-and-forget the operator notification stub. Real Twilio + realtime
  // delivery lands in Stories 6-4 / 6-5.
  try {
    await notifyOperatorCheckInSubmitted({
      bookingId: loaded.booking.id,
      listingName: loaded.listing.name,
      condition: input.condition,
    });
  } catch {
    // Never roll back a successful check-in on a notification failure.
  }

  return ok({
    bookingId: loaded.booking.id,
    checkInId,
  });
}
