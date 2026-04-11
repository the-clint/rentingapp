"use server";

/**
 * Renter privacy Server Actions (Story 7-1).
 *
 * `disassociateRenterHistory()` marks every booking owned by the
 * current renter as hidden-from-dashboard. The rows are NOT deleted —
 * the operator-side views continue to see them with the original
 * renter phone number intact, tagged "disassociated" in the UI.
 *
 * Callable only by an authenticated renter session. Returns a
 * `Result<{ count }>` so the UI can confirm how many rows were
 * hidden.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { err, ok, type Result } from "@/lib/utils/result";

export interface DisassociateRenterHistoryResult {
  count: number;
}

async function getRenterSession(): Promise<{ userId: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  if (!user.phone) return null;
  const role = (user.app_metadata as { role?: string } | null)?.role;
  if (role && role !== "renter") return null;
  return { userId: user.id };
}

export async function disassociateRenterHistory(): Promise<
  Result<DisassociateRenterHistoryResult>
> {
  const session = await getRenterSession();
  if (!session) {
    return err(
      "UNAUTHENTICATED",
      "Please verify your phone to continue",
    ) as Result<DisassociateRenterHistoryResult>;
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data, error } = await admin
    .from("bookings")
    .update({ renter_dashboard_hidden_at: nowIso })
    .eq("renter_id", session.userId)
    .is("renter_dashboard_hidden_at", null)
    .select("id");

  if (error) {
    return err(
      "DATABASE_ERROR",
      error.message,
    ) as Result<DisassociateRenterHistoryResult>;
  }

  return ok({ count: (data ?? []).length });
}
