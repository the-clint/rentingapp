/**
 * Renter dashboard verify page (Story 4-1).
 *
 * Mirrors `/book/[listingId]/verify` but for the manage-my-rental
 * entry point. Unauthenticated renters hitting `/rentals` are bounced
 * here; on successful OTP verify they land back at `/rentals` via the
 * existing `returnTo` prop on `RenterOtpFlow`.
 *
 * `RenterOtpFlow` was built for the booking flow and takes a
 * `listingId` — we pass an empty string because this entry point is
 * not listing-scoped. The component only uses `listingId` when
 * building a fallback next-href via `buildNextHref`, and we always
 * provide an explicit `returnTo` here so that fallback is never hit.
 */

import { Suspense } from "react";

import { RenterOtpFlow } from "@/components/booking/renter-otp-flow";

const ALLOWED_RETURN_PATHS = new Set<string>(["/rentals"]);

interface VerifyPageProps {
  searchParams: Promise<{ returnTo?: string }>;
}

async function VerifyPageBody({ searchParams }: VerifyPageProps) {
  const { returnTo } = await searchParams;
  const safeReturnTo =
    returnTo && ALLOWED_RETURN_PATHS.has(returnTo) ? returnTo : "/rentals";

  return (
    <div className="mx-auto flex max-w-[480px] flex-col gap-space-6 px-space-4 py-space-6">
      <RenterOtpFlow listingId="" returnTo={safeReturnTo} />
    </div>
  );
}

export default function VerifyPage({ searchParams }: VerifyPageProps) {
  return (
    <Suspense fallback={null}>
      <VerifyPageBody searchParams={searchParams} />
    </Suspense>
  );
}
