import Link from "next/link";

import { signOut } from "@/lib/actions/auth-actions";

/**
 * Mobile "More" landing page. Primarily used by the mobile tab bar; desktop
 * users navigating here see the same content (no special hiding needed).
 */
export function MorePage() {
  return (
    <div className="flex flex-col gap-space-6">
      <h1 className="text-h1 lg:text-h1-lg">More</h1>
      <nav aria-label="More options" className="flex flex-col gap-space-2">
        <Link
          href="/dashboard"
          className="flex items-center justify-between rounded-md border border-neutral-300 bg-white px-space-4 py-space-4 text-body font-medium text-neutral-900 hover:bg-neutral-100"
        >
          Dashboard
        </Link>
        <Link
          href="/settings"
          className="flex items-center justify-between rounded-md border border-neutral-300 bg-white px-space-4 py-space-4 text-body font-medium text-neutral-900 hover:bg-neutral-100"
        >
          Settings
        </Link>
        <form action={signOut}>
          <button
            type="submit"
            className="flex w-full items-center justify-between rounded-md border border-neutral-300 bg-white px-space-4 py-space-4 text-left text-body font-medium text-neutral-900 hover:bg-neutral-100"
          >
            Sign out
          </button>
        </form>
      </nav>
    </div>
  );
}

export default MorePage;
