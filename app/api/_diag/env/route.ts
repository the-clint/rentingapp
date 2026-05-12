import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return "INVALID_URL";
  }
}

export async function GET() {
  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

  const report = {
    appEnv: process.env.APP_ENV ?? null,
    nodeEnv: process.env.NODE_ENV ?? null,
    supabaseUrl: {
      present: Boolean(supabaseUrl),
      host: hostOf(supabaseUrl),
    },
    publishableKey: {
      present: Boolean(publishableKey),
      length: publishableKey?.length ?? 0,
      prefix: publishableKey ? publishableKey.slice(0, 8) : null,
    },
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? null,
  };

  let reachable: { ok: boolean; status?: number; error?: string } = {
    ok: false,
    error: "not-attempted",
  };
  if (supabaseUrl) {
    try {
      const res = await fetch(`${supabaseUrl}/auth/v1/health`, {
        headers: publishableKey ? { apikey: publishableKey } : {},
      });
      reachable = { ok: res.ok, status: res.status };
    } catch (e) {
      reachable = {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  return NextResponse.json({ ...report, reachable });
}
