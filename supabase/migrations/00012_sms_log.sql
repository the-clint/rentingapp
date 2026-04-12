-- Migration: sms_log (Story 4-5)
-- Story: 4-5-sms-return-reminder (and consumed by Stories 6-1 / 6-3 / 6-4)
--
-- Persistent log of every outbound and inbound SMS the platform
-- processes. Story 4-5 uses this to record return-reminder send
-- failures (so the operator can be notified to chase the renter
-- another way). Later stories in Epic 6 piggy-back on the same
-- table for lifecycle SMS delivery tracking and inbound webhook
-- logs.
--
-- Design:
--   - `direction` is 'outbound' or 'inbound'.
--   - `purpose` is a free-form kebab-case tag ('return-reminder',
--     'booking-confirmation', 'extension', 'cancellation',
--     'inbound-renter', etc.). A single column keeps the table
--     small; Epic 6 will add an index on (booking_id, created_at).
--   - `status` is 'queued' | 'sent' | 'failed'. The return-reminder
--     endpoint flips queued→sent once the notification stub
--     resolves; real Twilio delivery callbacks land in Story 6-4.
--   - `booking_id` / `listing_id` / `operator_id` are all nullable
--     because inbound SMS from an unrecognized phone number may
--     not match any of them initially.

CREATE TABLE public.sms_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direction    text NOT NULL CHECK (direction IN ('outbound', 'inbound')),
  purpose      text NOT NULL,
  phone        text NOT NULL,
  body         text NOT NULL,
  status       text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sent', 'failed')),
  error        text,
  booking_id   uuid REFERENCES public.bookings (id) ON DELETE SET NULL,
  listing_id   uuid REFERENCES public.listings (id) ON DELETE SET NULL,
  operator_id  uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  sent_at      timestamptz
);

CREATE INDEX sms_log_booking_id_idx
  ON public.sms_log (booking_id)
  WHERE booking_id IS NOT NULL;

CREATE INDEX sms_log_operator_id_created_at_idx
  ON public.sms_log (operator_id, created_at DESC)
  WHERE operator_id IS NOT NULL;

CREATE INDEX sms_log_status_idx
  ON public.sms_log (status) WHERE status = 'failed';

COMMENT ON TABLE public.sms_log IS
  'Outbound + inbound SMS audit trail (Stories 4-5, 6-1, 6-3, 6-4).';

-- Idempotency guard for the return-reminder endpoint: never send the
-- same purpose twice for the same booking on the same day.
CREATE UNIQUE INDEX sms_log_return_reminder_idempotent_idx
  ON public.sms_log (booking_id, purpose, ((created_at AT TIME ZONE 'UTC')::date))
  WHERE purpose = 'return-reminder';

-- RLS: no one writes directly. All inserts go through Server Actions
-- using the admin client. Operators read their own rows via a join on
-- listing_id → listings.operator_id; we enable RLS with no policies so
-- anon/authenticated can't select by default. Story 5-5 / 6-5 will add
-- SELECT policies for the operator notification badge.
ALTER TABLE public.sms_log ENABLE ROW LEVEL SECURITY;
