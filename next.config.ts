import type { NextConfig } from "next";
import { varlockNextConfigPlugin } from "@varlock/nextjs-integration/plugin";

const nextConfig: NextConfig = {
  cacheComponents: true,
  allowedDevOrigins: ["everything.test"],
  async rewrites() {
    return [
      {
        // Proxy Supabase API calls through Next.js so the browser
        // stays on the same origin (no CORS, no Kong header limits).
        source: "/supabase/:path*",
        destination: "http://127.0.0.1:54321/:path*",
      },
    ];
  },
};

// Wrap with the varlock Next.js plugin so env var loading, validation,
// and leak detection happen against `.env.schema` instead of raw `.env`
// files. This replaces Next's built-in `@next/env` loader. See
// docs/bitwarden-secrets-setup.md for the full BWS + varlock workflow.
export default varlockNextConfigPlugin()(nextConfig);
