import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";
import { formatRelativeTime } from "@/lib/utils/relative-time";

export interface ListingCardProps {
  id: string;
  name: string;
  dailyRateCents: number;
  pickupLocation: string;
  heroUrl: string;
  createdAtIso: string;
}

/**
 * Pure Server Component — a single card in the listings index grid. The
 * outer `<Link>` is the only click target; the card is otherwise
 * non-interactive so it ships zero hydration cost. `heroUrl` is resolved
 * by the parent page component so this card does not touch Supabase.
 */
export function ListingCard({
  id,
  name,
  dailyRateCents,
  pickupLocation,
  heroUrl,
  createdAtIso,
}: ListingCardProps) {
  const dailyRate = `$${(dailyRateCents / 100).toFixed(2)} / day`;

  return (
    <Link href={`/listings/${id}`} className="group block">
      <Card className="overflow-hidden transition group-hover:shadow-md">
        <div className="relative aspect-[4/3] bg-neutral-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={heroUrl}
            alt={name}
            className="h-full w-full object-cover"
          />
        </div>
        <CardContent className="flex flex-col gap-space-2 p-space-4">
          <h2 className="text-h2 truncate">{name}</h2>
          <p className="text-body font-medium">{dailyRate}</p>
          <p className="text-body text-neutral-700 truncate">
            {pickupLocation}
          </p>
          <p className="text-sm text-neutral-600">
            Created {formatRelativeTime(createdAtIso)}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
