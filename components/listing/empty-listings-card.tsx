import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Shared empty state rendered on the operator dashboard and the listings
 * index when the authenticated operator has zero non-deleted listings.
 * Pure Server Component — no props, no state. Copy is load-bearing and
 * must match `epics.md` verbatim.
 */
export function EmptyListingsCard() {
  return (
    <Card className="mx-auto w-full max-w-xl">
      <CardContent className="flex flex-col items-center gap-space-4 p-space-8 text-center">
        <h2 className="text-h2 lg:text-h2-lg">
          You haven&apos;t created any listings yet.
        </h2>
        <p className="text-body text-neutral-700">
          List your first piece of equipment and start getting bookings.
        </p>
        <Button asChild>
          <Link href="/listings/new">Create Listing</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
