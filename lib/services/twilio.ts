/**
 * Twilio server-side facade (Epic 6).
 *
 * The full Twilio SDK is not a MVP dependency — the real integration
 * is a thin HTTP call against the Twilio REST API. This file wraps
 * that call + signature verification so every call site goes through
 * one module. During dev / CI / tests, `TWILIO_*` env vars are
 * unset and the helpers fall back to a "stubbed delivery" path that
 * logs instead of sending, keeping the whole app functional without
 * provisioning a real Twilio account.
 */

import crypto from "node:crypto";

interface TwilioCreds {
  accountSid: string;
  authToken: string;
  fromPhone: string;
}

function loadCreds(): TwilioCreds | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromPhone = process.env.TWILIO_FROM_PHONE;
  if (!accountSid || !authToken || !fromPhone) return null;
  return { accountSid, authToken, fromPhone };
}

export interface TwilioSendResult {
  stub: boolean;
  sid: string | null;
}

export interface SendSmsInput {
  to: string;
  body: string;
}

/**
 * Send an outbound SMS. When Twilio creds are not configured, logs
 * and returns a stubbed success — the stub is explicit so tests /
 * call-site error handling can still exercise the success path.
 */
export async function sendSms(
  input: SendSmsInput,
): Promise<TwilioSendResult> {
  const creds = loadCreds();
  if (!creds) {
    console.info(
      "[twilio:stub] sendSms",
      JSON.stringify({ to: input.to, bodyPreview: input.body.slice(0, 80) }),
    );
    return { stub: true, sid: null };
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/Messages.json`;
  const auth = Buffer.from(
    `${creds.accountSid}:${creds.authToken}`,
  ).toString("base64");
  const body = new URLSearchParams({
    To: input.to,
    From: creds.fromPhone,
    Body: input.body,
  });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Twilio send failed: ${res.status} ${res.statusText} ${text}`,
    );
  }

  const data = (await res.json()) as { sid?: string };
  return { stub: false, sid: data.sid ?? null };
}

/**
 * Verify an inbound Twilio webhook request. Twilio signs the full
 * URL + sorted POST body params with the auth token (HMAC-SHA1) and
 * sends the base64 result in the `x-twilio-signature` header.
 *
 * In environments without Twilio creds the verification is bypassed
 * (dev / tests), which is noted via the returned `stubbed` flag.
 */
export interface VerifyTwilioWebhookInput {
  url: string;
  params: Record<string, string>;
  signature: string | null;
}

export interface VerifyTwilioWebhookResult {
  ok: boolean;
  stubbed: boolean;
  reason?: string;
}

export function verifyTwilioWebhook(
  input: VerifyTwilioWebhookInput,
): VerifyTwilioWebhookResult {
  const creds = loadCreds();
  if (!creds) {
    return { ok: true, stubbed: true };
  }
  if (!input.signature) {
    return { ok: false, stubbed: false, reason: "missing signature" };
  }
  // Twilio signs: URL + sorted(k+v for each param) concatenated.
  const sortedKeys = Object.keys(input.params).sort();
  let data = input.url;
  for (const k of sortedKeys) {
    data += k + input.params[k];
  }
  const expected = crypto
    .createHmac("sha1", creds.authToken)
    .update(data)
    .digest("base64");
  if (expected !== input.signature) {
    return { ok: false, stubbed: false, reason: "signature mismatch" };
  }
  return { ok: true, stubbed: false };
}
