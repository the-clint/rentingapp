# Story 4-2: Extend Rental

Status: done
Epic: 4 — Renter Self-Service (Manage-My-Rental)
Completed: 2026-04-10

## Summary

Delivers the first write-path story in Epic 4: a confirmed rental in
its `active` or `return_due` window can be extended by 1..4 additional
days, reclaimed from the 5-day post-rental maintenance buffer inserted
by `rpc_confirm_booking` in Story 3-5. A new Stripe PaymentIntent is
created for the delta amount (a second hold), stored on
`bookings.stripe_extension_intent_id`, and committed via a transactional
RPC that shrinks the buffer row, inserts the new `booking_dates` rows,
and updates the booking row in a single atomic unit.

The stub `/rentals/[bookingId]/extend` page shipped by Story 4-1 is
replaced with a real Server Component + client `ExtendRentalFlow`
driving the three-step UX: select days → Stripe PaymentElement →
confirmation.

## Acceptance criteria mapping

| AC                                                             | Implementation |
|----------------------------------------------------------------|----------------|
| Select +1/+2/+3/+4 day chips with greyed-out unavailable chips | `ExtendRentalFlow` step 1: `extend-days-[n]` button group; `maxExtendDays` derives from remaining maintenance buffer row (`buffer_days_total - 1`). |
| Live cost math + new end date update                           | `extend-cost-math` + `extend-new-end` render from `dailyRateCents * extendDays` and `addDaysIso`. |
| Transparent price: "$X/day × N days = $Y more. New total: $Z"  | Step-1 card strings. |
| Confirm → booking end_date extends, `booking_dates` rows added | `rpc_extend_booking` inserts `generate_series(old_end + 1, new_end)` into `booking_dates`. |
| Unique constraint prevents double-book conflicts               | RPC catches `unique_violation` → `EXTENSION_CONFLICT` → Server Action cancels the delta intent. |
| Maintenance buffer shifts to after the new end date (FR26)     | RPC advances `listing_blocked_dates.start_date` to `new_end_date + 1` (or deletes the row if the extension would invert the range). |
| Stripe hold extended to cover new total (FR19)                 | A **separate** PaymentIntent for the delta (`stripe_extension_intent_id`). Story 5-4 will capture both at completion. |
| Confirmation screen with new dates + new hold                  | Step 3 ("done") renders the success card + `Back to My Rentals` CTA. |
| SMS confirmation sent to renter                                | `sendBookingExtensionSms` stub added to `lib/services/notifications.ts` (real Twilio = Story 6-4). |
| Stripe hold failure surfaces error, extension not applied      | `confirmPayment` error path shows "Payment issue — please update your payment method or contact the operator." and never calls `commitExtension`. |

## Buffer-shrink decision

The 5-day buffer stored in `listing_blocked_dates` by
`rpc_confirm_booking` is the source of truth for extension capacity.
`rpc_extend_booking` shrinks it in place:

- `buffer_days_total = (end_date - start_date) + 1` (inclusive).
- `buffer_days_avail = buffer_days_total - 1` (reserve exactly 1
  mandatory maintenance day, FR25).
- On extend, advance `start_date := new_end_date + 1`. The maintenance
  tail at `old_end + buffer_days_total` is untouched.
- Defensive branch: if a bug or concurrent mutation would make the
  new start exceed the buffer end, delete the row instead of inserting
  an inverted range.

Example, a booking ending 2026-05-03 with a default 5-day buffer:

| state              | buffer row            | avail | mandatory tail |
|--------------------|-----------------------|-------|----------------|
| after confirmation | 2026-05-04..2026-05-08 | 4     | 2026-05-08     |
| after +2 extend    | 2026-05-06..2026-05-08 | 2     | 2026-05-08     |
| after +2 again     | 2026-05-08..2026-05-08 | 0     | 2026-05-08     |

A subsequent extension attempt with 0 availability is rejected at both
the Server Action layer (`prepareExtension` computes `maxExtendDays`)
and the RPC (`EXTENSION_LIMIT_EXCEEDED`) as belt-and-suspenders.

## Why a second PaymentIntent (not `incrementAuthorization`)

Stripe exposes `paymentIntents.incrementAuthorization` for manual-capture
intents, but eligibility is card-network specific (Visa/MC commercial,
certain flows) and not knowable from the server at request time. A
brand-new manual-capture PaymentIntent for the delta works on every
card Stripe accepts and makes the capture path deterministic. The
tradeoff is one extra id on the booking row
(`stripe_extension_intent_id`) and two capture calls in Story 5-4.
Documented in `lib/services/stripe.ts::createExtensionHoldIntent`.

## Concurrency model

`rpc_extend_booking` locks the booking row `FOR UPDATE` before any
computation. Two racing extensions on the same booking serialize — the
second sees the updated `end_date`/`total_cents`/buffer and recomputes
`buffer_days_avail` from scratch, so its own limit check either
passes (both extensions still fit) or rejects with
`EXTENSION_LIMIT_EXCEEDED`.

Two extensions across different bookings on the same listing could
theoretically contend on the `booking_dates(listing_id, date)` unique
constraint if one booking's extension days overlap the other's
maintenance buffer — but migration 00008's buffer insert owns those
dates via `listing_blocked_dates`, and the operator cannot accept a
second booking that overlaps. The only realistic race is the RPC's
own `unique_violation` catch, which raises `EXTENSION_CONFLICT` and
the Server Action then cancels the delta PaymentIntent.

## Files added

Migration:
- `supabase/migrations/00009_booking_extensions.sql` — adds
  `bookings.stripe_extension_intent_id` + `rpc_extend_booking` RPC
  (SECURITY DEFINER, `search_path = ''`).

Services:
- `lib/services/stripe.ts` — adds `createExtensionHoldIntent` +
  `cancelExtensionIntent` helpers (colocated test coverage added in
  `stripe.test.ts`).
- `lib/services/notifications.ts` — adds `sendBookingExtensionSms`
  stub (colocated test coverage added in `notifications.test.ts`).

Server Actions:
- `lib/actions/extension-actions.ts` — `prepareExtension` +
  `commitExtension`, with the `ExtensionError` discriminated union.
  Mirrors the Story 3-5 `payment-actions.ts` pattern, including the
  Story 3-6 `SESSION_EXPIRED` branch for commit.
- `lib/actions/extension-actions.test.ts` — eligibility, max-days,
  Stripe intent creation, commit happy path, commit conflict rolls
  back the intent, SESSION_EXPIRED branch.

Client component:
- `components/rentals/extend-rental-flow.tsx` — three-step flow.
- `components/rentals/extend-rental-flow.test.tsx` — day selection,
  validation, Stripe submit, done state, decline error, conflict,
  SESSION_EXPIRED bounce.

Page:
- `app/(renter)/rentals/[bookingId]/extend/page.tsx` — replaces the
  Story 4-1 stub. Validates session + ownership + lifecycle +
  remaining buffer capacity before mounting the flow. Supports
  optional `?days=` pre-selection.

Story + status:
- `_bmad-output/implementation-artifacts/4-2-extend-rental.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — 4-2 → done.

## Quality gates

- `npm run test`
- `npm run lint`
- `npm run type-check`
- `npm run build`

(See the final dev run for the actual numbers.)

## Out of scope

- Cancelling an extension after commit. The maintenance buffer is
  shrunk in place and there's no "undo extend" path. A follow-up story
  could add it, but Epic 4 does not call for one.
- Multi-hop extension history UI. The booking row tracks a single
  `stripe_extension_intent_id`; a second extension overwrites it. An
  audit trail (separate `booking_extensions` table) is a future-proofing
  follow-up if the product team wants per-extension receipts.
- Real-time operator notification ("Marcus extended by 1 day…") —
  owned by Story 6-5.
- Real Twilio SMS — owned by Story 6-4. The stub is wired at the call
  site so only `notifications.ts` needs to change.

## Follow-ups / risks

- **Two capture calls at completion.** Story 5-4 must capture BOTH
  `stripe_payment_intent_id` AND `stripe_extension_intent_id` (when
  non-null). A missing capture on one side leaves the operator short.
  Add a test in 5-4 that explicitly covers an extended booking.
- **Second extension overwrites the id.** If the renter extends twice,
  the first delta intent id is overwritten. A 3rd-party bug that left
  the first intent in `requires_capture` would silently orphan the
  first hold until the 7-day Stripe expiry. Mitigation: consider a
  `booking_extensions` ledger in a future story.
- **Buffer row coupling.** `prepareExtension` reads the buffer row via
  the admin client on top of the RPC's own read inside the
  transaction. This is redundant but gives the client a correct
  `maxExtendDays` to render the day-chip UI. If the operator's
  availability flow ever starts touching the same row between the
  page render and the RPC call, the UI could show a stale max — the
  RPC will reject the stale pick with `EXTENSION_LIMIT_EXCEEDED` and
  the inline error is clear enough.
- **Buffer lookup uses listing_id + reason + date overlap.** We pick
  the FIRST row that overlaps `[end + 1, end + 5]`. Migration 00008
  inserts exactly one row per booking, so this is unambiguous today.
  If a future migration inserts overlapping buffers (e.g. a second
  booking's buffer straddling this one), the lookup would need a
  tighter filter (booking-scoped buffer tracking).

## Change log

| Date       | Version | Description                      | Author    |
| ---------- | ------- | -------------------------------- | --------- |
| 2026-04-10 | 1.0     | Story implemented end to end     | Dev Agent |
