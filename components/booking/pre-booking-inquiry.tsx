"use client";

import { useCallback, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { MessageCircleQuestion, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { submitInquiry } from "@/lib/actions/inquiry-actions";
import {
  formatPhoneDisplay,
  stripPhoneFormatting,
} from "@/lib/schemas/renter-auth-schema";

export interface PreBookingInquiryProps {
  listingId: string;
}

export function PreBookingInquiry({ listingId }: PreBookingInquiryProps) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const turnstileRef = useRef<TurnstileInstance | null>(null);

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  const phoneDigits = stripPhoneFormatting(phone);
  const canSubmit =
    phoneDigits.length === 10 &&
    message.trim().length > 0 &&
    (turnstileToken !== null || !siteKey) &&
    !sending;

  const handlePhoneChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setPhone(formatPhoneDisplay(e.target.value));
  }, []);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!canSubmit) return;

      setSending(true);
      setError(null);

      const result = await submitInquiry({
        listingId,
        phone,
        message: message.trim(),
        turnstileToken: turnstileToken ?? "",
      });

      setSending(false);

      if (result.success) {
        setSent(true);
      } else {
        setError(result.error.message);
        turnstileRef.current?.reset();
        setTurnstileToken(null);
      }
    },
    [canSubmit, listingId, phone, message, turnstileToken],
  );

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-space-2 rounded-lg border border-border bg-card p-space-4 text-center">
        <CheckCircle2 className="h-8 w-8 text-green-600" aria-hidden="true" />
        <p className="text-body font-semibold text-neutral-900">Message sent!</p>
        <p className="text-small text-neutral-700">
          The owner will reply by text to your phone.
        </p>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-space-2 rounded-lg border border-border bg-card px-space-4 py-space-3 text-body font-medium text-neutral-900 transition-colors hover:bg-muted"
      >
        <MessageCircleQuestion className="h-5 w-5 shrink-0" aria-hidden="true" />
        Have a question? Contact the owner
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-space-3 rounded-lg border border-border bg-card p-space-4"
    >
      <h3 className="text-h3 font-semibold text-neutral-900">
        Ask the owner a question
      </h3>

      <div className="flex flex-col gap-space-1">
        <label htmlFor="inquiry-phone" className="text-small font-medium text-neutral-900">
          Your phone number
        </label>
        <Input
          id="inquiry-phone"
          type="tel"
          inputMode="numeric"
          placeholder="(801) 555-1234"
          value={phone}
          onChange={handlePhoneChange}
          autoComplete="tel-national"
        />
      </div>

      <div className="flex flex-col gap-space-1">
        <label htmlFor="inquiry-message" className="text-small font-medium text-neutral-900">
          Your question
        </label>
        <Textarea
          id="inquiry-message"
          placeholder="What would you like to know?"
          value={message}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setMessage(e.target.value)}
          rows={3}
          maxLength={1600}
        />
      </div>

      {siteKey ? (
        <Turnstile
          siteKey={siteKey}
          onSuccess={setTurnstileToken}
          onError={() => setTurnstileToken(null)}
          onExpire={() => setTurnstileToken(null)}
          ref={(instance) => { turnstileRef.current = instance ?? null; }}
        />
      ) : null}

      {error ? (
        <p role="alert" className="text-small text-destructive">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={!canSubmit} className="w-full">
        {sending ? "Sending…" : "Send Message"}
      </Button>
    </form>
  );
}
