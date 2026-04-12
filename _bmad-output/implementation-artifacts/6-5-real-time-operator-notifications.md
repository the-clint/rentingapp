# Story 6-5: Real-Time Operator Notifications

Status: done
Epic: 6 — Communication Hub & Notifications
Completed: 2026-04-10

## Summary

Mounts a `RealtimeNotifications` client component in the operator
layout that subscribes via Supabase Realtime to inbound messages,
booking lifecycle transitions, and failed SMS log rows — and pushes
a self-dismissing toast for each. The toasts anchor top-center on
mobile and top-right on desktop.

## Files touched

- `components/operator/realtime-notifications.tsx` — client
  Realtime subscriber + toast queue.
- `components/operator/realtime-notifications-host.tsx` — Server
  wrapper that resolves the operator id via `auth.getUser`.
- `app/(operator)/layout.tsx` — mounts the host inside a Suspense
  boundary alongside the shell.

## Notes

- Three Realtime channels are opened per operator session:
  `operator-{id}-messages`, `operator-{id}-bookings`, and
  `operator-{id}-sms-failures`. `messages` and `bookings` were
  added to the `supabase_realtime` publication in migration 00014.
- Toasts auto-dismiss after 5 seconds.
