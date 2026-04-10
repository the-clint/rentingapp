import { Suspense } from "react";

import { RenterOtpFlow } from "@/components/booking/renter-otp-flow";

interface VerifyPageProps {
  params: Promise<{ listingId: string }>;
  searchParams: Promise<{ start?: string; end?: string }>;
}

async function VerifyPageBody({ params, searchParams }: VerifyPageProps) {
  const { listingId } = await params;
  const { start, end } = await searchParams;

  return (
    <div className="mx-auto flex max-w-[480px] flex-col gap-space-6 px-space-4 py-space-6">
      <RenterOtpFlow listingId={listingId} start={start} end={end} />
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
