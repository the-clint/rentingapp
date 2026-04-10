import { Suspense } from "react";
import { redirect } from "next/navigation";

import { BookingStepIndicator } from "@/components/booking/booking-step-indicator";
import { ContractSigningFlow } from "@/components/booking/contract-signing-flow";
import { createContractDraft } from "@/lib/actions/contract-actions";

/**
 * Renter contract step (Story 3-4).
 *
 * Server Component that:
 *   1. Reads `listingId` from `params` and `start`/`end` from `searchParams`.
 *      If either date is missing, bounces the renter back to the listing
 *      page so they can re-pick dates.
 *   2. Calls `createContractDraft` to get (or reuse) a draft contract row
 *      for this renter + listing + date range. Any error returned by the
 *      action is surfaced as an inline message so the renter can back up.
 *   3. Hands the rendered summary + body + contract id off to the
 *      `ContractSigningFlow` client component.
 *
 * The renter session gate is enforced by `lib/supabase/proxy.ts` — by the
 * time this page renders, the middleware has confirmed a `user_role =
 * 'renter'` JWT claim.
 */

interface ContractPageProps {
  params: Promise<{ listingId: string }>;
  searchParams: Promise<{ start?: string; end?: string }>;
}

async function ContractPageBody({ params, searchParams }: ContractPageProps) {
  const { listingId } = await params;
  const { start, end } = await searchParams;

  if (!start || !end) {
    redirect(`/book/${listingId}`);
  }

  const draft = await createContractDraft({
    listingId,
    startDate: start,
    endDate: end,
  });

  return (
    <div className="mx-auto flex max-w-[560px] flex-col gap-space-6 px-space-4 py-space-6">
      <BookingStepIndicator currentStep="contract" />
      {draft.success ? (
        <ContractSigningFlow
          listingId={listingId}
          contractId={draft.data.contractId}
          summary={draft.data.summary}
          body={draft.data.body}
          listingName={draft.data.listingName}
          renterPhoneE164={draft.data.renterPhoneE164}
        />
      ) : (
        <div className="flex flex-col gap-space-3">
          <h1 className="text-h2 font-semibold text-neutral-900">
            We couldn&apos;t load your contract
          </h1>
          <p
            role="alert"
            className="rounded-md border border-destructive bg-destructive/10 p-space-3 text-small text-destructive"
          >
            {draft.error.message}
          </p>
          <p className="text-small text-neutral-700">
            Head back to the listing and try selecting your dates again.
          </p>
        </div>
      )}
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
