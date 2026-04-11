/**
 * Operator bookings data fetch (Stories 5-1 / 5-2 / 5-5).
 *
 * Joins `bookings` → `listings` and the latest matching `contracts`
 * row for each of an operator's bookings, then decorates the result
 * with the rental lifecycle state + a derived operator-facing status
 * label ("Upcoming" / "Active" / "Return Due" / "Completed" /
 * "Cancelled" / "No-Show"). Accepts an optional `statusFilter` to
 * narrow the list to a single tab.
 *
 * NEVER import from a Client Component — uses the service-role admin
 * client so the join can read every column without hitting RLS.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { LISTING_PHOTOS_BUCKET } from "@/lib/services/storage-paths";
import {
  computeRentalLifecycle,
  type RentalLifecycleState,
} from "@/lib/services/rental-lifecycle";
import { err, ok, type Result } from "@/lib/utils/result";

export const OPERATOR_BOOKINGS_STATUS_FILTERS = [
  "all",
  "active",
  "upcoming",
  "completed",
  "no-show",
] as const;
export type OperatorBookingsStatusFilter =
  (typeof OPERATOR_BOOKINGS_STATUS_FILTERS)[number];

export interface OperatorBookingRow {
  bookingId: string;
  listingId: string;
  listingName: string;
  heroPhotoUrl: string | null;
  renterPhone: string;
  renterInitials: string;
  renterDisplayName: string;
  startDate: string;
  endDate: string;
  totalCents: number;
  amountHeldCents: number;
  amountCapturedCents: number;
  status: "upcoming" | "active" | "return_due" | "completed" | "cancelled" | "no_show";
  statusLabel: string;
  lifecycleState: RentalLifecycleState | "no_show";
  checkInSubmitted: boolean;
  stripePaymentIntentId: string | null;
  stripeExtensionIntentId: string | null;
  hasContract: boolean;
  contractId: string | null;
  pickupLocation: string;
  cancelledAt: string | null;
  completedAt: string | null;
}

export type OperatorBookingsError = "DATABASE_ERROR";

export interface FetchOperatorBookingsArgs {
  operatorId: string;
  today: Date;
  statusFilter?: OperatorBookingsStatusFilter;
}

interface RawBookingRow {
  id: string;
  listing_id: string;
  renter_id: string | null;
  status:
    | "pending"
    | "pending_payment"
    | "confirmed"
    | "cancelled"
    | "completed"
    | "no_show";
  start_date: string;
  end_date: string;
  total_cents: number;
  stripe_payment_intent_id: string | null;
  stripe_extension_intent_id: string | null;
  payment_captured_at: string | null;
  payment_captured_cents: number | null;
  cancelled_at: string | null;
  completed_at: string | null;
  listings: {
    id: string;
    name: string;
    operator_id: string;
    pickup_location: string;
    photos:
      | Array<{ path: string; isHero: boolean; position: number }>
      | null;
  } | null;
  contracts: Array<{
    id: string;
    renter_phone: string;
    signed_at: string | null;
  }> | null;
  check_ins: Array<{ id: string }> | null;
}

function phoneInitials(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length >= 2) {
    return digits.slice(-2);
  }
  return "R";
}

function formatRenterDisplayName(phone: string): string {
  // No names in the MVP — everything is phone-OTP. Show a partial
  // mask so the list is scannable without leaking the full number.
  const digits = phone.replace(/\D/g, "");
  if (digits.length >= 4) {
    return `Renter •${digits.slice(-4)}`;
  }
  return "Renter";
}

function statusLabel(
  dbStatus: RawBookingRow["status"],
  lifecycleState: RentalLifecycleState,
): string {
  if (dbStatus === "no_show") return "No-Show";
  if (dbStatus === "cancelled") return "Cancelled";
  if (dbStatus === "completed") return "Completed";
  switch (lifecycleState) {
    case "active":
      return "Active";
    case "return_due":
      return "Return Due";
    case "upcoming":
      return "Upcoming";
    case "completed":
    case "past_completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
  }
}

function normalizedStatus(
  dbStatus: RawBookingRow["status"],
  lifecycleState: RentalLifecycleState,
): OperatorBookingRow["status"] {
  if (dbStatus === "no_show") return "no_show";
  if (dbStatus === "cancelled") return "cancelled";
  if (dbStatus === "completed") return "completed";
  if (lifecycleState === "active") return "active";
  if (lifecycleState === "return_due") return "return_due";
  if (lifecycleState === "upcoming") return "upcoming";
  if (lifecycleState === "past_completed") return "completed";
  return "upcoming";
}

function matchesFilter(
  filter: OperatorBookingsStatusFilter,
  status: OperatorBookingRow["status"],
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "active":
      return status === "active" || status === "return_due";
    case "upcoming":
      return status === "upcoming";
    case "completed":
      return status === "completed";
    case "no-show":
      return status === "no_show";
  }
}

function sortWeight(status: OperatorBookingRow["status"]): number {
  switch (status) {
    case "active":
    case "return_due":
      return 0;
    case "upcoming":
      return 1;
    case "no_show":
      return 2;
    case "completed":
      return 3;
    case "cancelled":
      return 4;
    default:
      return 5;
  }
}

export async function fetchOperatorBookings(
  args: FetchOperatorBookingsArgs,
): Promise<Result<OperatorBookingRow[]>> {
  const { operatorId, today, statusFilter = "all" } = args;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("bookings")
    .select(
      `id, listing_id, renter_id, status, start_date, end_date, total_cents,
       stripe_payment_intent_id, stripe_extension_intent_id,
       payment_captured_at, payment_captured_cents, cancelled_at, completed_at,
       listings!inner(id, name, operator_id, pickup_location, photos),
       contracts(id, renter_phone, signed_at),
       check_ins(id)`,
    )
    .eq("listings.operator_id", operatorId)
    .neq("status", "pending")
    .neq("status", "pending_payment")
    .order("start_date", { ascending: true });

  if (error) {
    return err("DATABASE_ERROR", error.message);
  }

  const rows = (data ?? []) as unknown as RawBookingRow[];

  const getPublicUrl = (path: string): string =>
    admin.storage.from(LISTING_PHOTOS_BUCKET).getPublicUrl(path).data.publicUrl;

  const cards: OperatorBookingRow[] = [];
  for (const row of rows) {
    if (!row.listings) continue;
    if (row.listings.operator_id !== operatorId) continue;

    const lifecycle = computeRentalLifecycle(
      {
        status: row.status === "no_show" ? "confirmed" : row.status as never,
        startDate: row.start_date,
        endDate: row.end_date,
      },
      today,
    );

    const status = normalizedStatus(row.status, lifecycle.state);

    if (!matchesFilter(statusFilter, status)) continue;

    const contract = (row.contracts ?? []).find((c) => c.signed_at) ?? null;
    const renterPhone = contract?.renter_phone ?? "";
    const photos = row.listings.photos ?? [];
    const sorted = [...photos].sort((a, b) => a.position - b.position);
    const hero = sorted.find((p) => p.isHero) ?? sorted[0] ?? null;

    cards.push({
      bookingId: row.id,
      listingId: row.listing_id,
      listingName: row.listings.name,
      heroPhotoUrl: hero ? getPublicUrl(hero.path) : null,
      renterPhone,
      renterInitials: phoneInitials(renterPhone),
      renterDisplayName: formatRenterDisplayName(renterPhone),
      startDate: row.start_date,
      endDate: row.end_date,
      totalCents: row.total_cents,
      amountHeldCents:
        row.status === "cancelled" || row.status === "completed"
          ? 0
          : row.total_cents,
      amountCapturedCents: row.payment_captured_cents ?? 0,
      status,
      statusLabel: statusLabel(row.status, lifecycle.state),
      lifecycleState: row.status === "no_show" ? "no_show" : lifecycle.state,
      checkInSubmitted: (row.check_ins ?? []).length > 0,
      stripePaymentIntentId: row.stripe_payment_intent_id,
      stripeExtensionIntentId: row.stripe_extension_intent_id,
      hasContract: !!contract,
      contractId: contract?.id ?? null,
      pickupLocation: row.listings.pickup_location,
      cancelledAt: row.cancelled_at,
      completedAt: row.completed_at,
    });
  }

  cards.sort((a, b) => {
    const wa = sortWeight(a.status);
    const wb = sortWeight(b.status);
    if (wa !== wb) return wa - wb;
    return a.startDate.localeCompare(b.startDate);
  });

  return ok(cards);
}

export interface OperatorBookingDetail extends OperatorBookingRow {
  contractBody: string | null;
  contractSignedAt: string | null;
  checkInCondition: "good" | "damage" | "issue" | null;
  checkInComments: string | null;
  checkInPhotoUrls: string[];
  checkInSubmittedAt: string | null;
}

export async function fetchOperatorBookingDetail(args: {
  operatorId: string;
  bookingId: string;
  today: Date;
}): Promise<Result<OperatorBookingDetail>> {
  const { operatorId, bookingId, today } = args;
  const admin = createAdminClient();

  const { data: bookingRow, error } = await admin
    .from("bookings")
    .select(
      `id, listing_id, renter_id, status, start_date, end_date, total_cents,
       stripe_payment_intent_id, stripe_extension_intent_id,
       payment_captured_at, payment_captured_cents, cancelled_at, completed_at,
       listings!inner(id, name, operator_id, pickup_location, photos),
       contracts(id, renter_phone, signed_at, body),
       check_ins(id, condition, comments, photo_paths, created_at)`,
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (error) return err("DATABASE_ERROR", error.message);
  if (!bookingRow) return err("NOT_FOUND", "Booking not found");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = bookingRow as any;
  if (!row.listings || row.listings.operator_id !== operatorId) {
    return err("FORBIDDEN", "You do not have access to this booking");
  }

  const lifecycle = computeRentalLifecycle(
    {
      status: row.status === "no_show" ? "confirmed" : row.status,
      startDate: row.start_date,
      endDate: row.end_date,
    },
    today,
  );
  const status = normalizedStatus(row.status, lifecycle.state);

  const getPublicUrl = (path: string): string =>
    admin.storage.from(LISTING_PHOTOS_BUCKET).getPublicUrl(path).data.publicUrl;

  const getCheckInUrl = (path: string): string =>
    admin.storage.from("check-in-photos").getPublicUrl(path).data.publicUrl;

  const photos = row.listings.photos ?? [];
  const sorted = [...photos].sort(
    (a: { position: number }, b: { position: number }) => a.position - b.position,
  );
  const hero =
    sorted.find((p: { isHero: boolean }) => p.isHero) ?? sorted[0] ?? null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contract = (row.contracts ?? []).find((c: any) => c.signed_at) ?? null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const checkIn = (row.check_ins ?? [])[0] as any | undefined;

  const renterPhone = contract?.renter_phone ?? "";

  return ok({
    bookingId: row.id,
    listingId: row.listing_id,
    listingName: row.listings.name,
    heroPhotoUrl: hero ? getPublicUrl(hero.path) : null,
    renterPhone,
    renterInitials: phoneInitials(renterPhone),
    renterDisplayName: formatRenterDisplayName(renterPhone),
    startDate: row.start_date,
    endDate: row.end_date,
    totalCents: row.total_cents,
    amountHeldCents:
      row.status === "cancelled" || row.status === "completed"
        ? 0
        : row.total_cents,
    amountCapturedCents: row.payment_captured_cents ?? 0,
    status,
    statusLabel: statusLabel(row.status, lifecycle.state),
    lifecycleState: row.status === "no_show" ? "no_show" : lifecycle.state,
    checkInSubmitted: !!checkIn,
    stripePaymentIntentId: row.stripe_payment_intent_id,
    stripeExtensionIntentId: row.stripe_extension_intent_id,
    hasContract: !!contract,
    contractId: contract?.id ?? null,
    pickupLocation: row.listings.pickup_location,
    cancelledAt: row.cancelled_at,
    completedAt: row.completed_at,
    contractBody: contract?.body ?? null,
    contractSignedAt: contract?.signed_at ?? null,
    checkInCondition: checkIn?.condition ?? null,
    checkInComments: checkIn?.comments ?? null,
    checkInPhotoUrls: (checkIn?.photo_paths ?? []).map(getCheckInUrl),
    checkInSubmittedAt: checkIn?.created_at ?? null,
  });
}
