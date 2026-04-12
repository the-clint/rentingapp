"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  requestOtpSchema,
  verifyOtpSchema,
} from "@/lib/schemas/renter-auth-schema";
import { ok, err, type Result } from "@/lib/utils/result";

/**
 * Renter phone-OTP authentication Server Actions (Story 3-3).
 *
 * The operator auth flow lives in `auth-actions.ts`; we deliberately keep
 * renter auth separate because:
 *   - The validation schemas differ (phone vs email).
 *   - The rate-limit layer only applies to phone-OTP.
 *   - The post-auth redirect target for renters is always a booking step,
 *     not the operator dashboard.
 */

const RATE_LIMIT_WINDOW_SECONDS = 60;

export type RequestOtpError =
  | { code: "OTP_INVALID_PHONE"; message: string }
  | { code: "OTP_RATE_LIMITED"; message: string }
  | { code: "OTP_SEND_FAILED"; message: string };

export type VerifyOtpError =
  | { code: "OTP_INVALID_INPUT"; message: string }
  | { code: "OTP_INVALID_CODE"; message: string }
  | { code: "OTP_VERIFY_FAILED"; message: string };

/**
 * Request a phone-OTP text message.
 *
 * 1. Validate + normalize the phone to E.164.
 * 2. Check `otp_attempts` for any row in the last 60 seconds — if present,
 *    return `OTP_RATE_LIMITED`.
 * 3. Call `auth.signInWithOtp({ phone })` through the service-role admin
 *    client. The anon client also works for this call, but using the admin
 *    client keeps the auth surface consistent across the request/verify pair
 *    and avoids confusion about which client handles which concern.
 * 4. Insert the attempt row.
 */
export async function requestRenterOtp(
  formData: FormData,
): Promise<Result<{ phone: string }>> {
  const raw = { phone: String(formData.get("phone") ?? "") };
  const parsed = requestOtpSchema.safeParse(raw);
  if (!parsed.success) {
    return err(
      "OTP_INVALID_PHONE",
      parsed.error.issues[0]?.message ?? "Please enter a valid US phone number",
    );
  }

  const phone = parsed.data.phone;
  const admin = createAdminClient();

  const windowStart = new Date(
    Date.now() - RATE_LIMIT_WINDOW_SECONDS * 1000,
  ).toISOString();

  const { data: recentRows, error: recentError } = await admin
    .from("otp_attempts")
    .select("id, created_at")
    .eq("phone", phone)
    .gte("created_at", windowStart)
    .limit(1);

  if (recentError) {
    return err("OTP_SEND_FAILED", recentError.message);
  }
  if (recentRows && recentRows.length > 0) {
    return err(
      "OTP_RATE_LIMITED",
      "Please wait 60 seconds before requesting another code.",
    );
  }

  const { error: otpError } = await admin.auth.signInWithOtp({
    phone,
  });
  if (otpError) {
    return err("OTP_SEND_FAILED", otpError.message);
  }

  const { error: insertError } = await admin
    .from("otp_attempts")
    .insert({ phone });
  if (insertError) {
    // Non-fatal: the OTP was actually sent. Log-and-continue — the renter
    // still gets their code, and the worst case is the next retry within
    // 60s also succeeds (double-send). The upstream Twilio rate limit is
    // the safety net.
    return ok({ phone });
  }

  return ok({ phone });
}

/**
 * Verify the 6-digit OTP code and finalize the renter session.
 *
 * On success, the Supabase SSR client sets an httpOnly session cookie via
 * the cookie adapter wired in `lib/supabase/server.ts`. The `role = 'renter'`
 * claim comes from the custom access token hook in migration 00006.
 */
export async function verifyRenterOtp(
  formData: FormData,
): Promise<Result<{ userId: string }>> {
  const raw = {
    phone: String(formData.get("phone") ?? ""),
    code: String(formData.get("code") ?? ""),
  };
  const parsed = verifyOtpSchema.safeParse(raw);
  if (!parsed.success) {
    return err(
      "OTP_INVALID_INPUT",
      parsed.error.issues[0]?.message ?? "Invalid input",
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    phone: parsed.data.phone,
    token: parsed.data.code,
    type: "sms",
  });

  if (error) {
    // Supabase returns generic errors for bad OTPs; we collapse them into a
    // single renter-facing message.
    return err(
      "OTP_INVALID_CODE",
      "Invalid code, try again",
    );
  }

  if (!data.user) {
    return err("OTP_VERIFY_FAILED", "Verification did not return a session");
  }

  // Defense-in-depth: stamp app_metadata.role='renter' on the user record.
  // The JWT role claim is set by the custom access token hook (migration
  // 00006) based on auth.users.phone/email — but we also mirror it into
  // app_metadata so any tool that inspects the user record directly sees
  // the correct role. Failure here is non-fatal: the JWT is still correct.
  const existingRole =
    (data.user.app_metadata as { role?: string } | null)?.role;
  if (existingRole !== "renter") {
    const admin = createAdminClient();
    await admin.auth.admin.updateUserById(data.user.id, {
      app_metadata: { ...(data.user.app_metadata ?? {}), role: "renter" },
    });
  }

  return ok({ userId: data.user.id });
}
