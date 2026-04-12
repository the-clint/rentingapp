import { createClient } from "@/lib/supabase/server";

import { RealtimeNotifications } from "./realtime-notifications";

/**
 * Server wrapper that looks up the current operator's id and
 * mounts the client-side Realtime subscriber (Story 6-5). Rendered
 * from the operator layout inside a Suspense boundary so the first
 * paint is never blocked on `auth.getUser`.
 */
export async function RealtimeNotificationsHost() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return <RealtimeNotifications operatorId={user.id} />;
}
