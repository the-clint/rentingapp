import { Suspense } from "react";

import { OperatorShell } from "@/components/operator/operator-shell";
import { OperatorUserEmail } from "@/components/operator/operator-user-email";

// Auth + role check is handled by lib/supabase/proxy.ts middleware — by the
// time this layout runs, the request is guaranteed to be an operator.
//
// We deliberately do NOT call supabase.auth.getUser() here. Next.js 16's
// Cache Components mode requires uncached data to live inside a <Suspense>
// boundary, so the user email is fetched by `<OperatorUserEmail />` which
// the layout passes to the shell as a Suspense-wrapped slot.
export default function OperatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // In Next.js 16 Cache Components mode, the client-side navigation
  // components inside <OperatorShell> (sidebar + mobile tab bar) call
  // `usePathname()`, which the prerenderer treats as uncached data. For
  // dynamic routes under this group (e.g. `/listings/[listingId]`) that
  // errors out the build unless the shell is wrapped in a <Suspense>
  // boundary. Static routes still prerender fine because the pathname is
  // resolved at build time. Added in Story 2.1 so the placeholder detail
  // page can exist as a dynamic route.
  return (
    <Suspense fallback={null}>
      <OperatorShell
        userEmailSlot={
          <Suspense fallback={null}>
            <OperatorUserEmail />
          </Suspense>
        }
      >
        {children}
      </OperatorShell>
    </Suspense>
  );
}
