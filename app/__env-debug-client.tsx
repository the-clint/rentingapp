"use client";

export function EnvDebugClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
  return (
    <pre
      style={{
        background: "#1a1a1a",
        color: "#7fffd4",
        padding: "1rem",
        fontSize: "13px",
        whiteSpace: "pre-wrap",
        wordBreak: "break-all",
      }}
    >
      {JSON.stringify(
        {
          source: "client (inlined into bundle at next build)",
          NEXT_PUBLIC_SUPABASE_URL: url ?? "<undefined>",
          NEXT_PUBLIC_SUPABASE_URL_length: url?.length ?? 0,
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY: key ?? "<undefined>",
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY_length: key?.length ?? 0,
        },
        null,
        2,
      )}
    </pre>
  );
}
