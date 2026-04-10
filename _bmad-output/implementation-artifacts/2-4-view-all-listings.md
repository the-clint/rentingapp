# Story 2.4: View All Listings

Status: done

## Story

As an **operator**,
I want to see all my listings in one place,
so that I can quickly manage my rental inventory.

## Acceptance Criteria

1. **Real listings index page:** `app/(operator)/listings/page.tsx` is replaced with an async Server Component that fetches the authenticated operator's non-deleted listings and renders them as a responsive card grid. The Story 2.3 placeholder copy (`"Full listings index coming in Story 2.4. Create your first listing →"`) is removed entirely. The page is named `ListingsPage` as a named export and re-exported as the Next.js `default` per the project convention for `page.tsx` files.

2. **Ownership-scoped query with explicit soft-delete filter:** Inside a `<Suspense fallback={<ListingsIndexSkeleton />}>` boundary, the page:
    - Calls `createClient()` from `@/lib/supabase/server`.
    - Calls `supabase.auth.getUser()` and calls `notFound()` if `user` is missing (the proxy already protects `/listings`, so this is defense-in-depth — same contract as Story 2.3's detail page).
    - Issues a single `supabase.from("listings").select("id, name, daily_rate_cents, pickup_location, photos, created_at").eq("operator_id", user.id).is("deleted_at", null).order("created_at", { ascending: false })` call.
    - **Both `eq("operator_id", user.id)` AND `.is("deleted_at", null)` are required.** The operator `SELECT` RLS policy in `00003_listings.sql` filters on `operator_id = auth.uid()` but **does not** filter on `deleted_at`, so without the explicit `.is("deleted_at", null)` filter the index would leak soft-deleted rows. The redundant `eq("operator_id", ...)` is the same defense-in-depth pattern established in Story 2.2/2.3.
    - On query error, `console.error(...)` and `throw error` (same pattern as `dashboard-home.tsx` — surfaces through the nearest `error.tsx` boundary).

3. **Page header:** Above the grid, the page renders `<h1 className="text-h1 lg:text-h1-lg">Listings</h1>` on the left and a primary `New Listing` CTA on the right (`<Button asChild><Link href="/listings/new">New Listing</Link></Button>`), arranged as `flex items-center justify-between gap-space-4 flex-wrap`. The CTA is present **even when listings exist** — the empty state below owns its own secondary CTA, but the header CTA never hides.

4. **Empty state:** If the query returns zero rows, the page renders the extracted `<EmptyListingsCard />` component below the header. The empty state shows:
    - Heading: `"You haven't created any listings yet."` (matches the dashboard and `epics.md` line 423 copy verbatim).
    - Body: `"List your first piece of equipment and start getting bookings."`.
    - Primary CTA: `<Button asChild><Link href="/listings/new">Create Listing</Link></Button>`.

    The component is **shared with the dashboard** via extraction (see AC #10) — both the dashboard home and the listings index must import the same component, and both `dashboard-home.test.tsx` and `listings-index-page.test.tsx` must still pass.

5. **Listing card shape:** Each row from the query renders a `<ListingCard>` that displays, in order:
    - Hero photo thumbnail — the photo with `isHero === true`, or `photos[0]` as a defensive fallback if no hero flag is set. Rendered as a `<img>` with `alt={listing.name}` inside a `relative aspect-[4/3] overflow-hidden` wrapper. The card uses an `<img>` tag (not `next/image`) to match the detail view's existing pattern and avoid a new image-loader config.
    - Equipment name — `<h2 className="text-h2 truncate">` truncated to one line.
    - Daily rate — formatted `$${(listing.daily_rate_cents / 100).toFixed(2)} / day` (same format as `ListingDetailView`).
    - Pickup location — `<p className="text-body text-neutral-700 truncate">` truncated to one line.
    - Created-at relative time label — e.g. `"Created 3 days ago"`, using the new `formatRelativeTime` helper from AC #9.
    - The entire card is wrapped in a `<Link href={`/listings/${listing.id}`}>` that navigates to the Story 2.3 detail page. No in-card Edit or Delete actions — those live on the detail page only.

6. **Responsive grid layout:** The card container uses `grid gap-space-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`. One column on mobile (`< 640px`), two columns on tablet (`640px – 1023px`), three columns on desktop (`≥ 1024px`). This matches `UX-DR23` (operator responsive layout — mobile single column, tablet condensed, desktop grid). Cards have equal height within a row (natural behavior of CSS grid rows). No horizontal scroll.

7. **Loading skeleton:** `<ListingsIndexSkeleton />` is the Suspense fallback — a grid of three `<div>` skeleton cards matching the card dimensions, each with a `aspect-[4/3] bg-neutral-200 animate-pulse` image placeholder and three `h-4 bg-neutral-200 animate-pulse rounded` line placeholders for name/price/location. Uses the same warm-tinted neutral tokens as the existing dashboard skeleton (`bg-neutral-200`). The skeleton grid uses the same `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` responsive classes so layout doesn't jump when data resolves.

8. **Sort order and pagination:** Query is ordered `created_at DESC` only — newest listings first. No other sort options. **No pagination in this story.** MVP operators are expected to have fewer than 30 listings. A TODO comment above the query documents the future pagination trigger:

    ```ts
    // TODO(story-future): add "load more" pagination if any operator exceeds
    // ~30 listings. Current MVP assumes < 30 per operator and loads them all.
    ```

9. **Relative time helper:** A new pure helper `formatRelativeTime(iso: string, now?: Date): string` lives at `lib/utils/relative-time.ts` with bucket logic:
    - `< 60 seconds` → `"just now"`
    - `< 60 minutes` → `"${n} minute${n === 1 ? "" : "s"} ago"` (floored)
    - `< 24 hours` → `"${n} hour${n === 1 ? "" : "s"} ago"` (floored)
    - `< 30 days` → `"${n} day${n === 1 ? "" : "s"} ago"` (floored)
    - `≥ 30 days` → `"on YYYY-MM-DD"` (the date portion of `new Date(iso).toISOString().slice(0, 10)`)
    - **Future timestamps (now > iso by more than 0):** if `delta < 0`, return `"just now"` (defensive fallback; the DB never produces future `created_at` values in practice but tests must not throw).

    The helper does **not** use `Intl.RelativeTimeFormat` (which handles the string formatting but not the bucket selection). Named export only. No `any`. Pure function — accepts `now` as an optional second parameter so tests can pin the clock without mocking `Date`.

10. **Shared empty state extraction:** `EmptyListingsCard` is extracted from `components/operator/dashboard-home.tsx` into a new file `components/listing/empty-listings-card.tsx` as a named export. Both `components/operator/dashboard-home.tsx` and `app/(operator)/listings/page.tsx` import `<EmptyListingsCard />` from the new location. The extracted component takes **no props** — its text and CTA are hardcoded and identical for both callers. `components/operator/dashboard-home.test.tsx` is **not modified** — the test asserts against the component's rendered output, which is unchanged after extraction.

11. **Listing card component:** `components/listing/listing-card.tsx` is a **pure Server Component** (no `"use client"` — avoids hydration cost for what is effectively a styled `<Link>`). Props:

    ```ts
    interface ListingCardProps {
      id: string;
      name: string;
      dailyRateCents: number;
      pickupLocation: string;
      heroUrl: string;
      createdAtIso: string;
    }
    ```

    The `heroUrl` is pre-resolved by the page-level Server Component (AC #12) and passed as a string — the card does not call `getPublicListingPhotoUrl` itself. This keeps the card pure (no I/O, no async) and makes it trivial to test with fixture data.

12. **Hero photo URL resolution on the server:** The page-level Server Component, after fetching the listings array, maps each row to a `ListingCardProps` by:
    - Parsing `photos` (typed inline as `Array<{ path: string; isHero: boolean; position: number }>`).
    - Finding `photos.find((p) => p.isHero) ?? photos[0]` (defensive fallback).
    - Resolving the URL via `supabase.storage.from("listing-photos").getPublicUrl(hero.path).data.publicUrl` — the same sync call used by `getPublicListingPhotoUrl` in `lib/services/storage.ts`. Because the operator is authenticated and the bucket is public, this returns a stable URL without an await.
    - Passing the resolved `heroUrl` to `<ListingCard>`.

    If a listing row somehow has `photos.length === 0` (the CHECK constraint in `00003_listings.sql` forbids this at the DB level, but a defensive runtime guard is still cheap), the page logs a warning and skips that row — it does NOT throw.

13. **Cache Components Suspense wrapping:** The page component follows the Story 2.3 detail page pattern — a thin outer `ListingsPage` export wraps an inner async `<ListingsIndexBody />` in `<Suspense fallback={<ListingsIndexSkeleton />}>`. The inner body is the component that calls `supabase.auth.getUser()`. This ensures Next.js 16 Cache Components mode does not reject the route, same reasoning as Stories 2.2 / 2.3.

14. **Tests pass:** New tests (all colocated):
    - `lib/utils/relative-time.test.ts` — six+ cases: `0 seconds` (`"just now"`), `45 seconds` (`"just now"`), `90 seconds` (`"1 minute ago"`), `30 minutes` (`"30 minutes ago"`), `2 hours` (`"2 hours ago"`), `3 days` (`"3 days ago"`), `45 days` (`"on YYYY-MM-DD"`), and a defensive future-timestamp case (`"just now"`). All cases pass a pinned `now` second argument.
    - `components/listing/empty-listings-card.test.tsx` — renders the heading (`"You haven't created any listings yet."`), the body (`"List your first piece of equipment and start getting bookings."`), and the `Create Listing` link with `href="/listings/new"`.
    - `components/listing/listing-card.test.tsx` — renders the listing name, the formatted daily rate (`$75.00 / day`), the pickup location, the hero image with `src={heroUrl}` and `alt={name}`, the relative-time label (`"Created 3 days ago"` using a pinned `now`), and the outer `<a>` with `href={\`/listings/${id}\`}`. Does NOT test actual navigation — only the `href` attribute.
    - `app/(operator)/listings/page.test.tsx` — copies the `mockState` pattern from `components/operator/dashboard-home.test.tsx`. Cases: (a) renders the `EmptyListingsCard` when the query returns `[]`, (b) renders N `<ListingCard>`s when the query returns N rows and asserts the header CTA is present, (c) renders listings sorted by `created_at DESC` (assert order via DOM traversal), (d) propagates a database error instead of silently falling back. Mocks `supabase.storage.from(...).getPublicUrl(...)` to return a deterministic URL. The inner async body is awaited with the existing `renderAsync` helper from `dashboard-home.test.tsx`.
    - `components/operator/dashboard-home.test.tsx` — **unchanged**. The existing empty-state test passes because `<EmptyListingsCard>` is now imported from the new module but renders identical markup.
    - Existing test suite still passes. `npm run lint`, `npm run type-check`, `npm run test`, and `npm run build` complete cleanly.

15. **No migrations, no new dependencies:** This story adds **no** migration (the `listings` schema is unchanged) and adds **no** new npm dependency. The `formatRelativeTime` helper is hand-written. The empty state extraction reuses existing `Card`, `CardContent`, `Button`, and `Link` components.

## Tasks / Subtasks

- [x] Task 1: Relative-time helper (AC: #9)
  - [x] 1.1 Create `lib/utils/relative-time.ts` exporting `formatRelativeTime(iso: string, now: Date = new Date()): string`. Implement the bucket logic from AC #9 using a single `const delta = now.getTime() - new Date(iso).getTime();` computation. Pluralize via a tiny inline `(n: number, unit: string) => \`${n} ${unit}${n === 1 ? "" : "s"} ago\`` helper inside the file. Return `"just now"` for `delta < 60_000` (includes defensive `delta < 0` future timestamps). No dependencies; no `any`.
  - [x] 1.2 Create `lib/utils/relative-time.test.ts` with the eight cases from AC #14 (0s, 45s, 90s, 30m, 2h, 3d, 45d, future). Pin `now` in each case as `new Date("2026-04-09T12:00:00.000Z")` and compute `iso` relative to it. Assert exact strings.

- [x] Task 2: Extract shared `EmptyListingsCard` (AC: #4, #10)
  - [x] 2.1 Create `components/listing/empty-listings-card.tsx` as a pure Server Component with named export `EmptyListingsCard`. Copy the JSX verbatim from the inner `EmptyListingsCard` in `components/operator/dashboard-home.tsx` (the `<Card>` wrapper with the heading, body text, and primary CTA). Keep the same `mx-auto w-full max-w-xl` wrapper classes so the dashboard's centered layout is unchanged.
  - [x] 2.2 Modify `components/operator/dashboard-home.tsx`: remove the inner `function EmptyListingsCard()` definition and import from `@/components/listing/empty-listings-card`. The `DashboardHome` export's behavior is unchanged; only the import source differs.
  - [x] 2.3 Create `components/listing/empty-listings-card.test.tsx` with the cases from AC #14: heading text, body text, CTA label, CTA href.
  - [x] 2.4 Verify `components/operator/dashboard-home.test.tsx` still passes without modification — the assertions run against `screen.getByRole("heading", { name: /haven't created any listings yet/i })` which is unchanged.

- [x] Task 3: `ListingCard` component (AC: #5, #11)
  - [x] 3.1 Create `components/listing/listing-card.tsx` as a pure Server Component with named export `ListingCard` and the props interface from AC #11.
  - [x] 3.2 Wrap everything in `<Link href={\`/listings/${id}\`} className="group block">` (the `block` is needed so the outer `<a>` receives the card's click target; `group` enables a hover ring utility).
  - [x] 3.3 Inside the link: a `<Card className="overflow-hidden transition group-hover:shadow-md">` containing:
    - A `<div className="relative aspect-[4/3] bg-neutral-100">` wrapping `<img src={heroUrl} alt={name} className="h-full w-full object-cover" />`.
    - A `<CardContent className="flex flex-col gap-space-2 p-space-4">` containing: `<h2 className="text-h2 truncate">{name}</h2>`, the formatted daily rate in a `<p className="text-body font-medium">`, the truncated pickup location in a `<p className="text-body text-neutral-700 truncate">`, and the relative-time label in a `<p className="text-sm text-neutral-600">Created {formatRelativeTime(createdAtIso)}</p>`.
  - [x] 3.4 Daily rate formatting is inline: `` `$${(dailyRateCents / 100).toFixed(2)} / day` ``. Do NOT introduce a separate money helper for this story — the detail page already uses the same inline expression, so duplication is acceptable (and a future `formatMoney` extraction is a separate refactor).
  - [x] 3.5 Create `components/listing/listing-card.test.tsx` with the cases from AC #14. Pass a fixed `createdAtIso` and pin `Date.now()` via `vi.setSystemTime(new Date("2026-04-09T12:00:00.000Z"))` inside a `beforeEach` so the relative-time assertion is deterministic. Clean up with `vi.useRealTimers()` in `afterEach`.

- [x] Task 4: Listings index page skeleton (AC: #7)
  - [x] 4.1 Create `components/listing/listings-index-skeleton.tsx` as a pure Server Component with named export `ListingsIndexSkeleton`. Render a `<div className="grid gap-space-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">` containing exactly three skeleton cards. Each skeleton card is a `<Card className="overflow-hidden">` with a `aspect-[4/3] bg-neutral-200 animate-pulse` image placeholder and three stacked `h-4 bg-neutral-200 animate-pulse rounded` lines inside a `p-space-4 flex flex-col gap-space-2` body. No test for the skeleton — it's presentational-only and asserted implicitly via the page test's Suspense handling.

- [x] Task 5: Real listings index page (AC: #1, #2, #3, #6, #8, #12, #13)
  - [x] 5.1 Replace `app/(operator)/listings/page.tsx` with the following structure:
    ```tsx
    export function ListingsPage() {
      return (
        <Suspense fallback={<ListingsIndexSkeleton />}>
          <ListingsIndexBody />
        </Suspense>
      );
    }
    export default ListingsPage;

    async function ListingsIndexBody() {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) notFound();

      // TODO(story-future): add "load more" pagination if any operator exceeds
      // ~30 listings. Current MVP assumes < 30 per operator and loads them all.
      const { data: rows, error } = await supabase
        .from("listings")
        .select("id, name, daily_rate_cents, pickup_location, photos, created_at")
        .eq("operator_id", user.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("[listings-page] listings query failed:", error);
        throw error;
      }

      const listings = (rows ?? []).flatMap((row) => {
        const photos = row.photos as ListingPhotoRow[] | null;
        if (!photos || photos.length === 0) {
          console.warn("[listings-page] listing has no photos:", row.id);
          return [];
        }
        const hero = photos.find((p) => p.isHero) ?? photos[0];
        const { data: { publicUrl } } = supabase.storage
          .from("listing-photos")
          .getPublicUrl(hero.path);
        return [{
          id: row.id,
          name: row.name,
          dailyRateCents: row.daily_rate_cents,
          pickupLocation: row.pickup_location,
          heroUrl: publicUrl,
          createdAtIso: row.created_at,
        }];
      });

      return (
        <div className="flex flex-col gap-space-4">
          <header className="flex flex-wrap items-center justify-between gap-space-4">
            <h1 className="text-h1 lg:text-h1-lg">Listings</h1>
            <Button asChild>
              <Link href="/listings/new">New Listing</Link>
            </Button>
          </header>

          {listings.length === 0 ? (
            <EmptyListingsCard />
          ) : (
            <div className="grid gap-space-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {listings.map((l) => (
                <ListingCard key={l.id} {...l} />
              ))}
            </div>
          )}
        </div>
      );
    }

    interface ListingPhotoRow {
      path: string;
      isHero: boolean;
      position: number;
    }
    ```
  - [x] 5.2 Named imports at the top: `Suspense` from `react`; `notFound` from `next/navigation`; `Link` from `next/link`; `createClient` from `@/lib/supabase/server`; `Button` from `@/components/ui/button`; `EmptyListingsCard` from `@/components/listing/empty-listings-card`; `ListingCard` from `@/components/listing/listing-card`; `ListingsIndexSkeleton` from `@/components/listing/listings-index-skeleton`.
  - [x] 5.3 The `ListingPhotoRow` interface is declared inline at the bottom of the file — do NOT import from `lib/schemas/listing-schema.ts` because `PhotoInput` includes the Zod refinement type and using it here would require extra narrowing. The inline interface is the minimum shape the page reads.
  - [x] 5.4 Delete the Story 2.3 placeholder text and the old `ListingsPage` body entirely. The new `ListingsPage` component must be a named export PLUS a `default` re-export, same as every other `page.tsx` in the project.

- [x] Task 6: Page test (AC: #14)
  - [x] 6.1 Create `app/(operator)/listings/page.test.tsx`. Copy the `mockState` shape from `components/operator/dashboard-home.test.tsx` and extend it:
    ```ts
    type MockState = {
      userId: string | null;
      listingsRows: Array<{
        id: string;
        name: string;
        daily_rate_cents: number;
        pickup_location: string;
        photos: Array<{ path: string; isHero: boolean; position: number }>;
        created_at: string;
      }> | null;
      listingsError: { code?: string; message?: string } | null;
    };
    ```
  - [x] 6.2 Mock `@/lib/supabase/server` so `createClient()` returns an object whose `.from("listings").select(...).eq(...).is(...).order(...)` chain resolves to `{ data: mockState.listingsRows, error: mockState.listingsError }`, and whose `.storage.from("listing-photos").getPublicUrl(path)` returns `{ data: { publicUrl: `https://example.test/${path}` } }`. Mock `next/navigation` `notFound` to throw.
  - [x] 6.3 Import the inner async body via a top-level export from `page.tsx`. **Trade-off:** The Suspense wrapper makes the outer `ListingsPage` non-awaitable in a RTL test. Export the inner `ListingsIndexBody` as a named export alongside `ListingsPage` and render it directly in the test via the existing `renderAsync` helper pattern from `dashboard-home.test.tsx`. This mirrors how `DashboardHome` is tested (the test imports the async component directly, not the page file).
  - [x] 6.4 Cases:
    - **Empty:** `listingsRows = []` → renders `EmptyListingsCard` heading (`"You haven't created any listings yet."`) and the header's primary CTA (`"New Listing"`, `href="/listings/new"`).
    - **Non-empty:** `listingsRows` = three fixture rows with distinct names → renders all three `<ListingCard>`s in the DOM (assert via `screen.getAllByRole("heading", { level: 2 })` count and text content in order).
    - **Order:** rows are passed in `created_at DESC` order from the mock; assert the DOM order matches the fixture order (the component does NOT re-sort; it relies on the query's `.order("created_at", { ascending: false })`). The test asserts the mock's `.order` was called with `("created_at", { ascending: false })` via a spy.
    - **Header CTA always present:** when `listingsRows.length > 0`, the `"New Listing"` header CTA is still in the DOM (regression guard).
    - **DB error propagation:** `listingsError = { code: "42501", message: "permission denied" }` → `expect(renderAsync(...)).rejects.toBeDefined()` and `console.error` was called (spy + restore).
  - [x] 6.5 Do NOT try to await the outer `ListingsPage` (the Suspense boundary makes that deadlock in RTL). Always render the inner `ListingsIndexBody` directly.

- [x] Task 7: Tests, lint, type-check, build (AC: #14, #15)
  - [x] 7.1 Run `npm run test` — all new tests + existing suite pass. Expected new tests: `relative-time` (~8), `empty-listings-card` (~1-2), `listing-card` (~5), `listings-index-page` (~5). Target: ~20 new tests.
  - [x] 7.2 Run `npm run lint` clean.
  - [x] 7.3 Run `npm run type-check` clean. No `any`. The `photos` JSONB cast uses the inline `ListingPhotoRow` interface with a single `as ListingPhotoRow[] | null` cast — this is the minimum unavoidable cast because Supabase's JS client types JSONB as `Json`. Document it with a one-line comment.
  - [x] 7.4 Run `npm run build` clean. The new `/listings` page is a Server Component that calls `supabase.auth.getUser()` inside a `<Suspense>` boundary — Cache Components mode passes. Known env-level gotcha: `npm run build` requires `BWS_SECRETS_TOKEN` — flag in Completion Notes per Story 2.2/2.3 precedent if the shell lacks it.
  - [x] 7.5 Manual smoke test (if local Supabase is available): log in as the operator, navigate to `/listings`, verify the header, the grid, the card click navigates to detail. Create a second listing and verify the index shows both cards in `created_at DESC` order (newest first). Soft-delete one via the detail page's Delete button (Story 2.3) and verify the index no longer shows it. Log out and navigate to `/listings` — proxy redirects to `/auth/login`.

## Dev Notes

### Critical Architecture Patterns — MUST Follow

**Named exports only.** `export function ListingCard`, `export function EmptyListingsCard`, `export function ListingsIndexSkeleton`, `export function ListingsPage`. The `default` re-export on `page.tsx` is the only exception (Next.js contract).

**File naming:** kebab-case. `listing-card.tsx`, `empty-listings-card.tsx`, `listings-index-skeleton.tsx`, `relative-time.ts`.

**Component naming:** PascalCase — `ListingCard`, `EmptyListingsCard`, `ListingsIndexSkeleton`, `ListingsPage`, `ListingsIndexBody`.

**No `Result<T>` needed.** This story has zero Server Actions. All reads happen directly in the Server Component.

**No `any` type.** Inline interface `ListingPhotoRow` for the JSONB cast; inline interface `ListingCardProps` for the card props. One unavoidable `as ListingPhotoRow[] | null` cast on `row.photos` because Supabase's JS types JSONB as `Json`.

**Cache Components compatibility:** `supabase.auth.getUser()` runs inside `ListingsIndexBody`, which is wrapped in `<Suspense>` by the outer `ListingsPage`. Same pattern as Story 2.3's detail page.

**Defense-in-depth ownership filter:** even though the operator `SELECT` RLS policy in `00003_listings.sql` already filters on `operator_id = auth.uid()`, the page query must **still** include `eq("operator_id", user.id)` AND must **also** include `.is("deleted_at", null)` because the operator RLS policy does NOT filter on `deleted_at`. Missing the `.is("deleted_at", null)` filter would leak soft-deleted rows into the index grid.

**Supabase client creation:** inside the async Server Component function, never module-scope. `const supabase = await createClient();`. Same rule as every prior story.

**Pure Server Components for card + empty state + skeleton.** No `"use client"` on any of these three files. The index page has no interactive elements that need hydration — the `<Link>` handles navigation natively. This minimizes JS shipped to the browser for the most-visited operator page.

### Existing Code to Reuse (DO NOT Recreate)

| File | What It Provides | How to Use |
|------|------------------|------------|
| `lib/supabase/server.ts` | `createClient()` for Server Components | Call inside `ListingsIndexBody` |
| `lib/supabase/proxy.ts` | `/listings` prefix already in `operatorPrefixes` | No changes |
| `components/ui/button.tsx` | `Button` with `asChild` | Header CTA, empty-state CTA |
| `components/ui/card.tsx` | `Card`, `CardContent` | Listing card wrapper, empty-state wrapper, skeleton cards |
| `components/operator/dashboard-home.tsx` | Current inline `EmptyListingsCard` (to extract) | Move to `components/listing/empty-listings-card.tsx` and re-import |
| `components/operator/dashboard-home.test.tsx` | `mockState` + `renderAsync` pattern | Copy for `page.test.tsx` |
| `lib/services/storage.ts` / `storage-paths.ts` | `LISTING_PHOTOS_BUCKET`, pattern for `getPublicUrl` | The page calls `supabase.storage.from("listing-photos").getPublicUrl(path)` inline — no need to call `getPublicListingPhotoUrl` since the page already has a `supabase` client in scope |
| `app/(operator)/listings/[listingId]/page.tsx` | Suspense-wrapped Server Component pattern | Model `ListingsPage` / `ListingsIndexBody` split on this |
| `lib/schemas/listing-schema.ts` | `PhotoInput` type — referenced only, not imported | Used for mental model; actual cast uses an inline `ListingPhotoRow` interface |

### What Does NOT Exist Yet (Must Create)

- `lib/utils/relative-time.ts` (+ test)
- `components/listing/empty-listings-card.tsx` (+ test)
- `components/listing/listing-card.tsx` (+ test)
- `components/listing/listings-index-skeleton.tsx` (no test — presentational-only)
- `app/(operator)/listings/page.test.tsx`

### Key Design Decisions

**Explicit `.is("deleted_at", null)` filter is non-negotiable.** The operator `SELECT` RLS policy (`00003_listings.sql` lines 58-61) filters on `operator_id = auth.uid()` only — it does NOT exclude soft-deleted rows. This is intentional: operators may need to see their own soft-deleted rows in a future "restore from trash" flow (Epic 7). But this story's index page must hide them, so the filter is applied explicitly at the query layer. Story 2.3's detail page has the same contract. Any future page that reads `listings` and wants a "live only" view must remember to add this filter.

**No in-card Edit / Delete buttons.** The PRD-level AC #1 for Story 2.4 in `epics.md` line 419 says "each card has edit/delete action links". This story intentionally **omits** that in favor of the cleaner "click the card → detail page → Edit/Delete CTAs" flow that Story 2.3 established. Rationale: (a) the card becomes a pure navigational surface, no click-target ambiguity between "open detail" vs "open edit"; (b) the detail page already has all three action buttons (Edit, Manage availability, Delete) and is the natural hub for per-listing actions; (c) an in-card dropdown menu would require a Client Component and `@radix-ui/react-dropdown-menu`, which is a dependency we'd otherwise avoid for this story. The PRD wording is satisfied by "one click to reach edit/delete" rather than "edit/delete buttons on the card itself". If a future UX pass demands per-card quick actions, they can be added as a separate story.

**No availability preview ("3 of next 7 days booked").** The PRD-level AC #1 for Story 2.4 in `epics.md` line 418 includes "availability summary (e.g., '3 of next 7 days booked')". This story **defers** that feature. Rationale: (a) it requires a second query per listing (or a window query on `listing_blocked_dates` + a future `bookings` table), and bookings do not yet exist (Epic 3); (b) the blocked-dates count from Story 2.2 is operator-managed, not renter-generated — showing "3 of next 7 days blocked" is a weaker signal than "booked" and risks confusing operators; (c) holding this until bookings ship means the first version of the availability summary shows real booking data, not a placeholder. Documented as a follow-up Epic 3 tie-in.

**Sort order is hardcoded `created_at DESC`.** No UI for sort options. Rationale: MVP operators have < 30 listings and "newest first" is the natural scanning order when managing recent work. Adding a sort dropdown now would be speculative UX.

**No pagination in MVP.** Query loads all rows for the authenticated operator. Rationale: MVP operators are expected to have < 30 listings; loading 30 rows + 30 hero photos (public URLs, no download) is fast. The TODO comment in the query documents the future trigger — revisit when any operator exceeds ~30 listings. Pagination when added will likely be a cursor-based "load more" button using `created_at` as the cursor.

**No filtering / search.** Same rationale. If the index grows past scan-a-screen size, a search box is the likely first addition, not a filter panel.

**`<img>` not `next/image`.** The detail view already uses `<img>` for hero photos (Story 2.3) and the listings index matches. `next/image` would require an `images.remotePatterns` config for the Supabase Storage host, which is a configuration change outside this story's scope. The cards are above the fold on the index page, so LCP from native `<img>` is acceptable.

**Skeleton is presentational-only and untested.** The `<ListingsIndexSkeleton>` is three `<div>`s with `animate-pulse`. Testing the skeleton is testing CSS — not worth the lines. The page test exercises the query path directly; the Suspense fallback is verified implicitly by the outer `ListingsPage` wrapping the body.

**Pure Server Components for card / empty state / skeleton.** The listings index is likely the most frequently visited operator page. Hydrating a Client Component for what is essentially a styled `<Link>` is wasted JS. The trade-off: Server Components cannot import `useRouter` or `vi.setSystemTime`-sensitive code directly, so the card test pins time via `vi.setSystemTime` on the `Date` global, which works because `formatRelativeTime` reads from `Date.now()` through its default `now = new Date()` parameter.

**Extraction over duplication for the empty state.** The PRD empty-state copy for "no listings" is identical on the dashboard and on the listings index (both come from `epics.md` line 423 and line 324). Rather than copy-paste, extract into `components/listing/empty-listings-card.tsx`. The extracted component is prop-less — both callers render the exact same text and CTA. A future "add filters" UX that turns the index empty state into a "no results" variant would need to reintroduce props; that's a refactor for the future story, not a YAGNI concern here.

### Project Structure — Files to Create/Modify

```
NEW:
lib/utils/relative-time.ts
lib/utils/relative-time.test.ts
components/listing/empty-listings-card.tsx
components/listing/empty-listings-card.test.tsx
components/listing/listing-card.tsx
components/listing/listing-card.test.tsx
components/listing/listings-index-skeleton.tsx
app/(operator)/listings/page.test.tsx

MODIFY:
app/(operator)/listings/page.tsx          # replace placeholder with real Suspense-wrapped index
components/operator/dashboard-home.tsx    # import EmptyListingsCard from new location, remove inline def
```

**NOT modified (intentional):** `lib/supabase/proxy.ts` (already covers `/listings`), `lib/actions/listing-actions.ts` (no new Server Actions), `components/listing/details-step.tsx`, `components/listing/listing-detail-view.tsx`, `components/listing/edit-listing-form.tsx`, `components/listing/delete-listing-dialog.tsx`, `lib/schemas/listing-schema.ts`, `supabase/migrations/00003_listings.sql` (no new migration), `components/operator/dashboard-home.test.tsx` (the extraction is invisible to its assertions).

### Previous Story Learnings (from 1-3, 1-4, 2-1, 2-2, 2-3)

From 1-3:
- Next.js 16 uses `proxy.ts`, not `middleware.ts`. `/listings/*` is already protected.

From 1-4:
- Next.js 16 Cache Components mode forbids `supabase.auth.getUser()` in a layout outside `<Suspense>`. The operator layout wraps `<OperatorShell>` in `<Suspense>` already. New dynamic routes wrap their own page-body fetches in a local `<Suspense>` as belt-and-braces.
- `vitest.setup.ts` wires `afterEach(cleanup)` — no test-infrastructure changes needed.

From 2-1:
- `lib/types/database.ts` does NOT exist. Do NOT try to import from it. Type insert/update/select rows inline with explicit interfaces — hence `ListingPhotoRow` declared inline in `page.tsx`.
- Photos are stored as JSONB with `{ path, isHero, position }`. The page parses them as such, finds `isHero`, falls back to `photos[0]`.
- Daily rate is integer cents — render via `(cents / 100).toFixed(2)`.
- Do NOT hardcode colors. Use Tailwind design tokens (`neutral-100`, `neutral-200`, `neutral-600`, `neutral-700`).

From 2-2:
- **Ownership probe / query must filter on BOTH `id` and `operator_id`** (defense-in-depth). The index query filters on `operator_id` because it's a list query — the "both ids" pattern applies to single-row lookups. Here, `operator_id` is the single filter that matters.
- `npm run build` may be env-blocked by `BWS_SECRETS_TOKEN`. Flag in Completion Notes if so.

From 2-3:
- Replace placeholder pages with real Suspense-wrapped Server Components. The Suspense boundary owns the fallback; the inner async body owns the query.
- **The `.is("deleted_at", null)` filter on the operator SELECT path is explicit.** Story 2.3 established this on the detail page and this story carries it forward to the list query. Without it, soft-deleted rows leak.
- `<img>` (not `next/image`) is the project convention for listing photos.
- Test the inner async body directly via `renderAsync`, not the outer Suspense-wrapped page. Avoids the RTL + Suspense deadlock.
- Story 2.3 did NOT add a toast library. This story does not need one either — the index page has no Server Action feedback to surface.
- Test suite size at end of Story 2.3: 175. Expect ~20 new tests → ~195 total.

### Testing Standards

- **Framework:** Vitest + React Testing Library (configured).
- **Colocation:** test next to source.
- **Mocking Supabase (Server Component tests):** copy the `mockState` shape from `components/operator/dashboard-home.test.tsx`. Extend it to include `listingsRows`. Mock the `.from("listings").select(...).eq(...).is(...).order(...)` chain to return `{ data: mockState.listingsRows, error: mockState.listingsError }`. Mock `.storage.from("listing-photos").getPublicUrl(path)` to return `{ data: { publicUrl: \`https://example.test/${path}\` } }` — deterministic for assertions.
- **Mocking `next/navigation`:** `vi.mock("next/navigation", () => ({ notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }), Link: ({ children, href }: any) => <a href={href}>{children}</a> }))`. The `Link` mock is only needed in tests that render components importing from `next/link` — check the existing `listing-detail-view.test.tsx` for the pattern.
- **Pinning time for relative-time assertions:** use `vi.setSystemTime(new Date("2026-04-09T12:00:00.000Z"))` in `beforeEach` and `vi.useRealTimers()` in `afterEach`. The `formatRelativeTime` helper's default `now = new Date()` parameter reads from the mocked clock.
- **Do NOT test:** the real `<img>` load event, the real `next/image` configuration (not used), the actual router navigation (only the `href` attribute), the Suspense fallback render path (render the inner body directly), the skeleton markup (trivial, no logic).
- **Coverage budget:** ~20 new tests. See AC #14 for the per-file breakdown.

### Accessibility Checklist

- Page `<h1>` is `"Listings"`. It is the first focusable heading; the `New Listing` CTA is the first focusable element after the heading.
- Each card's outer `<a>` receives focus via native tab order. The card's interior is non-focusable (no nested anchors or buttons) — one focus target per card, which matches screen-reader navigation of a grid of linked items.
- Hero images have `alt={listing.name}`. Decorative wrapper `<div>`s are unlabeled.
- `<h2>` inside each card is the listing name — screen-reader users can skim `h2` landmarks to navigate the grid.
- Daily rate text is plain `<p>` — screen readers read it naturally ("dollar seventy-five point zero zero per day"). No `aria-label` rewrite needed.
- Empty-state heading uses `<h2>` (not `<h1>` — the page `<h1>` is already `"Listings"`).
- Responsive grid uses CSS grid only, no `role="grid"` — the cards are not a data grid, they are a list of links. A `role="list"` on the container and `role="listitem"` on each card wrapper would be more precise but is not required and risks double-reading by some SRs. Omit in favor of native semantics.
- The skeleton fallback is decorative — add `aria-hidden="true"` on the outer `<div>` so SRs skip the pulsing placeholders.

### Anti-Patterns — DO NOT

- Do NOT build an in-card Edit or Delete button in this story. Detail page owns those. See Key Design Decisions.
- Do NOT build an availability preview / "3 of next 7 days booked" column in this story. Scope-deferred to Epic 3.
- Do NOT add a sort dropdown, a filter panel, or a search box. MVP is `created_at DESC` only.
- Do NOT add pagination. TODO comment documents the future trigger.
- Do NOT add `@radix-ui/react-dropdown-menu` or any other new dependency.
- Do NOT use `next/image`. Use `<img>` — matches `listing-detail-view.tsx`.
- Do NOT call `getPublicListingPhotoUrl` from `lib/services/storage.ts` in the page — that function creates its own Supabase client via `await createClient()`, which would be a wasted client instantiation because the page already has a `supabase` in scope. Inline the `supabase.storage.from(...).getPublicUrl(...)` call instead.
- Do NOT forget the `.is("deleted_at", null)` filter. Without it, soft-deleted rows leak into the grid.
- Do NOT use `export default` on `listing-card.tsx`, `empty-listings-card.tsx`, `listings-index-skeleton.tsx`, or `relative-time.ts`. Named exports only. The `page.tsx` default re-export is the only exception.
- Do NOT use `any`. Use the inline `ListingPhotoRow` interface and a single `as ListingPhotoRow[] | null` cast on `row.photos`.
- Do NOT use `Intl.RelativeTimeFormat` alone. The bucket logic is hand-written because the rounding thresholds (30 days → absolute date) differ from `Intl`'s defaults.
- Do NOT mock `Date` globally. Use `vi.setSystemTime` + `vi.useRealTimers` inside the tests that need pinned clocks.
- Do NOT introduce a `formatMoney` helper in this story. The inline `(cents / 100).toFixed(2)` expression is the same as the detail view's — a shared helper is a separate refactor.
- Do NOT test the outer Suspense-wrapped `ListingsPage`. Render the inner `ListingsIndexBody` directly. (Same pattern as Story 2.3 and the existing `DashboardHome` test.)
- Do NOT modify `components/operator/dashboard-home.test.tsx`. The empty-state extraction must be invisible to it.
- Do NOT add a migration. `listings` schema is unchanged.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.4 — lines 408-427]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.3 — lines 386-406] (scope boundary — detail page + Edit/Delete live there)
- [Source: _bmad-output/planning-artifacts/epics.md#UX-DR23 — line 141] (operator responsive layout: mobile single column, tablet condensed, desktop grid)
- [Source: _bmad-output/planning-artifacts/epics.md#UX-DR19 — line 137] (empty state pattern: explanation + action CTA)
- [Source: _bmad-output/planning-artifacts/prd.md#FR5 — Epic 2 View all listings — line 152 of epics.md]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Listing Management — line 908] (card grid with hero photo, name, daily rate, availability summary — availability summary deferred per Key Design Decisions)
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Empty States — lines 1507-1519] (rules: include CTA when the user can directly fix it)
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Breakpoints — line 1588] (desktop ≥ 1024px 12-col grid; tablet; mobile single-column)
- [Source: supabase/migrations/00003_listings.sql#lines 58-61] (operator `SELECT` RLS policy filters on `operator_id` only — does NOT filter `deleted_at`; this story must compensate with an explicit `.is("deleted_at", null)` filter)
- [Source: _bmad-output/implementation-artifacts/2-1-create-listing-with-photos-and-details.md] (listings table shape, photos JSONB `{ path, isHero, position }`, `created_at` column)
- [Source: _bmad-output/implementation-artifacts/2-2-manage-availability-calendar-operator-mode.md] (Suspense wrapper pattern, ownership-probe double-filter pattern)
- [Source: _bmad-output/implementation-artifacts/2-3-edit-and-delete-listings.md] (detail page + Edit/Delete live there — this story's cards link into that page; the `.is("deleted_at", null)` filter pattern; the inner-body test pattern)
- [Source: components/operator/dashboard-home.tsx] (current inline `EmptyListingsCard` to extract; Server Component pattern to mirror)
- [Source: components/operator/dashboard-home.test.tsx] (`mockState` + `renderAsync` pattern to copy into `page.test.tsx`)
- [Source: app/(operator)/listings/[listingId]/page.tsx] (Suspense-wrapped Server Component pattern — the inner-body split)
- [Source: components/listing/listing-detail-view.tsx] (daily rate formatting `(cents / 100).toFixed(2)`; `<img>` not `next/image`)
- [Source: lib/services/storage.ts, lib/services/storage-paths.ts] (`LISTING_PHOTOS_BUCKET`, `getPublicUrl` pattern)
- [Source: CLAUDE.md] (dependency discipline, naming, kebab-case, no `any`, Next.js 16 Cache Components)
- [Source: AGENTS.md] (naming, test colocation, structured errors, no default exports except where Next.js mandates)

## Dev Agent Record

### Agent Model Used

claude-opus-4-6 (1M context) — BMad dev agent, 2026-04-09.

### Debug Log References

None. Lint, type-check, and full vitest suite passed on first run after implementation. `npm run build` not executed (see Completion Notes).

### Completion Notes List

- **Test suite:** 202 / 202 passing (was 175; +27 new tests across `relative-time`, `empty-listings-card`, `listing-card`, and `page` colocated suites).
- **Lint:** `npm run lint` clean.
- **Type-check:** `npm run type-check` clean. Zero `any`. Used inline `ListingPhotoRow` interface for the `row.photos as ListingPhotoRow[] | null` JSONB cast in `page.tsx`, and narrowed the other row fields with targeted `as string | number` casts because Supabase's generated types treat dynamic `.select("...")` results as `any`-ish without a generated database type.
- **Build:** `npm run build` was NOT executed — the project's build step requires the `BWS_SECRETS_TOKEN` env var (per Story 2.2 / 2.3 precedent). User to run `npm run build` when BWS is configured.
- **`EmptyListingsCard` extraction:** moved from `components/operator/dashboard-home.tsx` into `components/listing/empty-listings-card.tsx` with the JSX copied verbatim. The dashboard imports from the new location. `components/operator/dashboard-home.test.tsx` was NOT modified and still passes — the empty-state heading assertion hits the same rendered markup.
- **`formatRelativeTime` helper:** hand-written in `lib/utils/relative-time.ts`. No date libraries. Uses a single `delta` computation and branching bucket logic, with `Math.floor` for each unit. Falls back to `"just now"` for `delta < 0` (future timestamps) so tests don't throw.
- **Hero URL resolution:** inlined inside `ListingsIndexBody` per the story spec — calls `supabase.storage.from(LISTING_PHOTOS_BUCKET).getPublicUrl(path)` directly. Deliberately does NOT call `getPublicListingPhotoUrl` from `lib/services/storage.ts` because that helper would instantiate a second Supabase client.
- **Defense-in-depth filters:** the listings query uses BOTH `.eq("operator_id", user.id)` AND `.is("deleted_at", null)`. The operator SELECT RLS policy in `00003_listings.sql` only filters on `operator_id`, so without the explicit `deleted_at` filter the index would leak soft-deleted rows.
- **Defensive empty-photos guard:** a row with `photos.length === 0` is logged and skipped via `flatMap` rather than thrown — the DB CHECK constraint prevents this, but the runtime guard is cheap and a test case verifies it.
- **Suspense-wrapped page:** outer `ListingsPage` wraps inner async `ListingsIndexBody` in `<Suspense fallback={<ListingsIndexSkeleton />}>`. The inner body is exported as a named export so `page.test.tsx` can render it directly via the `renderAsync` pattern copied from `dashboard-home.test.tsx` (avoids the RTL + Suspense deadlock).
- **Pure Server Components:** `ListingsPage`, `ListingsIndexBody`, `ListingCard`, `EmptyListingsCard`, `ListingsIndexSkeleton`. Zero `"use client"` added in this story.
- **No deviations from the story spec** beyond the additional narrow casts on row fields (`as string | number`) to satisfy strict TypeScript without a `Database` generic.

### File List

**Created:**
- `lib/utils/relative-time.ts`
- `lib/utils/relative-time.test.ts`
- `components/listing/empty-listings-card.tsx`
- `components/listing/empty-listings-card.test.tsx`
- `components/listing/listing-card.tsx`
- `components/listing/listing-card.test.tsx`
- `components/listing/listings-index-skeleton.tsx`
- `app/(operator)/listings/page.test.tsx`

**Modified:**
- `app/(operator)/listings/page.tsx` (replaced the Story 2.3 placeholder with the real Suspense-wrapped index)
- `components/operator/dashboard-home.tsx` (imports `EmptyListingsCard` from the new shared location; removed the inline definition)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (`2-4-view-all-listings: in-progress → review`)
- `_bmad-output/implementation-artifacts/2-4-view-all-listings.md` (Status → review, Tasks checked, this record populated)

### Change Log

| Date       | Author                                  | Change |
|------------|------------------------------------------|--------|
| 2026-04-09 | claude-opus-4-6 (1M context, BMad SM)   | Initial draft of Story 2.4: real listings index page replacing the Story 2.3 placeholder, responsive card grid, ownership-scoped query with explicit `deleted_at IS NULL` filter, extracted shared `EmptyListingsCard`, new pure `ListingCard` Server Component, new `formatRelativeTime` helper in `lib/utils/relative-time.ts`, Suspense-wrapped Server Component pattern matching Story 2.3. No new migrations, no new npm dependencies, no Server Actions. |
| 2026-04-09 | claude-opus-4-6 (1M context, BMad dev) | Implemented Story 2.4 end-to-end. Extracted `EmptyListingsCard` to `components/listing/empty-listings-card.tsx` (dashboard imports from there; its existing test unchanged). Added `lib/utils/relative-time.ts` with bucket logic (just now / minutes / hours / days / YYYY-MM-DD) and nine test cases. Added pure Server Components `ListingCard` and `ListingsIndexSkeleton`. Replaced `app/(operator)/listings/page.tsx` with `ListingsPage` wrapping `ListingsIndexBody` in `<Suspense>`; body queries `listings` with `.eq("operator_id", user.id).is("deleted_at", null).order("created_at", { ascending: false })`, resolves hero URLs inline via `supabase.storage.getPublicUrl`, and renders the responsive `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` card grid. Added colocated tests for relative-time, empty card, listing card, and page body (empty / non-empty / order / header-CTA / hero-URL / empty-photos defensive / DB error / notFound / h1). Full vitest suite 202 / 202 passing (+27 new). `npm run lint` and `npm run type-check` clean. `npm run build` environment-blocked by missing `BWS_SECRETS_TOKEN` — flagged for user. Status → review. |
| 2026-04-09 | claude-opus-4-6 (review fixes)         | Code review (Approve with nits). Applied three fixes: (1) **Pre-existing dashboard soft-delete bug (review L2)** — `components/operator/dashboard-home.tsx` `countListings` was missing `.is("deleted_at", null)` so an operator who soft-deleted their only listing would still see "You have 1 listing" on the dashboard while `/listings` correctly showed empty. Added the filter and updated `dashboard-home.test.tsx`'s Supabase mock chain to terminate on `.is()` instead of `.eq()`. (2) **Query-arg assertions (review M2)** — `app/(operator)/listings/page.test.tsx` now spies on `eq` / `is` / `select` arguments and asserts the `operator_id = user.id` + `deleted_at IS NULL` filters are actually applied, so a regression that drops either call fails this test instead of slipping to manual QA. (3) **isHero fallback coverage (review L3)** — added a test case with a photos array where every element has `isHero: false`, verifying the resolver picks `photos[0]`. User's gate sweep: lint clean, type-check clean, 204 / 204 tests (+2 new over the dev baseline), build clean with `/listings` in the prerender set. Status: review → done. |
