# Story 3.4: Digital Contract Signing

Status: done

## Story

As a **renter**,
I want to review and sign a rental agreement as part of booking,
so that both parties have clear, documented terms for the rental.

## Acceptance Criteria

1. **`contracts` table + immutability trigger (migration 00007).** A new
   `public.contracts` table stores a denormalized rendered rental
   agreement per draft/signed contract. Columns: `id uuid pk`,
   `booking_id uuid null` (populated at sign time),
   `listing_id uuid NOT NULL FK listings`,
   `renter_id uuid NOT NULL FK auth.users`,
   `renter_phone text NOT NULL`, `start_date date NOT NULL`,
   `end_date date NOT NULL` (with `start_date <= end_date`),
   `total_cents integer NOT NULL CHECK (>= 0)`,
   `body text NOT NULL CHECK (char_length(body) >= 100)`,
   `signed_at timestamptz` (null until signed),
   `created_at timestamptz DEFAULT now()`.
   Indexed by `(listing_id)`, `(renter_id)`, and a **partial unique**
   index on `(renter_id, listing_id, start_date, end_date) WHERE
   signed_at IS NULL` that makes the draft lookup idempotent — one draft
   row per renter + listing + date range at a time. A
   `SECURITY DEFINER` trigger `contracts_prevent_mutation_after_sign`
   raises a `check_violation` exception on any `UPDATE` or `DELETE` whose
   `OLD.signed_at IS NOT NULL`, enforcing immutability at the database
   layer (service role bypasses RLS but does NOT bypass triggers).

2. **`bookings.status` CHECK extended.** Migration 00005's CHECK is
   dropped and recreated to include `pending_payment`. `bookings.renter_id`
   is NOT tightened to `NOT NULL` in this story (follow-up for 3-5).

3. **RLS on `contracts`.** Renter SELECT: `renter_id = auth.uid()`.
   Operator SELECT: `EXISTS (SELECT 1 FROM public.listings WHERE id =
   contracts.listing_id AND operator_id = auth.uid())` — the operator
   side joins through `listings` (not `bookings`) so it works for draft
   rows too. No INSERT/UPDATE/DELETE policies are added: the Story 3-4
   Server Actions always use the service-role admin client. Anon is
   `REVOKE ALL`'d.

4. **Pure contract template `lib/utils/contract-template.ts`.** Exports
   `renderContract(input): { body: string; summary: ContractSummary }`
   with no React, no Supabase, no clock reads. `ContractSummary` has six
   plain-language lines: `periodLine`, `rateLine`, `cancellationLine`,
   `liabilityLine`, `noShowLine`, `pickupLine`. The `cancellationLine`
   is the **exact** string from the AC:
   `Cancel 48+ hours before for a full refund. Within 48 hours, the hold
   is non-refundable.` The full `body` is a single platform-wide legal
   template with sections 1–9 (Equipment, Rental Period, Pricing &
   Payment Hold, Cancellation, Liability, No-Show, Post-Rental Buffer,
   Renter Identification, Governing Law) that inlines listing and
   booking details via substitution. Colocated test covers: placeholder
   substitution, exact cancellation text, singular/plural day wording,
   liability + no-show presence, body length > 200 chars, pickup
   instructions fallback, six-line summary shape.

5. **Zod schema `lib/schemas/contract-schema.ts`.** Two exports:
   `createContractDraftSchema` (validates `listingId` UUID + `startDate`
   / `endDate` YYYY-MM-DD + `start <= end`) and `signContractSchema`
   (validates `contractId` UUID + `agreeChecked === true`).

6. **Server Actions `lib/actions/contract-actions.ts`.** Two exports,
   both returning `Result<T, ContractError>`:

   - `createContractDraft(input)`: validates via Zod, resolves the
     current renter session via `createClient()` (`auth.getUser()`),
     loads the listing via the admin client (must be `status =
     'published'` and `deleted_at IS NULL`), looks up any existing
     unsigned draft for `(renter_id, listing_id, start_date, end_date)`
     (idempotent — returns the existing `contractId` if present),
     otherwise calls `renderContract(...)` and inserts a new
     `contracts` row with `signed_at = null`. Returns the `contractId`,
     rendered `body`, `summary`, plus the display-level fields the page
     and client component need (`startDate`, `endDate`, `totalCents`,
     `rentalDays`, `listingName`, `renterPhoneE164`). Error codes:
     `CONTRACT_INVALID_INPUT`, `CONTRACT_UNAUTHENTICATED`,
     `CONTRACT_LISTING_NOT_FOUND`, `CONTRACT_DATABASE_ERROR`.

   - `signContract(input)`: validates via Zod (which enforces
     `agreeChecked === true`), resolves the renter session, loads the
     contract row via the admin client, **re-verifies ownership in
     application code** (`contract.renter_id === session.userId`),
     short-circuits with `CONTRACT_ALREADY_SIGNED` when `signed_at` is
     non-null, re-loads the listing to confirm it is still published,
     checks for any overlapping non-cancelled `bookings` rows on the
     listing (returns `BOOKING_CONFLICT` on hit), inserts a new
     `bookings` row with `status = 'pending_payment'` and
     `contract_id = contract.id`, then stamps `signed_at = now()` and
     `booking_id = <inserted>` on the contract. Returns `{ bookingId,
     signedAt }`. Error codes: `CONTRACT_INVALID_INPUT`,
     `CONTRACT_UNAUTHENTICATED`, `CONTRACT_FORBIDDEN`,
     `CONTRACT_NOT_FOUND`, `CONTRACT_ALREADY_SIGNED`,
     `CONTRACT_LISTING_NOT_FOUND`, `BOOKING_CONFLICT`,
     `CONTRACT_DATABASE_ERROR`.

7. **Contract page `app/(renter)/book/[listingId]/contract/page.tsx`.**
   Replaces the Story 3-3 placeholder. Server Component that awaits
   `params` + `searchParams`, redirects back to `/book/[id]` when either
   `start` or `end` is missing, calls `createContractDraft({...})`, and
   renders either `<BookingStepIndicator currentStep="contract" />` +
   `<ContractSigningFlow ... />` on success, or an inline error message
   on failure. The renter session gate is enforced by `proxy.ts`; this
   page does not re-check the role.

8. **Client component `components/booking/contract-signing-flow.tsx`.**
   Renders:

   - A heading with the listing name.
   - A summary card with the six `ContractSummary` lines rendered as a
     bulleted list in `text-base` (16 px) — AC #4 screen-reader
     requirement.
   - A "View Full Terms" button that toggles a `max-height` CSS
     transition (250 ms, `motion-reduce:transition-none`) on a panel
     containing the full `body` in a `<pre className="whitespace-pre-wrap">`.
     `aria-expanded` + `aria-controls` point at the panel's `useId`.
   - An "I agree" checkbox (native `<input type="checkbox">`).
   - An `I Agree & Sign` primary button, disabled until the checkbox is
     checked. On click, calls `signContract({ contractId, agreeChecked:
     true })`. On success, the button + checkbox row is replaced with a
     green confirmation card showing a `Check` icon + `Signed by (XXX)
     XXX-XXXX` + the formatted date/time, and a `setTimeout` (1.5 s)
     routes to `/book/[listingId]/payment?bookingId=...`. On
     `BOOKING_CONFLICT`, shows "These dates were just booked. Please
     pick different dates." On any other failure, surfaces the server
     error message in an inline `role="alert"`. No toast library.

9. **Stub payment page `app/(renter)/book/[listingId]/payment/page.tsx`.**
   Server Component renders "Payment step — Story 3-5" + the step
   indicator at "Payment" + the listing id and `bookingId` from the URL.
   Already renter-gated by `proxy.ts` via the `RENTER_BOOKING_SUFFIXES`
   list from Story 3-3.

10. **Tests (all colocated, green):**
    - `lib/utils/contract-template.test.ts` — placeholders, exact
      cancellation text, singular/plural day wording, liability +
      no-show presence, body length > 200, pickup-instructions
      fallback, summary shape (7 tests).
    - `lib/schemas/contract-schema.test.ts` — happy path + 4 failure
      paths for draft schema, happy + 2 failure paths for sign schema
      (8 tests).
    - `lib/actions/contract-actions.test.ts` —
      `createContractDraft`: rejects non-UUID, rejects
      unauthenticated, rejects deleted listing, inserts a new draft,
      returns the existing draft id (idempotency). `signContract`:
      rejects `agreeChecked=false`, happy path (creates booking +
      stamps signed_at), short-circuits on already-signed, rejects
      contract owned by different renter, returns `BOOKING_CONFLICT`
      on overlap, rejects unauthenticated (11 tests).
    - `components/booking/contract-signing-flow.test.tsx` — renders
      all summary lines, accordion toggles `aria-expanded`, sign
      button disabled until checkbox ticked, successful sign shows
      confirmation + schedules redirect (with fake timers), inline
      error on `BOOKING_CONFLICT`, inline error on generic failure
      (6 tests).

11. **Quality gates.** `npm run test`, `npm run lint`, `npm run
    type-check` all clean. `npm run build` attempted and documented;
    environment-dependent on `BWS_SECRETS_TOKEN` (varlock), per Story
    3-3 precedent.

## Tasks / Subtasks

- [x] Task 1: Pure contract template (AC: #4, #10)
  - [x] 1.1 Create `lib/utils/contract-template.ts` with
    `ContractTemplateInput`, `ContractSummary`, `RenderedContract`, and
    the `renderContract(input)` function.
  - [x] 1.2 Inline the exact cancellation policy string as a top-level
    `const` so tests and the summary builder share one source.
  - [x] 1.3 Colocate `contract-template.test.ts`.

- [x] Task 2: Zod schema (AC: #5, #10)
  - [x] 2.1 Create `lib/schemas/contract-schema.ts` with
    `createContractDraftSchema` and `signContractSchema`.
  - [x] 2.2 Colocate `contract-schema.test.ts`.

- [x] Task 3: Migration 00007 (AC: #1, #2, #3)
  - [x] 3.1 Extend the `bookings.status` CHECK to include
    `pending_payment`.
  - [x] 3.2 Create the `contracts` table with the schema shape above.
  - [x] 3.3 Add indexes: `contracts_listing_id_idx`,
    `contracts_renter_id_idx`, and the partial unique
    `contracts_draft_identity_idx`.
  - [x] 3.4 Define `contracts_prevent_mutation_after_sign()` with
    `SECURITY DEFINER SET search_path = ''` per the 00003/00005
    hardening pattern, and attach BEFORE UPDATE + BEFORE DELETE
    triggers.
  - [x] 3.5 Enable RLS + add renter/operator SELECT policies + revoke
    anon.

- [x] Task 4: Server Actions (AC: #6, #10)
  - [x] 4.1 Create `lib/actions/contract-actions.ts` with
    `createContractDraft` and `signContract` Server Actions returning
    `Result<T, ContractError>`.
  - [x] 4.2 Inline a `getRenterSession()` helper that calls
    `supabase.auth.getUser()` and validates the caller is phone-auth
    (renter) before proceeding.
  - [x] 4.3 Inline a `loadPublishedListing(id)` helper used by both
    actions to guarantee the listing is still live.
  - [x] 4.4 Re-check contract ownership in application code inside
    `signContract` — the admin client bypasses RLS, so this is
    load-bearing.
  - [x] 4.5 Colocate `contract-actions.test.ts` with a hand-rolled
    builder mock per-table.

- [x] Task 5: Contract page (AC: #7)
  - [x] 5.1 Replace `app/(renter)/book/[listingId]/contract/page.tsx`
    with a Server Component that awaits `params` + `searchParams`,
    calls `createContractDraft(...)`, and renders `ContractSigningFlow`
    (happy path) or an inline error (failure path).

- [x] Task 6: Client signing flow (AC: #8, #10)
  - [x] 6.1 Create `components/booking/contract-signing-flow.tsx` with
    the summary card, `aria-expanded` accordion, checkbox + sign
    button, and success/error state machines.
  - [x] 6.2 Use a native `<input type="checkbox">` to keep the test
    harness simple (Radix Checkbox requires fiddly event firing in
    jsdom).
  - [x] 6.3 Post-sign redirect via `window.setTimeout` + `router.push`
    so the green confirmation lands on the user's eye before the
    payment page takes over.
  - [x] 6.4 Colocate `contract-signing-flow.test.tsx` with mocks for
    `next/navigation` and `@/lib/actions/contract-actions`.

- [x] Task 7: Payment stub (AC: #9)
  - [x] 7.1 Create `app/(renter)/book/[listingId]/payment/page.tsx` as
    a placeholder that displays the bookingId query param and the
    step indicator at "Payment". Already gated by `proxy.ts`.

- [x] Task 8: Sprint status + story file (AC: #11)
  - [x] 8.1 Mark `3-4-digital-contract-signing: done` in
    `sprint-status.yaml` and bump `last_updated` to 2026-04-10.
  - [x] 8.2 Write this story file.

- [x] Task 9: Quality gates (AC: #11)
  - [x] 9.1 `npm run test`
  - [x] 9.2 `npm run lint`
  - [x] 9.3 `npm run type-check`
  - [x] 9.4 `npm run build` — attempted, env-dependent on
    `BWS_SECRETS_TOKEN`.

## Dev Notes

### Decision: create the `bookings` row at contract-sign time

Story 3-5's AC talks about inserting the `bookings` row "when the
booking is created" and then inserting `booking_dates` rows from within
the same Server Action. That language is compatible with two
implementation paths:

1. **Booking-at-contract-sign.** Insert the `bookings` row in
   `pending_payment` status as part of `signContract`. Story 3-5 then
   transitions the row to `confirmed` and inserts `booking_dates` after
   the Stripe hold is authorized.
2. **Booking-at-payment.** Skip the booking row in 3-4 — only insert
   the `contracts` row. Story 3-5's Server Action inserts BOTH the
   `bookings` row and the `booking_dates` rows atomically after the
   Stripe hold lands.

Story 3-4 takes path (1). Reasons:

- **Contract `booking_id` FK is stable from sign time onward.** Path (2)
  forces `contracts.booking_id` to stay null through the payment step,
  and Story 3-5 then has to go back and update the (now-signed and
  therefore **immutable**!) contract row. The immutability trigger would
  have to be reworked to allow `booking_id` updates specifically, which
  erodes the security guarantee that nothing about a signed contract
  ever changes.
- **Stripe PaymentIntent metadata.** Story 3-5's PaymentIntent payload
  will include `metadata.booking_id` so the Stripe webhook can match
  holds back to bookings. That id needs to exist before
  `createPaymentIntent` is called — otherwise 3-5 has to generate a
  temporary correlation id and back-fill later.
- **Idempotency on refresh.** A renter who refreshes the payment page
  should see the same booking id, not a fresh one. That is easy if the
  booking row was created at sign time (URL carries `bookingId=…`);
  harder if the payment page itself is the one inserting the row.
- **The double-book guard is still enforced at the DB layer.** We do a
  soft overlap check in `signContract` that short-circuits with
  `BOOKING_CONFLICT`, but the authoritative guarantee is the
  `booking_dates(listing_id, date)` unique constraint that Story 3-5
  inserts at payment time. Two renters racing through contract-sign
  will each get a `bookings` row at this stage, but the first one
  through payment wins the dates; the second gets `BOOKING_CONFLICT` in
  3-5's Server Action and the abandoned `pending_payment` booking can
  be reaped by a future background job (or by a TTL on the row — a
  follow-up for Story 7-2).

The `bookings.status` CHECK needs a `pending_payment` value for this
path. Migration 00007 drops and re-adds the check. Since no booking
data exists in any environment yet (Story 3-5 hasn't landed), this is
a safe forward-only change.

### Why the immutability guarantee is a trigger, not RLS or a CHECK

We considered three options for "signed contracts cannot be modified":

1. **RLS policy** denying `UPDATE`/`DELETE` on rows where `signed_at
   IS NOT NULL`. Problem: RLS is per-role, and our Server Actions use
   the service-role admin client which **bypasses RLS entirely**. An
   admin-client bug (or a future refactor that accidentally widens the
   admin surface) could silently mutate signed contracts. RLS is the
   wrong layer for this guarantee.
2. **CHECK constraint.** A CHECK can look at `NEW` but not at
   `OLD`. You can't write a CHECK that says "once `signed_at` is set,
   no column may be changed."
3. **BEFORE UPDATE / BEFORE DELETE trigger** that raises when
   `OLD.signed_at IS NOT NULL`. Triggers fire for **every** writer,
   including the service role. This is the strongest guarantee
   PostgreSQL offers at the schema layer and it is what we ship.

The trigger uses `SECURITY DEFINER SET search_path = ''` for
consistency with the `set_updated_at()` and `handle_new_user()`
hardening pattern from migrations 00002 and 00003 — Supabase's lint
check flags `function_search_path_mutable` otherwise.

There is one small asymmetry to document: `signContract` stamps
`signed_at` AND `booking_id` in a single UPDATE statement, so the
trigger sees `OLD.signed_at = null` and permits the write. On the very
next UPDATE attempt, `OLD.signed_at` is non-null and the trigger
raises. Correct behavior.

### Why we re-check ownership in application code even though RLS exists

The Server Actions use the service-role admin client, which bypasses
RLS. That means the renter SELECT policy on `contracts` doesn't protect
the `signContract` load path — anyone who guesses or leaks a contract
id could hand it to `signContract` and try to sign someone else's
contract. The application-code check
`contract.renter_id === session.userId` + `CONTRACT_FORBIDDEN` error
is the real guarantee. Test coverage asserts this directly.

### Draft idempotency via a partial unique index

`createContractDraft` is called on every page load of the contract
step. Without an idempotency guard, a renter who refreshes the page
would keep inserting fresh `contracts` rows. Two options:

1. Do a `SELECT ... WHERE signed_at IS NULL LIMIT 1` before the INSERT
   in application code.
2. Add a partial unique index so the DB rejects the second insert and
   we fall back to a SELECT-and-return.

We do both. Application-code path (1) is the happy path — the typical
refresh hits the existing draft lookup and skips the insert. The
partial unique index `contracts_draft_identity_idx` is a belt-and-
suspenders guarantee against the TOCTOU race between the SELECT and
the INSERT: two parallel requests arriving at the same instant
would both miss the SELECT but only one would win the INSERT; the
other would surface as a database error which would land as
`CONTRACT_DATABASE_ERROR`. In practice this is effectively impossible
from a single browser tab, but the index is cheap insurance and also
documents the invariant at the schema layer.

The index is **partial** (`WHERE signed_at IS NULL`) so that once the
draft is signed, the renter is free to create a fresh draft for a new
date range (or the same date range, on a future rental, after the
first one is cancelled).

### Native checkbox vs Radix Checkbox

The sign button gates on a single `<input type="checkbox">` rather
than the `Checkbox` component from `components/ui/checkbox.tsx`. Two
reasons:

1. The Radix checkbox is a styled button with data-state attributes
   instead of a real `<input>`, which makes `fireEvent.click` flows
   in jsdom a little awkward — you have to target the root by role
   and assert on data attributes.
2. Tailwind's native checkbox styling is totally adequate for this
   single-checkbox-in-a-form use case, and keeps the rendered HTML
   accessible to screen readers without any extra aria wiring.

If a future story introduces a form with many checkboxes (think: renter
profile preferences in Epic 4), it is fine to swap in the Radix
component there; the precedent in this file is deliberately minimal.

### Post-sign redirect delay

We wait 1.5 seconds after `signContract` resolves before
`router.push`ing to the payment page. Shorter and the green
confirmation card flashes past the user too fast; longer and the flow
feels sluggish. The timer is captured in a `useRef` so the component
can clean up if it unmounts before the timeout fires (e.g. the user
hits the browser back button mid-beat).

### Scope: no PDF, no drawn signature, no email delivery

Per the story prompt's hard rules:

- The contract is stored as plain text in `contracts.body`.
- The signature is the combination of `signed_at` + `renter_id` +
  `renter_phone`. The renter taps a button, there is no canvas for a
  handwritten signature, and there is no e-signature service
  integration.
- There is no PDF export. A future story (maybe 5-2 when the operator
  needs to view a signed contract) may render the body as a PDF at
  that time.
- There is no email delivery of the signed contract. The manage-my-
  rental dashboard (Epic 4) will expose the contract body via a
  regular authenticated API call.
- There is no operator-side customization of the contract template.
  One platform-wide template, full stop.

### Follow-ups for 3-5, 3-6, 5-2

- **Story 3-5 (payment hold).** Story 3-5's Server Action must: (a)
  look up the `bookings` row by id (now carrying `status =
  'pending_payment'` and `contract_id`), (b) create the Stripe
  PaymentIntent with `capture_method: 'manual'` and the booking total,
  (c) insert one row per booked calendar day into `booking_dates`
  (this is where the unique `(listing_id, date)` constraint is
  actually tested by a double-book race), (d) update the booking to
  `status = 'confirmed'` with `stripe_payment_intent_id` set, and (e)
  flip `bookings.renter_id` to `NOT NULL` in a new migration (the one
  TODO that Story 3-3's Dev Notes already tracked). If the payment
  fails, the `pending_payment` booking row is left in place for a
  retry — a background reaper or a TTL can clean abandoned rows.

- **Story 3-6 (state persistence).** The contract page is naturally
  idempotent via the partial unique draft index; a browser refresh
  returns the same draft row. The only piece of state Story 3-6 needs
  to persist for this step is the `agreeChecked` boolean, which can
  live in sessionStorage or the Zustand store that 3-6 introduces. The
  contract page itself does not need to change.

- **Story 5-2 (operator contract access).** The operator RLS SELECT
  policy on `contracts` is already in place — an operator dashboard
  listing a booking's contract just needs to fetch
  `contracts.body` for the relevant booking and render it in a
  `<pre>`. No new actions, no new migrations. The PDF export question
  (if it ever ships) can be built on top of the existing `body`
  without touching the DB.

- **Rate limiting on `signContract`.** A buggy client could in theory
  spam `signContract` with the same id before the state-machine lock
  prevents it. The DB-level immutability trigger converts repeat
  attempts into a `CONTRACT_ALREADY_SIGNED` error on the second call,
  which is fine — but a per-contract request limit could be added in
  a hardening story (7-2 retention is a natural home) if real logs
  show abuse.

## Dev Agent Record

- Model: Claude Opus 4.6 (1M context)
- No new npm dependencies
- Files created:
  - `supabase/migrations/00007_contracts.sql`
  - `lib/utils/contract-template.ts`
  - `lib/utils/contract-template.test.ts`
  - `lib/schemas/contract-schema.ts`
  - `lib/schemas/contract-schema.test.ts`
  - `lib/actions/contract-actions.ts`
  - `lib/actions/contract-actions.test.ts`
  - `components/booking/contract-signing-flow.tsx`
  - `components/booking/contract-signing-flow.test.tsx`
  - `app/(renter)/book/[listingId]/payment/page.tsx`
- Files modified:
  - `app/(renter)/book/[listingId]/contract/page.tsx` — replaces the
    Story 3-3 placeholder with the real contract page (Server
    Component that calls `createContractDraft` and renders
    `ContractSigningFlow`).
  - `_bmad-output/implementation-artifacts/sprint-status.yaml` —
    mark story 3-4 done and bump `last_updated` to 2026-04-10.

## Change Log

| Date       | Version | Description                                 | Author |
| ---------- | ------- | ------------------------------------------- | ------ |
| 2026-04-10 | 1.0     | Story implemented end to end                | Dev Agent |
