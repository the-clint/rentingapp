import { createClient } from "@/lib/supabase/server";

/**
 * Async Server Component that resolves the current operator's email.
 *
 * Lives in its own component so the layout can wrap it in <Suspense>, which
 * Next.js 16's Cache Components mode requires whenever uncached data
 * (auth.getUser) is read inside the render tree.
 */
export async function OperatorUserEmail() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const email = data?.user?.email ?? null;
  if (!email) return null;
  return (
    <span className="block px-space-4 text-caption text-white/70 truncate">
      {email}
    </span>
  );
}
