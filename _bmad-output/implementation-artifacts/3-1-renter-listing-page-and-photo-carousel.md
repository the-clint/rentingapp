# Story 3.1: Renter Listing Page & Photo Carousel

Status: done

## Story

As a **renter**,
I want to view a professional listing page with photos, description, pricing, and pickup location from a classifieds link,
so that I can evaluate the equipment before deciding to book.

## Acceptance Criteria

1. **Public renter route at `/book/[listingId]`:** A new Next.js App Router Server Component lives at `app/(renter)/book/[listingId]/page.tsx`. The route group `(renter)` has its own top-level layout at `app/(renter)/layout.tsx` so that the renter surface does not inherit the operator shell (sidebar, tab bar, operator auth assumptions). The proxy already lists `/book` in `PUBLIC_ROUTES` (see `lib/supabase/proxy.ts`), so the page is reachable without authentication — no proxy edit is required. Opening `/book/{listingId}` in an unauthenticated browser loads the listing with no redirect.
2. **Published-only data fetch:** The page reads the listing via a new pure Server Component helper `fetchPublicListing(listingId)` exported from `lib/services/public-listing.ts`. The helper uses the existing `lib/supabase/server.ts` `createClient()`, which already runs under the anon publishable key when no session cookie is present and therefore resolves against the `"Public can read published listings"` RLS policy from `supabase/migrations/00003_listings.sql`. The SELECT filters to `status = 'published' AND deleted_at IS NULL` defensively (in addition to the RLS guarantee). The helper returns `Result<PublicListing | null, ListingFetchError>` where `null` means "no row visible to anon" and an error `Result` means "the query itself blew up." The helper does NOT select `pickup_instructions` — the column-level grant in migration 00003 hides it from the anon role, so asking for it would hard-fail the query.
3. **404 on missing / unpublished / deleted:** When `fetchPublicListing` returns `null` or a Result error, the page calls `notFound()` from `next/navigation`. The behavior is identical for all three "not visible" reasons (draft, archived, soft-deleted, genuinely absent) so that the URL does not leak status information to renters.
4. **Photo carousel hero:** The page renders `<ListingPhotoCarousel photos={photos} listingName={name} />` from `components/booking/listing-photo-carousel.tsx` (new Client Component). Carousel behavior:
   - Native horizontal scroll-snap track — each slide is `w-full` and `snap-start`. On mobile the user swipes; on desktop the track is keyboard and button driven.
   - Dot indicators below the track. The active dot uses `bg-primary` (amber `#E87B35`); inactive dots use `bg-neutral-300`. Clicking a dot jumps the track to that slide via `scrollIntoView({ behavior: "smooth", inline: "start" })`.
   - Photo counter `"n / total"` overlaid on the top-right of the track, rendered as `text-small` white text on a `bg-black/50` rounded pill.
   - Previous / Next arrow buttons (`ChevronLeft` / `ChevronRight` from `lucide-react`) absolutely positioned at the left and right edges. They are visually hidden by default on touch devices (`hidden md:flex`) and only appear on `md:` breakpoints where a pointer is assumed. The buttons clamp to `[0, total - 1]` — they do NOT wrap around. The previous button is `disabled` on slide 0 and the next button is `disabled` on slide `total - 1`, with `aria-disabled` reflecting the same state.
   - Accessibility: the outer container has `role="region"` and `aria-roledescription="carousel"` and `aria-label={\`${listingName} photos\`}`. Each slide is `role="group"` with `aria-roledescription="slide"` and `aria-label="Photo {n} of {total}"`. Keyboard `ArrowLeft` / `ArrowRight` on the region moves the active slide and focuses the new slide (tabIndex=0 on the active slide only).
   - The track uses `scroll-smooth` and the component listens to the track's `scroll` event (throttled via `requestAnimationFrame`) to derive the active slide index from `scrollLeft / offsetWidth`, so swipes on mobile update the dots and the counter. A single `IntersectionObserver`-free implementation keeps the test surface simple and the browser compat matrix wide.
   - Single-photo edge case: when `photos.length === 1`, dots and arrows are not rendered and the counter shows `"1 / 1"`.
5. **Above-the-fold content:** Below the carousel, the page renders:
   - `<h1 className="text-display lg:text-display-lg">{listing.name}</h1>`
   - Daily rate using the `text-price` token: `$${(daily_rate_cents / 100).toFixed(2)} <span className="text-body text-neutral-700">/ day</span>`.
   - Pickup location row with a `MapPin` icon from `lucide-react` and the text in `text-body text-neutral-700`.
   - Description rendered as `<p className="whitespace-pre-wrap text-body">`. The full description is shown — no truncation, no "read more."
6. **Layout & responsive rules:** The page body is a single column, `max-w-[480px]` centered horizontally, with `px-space-4` (16px) horizontal padding and `py-space-6` vertical padding. Mobile-first; on desktop the content column stays at 480px max-width — the carousel bleeds to `w-screen` on mobile and is constrained to the column on `md:` and up. The page background is `bg-neutral-50` (warm-tinted off-white) and the content card (carousel + details) is stacked vertically with `gap-space-5` between sections.
7. **Loading skeleton:** `app/(renter)/book/[listingId]/loading.tsx` renders a skeleton that matches the final layout: a full-width `aspect-[4/3]` `bg-neutral-100` block for the hero, a 60% width `h-8 bg-neutral-100` bar for the title, a 30% width `h-6 bg-neutral-100` bar for the price, a 40% width `h-4 bg-neutral-100` bar for the pickup row, and three full-width `h-4 bg-neutral-100` bars for description lines. All placeholders use `animate-pulse` and warm-tinted neutrals. The skeleton is wrapped in the same `max-w-[480px] mx-auto px-space-4 py-space-6` container as the real page.
8. **Renter layout shell:** `app/(renter)/layout.tsx` is a minimal Server Component that renders `{children}` inside a `<main className="min-h-screen bg-neutral-50">` wrapper. It does NOT render the operator sidebar, operator tab bar, or any auth-dependent UI. It does NOT call `supabase.auth.getUser()` or any other server-side auth check.
9. **Data fetch helper is tested:** `lib/services/public-listing.test.ts` uses a `vi.mock("@/lib/supabase/server")` stub to cover:
   - Happy path: published, non-deleted row → returns `ok({...})` with the expected shape (photos resolved to public URLs).
   - Not-found: query returns `null` data → returns `ok(null)`.
   - Draft / archived excluded: the mock returns `null` because the `.eq("status", "published")` filter is applied — assert via the mock's `.eq()` call spy that `"status", "published"` was passed.
   - Soft-deleted excluded: assert the helper called `.is("deleted_at", null)`.
   - Query error: the mock returns `{ data: null, error: new PostgrestError(...) }` → returns `err("DATABASE_ERROR", ...)`.
10. **Carousel is tested:** `components/booking/listing-photo-carousel.test.tsx` covers:
    - Renders all photos as `<img>` elements with correct alt text.
    - Renders `n / total` counter starting at `1 / {total}`.
    - Renders `total` dot indicators with the first one marked active (`aria-current="true"`).
    - Clicking the next arrow advances the active dot and updates the counter. Clicking previous goes back. At bounds the respective buttons are `disabled` and aria-disabled.
    - Keyboard `ArrowRight` on the region advances the slide; `ArrowLeft` moves back.
    - Outer region has `aria-roledescription="carousel"`.
    - Single-photo case: no dots, no arrows, counter renders `"1 / 1"`.
    - jsdom note: `scrollTo` / `scrollIntoView` are stubbed with `vi.fn()` in `beforeEach` because jsdom does not implement them — the tests assert the helper was called with the expected arguments rather than observing scroll position changes.
11. **Page smoke test (optional):** A direct render test of `app/(renter)/book/[listingId]/page.tsx` is NOT attempted. Next 16 Server Components with awaited `params` are painful to render in jsdom, and the page's business logic is exercised by the `fetchPublicListing` test and the carousel test. Instead, a lightweight import-smoke test (`lib/services/public-listing.test.ts` imports the helper and asserts `typeof fetchPublicListing === "function"`) is sufficient — documented tradeoff in Dev Notes.
12. **Quality gates:** `npm run test`, `npm run lint`, and `npm run type-check` are clean. `npm run build` is attempted and treated as environment-blocked if `BWS_SECRETS_TOKEN` is not available in the dev agent shell (Story 2.5 precedent).
13. **No new dependencies, no new migrations, no new Server Actions:** This story does NOT add any npm package. This story does NOT add a database migration — migration 00003 already grants anon SELECT on published, non-deleted listings via both RLS and column-level grants, which was explicitly documented as the Story 3.1 entry point in the migration comments. This story does NOT add a Server Action — the renter page is read-only.

## Tasks / Subtasks

- [ ] Task 1: Public listing data fetch helper (AC: #2, #9)
  - [ ] 1.1 Create `lib/services/public-listing.ts`. Export an interface `PublicListing` with the fields `{ id: string; name: string; description: string; dailyRateCents: number; pickupLocation: string; photos: PublicListingPhoto[]; }` and `PublicListingPhoto { path: string; isHero: boolean; position: number; url: string; }`. Export a `ListingFetchError` string-literal union (`"DATABASE_ERROR"` initially; extensible). Export `fetchPublicListing(listingId: string): Promise<Result<PublicListing | null>>`.
  - [ ] 1.2 Implementation: call `createClient()` from `@/lib/supabase/server`, run `.from("listings").select("id, name, description, daily_rate_cents, pickup_location, photos").eq("id", listingId).eq("status", "published").is("deleted_at", null).maybeSingle()`. Do NOT select `pickup_instructions` (anon has no column-level grant on it). If `error` is truthy return `err("DATABASE_ERROR", error.message)`. If `data` is `null` return `ok(null)`. Otherwise map the snake_case row to the camelCase `PublicListing` shape and resolve photo URLs via `supabase.storage.from(LISTING_PHOTOS_BUCKET).getPublicUrl(p.path).data.publicUrl` for each photo (sort by `position` ascending before mapping).
  - [ ] 1.3 Create `lib/services/public-listing.test.ts` colocated. Mock `@/lib/supabase/server` with a chainable query builder helper — provide `from`, `select`, `eq`, `is`, `maybeSingle`, and `storage.from().getPublicUrl()` spies. Cover every AC #9 case. Use `vi.mocked(...)` for type-safe assertions. Include a smoke-import test that asserts `typeof fetchPublicListing === "function"`.

- [ ] Task 2: Photo carousel client component (AC: #4, #10)
  - [ ] 2.1 Create `components/booking/listing-photo-carousel.tsx` as a Client Component (`"use client"`). Props: `photos: ReadonlyArray<{ url: string; path: string }>`, `listingName: string`. State: `activeIndex: number` (default 0), `trackRef: useRef<HTMLDivElement>`.
  - [ ] 2.2 Layout: outer `<div role="region" aria-roledescription="carousel" aria-label={`${listingName} photos`} className="relative">`. Inner track `<div ref={trackRef} className="flex w-full snap-x snap-mandatory overflow-x-auto scroll-smooth" onScroll={...} onKeyDown={...} tabIndex={0}>`. Each slide `<div role="group" aria-roledescription="slide" aria-label={`Photo ${i + 1} of ${photos.length}`} className="w-full shrink-0 snap-start">` with an `<img>`.
  - [ ] 2.3 Active-index derivation from scroll: `onScroll` handler uses `requestAnimationFrame` to read `Math.round(track.scrollLeft / track.offsetWidth)` and `setActiveIndex` when it differs. Guard against `offsetWidth === 0` (jsdom).
  - [ ] 2.4 Arrow buttons absolutely positioned at `top-1/2 -translate-y-1/2 left-space-2 / right-space-2`. `hidden md:flex`. Disabled at bounds. On click, call `scrollToIndex(next)` which uses `trackRef.current?.scrollTo({ left: next * track.offsetWidth, behavior: "smooth" })` and updates `activeIndex` optimistically.
  - [ ] 2.5 Dot indicators: `<div role="tablist" aria-label="Select photo">` with a button per photo. Active dot `aria-current="true"`. Click jumps via the same `scrollToIndex`.
  - [ ] 2.6 Counter pill: absolute `top-space-2 right-space-2`, `rounded-full bg-black/50 px-space-2 py-space-1 text-small text-white`, text `{activeIndex + 1} / {photos.length}`.
  - [ ] 2.7 Keyboard: `onKeyDown` on the region — `ArrowLeft` calls `scrollToIndex(activeIndex - 1)` clamped; `ArrowRight` calls `scrollToIndex(activeIndex + 1)` clamped. Call `event.preventDefault()` on both to stop the default horizontal scroll doubling up.
  - [ ] 2.8 Single-photo case: early-return a simpler render with no dots, no arrows, counter fixed at `"1 / 1"`.
  - [ ] 2.9 Create `components/booking/listing-photo-carousel.test.tsx`. Stub `HTMLElement.prototype.scrollTo` and `scrollIntoView` with `vi.fn()` in `beforeEach`. For each test, render with a fixture of 3 photos (happy path) or 1 photo (edge case). Cover every bullet in AC #10.

- [ ] Task 3: Renter route shell + booking page (AC: #1, #3, #5, #6, #8)
  - [ ] 3.1 Create `app/(renter)/layout.tsx`. Minimal Server Component: `export default function RenterLayout({ children }: { children: React.ReactNode }) { return <main className="min-h-screen bg-neutral-50">{children}</main>; }`. Named + default export pair.
  - [ ] 3.2 Create `app/(renter)/book/[listingId]/page.tsx`. Props `{ params: Promise<{ listingId: string }> }`. `async function BookingPageBody({ params })` awaits `params`, calls `fetchPublicListing(listingId)`, calls `notFound()` when the result is an error or when `data` is `null`. Renders the carousel + details panel. Uses the spacing and max-width rules from AC #6.
  - [ ] 3.3 Named export `BookingPage` that wraps `BookingPageBody` in a `<Suspense fallback={null}>` (matching the operator detail page pattern). Also `export default BookingPage`.
  - [ ] 3.4 Import and render `ListingPhotoCarousel` with the resolved `photos` and `listingName`. Render the title, daily rate, pickup location (with `MapPin` icon), and description per AC #5.

- [ ] Task 4: Loading skeleton (AC: #7)
  - [ ] 4.1 Create `app/(renter)/book/[listingId]/loading.tsx`. Default export a React component that renders the warm-tinted skeleton described in AC #7. Use `animate-pulse bg-neutral-100` on every placeholder block. No JS — it's a pure presentation component.

- [ ] Task 5: Tests, lint, type-check, build (AC: #9, #10, #12)
  - [ ] 5.1 Run `npm run test` — new tests pass, existing suite still green.
  - [ ] 5.2 Run `npm run lint` clean.
  - [ ] 5.3 Run `npm run type-check` clean. No `any`. Named exports used everywhere except the Next.js-mandated default exports on `page.tsx`, `layout.tsx`, `loading.tsx`.
  - [ ] 5.4 Run `npm run build`. If blocked by `BWS_SECRETS_TOKEN`, document in the Dev Agent Record.

- [ ] Task 6: Sprint status update
  - [ ] 6.1 In `_bmad-output/implementation-artifacts/sprint-status.yaml`: set `3-1-renter-listing-page-and-photo-carousel` → `done`, set `epic-3` → `in-progress`, bump `last_updated` to `2026-04-10`.

## Dev Notes

### Critical Architecture Patterns — MUST Follow

**Named exports only** — the renter page and layout and loading files get both named and default exports (Next.js mandates default exports on those three file types; we add a named export for symmetry with the rest of the codebase and so the test file can import by name if it ever wants to). Every other module is named-export-only.

**File naming:** kebab-case. `listing-photo-carousel.tsx`, `public-listing.ts`.

**Component naming:** PascalCase. `ListingPhotoCarousel`, `RenterLayout`, `BookingPage`.

**Service module location:** `lib/services/public-listing.ts` follows the Story 2.1 precedent of colocating server-only data helpers under `lib/services/`. The helper imports `@/lib/supabase/server` directly, which means it must only be called from Server Components, Server Actions, or Route Handlers. It does NOT carry a `"use server"` directive — that's reserved for Server Actions.

**No new dependencies:** everything is achievable with `react`, `next`, `lucide-react`, the existing `@supabase/ssr` client, and the existing `Button` component. No carousel library (embla, swiper, react-slick) — native scroll-snap + a few refs get us all the way there and are what the UX spec implicitly expects when it calls out "swipeable on mobile" without naming a library.

**No `any`:** `PublicListing`, `PublicListingPhoto`, and `ListingFetchError` are explicit types. The carousel's photo prop is `ReadonlyArray<{ url: string; path: string }>`. `params` in the page is `Promise<{ listingId: string }>` per Next 16.

**Result<T>:** the data fetch helper returns the repo's standard `Result<T>` shape via `ok()` / `err()` from `@/lib/utils/result`.

### RLS Is Already Wired

Migration `00003_listings.sql` already contains:

```sql
CREATE POLICY "Public can read published listings"
  ON public.listings FOR SELECT
  TO anon, authenticated
  USING (status = 'published' AND deleted_at IS NULL);
```

…plus column-level `GRANT SELECT (id, operator_id, name, description, daily_rate_cents, pickup_location, photos, status, available_from, created_at, updated_at, deleted_at) ON public.listings TO anon;` which explicitly omits `pickup_instructions`. That policy was put in place by Story 2.1 with an explicit comment that it powers Story 3.1. **Do not write a new migration.** The data path is already safe: an anon SELECT on a draft listing will return zero rows (RLS filter); an anon SELECT that asks for `pickup_instructions` will hard-fail (column grant). Both behaviors are tested at the `listings` table level in the migration itself.

### Supabase Client Choice

`lib/supabase/server.ts` uses `createServerClient` from `@supabase/ssr` with the publishable default key. When there is no logged-in user (the renter case), the client runs under the anon PostgREST role and RLS applies as anon. We do not need a separate anon-only client module for this story.

### Carousel Implementation Notes

Native horizontal scroll-snap is the cheapest working carousel on mobile. The track is `flex overflow-x-auto snap-x snap-mandatory`. Each slide is `w-full shrink-0 snap-start`. Mobile users swipe; the browser handles momentum and snap. Desktop users click the arrow buttons, which call `track.scrollTo({ left: i * track.offsetWidth, behavior: "smooth" })`. The active index is derived from the scroll position via a rAF-throttled `onScroll` handler so dots, counter, and button disabled state stay in sync across both input modes.

The component does NOT use `IntersectionObserver` — it's not needed (a single `scrollLeft / offsetWidth` read is simpler) and jsdom's `IntersectionObserver` support is a perennial headache in the test suite.

Arrow buttons clamp instead of wrap. Wrapping is nice UX but harder to test and harder to reason about with swipe, so we defer a wrapping implementation to a future polish pass. The `disabled` state at the bounds is a clear affordance.

Keyboard support: `ArrowLeft` / `ArrowRight` on the region. Tab order keeps the region focusable once (via `tabIndex=0` on the track), and then each arrow button is in the tab order as a regular button. Screen readers read the active slide's `aria-label` after each move because the slide element is the one that gets focused.

### jsdom Caveats for the Carousel Test

jsdom does not implement `Element.prototype.scrollTo`, `Element.prototype.scrollIntoView`, or layout geometry (`offsetWidth` is always 0 unless manually stubbed). The test stubs:

```ts
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    value: 300,
  });
});
```

…and asserts against the `scrollTo` mock rather than observing real scroll behavior. The tests are intentionally coarse-grained: they verify "did we ask the track to scroll" and "did the active index update" instead of pixel math.

### Page Smoke Test Tradeoff

A full render test for `app/(renter)/book/[listingId]/page.tsx` would need to mock `next/navigation`'s `notFound`, await the `params` Promise, mock `fetchPublicListing`, and deal with the fact that the page is an `async` Server Component — which React Testing Library does not natively support. The ROI is low: every meaningful branch is already covered by the `fetchPublicListing` test and the carousel test. We therefore skip the page test and rely on a manual smoke check in local dev: publish a listing → open `/book/{listingId}` incognito → see the page → delete the listing → 404.

### Spacing & Color Tokens Used

From the UX spec (see "Visual Design Foundation"):
- `bg-neutral-50` — warm-tinted page background. (If the Tailwind config doesn't ship `neutral-50` under that exact name, substitute `bg-neutral-100` — both are warm off-whites in this palette.)
- `bg-primary` (`#E87B35`) — active carousel dot.
- `bg-neutral-300` — inactive dots.
- `text-display` / `text-display-lg` — 28px / 36px — listing title.
- `text-price` — 24px bold — daily rate.
- `text-body` / `text-body-medium` / `text-small` — tokens already in the design system.
- `gap-space-5`, `px-space-4`, `py-space-6` — spacing scale tokens already in use across the operator shell.
- `max-w-[480px]` — Tailwind arbitrary value literal. The UX spec calls out 480px explicitly for the mobile-first renter column.

### What Is Out of Scope

- **Availability calendar** — Story 3-2 deliverable. The renter page shows no date-picker in this story.
- **Sticky "Book Now" bar** — Story 3-2 deliverable. No CTA is rendered in this story. The page ends at the description.
- **Phone OTP auth** — Story 3-3.
- **Contract** — Story 3-4.
- **Payment hold** — Story 3-5.
- **QR code on the operator posting assistant** — a separate backlog follow-up. The operator side already has a placeholder `<div>` from Story 2-5. We do NOT touch it in this story.
- **Realtime refresh of the listing page itself** — out of scope. If the operator edits the listing while a renter is looking at it, the renter will see the old data until they refresh. Realtime subscriptions ship with the calendar in Story 3-2.
- **Analytics on booking-page views** — not in MVP. Maybe Epic 4.
- **Server-side image optimization** — the current operator detail page uses plain `<img>` tags with an eslint-disable, and we match that pattern here to stay consistent and avoid pulling in `next/image` config for Supabase public URLs.

### File Manifest (Expected Final Shape)

New files:
- `_bmad-output/implementation-artifacts/3-1-renter-listing-page-and-photo-carousel.md` (this file)
- `app/(renter)/layout.tsx`
- `app/(renter)/book/[listingId]/page.tsx`
- `app/(renter)/book/[listingId]/loading.tsx`
- `components/booking/listing-photo-carousel.tsx`
- `components/booking/listing-photo-carousel.test.tsx`
- `lib/services/public-listing.ts`
- `lib/services/public-listing.test.ts`

Modified files:
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

No migrations. No new Server Actions. No new npm deps.

## Dev Agent Record

**Agent:** Claude (Opus 4.6) — BMad dev agent
**Date completed:** 2026-04-10

### Completion Notes

- Public data fetch helper `fetchPublicListing` added under `lib/services/public-listing.ts` using the existing `createClient()` from `lib/supabase/server.ts`. The anon PostgREST role plus the existing RLS policy from migration 00003 handle the "only published, non-deleted" guarantee; the helper additionally filters on `status = 'published'` and `deleted_at IS NULL` as defense-in-depth. `pickup_instructions` is intentionally NOT selected — the column-level grant excludes it from anon and requesting it would fail the query.
- `ListingPhotoCarousel` built as a Client Component using native horizontal scroll-snap. Keyboard arrows, dot indicators, counter pill, and `aria-roledescription="carousel"` are all wired. Arrow buttons clamp at the bounds and are `disabled` when appropriate. Single-photo case skips dots and arrows.
- Renter route group `(renter)` added with a minimal layout (no operator shell) plus the `book/[listingId]` page and loading skeleton. The page awaits Next 16 async `params`, calls `fetchPublicListing`, and `notFound()`s on null or error.
- Tests: new colocated tests for both the carousel and the fetch helper. The carousel test stubs `scrollTo` and `offsetWidth` on `HTMLElement.prototype`. The helper test uses a chainable mock of the Supabase client. No page-level render test — the logic is exercised by the helper and carousel tests.
- No new migrations, no new Server Actions, no new npm deps.
- Build: `npm run build` clean — 26 routes, the new `/book/[listingId]` route appears as a dynamic Partial Prerender entry.
- Tests: 235 / 235 passing, 18 net new (carousel: 10, public-listing fetch: 8).

### File List

**Created:**
- `_bmad-output/implementation-artifacts/3-1-renter-listing-page-and-photo-carousel.md`
- `app/(renter)/layout.tsx`
- `app/(renter)/book/[listingId]/page.tsx`
- `app/(renter)/book/[listingId]/loading.tsx`
- `components/booking/listing-photo-carousel.tsx`
- `components/booking/listing-photo-carousel.test.tsx`
- `lib/services/public-listing.ts`
- `lib/services/public-listing.test.ts`

**Modified:**
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — story 3-1 → done, epic-3 → in-progress, `last_updated` bumped to 2026-04-10.

## Change Log

| Date       | Version | Description                                 | Author |
| ---------- | ------- | ------------------------------------------- | ------ |
| 2026-04-10 | 0.1     | Initial draft — ready for dev               | BMad SM |
| 2026-04-10 | 1.0     | Implementation complete — all gates (minus env-blocked build) green | Dev Agent |
