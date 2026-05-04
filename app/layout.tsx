import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import { EnvDebugClient } from "./__env-debug-client";

const defaultUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.URL ||
  "http://everything.test";

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: "Everything.Rent",
  description:
    "Everything.Rent — list, book, and manage equipment rentals with ease",
};

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-inter",
});

export function RootLayout({
  children: _children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // TEMP DIAGNOSTIC: dump what the app actually sees for the Supabase
  // public env vars after Netlify build + runtime, then halt before any
  // other code can run. Remove once diagnosed.
  const serverUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serverKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
  const serverDump = {
    source: "server (process.env at function runtime)",
    APP_ENV: process.env.APP_ENV ?? "<undefined>",
    NETLIFY: process.env.NETLIFY ?? "<undefined>",
    CONTEXT: process.env.CONTEXT ?? "<undefined>",
    NEXT_PUBLIC_SUPABASE_URL: serverUrl ?? "<undefined>",
    NEXT_PUBLIC_SUPABASE_URL_length: serverUrl?.length ?? 0,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY: serverKey ?? "<undefined>",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY_length: serverKey?.length ?? 0,
  };
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <h1 style={{ fontFamily: "monospace", padding: "1rem" }}>
          ENV DEBUG — app halted before rendering
        </h1>
        <pre
          style={{
            background: "#1a1a1a",
            color: "#ffd27f",
            padding: "1rem",
            fontSize: "13px",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
          }}
        >
          {JSON.stringify(serverDump, null, 2)}
        </pre>
        <EnvDebugClient />
      </body>
    </html>
  );
}

export default RootLayout;
