/**
 * Warm-tinted dashboard skeleton used as the Suspense fallback for
 * `<DashboardHome />`. Matches the approximate layout dimensions so the
 * transition to the real content does not cause visible layout shift.
 */
export function DashboardSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading dashboard"
      className="flex flex-col gap-space-6 animate-pulse"
    >
      {/* Welcome line */}
      <div className="h-4 w-64 rounded bg-primary-light/30" />

      {/* Empty-state / content card placeholder */}
      <div className="rounded-xl border border-primary-light/30 bg-primary-light/30 p-space-8">
        <div className="h-6 w-80 rounded bg-primary-light/50 mb-space-4" />
        <div className="h-4 w-96 max-w-full rounded bg-primary-light/50 mb-space-6" />
        <div className="h-12 w-40 rounded bg-primary-light/60" />
      </div>
    </div>
  );
}
