import { Suspense } from "react";
import { redirect } from "next/navigation";

import { BookingStepIndicator } from "@/components/booking/booking-step-indicator";
import { ResumeBanner } from "@/components/booking/resume-banner";
import { PaymentHoldForm } from "@/components/payment/payment-hold-form";
import { createBookingHold } from "@/lib/actions/payment-actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

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
  searchParams: Promise<{ bookingId?: string; resumed?: string }>;
}

async function PaymentPageBody({ params, searchParams }: PaymentPageProps) {
  const { listingId } = await params;
  const { bookingId, resumed } = await searchParams;

  if (!bookingId) {
    redirect(`/book/${listingId}`);
  }

  // Story 3-6: if the booking is already confirmed, skip the Stripe
  // setup (which would error PAYMENT_INVALID_STATUS) and send the
  // renter straight to the celebration page. Also enforce OTP session
  // presence here for a clean re-verify returnTo loop.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const returnTo = `/book/${listingId}/payment?bookingId=${encodeURIComponent(bookingId)}`;
    redirect(
      `/book/${listingId}/verify?returnTo=${encodeURIComponent(returnTo)}`,
    );
  }
  const admin = createAdminClient();
  const { data: bookingRow } = await admin
    .from("bookings")
    .select("id, renter_id, status")
    .eq("id", bookingId)
    .maybeSingle();
  if (
    bookingRow &&
    bookingRow.renter_id === user.id &&
    bookingRow.status === "confirmed"
  ) {
    redirect(
      `/book/${listingId}/confirmed?bookingId=${encodeURIComponent(bookingId)}&resumed=1`,
    );
  }

  const hold = await createBookingHold(bookingId);

  return (
    <div className="mx-auto flex max-w-[480px] flex-col gap-space-6 px-space-4 py-space-6">
      <BookingStepIndicator currentStep="payment" />
      {resumed === "1" ? (
        <ResumeBanner
          pathname={`/book/${listingId}/payment`}
          preservedQuery={`bookingId=${encodeURIComponent(bookingId)}`}
        />
      ) : null}
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
