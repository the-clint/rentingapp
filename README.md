# Everything.Rent

A web-based rental operations platform for independent equipment rental operators in the Utah market. Operators create listings, generate classifieds ad copy (KSL, Facebook Marketplace, Craigslist), and funnel all renter interactions into a single management hub. Renters book through shareable links with real-time availability, digital contracts, and Stripe payment holds.

**Status:** MVP implementation complete. All 7 epics and 32 stories are marked `done` in `_bmad-output/implementation-artifacts/sprint-status.yaml`. Current work on branch `yolo-attempt` is expanding end-to-end test coverage.

## Features

- **Listings management** — Category-agnostic listing model with photo uploads, availability rules, and pricing.
- **Classifieds ad generator** — One-click ad copy tailored to KSL, Facebook Marketplace, and Craigslist.
- **Unified inbox** — Renter messages, bookings, and status updates funnel into a single operator hub.
- **Renter booking flow** — Shareable listing links, real-time availability, digital contracts, and Stripe payment holds.
- **Renter auth via SMS OTP** — Phone-based passwordless auth through Twilio; operators use Supabase email/password.
- **Payment holds** — Stripe authorize-on-book, capture-on-complete/no-show, release-on-cancel.
- **Universal manage-my-rental URL** — One OTP-gated URL gives renters access to every rental they've ever booked.

## Tech Stack

- **Framework:** Next.js 15 (App Router), React 19, TypeScript (strict)
- **Backend:** Supabase (Postgres, Auth, Storage, Realtime) via `@supabase/ssr`
- **Styling:** Tailwind CSS, shadcn/ui (Radix primitives), `next-themes`, `lucide-react`
- **Payments:** Stripe (`stripe`, `@stripe/stripe-js`, `@stripe/react-stripe-js`)
- **Messaging/Auth:** Twilio (SMS OTP + bidirectional messaging)
- **Validation:** Zod
- **Secrets:** Varlock + Bitwarden Secrets Manager plugin
- **Testing:** Vitest + Testing Library (unit/component), Playwright (e2e)

## Repository Layout

```
app/                            # Next.js App Router routes (operator + renter)
components/                     # Shared UI (shadcn/ui in components/ui)
lib/                            # Domain logic, Supabase/Stripe clients, utilities
stores/                         # Client-side state
supabase/                       # Migrations, seed data, generated types
tests/e2e/                      # Playwright specs + shared helpers
scripts/                        # Dev/build utility scripts
docs/                           # Project documentation
_bmad/                          # BMad Method modules and config (do not edit)
_bmad-output/
  planning-artifacts/           # PRD, product brief, UX spec, architecture, epics
  implementation-artifacts/     # Per-story specs + sprint-status.yaml
  test-artifacts/               # Test plans, traceability
```

## Prerequisites

- **Node.js** 20+ and npm
- **Supabase project** (local CLI or hosted) for Postgres, Auth, and Storage
- **Stripe account** (test mode is fine for local dev)
- **Twilio account** with an SMS-capable phone number
- **Bitwarden Secrets Manager** account with a machine access token (`BWS_SECRETS_TOKEN`) — secrets are pulled at load time by `@varlock/bitwarden-plugin`
- **Hosts file entry** mapping `everything.test` to `127.0.0.1` — required so the browser, Next.js dev server, and local Supabase all share the same origin. Add this line to your hosts file (`C:\Windows\System32\drivers\etc\hosts` on Windows, `/etc/hosts` on macOS/Linux):
  ```
  127.0.0.1  everything.test
  ```

## Getting Started

1. **Clone and install**
   ```bash
   git clone <repo-url>
   cd rentingapp
   npm install
   ```

2. **Create your local env file**
   ```bash
   cp .env.example .env.local
   ```
   This gives you all the defaults needed to run against the local Supabase emulator. No secrets required for basic local dev.

3. **Configure production secrets** _(optional — only needed for Stripe/Twilio features)_
   - Set `BWS_SECRETS_TOKEN` as a user/shell env var (never commit it).
   - Populate the referenced secrets in your BWS dashboard. See `.env.schema` for the required keys and `docs/bitwarden-secrets-setup.md` for the recommended naming convention.

4. **Run the dev environment**
   ```bash
   npm run dev
   ```
   This single command starts the local Supabase emulator (if not already running) and then launches the Next.js dev server. The app will be available at http://everything.test.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start the Next.js dev server |
| `npm run build` | Production build |
| `npm run start` | Start the production server |
| `npm run lint` | ESLint over the project |
| `npm run type-check` | `tsc --noEmit` strict type check |
| `npm test` | Vitest unit/component tests (single run) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test:e2e` | Playwright e2e tests (via `varlock run`) |
| `npm run test:e2e:cleanup` | Clean up e2e test fixtures/users |

## Environment Variables

All env vars are declared in `.env.schema` and resolved at runtime by Varlock from Bitwarden Secrets Manager. Required keys:

- **Supabase:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- **Stripe:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- **Twilio:** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`
- **Bitwarden bootstrap:** `BWS_SECRETS_TOKEN` (shell env only — never written to disk)

## Testing

- **Unit / component:** `npm test` — Vitest + Testing Library. Colocate tests next to source (`widget.ts` / `widget.test.ts`).
- **End-to-end:** `npm run test:e2e` — Playwright specs live in `tests/e2e/`. Tests run through `varlock run` so they see the same resolved secrets as the app.
- Test plans and traceability matrices are tracked in `_bmad-output/test-artifacts/`.

## Architecture Notes

- **Next.js App Router on Supabase** (Postgres + Auth + Storage). Renters arrive via direct classifieds links rather than site-wide search.
- **Auth split:** operators use Supabase email/password; renters use Twilio SMS OTP (no passwords).
- **Universal manage URL** behind OTP auth gives renters one entry point to every rental.
- **Category-agnostic data model** from day one, though the MVP ships equipment-only in Utah.
- **5-day post-rental buffer** — 4 days for renter extension + 1 mandatory maintenance day.
- **Payment holds** expire after 7 days (Stripe default). MVP may cap rental duration accordingly.

Full details in `_bmad-output/planning-artifacts/architecture.md`.

## Methodology

This project follows the [BMad Method](https://github.com/bmad-code-org). Planning artifacts in `_bmad-output/` are living documents:

- `_bmad-output/planning-artifacts/prd.md` — PRD (45 functional requirements across 9 capability areas)
- `_bmad-output/planning-artifacts/product-brief-rentingapp.md` — product brief
- `_bmad-output/planning-artifacts/ux-design-specification.md` — UX spec
- `_bmad-output/planning-artifacts/architecture.md` — technical architecture
- `_bmad-output/planning-artifacts/epics.md` — epic and story breakdown
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — source of truth for story status

## Conventions

- TypeScript over JavaScript, strict typing (avoid `any`)
- Named exports over default exports
- `kebab-case` for files and directories
- Colocate tests next to source
- Structured error types over generic throws
- Pin dependency versions; minimize external deps

**Git:**
- Commits: `type(scope): description` (types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `build`)
- Branches: `type/short-description` (e.g. `feat/listing-search`)
- Atomic, bisectable commits

See `AGENTS.md` for the full set of agent/contributor rules.

## Contributing

This is a solo project at the moment (owner: Clint). If you'd like to contribute, please open an issue to discuss the change before sending a PR. All contributions are expected to follow the conventions above and the BMad planning workflow.

## License

Proprietary — all rights reserved. No license granted for reuse at this time.
