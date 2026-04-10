"use server";

/**
 * Availability Server Actions for Story 2.2.
 *
 * `saveAvailability` replaces the set of `reason='operator_block'` rows for a
 * single listing with a fresh set computed from the operator's pending
 * blocked-date toggles. It NEVER touches rows with
 * `reason IN ('booking', 'maintenance_buffer')` — those belong to Epic 3.
 *
 * Known MVP concurrency limitation: the DELETE + INSERT pair is NOT wrapped
 * in a single PostgREST transaction (Supabase REST does not expose
 * BEGIN/COMMIT). If two operator devices save concurrently the second save
 * wholly overwrites the first's operator_block rows. Both devices converge
 * on reload. A follow-up story can tighten this into a Postgres function
 * (e.g. `public.replace_operator_blocks(listing_id uuid, ranges jsonb)`)
 * for a single-transaction guarantee.
 */

import { createClient } from "@/lib/supabase/server";
import { ok, err, type Result } from "@/lib/utils/result";
import {
  blockedRangesSchema,
  type BlockedRangeInput,
} from "@/lib/schemas/availability-schema";

// The generated `lib/types/database.ts` does not exist in this repo yet.
// Type insert/select rows inline instead of casting to `any`.
interface BlockedDateInsertRow {
  listing_id: string;
  start_date: string;
  end_date: string;
  reason: "operator_block" | "booking" | "maintenance_buffer";
}

export interface BlockedDateRow {
  id: string;
  start_date: string;
  end_date: string;
  reason: "operator_block" | "booking" | "maintenance_buffer";
}

export async function saveAvailability(
  listingId: string,
  ranges: BlockedRangeInput[],
): Promise<Result<{ blockedCount: number }>> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return err("UNAUTHENTICATED", "You must be signed in to update availability");
  }

  const parsed = blockedRangesSchema.safeParse(ranges);
  if (!parsed.success) {
    return err("VALIDATION_ERROR", parsed.error.issues[0].message);
  }

  // Ownership probe — defense-in-depth beyond the `listing_blocked_dates`
  // RLS. Story 2.1 established the pattern of filtering on BOTH `id` and
  // `operator_id` at the action layer so a silently-widened listings SELECT
  // policy (e.g. future shared/team listings) could never make this action
  // cross-tenant-writable. Returns a clean NOT_FOUND instead of a generic
  // DATABASE_ERROR when the listing doesn't belong to the caller.
  const owned = await supabase
    .from("listings")
    .select("id")
    .eq("id", listingId)
    .eq("operator_id", user.id)
    .maybeSingle();

  if (owned.error) {
    return err("DATABASE_ERROR", owned.error.message);
  }

  if (!owned.data) {
    return err("NOT_FOUND", "Listing not found");
  }

  const del = await supabase
    .from("listing_blocked_dates")
    .delete()
    .eq("listing_id", listingId)
    .eq("reason", "operator_block");

  if (del.error) {
    return err("DATABASE_ERROR", del.error.message);
  }

  if (parsed.data.length > 0) {
    const insertRows: BlockedDateInsertRow[] = parsed.data.map((r) => ({
      listing_id: listingId,
      start_date: r.startDate,
      end_date: r.endDate,
      reason: "operator_block",
    }));

    const ins = await supabase.from("listing_blocked_dates").insert(insertRows);

    if (ins.error) {
      return err("DATABASE_ERROR", ins.error.message);
    }
  }

  return ok({ blockedCount: parsed.data.length });
}

/**
 * Read helper for the availability page Server Component. Returns every
 * blocked-date row (all reasons) for the listing, ordered by `start_date`.
 * The calendar projects each row into its appropriate visual state.
 */
export async function getListingBlockedDates(
  listingId: string,
): Promise<Result<BlockedDateRow[]>> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return err("UNAUTHENTICATED", "You must be signed in to read availability");
  }

  // Same ownership probe as `saveAvailability` so both paths agree on the
  // NOT_FOUND contract. Without this, reading another operator's listing
  // would silently return `ok([])` (RLS filter), which is semantically
  // different from "this listing does not exist" and confuses callers.
  const owned = await supabase
    .from("listings")
    .select("id")
    .eq("id", listingId)
    .eq("operator_id", user.id)
    .maybeSingle();

  if (owned.error) {
    return err("DATABASE_ERROR", owned.error.message);
  }
  if (!owned.data) {
    return err("NOT_FOUND", "Listing not found");
  }

  const { data, error } = await supabase
    .from("listing_blocked_dates")
    .select("id, start_date, end_date, reason")
    .eq("listing_id", listingId)
    .order("start_date", { ascending: true });

  if (error) {
    return err("DATABASE_ERROR", error.message);
  }

  return ok((data ?? []) as BlockedDateRow[]);
}
