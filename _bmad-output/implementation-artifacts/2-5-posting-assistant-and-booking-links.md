# Story 2.5: Posting Assistant & Booking Links

Status: done

## Story

As an **operator**,
I want platform-tailored ad copy and a shareable booking link for each listing,
so that I can post on KSL, Facebook Marketplace, and Craigslist in minutes.

## Acceptance Criteria

1. **Posting assistant entry point on listing detail page:** The listing detail page (`components/listing/listing-detail-view.tsx`) renders a new secondary action button labeled `Posting assistant` (with the `Megaphone` icon from `lucide-react`) in the existing action row, positioned between `Manage availability` and the `DeleteListingDialog`. Clicking the button opens the posting assistant dialog (AC #3). The button is rendered inline via a new `PostingAssistantDialog` client component whose trigger mirrors the `DeleteListingDialog` trigger pattern.
2. **Post-publish auto-open:** When an operator successfully publishes a new listing via the create wizard (`components/listing/create-listing-wizard.tsx`), the wizard's success handler now navigates to `/listings/{listingId}?posted=1` instead of `/listings/{listingId}`. On the detail page, the `ListingDetailPage` Server Component reads `searchParams.posted` (awaited per Next 16 async contract) and passes `initialAssistantOpen={searchParams.posted === "1"}` to `ListingDetailView`, which in turn passes it to `PostingAssistantDialog`. When `initialAssistantOpen` is true, the dialog auto-opens on mount exactly once. After the operator closes the auto-opened dialog, the URL is rewritten via `router.replace(pathname)` to strip the `?posted=1` query param so a subsequent re-render (e.g. `router.refresh()`) does not re-open the dialog.
3. **Dialog structure:** The posting assistant uses the same native `<dialog>` pattern as `DeleteListingDialog`. It renders a header `Posting assistant` (`text-h2`), a subtitle `Copy ad text for each classifieds platform and share your booking link.`, a close button (`X` icon from `lucide-react`, top-right, `aria-label="Close posting assistant"`), a booking-link section (AC #4), and three platform sections stacked vertically on mobile and in a responsive grid (`grid gap-space-4 md:grid-cols-3`) on desktop (AC #5). The dialog width is constrained to `max-w-3xl`. Focus-trap, ESC-to-close, and backdrop-click-to-close come for free from the native `<dialog>` element.
4. **Booking link row:** The top of the dialog shows the booking link in a read-only row: a `<label className="text-sm font-medium text-neutral-600">Booking link</label>`, a `<code className="block break-all rounded-md bg-neutral-100 px-space-3 py-space-2 text-sm">` displaying the full URL (e.g. `https://everything.rent/book/{listingId}`), and a `Copy link` button. The URL is constructed in the Server Component using `headers()` from `next/headers` to read the `Host` header plus the request protocol and is passed down as the `bookingUrl` prop. A placeholder `<div>` marked `aria-hidden="true"` where the QR code will live carries the copy `QR code will be generated in Epic 3 (Story 3.1) once the booking page exists.` with a `TODO: QR code (Story 3.1)` HTML comment above it — no QR encoder is shipped in this story.
5. **Three platform sections:** Below the booking link, the dialog renders three sections in this order: **KSL Classifieds**, **Facebook Marketplace**, **Craigslist**. Each section is a card (`rounded-lg border border-neutral-200 bg-white p-space-4`) with:
   - A heading `<h3 className="text-h3">{platform name}</h3>`
   - A `<textarea readOnly value={generatedCopy} rows={8} className="w-full resize-none rounded-md border border-neutral-200 bg-neutral-50 p-space-2 font-mono text-sm">` containing the generated ad copy (not `<pre>`, so on mobile the user can long-press to select if the clipboard API fails)
   - A `Copy` button directly below the textarea. On click the button calls `navigator.clipboard.writeText(generatedCopy)`, swaps its label to `Copied!` with a `Check` icon from `lucide-react`, and after 2000 ms reverts to `Copy`. While the "Copied!" state is active, the button has `aria-live="polite"` on an adjacent visually-hidden `<span>` announcing `"Copied {platform name} ad copy"` to screen readers.
   The ad copy is generated from a pure function `generatePostingCopy(listing, platform)` (AC #7) and includes the booking URL at the bottom of each template.
6. **Clipboard fallback handling:** The clipboard `writeText` call is wrapped in a `try/catch` (or `.catch()` since it returns a Promise). On rejection, the copy button label does NOT change to "Copied!"; instead an inline error message renders below the button: `Copy failed — select the text and press Ctrl+C manually.` in `text-xs text-destructive`. The error state clears on the next successful copy attempt. Do NOT call `alert()`. Do NOT show a toast.
7. **Pure copy generator:** A new file `lib/utils/posting-templates.ts` exports `generatePostingCopy(listing: ListingForTemplates, platform: PostingPlatform, bookingUrl: string): string`. `ListingForTemplates` is a lightweight interface `{ name: string; description: string; dailyRateCents: number; pickupLocation: string; }` — it does NOT depend on Supabase types, the Zod schema, or any DB layer. `PostingPlatform` is the string-literal union `"ksl" | "facebook" | "craigslist"`. The function is a pure string builder with no side effects. Each platform's output is the exact template from the Dev Notes "Template Strings" block. Daily rate is always formatted as `$${(dailyRateCents / 100).toFixed(2)}`.
8. **Dialog is pure client UI — no Server Actions, no DB writes, no new columns:** The posting assistant reads only the `listing.name`, `listing.description`, `listing.daily_rate_cents`, and `listing.pickup_location` fields already fetched by the Server Component for the detail page. No new Server Action is added to `lib/actions/listing-actions.ts`. No new table, column, or migration is added. No new npm dependency is added (no `qrcode`, no `react-qr-code`, no `@radix-ui/react-dialog`, nothing).
9. **Booking link host resolution:** In the Server Component, the booking URL is built using `headers()` from `next/headers`: read the `host` header and the `x-forwarded-proto` header (fallback `http` if neither `x-forwarded-proto` nor the Next.js derived protocol is available). Build the URL as `${protocol}://${host}/book/${listingId}`. If `process.env.NEXT_PUBLIC_SITE_URL` is set, prefer it over the header-derived host (priority: `NEXT_PUBLIC_SITE_URL` > `x-forwarded-proto` + `host` > `http://localhost:3000` fallback). The `/book/{listingId}` route itself does NOT exist yet — it ships in Epic 3 Story 3.1. Clicking the link today will 404; that is acceptable and documented in Dev Notes.
10. **Tests pass:** New tests (all colocated):
    - `lib/utils/posting-templates.test.ts` — one test per platform asserting key invariants: the KSL template includes the formatted daily rate (e.g. `$75.00`) and the booking URL; the Craigslist template includes an ALL CAPS line (assert via regex `/[A-Z]{6,}/`); the Facebook Marketplace template is terse (assert `generated.length < kslGenerated.length`); all three templates include the listing name and the booking URL. Plus one test that a description containing special characters (quotes, newlines, unicode) is passed through without throwing and without mangling.
    - `components/listing/posting-assistant-dialog.test.tsx` — closed by default, opens on trigger click, renders three platform sections each with a Copy button. Clicking the KSL Copy button calls `navigator.clipboard.writeText` with a string that includes the formatted daily rate and the booking URL; the button label changes to `Copied!` and reverts to `Copy` after 2000 ms (use `vi.useFakeTimers()` + `vi.advanceTimersByTime(2000)`). Clipboard failure path: mock `navigator.clipboard.writeText` to reject once, click Copy, assert the error message `Copy failed — select the text and press Ctrl+C manually.` renders and the label did NOT change to "Copied!". Auto-open path: mount the dialog with `initialOpen={true}` and assert `showModal` was called, then close the dialog and assert `router.replace` was called with the current pathname (mock `next/navigation` `useRouter` and `usePathname`). Booking-link Copy button: clicking it calls `navigator.clipboard.writeText(bookingUrl)`.
    - `components/listing/listing-detail-view.test.tsx` — existing tests continue to pass. Add one new test that `ListingDetailView` with `initialAssistantOpen={true}` renders the `PostingAssistantDialog` with its open state set (either assert the dialog element has attribute `open`, or assert `showModal` was called after polyfilling the jsdom `<dialog>` element per the Story 2.3 pattern).
    - Existing test suite still passes. `npm run lint`, `npm run type-check`, `npm run test`, and `npm run build` complete cleanly.
11. **No new dependencies, no new migrations, no new Server Actions:** This story does NOT add any npm package (confirmed against hard rules). This story does NOT add a database migration. This story does NOT add a Server Action — the posting assistant operates entirely on data already resident in the detail page's Server Component props.

## Tasks / Subtasks

- [x] Task 1: Pure copy generator (AC: #7, #10)
  - [x] 1.1 Create `lib/utils/posting-templates.ts`. Export the `ListingForTemplates` interface, the `PostingPlatform` string-literal union type, and the `generatePostingCopy(listing, platform, bookingUrl)` function. No `"use server"` directive, no React imports, no Supabase imports — this is a plain utility module.
  - [x] 1.2 Implement the three template functions using the exact template strings in Dev Notes → "Template Strings". Format the daily rate via a private helper `formatDailyRate(cents: number) => $${(cents / 100).toFixed(2)}`. Do NOT truncate the description for MVP — document that Facebook Marketplace's real 9,999-char limit is far above any realistic listing length (the Zod schema caps description at 2,000 chars). Add a TODO comment: `// TODO(2.x): Per-platform length caps if descriptions start exceeding limits.`
  - [x] 1.3 Create `lib/utils/posting-templates.test.ts` colocated. Cover every case listed in AC #10's first bullet. Use a fixture `const fixture: ListingForTemplates = { name: "2016 Kubota Mini Excavator", description: "Well-maintained 3,000lb mini excavator...", dailyRateCents: 17500, pickupLocation: "Provo, UT" };` and `const bookingUrl = "https://everything.rent/book/test-listing-id";`. Assert substring presence, not exact-string equality, so tiny copy tweaks don't explode the tests.

- [x] Task 2: Posting assistant dialog component (AC: #3, #4, #5, #6, #8, #10)
  - [x] 2.1 Create `components/listing/posting-assistant-dialog.tsx` as a Client Component (`"use client"`). Props interface:
    ```ts
    interface PostingAssistantDialogProps {
      listing: {
        name: string;
        description: string;
        daily_rate_cents: number;
        pickup_location: string;
      };
      bookingUrl: string;
      initialOpen?: boolean;
      trigger?: React.ReactNode;
    }
    ```
    State: `dialogRef = useRef<HTMLDialogElement>(null)`, `const [copiedPlatform, setCopiedPlatform] = useState<PostingPlatform | "link" | null>(null)`, `const [errorPlatform, setErrorPlatform] = useState<PostingPlatform | "link" | null>(null)`, `const [hasConsumedInitialOpen, setHasConsumedInitialOpen] = useState(false)`.
  - [x] 2.2 Auto-open effect:
    ```tsx
    useEffect(() => {
      if (initialOpen && !hasConsumedInitialOpen && dialogRef.current) {
        dialogRef.current.showModal();
        setHasConsumedInitialOpen(true);
      }
    }, [initialOpen, hasConsumedInitialOpen]);
    ```
    `handleClose` (wired to the dialog's `onClose` event — which fires on ESC, `close()`, and backdrop click once `<dialog>` dispatches it): reset `copiedPlatform`/`errorPlatform` to `null`, and if `hasConsumedInitialOpen` is true AND the current search string contains `posted=1`, call `router.replace(pathname)` (imports: `useRouter`, `usePathname` from `next/navigation`). This strips the query param so a `router.refresh()` won't re-trigger the auto-open flag, and it protects against repeat-opens from the same render cycle.
  - [x] 2.3 Trigger: if `trigger` prop is provided render it inside a wrapper `<button>` that calls `dialogRef.current?.showModal()`; otherwise render a default `<Button variant="outline"><Megaphone className="h-4 w-4" aria-hidden="true" /> Posting assistant</Button>` as the trigger. Match the `DeleteListingDialog` trigger-injection pattern.
  - [x] 2.4 Dialog body layout:
    ```
    <dialog ref={dialogRef} onClose={handleClose} onClick={handleBackdropClick}
            className="... max-w-3xl rounded-lg p-space-6">
      <header: h2 "Posting assistant" + close-X button>
      <subtitle: "Copy ad text for each classifieds platform and share your booking link.">
      <section: booking link row with <code> + "Copy link" button + QR placeholder>
      <section: three platform cards in grid>
    </dialog>
    ```
    `handleBackdropClick`: if `event.target === dialogRef.current`, call `dialogRef.current.close()` (native `<dialog>` reports the dialog itself as the click target when the backdrop is clicked — same trick as `DeleteListingDialog`).
  - [x] 2.5 Per-platform card component (inline or extract to a local `PlatformCopyCard` sub-component in the same file). Props: `platform: PostingPlatform`, `heading: string`, `copy: string`, `copied: boolean`, `errored: boolean`, `onCopy: () => void`. The card renders the heading, the read-only `<textarea>`, and the Copy button. The button's label is `"Copied!"` with a `Check` icon when `copied`, `"Copy failed — select the text and press Ctrl+C manually."` in `text-xs text-destructive` below the button when `errored`, and `"Copy"` otherwise. The adjacent `aria-live="polite"` span announces the copy success for screen readers.
  - [x] 2.6 `handleCopy(platformOrLink, text)`: wrap `navigator.clipboard.writeText(text)` in a try/catch using `async/await`:
    ```ts
    async function handleCopy(key: PostingPlatform | "link", text: string) {
      try {
        await navigator.clipboard.writeText(text);
        setErrorPlatform(null);
        setCopiedPlatform(key);
        window.setTimeout(() => {
          setCopiedPlatform((current) => (current === key ? null : current));
        }, 2000);
      } catch {
        setCopiedPlatform(null);
        setErrorPlatform(key);
      }
    }
    ```
    The setTimeout guard (checking `current === key`) ensures a rapid sequential copy of a different button doesn't prematurely clear the other button's `Copied!` state. Use `window.setTimeout` explicitly (not `setTimeout` without the window prefix) so the TypeScript `number` return type is unambiguous.
  - [x] 2.7 Call `generatePostingCopy` once per platform on each render via three local `const`s:
    ```ts
    const kslCopy = generatePostingCopy(listing, "ksl", bookingUrl);
    const fbCopy = generatePostingCopy(listing, "facebook", bookingUrl);
    const clCopy = generatePostingCopy(listing, "craigslist", bookingUrl);
    ```
    Do NOT wrap in `useMemo` — these are cheap pure string builds and the dialog is only mounted when the operator actively opens the assistant.
  - [x] 2.8 Create `components/listing/posting-assistant-dialog.test.tsx`. Follow the `delete-listing-dialog.test.tsx` harness for jsdom `<dialog>` polyfilling (`HTMLDialogElement.prototype.showModal` / `close` are partial in jsdom — stub them). Mock `navigator.clipboard.writeText` via `Object.defineProperty(navigator, "clipboard", { writable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } })`. Mock `next/navigation` `useRouter` (`replace: vi.fn()`) and `usePathname` (returns `/listings/test-id`). Cover the cases from AC #10 bullet 2.

- [x] Task 3: Wire the posting assistant into the listing detail page (AC: #1, #2, #4, #9)
  - [x] 3.1 Open `app/(operator)/listings/[listingId]/page.tsx`. Update `ListingDetailPageProps` to include `searchParams: Promise<{ posted?: string }>`. Update `ListingDetailBody` to accept `searchParams` and `await` it. Build the booking URL in the Server Component body using a new helper `buildBookingUrl(listingId: string): Promise<string>` which reads `headers()` (async in Next 16) and returns the full URL per AC #9 priority order. Place the helper inline in the page file for now — this is a one-off and doesn't warrant its own module.
  - [x] 3.2 Pass two new props to `<ListingDetailView>`:
    ```tsx
    <ListingDetailView
      listing={data}
      bookingUrl={bookingUrl}
      initialAssistantOpen={params.posted === "1"}
    />
    ```
    Wait — `params` here refers to the awaited `searchParams`. Resolve naming: use `awaitedSearchParams.posted === "1"`. Do not call `.toString()` on the URL-encoded value — `searchParams.posted` is already a string in Next 16.
  - [x] 3.3 In `components/listing/listing-detail-view.tsx`, extend `ListingDetailViewProps` with `bookingUrl: string` and `initialAssistantOpen?: boolean`. Import the new `PostingAssistantDialog`. Insert the dialog's trigger into the action row between `Manage availability` and `DeleteListingDialog`:
    ```tsx
    <PostingAssistantDialog
      listing={{
        name: listing.name,
        description: listing.description,
        daily_rate_cents: listing.daily_rate_cents,
        pickup_location: listing.pickup_location,
      }}
      bookingUrl={bookingUrl}
      initialOpen={initialAssistantOpen}
    />
    ```
  - [x] 3.4 Update `components/listing/listing-detail-view.test.tsx` to provide the new required props (`bookingUrl`, and optionally `initialAssistantOpen`) in every test. Add one new test that with `initialAssistantOpen={true}` the dialog element has its `showModal` polyfill called on mount (stub `HTMLDialogElement.prototype.showModal` with a spy).

- [x] Task 4: Update create-wizard publish redirect (AC: #2)
  - [x] 4.1 Open `components/listing/create-listing-wizard.tsx`. In `handlePublish`, change the success navigation from `router.push(\`/listings/${result.data.listingId}\`)` to `router.push(\`/listings/${result.data.listingId}?posted=1\`)`. Leave every other part of the wizard untouched.
  - [x] 4.2 Do NOT add a new wizard test for this change — the existing `create-listing-wizard` tests (if any) assert the navigation target and may need the expected URL updated. Search for any mock assertion on `router.push` inside the wizard or the publish flow; update those targets. If no such test exists today, skip. (Confirmed no existing wizard test; skipped.)

- [x] Task 5: Tests, lint, type-check, build (AC: #10, #11)
  - [x] 5.1 Run `npm run test` — all new tests + existing suite pass. 217 / 217 passing, 13 new.
  - [x] 5.2 Run `npm run lint` clean.
  - [x] 5.3 Run `npm run type-check` clean. No `any`. `PostingPlatform` is a string-literal union. `handleCopy`'s `key` narrows to `PostingPlatform | "link"`.
  - [ ] 5.4 Run `npm run build` clean. Environment-blocked: `BWS_SECRETS_TOKEN` not available in dev agent shell — user must run locally.
  - [ ] 5.5 Manual smoke test (if local dev server is available): publish a new listing via the wizard → verify redirect to `/listings/{id}?posted=1` and the posting assistant dialog auto-opens → click Copy on the KSL card → verify clipboard contents include the listing name, `$X.XX`, and the `/book/{id}` URL → close the dialog → verify the URL in the address bar loses `?posted=1` → refresh the page → verify the dialog does NOT reopen → click the `Posting assistant` button in the action row → verify the dialog reopens → verify the booking-link Copy button copies the URL → click the booking link itself → verify it 404s (expected, Epic 3 Story 3.1 deliverable).

## Dev Notes

### Critical Architecture Patterns — MUST Follow

**Named exports only** — `export function PostingAssistantDialog`, `export function generatePostingCopy`. Never `export default` except where Next.js mandates it (`page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`, `route.ts`). Same precedent as Stories 2.1–2.4.

**File naming:** kebab-case. `posting-assistant-dialog.tsx`, `posting-templates.ts`, colocated `.test.ts(x)` files.

**Component naming:** PascalCase — `PostingAssistantDialog`, `PlatformCopyCard` (if extracted).

**Pure utility module:** `lib/utils/posting-templates.ts` must have no side effects, no imports from React, Supabase, or Next. A single dev can grep the file and understand every byte.

**Native `<dialog>` element:** We continue the Story 2.3 precedent of using the platform's native `<dialog>` element for modals. No `@radix-ui/react-dialog`, no `headlessui`, no `cmdk`. Backdrop-click-to-close is implemented by comparing `event.target === dialogRef.current` in an `onClick` handler. ESC, focus trap, and inert-outside-content are free.

**No `any`:** The `PostingPlatform` type is a string-literal union. `ListingForTemplates` is an explicit interface. The Server Component's `searchParams` prop is typed as `Promise<{ posted?: string }>`.

**Result<T>:** not applicable — this story adds no Server Actions.

### Template Strings

These are the EXACT template strings the implementing agent must put into `generatePostingCopy`. Each includes the booking URL at the end. Daily rate is formatted as `$XX.XX` via `formatDailyRate`.

**KSL Classifieds** — friendly, informative, clear price. KSL readers expect retail-style listings:

```
For Rent: {name}

{description}

Daily rate: {formattedRate}/day
Pickup: {pickupLocation}

Book directly online with instant availability, digital contract, and secure payment hold — no phone tag, no deposit checks.

Reserve here: {bookingUrl}
```

**Facebook Marketplace** — terse, emoji-friendly but we'll skip emojis for MVP to keep the generator a pure string builder. Facebook Marketplace descriptions are scanned quickly on mobile:

```
{name} — {formattedRate}/day

{description}

Pickup in {pickupLocation}. Reserve online: {bookingUrl}
```

**Craigslist** — Craigslist conventions: an all-caps headline, plain text, a clear price, and a call-to-action link. Craigslist readers are used to caps-lock emphasis:

```
FOR RENT - {name} - {formattedRate}/DAY

{description}

PICKUP LOCATION: {pickupLocation}

BOOK ONLINE WITH INSTANT AVAILABILITY AND SECURE PAYMENT:
{bookingUrl}

(Booking link handles contract signing and payment hold — no need to call or text first.)
```

**Length note:** the generator does not truncate. The Zod schema caps description at 2,000 characters. Facebook Marketplace's real limit is ~9,999 characters; KSL and Craigslist are effectively unlimited. A 2,000-char description plus template boilerplate stays comfortably under all three limits. A future story can add per-platform truncation if real listings start hitting platform caps.

### Host Resolution Priority

The booking URL is built in `app/(operator)/listings/[listingId]/page.tsx` using this priority order:

1. `process.env.NEXT_PUBLIC_SITE_URL` — if set, use it verbatim (strip trailing slash).
2. `headers()` — read `x-forwarded-proto` + `host`. This covers Vercel and most proxies.
3. Fallback `http://everything.test:3000` — only in local dev when neither above is present.

Append `/book/{listingId}` to the resolved base URL.

Sketch:

```ts
import { headers } from "next/headers";

async function buildBookingUrl(listingId: string): Promise<string> {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (envUrl) {
    return `${envUrl.replace(/\/$/, "")}/book/${listingId}`;
  }
  const h = await headers();
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  if (host) {
    return `${proto}://${host}/book/${listingId}`;
  }
  return `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://everything.test:3000"}/book/${listingId}`;
}
```

### The `/book/{listingId}` Route Is Not Implemented Yet

The proxy at `lib/supabase/proxy.ts` already lists `/book` in `PUBLIC_ROUTES`, so the booking link will not be caught by the auth redirect — instead it will fall through to Next's 404 until Epic 3 Story 3.1 ships the real renter-facing booking page. That 404 is the expected behavior of this story. Do NOT add a placeholder `/book/[listingId]/page.tsx` in this story — let Epic 3 own that route to avoid merge conflicts with the renter flow work.

### QR Code Is Deferred to Epic 3 Story 3.1

Writing a QR encoder from scratch is non-trivial (Reed-Solomon error correction, bit-stream layout, format/version info). Adding the `qrcode` npm dependency is forbidden by this story's hard rules. Therefore: we ship a visually-neutral placeholder `<div>` inside the booking-link row with the copy `QR code will be generated in Epic 3 (Story 3.1) once the booking page exists.` Add an HTML comment above it: `{/* TODO: QR code (Story 3.1). Requires a renter-facing /book/[id] page to target. Planned: add `qrcode` dep or hand-write encoder in that story. */}`

### Auto-Open Consumption Semantics

The `?posted=1` query param must trigger exactly one dialog auto-open. The naive `useEffect([initialOpen])` approach re-opens the dialog on every render where `initialOpen` is still true. Two defenses, both applied:

1. **Component-local guard:** `hasConsumedInitialOpen` state is flipped to `true` inside the effect itself. The effect's condition checks `initialOpen && !hasConsumedInitialOpen`.
2. **URL scrub on close:** When the dialog closes AND `hasConsumedInitialOpen` is true, `router.replace(pathname)` strips the `?posted=1` query param. This protects against a `router.refresh()` or parent re-render creating a fresh `PostingAssistantDialog` instance with `initialOpen` still derived from the URL.

Both guards are load-bearing — remove either and you get a subtle re-open bug.

### Next 16 `searchParams` Is Async

Per the Story 2.3 page pattern, `params` is a `Promise<...>` in Next 16. `searchParams` is the same — it must be `await`ed before property access. Reference: Story 2.3 Task 6.1.

### Clipboard API Availability

`navigator.clipboard.writeText` requires:
- A secure context (HTTPS or localhost).
- A recent browser (Chrome 66+, Firefox 63+, Safari 13.1+).
- User activation (a trusted click event) — the Copy button click satisfies this.

In insecure contexts (e.g. an operator running the dev server on a LAN IP over plain HTTP) the Promise rejects. The fallback in AC #6 handles this gracefully: surface an inline error asking the user to select the text in the textarea and press Ctrl+C. The textarea is `readOnly` but still selectable — that's the manual fallback.

### Tests — jsdom `<dialog>` Polyfill

jsdom's `HTMLDialogElement` implementation is partial and inconsistent across versions. Follow the exact polyfill pattern from `components/listing/delete-listing-dialog.test.tsx`:

```ts
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  });
});
```

The `close()` polyfill dispatches a `close` event so the `onClose` React handler fires and the `router.replace` auto-cleanup branch runs in tests.

### Tests — Clipboard Mock

```ts
const writeTextMock = vi.fn().mockResolvedValue(undefined);
Object.defineProperty(navigator, "clipboard", {
  writable: true,
  configurable: true,
  value: { writeText: writeTextMock },
});
```

For the failure path test, swap in `writeTextMock.mockRejectedValueOnce(new Error("nope"))` before the click and assert the error message is rendered.

### What Is Out of Scope

- **Actually posting to KSL / Facebook / Craigslist via API.** All three platforms use manual copy-paste. No API integration.
- **Tracking which platforms the operator has posted to.** No DB column, no analytics, no "mark as posted" UI.
- **QR code generation.** Deferred to Epic 3 Story 3.1 when the booking page exists and the QR has a real target.
- **Operator customization of templates.** Templates are hard-coded. Future story (maybe Epic 5) can add per-operator template overrides.
- **Analytics on booking link clicks.** Out of scope for MVP. Maybe Epic 4.
- **The renter-facing `/book/[listingId]` page.** Epic 3 Story 3.1 deliverable. Clicking the link today 404s — by design.
- **A/B testing multiple template variants.** Single template per platform, ship it.

### No New Dependencies (Reiterated)

The hard rule from the story prompt: NO new npm dependencies. Not `qrcode`, not `react-qr-code`, not `qrcode.react`, not `@radix-ui/react-dialog`, not `sonner` for toasts, not `use-copy-to-clipboard`, not anything. Every behavior above is achievable with the existing `react`, `next`, `lucide-react`, and `@/components/ui/button` surface area. If the implementing agent feels the urge to `npm install` something, they should stop and re-read this section.

### File Manifest (Expected Final Shape)

New files:
- `lib/utils/posting-templates.ts`
- `lib/utils/posting-templates.test.ts`
- `components/listing/posting-assistant-dialog.tsx`
- `components/listing/posting-assistant-dialog.test.tsx`

Modified files:
- `app/(operator)/listings/[listingId]/page.tsx` — add `searchParams` prop, build booking URL, pass to `ListingDetailView`.
- `components/listing/listing-detail-view.tsx` — add `bookingUrl` + `initialAssistantOpen` props, render `PostingAssistantDialog` trigger in the action row.
- `components/listing/listing-detail-view.test.tsx` — provide new required props, add one auto-open test case.
- `components/listing/create-listing-wizard.tsx` — append `?posted=1` to the success redirect URL.

No migrations. No new Server Actions. No new npm deps.

## Dev Agent Record

**Agent:** Claude (Opus 4.6) — BMad dev agent
**Date completed:** 2026-04-09

### Completion Notes

- All five tasks implemented per story spec. No new npm dependencies; no new migrations; no new Server Actions.
- Pure generator `lib/utils/posting-templates.ts` covers KSL / Facebook Marketplace / Craigslist with verbatim templates from Dev Notes. Daily rate formatted via private `formatDailyRate` helper.
- `PostingAssistantDialog` uses the native `<dialog>` pattern from Story 2.3. Auto-open is guarded with both `hasConsumedInitialOpen` state and a `router.replace(pathname)` URL scrub on close (only when `window.location.search` contains `posted=1`).
- Clipboard API is wrapped in try/catch with per-target `copiedTarget` / `erroredTarget` state. The 2-second revert uses `window.setTimeout` with a `current === key` guard so rapid sequential copies across buttons behave correctly.
- Detail page Server Component builds `bookingUrl` via `buildBookingUrl` helper: `NEXT_PUBLIC_SITE_URL` > `x-forwarded-proto` + `host` headers > `http://everything.test:3000` fallback.
- Wizard publish redirect now appends `?posted=1`. No existing wizard test needed updating (no `create-listing-wizard.test.*` exists).
- Tests: 217 / 217 passing, 13 net new (`posting-templates` 5, `posting-assistant-dialog` 6, `listing-detail-view` +2).
- Lint: clean. Type-check: clean.
- Build: environment-blocked — `npm run build` requires `BWS_SECRETS_TOKEN` in the shell which the dev agent did not have. User to run locally per Story 2.1/2.3 precedent.
- `listing-detail-view.test.tsx` had to drop an assertion looking up the listing name by text (the name now also appears inside every platform template textarea so the lookup finds many matches). Swapped to the formatted daily rate assertion, which is unique.
- Added a small trigger wrapper change in `PostingAssistantDialog`: when a `trigger` prop is supplied, wrap it in a `className="contents"` button so the consumer's custom trigger element still renders but inherits the click handler. Default trigger is the `Megaphone` + "Posting assistant" outline button.

### File List

**Created:**
- `lib/utils/posting-templates.ts`
- `lib/utils/posting-templates.test.ts`
- `components/listing/posting-assistant-dialog.tsx`
- `components/listing/posting-assistant-dialog.test.tsx`

**Modified:**
- `app/(operator)/listings/[listingId]/page.tsx` — added async `searchParams` prop, `buildBookingUrl` helper using `headers()`, passes `bookingUrl` + `initialAssistantOpen` to `ListingDetailView`.
- `components/listing/listing-detail-view.tsx` — extended props with `bookingUrl` and `initialAssistantOpen`, renders the new `PostingAssistantDialog` trigger between "Manage availability" and "Delete".
- `components/listing/listing-detail-view.test.tsx` — supplies new required `bookingUrl` prop; new auto-open test spies on `showModal`; new "Posting assistant trigger renders" test; reworked one legacy assertion to avoid collision with the name embedded in template textareas.
- `components/listing/create-listing-wizard.tsx` — publish success redirect now appends `?posted=1`.

## Change Log

| Date       | Version | Description                                 | Author |
| ---------- | ------- | ------------------------------------------- | ------ |
| 2026-04-09 | 0.1     | Initial draft — ready for dev               | BMad SM |
| 2026-04-09 | 1.0     | Implementation complete — all gates (minus env-blocked build) green | Dev Agent |
| 2026-04-09 | 1.1     | Code review (Approve). Applied two medium-severity fixes: (1) **setTimeout leak** — the 2-second "Copied!" revert timer is now captured in `copiedTimerRef`, cleared on unmount, and cleared before starting a new copy, so Strict Mode's double-invoke and rapid Copy clicks don't stack overlapping timers. (2) **Dead `trigger` prop removed** — the conditional render had a nested-button foot-gun (`<button className="contents">` wrapping a potentially-button child) that no consumer used. Deleted. Also applied low-severity fix: wrapped the `window.location` stub in `auto-opens once` test in try/finally so an assertion throw cannot leak the stub into subsequent tests. Full gate sweep (lint / type-check / 217 tests / build) clean. Status: review → done. | Review |
