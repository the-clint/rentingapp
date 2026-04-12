/**
 * Return-reminder cron endpoint (Story 4-5).
 *
 * POST /api/cron/return-reminders
 *
 * Expected caller: a scheduled job (Vercel Cron, Supabase pg_cron,
 * Cloudflare Workers Cron, etc.) that fires once a day at the right
 * local time for the operator market. The endpoint is idempotent by
 * day per booking thanks to the unique partial index on
 * `sms_log (booking_id, purpose, created_at::date) WHERE purpose =
 * 'return-reminder'` — double-firing just reports skipped bookings.
 *
 * Auth: a shared secret in the `x-cron-secret` header, compared
 * against `CRON_SHARED_SECRET`. In local dev without the env var set
 * the endpoint is still callable to simplify smoke-testing. Never
 * wire this to an unauthenticated public surface in production.
 */

import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchReturnReminders } from "@/lib/services/return-reminders";

function todayIso(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SHARED_SECRET;
  if (secret) {
    const provided = request.headers.get("x-cron-secret");
    if (provided !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const publicBaseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://rentingapp.local";

  try {
    const result = await dispatchReturnReminders({
      admin: createAdminClient(),
      today: todayIso(),
      publicBaseUrl,
    });
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    console.error("[cron:return-reminders] dispatch failed", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
