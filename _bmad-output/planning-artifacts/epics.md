---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
  - step-04-final-validation
status: complete
completedAt: '2026-04-04'
inputDocuments:
  - prd.md
  - architecture.md
  - ux-design-specification.md
---

# Everything.Rent - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for Everything.Rent, decomposing the requirements from the PRD, UX Design, and Architecture into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1: Operator can create a rental listing with photos, description, daily pricing, and availability calendar
FR2: Operator can edit an existing listing's details, photos, pricing, and availability
FR3: Operator can block dates on the availability calendar for personal use
FR4: Operator can delete a listing
FR5: Operator can view all their listings in one place
FR6: Operator can generate template-based ad copy for a listing, tailored per classifieds platform (KSL, Facebook Marketplace, Craigslist)
FR7: Operator can copy generated ad copy to clipboard for manual posting
FR8: System generates a unique shareable booking link per listing for use in classifieds ads
FR9: Renter can view a listing page with photos, description, pricing, and live availability calendar without authentication
FR10: Renter can select desired rental dates and see the total cost before committing
FR11: Renter can authenticate via phone number and SMS OTP code to proceed with booking
FR12: Renter can review and e-sign a standard rental agreement (terms, liability, rental period, pricing, cancellation/no-show policy)
FR13: System places a Stripe authorization hold on the renter's payment method upon booking confirmation
FR14: Renter receives SMS confirmation with booking details, pickup instructions, and a link to the manage-my-rental dashboard
FR15: System prevents booking on dates that are already booked, blocked, or within a maintenance buffer
FR16: Renter can log in to a universal manage-my-rental dashboard via phone number + SMS OTP
FR17: Renter can view all their rentals (current, upcoming, past) from the dashboard — past rentals are visible for 45 days after completion, then removed
FR18: Renter can extend a current rental by up to 4 additional days within the extension buffer (self-service, no operator approval required)
FR19: System extends the existing payment hold when a renter extends their rental
FR20: Renter can cancel a booking via the dashboard, with refund applied per the flat cancellation policy
FR21: Renter can check in returned equipment through the dashboard (confirm return, report damage, comment on machine operation quality)
FR22: Renter receives SMS return reminder on return date/time with a link to the manage-my-rental dashboard
FR23: System enforces real-time double-booking prevention across all booking and extension actions
FR24: System automatically updates the availability calendar when a booking is created, extended, or cancelled
FR25: System enforces a 5-day post-rental buffer (4 days available for renter extension + 1 mandatory maintenance day)
FR26: System shifts the maintenance buffer when a rental is extended
FR27: System authorizes a payment hold via Stripe at booking time
FR28: System captures the held funds upon rental completion (operator-initiated or automatic)
FR29: System releases the held funds when a booking is cancelled per the flat cancellation policy
FR30: Operator can initiate hold capture for no-show bookings per contract terms
FR31: System tracks cost per transaction (Stripe fees, Twilio SMS costs) for unit economics monitoring
FR32: System applies the platform transaction fee (5–8%) on completed bookings
FR33: System generates a standard rental agreement from a single platform-wide template, populated with listing-specific and booking-specific details
FR34: Renter can review and e-sign the contract as part of the booking flow
FR35: Operator and renter can access signed contracts for any booking
FR36: Operator can view all renter messages in a unified inbox regardless of originating classifieds platform
FR37: Operator can respond to renter messages via the hub, delivered as SMS to the renter
FR38: Renter can send SMS messages to the operator, routed through the platform via Twilio
FR39: System sends automated SMS notifications for: booking confirmation, return reminders, extension confirmations, cancellation confirmations
FR40: Operator receives real-time notifications for bookings, extensions, check-ins, cancellations, and no-shows
FR41: Operator can register and log in to the platform
FR42: Operator can view upcoming, active, and past bookings across all listings
FR43: Operator can view equipment check-in reports submitted by renters (damage reports, condition confirmations)
FR44: Operator can flag a rental as a no-show and initiate hold capture
FR45: Renter can flag unrecognized rentals on their dashboard ("I don't recognize these rentals"), which disassociates the prior rental history from their phone number

### NonFunctional Requirements

NFR1: Renter-facing booking page loads in under 3 seconds on mobile networks
NFR2: Availability calendar reflects current state within 5 seconds of any booking, extension, or cancellation
NFR3: SMS OTP delivery within 30 seconds of request (dependent on Twilio SLA)
NFR4: Booking flow (date selection → auth → contract → payment hold) completable in under 3 minutes with no system-induced delays
NFR5: All data encrypted in transit (TLS) and at rest
NFR6: Payment security delegated entirely to Stripe — no card numbers stored or processed by Everything.Rent
NFR7: Phone numbers stored securely — used as renter identity, must be protected
NFR8: Signed contracts stored immutably — no modification after signing
NFR9: OTP codes expire after 5 minutes and are single-use
NFR10: Operator authentication uses standard secure practices (hashed passwords, session management)
NFR11: Renter phone number disassociation (FR45) must not delete the underlying rental records — only the link to the phone number
NFR12: Target uptime: 99% (~7 hours downtime per month acceptable for MVP)
NFR13: No data loss on system failure — bookings, contracts, and payment states must be durable
NFR14: Stripe webhook handling must be resilient — missed webhooks must be recoverable to avoid payment state drift
NFR15: SMS delivery failures must be logged — if a return reminder or booking confirmation fails to send, the operator should be notified
NFR16: Operator-side records (bookings, contracts, check-in reports, transaction history) retained for 3 years
NFR17: Renter dashboard visibility: 45 days post-completion, then removed from renter view (records still retained operator-side)
NFR18: Disassociated rental records (via FR45) retained for the full 3-year period but no longer linked to a phone number
NFR19: Stripe is core dependency for payment holds, captures, releases, and transaction fee processing — must handle webhook events reliably
NFR20: Twilio is core dependency for bidirectional SMS and OTP authentication — must handle delivery failures gracefully

### Additional Requirements

- Starter template: Initialize project using `npx create-next-app@latest rentingapp -e with-supabase` (Supabase Next.js Starter) — this must be the first implementation story
- Tech stack: Next.js 16+ (App Router), TypeScript strict mode, Tailwind CSS, shadcn/ui, Supabase (PostgreSQL, Auth, Storage, Realtime), Vitest + React Testing Library
- Supabase schema with RLS policies for data-level access control
- Dual auth model: Supabase Auth password-based (operators) + Phone OTP via Twilio (renters), with `app_metadata.role` custom claims (`operator` | `renter`)
- Next.js middleware for route-level protection (redirect unauthenticated users, enforce role-based page access)
- API pattern: Supabase direct reads (RLS-protected) + Next.js Server Actions for mutations + Route Handlers for Stripe/Twilio webhooks
- Structured Result type (`{ success: true, data } | { success: false, error: { code, message } }`) for all Server Actions — no thrown exceptions
- Zod schemas for application-layer validation shared between client forms and Server Actions
- State management: URL search params for navigation state + Zustand with sessionStorage persistence for booking flow state
- Forms: React Hook Form + Zod for all form flows
- Supabase Realtime subscriptions on `bookings` table for live availability calendar updates
- Double-booking prevention: `booking_dates` junction table with unique constraint on `(listing_id, date)` — database-level lock via Supabase RPC transaction
- Stripe hold capped at 7-day default for MVP — extensions beyond hold period covered by signed contract + payment method on file
- Environment management: Varlock (`@varlock/nextjs-integration`) for env var validation, CI scanning, and log redaction
- CI/CD: GitHub Actions (lint + type-check + varlock scan + tests + build), Vercel auto-deploy on merge to main
- Feature-based project structure with `(operator)` and `(renter)` route groups, `lib/actions/` for Server Actions, `lib/schemas/` for Zod schemas, `lib/services/` for third-party wrappers
- Database naming: `snake_case` tables (plural), `snake_case` columns, `{table_singular}_id` foreign keys
- Code naming: `kebab-case` files, PascalCase components, camelCase functions/variables, SCREAMING_SNAKE_CASE constants
- Anti-patterns: no `export default`, no `any` type, no thrown errors from Server Actions, no inline SQL, no manual `isLoading` for Server Actions
- Colocated tests: `widget.ts` / `widget.test.ts`

### UX Design Requirements

UX-DR1: Implement Desert Sunset color system with CSS custom properties (design tokens) — primary amber (#E87B35), primary-dark terracotta (#C45A2D), primary-light peach (#F5C4A1), secondary cool slate (#4A6178), secondary-dark twilight (#2E3E50), secondary-light pale sky (#D5DEE8), plus semantic colors (success, warning, error, info) and neutral scale
UX-DR2: Implement rental lifecycle status color system — Confirmed (success green), Active (primary amber), Return Due (warning gold with subtle pulse), Completed (neutral grey), Cancelled (neutral grey with strikethrough), No-Show (error red), Extension Pending (info slate)
UX-DR3: Implement calendar date visual state system — Available (white/green dot), Selected start/end (amber fill, rounded), Selected range (peach fill), Unavailable/booked (grey), Blocked by operator (grey + hatch), Extension buffer (gold tint), Maintenance (grey + wrench icon), Today (bold ring), Past (grey)
UX-DR4: Implement Inter font family typography scale — display (28px mobile/36px desktop), h1 (24px/30px), h2 (20px/24px), h3 (18px), body (16px), body-medium (16px/500 weight), small (14px), caption (12px), price (24px/28px)
UX-DR5: Implement 4px base unit / 8-point grid spacing system with tokens (space-1 through space-16) applied across all components
UX-DR6: Build custom Availability Calendar component — date-range picker with renter mode (select dates, running total), operator mode (block dates), and operator view mode (read-only with booking details). Real-time via Supabase Realtime. Full keyboard/screen reader accessibility
UX-DR7: Build custom Sticky Bottom Bar component — persistent booking context with dates/total + primary CTA. States: hidden, partial (start date only), ready, processing, extension mode. `role="status"` with `aria-live="polite"`. Safe area padding for notched phones
UX-DR8: Build custom OTP Input component — 6 auto-advancing digit boxes with auto-submit on completion. States: empty, entering, complete, verifying, success, error (shake animation), expired. `inputmode="numeric"` and `autocomplete="one-time-code"` for mobile autofill. 5-minute expiry timer with resend
UX-DR9: Build custom Contract Summary Card component — plain-language 5-6 line summary with expandable full terms accordion. States: collapsed, expanded, signed. "I Agree & Sign" CTA. Signature timestamp
UX-DR10: Build custom Booking Card component — compact booking representation with operator list row variant, operator detail variant, renter active/upcoming/completed variants. Status badge integration. Responsive: horizontal row on desktop, stacked card on mobile
UX-DR11: Build custom Message Thread component — SMS-style conversation with inbound (grey, left) and outbound (amber, right) bubbles, timestamps, platform origin badge in header. Optimistic UI for sending. `role="log"` with `aria-live="polite"`
UX-DR12: Build custom Photo Carousel component — swipeable on mobile, arrow buttons on desktop. Dot indicators with amber active dot. Full-width bleed on mobile, constrained on desktop. Loading skeleton. 16:9 aspect ratio
UX-DR13: Build custom Platform Badge component — small pill showing classifieds origin: KSL (blue #1A7FC4), FB (blue #1877F2), CL (purple #5A1A8A)
UX-DR14: Implement 3-tier button hierarchy — Primary (amber fill, white text, 48px, one per screen), Secondary (neutral fill, 44px), Ghost/Text (no fill, primary text). Verb phrase labels. Destructive actions use error red outline. Loading spinner state. `:focus-visible` outline
UX-DR15: Implement operator dashboard warm gradient sidebar — gradient from terracotta (#C45A2D) to twilight (#2E3E50), white text, peach active item highlight. 240px width, collapsible to 64px icon-only. Notification badges
UX-DR16: Implement operator mobile bottom tab bar — 4 tabs (Listings, Bookings, Messages, More), amber active icon, badge dots, 56px height + safe area padding
UX-DR17: Implement renter booking flow navigation — no persistent nav, linear flow with back arrows and step progress indicator (Dates → Verify → Contract → Payment → Confirmed)
UX-DR18: Implement loading skeleton patterns — warm-tinted skeleton placeholders (primary-light at 30% opacity) matching final layout dimensions. No blank screens, no full-page spinners
UX-DR19: Implement empty state patterns — explanation + action CTA where applicable. Specific messages for: no listings, no bookings, no messages, no rentals, no search results
UX-DR20: Implement micro-interaction animations — date selection (150ms), sticky bar appear (200ms slide-up), total counter (300ms), confirmation checkmark draw-on (600ms), OTP error shake (400ms), toast slide-in (200ms), status badge pulse (2s), card hover shadow (150ms), button press scale (100ms). All respect `prefers-reduced-motion`
UX-DR21: Implement form patterns — phone number input (+1 prefill, auto-format, `inputmode="tel"`), currency input ($ prefix, `inputmode="decimal"`, min $1.00), photo upload (drag-drop/camera, JPEG/PNG/WebP, 10MB max, reorder, hero selection, progress indicator). Validation on blur, labels above inputs, errors inline below field
UX-DR22: Implement renter responsive layout — mobile-first single column, 480px max-width centered on larger screens, 16px horizontal padding, sticky bottom bar with safe area padding. Same layout across all breakpoints
UX-DR23: Implement operator responsive layout — desktop: 240px sidebar + fluid content (1200px max) with 12-column grid; tablet: 64px collapsed sidebar; mobile: bottom tab bar, single column, card-based instead of tables
UX-DR24: Implement WCAG 2.1 AA accessibility — all text meets contrast ratios (4.5:1 normal, 3:1 large), 2px focus indicators on all focusable elements, skip-to-content link, focus trapped in modals, semantic HTML landmarks, calendar keyboard navigation (arrow keys), screen reader ARIA labels for all interactive components
UX-DR25: Implement copy & tone patterns — casual-confident voice, verb-phrase CTA labels ("Book Now" not "Submit"), one-sentence feedback messages, all amounts with $ and commas, dates as "Apr 11" short format, no technical jargon ("hold" not "authorization")
UX-DR26: Implement SMS notification templates — booking confirmation, return reminder, extension confirmation, cancellation confirmation, no-show notification. Concise, emoji-accented, under 160 characters when possible. Include manage-my-rental link

### FR Coverage Map

FR1: Epic 2 — Create listing with photos, description, pricing, calendar
FR2: Epic 2 — Edit listing details
FR3: Epic 2 — Block dates for personal use
FR4: Epic 2 — Delete a listing
FR5: Epic 2 — View all listings
FR6: Epic 2 — Generate template ad copy per platform
FR7: Epic 2 — Copy ad copy to clipboard
FR8: Epic 2 — Generate unique shareable booking link
FR9: Epic 3 — View listing page without auth
FR10: Epic 3 — Select dates, see total cost
FR11: Epic 3 — Authenticate via phone OTP
FR12: Epic 3 — Review and e-sign rental agreement
FR13: Epic 3 — Stripe authorization hold on booking
FR14: Epic 3 — SMS confirmation with booking details
FR15: Epic 3 — Prevent booking on unavailable dates
FR16: Epic 4 — Login to manage-my-rental dashboard
FR17: Epic 4 — View all rentals (45-day past visibility)
FR18: Epic 4 — Extend rental by up to 4 days
FR19: Epic 4 — Extend payment hold on extension
FR20: Epic 4 — Cancel booking with flat policy refund
FR21: Epic 4 — Check in returned equipment
FR22: Epic 4 — SMS return reminder
FR23: Epic 3 — Real-time double-booking prevention
FR24: Epic 3 — Auto-update availability calendar
FR25: Epic 3 — 5-day post-rental buffer enforcement
FR26: Epic 4 — Shift maintenance buffer on extension
FR27: Epic 3 — Authorize payment hold via Stripe
FR28: Epic 5 — Capture funds on completion
FR29: Epic 4 — Release funds on cancellation
FR30: Epic 5 — Capture hold for no-show
FR31: Epic 5 — Track cost per transaction
FR32: Epic 5 — Apply platform transaction fee
FR33: Epic 3 — Generate contract from template
FR34: Epic 3 — E-sign contract during booking
FR35: Epic 5 — Access signed contracts
FR36: Epic 6 — Unified renter message inbox
FR37: Epic 6 — Respond via hub, delivered as SMS
FR38: Epic 6 — Renter sends SMS to operator
FR39: Epic 6 — Automated SMS notifications
FR40: Epic 6 — Real-time operator notifications
FR41: Epic 1 — Operator register and login
FR42: Epic 5 — View bookings across listings
FR43: Epic 5 — View check-in reports
FR44: Epic 5 — Flag no-show, capture hold
FR45: Epic 7 — Disassociate phone from rental history

## Epic List

### Epic 1: Project Foundation & Operator Authentication
Operator can register, log in, and access a functional dashboard shell with the design system in place.
**FRs covered:** FR41
**Also addresses:** Starter template initialization, Supabase schema + RLS, dual auth model setup, design system tokens (UX-DR1-5, UX-DR14-15), CI/CD pipeline, Varlock env config

### Epic 2: Listing Creation & Classifieds Posting
Operator can create listings with photos and pricing, manage availability, generate platform-tailored ad copy, and get shareable booking links to post on classifieds.
**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR8
**Also addresses:** UX-DR6 (calendar operator mode), UX-DR21 (photo upload, currency input), UX-DR19 (empty states), UX-DR23 (operator responsive layout)

### Epic 3: Renter Booking Flow
Renter clicks a classifieds link, views the listing with live availability, selects dates, authenticates via OTP, signs a contract, and places a payment hold — complete end-to-end conversion in under 3 minutes.
**FRs covered:** FR9, FR10, FR11, FR12, FR13, FR14, FR15, FR23, FR24, FR25, FR27, FR33, FR34
**Also addresses:** UX-DR6 (calendar renter mode), UX-DR7 (sticky bar), UX-DR8 (OTP), UX-DR9 (contract card), UX-DR12 (photo carousel), UX-DR17 (booking flow nav), UX-DR20 (micro-interactions), UX-DR22 (renter responsive), UX-DR25 (copy/tone)

### Epic 4: Renter Self-Service (Manage-My-Rental)
Renter can access a universal dashboard to view rentals, extend an active rental, cancel a booking with refund per policy, check in returned equipment, and receive return reminders — all self-service.
**FRs covered:** FR16, FR17, FR18, FR19, FR20, FR21, FR22, FR26, FR29
**Also addresses:** UX-DR10 (booking card renter variants), UX-DR7 (sticky bar extension mode), UX-DR26 (SMS templates for reminders/extensions/cancellations)

### Epic 5: Operator Dashboard & Business Operations
Operator can view all bookings across listings, review check-in reports, flag no-shows and capture holds, access signed contracts, and track transaction costs for unit economics.
**FRs covered:** FR28, FR30, FR31, FR32, FR35, FR42, FR43, FR44
**Also addresses:** UX-DR10 (booking card operator variants), UX-DR18 (loading skeletons), UX-DR23 (operator dashboard layout)

### Epic 6: Communication Hub & Notifications
Operator has a unified inbox for all renter messages regardless of classifieds origin, can respond via the hub (delivered as SMS), and the system sends automated lifecycle notifications for every booking event.
**FRs covered:** FR36, FR37, FR38, FR39, FR40
**Also addresses:** UX-DR11 (message thread), UX-DR13 (platform badge), UX-DR16 (operator mobile tab bar with Messages tab)

### Epic 7: Renter Identity & Data Management
Renter can flag unrecognized rentals to disassociate their phone number from prior history, and the system enforces data retention policies (45-day renter visibility, 3-year operator-side retention).
**FRs covered:** FR45
**Also addresses:** NFR11, NFR16, NFR17, NFR18 (data retention enforcement)

## Epic 1: Project Foundation & Operator Authentication

Operator can register, log in, and access a functional dashboard shell with the design system in place.

### Story 1.1: Initialize Project with Supabase Next.js Starter

As a **developer**,
I want the project scaffolded with the Supabase Next.js starter template, Varlock environment management, and CI/CD pipeline,
So that I have a working development environment with all foundational tooling in place.

**Acceptance Criteria:**

**Given** no project exists yet
**When** the project is initialized using `npx create-next-app@latest rentingapp -e with-supabase`
**Then** Next.js 16+ with App Router, TypeScript strict mode, Tailwind CSS, and shadcn/ui are configured
**And** Supabase local development is configured via `supabase start` (Docker)
**And** Varlock (`@varlock/nextjs-integration`) is installed with `.env.schema` defining all required env vars (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER)
**And** Vitest + React Testing Library are configured with a passing sample test
**And** GitHub Actions CI pipeline runs lint + type-check + varlock scan + tests + build
**And** `.gitignore` excludes `.env.local` and Supabase local data
**And** the `Result<T>` type utility is created in `lib/utils/result.ts` with helper functions

### Story 1.2: Design System Foundation

As an **operator or renter**,
I want the application to have a consistent, professional visual identity,
So that every surface feels trustworthy and cohesive.

**Acceptance Criteria:**

**Given** the project is initialized
**When** the design system tokens are implemented in `globals.css`
**Then** CSS custom properties define the Desert Sunset color system: primary (#E87B35), primary-dark (#C45A2D), primary-light (#F5C4A1), secondary (#4A6178), secondary-dark (#2E3E50), secondary-light (#D5DEE8), success (#3D9A5F), warning (#D4952B), error (#C4392E), and neutral scale (900/700/500/300/100/white)
**And** Inter font is loaded with `font-display: swap` for all weight variants (400, 500, 600, 700)
**And** typography scale tokens are defined (display, h1, h2, h3, body, body-medium, small, caption, price) with mobile-first sizes and desktop overrides at `lg` breakpoint
**And** spacing scale tokens (space-1 through space-16) follow the 4px base / 8-point grid
**And** shadcn/ui theme is customized to use Desert Sunset tokens (primary, destructive, border, input, ring colors)
**And** 3-tier button hierarchy is implemented: Primary (amber fill, 48px, one per screen), Secondary (neutral fill, 44px), Ghost (no fill, primary text)
**And** all primary-on-white text combinations meet WCAG AA contrast (using primary-dark for small text)
**And** `:focus-visible` outline uses primary-dark 2px solid on all focusable elements

### Story 1.3: Operator Registration & Login

As an **operator**,
I want to register with email/password and log in to the platform,
So that I can securely access my rental management dashboard.

**Acceptance Criteria:**

**Given** the Supabase Auth is configured
**When** an operator visits the sign-up page and submits email + password
**Then** a new Supabase Auth user is created with `app_metadata.role = 'operator'`
**And** a row is created in the `profiles` table with the user's ID and role
**And** the operator is redirected to the dashboard

**Given** a registered operator
**When** they visit the sign-in page and submit valid credentials
**Then** they are authenticated and redirected to the dashboard
**And** the session is managed via Supabase Auth cookies (configured by starter middleware)

**Given** an operator has forgotten their password
**When** they request a password reset via email
**Then** they receive a reset link and can set a new password

**Given** an unauthenticated user
**When** they attempt to access any `(operator)` route
**Then** Next.js middleware redirects them to the sign-in page

**Given** an authenticated user with `role = 'renter'`
**When** they attempt to access an `(operator)` route
**Then** they are redirected away (role-based route protection via middleware)

### Story 1.4: Operator Dashboard Shell & Navigation

As an **operator**,
I want a functional dashboard with navigation to all major sections,
So that I have a home base for managing my rental business.

**Acceptance Criteria:**

**Given** an authenticated operator
**When** they access the dashboard
**Then** they see a warm gradient sidebar (terracotta #C45A2D → twilight #2E3E50) with navigation items: Dashboard, Listings, Bookings, Messages, Settings
**And** the sidebar is 240px wide with white text, collapsible to 64px icon-only
**And** the active navigation item is highlighted with primary-light background and left border accent
**And** the main content area uses neutral-100 background with the operator layout wrapper

**Given** a viewport below 768px (mobile)
**When** the operator views the dashboard
**Then** the sidebar is replaced by a bottom tab bar (Listings, Bookings, Messages, More) with primary amber active icon, 56px height + safe area padding

**Given** the operator has no listings yet
**When** they view the dashboard
**Then** they see an empty state: "You haven't created any listings yet. List your first piece of equipment and start getting bookings." with a "Create Listing" primary button

**Given** the operator views any section with no data
**When** the page renders
**Then** warm-tinted skeleton placeholders (primary-light at 30% opacity) appear during loading, matching the final layout dimensions

## Epic 2: Listing Creation & Classifieds Posting

Operator can create listings with photos and pricing, manage availability, generate platform-tailored ad copy, and get shareable booking links to post on classifieds.

### Story 2.1: Create Listing with Photos & Details

As an **operator**,
I want to create a rental listing with photos, description, and daily pricing,
So that I have a professional listing ready for renters.

**Acceptance Criteria:**

**Given** an authenticated operator
**When** they navigate to "New Listing" and complete the 3-step form (Photos → Details → Availability)
**Then** a new listing is created in the `listings` table with all provided data

**Given** the operator is on the Photos step
**When** they upload images (JPEG, PNG, WebP, max 10MB each)
**Then** photos are uploaded to Supabase Storage with progress indicators per photo
**And** thumbnail previews display in a reorderable grid (drag on desktop, long-press on mobile)
**And** the first photo is set as hero by default, changeable by the operator

**Given** the operator is on the Details step
**When** they fill in equipment name, description, daily rate, pickup location, and pickup instructions
**Then** inline validation fires on blur (required fields, daily rate minimum $1.00)
**And** the currency input shows a $ prefix with `inputmode="decimal"` and auto-formats to 2 decimal places on blur

**Given** the operator completes all steps
**When** they review the listing preview (matching the renter-facing layout)
**Then** they can go back to edit any step or tap "Publish Listing"
**And** on publish, a success toast shows "Listing published!" and the posting assistant appears

### Story 2.2: Manage Availability Calendar (Operator Mode)

As an **operator**,
I want to block dates on my listing's availability calendar for personal use,
So that renters can only book dates when the equipment is truly available.

**Acceptance Criteria:**

**Given** an operator is viewing their listing's availability page
**When** they tap dates on the calendar
**Then** dates toggle between available (white) and blocked (grey + diagonal hatch pattern)
**And** the operator can tap a range to block multiple consecutive dates

**Given** dates are blocked by the operator
**When** a renter views the listing's availability calendar
**Then** blocked dates appear as unavailable (grey background, not tappable)

**Given** the calendar component is in operator mode
**When** it renders
**Then** it shows a month view with prev/next navigation, 7-column day grid
**And** keyboard navigation works: arrow keys between dates, Enter/Space toggles block state
**And** screen reader announces: "[Date], [state]" (e.g., "April 11, available" or "April 13, blocked")
**And** on mobile, cells are minimum 44px height for tap targets

### Story 2.3: Edit & Delete Listings

As an **operator**,
I want to edit my listing's details, photos, pricing, and availability, or delete a listing entirely,
So that I can keep my listings accurate and remove equipment I no longer rent.

**Acceptance Criteria:**

**Given** an operator views a listing's detail page
**When** they tap "Edit"
**Then** they see the same 3-step form pre-populated with existing data
**And** they can modify any field, add/remove/reorder photos, and save changes

**Given** an operator wants to delete a listing
**When** they tap "Delete" on a listing
**Then** a confirmation dialog appears: "Delete this listing? This action cannot be undone."
**And** on confirm, the listing is soft-deleted and no longer visible to renters or on the operator's listing index

**Given** a listing has active or upcoming bookings
**When** the operator attempts to delete it
**Then** the system warns: "This listing has active bookings. Cancel or complete them before deleting."

### Story 2.4: View All Listings

As an **operator**,
I want to see all my listings in one place,
So that I can quickly manage my rental inventory.

**Acceptance Criteria:**

**Given** an authenticated operator with listings
**When** they navigate to the Listings page
**Then** they see a card grid of all listings, each showing: hero photo thumbnail, equipment name, daily rate, and availability summary (e.g., "3 of next 7 days booked")
**And** each card has edit/delete action links

**Given** an operator with no listings
**When** they view the Listings page
**Then** they see the empty state: "You haven't created any listings yet. List your first piece of equipment and start getting bookings." with a "Create Listing" primary button

**Given** the operator is on mobile
**When** they view the Listings page
**Then** listing cards stack vertically in a single column

### Story 2.5: Posting Assistant & Booking Links

As an **operator**,
I want platform-tailored ad copy and a shareable booking link for each listing,
So that I can post on KSL, Facebook Marketplace, and Craigslist in minutes.

**Acceptance Criteria:**

**Given** a published listing
**When** the operator views the posting assistant (appears after publish, also accessible from listing detail)
**Then** three tabs display (KSL / Facebook / Craigslist), each showing generated template-based ad copy tailored to that platform's style
**And** each tab includes the listing's unique shareable booking link (e.g., `/book/[listing-id]`)

**Given** the operator taps "Copy" on a platform tab
**When** the ad copy + booking link are copied to clipboard
**Then** a toast shows "Copied to clipboard!" with a green checkmark, auto-dismissing after 3 seconds
**And** a green checkmark appears on the copied tab

**Given** the system generates a booking link
**When** the listing is published
**Then** a unique URL is generated per listing (not per platform) for use in classifieds ads
**And** the URL is stable and does not change on listing edits

## Epic 3: Renter Booking Flow

Renter clicks a classifieds link, views the listing with live availability, selects dates, authenticates via OTP, signs a contract, and places a payment hold — complete end-to-end conversion in under 3 minutes.

### Story 3.1: Renter Listing Page & Photo Carousel

As a **renter**,
I want to view a professional listing page with photos, description, pricing, and live availability from a classifieds link,
So that I can evaluate the equipment before deciding to book.

**Acceptance Criteria:**

**Given** a renter taps a booking link from a classifieds ad
**When** the listing page loads
**Then** it loads in under 3 seconds on mobile networks (NFR1)
**And** warm-tinted skeleton placeholders show during loading, matching final layout

**Given** the listing page is loaded
**When** the renter views it
**Then** they see: photo carousel hero, equipment title + daily rate above the fold, description, pickup location
**And** no authentication is required to view any of this content

**Given** the listing has multiple photos
**When** the renter views the photo carousel
**Then** photos are swipeable on mobile with dot indicators (amber active dot) and photo counter ("2 / 4")
**And** on desktop, arrow buttons appear on hover
**And** the carousel is full-width bleed on mobile, constrained to content max-width on desktop
**And** `aria-roledescription="carousel"` with each slide labeled "Photo [n] of [total]"

**Given** any renter device
**When** the page renders
**Then** layout is single-column, 480px max-width centered, 16px horizontal padding (mobile-first responsive)

### Story 3.2: Availability Calendar (Renter Mode) & Date Selection

As a **renter**,
I want to see live availability and select my rental dates with a running cost total,
So that I know exactly what's available and what it costs before committing.

**Acceptance Criteria:**

**Given** the renter scrolls to the availability calendar
**When** it renders
**Then** available dates show white background with subtle green dot, unavailable/booked dates show grey (not tappable), operator-blocked dates show grey (not tappable), past dates show grey (not tappable), today has a bold ring
**And** maintenance buffer days show grey with wrench icon (not tappable)
**And** the calendar subscribes to Supabase Realtime on the `bookings` table for live updates

**Given** the renter taps a start date
**When** the date is available
**Then** it fills with primary amber (left-rounded) and the sticky bottom bar slides up (200ms ease-out) showing the selected date
**And** the bar shows "Select return date" with the CTA button disabled

**Given** a start date is selected
**When** the renter taps an end date
**Then** the date range highlights: start (amber, left-rounded), range (peach fill), end (amber, right-rounded)
**And** the sticky bottom bar updates: "Apr 11 – 12 (2 days)" / "$700" with "Book Now" button active
**And** the total counter animates (300ms)

**Given** dates are selected
**When** availability changes via Realtime (another renter books overlapping dates)
**Then** the calendar refreshes and if selected dates are now unavailable, the selection clears with message: "Sorry, these dates were just booked. Please select different dates."

**Given** the calendar renders on any device
**When** a keyboard user navigates
**Then** arrow keys move between dates, Enter/Space selects, screen reader announces "[Date], [state]"
**And** current selection announced as range: "Selected April 11 to April 12, 2 days, $700"

### Story 3.3: Renter Phone OTP Authentication

As a **renter**,
I want to verify my identity with my phone number and a text code,
So that I can proceed to book securely without creating an account.

**Acceptance Criteria:**

**Given** the renter taps "Book Now" in the sticky bar
**When** the phone verification screen appears
**Then** it shows "Enter your phone number to continue" with a phone input pre-filled with +1 country code
**And** the input uses `inputmode="tel"` and auto-formats as (801) 555-1234
**And** "Send Code" button enables only when a valid 10-digit number is entered
**And** a step progress indicator shows the current position (Dates → **Verify** → Contract → Payment → Confirmed)

**Given** the renter submits a valid phone number
**When** the Server Action fires
**Then** it checks the `otp_attempts` table for rate limiting (1 OTP per phone per 60 seconds)
**And** if rate limited, returns `{ success: false, error: { code: 'OTP_RATE_LIMITED', message: 'Please wait 60 seconds...' } }`
**And** if allowed, triggers Supabase Auth Phone OTP via Twilio and shows the OTP input screen

**Given** the OTP input screen is shown
**When** the renter enters digits
**Then** 6 individual boxes auto-advance on each digit entry
**And** auto-submits on the 6th digit (no "Verify" button needed)
**And** `inputmode="numeric"` and `autocomplete="one-time-code"` enable mobile autofill
**And** a 5-minute countdown timer displays, with "Resend code" link appearing after 30 seconds

**Given** the OTP code is invalid
**When** verification fails
**Then** boxes shake (400ms horizontal shake), borders turn error red, "Invalid code, try again" appears below
**And** input clears and refocuses on the first box

**Given** the OTP code is valid
**When** verification succeeds
**Then** boxes flash success green briefly
**And** a Supabase Auth session is created with `app_metadata.role = 'renter'`
**And** the renter transitions to the contract screen

### Story 3.4: Digital Contract Signing

As a **renter**,
I want to review and sign a rental agreement as part of booking,
So that both parties have clear, documented terms for the rental.

**Acceptance Criteria:**

**Given** the renter reaches the contract step
**When** the contract summary card renders
**Then** it shows a plain-language 5-6 line summary: rental period and dates, daily rate and total, cancellation policy ("Cancel 48+ hours before for a full refund. Within 48 hours, the hold is non-refundable."), liability summary, no-show policy
**And** a "View Full Terms" link expands the full legal text via smooth accordion animation (250ms)
**And** "I Agree & Sign" primary button is at the bottom

**Given** the contract is generated
**When** the system creates it
**Then** it uses the single platform-wide template populated with listing-specific (equipment name, daily rate, pickup instructions) and booking-specific (dates, total, renter phone) details
**And** the contract is stored in the `contracts` table

**Given** the renter taps "I Agree & Sign"
**When** the signature is recorded
**Then** the contract record updates with signature timestamp and renter identity (phone number)
**And** the contract becomes immutable — no further modifications allowed (NFR8)
**And** a green checkmark replaces the button with "Signed by (XXX) XXX-XXXX on [date/time]"
**And** the renter transitions to the payment screen

**Given** a screen reader user
**When** they interact with the contract
**Then** summary uses body (16px) size, full terms are in an expandable region with `aria-expanded`, and the sign button clearly describes the action consequence

### Story 3.5: Stripe Payment Hold & Booking Confirmation

As a **renter**,
I want to authorize a payment hold to confirm my booking,
So that the equipment is reserved for me and the operator has financial commitment.

**Acceptance Criteria:**

**Given** the renter reaches the payment step
**When** the payment screen renders
**Then** Apple Pay / Google Pay button is prominent at the top (large)
**And** below a divider ("or pay with card"), the Stripe Payment Element shows for manual card entry
**And** one-line hold explanation: "We'll hold $[amount] — you're only charged when the rental completes."
**And** the hold amount is displayed prominently

**Given** the renter taps Apple Pay / Google Pay
**When** biometric confirmation succeeds
**Then** the system creates a Stripe PaymentIntent with `capture_method: manual` for the booking total
**And** the `stripe_payment_intent_id` is stored in the `bookings` table

**Given** the payment hold is authorized
**When** the booking is created
**Then** a row is inserted in `bookings` with status `confirmed`
**And** rows are inserted in `booking_dates` for each booked calendar day (unique constraint on `listing_id, date` prevents double-booking — FR23)
**And** the availability calendar updates via Supabase Realtime (FR24)
**And** the 5-day post-rental buffer is enforced: 4 extension days + 1 maintenance day blocked after the rental end date (FR25)

**Given** two renters simultaneously attempt to book overlapping dates
**When** both Server Actions execute
**Then** the unique constraint on `booking_dates(listing_id, date)` causes one to fail
**And** the failed booking returns `{ success: false, error: { code: 'BOOKING_CONFLICT', message: 'Sorry, these dates were just booked. Please select different dates.' } }`
**And** the calendar refreshes to show updated availability

**Given** the booking is confirmed
**When** the confirmation screen renders
**Then** a green checkmark draw-on animation (600ms) plays with booking summary: equipment, dates, total held, pickup location/instructions
**And** a "Manage Your Rental" link button is shown
**And** an SMS confirmation is sent simultaneously via Twilio (FR14): booking details, pickup instructions, manage-my-rental link
**And** the operator receives a real-time notification: "New booking! [Equipment] — [dates] — $[amount] held"

**Given** the payment fails
**When** the Stripe hold is declined
**Then** an error shows below the payment form: "Payment failed — please try another method."
**And** the payment form remains (no page reload), the renter can retry with a different method

### Story 3.6: Booking Flow State Persistence

As a **renter**,
I want my booking progress saved if I accidentally refresh the page,
So that I don't lose my work mid-booking.

**Acceptance Criteria:**

**Given** a renter is partway through the booking flow (any step)
**When** they refresh the page or navigate away and return
**Then** their progress is restored: selected dates (via URL params), OTP verification status and contract acceptance (via Zustand with sessionStorage persistence)
**And** they resume at the step they left off

**Given** the booking flow uses URL params for navigation state
**When** dates are selected
**Then** the URL updates with selected date range and listing ID (shareable, bookmarkable state)

**Given** the renter's OTP session expires
**When** they return to the booking flow
**Then** they are prompted to re-verify via OTP before proceeding past the verification step

## Epic 4: Renter Self-Service (Manage-My-Rental)

Renter can access a universal dashboard to view rentals, extend an active rental, cancel a booking with refund per policy, check in returned equipment, and receive return reminders — all self-service.

### Story 4.1: Manage-My-Rental Dashboard & Rental Cards

As a **renter**,
I want a universal dashboard where I can see all my rentals,
So that I have one place to manage everything.

**Acceptance Criteria:**

**Given** a renter navigates to the manage-my-rental URL
**When** they are not authenticated
**Then** they are prompted to enter their phone number and verify via OTP (reusing the OTP flow from Epic 3)

**Given** an authenticated renter
**When** they view the My Rentals dashboard
**Then** they see a card per rental: equipment photo thumbnail, equipment name, dates, status badge, and contextual action buttons
**And** cards are ordered: active rentals first, then upcoming, then past

**Given** a renter has past rentals
**When** they view the dashboard
**Then** past rentals are visible for 45 days after completion, then removed from view (FR17)
**And** past rental cards show "Completed" grey muted badge with no actions (view only)

**Given** a renter has no rentals
**When** they view the dashboard
**Then** they see: "You don't have any rentals. Find equipment on KSL or Facebook Marketplace to get started."

**Given** the renter is on mobile
**When** they view the dashboard
**Then** layout is single column, 480px max-width centered, with simple header "Everything.Rent" + "My Rentals"
**And** each rental card shows thumbnail left, info right, actions as full-width buttons below

**Given** active rental cards
**When** they render
**Then** status badges use the lifecycle color system: Confirmed (success green), Active (primary amber), Return Due (warning gold with subtle pulse)
**And** contextual actions shown: "Extend Rental" for active/return due, "Cancel Booking" for upcoming, "Check In" for return due

### Story 4.2: Extend Rental

As a **renter**,
I want to extend my current rental by up to 4 additional days,
So that I can keep the equipment longer without negotiating with the operator.

**Acceptance Criteria:**

**Given** a renter taps "Extend Rental" on an active rental
**When** the extension screen renders
**Then** it shows: current rental summary (dates, amount), available extension days as tappable day chips (+1 day, +2 days, +3 days, +4 days max)
**And** unavailable extension days are greyed with reason ("Booked" or "Maintenance day")
**And** new return date, additional cost, and new total update live as days are selected
**And** cost math is transparent: "$350/day × 1 additional day = $350 more. New total: $1,050"

**Given** the renter selects extension days and taps "Confirm Extension"
**When** the Server Action executes
**Then** the booking's end date extends by the selected days
**And** new rows are inserted in `booking_dates` for the additional days (unique constraint prevents conflicts)
**And** the maintenance buffer shifts to after the new end date (FR26)
**And** the existing Stripe payment hold is extended to cover the new total (FR19)

**Given** the extension is confirmed
**When** the confirmation screen renders
**Then** a green checkmark shows "Rental extended!" with new dates and new total hold
**And** SMS confirmation sent to renter with updated details
**And** operator notified: "Marcus extended his rental by 1 day. New return date: Monday. Updated hold: $1,050."

**Given** the Stripe hold extension fails
**When** the payment method is declined
**Then** an error shows: "Payment issue — please update your payment method or contact the operator."
**And** the extension is not applied

### Story 4.3: Cancel Booking

As a **renter**,
I want to cancel a booking via my dashboard with a clear refund based on the cancellation policy,
So that I can back out if my plans change and know exactly what happens financially.

**Acceptance Criteria:**

**Given** a renter taps "Cancel Booking" on an upcoming rental
**When** the cancellation screen renders and it is more than 48 hours before the rental start
**Then** the screen shows: "Full refund — hold will be released" with the hold amount
**And** a "Confirm Cancellation" button (error red outline, destructive styling)

**Given** the cancellation is within 48 hours of rental start
**When** the cancellation screen renders
**Then** it shows: "Per the cancellation policy, no refund within 48 hours." with an amber warning box
**And** the "Confirm Cancellation" button is still available

**Given** the renter confirms cancellation
**When** the Server Action executes
**Then** the booking status updates to `cancelled`
**And** the Stripe hold is released (full refund) or captured (no refund) per the policy (FR29)
**And** rows are removed from `booking_dates`, freeing the calendar
**And** the availability calendar updates via Realtime
**And** SMS confirmation sent to renter: cancellation confirmed with refund status
**And** operator notified with calendar dates freed

### Story 4.4: Equipment Check-In

As a **renter**,
I want to confirm equipment return and report its condition,
So that there's a documented record of the return for both parties.

**Acceptance Criteria:**

**Given** a renter taps "Check In" on a return-due or active rental
**When** the check-in screen renders
**Then** it shows: equipment name + photo, "Confirm returned to [location]" checkbox, condition selector (Good condition / Damage to report / Operational issue) as card-style radio options

**Given** the renter selects "Good condition"
**When** they proceed
**Then** an optional comment field appears
**And** they can tap "Submit Check-In" (3 taps total for the happy path)

**Given** the renter selects "Damage to report"
**When** they proceed
**Then** a damage description textarea and optional photo upload appear
**And** photos upload to Supabase Storage with progress indicators

**Given** the renter selects "Operational issue"
**When** they proceed
**Then** an issue description textarea appears

**Given** the renter submits the check-in
**When** the Server Action executes
**Then** a check-in record is created in the database with condition, comments, and any photos
**And** the booking status transitions toward completion
**And** confirmation screen shows "Check-in complete — thanks!"
**And** operator receives the check-in report on their dashboard (visible in Epic 5)

### Story 4.5: SMS Return Reminder

As a **renter**,
I want to receive an SMS reminder on my return date with a link to manage my rental,
So that I don't forget to return the equipment or can easily extend if needed.

**Acceptance Criteria:**

**Given** a booking has an active rental with a return date of today
**When** the scheduled notification triggers
**Then** an SMS is sent to the renter: concise, emoji-accented, under 160 characters, including manage-my-rental link
**And** example: "📦 Your Mini Excavator rental return is today. Manage your rental: [link]"

**Given** the SMS fails to deliver
**When** the Twilio delivery callback indicates failure
**Then** the failure is logged in the `sms_log` table
**And** the operator is notified: "SMS to [renter] failed to send."

**Given** the renter taps the manage-my-rental link in the SMS
**When** they authenticate via OTP
**Then** they land on their My Rentals dashboard with the active rental card prominent, showing "Check In" and "Extend Rental" actions

## Epic 5: Operator Dashboard & Business Operations

Operator can view all bookings across listings, review check-in reports, flag no-shows and capture holds, access signed contracts, and track transaction costs for unit economics.

### Story 5.1: Operator Bookings View

As an **operator**,
I want to view all bookings across my listings with filtering by status,
So that I can quickly see what's happening with my rental business.

**Acceptance Criteria:**

**Given** an authenticated operator
**When** they navigate to the Bookings page
**Then** they see a list of all bookings with status filter tabs at top: All / Active / Upcoming / Completed / No-Show
**And** each booking row shows: renter avatar (initials), renter name, equipment name, dates, status badge (lifecycle colors), and held/captured amount

**Given** the operator is on desktop (>=1024px)
**When** they view the bookings list
**Then** each booking displays as a single horizontal row with all info inline
**And** warm-tinted skeleton placeholders show during loading

**Given** the operator is on mobile (<768px)
**When** they view the bookings list
**Then** bookings display as stacked cards: info on top, status + amount below, expand for actions

**Given** the operator has no bookings
**When** they view the Bookings page
**Then** they see: "No bookings yet. Once you post your listing on classifieds, bookings will appear here."

**Given** the operator applies a status filter
**When** they tap a filter tab (e.g., "Active")
**Then** only bookings matching that status display
**And** if no matches: "No bookings match this filter." with a "Clear filters" link

### Story 5.2: Booking Detail & Contract Access

As an **operator**,
I want to view full booking details and access the signed contract,
So that I have complete information about every rental transaction.

**Acceptance Criteria:**

**Given** an operator taps a booking row
**When** the booking detail page renders
**Then** it shows: renter name, phone number, equipment name, rental dates, status badge, held/captured amount, signed contract link, pickup instructions, and check-in report (if submitted)

**Given** the operator taps the signed contract link
**When** the contract viewer renders
**Then** it shows the read-only signed contract with all terms, renter signature, and timestamp
**And** the contract is clearly marked "Signed [date]"
**And** a download option is available
**And** the contract is immutable — no edit actions shown

**Given** the booking has a check-in report
**When** the operator views the booking detail
**Then** the check-in report section shows: condition (Good/Damage/Issue), renter comments, uploaded photos (if any), and submission timestamp

### Story 5.3: No-Show Flagging & Hold Capture

As an **operator**,
I want to flag a rental as a no-show and capture the held funds,
So that I'm financially protected when a renter doesn't show up.

**Acceptance Criteria:**

**Given** a booking is past its start date and the renter hasn't picked up
**When** the operator views the booking on their dashboard
**Then** a "Flag as No-Show" button appears (error red outline, not aggressive — it's an option, not a suggestion)

**Given** the operator taps "Flag as No-Show"
**When** the confirmation dialog appears
**Then** it shows: "Flag this booking as a no-show? Per the signed contract, you can capture the held funds."
**And** displays: contract terms excerpt (no-show policy), hold amount, renter info
**And** two actions: Cancel / Confirm No-Show

**Given** the operator confirms the no-show flag
**When** the Server Action executes
**Then** the booking status updates to `no_show`
**And** a separate "Capture Hold" button appears on the booking detail (two-step process — flag then capture prevents accidental charge)

**Given** the operator taps "Capture Hold"
**When** the capture confirmation appears: "Capture $[amount] from held funds?"
**Then** on confirm, Stripe captures the held amount (FR30)
**And** the status badge updates to "No-Show — Captured" (error red + "Captured" sub-label)
**And** the calendar dates are freed for future bookings
**And** the renter receives SMS notification: booking marked as no-show, funds captured per contract
**And** a transaction record is created

**Given** the operator flags but doesn't capture immediately
**When** they return to the booking later
**Then** the "Capture Hold" button is still available until the Stripe hold expires

### Story 5.4: Payment Capture on Completion & Transaction Fee Tracking

As an **operator**,
I want completed rentals to have their payment captured and transaction costs tracked,
So that I earn revenue and can monitor my unit economics.

**Acceptance Criteria:**

**Given** a booking is completed (renter checked in equipment)
**When** the operator views the booking or initiates capture
**Then** they can capture the held funds via a "Capture Payment" action
**And** on capture, Stripe captures the full held amount (FR28)
**And** the platform transaction fee (5-8%) is calculated and recorded (FR32)

**Given** a payment capture occurs (completion or no-show)
**When** the transaction is recorded
**Then** the system tracks: Stripe processing fees, estimated Twilio SMS costs for the booking lifecycle, platform transaction fee amount, and net operator revenue (FR31)
**And** this data is stored in a `transactions` table linked to the booking

**Given** the operator views the dashboard
**When** stat cards render
**Then** they see at-a-glance metrics: active rentals count, upcoming bookings count, and monthly revenue (sum of captured payments minus fees)

### Story 5.5: Operator Dashboard Home & At-a-Glance Stats

As an **operator**,
I want a dashboard home that shows me everything important at a glance,
So that my daily check-in takes 30 seconds if nothing needs attention.

**Acceptance Criteria:**

**Given** an authenticated operator with active business
**When** they view the Dashboard home page
**Then** they see 4 stat cards: Active Rentals (count), Monthly Revenue (captured amount), Upcoming Bookings (count), Utilization (% of days booked across listings)
**And** below the stats, a recent bookings list with status badges showing the latest activity

**Given** items need operator attention
**When** the dashboard renders
**Then** notification badges appear on sidebar nav items: Messages (unread count), Bookings (new booking count)
**And** an alert card shows for urgent items (e.g., "Renter hasn't picked up — [Equipment] booking for today")

**Given** nothing needs attention
**When** the dashboard renders
**Then** the operator sees green/neutral status indicators and can close the app in 30 seconds
**And** the default state communicates "everything's handled"

**Given** the operator views the dashboard on mobile
**When** the page renders
**Then** stat cards stack in a 2x2 grid, recent bookings stack vertically

## Epic 6: Communication Hub & Notifications

Operator has a unified inbox for all renter messages regardless of classifieds origin, can respond via the hub (delivered as SMS), and the system sends automated lifecycle notifications for every booking event.

### Story 6.1: Twilio Webhook & Inbound SMS Handling

As an **operator**,
I want renter SMS messages routed through the platform and stored,
So that all communication is captured regardless of which classifieds platform the renter came from.

**Acceptance Criteria:**

**Given** a renter sends an SMS to the platform's Twilio phone number
**When** Twilio forwards the message to `/api/webhooks/twilio`
**Then** the Route Handler verifies the Twilio request signature
**And** the message is stored in the `messages` table with: sender phone, content, timestamp, and conversation reference
**And** the conversation is linked to the renter's phone number and any associated booking/listing

**Given** a new message arrives from a renter
**When** the message is stored
**Then** Supabase Realtime pushes the update to the operator's message hub (if open)
**And** the operator receives a real-time notification (badge count increments on Messages nav item)

**Given** a renter sends a message but has no prior conversation
**When** the system processes the inbound SMS
**Then** a new conversation is created, associated with the renter's phone number
**And** if the phone number matches a booking, the conversation links to that booking's listing and platform origin

### Story 6.2: Operator Message Hub — Conversation List & Thread View

As an **operator**,
I want a unified inbox where I can see all renter conversations and respond,
So that I never miss a message regardless of which platform the renter found me on.

**Acceptance Criteria:**

**Given** an authenticated operator navigates to Messages
**When** the message hub renders on desktop (>=1024px)
**Then** it shows a two-panel layout: conversation list (left, ~300px) and active thread (right, fluid)
**And** each conversation shows: renter name (or phone number), platform origin badge (KSL blue / FB blue / CL purple), last message preview, and timestamp
**And** unread conversations show a bold indicator

**Given** the operator is on mobile (<768px)
**When** they view Messages
**Then** they see the conversation list only (single panel)
**And** tapping a conversation navigates to the thread view with back navigation

**Given** the operator selects a conversation
**When** the thread renders
**Then** messages display as SMS-style bubbles: inbound (renter, left-aligned, grey) and outbound (operator, right-aligned, primary amber)
**And** timestamp separators appear between message groups
**And** the thread auto-scrolls to the latest message
**And** the thread header shows: renter name, phone number, and platform origin badge

**Given** the operator has no messages
**When** they view the Messages page
**Then** they see: "No messages yet. When renters reach out, conversations will appear here."

**Given** a screen reader user navigates the thread
**When** messages render
**Then** the container uses `role="log"` with `aria-live="polite"` and each message announces sender, content, and timestamp

### Story 6.3: Operator Sends Reply via Hub

As an **operator**,
I want to reply to renters from the message hub, delivered as SMS,
So that I can communicate without leaving the platform or sharing my personal phone number.

**Acceptance Criteria:**

**Given** the operator is viewing a conversation thread
**When** they type a message in the input bar at the bottom and tap send (or press Enter)
**Then** the message bubble appears immediately (optimistic UI) with "Sending..." indicator
**And** the Server Action sends the SMS via Twilio to the renter's phone number
**And** on success, the bubble updates to "Sent"

**Given** the SMS fails to send
**When** the Twilio API returns an error
**Then** the outbound bubble shows an error red indicator with "Retry" link
**And** the failure is logged in the `sms_log` table

**Given** the operator is composing a message
**When** the input is focused
**Then** the send button enables when text is present
**And** `aria-label="Reply to [renter name]"` is set on the input
**And** Shift+Enter creates a newline, Enter sends the message

### Story 6.4: Automated Lifecycle SMS Notifications

As a **renter or operator**,
I want automated SMS notifications at every booking lifecycle event,
So that I always know what's happening without checking a dashboard.

**Acceptance Criteria:**

**Given** a booking is confirmed
**When** the booking Server Action completes
**Then** the renter receives SMS: "✅ Booking Confirmed! [Equipment] — [dates]. Pickup: [instructions]. Manage: [link]"
**And** the operator receives SMS/notification: "New booking! [Equipment] — [dates] — $[amount] held"

**Given** a rental extension is confirmed
**When** the extension Server Action completes
**Then** the renter receives SMS: "📅 Rental Extended! [Equipment] now through [new date]. New total: $[amount]. Manage: [link]"
**And** the operator receives notification: "[Renter] extended rental by [N] day(s). New return: [date]. Updated hold: $[amount]"

**Given** a booking is cancelled
**When** the cancellation Server Action completes
**Then** the renter receives SMS: "Booking cancelled. [Refund status based on policy]. Details: [link]"
**And** the operator receives notification: "[Renter] cancelled booking for [Equipment] — [dates]. Calendar dates freed."

**Given** a booking is flagged as no-show with hold captured
**When** the capture Server Action completes
**Then** the renter receives SMS: "Your booking for [Equipment] was marked as a no-show. $[amount] captured per your signed contract."

**Given** a check-in is submitted
**When** the check-in Server Action completes
**Then** the operator receives notification: "[Renter] submitted check-in for [Equipment]. Condition: [Good/Damage/Issue]."

**Given** all SMS notifications
**When** they are composed
**Then** they use concise, emoji-accented copy under 160 characters when possible
**And** renter-facing SMS include the manage-my-rental link
**And** delivery failures are logged in `sms_log` with operator notification

### Story 6.5: Real-Time Operator Notifications

As an **operator**,
I want real-time alerts for all important booking events,
So that I can respond quickly when something needs my attention.

**Acceptance Criteria:**

**Given** any booking lifecycle event occurs (new booking, extension, check-in, cancellation, no-show)
**When** the event is processed
**Then** the operator receives a real-time notification via Supabase Realtime
**And** a toast notification appears (top-right on desktop, top-center on mobile) with desert sunset accent, auto-dismissing after 5 seconds
**And** the relevant sidebar nav item badge count increments (Bookings for booking events, Messages for new messages)

**Given** the operator is not currently viewing the dashboard
**When** a booking event occurs
**Then** the notification badge counts update when the operator next loads any operator page
**And** the dashboard alert card shows urgent items (e.g., no-show situations)

**Given** an SMS delivery failure occurs
**When** Twilio reports the failure
**Then** the operator receives a toast: "SMS to [renter] failed to send. Message saved — retry?"

## Epic 7: Renter Identity & Data Management

Renter can flag unrecognized rentals to disassociate their phone number from prior history, and the system enforces data retention policies (45-day renter visibility, 3-year operator-side retention).

### Story 7.1: Renter Phone Number Disassociation

As a **renter**,
I want to flag rentals I don't recognize on my dashboard,
So that my phone number is no longer linked to someone else's rental history if my number was recycled or misused.

**Acceptance Criteria:**

**Given** an authenticated renter views their My Rentals dashboard
**When** they see rentals they don't recognize
**Then** a "I don't recognize these rentals" action is available

**Given** the renter taps "I don't recognize these rentals"
**When** a confirmation dialog appears
**Then** it explains: "This will remove all current rental history from your dashboard. Any future bookings you make will appear normally."
**And** two actions: Cancel / Confirm Disassociation

**Given** the renter confirms disassociation
**When** the Server Action executes
**Then** the link between the renter's phone number and all prior rental records is removed
**And** the underlying rental records (bookings, contracts, check-in reports, transaction history) are NOT deleted — they remain in the database for operator access and the 3-year retention period (NFR11, NFR18)
**And** the renter's dashboard now shows no past rentals
**And** future bookings made with this phone number create new associations normally

**Given** an operator views a disassociated booking
**When** they access the booking detail
**Then** the booking record still exists with all data intact (contract, payment, check-in)
**And** the renter identity field shows the original phone number but is marked as "disassociated"

### Story 7.2: Data Retention Policy Enforcement

As a **platform operator**,
I want the system to enforce data retention rules automatically,
So that renter privacy is respected while operator records are preserved for business needs.

**Acceptance Criteria:**

**Given** a renter's booking was completed more than 45 days ago
**When** the renter views their My Rentals dashboard
**Then** the completed booking no longer appears in their rental list (NFR17)
**And** the booking record still exists in the database for operator access

**Given** the renter dashboard query executes
**When** it fetches rentals
**Then** it includes a filter: `WHERE completed_at > NOW() - INTERVAL '45 days'` for past rentals
**And** operator queries have no such filter — operators see the full history

**Given** any booking, contract, check-in report, or transaction record exists
**When** it was created within the last 3 years
**Then** it remains in the database and accessible to the operator (NFR16)

**Given** a disassociated rental record
**When** the 3-year retention period has not expired
**Then** the record is retained with all data intact but no phone number link (NFR18)
**And** the operator can still access the record via the bookings view
