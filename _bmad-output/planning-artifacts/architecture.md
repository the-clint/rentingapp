---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
inputDocuments:
  - prd.md
  - product-brief-rentingapp-distillate.md
  - ux-design-specification.md
workflowType: 'architecture'
project_name: 'rentingapp'
user_name: 'Clint'
date: '2026-04-04'
lastStep: 8
status: 'complete'
completedAt: '2026-04-04'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**

45 FRs across 9 capability areas. Architecturally, these cluster into four subsystems:

1. **Listing & Content Management** (FR1-8) — CRUD operations for listings, photo storage, template-based ad copy generation, and unique booking link creation. Relatively straightforward data management with file/image upload.

2. **Booking Engine** (FR9-15, FR16-22, FR23-26) — The core complexity. Real-time availability calendar, date-range selection with double-booking prevention, OTP authentication gate, digital contract generation/signing, and the manage-my-rental self-service dashboard (extensions, cancellations, check-ins). The scheduling engine enforces a 5-day post-rental buffer (4 extension + 1 maintenance) that shifts dynamically.

3. **Payment Lifecycle** (FR27-32) — Stripe authorization holds at booking, capture on completion/no-show, release on cancellation, hold extension on rental extension. Transaction fee tracking (5-8% take rate). Payment state must stay synchronized with booking state — these are tightly coupled.

4. **Communication Hub** (FR36-40, FR45) — Twilio-powered bidirectional SMS between renters and operator, unified inbox regardless of classifieds origin, automated lifecycle notifications (booking confirmation, return reminders, extension/cancellation confirmations). Phone number as renter identity with disassociation capability.

**Non-Functional Requirements:**

- **Performance:** Booking page <3s load on mobile, calendar updates <5s, OTP delivery <30s, full booking flow <3 minutes
- **Security:** TLS everywhere, Stripe handles all payment data (no PCI scope), immutable signed contracts, OTP codes expire in 5 minutes, phone numbers protected
- **Reliability:** 99% uptime target, no data loss on failure, resilient Stripe webhook handling, SMS failure logging with operator notification
- **Data Retention:** 3-year operator-side records, 45-day renter dashboard visibility, disassociated records retained but unlinked

**Scale & Complexity:**

- Primary domain: Full-stack web (SPA + API + database)
- Complexity level: Low-medium
- Estimated architectural components: ~12-15 (auth, listings, bookings, scheduling, payments, contracts, messaging, notifications, file storage, operator dashboard, renter booking flow, renter self-service)

### Technical Constraints & Dependencies

- **Solo developer** — architecture must minimize operational overhead. Managed services over self-hosted infrastructure.
- **Stripe** — core dependency for all payment processing. Must handle authorization holds, captures, releases, and webhooks reliably. 7-day hold expiry constrains maximum rental duration unless extended authorization is available.
- **Twilio** — core dependency for both OTP authentication (Verify API) and bidirectional SMS communication (Messaging API). Cost per SMS is a unit economics factor.
- **No native mobile app** — responsive web SPA only for MVP
- **No SSR/SSG** — client-side rendering sufficient since renters arrive via direct links, not search engines
- **Single operator for MVP** — multi-tenancy is a future concern, not an MVP requirement, but architecture shouldn't preclude it
- **Category-agnostic data model** — launching equipment-only but the data model should not hardcode equipment-specific fields

### Cross-Cutting Concerns Identified

- **Dual authentication model** — Operator uses standard auth (password-based), renter uses phone OTP. Both need session management but with different flows and lifetimes.
- **Real-time availability enforcement** — Every booking, extension, and cancellation must atomically update the availability calendar. Race condition handling for concurrent booking attempts on the same dates.
- **Booking-payment state coupling** — Booking state transitions (confirmed → active → completed/cancelled/no-show) are tightly coupled with payment state transitions (hold → capture/release). These must stay synchronized, especially through Stripe webhooks.
- **SMS notification lifecycle** — Automated SMS at every booking state transition. Failure handling and retry logic. Cost tracking per transaction.
- **Booking flow state persistence** — The multi-step renter booking flow (dates → OTP → contract → payment) must survive page refreshes without losing progress.
- **File/image management** — Photo upload, storage, and serving for listing images. Need a strategy for storage and CDN delivery for <3s mobile page loads.

## Starter Template Evaluation

### Primary Technology Domain

Full-stack web application based on project requirements — SPA frontend with API backend, real-time database, file storage, and third-party integrations (Stripe, Twilio).

### Starter Options Considered

| Option | Pros | Cons |
|--------|------|------|
| **`create-next-app -e with-supabase`** | Supabase auth + client pre-configured, shadcn/ui initialized, TypeScript + Tailwind + App Router, operator auth pages included | Slightly opinionated structure |
| **Plain `create-next-app` + manual Supabase** | Full control over setup | More boilerplate, easy to misconfigure auth middleware |
| **T3 Stack (`create-t3-app`)** | tRPC for type-safe APIs, Drizzle ORM | Doesn't include Supabase, adds ORM complexity not needed with Supabase client |
| **Supabase + Vite SPA** | True SPA, lighter weight | No server-side capabilities for webhooks — would need separate API server for Stripe/Twilio |

### Selected Starter: Supabase Next.js Starter

**Rationale for Selection:**

1. Pre-configured Supabase auth covers operator authentication (password-based sign-up/sign-in) immediately
2. shadcn/ui already initialized — aligns with UX spec's design system choice
3. Next.js Route Handlers provide a built-in API layer for Stripe webhooks, Twilio webhooks, and booking logic — no separate backend needed
4. Supabase provides PostgreSQL (database), Auth, Storage (listing photos), and Realtime (availability updates) under one managed service
5. Vercel deployment is zero-config for Next.js — cheapest path to production

**Initialization Command:**

```bash
npx create-next-app@latest rentingapp -e with-supabase
```

**Architectural Decisions Provided by Starter:**

**Language & Runtime:**
- TypeScript with strict mode
- Node.js runtime for API routes / server actions
- Next.js 16+ with App Router

**Styling Solution:**
- Tailwind CSS (utility-first)
- shadcn/ui component library (copy-paste, Radix UI primitives)
- CSS custom properties for theming

**Build Tooling:**
- Turbopack for development (fast HMR)
- Next.js production build with automatic code splitting and optimization
- Tailwind CSS purging for minimal production CSS

**Testing Framework:**
- Not included by starter — will configure Vitest + React Testing Library

**Code Organization:**
- `app/` directory with file-system routing (App Router)
- `utils/supabase/` for client and server Supabase client factories
- `middleware.ts` for auth session refresh
- `components/` for shared UI components

**Development Experience:**
- Hot module replacement via Turbopack
- TypeScript type checking
- ESLint configuration
- Supabase local development via `supabase start` (Docker-based local Supabase)

**Deployment Strategy:**

| Service | Platform | Cost |
|---------|----------|------|
| Frontend + API | Vercel free tier | $0 |
| Database + Auth + Storage | Supabase free tier (dev) → Pro (prod) | $0 dev / $25/mo prod |

**Note:** Project initialization using this command should be the first implementation story.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**
- Data validation: Zod + Supabase constraints
- Dual auth model: Supabase Auth Phone OTP (renters) + password (operators)
- Role differentiation: Custom claims + profiles table
- Authorization: Middleware + RLS
- API pattern: Supabase direct reads + Server Actions for mutations + Route Handlers for webhooks

**Important Decisions (Shape Architecture):**
- Error handling: Structured Result types
- State management: URL state + Zustand
- Form handling: React Hook Form + Zod
- Booking flow persistence: URL params + sessionStorage
- Real-time: Supabase Realtime subscriptions

**Deferred Decisions (Post-MVP):**
- Caching strategy (not needed at current scale)
- Full observability stack (Sentry, Axiom)
- Staging/preview Supabase environment

### Data Architecture

- **Validation:** Zod schemas for application-layer validation (shared between client forms and Server Actions) + Supabase database constraints as safety net
- **Migrations:** Supabase CLI migrations (`supabase migration new`). SQL files version-controlled, reviewable in PRs
- **Caching:** No explicit caching for MVP. Supabase queries are fast enough at current scale. Next.js handles static asset caching

### Authentication & Security

- **Operator auth:** Supabase Auth password-based (provided by starter)
- **Renter auth:** Supabase Auth Phone OTP with Twilio as SMS provider. Rate limited to one OTP per phone number per minute (enforced server-side before calling Supabase Auth)
- **Role differentiation:** `app_metadata.role` custom claims (`operator` | `renter`) for fast RLS checks + `profiles` table for extended user data
- **Authorization:** Next.js middleware for route-level protection (redirect unauthenticated users, enforce role-based page access) + Supabase RLS policies for data-level protection
- **Session management:** Supabase Auth sessions via cookies (configured by starter middleware)

### API & Communication Patterns

- **Reads:** Supabase client direct from browser (RLS-protected). Fast, no Server Action overhead
- **Mutations:** Next.js Server Actions with Zod validation. All business logic (booking creation, payment holds, contract signing, SMS triggers) lives here
- **Webhooks:** Next.js Route Handlers for Stripe and Twilio webhooks (need raw HTTP request access)
- **Error handling:** Structured Result types — `{ success: true, data } | { success: false, error: { code, message } }`. No thrown exceptions in business logic
- **Real-time:** Supabase Realtime subscriptions on `bookings` table for live availability calendar updates

### Frontend Architecture

- **State management:** URL search params for navigation state (selected dates, booking step, listing ID) + Zustand with sessionStorage persistence for transient UI state (OTP verification status, contract acceptance)
- **Forms:** React Hook Form + Zod. Schemas shared between client validation and Server Action validation
- **Booking flow persistence:** URL params + sessionStorage via Zustand persist. Multi-step flow (dates → OTP → contract → payment) survives page refreshes
- **Component library:** shadcn/ui (provided by starter). Add components as needed

### Infrastructure & Deployment

- **CI/CD:** GitHub Actions for lint + type-check + tests on PRs. Vercel auto-deploys on merge to main
- **Environments:** Two environments — local (Supabase CLI via Docker) and production (Vercel + Supabase Pro)
- **Monitoring:** Vercel built-in analytics and function logs. SMS failures logged to `sms_log` table in Supabase with operator dashboard visibility. Console logging for server-side errors
- **Supabase projects:** Dev (free tier, local CLI) + Prod (Pro plan, $25/month)

### Decision Impact Analysis

**Implementation Sequence:**
1. Project initialization (starter template)
2. Supabase schema + RLS policies + auth configuration
3. Operator auth flow (provided by starter, extend with role claims)
4. Listing CRUD with Supabase Storage
5. Booking engine with availability calendar (Realtime subscriptions)
6. Renter OTP auth flow (Supabase Auth Phone OTP)
7. Contract generation and signing
8. Stripe payment holds integration
9. Twilio SMS messaging hub
10. Operator dashboard and renter self-service

**Cross-Component Dependencies:**
- Booking engine depends on auth (both operator and renter) and availability data model
- Payment lifecycle depends on booking engine (state transitions trigger payment actions)
- SMS notifications depend on booking engine (lifecycle events trigger messages)
- Contract signing depends on booking engine + renter auth (must be authenticated to sign)
- Renter self-service depends on booking engine + renter auth + payment integration

## Implementation Patterns & Consistency Rules

### Pattern Categories Defined

**Critical Conflict Points Identified:** 6 categories where AI agents could make different choices — naming, structure, formats, communication, process, and enforcement.

### Naming Patterns

**Database Naming Conventions:**
- Tables: `snake_case`, plural — `listings`, `bookings`, `profiles`, `contracts`
- Columns: `snake_case` — `created_at`, `listing_id`, `rental_start_date`
- Foreign keys: `{referenced_table_singular}_id` — `listing_id`, `renter_id`
- Indexes: `idx_{table}_{columns}` — `idx_bookings_listing_id`
- Enums: `snake_case` type name, `snake_case` values — `booking_status`: `confirmed`, `active`, `completed`, `cancelled`, `no_show`

**Code Naming Conventions:**
- Files: `kebab-case.ts` — `booking-actions.ts`, `listing-card.tsx`
- Components: PascalCase — `ListingCard`, `BookingCalendar`
- Functions/variables: camelCase — `createBooking`, `listingId`
- Types/interfaces: PascalCase — `Booking`, `ListingWithPhotos`
- Zod schemas: camelCase with `Schema` suffix — `createBookingSchema`, `listingFormSchema`
- Server Actions: camelCase with verb prefix — `createListing`, `cancelBooking`, `sendOtp`
- Constants: SCREAMING_SNAKE_CASE — `MAX_RENTAL_DAYS`, `OTP_RATE_LIMIT_SECONDS`

**API Naming Conventions:**
- Route Handlers: `/api/webhooks/stripe`, `/api/webhooks/twilio` (webhooks only)
- URL paths: `kebab-case` — `/manage-rental`, `/operator/listings`

### Structure Patterns

**Project Organization (feature-based with shared layer):**

```
app/
  (operator)/              # Operator-authenticated routes
    dashboard/
    listings/
    messages/
  (renter)/                # Renter-facing routes
    book/[listing-id]/
    manage-rental/
  api/
    webhooks/
      stripe/
      twilio/
lib/
  actions/                 # Server Actions grouped by domain
    booking-actions.ts
    listing-actions.ts
    payment-actions.ts
  schemas/                 # Zod schemas (shared client + server)
    booking-schema.ts
    listing-schema.ts
  types/                   # TypeScript types
    database.ts            # Supabase generated types
    domain.ts              # App-level types
  utils/                   # Helpers
    result.ts              # Result type utility
    format.ts              # Date/currency formatting
components/
  ui/                      # shadcn/ui components
  booking/                 # Domain components
  listing/
  shared/                  # Cross-domain components
utils/
  supabase/                # Supabase clients (from starter)
```

**Test Organization:** Colocated — `booking-actions.ts` / `booking-actions.test.ts`

### Format Patterns

**API Response Format (Result Type for all Server Actions):**

```typescript
type Result<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } };
```

**Error Codes:** SCREAMING_SNAKE_CASE — `BOOKING_CONFLICT`, `OTP_RATE_LIMITED`, `PAYMENT_FAILED`, `UNAUTHORIZED`

**Data Exchange Formats:**
- Dates: ISO 8601 strings in database and API (`2026-04-04T00:00:00Z`). Display formatting at UI layer only
- Currency: Stored as integers (cents) in database. Formatted to dollars at UI layer only
- JSON fields: snake_case from database, camelCase in TypeScript (Supabase auto-converts)

### Communication Patterns

**Supabase Realtime Channels:** `{table}:{filter}` — `bookings:listing_id=eq.{id}`

**Zustand Stores:** One store per domain — `useBookingFlowStore`, `useOperatorStore`. Actions named as verbs: `setSelectedDates`, `clearBookingFlow`, `markStepComplete`

### Process Patterns

**Loading States:** React Suspense boundaries for route-level loading. `useTransition` for Server Action pending states. No manual `isLoading` booleans for server mutations.

**Error Boundaries:** Per-route error boundaries via Next.js `error.tsx` files. Display user-friendly messages, log details server-side.

**OTP Rate Limiting:** Server Action checks `otp_attempts` table before calling Supabase Auth. Returns `{ success: false, error: { code: 'OTP_RATE_LIMITED', message: 'Please wait 60 seconds...' } }`.

**Stripe Webhook Idempotency:** Store `stripe_event_id` in processed events table. Skip duplicates. Return 200 even on skip to prevent Stripe retries.

### Enforcement Guidelines

**All AI Agents MUST:**
- Use the `Result<T>` type for all Server Action returns — never throw from business logic
- Follow file naming (`kebab-case`) and component naming (PascalCase) conventions without exception
- Use Zod schemas from `lib/schemas/` for all validation — never inline validation logic
- Place new Server Actions in `lib/actions/` grouped by domain
- Colocate tests next to source files
- Use named exports exclusively — no default exports
- Store monetary values as integers (cents), dates as ISO strings

**Anti-Patterns (NEVER do):**
- `export default function` — always `export function`
- `any` type — use proper typing or `unknown` with narrowing
- Throwing errors from Server Actions — return `Result<T>`
- Inline SQL — use Supabase client query builder
- Manual `isLoading` state for Server Actions — use `useTransition`
- Formatting dates/currency in Server Actions — return raw, format in UI

## Project Structure & Boundaries

### Complete Project Directory Structure

```
rentingapp/
├── .github/
│   └── workflows/
│       └── ci.yml                          # Lint + type-check + varlock scan + tests
├── .env.schema                             # Varlock schema (committed, AI-readable)
├── .env.local                              # Actual secrets (gitignored)
├── .gitignore
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
├── vitest.config.ts
├── middleware.ts                            # Auth session refresh + route protection
│
├── supabase/
│   ├── config.toml                         # Supabase CLI local config
│   ├── seed.sql                            # Dev seed data
│   └── migrations/                         # Sequential SQL migration files
│       └── 00001_initial-schema.sql
│
├── app/
│   ├── globals.css                         # Tailwind base + theme CSS variables
│   ├── layout.tsx                          # Root layout (fonts, providers)
│   ├── page.tsx                            # Landing / redirect
│   ├── error.tsx                           # Root error boundary
│   ├── not-found.tsx                       # 404 page
│   │
│   ├── (auth)/                             # Auth pages (operator sign-up/sign-in)
│   │   ├── sign-in/
│   │   │   └── page.tsx
│   │   ├── sign-up/
│   │   │   └── page.tsx
│   │   ├── forgot-password/
│   │   │   └── page.tsx
│   │   └── auth/
│   │       └── callback/
│   │           └── route.ts                # Supabase auth callback handler
│   │
│   ├── (operator)/                         # Operator-authenticated routes
│   │   ├── layout.tsx                      # Operator layout (sidebar, nav)
│   │   ├── dashboard/
│   │   │   └── page.tsx                    # FR42-44: Operator dashboard overview
│   │   ├── listings/
│   │   │   ├── page.tsx                    # FR1: Listing index
│   │   │   ├── new/
│   │   │   │   └── page.tsx               # FR1-4: Create listing form
│   │   │   └── [listing-id]/
│   │   │       ├── page.tsx               # FR5: Listing detail/edit
│   │   │       ├── ad-copy/
│   │   │       │   └── page.tsx           # FR6-7: Generate classifieds ad copy
│   │   │       └── availability/
│   │   │           └── page.tsx           # FR8: Manage availability/blocks
│   │   ├── bookings/
│   │   │   ├── page.tsx                    # FR42: All bookings list
│   │   │   └── [booking-id]/
│   │   │       └── page.tsx               # FR43-44: Booking detail + actions
│   │   ├── messages/
│   │   │   ├── page.tsx                    # FR36-38: Unified messaging inbox
│   │   │   └── [conversation-id]/
│   │   │       └── page.tsx               # FR39-40: Conversation thread
│   │   └── settings/
│   │       └── page.tsx                    # Operator profile, Stripe connect, Twilio config
│   │
│   ├── (renter)/                           # Renter-facing routes (public + OTP-gated)
│   │   ├── book/
│   │   │   └── [listing-id]/
│   │   │       ├── page.tsx               # FR9-11: Booking page (calendar, dates)
│   │   │       ├── verify/
│   │   │       │   └── page.tsx           # FR16-18: OTP verification step
│   │   │       ├── contract/
│   │   │       │   └── page.tsx           # FR19-20: Contract review + sign
│   │   │       ├── payment/
│   │   │       │   └── page.tsx           # FR27-29: Payment hold authorization
│   │   │       └── confirmation/
│   │   │           └── page.tsx           # FR21-22: Booking confirmation
│   │   └── manage-rental/
│   │       ├── page.tsx                    # FR23: Universal manage-my-rental (OTP gate)
│   │       ├── [booking-id]/
│   │       │   └── page.tsx               # FR24-26: Rental details, extend, cancel
│   │       └── check-in/
│   │           └── [booking-id]/
│   │               └── page.tsx           # FR41-42: Photo check-in/check-out
│   │
│   └── api/
│       └── webhooks/
│           ├── stripe/
│           │   └── route.ts               # FR30-32: Stripe webhook handler
│           └── twilio/
│               └── route.ts               # FR39-40: Twilio inbound SMS handler
│
├── lib/
│   ├── actions/                            # Server Actions (all mutations)
│   │   ├── listing-actions.ts             # FR1-8: CRUD, photo upload, ad copy gen
│   │   ├── listing-actions.test.ts
│   │   ├── booking-actions.ts             # FR9-15: Create, cancel, extend bookings
│   │   ├── booking-actions.test.ts
│   │   ├── payment-actions.ts             # FR27-32: Stripe hold, capture, release
│   │   ├── payment-actions.test.ts
│   │   ├── auth-actions.ts                # FR16-18: OTP send, verify, rate limit
│   │   ├── auth-actions.test.ts
│   │   ├── contract-actions.ts            # FR19-22: Generate, sign, store contracts
│   │   ├── contract-actions.test.ts
│   │   ├── message-actions.ts             # FR36-40: Send SMS, mark read
│   │   ├── message-actions.test.ts
│   │   ├── notification-actions.ts        # FR43-45: Automated lifecycle notifications
│   │   └── notification-actions.test.ts
│   │
│   ├── schemas/                            # Zod schemas (shared client + server)
│   │   ├── listing-schema.ts
│   │   ├── booking-schema.ts
│   │   ├── payment-schema.ts
│   │   ├── contract-schema.ts
│   │   └── auth-schema.ts
│   │
│   ├── types/
│   │   ├── database.ts                    # Supabase generated types (supabase gen types)
│   │   ├── domain.ts                      # App-level types (Result<T>, enums, etc.)
│   │   └── stripe.ts                      # Stripe webhook event types
│   │
│   ├── utils/
│   │   ├── result.ts                      # Result<T> type + helper functions
│   │   ├── result.test.ts
│   │   ├── format.ts                      # Date/currency display formatting
│   │   ├── format.test.ts
│   │   ├── availability.ts                # Availability calculation (buffer logic)
│   │   ├── availability.test.ts
│   │   └── ad-copy-templates.ts           # KSL, FB, Craigslist templates
│   │
│   └── services/                           # Third-party service wrappers
│       ├── stripe.ts                       # Stripe client + helper functions
│       ├── twilio.ts                       # Twilio client + SMS helpers
│       └── storage.ts                      # Supabase Storage helpers (photo upload)
│
├── components/
│   ├── ui/                                 # shadcn/ui components (auto-generated)
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── input.tsx
│   │   ├── calendar.tsx
│   │   └── ...
│   ├── booking/
│   │   ├── availability-calendar.tsx       # FR9-11: Date range picker with availability
│   │   ├── booking-flow-stepper.tsx        # Multi-step progress indicator
│   │   ├── booking-summary-card.tsx        # FR12: Price breakdown + details
│   │   ├── otp-input.tsx                   # FR16-17: 6-digit OTP input
│   │   └── contract-viewer.tsx             # FR19: Contract display + signature
│   ├── listing/
│   │   ├── listing-card.tsx                # Listing preview card
│   │   ├── listing-form.tsx                # FR1-4: Create/edit listing form
│   │   ├── photo-uploader.tsx              # FR3: Multi-photo upload
│   │   └── ad-copy-generator.tsx           # FR6-7: Ad copy preview + copy button
│   ├── messaging/
│   │   ├── conversation-list.tsx           # FR36-37: Inbox conversation list
│   │   ├── message-thread.tsx              # FR39: Message thread view
│   │   └── message-composer.tsx            # FR40: SMS compose
│   ├── payment/
│   │   ├── stripe-payment-form.tsx         # FR27-28: Card input for payment hold
│   │   └── payment-status-badge.tsx        # Hold/captured/released status
│   └── shared/
│       ├── sticky-bottom-bar.tsx           # Mobile sticky CTA bar
│       ├── loading-skeleton.tsx            # Suspense fallback skeletons
│       ├── error-display.tsx               # User-friendly error messages
│       └── role-guard.tsx                  # Client-side role check wrapper
│
├── stores/
│   ├── booking-flow-store.ts               # Zustand: booking flow state + sessionStorage
│   └── booking-flow-store.test.ts
│
├── utils/
│   └── supabase/                           # Supabase clients (from starter)
│       ├── client.ts                       # Browser client
│       ├── server.ts                       # Server client
│       └── middleware.ts                    # Auth middleware helpers
│
└── public/
    └── images/                             # Static assets (logo, icons)
```

### Architectural Boundaries

**API Boundaries:**
- External inbound: Only `/api/webhooks/stripe` and `/api/webhooks/twilio` accept external HTTP requests. Both verify signatures before processing.
- Supabase direct reads: Browser → Supabase (RLS-protected). No application server in the read path.
- Server Action mutations: Browser → Next.js Server Action → Supabase + Stripe/Twilio. All business logic lives here.

**Component Boundaries:**
- `components/ui/` — Pure presentational. No business logic, no data fetching. shadcn/ui only.
- `components/{domain}/` — Domain-specific UI. May use hooks for local state, but data fetching happens in page-level server components or via Supabase client.
- `lib/actions/` — Server-only. Never imported by client components directly (Next.js enforces this).
- `lib/services/` — Server-only wrappers for Stripe, Twilio, Storage. Only called from actions or Route Handlers.
- `stores/` — Client-only. Zustand stores for transient UI state.

**Data Boundaries:**
- Database access: Only through Supabase client (browser for reads, server for mutations). No direct SQL from application code.
- Stripe data: Never stored locally except `stripe_customer_id`, `stripe_payment_intent_id`, and webhook event IDs. Card details never touch our servers.
- File storage: Listing photos in Supabase Storage buckets. Public read access, authenticated write via Server Actions.

### Requirements to Structure Mapping

**FR1-8 (Listing & Content Management):**
- Pages: `app/(operator)/listings/`
- Actions: `lib/actions/listing-actions.ts`
- Components: `components/listing/`
- Schemas: `lib/schemas/listing-schema.ts`
- Storage: `lib/services/storage.ts`

**FR9-15 (Booking Engine):**
- Pages: `app/(renter)/book/[listing-id]/`
- Actions: `lib/actions/booking-actions.ts`
- Components: `components/booking/`
- Schemas: `lib/schemas/booking-schema.ts`
- Utils: `lib/utils/availability.ts`

**FR16-22 (Renter Auth + Contracts):**
- Pages: `app/(renter)/book/[listing-id]/verify/`, `contract/`, `confirmation/`
- Actions: `lib/actions/auth-actions.ts`, `lib/actions/contract-actions.ts`
- Components: `components/booking/otp-input.tsx`, `contract-viewer.tsx`

**FR23-26 (Renter Self-Service):**
- Pages: `app/(renter)/manage-rental/`
- Actions: `lib/actions/booking-actions.ts` (extend, cancel)
- Components: `components/booking/`

**FR27-32 (Payment Lifecycle):**
- Pages: `app/(renter)/book/[listing-id]/payment/`
- Actions: `lib/actions/payment-actions.ts`
- Webhooks: `app/api/webhooks/stripe/route.ts`
- Components: `components/payment/`
- Services: `lib/services/stripe.ts`

**FR33-35 (Digital Contracts):**
- Actions: `lib/actions/contract-actions.ts`
- Components: `components/booking/contract-viewer.tsx`
- Pages: `app/(renter)/book/[listing-id]/contract/` (renter signs), operator views via booking detail

**FR36-40 (Communication Hub):**
- Pages: `app/(operator)/messages/`
- Actions: `lib/actions/message-actions.ts`
- Webhooks: `app/api/webhooks/twilio/route.ts`
- Components: `components/messaging/`
- Services: `lib/services/twilio.ts`

**FR41-44 (Operator Auth & Dashboard):**
- Pages: `app/(auth)/` (FR41), `app/(operator)/dashboard/` (FR42), `app/(operator)/bookings/` (FR42-44)
- Components: shared booking + listing components

**FR45 (Renter Identity & Privacy):**
- Actions: `lib/actions/auth-actions.ts` (disassociate phone from rental history)

### Integration Points

**External Integrations:**
- **Stripe:** `lib/services/stripe.ts` → Server Actions call for holds/captures/releases. Webhooks at `/api/webhooks/stripe` for async events (payment succeeded, hold expired).
- **Twilio:** `lib/services/twilio.ts` → Server Actions call for outbound SMS. Webhooks at `/api/webhooks/twilio` for inbound SMS. Supabase Auth uses Twilio as SMS provider for OTP.
- **Supabase Storage:** `lib/services/storage.ts` → Photo upload from listing form and check-in/check-out.

**Data Flow:**
1. **Booking creation:** Calendar component → URL params → Server Action (validate + check availability + create booking) → Supabase insert → Realtime pushes update to other viewers
2. **Payment hold:** Payment form → Server Action → Stripe `paymentIntents.create` with `capture_method: manual` → Store intent ID in bookings table
3. **Inbound SMS:** Twilio → `/api/webhooks/twilio` → Insert to messages table → Supabase Realtime → Operator inbox updates
4. **Booking lifecycle:** State change (Server Action) → Update booking status + trigger payment action + send SMS notification (all in same action, with error handling per step)

### Environment Configuration

**Varlock** (`@varlock/nextjs-integration`) manages all environment variables:
- `.env.schema` — Committed to repo. Defines all env vars with types, required/optional, sensitivity flags, and descriptions. AI agents read this for context, never `.env.local`.
- `.env.local` — Gitignored. Contains actual secret values.
- `varlock scan` — Runs in CI pipeline and as a git pre-commit hook to prevent secret leaks.
- Runtime validation — Catches missing or invalid env vars at startup.
- Log redaction — Prevents sensitive values from appearing in Vercel function logs.

**Required Environment Variables (defined in `.env.schema`):**

| Variable | Sensitive | Description |
|----------|-----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | No | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | No | Supabase anonymous/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase admin key (server-only) |
| `STRIPE_SECRET_KEY` | Yes | Stripe API secret key |
| `STRIPE_WEBHOOK_SECRET` | Yes | Stripe webhook signing secret |
| `TWILIO_ACCOUNT_SID` | Yes | Twilio account identifier |
| `TWILIO_AUTH_TOKEN` | Yes | Twilio auth token |
| `TWILIO_PHONE_NUMBER` | Yes | Twilio SMS sender number |

### Development Workflow

**Local Development:**
1. `supabase start` — Starts local Supabase (PostgreSQL, Auth, Storage, Realtime) via Docker
2. `npm run dev` — Starts Next.js dev server with Turbopack
3. Supabase Studio available at `localhost:54323` for database inspection
4. Varlock validates env vars on dev server startup

**CI Pipeline (GitHub Actions):**
1. Lint (ESLint)
2. Type-check (`tsc --noEmit`)
3. Varlock scan (`varlock scan` — detect leaked secrets)
4. Tests (Vitest)
5. Build verification (`next build`)

**Deployment:**
- Push to `main` → Vercel auto-deploys to production
- PRs → Vercel creates preview deployment
- Env vars configured in Vercel dashboard (production) and `.env.local` (local dev)

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:** All technology choices (Next.js 16 + Supabase + Stripe + Twilio + shadcn/ui + Zustand + Zod + Varlock) are well-established together with no version conflicts. The hybrid API pattern (Supabase direct reads + Server Actions + Route Handlers) is pragmatic and avoids over-engineering.

**Pattern Consistency:** Database snake_case → TypeScript camelCase handled by Supabase generated types. File naming (kebab-case), component naming (PascalCase), and function naming (camelCase) are consistent with Next.js/React conventions. Result types used uniformly for all Server Actions.

**Structure Alignment:** Route groups `(operator)` and `(renter)` align with middleware role-based protection. Server Actions in `lib/actions/` map cleanly to FR groupings. Third-party services isolated in `lib/services/`.

### Requirements Coverage ✅

All 45 functional requirements have explicit architectural support mapped to specific files and directories. All non-functional requirements (performance, security, reliability, data retention) are addressed.

**Data retention enforcement:** Query-time filtering — renter dashboard queries include `WHERE completed_at > NOW() - INTERVAL '45 days'`. Operator queries have no such filter. No scheduled deletion jobs needed.

### Gaps Identified & Resolved

**Gap 1: Stripe Hold Expiry for Extended Rentals**

Stripe authorization holds expire after 7 days by default. A renter who books 5 days and extends by 4 days would have a 9-day rental, exceeding the hold window.

**Decision:** MVP caps holds at Stripe's 7-day default. Extensions beyond the hold period are covered by the signed contract + payment method on file. The operator accepts the risk of up to 2 uncovered days at the tail end of extended rentals. Post-MVP can explore Stripe extended authorization or incremental authorization if the risk profile changes.

**Gap 2: Double-Booking Prevention Mechanism**

RLS and application-level availability checks do not prevent race conditions where two renters simultaneously attempt to book overlapping dates.

**Decision:** `booking_dates` junction table with a unique constraint on `(listing_id, date)` — one row per booked calendar day. Booking creation inserts into both `bookings` and `booking_dates` within a single Supabase RPC transaction. If the unique constraint fires, the Server Action returns `{ success: false, error: { code: 'BOOKING_CONFLICT', message: '...' } }`. The unique constraint is the lock — no `SELECT ... FOR UPDATE` needed.

### Architecture Completeness Checklist

**✅ Requirements Analysis**
- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed
- [x] Technical constraints identified
- [x] Cross-cutting concerns mapped

**✅ Architectural Decisions**
- [x] Critical decisions documented
- [x] Technology stack fully specified
- [x] Integration patterns defined
- [x] Performance considerations addressed

**✅ Implementation Patterns**
- [x] Naming conventions established
- [x] Structure patterns defined
- [x] Communication patterns specified
- [x] Process patterns documented

**✅ Project Structure**
- [x] Complete directory structure defined
- [x] Component boundaries established
- [x] Integration points mapped
- [x] Requirements to structure mapping complete

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION

**Confidence Level:** High

**Key Strengths:**
- Managed services (Supabase, Stripe, Twilio, Vercel) minimize operational overhead for solo developer
- Hybrid API pattern avoids over-engineering while keeping business logic centralized
- Dual auth model (password + OTP) handled natively by single auth provider (Supabase Auth)
- Explicit patterns and anti-patterns prevent AI agent implementation conflicts
- Every FR mapped to specific files and directories
- Database-level double-booking prevention via unique constraint eliminates race conditions

**Areas for Future Enhancement:**
- Testing strategy (unit/integration/E2E boundaries) to be defined in testing phase
- Stripe extended authorization for rentals exceeding 7 days
- Caching strategy if traffic grows beyond single-operator scale
- Full observability stack (Sentry, structured logging) for production monitoring

**Implementation Handoff:**
- AI agents must follow all architectural decisions exactly as documented
- Use implementation patterns consistently across all components
- Respect project structure and boundaries
- First implementation priority: `npx create-next-app@latest rentingapp -e with-supabase`
