"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { inquirySchema } from "@/lib/schemas/inquiry-schema";
import { verifyTurnstileToken } from "@/lib/services/turnstile";
import { err, ok, type Result } from "@/lib/utils/result";

export interface InquiryResult {
  conversationId: string;
}

export async function submitInquiry(input: {
  listingId: string;
  phone: string;
  message: string;
  turnstileToken: string;
}): Promise<Result<InquiryResult>> {
  const parsed = inquirySchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return err("VALIDATION_ERROR", first?.message ?? "Invalid input");
  }

  const { listingId, phone, message, turnstileToken } = parsed.data;

  const captchaResult = await verifyTurnstileToken(turnstileToken);
  if (!captchaResult.success) {
    return err(captchaResult.error.code, captchaResult.error.message);
  }

  const admin = createAdminClient();

  const { data: listing, error: listingError } = await admin
    .from("listings")
    .select("id, operator_id, status, deleted_at")
    .eq("id", listingId)
    .maybeSingle();

  if (listingError) {
    return err("DATABASE_ERROR", listingError.message);
  }
  if (!listing || listing.status !== "published" || listing.deleted_at) {
    return err("NOT_FOUND", "Listing not found");
  }

  const { data: rpcResult, error: rpcError } = await admin.rpc(
    "rpc_record_inbound_message",
    {
      p_operator_id: listing.operator_id,
      p_renter_phone: phone,
      p_body: message,
      p_twilio_sid: null,
      p_listing_id: listingId,
      p_booking_id: null,
      p_platform_origin: "direct",
    },
  );

  if (rpcError) {
    return err("DATABASE_ERROR", rpcError.message);
  }

  const row = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult;
  const conversationId = row?.conversation_id as string;

  await admin.from("sms_log").insert({
    direction: "inbound",
    purpose: "pre-booking-inquiry",
    phone,
    body: message,
    status: "sent",
    operator_id: listing.operator_id,
    listing_id: listingId,
  });

  return ok({ conversationId });
}
