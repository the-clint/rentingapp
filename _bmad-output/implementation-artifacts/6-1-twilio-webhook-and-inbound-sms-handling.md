# Story 6-1: Twilio Webhook & Inbound SMS Handling

Status: done
Epic: 6 — Communication Hub & Notifications
Completed: 2026-04-10

## Summary

Wires the `/api/webhooks/twilio` route to receive inbound SMS, verify
the Twilio signature (via `lib/services/twilio.ts`), resolve the
sending phone number to an existing booking contract when possible,
and insert into the new `conversations` + `messages` tables via
`rpc_record_inbound_message`. Realtime is enabled on both tables so
the operator message hub (Story 6-2) gets live updates.

## Files touched

- `supabase/migrations/00014_messaging.sql` — `conversations`,
  `messages`, Realtime publication, `rpc_record_inbound_message`.
- `lib/services/twilio.ts` — HTTP facade around Twilio REST +
  signature verification with a stubbed-delivery fallback.
- `app/api/webhooks/twilio/route.ts` — POST handler with signature
  verification, contract-based routing, and sms_log audit trail.
