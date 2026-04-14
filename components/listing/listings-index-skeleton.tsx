import { Card } from "@/components/ui/card";

/**
 * Suspense fallback for the operator listings index page. Three placeholder
 * cards laid out in the same responsive grid as the real content so the
 * transition does not cause visible layout shift. Presentational-only —
 * `aria-hidden` on the outer wrapper tells SRs to skip the pulsing UI.
 */
export function ListingsIndexSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="grid gap-space-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
    >
      {[0, 1, 2].map((i) => (
        <Card key={i} className="overflow-hidden">
          <div className="aspect-[4/3] bg-muted animate-pulse" />
          <div className="p-space-4 flex flex-col gap-space-2">
            <div className="h-4 bg-muted animate-pulse rounded" />
            <div className="h-4 bg-muted animate-pulse rounded" />
            <div className="h-4 bg-muted animate-pulse rounded" />
          </div>
        </Card>
      ))}
    </div>
  );
}
