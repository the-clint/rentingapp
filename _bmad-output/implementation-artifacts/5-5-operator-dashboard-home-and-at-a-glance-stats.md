# Story 5-5: Operator Dashboard Home & At-a-Glance Stats

Status: done
Epic: 5 — Operator Dashboard & Business Operations
Completed: 2026-04-10

## Summary

Rebuilds the dashboard home from a single "N listings" line into a
proper at-a-glance surface: four stat cards (Active / Monthly Revenue /
Upcoming / Utilization), an alert strip for items needing attention,
and a recent bookings list. The empty-listings CTA from Story 2-4 is
still the fallback for operators with zero listings.

## Acceptance criteria mapping

| AC | Implementation |
|----|----------------|
| 4 stat cards | `StatCard` × 4 in `DashboardHome` |
| Recent bookings list under stats | `fetchOperatorBookings` (sliced to 5) |
| Alert card for urgent items | `dashboard-alerts` section shows rentals needing check-in or past end date |
| Green all-clear state when nothing needs attention | `dashboard-all-clear` block |
| Mobile 2x2 grid for stats | `grid-cols-2 lg:grid-cols-4` |

## Files touched

- `lib/services/operator-dashboard-stats.ts` — new stats fetch
- `components/operator/dashboard-home.tsx` — rewrite to render stats + alerts
- `components/operator/dashboard-home.test.tsx` — updated mocks + tests
