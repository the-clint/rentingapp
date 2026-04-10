import { Suspense } from "react";

import { BookingStepIndicator } from "@/components/booking/booking-step-indicator";

/**
 * Placeholder payment step page (added in Story 3-4).
 *
 * Story 3-5 replaces the body with the real Stripe Payment Element + hold
 * authorization flow. For now, the renter lands here after signing the
 * contract so the step indicator advances; the page displays the
 * `bookingId` so the test flow is debuggable.
 *
 * Access is gated by `proxy.ts`: this route requires a renter session
 * (`user_role = 'renter'` on the JWT).
 */

interface PaymentPageProps {
  params: Promise<{ listingId: string }>;
  searchParams: Promise<{ bookingId?: string }>;
}

async function PaymentPageBody({ params, searchParams }: PaymentPageProps) {
  const { listingId } = await params;
  const { bookingId } = await searchParams;

  return (
    <div className="mx-auto flex max-w-[480px] flex-col gap-space-6 px-space-4 py-space-6">
      <BookingStepIndicator currentStep="payment" />
      <div className="flex flex-col gap-space-3">
        <h1 className="text-h2 font-semibold text-neutral-900">
          Payment step — Story 3-5
        </h1>
        <p className="text-small text-neutral-700">
          This is a placeholder page added in Story 3-4 so that the signed
          contract has somewhere to redirect to. Story 3-5 will render the
          Stripe Payment Element and authorize the hold here.
        </p>
        <dl className="grid grid-cols-2 gap-space-2 rounded-md border border-neutral-200 p-space-3 text-small text-neutral-900">
          <dt className="font-medium text-neutral-700">Listing</dt>
          <dd>{listingId}</dd>
          <dt className="font-medium text-neutral-700">Booking</dt>
          <dd>{bookingId ?? "—"}</dd>
        </dl>
      </div>
    </div>
  );
}

export function PaymentPage({ params, searchParams }: PaymentPageProps) {
  return (
    <Suspense fallback={null}>
      <PaymentPageBody params={params} searchParams={searchParams} />
    </Suspense>
  );
}

export default PaymentPage;
