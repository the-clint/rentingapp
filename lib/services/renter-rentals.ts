/**
 * Renter dashboard data fetch (Story 4-1).
 *
 * Joins `bookings` → `listings` for a given renter and returns a sorted,
 * filtered list of `RentalCardViewModel`s ready for presentational
 * rendering on `/rentals`. The caller (a Server Component) has already
 * verified the session; we use the service-role admin client here so
 * that the join can include anon-restricted columns like
 * `listings.pickup_location` and `listings.photos`, and so the lifecycle
 * computation doesn't have to pay an extra RLS round-trip.
 *
 * Rules:
 *   - `status = 'pending'` rows are EXCLUDED (renter is mid-flow, resumes
 *     via Story 3-6's `/book/[id]/...` route, not the dashboard).
 *   - `end_date < today - 45 days` rows are EXCLUDED at the query level
 *     (FR17 — past rentals visible for 45 days after completion).
 *   - Sort order: active + return_due first, then upcoming ascending by
 *     start date, then completed descending by end date, then cancelled
 *     last.
 *
 * NEVER import this module from a Client Component — it pulls in
 * `createAdminClient` which reads `SUPABASE_SERVICE_ROLE_KEY`.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { LISTING_PHOTOS_BUCKET } from "@/lib/services/storage-paths";
import { err, ok, type Result } from "@/lib/utils/result";
import {
  computeRentalLifecycle,
  RENTAL_HISTORY_VISIBILITY_DAYS,
  type RentalLifecycle,
} from "./rental-lifecycle";

export type RenterRentalsError = "DATABASE_ERROR";

export interface RentalCardPhoto {
  path: string;
  url: string;
}

export interface RentalCardViewModel {
  bookingId: string;
  listingId: string;
  listingName: string;
  pickupLocation: string;
  heroPhoto: RentalCardPhoto | null;
  startDate: string;
  endDate: string;
  totalCents: number;
  lifecycle: RentalLifecycle;
}

interface BookingRow {
  id: string;
  listing_id: string;
  renter_id: string;
  status: "pending" | "confirmed" | "cancelled" | "completed" | "no_show";
  start_date: string;
  end_date: string;
  total_cents: number;
  listings: {
    id: string;
    name: string;
    pickup_location: string;
    photos:
      | Array<{ path: string; isHero: boolean; position: number }>
      | null;
  } | null;
}

export interface FetchRenterRentalsArgs {
  renterId: string;
  today: Date;
}

/**
 * Sort order weights: lower weight renders first.
 *
 *   active / return_due → 0
 *   upcoming            → 1
 *   completed           → 2
 *   cancelled           → 3
 *   past_completed      → never reached (filtered upstream)
 */
function sortWeight(state: RentalLifecycle["state"]): number {
  switch (state) {
    case "active":
    case "return_due":
      return 0;
    case "upcoming":
      return 1;
    case "completed":
      return 2;
    case "cancelled":
      return 3;
    default:
      return 4;
  }
}

function compareCards(
  a: RentalCardViewModel,
  b: RentalCardViewModel,
): number {
  const wa = sortWeight(a.lifecycle.state);
  const wb = sortWeight(b.lifecycle.state);
  if (wa !== wb) return wa - wb;

  // Within the same weight bucket, sort:
  //   - upcoming: ascending by start_date (soonest first)
  //   - completed: descending by end_date (most recent first)
  //   - active/return_due: ascending by end_date (most urgent first)
  //   - cancelled: descending by end_date
  if (a.lifecycle.state === "upcoming") {
    return a.startDate.localeCompare(b.startDate);
  }
  if (a.lifecycle.state === "completed" || a.lifecycle.state === "cancelled") {
    return b.endDate.localeCompare(a.endDate);
  }
  return a.endDate.localeCompare(b.endDate);
}

function toIsoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function cutoffDate(today: Date): string {
  const cutoff = new Date(today.getTime());
  cutoff.setUTCDate(cutoff.getUTCDate() - RENTAL_HISTORY_VISIBILITY_DAYS);
  return toIsoDate(cutoff);
}

function resolveHeroPhoto(
  photos: BookingRow["listings"] extends infer L
    ? L extends { photos: infer P }
      ? P
      : never
    : never,
  getPublicUrl: (path: string) => string,
): RentalCardPhoto | null {
  if (!photos || photos.length === 0) return null;
  const sorted = [...photos].sort((a, b) => a.position - b.position);
  const hero = sorted.find((p) => p.isHero) ?? sorted[0];
  if (!hero) return null;
  return { path: hero.path, url: getPublicUrl(hero.path) };
}

/**
 * Fetch the renter's dashboard cards. Returns an already-sorted,
 * already-filtered list ready to render.
 */
export async function fetchRenterRentals(
  args: FetchRenterRentalsArgs,
): Promise<Result<RentalCardViewModel[]>> {
  const { renterId, today } = args;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("bookings")
    .select(
      "id, listing_id, renter_id, status, start_date, end_date, total_cents, listings(id, name, pickup_location, photos)",
    )
    .eq("renter_id", renterId)
    .neq("status", "pending")
    .gte("end_date", cutoffDate(today));

  if (error) {
    return err("DATABASE_ERROR", error.message);
  }

  const rows = (data ?? []) as unknown as BookingRow[];

  const getPublicUrl = (path: string): string =>
    admin.storage.from(LISTING_PHOTOS_BUCKET).getPublicUrl(path).data.publicUrl;

  const cards: RentalCardViewModel[] = [];
  for (const row of rows) {
    // Defense-in-depth: reject any row that somehow slipped past the
    // renter_id filter (e.g. RLS bypass bug in an earlier migration).
    if (row.renter_id !== renterId) continue;
    if (!row.listings) continue;

    const lifecycle = computeRentalLifecycle(
      {
        status: row.status,
        startDate: row.start_date,
        endDate: row.end_date,
      },
      today,
    );

    // The SQL cutoff is a coarse filter (end_date >= today - 45d) — the
    // lifecycle helper is the final authority on whether the row is past
    // the history window.
    if (lifecycle.state === "past_completed") continue;

    cards.push({
      bookingId: row.id,
      listingId: row.listing_id,
      listingName: row.listings.name,
      pickupLocation: row.listings.pickup_location,
      heroPhoto: resolveHeroPhoto(row.listings.photos, getPublicUrl),
      startDate: row.start_date,
      endDate: row.end_date,
      totalCents: row.total_cents,
      lifecycle,
    });
  }

  cards.sort(compareCards);
  return ok(cards);
}
