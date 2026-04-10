/**
 * Skeleton placeholder for the availability calendar page body. Used by the
 * `<Suspense>` boundary on the operator availability page and by the
 * `loading.tsx` route fallback.
 */
export function CalendarSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading availability calendar"
      className="flex flex-col gap-space-4 animate-pulse"
    >
      <div className="h-4 w-40 rounded bg-primary-light/30" />
      <div className="rounded-xl border border-primary-light/30 bg-primary-light/20 p-space-6">
        <div className="mb-space-4 h-6 w-32 rounded bg-primary-light/40" />
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: 42 }).map((_, i) => (
            <div key={i} className="h-11 w-full rounded bg-primary-light/30" />
          ))}
        </div>
      </div>
    </div>
  );
}
