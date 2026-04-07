# Starter Template Evaluation

_Decision Date: 2026-04-04_

## Primary Technology Domain

Full-stack web application — SPA frontend with API backend, real-time database, file storage, and third-party integrations (Stripe, Twilio).

## Starter Options Considered

| Option | Pros | Cons |
|--------|------|------|
| **`create-next-app -e with-supabase`** | Supabase auth + client pre-configured, shadcn/ui initialized, TypeScript + Tailwind + App Router, operator auth pages included | Slightly opinionated structure |
| **Plain `create-next-app` + manual Supabase** | Full control over setup | More boilerplate, easy to misconfigure auth middleware |
| **T3 Stack (`create-t3-app`)** | tRPC for type-safe APIs, Drizzle ORM | Doesn't include Supabase, adds ORM complexity not needed with Supabase client |
| **Supabase + Vite SPA** | True SPA, lighter weight | No server-side capabilities for webhooks — would need separate API server for Stripe/Twilio |

## Selected Starter: Supabase Next.js Starter

**Command:**

```bash
npx create-next-app@latest rentingapp -e with-supabase
```

**Rationale:**

1. Pre-configured Supabase auth covers operator authentication (password-based sign-up/sign-in) immediately
2. shadcn/ui already initialized — aligns with UX spec's design system choice
3. Next.js Route Handlers provide a built-in API layer for Stripe webhooks, Twilio webhooks, and booking logic — no separate backend needed
4. Supabase provides PostgreSQL (database), Auth, Storage (listing photos), and Realtime (availability updates) under one managed service
5. Vercel deployment is zero-config for Next.js — cheapest path to production

## What the Starter Provides

- Next.js 16+ with TypeScript, Tailwind CSS, App Router
- Supabase client utilities (`createBrowserClient` + `createServerClient`)
- Auth middleware for session refresh on every request
- Password-based auth pages (sign-up, sign-in, forgot-password)
- shadcn/ui initialized with default style
- `.env.local` template for Supabase keys

## What Must Be Added

- Twilio integration (SMS OTP for renters, bidirectional messaging)
- Stripe integration (payment holds, captures, webhooks)
- Additional shadcn/ui components as needed (calendar, cards, etc.)
- Custom components (availability calendar, sticky bottom bar, OTP input)
- Supabase Storage configuration for listing photos
- Testing framework (Vitest + React Testing Library)

## Technology Stack Summary

| Layer | Technology | Notes |
|-------|-----------|-------|
| **Framework** | Next.js 16+ (App Router) | Server components + client components |
| **Language** | TypeScript (strict) | Per code conventions |
| **Database** | Supabase (PostgreSQL) | Managed, includes Auth + Storage + Realtime |
| **Styling** | Tailwind CSS + shadcn/ui | Utility-first + copy-paste component library |
| **Payments** | Stripe | Authorization holds, captures, webhooks |
| **Communications** | Twilio | SMS OTP (Verify API) + messaging (Messaging API) |
| **Build Tool** | Turbopack | Fast HMR in development |
| **Testing** | TBD (likely Vitest + RTL) | Not included in starter |

## Deployment Strategy

| Service | Platform | Cost |
|---------|----------|------|
| **Frontend + API** | Vercel free tier | $0 |
| **Database + Auth + Storage** | Supabase free tier (dev) → Pro (prod) | $0 dev / $25/mo prod |

**Note:** Supabase free tier auto-pauses after 7 days of inactivity. Production requires Pro plan ($25/month).

## Architectural Note

The PRD specifies "SPA, no SSR" but Next.js defaults to server components. This is a benefit — we use Next.js Server Actions and Route Handlers for the API layer (Stripe webhooks, Twilio webhooks, booking logic) while keeping renter-facing pages client-rendered where needed. No separate backend server required.
