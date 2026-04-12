# Story 6-3: Operator Sends Reply via Hub

Status: done
Epic: 6 — Communication Hub & Notifications
Completed: 2026-04-10

## Summary

`sendOperatorReply` Server Action inserts a `messages` row in
`sending` state, calls Twilio via the shared facade, flips the row
to `sent` or `failed`, and updates `conversations.last_message_at`.
The message hub uses an optimistic bubble and updates on response.

## Files touched

- `lib/actions/messaging-actions.ts` — `sendOperatorReply`.
- `components/messaging/message-hub.tsx` — optimistic UI + retry on
  failure via the status indicator.
