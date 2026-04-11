# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RentingApp is a web-based rental operations platform for independent equipment rental operators in the Utah market. Operators create listings, generate classifieds ad copy (KSL, Facebook Marketplace, Craigslist), and funnel all renter interactions into a single management hub. Renters book through shareable links with real-time availability, digital contracts, and Stripe payment holds.

**Status:** MVP implementation complete. All 7 epics and 32 stories are `done` (see `_bmad-output/implementation-artifacts/sprint-status.yaml`). Current branch `yolo-attempt` is expanding end-to-end test coverage. Epic retrospectives are still optional/pending.

**Owner:** Solo developer (Clint) building for his own equipment rental use case first.

## Tech Stack

- **Framework:** Next.js 15 (App Router) + React 19, TypeScript strict
- **Backend:** Supabase (Postgres, Auth, Storage, Realtime) via `@supabase/ssr` + `@supabase/supabase-js`
- **Styling:** Tailwind CSS + shadcn/ui (Radix primitives), `next-themes`, `lucide-react`
- **Payments:** Stripe (`stripe`, `@stripe/stripe-js`, `@stripe/react-stripe-js`)
- **Validation:** Zod
- **Secrets:** Varlock (`varlock`, `@varlock/nextjs-integration`, `@varlock/bitwarden-plugin`) — e2e and scripts run via `varlock run --`
- **Testing:** Vitest + Testing Library (unit/component), Playwright (e2e)

## Methodology

This project follows the [BMad Method](https://github.com/bmad-code-org). Use BMad skills/agents for all planning and implementation workflows. Planning artifacts live in `_bmad-output/` — treat them as living documents.

## Repository Layout

```
app/                            # Next.js App Router routes (operator + renter)
components/                     # Shared UI components (shadcn/ui in components/ui)
lib/                            # Domain logic, Supabase clients, Stripe helpers, utilities
stores/                         # Client-side state
supabase/                       # Migrations, seed data, generated types
tests/e2e/                      # Playwright specs + shared helpers
scripts/                        # Dev/build utility scripts
docs/                           # Project documentation
_bmad/                          # BMad Method modules and config (DO NOT EDIT)
_bmad-output/
  planning-artifacts/           # PRD, product brief, UX spec, architecture, epics
  implementation-artifacts/     # Per-story specs + sprint-status.yaml
  test-artifacts/               # Test plans, traceability
.claude/                        # Claude Code settings (DO NOT EDIT)
AGENTS.md                       # Agent behavior rules and conventions
```

## Key Planning Artifacts

- `_bmad-output/planning-artifacts/prd.md` — Full PRD with 45 functional requirements across 9 capability areas
- `_bmad-output/planning-artifacts/product-brief-rentingapp.md` — Product brief
- `_bmad-output/planning-artifacts/ux-design-specification.md` — UX design spec
- `_bmad-output/planning-artifacts/architecture.md` — Technical architecture
- `_bmad-output/planning-artifacts/epics.md` — Epic/story breakdown
- `_bmad-output/planning-artifacts/implementation-readiness-report-2026-04-04.md` — Latest readiness assessment
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — Source of truth for story status

## Code Conventions (from AGENTS.md)

- TypeScript over JavaScript, strict typing (avoid `any`)
- Named exports over default exports
- `kebab-case` for files and directories
- Colocate tests next to source: `widget.ts` / `widget.test.ts`
- Structured error types over generic throws
- Pin dependency versions, minimize external dependencies

## Git Conventions

- **Commit format:** `type(scope): description` (types: feat, fix, docs, style, refactor, test, chore, build)
- **Branch naming:** `type/short-description` (e.g., `feat/listing-search`)
- Atomic, bisectable commits

## Core Integrations

- **Stripe** — Payment holds (authorize at booking, capture on completion/no-show, release on cancellation), transaction fees
- **Twilio** — SMS OTP authentication for renters, bidirectional renter-operator messaging, automated notifications

## Architecture Decisions (from PRD)

- Next.js App Router on Supabase (Postgres + Auth + Storage); renters arrive via direct classifieds links rather than search
- Operator auth: Supabase email/password. Renter auth: phone + SMS OTP only (no passwords)
- Single universal manage-my-rental URL behind OTP auth
- Category-agnostic data model from day one, but MVP is equipment-only in Utah
- 5-day post-rental buffer: 4 days renter extension window + 1 mandatory maintenance day
- Payment holds expire after 7 days (Stripe default) — MVP may limit rental duration accordingly
