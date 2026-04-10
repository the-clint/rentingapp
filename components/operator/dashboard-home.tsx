import { EmptyListingsCard } from "@/components/listing/empty-listings-card";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Async Server Component for the operator dashboard home.
 *
 * Queries the `listings` table to decide whether to render the empty state.
 * As of Story 2.1 the `public.listings` table exists (see migration
 * `00003_listings.sql`), so we no longer need the Story 1.4 temporary 42P01
 * fallback. A real query error is logged and thrown — Next.js will surface
 * it through the nearest `error.tsx` boundary.
 *
 * The current operator's email is rendered in the sidebar footer (via
 * `<OperatorUserEmail />` in the layout) — we deliberately do not duplicate
 * it here, so the dashboard performs exactly one `auth.getUser()` lookup.
 *
 * The empty-state card was extracted into
 * `@/components/listing/empty-listings-card` in Story 2.4 so it can be
 * shared with the `/listings` index page without duplication.
 */
export async function DashboardHome() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const count = await countListings(supabase, user?.id ?? null);

  if (count === 0) {
    return <EmptyListingsCard />;
  }

  return (
    <p className="text-body">
      You have <strong>{count}</strong> listing{count === 1 ? "" : "s"}.
    </p>
  );
}

async function countListings(
  supabase: SupabaseClient,
  userId: string | null,
): Promise<number> {
  if (!userId) return 0;
  // Story 2.4 review finding (L2): previously this count omitted the
  // `deleted_at IS NULL` filter, so an operator who soft-deleted their
  // only listing would still see "You have 1 listing" on the dashboard
  // while `/listings` correctly showed empty. Every listings query that
  // powers an operator-facing surface MUST filter out soft-deleted rows
  // in addition to the operator_id ownership check (the RLS SELECT
  // policy on `listings` intentionally lets operators see their own
  // soft-deleted rows so Epic 7's restore flow has something to work
  // with).
  const { count, error } = await supabase
    .from("listings")
    .select("id", { count: "exact", head: true })
    .eq("operator_id", userId)
    .is("deleted_at", null);

  if (error) {
    console.error("[dashboard-home] listings count query failed:", error);
    throw error;
  }
  return count ?? 0;
}
