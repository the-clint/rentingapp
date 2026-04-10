import { Suspense } from "react";

import { RenterOtpFlow } from "@/components/booking/renter-otp-flow";
import { sanitizeRenterBookingReturnTo } from "@/lib/utils/safe-redirect";

interface VerifyPageProps {
  params: Promise<{ listingId: string }>;
  searchParams: Promise<{
    start?: string;
    end?: string;
    returnTo?: string;
  }>;
}

async function VerifyPageBody({ params, searchParams }: VerifyPageProps) {
  const { listingId } = await params;
  const { start, end, returnTo } = await searchParams;

  // Story 3-6: `returnTo` is only honored if it points back into this
  // same listing's booking flow. Anything else is silently ignored and
  // we fall through to the default contract redirect.
  const safeReturnTo = sanitizeRenterBookingReturnTo(listingId, returnTo);

  return (
    <div className="mx-auto flex max-w-[480px] flex-col gap-space-6 px-space-4 py-space-6">
      <RenterOtpFlow
        listingId={listingId}
        start={start}
        end={end}
        returnTo={safeReturnTo ?? undefined}
      />
    </div>
  );
}

export function VerifyPage({ params, searchParams }: VerifyPageProps) {
  return (
    <Suspense fallback={null}>
      <VerifyPageBody params={params} searchParams={searchParams} />
    </Suspense>
  );
}

export default VerifyPage;
