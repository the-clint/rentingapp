import { Suspense } from "react";
import { redirect } from "next/navigation";

import { BookingStepIndicator } from "@/components/booking/booking-step-indicator";
import { PaymentHoldForm } from "@/components/payment/payment-hold-form";
import { createBookingHold } from "@/lib/actions/payment-actions";

/**
 * Renter payment step (Story 3-5).
 *
 * Server Component that:
 *   1. Reads `bookingId` from `searchParams`. Missing id → bounce back
 *      to the listing page.
 *   2. Calls `createBookingHold(bookingId)` to create (or reuse on
 *      refresh) the Stripe PaymentIntent with `capture_method: 'manual'`.
 *   3. Hands the client_secret + publishable key + recomputed total off
 *      to the client `PaymentHoldForm` component.
 *
 * Renter session gate is enforced by `lib/supabase/proxy.ts`.
 */

interface PaymentPageProps {
  params: Promise<{ listingId: string }>;
  searchParams: Promise<{ bookingId?: string }>;
}

async function PaymentPageBody({ params, searchParams }: PaymentPageProps) {
  const { listingId } = await params;
  const { bookingId } = await searchParams;

  if (!bookingId) {
    redirect(`/book/${listingId}`);
  }

  const hold = await createBookingHold(bookingId);

  return (
    <div className="mx-auto flex max-w-[480px] flex-col gap-space-6 px-space-4 py-space-6">
      <BookingStepIndicator currentStep="payment" />
      {hold.success ? (
        <>
          <div className="flex flex-col gap-space-2">
            <h1 className="text-h2 font-semibold text-neutral-900">
              Authorize your hold
            </h1>
            <p className="text-small text-neutral-700">
              {hold.data.listingName} · {hold.data.startDate} through{" "}
              {hold.data.endDate}
            </p>
          </div>
          <PaymentHoldForm
            listingId={listingId}
            bookingId={hold.data.bookingId}
            clientSecret={hold.data.clientSecret}
            publishableKey={hold.data.publishableKey}
            amountCents={hold.data.amountCents}
            listingName={hold.data.listingName}
          />
        </>
      ) : (
        <div className="flex flex-col gap-space-3">
          <h1 className="text-h2 font-semibold text-neutral-900">
            We couldn&apos;t set up payment
          </h1>
          <p
            role="alert"
            className="rounded-md border border-destructive bg-destructive/10 p-space-3 text-small text-destructive"
          >
            {hold.error.message}
          </p>
          <p className="text-small text-neutral-700">
            Head back to the listing and try again.
          </p>
        </div>
      )}
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
