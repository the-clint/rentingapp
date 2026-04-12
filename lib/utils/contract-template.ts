/**
 * Pure contract template (Story 3-4).
 *
 * Renders the rental agreement body as a plain string plus a short
 * plain-language summary object. No React, no Supabase, no clock reads,
 * no randomness — everything the caller needs goes through `input`, and
 * everything we return is a function of `input`.
 *
 * The template is platform-wide for MVP: one body of text, with listing
 * and booking specifics inlined via placeholder substitution. A future
 * story may add operator-side customization (see Epic 5 backlog).
 *
 * Policies baked into the template (keep in sync with product copy):
 *   - Cancellation: 48+ hours → full refund. Within 48 hours → hold is
 *     non-refundable. (Exact text is asserted by tests.)
 *   - Liability: renter is responsible for damage beyond normal wear; the
 *     payment hold secures against damage, late return, and no-show.
 *   - No-show: if the renter does not pick the equipment up on the start
 *     date, the operator may capture the hold as a no-show fee.
 *   - Post-rental buffer: the operator reserves 5 days after end_date for
 *     maintenance and extensions (consistent with Story 3-5 AC / FR25).
 */

export interface ContractTemplateInput {
  listingName: string;
  pickupLocation: string;
  pickupInstructions: string | null;
  dailyRateCents: number;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  totalCents: number;
  rentalDays: number;
  renterPhoneE164: string; // +1XXXXXXXXXX
}

export interface ContractSummary {
  periodLine: string;
  rateLine: string;
  cancellationLine: string;
  liabilityLine: string;
  noShowLine: string;
  pickupLine: string;
}

export interface RenderedContract {
  body: string;
  summary: ContractSummary;
}

const CANCELLATION_POLICY =
  "Cancel 48+ hours before for a full refund. Within 48 hours, the hold is non-refundable.";

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatPhoneDisplay(e164: string): string {
  // `+18015551234` → `(801) 555-1234`
  if (e164.startsWith("+1") && e164.length === 12) {
    return `(${e164.slice(2, 5)}) ${e164.slice(5, 8)}-${e164.slice(8)}`;
  }
  return e164;
}

/**
 * Build a human summary of the contract. Five or six short lines that
 * render inside the summary card on the contract page.
 */
function buildSummary(input: ContractTemplateInput): ContractSummary {
  const dailyRate = formatDollars(input.dailyRateCents);
  const total = formatDollars(input.totalCents);
  const pickupExtra = input.pickupInstructions
    ? ` Pickup instructions will be shared after payment is authorized.`
    : "";
  return {
    periodLine: `Rental period: ${input.startDate} through ${input.endDate} (${input.rentalDays} day${input.rentalDays === 1 ? "" : "s"}).`,
    rateLine: `Daily rate ${dailyRate}. Total held on your card: ${total}.`,
    cancellationLine: CANCELLATION_POLICY,
    liabilityLine:
      "You are responsible for damage beyond normal wear and tear; the payment hold secures the equipment.",
    noShowLine:
      "If you do not pick up the equipment on the start date, the hold may be captured as a no-show fee.",
    pickupLine: `Pickup: ${input.pickupLocation}.${pickupExtra}`,
  };
}

/**
 * Render the full legal body of the contract. This is the text that shows
 * when the renter taps "View Full Terms". It embeds every input field so a
 * snapshot of the string on disk is self-contained.
 */
export function renderContract(
  input: ContractTemplateInput,
): RenderedContract {
  const summary = buildSummary(input);
  const dailyRate = formatDollars(input.dailyRateCents);
  const total = formatDollars(input.totalCents);
  const phone = formatPhoneDisplay(input.renterPhoneE164);
  const pickupInstructions =
    input.pickupInstructions && input.pickupInstructions.trim().length > 0
      ? input.pickupInstructions.trim()
      : "The operator will share pickup instructions after the payment hold is authorized.";

  const body = [
    `RENTAL AGREEMENT`,
    ``,
    `This rental agreement ("Agreement") is entered into between the equipment owner ("Operator") and the renter identified below ("Renter") through the RentingApp platform.`,
    ``,
    `1. EQUIPMENT`,
    `   Equipment: ${input.listingName}`,
    `   Pickup location: ${input.pickupLocation}`,
    `   Pickup instructions: ${pickupInstructions}`,
    ``,
    `2. RENTAL PERIOD`,
    `   Start date: ${input.startDate}`,
    `   End date:   ${input.endDate}`,
    `   Duration:   ${input.rentalDays} day${input.rentalDays === 1 ? "" : "s"}`,
    ``,
    `3. PRICING AND PAYMENT HOLD`,
    `   Daily rate: ${dailyRate}`,
    `   Total:      ${total}`,
    `   On signing, Renter authorizes a payment hold of ${total} on Renter's payment method. The hold is not a charge; it is captured only on completion, no-show, or damage assessment.`,
    ``,
    `4. CANCELLATION POLICY`,
    `   ${CANCELLATION_POLICY}`,
    `   Cancellations made 48 or more hours before the start date release the payment hold in full. Cancellations made within 48 hours of the start date forfeit the hold.`,
    ``,
    `5. LIABILITY AND CARE OF EQUIPMENT`,
    `   Renter accepts the equipment "as-is" and is responsible for any damage beyond normal wear and tear occurring during the rental period. Operator may capture all or part of the payment hold to cover repair or replacement costs, documented in the post-rental inspection.`,
    ``,
    `6. NO-SHOW POLICY`,
    `   If Renter fails to pick up the equipment on the start date and does not cancel prior to the start date, Operator may mark the booking as a no-show and capture the full payment hold as a no-show fee.`,
    ``,
    `7. POST-RENTAL BUFFER`,
    `   A 5-day post-rental buffer is reserved following the end date to allow for extensions and mandatory maintenance. Renter may request an extension during the first four days of the buffer through the manage-my-rental dashboard.`,
    ``,
    `8. RENTER IDENTIFICATION`,
    `   Phone number: ${phone}`,
    `   Renter identity is verified via SMS one-time password through the RentingApp platform. The signed timestamp and phone number constitute the electronic signature.`,
    ``,
    `9. GOVERNING LAW`,
    `   This Agreement is governed by the laws of the State of Utah.`,
    ``,
    `By tapping "I Agree & Sign" on the RentingApp contract page, Renter agrees to every term of this Agreement.`,
  ].join("\n");

  return { body, summary };
}
