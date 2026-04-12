/**
 * Data retention sweep endpoint (Story 7-2).
 *
 * POST /api/cron/retention
 *
 * Runs `purgeExpiredRecords` once per day via the operator's cron
 * scheduler. Guarded by the same `CRON_SHARED_SECRET` header as the
 * return-reminder endpoint.
 */

import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { purgeExpiredRecords } from "@/lib/services/data-retention";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SHARED_SECRET;
  if (secret) {
    if (request.headers.get("x-cron-secret") !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const result = await purgeExpiredRecords(createAdminClient(), new Date());
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
