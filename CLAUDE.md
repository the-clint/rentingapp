# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RentingApp is a web-based rental operations platform for independent equipment rental operators in the Utah market. Operators create listings, generate classifieds ad copy (KSL, Facebook Marketplace, Craigslist), and funnel all renter interactions into a single management hub. Renters book through shareable links with real-time availability, digital contracts, and Stripe payment holds.

**Status:** Pre-development (planning phase complete, no source code yet). Architecture, UX spec, and epics/stories have not been created yet.

**Owner:** Solo developer (Clint) building for his own equipment rental use case first.

## Methodology

This project follows the [BMad Method](https://github.com/bmad-code-org). Use BMad skills/agents for all planning and implementation workflows. Planning artifacts live in `_bmad-output/` — treat them as living documents.

## Repository Layout

```
_bmad/                          # BMad Method modules and config (DO NOT EDIT)
_bmad-output/
  planning-artifacts/           # PRD, product brief, UX design spec
  implementation-artifacts/     # Architecture, epics, stories (not yet created)
  test-artifacts/               # Test plans, traceability (not yet created)
.pi/                            # Pi agent skills (DO NOT EDIT)
.claude/                        # Claude Code settings (DO NOT EDIT)
docs/                           # Project documentation
AGENTS.md                       # Agent behavior rules and conventions
```

## Key Planning Artifacts

- `_bmad-output/planning-artifacts/prd.md` — Full PRD with 45 functional requirements across 9 capability areas
- `_bmad-output/planning-artifacts/product-brief-rentingapp.md` — Product brief
- `_bmad-output/planning-artifacts/ux-design-specification.md` — UX design spec
- `_bmad-output/planning-artifacts/implementation-readiness-report-2026-03-28.md` — Readiness assessment (architecture, UX, and epics still needed)

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

- SPA with client-side rendering (no SSR needed — renters arrive via direct classifieds links, not search)
- Operator auth: standard login. Renter auth: phone + SMS OTP only (no passwords)
- Single universal manage-my-rental URL behind OTP auth
- Category-agnostic data model from day one, but MVP is equipment-only in Utah
- 5-day post-rental buffer: 4 days renter extension window + 1 mandatory maintenance day
- Payment holds expire after 7 days (Stripe default) — MVP may limit rental duration accordingly
