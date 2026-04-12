-- Migration: messaging + conversations (Epic 6)
-- Stories: 6-1, 6-2, 6-3, 6-4, 6-5
--
-- Unified inbound/outbound SMS conversation store. One
-- `conversations` row per (operator, renter_phone) pair, with many
-- `messages` rows each. Conversations are linked to a booking (and
-- therefore a listing and platform origin) when the renter phone
-- matches an existing booking; otherwise the conversation exists
-- standalone until a booking lands.
--
-- Realtime:
--   - Both `conversations` and `messages` are added to the
--     `supabase_realtime` publication so the operator message hub
--     (Story 6-2) can subscribe to live updates and badge the
--     sidebar nav item (Story 6-5).
--
-- RLS:
--   - Operators can SELECT/UPDATE conversations they own
--     (`operator_id = auth.uid()`).
--   - Operators can SELECT/INSERT messages for their conversations.
--   - Renters have no direct access — inbound SMS is processed by
--     the webhook + admin client; the renter never sees the DB.

-- =============================================================================
-- 1. conversations
-- =============================================================================
CREATE TABLE public.conversations (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id               uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  renter_phone              text NOT NULL,
  renter_id                 uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  booking_id                uuid REFERENCES public.bookings (id) ON DELETE SET NULL,
  listing_id                uuid REFERENCES public.listings (id) ON DELETE SET NULL,
  platform_origin           text
    CHECK (platform_origin IN ('ksl', 'facebook', 'craigslist', 'direct')),
  unread_count_for_operator integer NOT NULL DEFAULT 0,
  last_message_at           timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operator_id, renter_phone)
);

CREATE INDEX conversations_operator_id_last_message_at_idx
  ON public.conversations (operator_id, last_message_at DESC NULLS LAST);

CREATE INDEX conversations_booking_id_idx
  ON public.conversations (booking_id)
  WHERE booking_id IS NOT NULL;

CREATE TRIGGER conversations_set_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operators can select own conversations"
  ON public.conversations FOR SELECT
  TO authenticated
  USING (operator_id = auth.uid());

CREATE POLICY "Operators can update own conversations"
  ON public.conversations FOR UPDATE
  TO authenticated
  USING (operator_id = auth.uid())
  WITH CHECK (operator_id = auth.uid());

-- =============================================================================
-- 2. messages
-- =============================================================================
CREATE TABLE public.messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations (id) ON DELETE CASCADE,
  direction       text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  sender_phone    text NOT NULL,
  body            text NOT NULL CHECK (char_length(body) > 0),
  status          text NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'sending', 'sent', 'failed')),
  error           text,
  twilio_sid      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX messages_conversation_id_created_at_idx
  ON public.messages (conversation_id, created_at ASC);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operators can select messages in own conversations"
  ON public.messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND c.operator_id = auth.uid()
    )
  );

CREATE POLICY "Operators can insert messages in own conversations"
  ON public.messages FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND c.operator_id = auth.uid()
    )
  );

-- =============================================================================
-- 3. Realtime publication
-- =============================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- =============================================================================
-- 4. Helper RPC — upsert_conversation_and_record_message (inbound path)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.rpc_record_inbound_message(
  p_operator_id     uuid,
  p_renter_phone    text,
  p_body            text,
  p_twilio_sid      text,
  p_listing_id      uuid,
  p_booking_id      uuid,
  p_platform_origin text
)
RETURNS TABLE (
  conversation_id uuid,
  message_id      uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_conv_id uuid;
  v_msg_id  uuid;
BEGIN
  INSERT INTO public.conversations AS c (
    operator_id, renter_phone, listing_id, booking_id, platform_origin,
    unread_count_for_operator, last_message_at
  )
  VALUES (
    p_operator_id, p_renter_phone, p_listing_id, p_booking_id,
    COALESCE(p_platform_origin, 'direct'),
    1, now()
  )
  ON CONFLICT (operator_id, renter_phone) DO UPDATE
     SET unread_count_for_operator = c.unread_count_for_operator + 1,
         last_message_at           = now(),
         booking_id = COALESCE(c.booking_id, EXCLUDED.booking_id),
         listing_id = COALESCE(c.listing_id, EXCLUDED.listing_id),
         platform_origin = COALESCE(c.platform_origin, EXCLUDED.platform_origin),
         updated_at = now()
  RETURNING c.id INTO v_conv_id;

  INSERT INTO public.messages (
    conversation_id, direction, sender_phone, body, status, twilio_sid
  )
  VALUES (
    v_conv_id, 'inbound', p_renter_phone, p_body, 'received', p_twilio_sid
  )
  RETURNING id INTO v_msg_id;

  RETURN QUERY SELECT v_conv_id, v_msg_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_record_inbound_message(uuid, text, text, text, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_record_inbound_message(uuid, text, text, text, uuid, uuid, text)
  TO service_role;
