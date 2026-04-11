# Story 6-2: Operator Message Hub — Conversation List & Thread View

Status: done
Epic: 6 — Communication Hub & Notifications
Completed: 2026-04-10

## Summary

Ships the `/messages` page with a two-panel desktop layout
(conversation list + active thread) and a mobile-friendly single-pane
fallback. Conversations come from `fetchOperatorConversations` with
the latest message preview; thread messages come from
`fetchConversationThread`. Both are served through Server Actions
that re-check operator ownership so the admin client can be used
safely.

## Files touched

- `lib/services/messaging.ts` — conversation + thread fetchers.
- `lib/actions/messaging-actions.ts` — Server Action wrappers used
  by the client component to load/mark conversations.
- `components/messaging/message-hub.tsx` — two-panel client
  component with platform-origin badges, SMS-bubble styling, and
  `role="log" aria-live="polite"`.
- `app/(operator)/messages/page.tsx` — Server Component page.
