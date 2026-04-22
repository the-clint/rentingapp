# Sprint Change Proposal — Switch Hosting Platform from Vercel to Netlify

**Date:** 2026-04-19
**Author:** Clint (solo dev)
**Scope classification:** **Minor → Moderate** (documentation-heavy; trivial code; no story rework)
**Mode:** Batch

---

## 1. Issue Summary

**Trigger:** Operator (Clint) has decided to host Everything.Rent on **Netlify** instead of **Vercel**. No production deployment has occurred yet, so there is no runtime migration cost — only a correction to planning artifacts, one tutorial component, and two comments.

**Why now:** Preference shift before first production cut. Catching the decision before DNS, env setup, and operator onboarding is far cheaper than after.

**Evidence (grep sweep on 2026-04-19):**

- No `vercel.json` / `vercel.ts` / `@vercel/*` package dependency exists.
- Vercel CLI is not installed locally (confirmed by session startup hook).
- CI is GitHub Actions only (`.github/workflows/ci.yml`) — no Vercel GitHub App wiring to unwind.
- Vercel appears in **4 planning artifacts**, **4 story specs**, **1 tutorial component** (`components/deploy-button.tsx`), and **2 explanatory comments** (`.env.production:8`, `app/api/cron/return-reminders/route.ts:6`).
- One architectural comment (`lib/supabase/proxy.ts` area) calls out a session-leakage rule under "Vercel Fluid Compute" — the rule is runtime-agnostic; the platform label is the only change.

---

## 2. Impact Analysis

### Epic Impact

| Epic | Status | Impact |
|---|---|---|
| Epic 1 — Foundation & Operator Auth | done | Doc-only edits to story 1-1 and 1-3 specs (historical record) |
| Epic 2 — Listings | done | Doc-only edit to story 2-5 spec |
| Epic 3 — Booking Flow | done | None |
| Epic 4 — Manage My Rental | done | Doc-only edit to story 4-5 spec (cron scheduler name) |
| Epic 5 — Operator Bookings | done | None |
| Epic 6 — Messaging | done | None |
| Epic 7 — Ops | done | None |

**No stories require reopening.** Story specs are historical artifacts; updates are optional but recommended to keep them reliable as onboarding references.

### Story Impact

Zero in-flight stories. Zero reopened stories. No new stories required for the swap itself (see §3 for a single small doc/code cleanup task).

### Artifact Conflicts

| Artifact | Needs update? | Notes |
|---|---|---|
| PRD | **No direct edits needed** | PRD doesn't name Vercel; it stays platform-neutral. |
| Architecture (`architecture.md`) | **Yes** | 6 Vercel references across Starter rationale, Cost, CI/CD, Monitoring, Security, Deployment, Strengths sections |
| Epics (`epics.md`) | **Yes** | 1 reference under Architecture Decisions (CI/CD line) |
| Starter template evaluation | **Yes** | Several references (historical doc; light touch OK) |
| UX spec | No | No hosting references |
| Story specs (1-1, 1-3, 2-5, 4-5) | **Recommended** | Minor clarifying edits only |

### Technical Impact (code + config)

| File | Change | Effort |
|---|---|---|
| `components/deploy-button.tsx` | Delete — this is Supabase starter boilerplate, not used in the operator or renter flows. Confirm no imports first. | Trivial |
| `app/api/cron/return-reminders/route.ts:6` | Replace "Vercel Cron" example with "Netlify Scheduled Functions" in the JSDoc. | Trivial |
| `.env.production:8` | Update comment example from "Vercel → Settings → Environment Variables" to "Netlify → Site configuration → Environment variables". | Trivial |
| `lib/supabase/proxy.ts` comment (via story 1-3 spec) | Rephrase the "Vercel Fluid Compute" session-leakage comment to "serverless runtimes (Netlify Functions, Vercel, etc.)" — the rule is platform-agnostic. | Trivial |
| `next.config.*` | No changes expected. Netlify's official `@netlify/plugin-nextjs` auto-detects Next 15 App Router. | None |
| GitHub Actions CI | No changes. Netlify builds independently via its own GitHub App, and CI keeps lint/type-check/test/build. | None |

### Infrastructure Impact

- **Preview deployments:** Netlify Deploy Previews cover the Vercel "preview on PR" behavior.
- **Scheduled jobs:** Story 4-5's daily return-reminder POST can run on Netlify **Scheduled Functions** (cron syntax, same shape). Supabase `pg_cron` remains a viable fallback and is already mentioned in code comments.
- **Logs & analytics:** Netlify provides function logs and a built-in analytics add-on; architecture doc needs this swap.
- **Cost:** Netlify free tier is comparable to Vercel free tier for this workload. No budget change.
- **Env vars:** Same varlock flow; values get pasted into Netlify's env UI instead of Vercel's.

### Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Next.js 15 App Router edge case on Netlify | Low | `@netlify/plugin-nextjs` is first-party and supports App Router; smoke-test on first preview deploy. |
| Scheduled Function cold start affects SMS reminder timing | Low | Already idempotent per story 4-5; timing tolerance is hours, not minutes. |
| Accidental commit of Vercel-specific assumptions later | Low | Architecture doc update in §4 locks the decision in. |

---

## 3. Recommended Approach

**Selected path: Option 1 — Direct Adjustment** (with micro-rollback on one unused tutorial file).

### Rationale

- Zero production deployment to migrate.
- No runtime code depends on Vercel-specific APIs (ISR-on-demand handlers, `@vercel/*` packages, `vercel.json` redirects, etc.).
- CI is decoupled from the host.
- The change is almost entirely documentation hygiene plus one tutorial-component deletion.

### Effort / Risk

- **Effort:** Low (~30–60 minutes of doc edits + one code deletion + three comment tweaks)
- **Timeline impact:** None. Does not block or unblock any story.
- **Risk:** Low. First preview deploy on Netlify will be the verification gate.

### Alternatives considered

- **Option 2 (Rollback):** Not applicable — nothing was built against Vercel primitives.
- **Option 3 (MVP review):** Not applicable — MVP scope untouched.

---

## 4. Detailed Change Proposals

### 4.1 `_bmad-output/planning-artifacts/architecture.md`

Replace Vercel references with Netlify, and soften runtime-specific claims:

```
OLD (line 91):
5. Vercel deployment is zero-config for Next.js — cheapest path to production

NEW:
5. Netlify deployment is zero-config for Next.js via @netlify/plugin-nextjs — cheapest path to production
```

```
OLD (line 135):
| Frontend + API | Vercel free tier | $0 |

NEW:
| Frontend + API | Netlify free tier | $0 |
```

```
OLD (lines 194–196):
- **CI/CD:** GitHub Actions for lint + type-check + tests on PRs. Vercel auto-deploys on merge to main
- **Environments:** Two environments — local (Supabase CLI via Docker) and production (Vercel + Supabase Pro)
- **Monitoring:** Vercel built-in analytics and function logs. SMS failures logged to `sms_log` table...

NEW:
- **CI/CD:** GitHub Actions for lint + type-check + tests on PRs. Netlify auto-deploys on merge to main (via Netlify GitHub App)
- **Environments:** Two environments — local (Supabase CLI via Docker) and production (Netlify + Supabase Pro)
- **Monitoring:** Netlify built-in analytics and function logs. SMS failures logged to `sms_log` table...
```

```
OLD (line 616):
- Log redaction — Prevents sensitive values from appearing in Vercel function logs.

NEW:
- Log redaction — Prevents sensitive values from appearing in Netlify function logs.
```

```
OLD (lines 647–649):
- Push to `main` → Vercel auto-deploys to production
- PRs → Vercel creates preview deployment
- Env vars configured in Vercel dashboard (production) and `.env.local` (local dev)

NEW:
- Push to `main` → Netlify auto-deploys to production
- PRs → Netlify creates Deploy Preview
- Env vars configured in Netlify Site configuration (production) and `.env.local` (local dev)
```

```
OLD (line 714):
- Managed services (Supabase, Stripe, Twilio, Vercel) minimize operational overhead for solo developer

NEW:
- Managed services (Supabase, Stripe, Twilio, Netlify) minimize operational overhead for solo developer
```

**Add a short decision note** near the top of the Deployment section:

> **2026-04-19 decision:** Switched host from Vercel to Netlify prior to first production deploy. Driver: operator preference. Next.js 15 App Router is supported via `@netlify/plugin-nextjs`; scheduled jobs use Netlify Scheduled Functions.

### 4.2 `_bmad-output/planning-artifacts/epics.md`

```
OLD (line 110):
- CI/CD: GitHub Actions (lint + type-check + varlock scan + tests + build), Vercel auto-deploy on merge to main

NEW:
- CI/CD: GitHub Actions (lint + type-check + varlock scan + tests + build), Netlify auto-deploy on merge to main
```

### 4.3 `_bmad-output/planning-artifacts/starter-template-evaluation.md`

Light touch: replace "Vercel" with "Netlify" in deployment references. This is a historical evaluation doc; acceptable to add a dated footnote: *"2026-04-19: decision later changed to Netlify — see architecture.md."*

### 4.4 Story specs (historical — light edits)

- **1-1 init:** Change "Production: Vercel auto-deploys on merge to main" → "Production: Netlify auto-deploys on merge to main".
- **1-3 operator auth:** Rephrase the "Vercel Fluid Compute" session-leakage comment to "serverless runtimes" (Netlify Functions behave the same way — shared module state across invocations). Remove the `getBaseUrl()` deferred-risk note that says "acceptable on Vercel which strips inbound `Host` headers"; replace with a TODO to verify Netlify's `Host` handling before production.
- **2-5 posting assistant:** `headers()` comment referencing Vercel stays accurate (it covers most proxies, including Netlify) — rephrase "covers Vercel and most proxies" → "covers most proxies (Netlify, Vercel, etc.)".
- **4-5 SMS return reminder:** "Vercel Cron or equivalent" → "Netlify Scheduled Functions or equivalent".

### 4.5 Code changes

```
1. DELETE: components/deploy-button.tsx
   - First grep the codebase to confirm no imports. If unused (likely,
     it's Supabase starter tutorial boilerplate), delete outright.
   - If imported by tutorial pages that are themselves unused, delete
     those too in the same commit.

2. EDIT: app/api/cron/return-reminders/route.ts (line 6)
   OLD: "Expected caller: a scheduled job (Vercel Cron, Supabase pg_cron,"
   NEW: "Expected caller: a scheduled job (Netlify Scheduled Functions, Supabase pg_cron,"

3. EDIT: .env.production (line 8)
   OLD: "# hosting platform's env UI (e.g. Vercel → Settings → Environment Variables)."
   NEW: "# hosting platform's env UI (e.g. Netlify → Site configuration → Environment variables)."

4. EDIT: lib/supabase/proxy.ts (or wherever the "Vercel Fluid Compute" comment lives)
   - Soften platform label to "serverless runtimes" — the invariant is
     cross-platform.
```

**Commit convention:** one commit per grouping, each conforming to `type(scope): description`:

- `docs(architecture): switch host references from Vercel to Netlify`
- `docs(epics): update CI/CD note for Netlify`
- `docs(stories): clarify host-agnostic language in historical story specs`
- `chore(tutorial): remove unused Vercel deploy button`
- `docs: update inline comments to reference Netlify where Vercel was example`

### 4.6 New deployment checklist item (for first prod cut)

Add to the production readiness note (informal, not a story):

- [ ] Install `@netlify/plugin-nextjs` (or confirm auto-detection on first deploy)
- [ ] Create Netlify site, link to GitHub repo, select `main` branch
- [ ] Paste env vars from Bitwarden/varlock into Netlify env UI
- [ ] Configure Netlify Scheduled Function for `/api/cron/return-reminders` (daily)
- [ ] Smoke-test Deploy Preview for a PR
- [ ] Verify Stripe + Twilio webhooks point at Netlify production URL
- [ ] Verify `NEXT_PUBLIC_SITE_URL` matches the Netlify-assigned custom domain
- [ ] Verify Supabase auth redirect URLs include the Netlify production URL

---

## 5. Implementation Handoff

**Scope classification:** **Minor**.

**Recipient:** Solo developer (Clint) — direct implementation.

**Deliverables:**

1. Architecture + epics doc edits (§4.1, §4.2)
2. Starter-template-evaluation footnote (§4.3)
3. Story-spec clarifications (§4.4) — optional but recommended
4. Code + comment edits (§4.5) — trivial
5. Netlify production checklist (§4.6) — to run at first prod deploy

**Success criteria:**

- Grep for `Vercel` returns only intentional comparative mentions (e.g., "covers Netlify, Vercel, etc.") or distillates/skills outside the project-owned docs.
- First Netlify Deploy Preview builds and serves the app without errors.
- Scheduled return-reminder runs on Netlify or Supabase `pg_cron` as designed.

**Non-goals for this change:**

- No PRD edits.
- No reopening of done stories.
- No rework of CI (GitHub Actions stays as-is).
- No architectural refactor — Supabase/Stripe/Twilio patterns are unchanged.

---

## 6. Approval

Approval status: **pending user confirmation.**

Once approved, recommended execution order:

1. §4.5 code edits (fastest, removes stale boilerplate)
2. §4.1–4.2 architecture + epics doc edits
3. §4.3–4.4 historical doc edits
4. §4.6 checklist retained for first prod deploy
