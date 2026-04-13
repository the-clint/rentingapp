/**
 * Twilio inbound SMS webhook (Story 6-1).
 *
 * POST /api/webhooks/twilio
 *
 * Twilio POSTs `application/x-www-form-urlencoded` with fields
 * including `From`, `To`, `Body`, `MessageSid`, plus a signature in
 * the `x-twilio-signature` header. We verify the signature, try to
 * match the inbound `From` phone against an existing booking's
 * contract (which owns the canonical renter phone), and insert a
 * `conversations` + `messages` row via `rpc_record_inbound_message`.
 *
 * The operator-id the conversation hangs off of is resolved as
 * follows:
 *   - If the renter phone matches a `contracts.renter_phone`, pick
 *     the listing's operator.
 *   - Else: fall back to the single operator in the `profiles` table
 *     for the MVP. (Everything.Rent is solo-operator for Clint's first
 *     deployment; pre-launch for additional operators this will need
 *     a phone-number-to-operator routing table — tracked as a TODO.)
 */

import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { verifyTwilioWebhook } from "@/lib/services/twilio";

function absoluteUrl(request: NextRequest): string {
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const host = request.headers.get("host") ?? "localhost";
  return `${proto}://${host}${request.nextUrl.pathname}`;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const signature = request.headers.get("x-twilio-signature");

  const rawBody = await request.text();
  const params = Object.fromEntries(new URLSearchParams(rawBody));

  const verification = verifyTwilioWebhook({
    url: absoluteUrl(request),
    params,
    signature,
  });

  if (!verification.ok) {
    return NextResponse.json(
      { error: verification.reason ?? "invalid signature" },
      { status: 401 },
    );
  }

  const from = params.From?.trim();
  const body = params.Body?.trim();
  const messageSid = params.MessageSid?.trim() ?? "";

  if (!from || !body) {
    return NextResponse.json(
      { error: "missing From or Body" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Try to match the phone to a signed contract → booking → listing.
  const { data: contractData } = await admin
    .from("contracts")
    .select(
      `id, booking_id, listing_id,
       listings!inner(id, operator_id),
       bookings(id)`,
    )
    .eq("renter_phone", from)
    .not("signed_at", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let operatorId: string | null = null;
  let listingId: string | null = null;
  let bookingId: string | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contract = contractData as any | null;
  if (contract) {
    operatorId = contract.listings?.operator_id ?? null;
    listingId = contract.listing_id ?? null;
    bookingId = contract.booking_id ?? null;
  }

  if (!operatorId) {
    // Fallback: the solo-operator case. Pick the single operator in
    // `profiles` if there's exactly one. Returns a quiet 200 for
    // unrecognized phones against a multi-operator deployment so
    // Twilio does not retry.
    const { data: profileData } = await admin
      .from("profiles")
      .select("id")
      .limit(2);
    if (!profileData || profileData.length !== 1) {
      console.info(
        "[twilio-webhook] inbound from unrecognized phone",
        JSON.stringify({ from, sid: messageSid }),
      );
      return NextResponse.json({ received: true, stored: false });
    }
    operatorId = (profileData[0] as { id: string }).id;
  }

  const { error: rpcError } = await admin.rpc("rpc_record_inbound_message", {
    p_operator_id: operatorId,
    p_renter_phone: from,
    p_body: body,
    p_twilio_sid: messageSid,
    p_listing_id: listingId,
    p_booking_id: bookingId,
    p_platform_origin: null,
  });

  if (rpcError) {
    console.error(
      "[twilio-webhook] rpc_record_inbound_message failed",
      rpcError.message,
    );
    return NextResponse.json(
      { error: rpcError.message ?? "db error" },
      { status: 500 },
    );
  }

  // Also mirror into sms_log so the audit trail is uniform with outbound.
  await admin.from("sms_log").insert({
    direction: "inbound",
    purpose: "inbound-renter",
    phone: from,
    body,
    status: "sent",
    booking_id: bookingId,
    listing_id: listingId,
    operator_id: operatorId,
  });

  return NextResponse.json({ received: true, stored: true });
}
