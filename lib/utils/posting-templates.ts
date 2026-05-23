/**
 * Pure template generator for classifieds posting copy. Given a minimal
 * listing shape, returns a ready-to-paste ad body with the booking URL
 * appended — universal copy that works for KSL, Facebook Marketplace,
 * Craigslist, or any other classifieds destination.
 */

export interface ListingForTemplates {
  name: string;
  description: string;
  dailyRateCents: number;
  pickupLocation: string;
}

export function generatePostingCopy(
  listing: ListingForTemplates,
  bookingUrl: string,
): string {
  const formattedRate = formatDailyRate(listing.dailyRateCents);

  return `For Rent: ${listing.name}

${listing.description}

Daily rate: ${formattedRate}/day
Pickup: ${listing.pickupLocation}

Book directly online with instant availability, digital contract, and secure payment hold — no phone tag, no deposit checks.

Reserve here: ${bookingUrl}`;
}

function formatDailyRate(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
