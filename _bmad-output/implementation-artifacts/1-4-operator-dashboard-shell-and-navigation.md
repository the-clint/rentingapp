# Story 1.4: Operator Dashboard Shell & Navigation

Status: done

## Story

As an **operator**,
I want a functional dashboard with navigation to all major sections,
so that I have a home base for managing my rental business.

## Acceptance Criteria

1. **Desktop sidebar (≥1024px):** Authenticated operator sees a fixed left sidebar with a warm gradient background (`linear-gradient(180deg, #C45A2D, #2E3E50)`), 240px wide, collapsible to 64px icon-only. Contains navigation items: Dashboard, Listings, Bookings, Messages, Settings. White text. RentingApp logo/wordmark at top. Collapse toggle control persists collapse state across navigations within the session.
2. **Active item highlight:** The nav item matching the current route is highlighted with `primary-light` background fill and a 3px `primary` amber left border accent. Inactive items use white text with subtle hover background (white at 10% opacity).
3. **Main content area:** To the right of the sidebar, main content uses `neutral-100` background and wraps every `(operator)/*` route via `app/(operator)/layout.tsx`. Content area has a max-width of 1200px and 16px (`space-4`) horizontal padding on desktop.
4. **Mobile bottom tab bar (<768px):** Sidebar is replaced by a fixed bottom tab bar with 4 tabs — Listings, Bookings, Messages, More. 56px height plus safe-area bottom padding (`env(safe-area-inset-bottom)`). Active tab uses `primary` amber icon + label; inactive uses `neutral-500`. Tap targets ≥44px. Tabs persist across all `(operator)/*` routes.
5. **Tablet (768–1023px):** Sidebar renders in collapsed 64px icon-only mode by default; user can expand.
6. **Dashboard empty state:** On `/dashboard`, when the authenticated operator has zero listings (determined by querying the `listings` table filtered to their user id), the dashboard shows an empty state: heading "You haven't created any listings yet.", body "List your first piece of equipment and start getting bookings.", and a primary "Create Listing" CTA button that links to `/listings/new`.
7. **Loading skeletons:** While dashboard data (listings count / user info) is loading, the dashboard renders warm-tinted skeleton placeholders using `primary-light` at 30% opacity, matching the final layout dimensions. Implemented via React Suspense, not manual `isLoading` state.
8. **Placeholder section routes:** The nav links resolve — placeholder pages exist at `/listings`, `/bookings`, `/messages`, `/settings`, each rendering a minimal "Coming soon" heading inside the operator layout, so navigation doesn't 404.
9. **Sign out:** A "Sign out" control (placed in the sidebar footer on desktop, inside "More" on mobile) invokes the existing `signOut` Server Action and redirects to `/auth/login`.
10. **Accessibility:** Sidebar is a `<nav aria-label="Primary">` landmark. Nav items are real `<Link>` elements with `aria-current="page"` on the active one. Collapse toggle and sign-out are proper `<button>` with accessible names. Icon-only collapsed state provides `aria-label` on each nav item. All controls reachable via keyboard; focus-visible outline uses `primary-dark` 2px solid (inherited from global CSS).
11. **Responsive behavior:** Resizing the viewport across 767px and 1023px breakpoints correctly swaps between sidebar, collapsed sidebar, and bottom tab bar without layout shift or stuck state.
12. **Tests pass:** All new unit tests pass alongside existing 52 tests. `npm run lint`, `npm run type-check`, `npm run test`, and `npm run build` complete cleanly.

## Tasks / Subtasks

- [x] Task 1: Scaffold operator layout and shell components (AC: #1, #2, #3, #4, #5, #10, #11)
  - [x] 1.1 Replace `app/(operator)/layout.tsx` passthrough with a real layout that renders `<OperatorShell>` wrapping `{children}`. *(Deviation: layout no longer awaits `supabase.auth.getUser()` directly — Next.js 16 Cache Components mode forbids uncached data outside Suspense. The user email is now fetched by `<OperatorUserEmail />` and passed to the shell as a Suspense-wrapped slot.)*
  - [x] 1.2 Create `components/operator/operator-shell.tsx` (Client Component — needs state for collapse). Renders `<OperatorSidebar>` and `<OperatorMobileTabBar>` with Tailwind responsive classes. Content slot wraps children in `<main className="min-h-screen bg-neutral-100">` with max-width container.
  - [x] 1.3 Create `components/operator/operator-sidebar.tsx` — desktop/tablet sidebar. Accepts `userEmailSlot` (ReactNode, replaces the original `userEmail` prop for the Suspense pattern above). Uses `usePathname()` for active state. Manages `isCollapsed` state with sessionStorage persistence and viewport-based default. Gradient background applied inline.
  - [x] 1.4 Create `components/operator/operator-mobile-tab-bar.tsx` — fixed bottom tab bar with 4 tabs (Listings, Bookings, Messages, More), `pb-[env(safe-area-inset-bottom)]`, `fixed bottom-0 inset-x-0`.
  - [x] 1.5 Create `components/operator/nav-items.ts` — shared `NAV_ITEMS` and `MOBILE_TAB_ITEMS` constants with `lucide-react` icons.
  - [x] 1.6 Collapse toggle in sidebar footer using `PanelLeftClose` / `PanelLeftOpen`, persisted via `sessionStorage` key `operator-sidebar-collapsed`.

- [x] Task 2: Dashboard page with empty state and Suspense (AC: #6, #7, #9)
  - [x] 2.1 Replace `app/(operator)/dashboard/page.tsx` placeholder. Renders `<h1>Dashboard</h1>` and `<Suspense fallback={<DashboardSkeleton />}><DashboardHome /></Suspense>`.
  - [x] 2.2 Create `components/operator/dashboard-home.tsx` as async Server Component. Counts listings via `supabase.from("listings").select("id", { count: "exact", head: true }).eq("operator_id", user.id)`. Gracefully handles `42P01` (missing relation) by returning count = 0 and logging once. Wrapped in try/catch to also catch thrown errors.
  - [x] 2.3 Empty state renders a centered `<Card>` with heading, body, and primary `Create Listing` CTA → `/listings/new`.
  - [x] 2.4 Create `components/operator/dashboard-skeleton.tsx` — `bg-primary-light/30` blocks matching layout dimensions, no spinner.
  - [x] 2.5 Sign-out moved into sidebar footer (desktop) and `/more` placeholder (mobile). Removed inline sign-out from `dashboard/page.tsx`.

- [x] Task 3: Placeholder section routes (AC: #8)
  - [x] 3.1 `app/(operator)/listings/page.tsx` — "Coming in Story 2.1".
  - [x] 3.2 `app/(operator)/bookings/page.tsx` — "Coming in Epic 5".
  - [x] 3.3 `app/(operator)/messages/page.tsx` — "Coming in Epic 6".
  - [x] 3.4 `app/(operator)/settings/page.tsx` — "Coming soon".
  - [x] 3.5 `app/(operator)/more/page.tsx` — Dashboard link, Settings link, Sign out form.
  - [x] 3.6 Added `/more` to `operatorPrefixes` in `lib/supabase/proxy.ts`.
  - [x] 3.7 Added `/more` test case in `lib/supabase/proxy.test.ts` (and updated the inlined `operatorPrefixes` mirror).

- [x] Task 4: Tests (AC: #12)
  - [x] 4.1 `components/operator/operator-sidebar.test.tsx` — landmark, every NAV_ITEMS link, `aria-current="page"`, active styling, nested-route matching, sign-out form, collapse toggle accessible name. Mocks `next/navigation` and `@/lib/actions/auth-actions`.
  - [x] 4.2 `components/operator/operator-mobile-tab-bar.test.tsx` — 4 tabs in order, primary color on active, neutral-500 on inactive, `aria-current` on active, safe-area padding class.
  - [x] 4.3 `components/operator/dashboard-home.test.tsx` — empty state on count = 0, graceful handling of `42P01`, count display when table exists, welcome line with email. Mocks `@/lib/supabase/server` `createClient`.
  - [x] 4.4 `components/operator/nav-items.test.ts` — exact contents and order of NAV_ITEMS and MOBILE_TAB_ITEMS, no Dashboard in mobile tabs.
  - [x] 4.5 Full test suite: **75 / 75 passing** (52 prior + 23 new). `npm run lint` clean, `npm run type-check` clean, `npm run build` clean.

## Dev Notes

### Critical Architecture Patterns — MUST Follow

**Named exports only — NEVER `export default` except where Next.js requires it** (page.tsx, layout.tsx, error.tsx, not-found.tsx, route.ts handlers MAY use default export; everything else must be named).

```typescript
// Correct for non-page components
export function OperatorSidebar() { }

// Correct for Next.js page/layout (see app/layout.tsx for precedent: named + default re-export)
export function DashboardPage() { }
export default DashboardPage;
```

Follow the precedent in `app/layout.tsx` (lines 24, 45) — export a named function, then re-export as default for Next.js.

**File naming:** kebab-case everywhere. `operator-sidebar.tsx`, `operator-sidebar.test.tsx`, `nav-items.ts`.

**Component naming:** PascalCase — `OperatorSidebar`, `DashboardHome`, `OperatorMobileTabBar`.

**Result<T> type:** N/A for this story — no Server Actions are created. The existing `signOut` action is reused.

**Supabase client creation:** ALWAYS inside functions, NEVER module-scope:
```typescript
// CORRECT
async function DashboardHome() {
  const supabase = await createClient();
  // ...
}
```

**Colocate tests:** `operator-sidebar.tsx` next to `operator-sidebar.test.tsx`.

**No `any` type:** Use proper typing or `unknown` with narrowing.

**No manual `isLoading` for Server Actions:** Use `useTransition` or `<Suspense>`. This story uses Suspense for data loading.

### Existing Code to Reuse (DO NOT Recreate)

| File | What It Provides | How to Use |
|------|-----------------|------------|
| `components/ui/button.tsx` | Button with variants (default/secondary/ghost/destructive) and sizes | Use for CTAs; use `asChild` prop to wrap `<Link>` |
| `components/ui/card.tsx` | Card, CardHeader, CardContent, CardFooter | Use for dashboard empty state card |
| `lib/supabase/server.ts` | Server-side Supabase client via `createClient()` | Call from Server Components for user/listing queries |
| `lib/actions/auth-actions.ts` | `signOut` Server Action | Use in `<form action={signOut}>` — do NOT recreate |
| `lib/supabase/proxy.ts` | Route classification + role-based protection | Already protects operator routes; only add `/more` prefix |
| `lib/utils.ts` | `cn()` className helper | Use for conditional class merging |
| `app/globals.css` | Design tokens (primary, primary-light, primary-dark, neutral-100, secondary-dark) | Use via Tailwind classes — they are wired in `tailwind.config.ts` |
| `tailwind.config.ts` | Typography scale (`text-h1`, `text-h1-lg`, `text-body`, etc.), spacing (`space-4`, `space-6`, etc.), colors | Reference these instead of arbitrary values |
| `lucide-react` | Icon library (already installed v0.511.0) | Import icons: `LayoutDashboard`, `Package`, `Calendar`, `MessageSquare`, `Settings`, `PanelLeftClose`, `PanelLeftOpen`, `MoreHorizontal` |

### What Does NOT Exist Yet (Must Create)

- `components/operator/` directory (does not exist — create it)
- `components/operator/operator-shell.tsx`
- `components/operator/operator-sidebar.tsx`
- `components/operator/operator-mobile-tab-bar.tsx`
- `components/operator/nav-items.ts`
- `components/operator/dashboard-home.tsx`
- `components/operator/dashboard-skeleton.tsx`
- `app/(operator)/listings/page.tsx` (and bookings, messages, settings, more)

### What Does NOT Exist Yet (External Dependency)

- **`listings` table** is not created until Story 2.1. The `DashboardHome` component's query will fail with Postgres error code `42P01` (`undefined_table`) until then. **You MUST handle this gracefully** — catch the error, check `error.code === "42P01"` (or `error.message.includes("does not exist")` as a fallback), and treat the count as 0 so the empty state renders. This is temporary scaffolding, not a permanent pattern — Story 2.1 will remove the fallback.

### Design System Tokens — Use These, Not Arbitrary Values

From `tailwind.config.ts` and `app/globals.css` (both already wired up):

**Colors (Tailwind class):**
- `bg-primary`, `text-primary` → amber `#E87B35`
- `bg-primary-light`, `text-primary-light` → peach `#F5C4A1`
- `bg-primary-dark`, `text-primary-dark` → deep terracotta `#C45A2D`
- `bg-secondary`, `bg-secondary-dark` → slate `#4A6178` / twilight `#2E3E50`
- `bg-neutral-100` → `#F5F5F5` (main content background)
- `text-neutral-500` → mid-grey (inactive tab icons)
- `bg-primary-light/30` → primary-light at 30% opacity (skeleton tint)

**Sidebar gradient:** use inline style since Tailwind doesn't have a built-in gradient utility for these exact hex stops:
```tsx
style={{ background: "linear-gradient(180deg, #C45A2D 0%, #2E3E50 100%)" }}
```

**Typography:**
- `text-h1` (mobile) / `text-h1-lg` (desktop) for page headings
- `text-body` for body copy
- `text-small` for nav labels
- `text-caption` for tab bar labels

**Spacing (Tailwind class):**
- `p-space-4` (16px), `p-space-6` (24px), `gap-space-2` (8px)
- Sidebar width: `w-[240px]` when expanded, `w-[64px]` when collapsed (these are exact per UX spec, not in the spacing scale)
- Tab bar height: `h-14` (56px)

**Focus:** Handled globally in `globals.css` (`*:focus-visible`). Do not override.

### Layout Architecture — Server vs Client Components

```
app/(operator)/layout.tsx              [Server Component]
  ↓ fetches user email once
  └─ <OperatorShell userEmail={...}>   [Client Component — has collapse state]
       ├─ <OperatorSidebar>             [Client — usePathname, state]
       ├─ <OperatorMobileTabBar>        [Client — usePathname]
       └─ <main>{children}</main>       [children are Server Components, e.g. dashboard/page.tsx]
```

**Critical:** The shell is a Client Component (because of state), but `children` passed into it retain their Server-Component-ness. This is the standard Next.js pattern — passing Server Components as children through a Client Component boundary works fine.

### Responsive Breakpoints (from `ux-design-specification.md` §Responsive Strategy, lines 1584-1590)

| Breakpoint | Tailwind | Sidebar State | Tab Bar |
|------------|----------|---------------|---------|
| Mobile `<768px` | default | hidden | visible (bottom) |
| Tablet `768-1023px` | `md:` | collapsed (64px) default | hidden |
| Desktop `≥1024px` | `lg:` | expanded (240px) default | hidden |

Tailwind default breakpoints already match: `md` = 768px, `lg` = 1024px.

### Nav Items — Exact Specification

Desktop sidebar (5 items, in order):
1. Dashboard → `/dashboard` → `LayoutDashboard` icon
2. Listings → `/listings` → `Package` icon
3. Bookings → `/bookings` → `Calendar` icon
4. Messages → `/messages` → `MessageSquare` icon
5. Settings → `/settings` → `Settings` icon

Mobile bottom tab bar (4 items + More):
1. Listings → `/listings` → `Package`
2. Bookings → `/bookings` → `Calendar`
3. Messages → `/messages` → `MessageSquare`
4. More → `/more` → `MoreHorizontal`

Note: The mobile tab bar does NOT include "Dashboard" per the UX spec (line 1477). Dashboard is accessible via the logo tap in the header (or from within More for now).

### Project Structure — Files to Create/Modify

```
NEW:
components/operator/operator-shell.tsx
components/operator/operator-sidebar.tsx
components/operator/operator-sidebar.test.tsx
components/operator/operator-mobile-tab-bar.tsx
components/operator/operator-mobile-tab-bar.test.tsx
components/operator/nav-items.ts
components/operator/nav-items.test.ts
components/operator/dashboard-home.tsx
components/operator/dashboard-home.test.tsx
components/operator/dashboard-skeleton.tsx
app/(operator)/listings/page.tsx
app/(operator)/bookings/page.tsx
app/(operator)/messages/page.tsx
app/(operator)/settings/page.tsx
app/(operator)/more/page.tsx

MODIFY:
app/(operator)/layout.tsx            # Replace passthrough with real shell
app/(operator)/dashboard/page.tsx    # Remove inline sign-out, render DashboardHome via Suspense
lib/supabase/proxy.ts                # Add "/more" to operatorPrefixes
lib/supabase/proxy.test.ts           # Add test case for /more
```

**Architecture spec deviation:** The architecture spec (line 509) mentions `components/shared/` for cross-domain components but does not define a `components/operator/` location explicitly. The closest analogues are `components/booking/`, `components/listing/`, etc. — domain-specific folders. `components/operator/` follows the same domain pattern and is the correct home for these shell components.

### Previous Story Learnings (from 1-3)

- **Next.js 16 uses `proxy.ts`, not `middleware.ts`.** Do not create a `middleware.ts` file — extend `proxy.ts` and `lib/supabase/proxy.ts` instead.
- **Zod v4 uses `.issues`, not `.errors`** on `ZodError`. N/A for this story (no new schemas), but keep in mind.
- **Suspense is required for async Server Components** doing `supabase.auth.getUser()` or data fetching — Next.js partial prerender requirement. This story leans on Suspense heavily.
- **Components moved from `components/` to `components/auth/`** in story 1-3. Follow the same domain-folder pattern here with `components/operator/`.
- **All tests must pass (52 currently), zero regressions.** Run the full suite before marking done.
- **Vitest config** at `vitest.config.ts` — uses jsdom. `@testing-library/react` and `@testing-library/jest-dom` are installed.

### Testing Standards

- **Framework:** Vitest + React Testing Library (already configured; see `vitest.config.ts`, `vitest.setup.ts`).
- **Colocation:** Test file next to source — `operator-sidebar.tsx` / `operator-sidebar.test.tsx`.
- **Mocking `next/navigation`:** `vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }))` — adjust per-test via `vi.mocked`.
- **Mocking Supabase in `dashboard-home.test.tsx`:** Mock `@/lib/supabase/server` `createClient` to return a stub that yields `{ data: { user: { id: "x" } }, error: null }` from `auth.getUser()` and a configurable count from `.from("listings").select(...)`. For the missing-table case, make the query return `{ count: null, error: { code: "42P01", message: "relation \"listings\" does not exist" } }`.
- **Coverage expectations:** Unit tests for every new component; integration test not required for this story (breakpoint behavior is CSS-driven).
- **Existing patterns:** See `app/layout.test.tsx` for how this project mocks Next.js features, and `components/ui/button.test.tsx` for component test style.

### Accessibility Checklist

- Sidebar wrapped in `<nav aria-label="Primary">`
- Mobile tab bar wrapped in `<nav aria-label="Primary mobile">`
- Active nav item has `aria-current="page"`
- Collapse toggle `<button>` has `aria-label="Collapse sidebar"` / `"Expand sidebar"` and `aria-expanded={!isCollapsed}`
- Icon-only collapsed nav items have `aria-label` on the `<Link>` (icon has `aria-hidden="true"`)
- Sign out button: proper `<form action={signOut}><button type="submit">Sign out</button></form>` with accessible text
- All interactive elements ≥44px tap target on mobile

### Anti-Patterns — DO NOT

- Do NOT create a `middleware.ts` file (Next.js 16 uses `proxy.ts`)
- Do NOT recreate `signOut` — import from `lib/actions/auth-actions.ts`
- Do NOT use `any` — use `unknown` + narrowing if type is genuinely dynamic
- Do NOT use `export default` for non-page components
- Do NOT inline sign-out in `dashboard/page.tsx` anymore — move it to the shell
- Do NOT add manual `isLoading` state for data fetching — use Suspense
- Do NOT hardcode colors — use Tailwind design tokens (exception: sidebar gradient inline style, because Tailwind can't express that gradient)
- Do NOT create new Supabase clients at module scope — always call `createClient()` inside the function
- Do NOT build the mobile tab bar as a separate page layout — it must coexist with the sidebar in the same shell, hidden/shown via responsive classes
- Do NOT query the `listings` table without try/catch — it does not exist yet (Story 2.1 creates it)

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.4 — lines 303-328]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Navigation Patterns — lines 1453-1488]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Empty States — lines 1507-1521]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Loading States — lines 1489-1506]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Responsive Strategy — lines 1569-1592]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Operator Dashboard layout — lines 558-572]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Chosen Direction — lines 637-665]
- [Source: _bmad-output/planning-artifacts/architecture.md#Project Directory Structure — lines 385-408]
- [Source: _bmad-output/planning-artifacts/architecture.md#Naming Patterns — lines 226-246]
- [Source: _bmad-output/planning-artifacts/architecture.md#Enforcement Guidelines — lines 323-340]
- [Source: _bmad-output/implementation-artifacts/1-3-operator-registration-and-login.md — previous story learnings]
- [Source: app/globals.css — design tokens]
- [Source: tailwind.config.ts — typography/spacing/color wiring]
- [Source: lib/supabase/proxy.ts — route protection already in place]

## Dev Agent Record

### Agent Model Used

claude-opus-4-6 (1M context)

### Debug Log References

- `npm run test` baseline failed initially due to missing `zod` in `node_modules` (pre-existing issue from a stale install). `npm install` resolved it; baseline returned to 52 passing tests before any story 1-4 changes.
- First test run after writing component tests showed 12 failures, all "found multiple elements" errors caused by RTL not auto-cleaning the DOM between tests. Root cause: `vitest.setup.ts` didn't wire up `cleanup()` because the project runs Vitest without `globals: true`. Added `afterEach(cleanup)` in `vitest.setup.ts` — all 75 tests then passed.
- First `npm run build` failed with `Route "/listings": Uncached data was accessed outside of <Suspense>`. Cache Components mode in Next.js 16 forbids `supabase.auth.getUser()` in a layout outside Suspense. Refactored: layout no longer fetches the user; instead it renders `<Suspense><OperatorUserEmail /></Suspense>` and passes the result as `userEmailSlot` into `OperatorShell` → `OperatorSidebar`. Build then succeeded.

### Completion Notes List

- All 12 acceptance criteria implemented. AC #12 verified: 75/75 tests pass, lint clean, type-check clean, build clean.
- **Key architecture deviation from the story spec, with rationale:** Story task 1.1 said the operator layout should fetch the user email and pass it to the shell. Next.js 16 Cache Components mode rejects this — uncached data must live inside Suspense. The user email fetch was moved into `components/operator/operator-user-email.tsx` (async Server Component) and passed through the shell as a `userEmailSlot: ReactNode` prop, wrapped in `<Suspense fallback={null}>` at the layout level. This is a strict superset of the story intent — the same data still reaches the same place in the UI — and it follows the Story 1-3 learning that "Suspense is required for async Server Components doing supabase.auth.getUser()". Worth flagging in the code review.
- **Testing-infrastructure side effect:** `vitest.setup.ts` now calls `cleanup()` in `afterEach`. This is a project-wide test improvement (without it, any future test that renders the same component twice would silently fail to isolate state). Existing tests still pass — they just weren't exercising the cleanup path.
- The mobile bottom tab bar uses a white background (not the warm gradient) per the UX spec convention that gradient is sidebar-only and bottom bars use neutral surfaces. Active tab uses `text-primary` (amber), inactive uses `text-neutral-500`.
- The `/more` route was added to `lib/supabase/proxy.ts` `operatorPrefixes` AND mirrored in the inlined copy inside `lib/supabase/proxy.test.ts` (the test file copies the function rather than importing it, so both must stay in sync).
- The empty-state fallback in `dashboard-home.tsx` is temporary scaffolding — Story 2.1 will create the `listings` table and remove the try/catch + 42P01 branch.

### File List

**New:**
- `components/operator/nav-items.ts`
- `components/operator/nav-items.test.ts`
- `components/operator/operator-shell.tsx`
- `components/operator/operator-sidebar.tsx`
- `components/operator/operator-sidebar.test.tsx`
- `components/operator/operator-mobile-tab-bar.tsx`
- `components/operator/operator-mobile-tab-bar.test.tsx`
- `components/operator/operator-user-email.tsx`  *(architecture deviation — see Completion Notes)*
- `components/operator/operator-user-email.test.tsx`  *(added during 2026-04-09 review fix)*
- `components/operator/dashboard-home.tsx`
- `components/operator/dashboard-home.test.tsx`
- `components/operator/dashboard-skeleton.tsx`
- `app/(operator)/listings/page.tsx`
- `app/(operator)/bookings/page.tsx`
- `app/(operator)/messages/page.tsx`
- `app/(operator)/settings/page.tsx`
- `app/(operator)/more/page.tsx`

**Modified:**
- `app/(operator)/layout.tsx` — replaced passthrough with `OperatorShell` + Suspense-wrapped user email slot
- `app/(operator)/dashboard/page.tsx` — replaced inline sign-out with Suspense-wrapped `<DashboardHome />` and `<DashboardSkeleton />` fallback
- `lib/supabase/proxy.ts` — added `/more` to `operatorPrefixes`
- `lib/supabase/proxy.test.ts` — added `/more` to inlined prefix list and added test case
- `vitest.setup.ts` — added `afterEach(cleanup)` so RTL DOM is reset between tests

### Change Log

- 2026-04-09 — Story 1.4 implementation complete (Opus 4.6). All ACs satisfied, 75/75 tests passing, lint/type-check/build clean. Status: in-progress → review.
- 2026-04-09 — Code review (Opus 4.6 subagent). Found one HIGH (collapsed sidebar left a 176px content gutter on desktop — AC #1 / #11 violation), one MED (tablet hydration flash — AC #5 / #11 violation), and several LOWs. Fixes applied: lifted collapse state into `OperatorShell` so sidebar width and main padding stay in sync; introduced an `"auto" | "collapsed" | "expanded"` tri-state so SSR / first paint uses CSS responsive defaults (no flash on tablet); replaced inline sign-out SVG with `lucide-react` `LogOut`; dropped duplicate `auth.getUser()` call from `DashboardHome` (welcome line lives in the sidebar via `OperatorUserEmail` already); removed module-scope `missingTableLogged` flag; added thrown-error and singular-count tests for `dashboard-home`; added a sibling-prefix edge-case test (`/listingstwo` does not match `/listings`); added a test file for `OperatorUserEmail`; refactored `OperatorSidebar` to a controlled component receiving `widthClass` / `isCollapsed` / `showLabels` / `onToggle` props. **85 / 85 tests now pass**, lint/type-check/build clean. Status: review → done.
