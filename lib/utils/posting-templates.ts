/**
 * Pure template generator for classifieds posting copy. Given a minimal
 * listing shape and a target platform, returns a ready-to-paste ad body
 * with the booking URL appended. No React, no Supabase, no side effects —
 * a single dev can grep this file and understand every byte.
 *
 * Story 2.5: Posting Assistant & Booking Links.
 */

export interface ListingForTemplates {
  name: string;
  description: string;
  dailyRateCents: number;
  pickupLocation: string;
}

export type PostingPlatform = "ksl" | "facebook" | "craigslist";

// TODO(2.x): Per-platform length caps if descriptions start exceeding limits.
// The Zod schema caps descriptions at 2,000 chars which is well under the
// real platform limits (KSL/Craigslist effectively unlimited, Facebook
// Marketplace ~9,999), so we intentionally do not truncate in MVP.
export function generatePostingCopy(
  listing: ListingForTemplates,
  platform: PostingPlatform,
  bookingUrl: string,
): string {
  const formattedRate = formatDailyRate(listing.dailyRateCents);

  switch (platform) {
    case "ksl":
      return buildKslCopy(listing, formattedRate, bookingUrl);
    case "facebook":
      return buildFacebookCopy(listing, formattedRate, bookingUrl);
    case "craigslist":
      return buildCraigslistCopy(listing, formattedRate, bookingUrl);
  }
}

function formatDailyRate(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function buildKslCopy(
  listing: ListingForTemplates,
  formattedRate: string,
  bookingUrl: string,
): string {
  return `For Rent: ${listing.name}

${listing.description}

Daily rate: ${formattedRate}/day
Pickup: ${listing.pickupLocation}

Book directly online with instant availability, digital contract, and secure payment hold — no phone tag, no deposit checks.

Reserve here: ${bookingUrl}`;
}

function buildFacebookCopy(
  listing: ListingForTemplates,
  formattedRate: string,
  bookingUrl: string,
): string {
  return `${listing.name} — ${formattedRate}/day

${listing.description}

Pickup in ${listing.pickupLocation}. Reserve online: ${bookingUrl}`;
}

function buildCraigslistCopy(
  listing: ListingForTemplates,
  formattedRate: string,
  bookingUrl: string,
): string {
  return `FOR RENT - ${listing.name} - ${formattedRate}/DAY

${listing.description}

PICKUP LOCATION: ${listing.pickupLocation}

BOOK ONLINE WITH INSTANT AVAILABILITY AND SECURE PAYMENT:
${bookingUrl}

(Booking link handles contract signing and payment hold — no need to call or text first.)`;
}
