"use client";

import Link from "next/link";
import { Pencil, CalendarDays } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DeleteListingDialog } from "@/components/listing/delete-listing-dialog";
import { PostingAssistantDialog } from "@/components/listing/posting-assistant-dialog";

export interface ListingDetailPhoto {
  path: string;
  isHero: boolean;
  position: number;
  url: string;
}

export interface ListingDetailViewData {
  id: string;
  name: string;
  description: string;
  daily_rate_cents: number;
  pickup_location: string;
  pickup_instructions: string | null;
  photos: ListingDetailPhoto[];
  ad_copy: string | null;
}

interface ListingDetailViewProps {
  listing: ListingDetailViewData;
  bookingUrl: string;
  initialAssistantOpen?: boolean;
}

function formatDailyRate(cents: number): string {
  return `$${(cents / 100).toFixed(2)} / day`;
}

/**
 * Presentational view for an operator's listing detail page. Receives fully
 * resolved photo URLs from the parent Server Component so the component
 * itself can stay on the client (the `DeleteListingDialog` requires a
 * client boundary).
 */
export function ListingDetailView({
  listing,
  bookingUrl,
  initialAssistantOpen = false,
}: ListingDetailViewProps) {
  const sorted = [...listing.photos].sort((a, b) => a.position - b.position);
  const hero = sorted.find((p) => p.isHero) ?? sorted[0];
  const showGrid = sorted.length > 1;

  return (
    <div className="flex flex-col gap-space-6">
      {showGrid ? (
        <ul
          aria-label={`${listing.name} photos`}
          className="grid grid-cols-2 gap-space-2 sm:grid-cols-3"
        >
          {sorted.map((photo, i) => (
            <li
              key={photo.path}
              className="overflow-hidden rounded-md border border-border bg-neutral-100"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.url}
                alt={`${listing.name} photo ${i + 1}`}
                className="aspect-square w-full object-cover"
              />
            </li>
          ))}
        </ul>
      ) : (
        hero && (
          <div className="overflow-hidden rounded-lg border border-border bg-neutral-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={hero.url}
              alt={listing.name}
              className="aspect-video w-full object-cover"
            />
          </div>
        )
      )}

      <div className="flex flex-wrap gap-space-2">
        <Button asChild>
          <Link href={`/listings/${listing.id}/edit`}>
            <Pencil className="h-4 w-4" aria-hidden="true" />
            Edit
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/listings/${listing.id}/availability`}>
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            Manage availability
          </Link>
        </Button>
        <PostingAssistantDialog
          listing={{
            name: listing.name,
            description: listing.description,
            daily_rate_cents: listing.daily_rate_cents,
            pickup_location: listing.pickup_location,
          }}
          bookingUrl={bookingUrl}
          listingId={listing.id}
          savedAdCopy={listing.ad_copy}
          initialOpen={initialAssistantOpen}
        />
        <DeleteListingDialog
          listingId={listing.id}
          listingName={listing.name}
        />
      </div>

      <dl className="grid gap-space-3">
        <div>
          <dt className="text-sm font-medium text-neutral-500">Daily rate</dt>
          <dd className="text-body font-semibold">
            {formatDailyRate(listing.daily_rate_cents)}
          </dd>
        </div>
        <div>
          <dt className="text-sm font-medium text-neutral-500">Pickup location</dt>
          <dd className="text-body">{listing.pickup_location}</dd>
        </div>
        {listing.pickup_instructions && listing.pickup_instructions.length > 0 && (
          <div>
            <dt className="text-sm font-medium text-neutral-500">
              Pickup instructions
            </dt>
            <dd className="whitespace-pre-wrap text-body">
              {listing.pickup_instructions}
            </dd>
          </div>
        )}
        <div>
          <dt className="text-sm font-medium text-neutral-500">Description</dt>
          <dd className="whitespace-pre-wrap text-body">{listing.description}</dd>
        </div>
      </dl>
    </div>
  );
}
