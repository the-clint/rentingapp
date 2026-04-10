import { Suspense } from "react";

import { BookingStepIndicator } from "@/components/booking/booking-step-indicator";

/**
 * Placeholder contract step page. Story 3-3 creates this so that the
 * post-OTP-verify redirect lands somewhere; Story 3-4 will replace the body
 * with the actual contract summary, full-terms accordion, and sign button.
 *
 * Access is gated by `proxy.ts`: this route requires a renter session
 * (`user_role = 'renter'` on the JWT). Unauthenticated visitors are bounced
 * to `/` by the middleware.
 */

interface ContractPageProps {
  params: Promise<{ listingId: string }>;
  searchParams: Promise<{ start?: string; end?: string }>;
}

async function ContractPageBody({ params, searchParams }: ContractPageProps) {
  const { listingId } = await params;
  const { start, end } = await searchParams;

  return (
    <div className="mx-auto flex max-w-[480px] flex-col gap-space-6 px-space-4 py-space-6">
      <BookingStepIndicator currentStep="contract" />
      <div className="flex flex-col gap-space-3">
        <h1 className="text-h2 font-semibold text-neutral-900">
          Contract step — Story 3-4
        </h1>
        <p className="text-small text-neutral-700">
          This is a placeholder page added in Story 3-3 so that the phone-OTP
          verification redirect lands somewhere. Story 3-4 will flesh out the
          rental agreement summary, the &ldquo;View Full Terms&rdquo;
          accordion, and the &ldquo;I Agree &amp; Sign&rdquo; button.
        </p>
        <dl className="grid grid-cols-2 gap-space-2 rounded-md border border-neutral-200 p-space-3 text-small text-neutral-900">
          <dt className="font-medium text-neutral-700">Listing</dt>
          <dd>{listingId}</dd>
          <dt className="font-medium text-neutral-700">Start</dt>
          <dd>{start ?? "—"}</dd>
          <dt className="font-medium text-neutral-700">End</dt>
          <dd>{end ?? "—"}</dd>
        </dl>
      </div>
    </div>
  );
}

export function ContractPage({ params, searchParams }: ContractPageProps) {
  return (
    <Suspense fallback={null}>
      <ContractPageBody params={params} searchParams={searchParams} />
    </Suspense>
  );
}

export default ContractPage;
