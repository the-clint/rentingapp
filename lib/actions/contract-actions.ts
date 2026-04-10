"use server";

/**
 * Contract Server Actions (Story 3-4).
 *
 * `createContractDraft` — idempotent: given `(listingId, startDate,
 * endDate)` plus the current renter session, returns the existing draft
 * contract row if one exists, otherwise renders the contract body and
 * inserts a new draft row.
 *
 * `signContract` — marks the draft signed AND inserts the `bookings` row
 * with status `pending_payment`, linking them via `contract_id`. Guards:
 *   - The caller must be the contract's renter (`auth.uid() === renter_id`).
 *   - The contract must not already be signed.
 *   - The listing must still be published.
 *   - The date range must not overlap any existing `booking_dates` rows
 *     for the listing (double-book guard; the hard DB-level unique
 *     constraint from Story 3-5's `booking_dates` insert is the
 *     authoritative guard, but we check early to fail fast and to deliver
 *     the `BOOKING_CONFLICT` error shape without touching the real
 *     `booking_dates` table until payment lands in 3-5).
 *
 * Both actions use the service-role admin client so they can insert into
 * the RLS-locked `contracts` table and cross-reference `listings` columns
 * (including `pickup_instructions`, which anon cannot read).
 */

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createContractDraftSchema,
  signContractSchema,
} from "@/lib/schemas/contract-schema";
import {
  renderContract,
  type ContractSummary,
} from "@/lib/utils/contract-template";
import { enumerateDateRange } from "@/lib/utils/date-range";
import { ok, err, type Result } from "@/lib/utils/result";

export type ContractError =
  | { code: "CONTRACT_INVALID_INPUT"; message: string }
  | { code: "CONTRACT_UNAUTHENTICATED"; message: string }
  | { code: "CONTRACT_FORBIDDEN"; message: string }
  | { code: "CONTRACT_LISTING_NOT_FOUND"; message: string }
  | { code: "CONTRACT_NOT_FOUND"; message: string }
  | { code: "CONTRACT_ALREADY_SIGNED"; message: string }
  | { code: "BOOKING_CONFLICT"; message: string }
  | { code: "CONTRACT_DATABASE_ERROR"; message: string };

export interface CreateContractDraftResult {
  contractId: string;
  body: string;
  summary: ContractSummary;
  startDate: string;
  endDate: string;
  totalCents: number;
  rentalDays: number;
  listingName: string;
  renterPhoneE164: string;
}

interface ListingForContract {
  id: string;
  name: string;
  daily_rate_cents: number;
  pickup_location: string;
  pickup_instructions: string | null;
  status: "draft" | "published" | "archived";
  deleted_at: string | null;
}

function rentalDayCount(start: string, end: string): number {
  return enumerateDateRange(start, end).length;
}

/**
 * Look up the authenticated renter from the SSR-cookie-backed client.
 * Returns `null` when no session is present or the role claim is not
 * `renter`.
 */
async function getRenterSession(): Promise<
  | { userId: string; phoneE164: string }
  | null
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const role = (user.app_metadata as { role?: string } | null)?.role;
  // Also accept the JWT claim path — the custom access token hook stamps
  // `user_role=renter` for phone-only users regardless of app_metadata.
  const phone = user.phone;
  if (!phone) return null;
  if (role && role !== "renter") return null;

  return { userId: user.id, phoneE164: phone.startsWith("+") ? phone : `+${phone}` };
}

async function loadPublishedListing(
  listingId: string,
): Promise<Result<ListingForContract>> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("listings")
    .select(
      "id, name, daily_rate_cents, pickup_location, pickup_instructions, status, deleted_at",
    )
    .eq("id", listingId)
    .maybeSingle();

  if (error) {
    return err(
      "CONTRACT_DATABASE_ERROR",
      error.message ?? "Failed to read listing",
    );
  }
  if (!data) {
    return err("CONTRACT_LISTING_NOT_FOUND", "Listing not found");
  }
  const listing = data as ListingForContract;
  if (listing.deleted_at || listing.status !== "published") {
    return err(
      "CONTRACT_LISTING_NOT_FOUND",
      "This listing is no longer available",
    );
  }
  return ok(listing);
}

/**
 * Create (or re-fetch) a draft contract row for this renter + listing +
 * date range. Idempotent: repeated calls with the same inputs return the
 * same `contractId`.
 */
export async function createContractDraft(
  input: unknown,
): Promise<Result<CreateContractDraftResult>> {
  const parsed = createContractDraftSchema.safeParse(input);
  if (!parsed.success) {
    return err(
      "CONTRACT_INVALID_INPUT",
      parsed.error.issues[0]?.message ?? "Invalid contract input",
    );
  }
  const { listingId, startDate, endDate } = parsed.data;

  const session = await getRenterSession();
  if (!session) {
    return err(
      "CONTRACT_UNAUTHENTICATED",
      "You must verify your phone before signing a contract",
    );
  }

  const listingResult = await loadPublishedListing(listingId);
  if (!listingResult.success) {
    return listingResult;
  }
  const listing = listingResult.data;

  const admin = createAdminClient();

  // Idempotency lookup — the `contracts_draft_identity_idx` unique partial
  // index means there can be at most one unsigned row for this tuple.
  const { data: existing, error: existingError } = await admin
    .from("contracts")
    .select("id, body")
    .eq("renter_id", session.userId)
    .eq("listing_id", listingId)
    .eq("start_date", startDate)
    .eq("end_date", endDate)
    .is("signed_at", null)
    .maybeSingle();

  if (existingError) {
    return err(
      "CONTRACT_DATABASE_ERROR",
      existingError.message ?? "Failed to look up existing contract",
    );
  }

  const rentalDays = rentalDayCount(startDate, endDate);
  const totalCents = listing.daily_rate_cents * rentalDays;

  const rendered = renderContract({
    listingName: listing.name,
    pickupLocation: listing.pickup_location,
    pickupInstructions: listing.pickup_instructions,
    dailyRateCents: listing.daily_rate_cents,
    startDate,
    endDate,
    totalCents,
    rentalDays,
    renterPhoneE164: session.phoneE164,
  });

  if (existing) {
    return ok({
      contractId: existing.id as string,
      body: rendered.body,
      summary: rendered.summary,
      startDate,
      endDate,
      totalCents,
      rentalDays,
      listingName: listing.name,
      renterPhoneE164: session.phoneE164,
    });
  }

  const { data: inserted, error: insertError } = await admin
    .from("contracts")
    .insert({
      listing_id: listingId,
      renter_id: session.userId,
      renter_phone: session.phoneE164,
      start_date: startDate,
      end_date: endDate,
      total_cents: totalCents,
      body: rendered.body,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    return err(
      "CONTRACT_DATABASE_ERROR",
      insertError?.message ?? "Failed to create contract draft",
    );
  }

  return ok({
    contractId: inserted.id as string,
    body: rendered.body,
    summary: rendered.summary,
    startDate,
    endDate,
    totalCents,
    rentalDays,
    listingName: listing.name,
    renterPhoneE164: session.phoneE164,
  });
}

/**
 * Sign a draft contract. This is the inflection point for Story 3-4 →
 * 3-5: we mark the contract signed, create the `bookings` row in
 * `pending_payment` status, and link them via `contract_id`. Story 3-5's
 * Stripe PaymentIntent flow will then pull the booking id from the URL
 * and authorize the hold.
 */
export async function signContract(
  input: unknown,
): Promise<Result<{ bookingId: string; signedAt: string }>> {
  const parsed = signContractSchema.safeParse(input);
  if (!parsed.success) {
    return err(
      "CONTRACT_INVALID_INPUT",
      parsed.error.issues[0]?.message ?? "Invalid sign input",
    );
  }
  const { contractId } = parsed.data;

  const session = await getRenterSession();
  if (!session) {
    return err(
      "CONTRACT_UNAUTHENTICATED",
      "You must verify your phone before signing a contract",
    );
  }

  const admin = createAdminClient();

  // Load the contract. The admin client bypasses RLS so we can read the
  // row regardless of the caller — we re-check ownership in application
  // code immediately below.
  const { data: contract, error: loadError } = await admin
    .from("contracts")
    .select(
      "id, renter_id, listing_id, start_date, end_date, total_cents, signed_at, booking_id",
    )
    .eq("id", contractId)
    .maybeSingle();

  if (loadError) {
    return err(
      "CONTRACT_DATABASE_ERROR",
      loadError.message ?? "Failed to load contract",
    );
  }
  if (!contract) {
    return err("CONTRACT_NOT_FOUND", "Contract not found");
  }
  if (contract.renter_id !== session.userId) {
    return err(
      "CONTRACT_FORBIDDEN",
      "You do not have permission to sign this contract",
    );
  }
  if (contract.signed_at) {
    return err(
      "CONTRACT_ALREADY_SIGNED",
      "This contract has already been signed",
    );
  }

  // Re-verify the listing is still published.
  const listingResult = await loadPublishedListing(contract.listing_id as string);
  if (!listingResult.success) {
    return listingResult;
  }

  // Double-book guard. We look at any existing `bookings` rows on this
  // listing that overlap the requested range and whose status is not
  // cancelled. The hard DB-level guarantee (unique on
  // `booking_dates(listing_id, date)`) is enforced when Story 3-5 writes
  // the booking_dates rows; here we short-circuit early with a friendlier
  // error.
  const { data: conflicts, error: conflictError } = await admin
    .from("bookings")
    .select("id, start_date, end_date, status")
    .eq("listing_id", contract.listing_id)
    .not("status", "in", "(cancelled)")
    .lte("start_date", contract.end_date)
    .gte("end_date", contract.start_date);

  if (conflictError) {
    return err(
      "CONTRACT_DATABASE_ERROR",
      conflictError.message ?? "Failed to check availability",
    );
  }
  if (conflicts && conflicts.length > 0) {
    return err(
      "BOOKING_CONFLICT",
      "These dates were just booked. Please pick different dates.",
    );
  }

  // Create the bookings row in `pending_payment`. Story 3-5 will insert
  // booking_dates rows and transition the status to `confirmed` after
  // Stripe authorizes the hold.
  const { data: booking, error: bookingError } = await admin
    .from("bookings")
    .insert({
      listing_id: contract.listing_id,
      renter_id: session.userId,
      status: "pending_payment",
      start_date: contract.start_date,
      end_date: contract.end_date,
      total_cents: contract.total_cents,
      contract_id: contract.id,
    })
    .select("id")
    .single();

  if (bookingError || !booking) {
    return err(
      "CONTRACT_DATABASE_ERROR",
      bookingError?.message ?? "Failed to create booking",
    );
  }

  // Stamp the signature. The immutability trigger fires AFTER this update
  // succeeds — subsequent UPDATE/DELETE on the row will raise.
  const signedAt = new Date().toISOString();
  const { error: signError } = await admin
    .from("contracts")
    .update({ signed_at: signedAt, booking_id: booking.id })
    .eq("id", contract.id)
    .is("signed_at", null);

  if (signError) {
    return err(
      "CONTRACT_DATABASE_ERROR",
      signError.message ?? "Failed to sign contract",
    );
  }

  return ok({ bookingId: booking.id as string, signedAt });
}
