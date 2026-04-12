import { z } from "zod";

/**
 * Renter phone OTP authentication schemas (Story 3-3).
 *
 * US-only MVP: we accept exactly 10 digits (after stripping formatting) and
 * normalize to E.164 format (`+1XXXXXXXXXX`) before handing off to
 * Supabase Auth. A hand-rolled regex keeps the dependency surface small;
 * if the product ever needs non-US phone support, swap in libphonenumber-js.
 */

const DIGITS_ONLY = /^\d+$/;

/**
 * Strip every non-digit from a raw phone input. Leading `+1` and spaces,
 * parens, dashes all fall away.
 */
export function stripPhoneFormatting(raw: string): string {
  return raw.replace(/\D/g, "");
}

/**
 * Normalize a 10-digit or 11-digit (leading 1) phone string to E.164 US.
 * Returns `null` when the input is not a valid US phone.
 */
export function toE164US(raw: string): string | null {
  const digits = stripPhoneFormatting(raw);
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

/**
 * Format a digit string (1-10 chars) into `(801) 555-1234` incrementally.
 * Used by the phone input to progressively format as the renter types.
 */
export function formatPhoneDisplay(raw: string): string {
  const digits = stripPhoneFormatting(raw).slice(0, 10);
  if (digits.length === 0) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export const phoneNumberSchema = z
  .string()
  .min(1, "Phone number is required")
  .transform((raw) => toE164US(raw))
  .refine((value): value is string => value !== null, {
    message: "Please enter a valid US phone number",
  });

export const requestOtpSchema = z.object({
  phone: phoneNumberSchema,
});

export const otpCodeSchema = z
  .string()
  .trim()
  .refine((value) => value.length === 6 && DIGITS_ONLY.test(value), {
    message: "Enter the 6-digit code from your text message",
  });

export const verifyOtpSchema = z.object({
  phone: phoneNumberSchema,
  code: otpCodeSchema,
});

export type RequestOtpInput = z.infer<typeof requestOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
