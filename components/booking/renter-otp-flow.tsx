"use client";

/**
 * Renter phone OTP verification flow (Story 3-3).
 *
 * A single Client Component that owns two visual steps:
 *   1. Phone entry: auto-formats as `(801) 555-1234`, "Send Code" enabled on
 *      valid 10-digit, calls `requestRenterOtp`.
 *   2. OTP entry: 6 individual boxes, auto-advance on each digit, auto-submit
 *      on the 6th, 5-minute countdown, "Resend code" link after 30 s,
 *      destructive shake + clear on error, success flash on verify.
 *
 * Selection state (start / end dates) is carried through the URL from the
 * booking sticky bar so the verify page is deep-linkable. On successful
 * verify we `router.push('/book/{listingId}/contract?...')` to hand off to
 * Story 3-4.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BookingStepIndicator,
  type BookingStep,
} from "@/components/booking/booking-step-indicator";
import {
  requestRenterOtp,
  verifyRenterOtp,
} from "@/lib/actions/renter-auth-actions";
import {
  formatPhoneDisplay,
  toE164US,
} from "@/lib/schemas/renter-auth-schema";
import { cn } from "@/lib/utils";

const OTP_LENGTH = 6;
const EXPIRY_SECONDS = 5 * 60;
const RESEND_ENABLE_SECONDS = 30;

export interface RenterOtpFlowProps {
  listingId: string;
  start?: string;
  end?: string;
}

type UiStep = "phone" | "otp";

function buildNextHref(
  listingId: string,
  start: string | undefined,
  end: string | undefined,
): string {
  const params = new URLSearchParams();
  if (start) params.set("start", start);
  if (end) params.set("end", end);
  const qs = params.toString();
  return `/book/${listingId}/contract${qs ? `?${qs}` : ""}`;
}

export function RenterOtpFlow({ listingId, start, end }: RenterOtpFlowProps) {
  const router = useRouter();
  const [step, setStep] = useState<UiStep>("phone");
  const [phoneRaw, setPhoneRaw] = useState("");
  const [phoneE164, setPhoneE164] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [otpDigits, setOtpDigits] = useState<string[]>(() =>
    Array.from({ length: OTP_LENGTH }, () => ""),
  );
  const [otpError, setOtpError] = useState<string | null>(null);
  const [isShaking, setIsShaking] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(EXPIRY_SECONDS);
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [isResending, setIsResending] = useState(false);

  const inputRefs = useRef<Array<HTMLInputElement | null>>(
    Array.from({ length: OTP_LENGTH }, () => null),
  );

  const currentStepForIndicator: BookingStep = "verify";
  const canSendCode = useMemo(() => toE164US(phoneRaw) !== null, [phoneRaw]);

  // Countdown timer for the OTP step.
  useEffect(() => {
    if (step !== "otp" || sentAt == null) return;
    const tick = () => {
      const elapsed = Math.floor((Date.now() - sentAt) / 1000);
      setSecondsRemaining(Math.max(0, EXPIRY_SECONDS - elapsed));
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [step, sentAt]);

  const handlePhoneChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setPhoneRaw(formatPhoneDisplay(e.target.value));
    setServerError(null);
  }, []);

  const handleSendCode = useCallback(async () => {
    setServerError(null);
    if (!canSendCode) return;
    const normalized = toE164US(phoneRaw);
    if (!normalized) return;

    setIsSubmitting(true);
    const fd = new FormData();
    fd.append("phone", normalized);
    const result = await requestRenterOtp(fd);
    setIsSubmitting(false);
    if (!result.success) {
      setServerError(result.error.message);
      return;
    }
    setPhoneE164(result.data.phone);
    setStep("otp");
    setOtpDigits(Array.from({ length: OTP_LENGTH }, () => ""));
    setSentAt(Date.now());
    setSecondsRemaining(EXPIRY_SECONDS);
    setOtpError(null);
    // Focus the first box on next tick so the DOM is mounted.
    window.setTimeout(() => inputRefs.current[0]?.focus(), 0);
  }, [canSendCode, phoneRaw]);

  const handleResend = useCallback(async () => {
    if (!phoneE164 || isResending) return;
    setOtpError(null);
    setServerError(null);
    setIsResending(true);
    const fd = new FormData();
    fd.append("phone", phoneE164);
    const result = await requestRenterOtp(fd);
    setIsResending(false);
    if (!result.success) {
      setOtpError(result.error.message);
      return;
    }
    setOtpDigits(Array.from({ length: OTP_LENGTH }, () => ""));
    setSentAt(Date.now());
    setSecondsRemaining(EXPIRY_SECONDS);
    inputRefs.current[0]?.focus();
  }, [phoneE164, isResending]);

  const submitOtp = useCallback(
    async (code: string) => {
      if (!phoneE164 || code.length !== OTP_LENGTH) return;
      setIsSubmitting(true);
      const fd = new FormData();
      fd.append("phone", phoneE164);
      fd.append("code", code);
      const result = await verifyRenterOtp(fd);
      setIsSubmitting(false);
      if (!result.success) {
        setOtpError("Invalid code, try again");
        setIsShaking(true);
        window.setTimeout(() => setIsShaking(false), 400);
        setOtpDigits(Array.from({ length: OTP_LENGTH }, () => ""));
        inputRefs.current[0]?.focus();
        return;
      }
      setIsSuccess(true);
      setOtpError(null);
      // Give the success flash a beat before navigating.
      window.setTimeout(() => {
        router.push(buildNextHref(listingId, start, end));
      }, 400);
    },
    [phoneE164, router, listingId, start, end],
  );

  const otpDigitsRef = useRef(otpDigits);
  otpDigitsRef.current = otpDigits;

  const handleOtpChange = useCallback(
    (index: number, rawValue: string) => {
      // Allow paste-of-6: when the input receives more than one char, spread
      // the digits across subsequent boxes starting at `index`.
      const digitsOnly = rawValue.replace(/\D/g, "");
      if (digitsOnly.length === 0) {
        const cleared = [...otpDigitsRef.current];
        cleared[index] = "";
        otpDigitsRef.current = cleared;
        setOtpDigits(cleared);
        setOtpError(null);
        return;
      }
      const next = [...otpDigitsRef.current];
      let cursor = index;
      for (const ch of digitsOnly) {
        if (cursor >= OTP_LENGTH) break;
        next[cursor] = ch;
        cursor += 1;
      }
      otpDigitsRef.current = next;
      setOtpDigits(next);
      setOtpError(null);
      const lastFilled = Math.min(cursor, OTP_LENGTH - 1);
      window.setTimeout(() => {
        if (cursor < OTP_LENGTH) {
          inputRefs.current[cursor]?.focus();
        } else {
          inputRefs.current[lastFilled]?.blur();
        }
      }, 0);
      const joined = next.join("");
      if (next.every((d) => d.length === 1)) {
        void submitOtp(joined);
      }
    },
    [submitOtp],
  );

  const handleOtpKeyDown = useCallback(
    (index: number, e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Backspace") {
        setOtpDigits((prev) => {
          const next = [...prev];
          if (next[index]) {
            next[index] = "";
          } else if (index > 0) {
            next[index - 1] = "";
            window.setTimeout(
              () => inputRefs.current[index - 1]?.focus(),
              0,
            );
          }
          return next;
        });
      } else if (e.key === "ArrowLeft" && index > 0) {
        inputRefs.current[index - 1]?.focus();
      } else if (e.key === "ArrowRight" && index < OTP_LENGTH - 1) {
        inputRefs.current[index + 1]?.focus();
      }
    },
    [],
  );

  const handleOtpPaste = useCallback(
    (index: number, e: ClipboardEvent<HTMLInputElement>) => {
      const text = e.clipboardData.getData("text");
      if (!text) return;
      e.preventDefault();
      handleOtpChange(index, text);
    },
    [handleOtpChange],
  );

  const canResend =
    sentAt != null && EXPIRY_SECONDS - secondsRemaining >= RESEND_ENABLE_SECONDS;

  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const countdownLabel = `${minutes}:${seconds.toString().padStart(2, "0")}`;

  return (
    <div className="flex flex-col gap-space-6">
      <BookingStepIndicator currentStep={currentStepForIndicator} />

      {step === "phone" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSendCode();
          }}
          className="flex flex-col gap-space-4"
          aria-label="Phone number verification"
        >
          <div className="flex flex-col gap-space-2">
            <h1 className="text-h2 font-semibold text-neutral-900">
              Enter your phone number to continue
            </h1>
            <p className="text-small text-neutral-700">
              We&apos;ll text you a 6-digit code to verify your number. No
              account needed.
            </p>
          </div>

          <label className="flex flex-col gap-space-2">
            <span className="text-small font-medium text-neutral-900">
              Phone number
            </span>
            <div className="flex items-center gap-space-2">
              <span
                aria-hidden="true"
                className="flex h-9 items-center rounded-md border border-input bg-neutral-100 px-space-3 text-small text-neutral-700"
              >
                +1
              </span>
              <Input
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                placeholder="(801) 555-1234"
                value={phoneRaw}
                onChange={handlePhoneChange}
                aria-invalid={serverError ? "true" : undefined}
                aria-describedby={serverError ? "phone-error" : undefined}
                data-testid="phone-input"
              />
            </div>
          </label>

          {serverError && (
            <p
              id="phone-error"
              role="alert"
              className="text-small text-destructive"
            >
              {serverError}
            </p>
          )}

          <Button
            type="submit"
            disabled={!canSendCode || isSubmitting}
            data-testid="send-code-button"
          >
            {isSubmitting ? "Sending…" : "Send Code"}
          </Button>
        </form>
      )}

      {step === "otp" && (
        <div className="flex flex-col gap-space-4" aria-live="polite">
          <div className="flex flex-col gap-space-2">
            <h1 className="text-h2 font-semibold text-neutral-900">
              Enter the code we texted you
            </h1>
            <p className="text-small text-neutral-700">
              Sent to{" "}
              <span className="font-medium text-neutral-900">
                {phoneE164 ? formatE164Display(phoneE164) : ""}
              </span>
              .{" "}
              <button
                type="button"
                className="text-primary-dark underline"
                onClick={() => setStep("phone")}
              >
                Change
              </button>
            </p>
          </div>

          <div
            data-testid="otp-boxes"
            className={cn(
              "flex items-center justify-between gap-space-2",
              isShaking && "animate-otp-shake",
            )}
          >
            {otpDigits.map((digit, i) => (
              <input
                key={i}
                ref={(el) => {
                  inputRefs.current[i] = el;
                }}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={OTP_LENGTH}
                value={digit}
                onChange={(e) => handleOtpChange(i, e.target.value)}
                onKeyDown={(e) => handleOtpKeyDown(i, e)}
                onPaste={(e) => handleOtpPaste(i, e)}
                aria-label={`Digit ${i + 1} of ${OTP_LENGTH}`}
                data-testid={`otp-digit-${i}`}
                className={cn(
                  "h-14 w-12 rounded-md border text-center text-h2 font-semibold shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  otpError && !isSuccess && "border-destructive text-destructive",
                  isSuccess && "border-success text-success",
                  !otpError && !isSuccess && "border-input text-neutral-900",
                )}
              />
            ))}
          </div>

          {otpError && (
            <p role="alert" className="text-small text-destructive">
              {otpError}
            </p>
          )}

          <div className="flex items-center justify-between text-small text-neutral-700">
            <span data-testid="otp-countdown">Code expires in {countdownLabel}</span>
            <button
              type="button"
              onClick={() => void handleResend()}
              disabled={!canResend || isResending}
              className={cn(
                "font-medium",
                canResend && !isResending
                  ? "text-primary-dark underline"
                  : "text-neutral-500",
              )}
              data-testid="resend-button"
            >
              {isResending ? "Resending…" : "Resend code"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatE164Display(e164: string): string {
  // `+18015551234` → `+1 (801) 555-1234`
  if (e164.startsWith("+1") && e164.length === 12) {
    return `+1 (${e164.slice(2, 5)}) ${e164.slice(5, 8)}-${e164.slice(8)}`;
  }
  return e164;
}
