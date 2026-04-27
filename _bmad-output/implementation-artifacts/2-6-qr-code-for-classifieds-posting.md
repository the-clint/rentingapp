# Story 2.6: QR Code for Classifieds Posting

Status: review

## Story

As an **operator**,
I want a scannable QR code for each listing's booking link inside the posting assistant,
so that I can include it in printed flyers, on-equipment stickers, and image-based classifieds posts where renters can scan instead of typing the URL.

## Background

This story closes the QR-code follow-up that Story 2.5 (`Posting Assistant & Booking Links`) deferred. Story 2.5 shipped a placeholder `<div>` in the posting assistant dialog with the copy `QR code will be generated in Epic 3 (Story 3.1) once the booking page exists.`, and Story 3.1 (`Renter Listing Page & Photo Carousel`) deferred it again as "a separate backlog follow-up." The renter `/book/[listingId]` page now exists (shipped in Story 3.1, [`app/(renter)/book/[listingId]/page.tsx`](app/(renter)/book/[listingId]/page.tsx)) so a QR code finally has a real, working scan target. This story replaces the placeholder with a real QR code and a download button.

## Acceptance Criteria

1. **QR placeholder is replaced with a real QR code:** The placeholder `<div>` at [components/listing/posting-assistant-dialog.tsx:241-248](components/listing/posting-assistant-dialog.tsx) (the `aria-hidden="true"` dashed-border block whose text reads `QR code will be generated in Epic 3 (Story 3.1) once the booking page exists.`) is replaced with a new `<BookingQrCode />` component that renders a scannable QR code encoding the `bookingUrl` prop. The surrounding `<section>` layout (booking-link label, `<code>` URL, "Copy link" button) is preserved unchanged. The `TODO: QR code (Story 3.1)` HTML comment is removed.
2. **Component lives in `components/booking/booking-qr-code.tsx`:** A new Client Component (`"use client"`) at `components/booking/booking-qr-code.tsx`. Props interface: `interface BookingQrCodeProps { bookingUrl: string; listingId: string; listingName?: string; }`. The component is exported via a named export `BookingQrCode`. The placement under `components/booking/` (not `components/listing/`) follows the precedent from Story 3.1's `components/booking/listing-photo-carousel.tsx` — booking-link concerns colocate under `booking/` regardless of which surface (operator dialog or renter page) consumes them.
3. **PNG data URL via the `qrcode` npm package:** The component uses `qrcode` (added as a new dependency, see AC #11) to generate a PNG data URL via `QRCode.toDataURL(bookingUrl, options)`. Options: `{ errorCorrectionLevel: "M", margin: 2, width: 256, color: { dark: "#000000", light: "#FFFFFF" } }`. Error correction `M` (≈15% recovery) is the sweet spot for printed scan reliability without inflating the symbol density. Margin 2 modules (the QR spec minimum is 4, but 2 is acceptable for digital display where the surrounding card already provides visual quiet zone). 256px is large enough for crisp printing at 1.5–2 inches square and small enough to render quickly inline.
4. **Async generation with skeleton state:** Generation happens in a `useEffect` triggered by `bookingUrl`. State machine: `{ status: "loading" }` → on success `{ status: "ready", dataUrl: string }` → on error `{ status: "error", message: string }`. While `loading`, render a 160×160px `bg-neutral-100 animate-pulse rounded-md` skeleton block of the same dimensions as the final QR `<img>` so the dialog layout does not jump. On `error`, render the same dashed-border fallback `<div>` from the old placeholder with new copy: `Couldn't generate QR code — use the booking link above.` (text-xs text-destructive) plus the underlying error message in a smaller `<span className="block text-neutral-500">` for debugging. On `ready`, render the QR `<img>` (AC #5).
5. **Rendered QR image:** When `status === "ready"`, render `<img src={dataUrl} alt={qrAltText} width={160} height={160} className="rounded-md border border-neutral-200 bg-white" />`. `qrAltText` is `\`QR code linking to ${listingName ?? "this listing"}'s booking page\`` when `listingName` is provided, else `"QR code for this listing's booking page"`. The displayed size is 160px square (the data URL itself is 256px so it scales down crisply on retina displays).
6. **Download button:** Below the QR image (or below the skeleton/error block — the button is always present), render `<a href={dataUrl ?? "#"} download={\`booking-qr-${listingId}.png\`} className="...">` styled as the project's outline `Button` look-alike. The button label is `Download QR` with the `Download` icon from `lucide-react`. While `status !== "ready"`, the anchor is `aria-disabled="true"`, has `tabIndex={-1}`, and a `pointer-events-none` plus `opacity-50` class so it cannot be activated. Once ready, it becomes a real `<a download>` that triggers a browser save with the filename `booking-qr-${listingId}.png`. Do NOT render the download as a `<Button>` — `<Button>` does not natively support `href` + `download` and wrapping it would lose the native browser save semantics.
7. **Layout inside the booking-link section:** The QR image and Download button sit on the right side of the booking-link section on `md:` and up, with the existing label / `<code>` / "Copy link" button stacked on the left. Use `md:flex md:items-start md:gap-space-4` on the section's inner wrapper, with the QR block as a `md:w-auto md:flex-shrink-0` column. On mobile, the QR stacks below the booking link (default flex-col layout), centered horizontally. The QR block itself uses `flex flex-col items-center gap-space-2` so the image and Download button stay vertically aligned.
8. **Dialog header subtitle update:** Update the dialog's subtitle copy at [components/listing/posting-assistant-dialog.tsx:185-188](components/listing/posting-assistant-dialog.tsx) from `Copy ad text for each classifieds platform and share your booking link.` to `Copy ad text for each classifieds platform, share your booking link, or print the QR code.` This advertises the new capability without restructuring the header.
9. **Pure client surface — no Server Action, no DB writes, no migrations:** This story does NOT add a Server Action. Does NOT add a database migration. Does NOT add a new column. Does NOT add any new env var. The QR is generated client-side from data already present in the dialog (`bookingUrl` and `listingId` are already passed to `PostingAssistantDialog` from the listing detail Server Component).
10. **`listingId` reaches the dialog:** `PostingAssistantDialogProps` is extended with `listingId: string` so the Download button can name the file `booking-qr-${listingId}.png`. The detail page's Server Component at [app/(operator)/listings/[listingId]/page.tsx](app/(operator)/listings/[listingId]/page.tsx) already has `listingId` available (it's the route param). [components/listing/listing-detail-view.tsx](components/listing/listing-detail-view.tsx) already receives the full `listing` object so `listing.id` is in scope; pass `listingId={listing.id}` when rendering `<PostingAssistantDialog>`.
11. **Single new dependency, version pinned:** Add `qrcode` to `dependencies` and `@types/qrcode` to `devDependencies` in [package.json](package.json). Use exact-version pinning (no `^`) consistent with `@marsidev/react-turnstile` at line 22. Recommended versions: `qrcode: "1.5.4"` and `@types/qrcode: "1.5.5"` (current stable as of 2026-04). Run `npm install` to update [package-lock.json](package-lock.json). Justification (must be added to Dev Notes): a hand-written QR encoder requires Reed-Solomon error correction, bit-stream layout, format-info bytes, version selection, and mask pattern evaluation — easily 800+ lines of code that we do not want to maintain. `qrcode` is the canonical library (≈21k weekly downloads, MIT licensed, actively maintained, zero runtime dependencies on its own). `react-qr-code` was considered as a smaller pure-React alternative but its SVG-only output complicates the "Download as PNG" UX, which is the operator's most-requested action (printing).
12. **Tests pass:** New tests (all colocated):
    - `components/booking/booking-qr-code.test.tsx` — covers: (a) renders a skeleton placeholder while loading; (b) on successful `toDataURL`, renders an `<img>` with the returned `data:image/png;base64,...` `src` and the correct `alt` text; (c) on `toDataURL` rejection, renders the error fallback with the error message; (d) the Download anchor's `download` attribute equals `booking-qr-${listingId}.png` after the QR is ready; (e) the Download anchor is `aria-disabled="true"` while loading and lacks `aria-disabled` once ready; (f) when `bookingUrl` changes between renders, `toDataURL` is called again with the new URL and the displayed image src updates. Mock `qrcode` via `vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn() } }))` (or `{ toDataURL: vi.fn() }` depending on how the implementation imports it — keep the mock shape symmetric with the import).
    - `components/listing/posting-assistant-dialog.test.tsx` (existing) — extended with: (a) provide the new required `listingId` prop in every `render()` call; (b) one new test that the dialog renders the QR component (assert via `screen.getByRole("img", { name: /QR code/i })` after the mock resolves) and that the Download button is present; (c) the "old placeholder text" assertion (if any test currently asserts the placeholder text exists) is removed. Mock `qrcode` at the top of this file the same way as in (1) so the existing dialog tests do not flake on real QR generation.
    - `components/listing/listing-detail-view.test.tsx` (existing) — pass the new `listingId` prop through `<PostingAssistantDialog>` (via the existing `bookingUrl` flow). The test that asserts the dialog renders may need a `qrcode` mock at the top of the file as well; if so, add it.
    - Existing test suite still passes. `npm run lint`, `npm run type-check`, `npm run test`, and `npm run build` complete cleanly. Build is environment-blocked if `BWS_SECRETS_TOKEN` is not in the dev agent shell (Story 2.5 / 3.1 precedent — document if blocked).
13. **No regression in the renter-facing flow:** The renter `/book/[listingId]` page is untouched. The listing detail Server Component is touched only to pass `listingId` to `PostingAssistantDialog`. No proxy, RLS, migration, Stripe, Twilio, or auth surface is changed.

## Tasks / Subtasks

- [x] Task 1: Add `qrcode` dependency (AC: #11)
  - [x] 1.1 Edit [package.json](package.json): add `"qrcode": "1.5.4"` to `dependencies` (alphabetical order: between `next-themes` and `react`). Add `"@types/qrcode": "1.5.5"` to `devDependencies` (alphabetical order: between `@types/node` and `@types/react`). Use exact pinning (no `^`) consistent with `@marsidev/react-turnstile`.
  - [x] 1.2 Run `npm install` to refresh `package-lock.json`. Confirm no peer-dependency warnings, no audit warnings of high severity introduced.
  - [x] 1.3 Confirm `node_modules/qrcode/lib/browser.js` and the type declarations under `node_modules/@types/qrcode/` exist. (The `qrcode` package ships separate Node and browser entry points; bundlers pick the browser entry automatically when the import lives in a `"use client"` file. No webpack/turbopack config change needed.)

- [x] Task 2: BookingQrCode component (AC: #2, #3, #4, #5, #6, #7, #12)
  - [x] 2.1 Create `components/booking/booking-qr-code.tsx`. Mark as `"use client"`. Export the `BookingQrCode` component with the props interface in AC #2.
  - [x] 2.2 Implementation:
    ```tsx
    "use client";

    import { Download } from "lucide-react";
    import QRCode from "qrcode";
    import { useEffect, useState } from "react";

    interface BookingQrCodeProps {
      bookingUrl: string;
      listingId: string;
      listingName?: string;
    }

    type QrState =
      | { status: "loading" }
      | { status: "ready"; dataUrl: string }
      | { status: "error"; message: string };

    export function BookingQrCode({
      bookingUrl,
      listingId,
      listingName,
    }: BookingQrCodeProps) {
      const [state, setState] = useState<QrState>({ status: "loading" });

      useEffect(() => {
        let cancelled = false;
        setState({ status: "loading" });
        QRCode.toDataURL(bookingUrl, {
          errorCorrectionLevel: "M",
          margin: 2,
          width: 256,
          color: { dark: "#000000", light: "#FFFFFF" },
        })
          .then((dataUrl) => {
            if (!cancelled) setState({ status: "ready", dataUrl });
          })
          .catch((err: unknown) => {
            if (!cancelled) {
              const message = err instanceof Error ? err.message : "Unknown error";
              setState({ status: "error", message });
            }
          });
        return () => {
          cancelled = true;
        };
      }, [bookingUrl]);

      const altText = listingName
        ? `QR code linking to ${listingName}'s booking page`
        : "QR code for this listing's booking page";

      return (
        <div className="flex flex-col items-center gap-space-2 md:w-auto md:flex-shrink-0">
          {state.status === "loading" && (
            <div
              aria-hidden="true"
              className="h-[160px] w-[160px] animate-pulse rounded-md bg-neutral-100"
            />
          )}
          {state.status === "ready" && (
            <img
              src={state.dataUrl}
              alt={altText}
              width={160}
              height={160}
              className="rounded-md border border-neutral-200 bg-white"
            />
          )}
          {state.status === "error" && (
            <div
              role="alert"
              className="flex h-[160px] w-[160px] flex-col items-center justify-center gap-space-1 rounded-md border border-dashed border-neutral-300 bg-card px-space-2 py-space-2 text-center"
            >
              <p className="text-xs text-destructive">
                Couldn't generate QR code — use the booking link above.
              </p>
              <span className="block text-[10px] text-neutral-500">
                {state.message}
              </span>
            </div>
          )}
          <a
            href={state.status === "ready" ? state.dataUrl : "#"}
            download={`booking-qr-${listingId}.png`}
            aria-disabled={state.status !== "ready"}
            tabIndex={state.status === "ready" ? 0 : -1}
            className={[
              "inline-flex h-9 items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground",
              state.status !== "ready" && "pointer-events-none opacity-50",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Download QR
          </a>
        </div>
      );
    }
    ```
    Notes: the className for the `<a>` mirrors the `outline` button variant from `components/ui/button.tsx` so it visually matches the "Copy link" button. If the project's `Button` component happens to already support `asChild`, an alternative is `<Button asChild variant="outline"><a ...>...</a></Button>` — check `components/ui/button.tsx` first; if `asChild` is wired (it usually is when `@radix-ui/react-slot` is a dep, which it is per [package.json](package.json) line 26), prefer `<Button asChild variant="outline">` for visual consistency. Otherwise use the literal class string above.
  - [x] 2.3 Create `components/booking/booking-qr-code.test.tsx`. At the top of the file:
    ```ts
    import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
    import { render, screen, waitFor } from "@testing-library/react";

    const toDataURLMock = vi.fn();
    vi.mock("qrcode", () => ({
      default: { toDataURL: (...args: unknown[]) => toDataURLMock(...args) },
    }));

    import { BookingQrCode } from "./booking-qr-code";
    ```
    Cover the cases listed in AC #12 bullet 1. For the `bookingUrl` change test, render with `bookingUrl="https://everything.rent/book/a"`, wait for ready, then `rerender` with a different URL and assert `toDataURLMock` was called twice with each URL. Use `await waitFor(() => expect(screen.getByRole("img")).toHaveAttribute("src", "data:image/png;base64,fake"))` to wait for the async state transition.

- [x] Task 3: Wire BookingQrCode into PostingAssistantDialog (AC: #1, #8, #10)
  - [x] 3.1 Edit [components/listing/posting-assistant-dialog.tsx](components/listing/posting-assistant-dialog.tsx). Add `listingId: string` to `PostingAssistantDialogProps` (line 16-25). Destructure `listingId` in the function signature (line 42-46).
  - [x] 3.2 Import `BookingQrCode` from `@/components/booking/booking-qr-code`.
  - [x] 3.3 Update the dialog subtitle (line 185-188) to: `Copy ad text for each classifieds platform, share your booking link, or print the QR code.`
  - [x] 3.4 Replace the placeholder `<div>` block at lines 241-248 with `<BookingQrCode bookingUrl={bookingUrl} listingId={listingId} listingName={listing.name} />`. Remove the `TODO: QR code (Story 3.1)` HTML comment on line 241.
  - [x] 3.5 Restructure the booking-link section's inner layout (lines 201-249) so the existing label / `<code>` / "Copy link" button form a left column and the new `<BookingQrCode>` is the right column on `md:`. Wrap the existing inner contents in a new `<div className="flex-1 flex flex-col gap-space-3">` and add `md:flex md:items-start md:gap-space-4` to the parent `<section>`'s class list (without losing any of the existing classes).

- [x] Task 4: Update the listing detail wiring (AC: #10)
  - [x] 4.1 Edit [components/listing/listing-detail-view.tsx](components/listing/listing-detail-view.tsx) to pass `listingId={listing.id}` when rendering `<PostingAssistantDialog>`. Confirm `listing.id` is already in scope (it should be — the component receives the full listing object).
  - [x] 4.2 No change required at [app/(operator)/listings/[listingId]/page.tsx](app/(operator)/listings/[listingId]/page.tsx) — the dialog is composed by `ListingDetailView`, not the page, and `listing.id` is already on the data passed down.

- [x] Task 5: Test updates (AC: #12)
  - [x] 5.1 Edit [components/listing/posting-assistant-dialog.test.tsx](components/listing/posting-assistant-dialog.test.tsx). Add the `qrcode` mock at the top:
    ```ts
    const toDataURLMock = vi.fn().mockResolvedValue("data:image/png;base64,fake");
    vi.mock("qrcode", () => ({
      default: { toDataURL: (...args: unknown[]) => toDataURLMock(...args) },
    }));
    ```
    Add `listingId: "test-id"` to every `render(<PostingAssistantDialog ... />)` call. Add one new test: `it("renders the QR code and download button in the booking link section", async () => { ... })` that opens the dialog, waits for `screen.getByRole("img", { name: /QR code/i })`, and asserts a `Download QR` link is present with `download="booking-qr-test-id.png"`.
  - [x] 5.2 Search [components/listing/listing-detail-view.test.tsx](components/listing/listing-detail-view.test.tsx) for any `<PostingAssistantDialog>` render and add `listingId` to the props. Add the same `qrcode` mock at the top of the file (it's safe — `vi.mock` is hoisted). If the file does not directly render `PostingAssistantDialog` (it may rely on `<ListingDetailView>` which wraps it), the mock alone is sufficient.
  - [x] 5.3 Remove any test assertion that depends on the old placeholder copy `QR code will be generated in Epic 3 (Story 3.1) once the booking page exists.` — `grep -r "QR code will be generated"` should return zero matches after this story.

- [x] Task 6: Quality gates (AC: #12)
  - [x] 6.1 Run `npm run test` — new tests pass, existing suite still green. Document the final pass count in the Dev Agent Record (e.g., "X / X passing, Y net new").
  - [x] 6.2 Run `npm run lint` clean.
  - [x] 6.3 Run `npm run type-check` clean. No `any`. The QR state machine is a discriminated union. The component imports `QRCode` as the default export — confirm `@types/qrcode` exposes the `toDataURL` overload that takes the options object used in AC #3.
  - [x] 6.4 Run `npm run build`. If blocked by `BWS_SECRETS_TOKEN`, document in the Dev Agent Record.

- [x] Task 7: Sprint status update
  - [x] 7.1 In [_bmad-output/implementation-artifacts/sprint-status.yaml](_bmad-output/implementation-artifacts/sprint-status.yaml): set `2-6-qr-code-for-classifieds-posting` → `done`. Bump `last_updated` to today's date.

## Dev Notes

### Critical Architecture Patterns — MUST Follow

**Named exports only** — `export function BookingQrCode`. The only exception in this story is none — there are no Next.js-mandated default exports here (the component is not a route file). Same precedent as Stories 2.1–2.5.

**File naming:** kebab-case. `booking-qr-code.tsx`, `booking-qr-code.test.tsx`.

**Component naming:** PascalCase — `BookingQrCode`.

**Folder placement:** `components/booking/` — booking-link concerns colocate here regardless of which surface (operator dialog or renter page) consumes them. Matches the precedent set by `components/booking/listing-photo-carousel.tsx` (Story 3.1).

**Client Component:** the QR generator is async and uses `useEffect` + `useState`, so the component is `"use client"`. The placeholder it replaces was inside a Client Component (`PostingAssistantDialog`) so this does not change the server/client boundary.

**No `any`:** the `QrState` discriminated union covers loading / ready / error explicitly. The `err instanceof Error` narrowing avoids `(err as Error).message`.

**Result<T>:** not applicable — this is purely client-side rendering, no Server Action, no data layer.

### Why `qrcode` and not a Hand-Written Encoder

QR encoding is non-trivial:

- **Mode and version selection** — pick numeric / alphanumeric / byte / kanji mode based on input, then size up the symbol to fit.
- **Reed-Solomon error correction codeword generation** — Galois field arithmetic over GF(256) with the QR-spec generator polynomials.
- **Bit-stream layout** — interleave data and ECC codewords into the matrix following the QR spec's zig-zag pattern, skipping function patterns (finder, alignment, timing, format-info, version-info).
- **Mask pattern evaluation** — try all 8 mask patterns, score each against the QR spec's penalty rules, pick the lowest-scoring.

That is roughly 800+ lines of carefully-tested code. The `qrcode` npm package (≈21k weekly downloads, MIT licensed, zero runtime deps of its own, maintained since 2014) is the canonical implementation. The MVP wins from "ship today" outweigh the marginal bundle cost (≈45KB minified, tree-shakable to ≈30KB when only `toDataURL` is used in the browser).

### Why `qrcode` over `react-qr-code` or `qrcode.react`

- `react-qr-code` ships SVG output. SVG is great for crisp display but complicates the "Download as PNG" UX, which is the operator's most-requested artifact for printed flyers, on-equipment stickers, and Facebook Marketplace photo carousels (which require raster images, not SVG).
- `qrcode.react` is a thin React wrapper around `qrcode` that renders to canvas. We would still need a separate code path to convert canvas → PNG data URL for the download. Given that, importing `qrcode` directly and calling `toDataURL` is one line shorter and one fewer transitive dependency.
- `qrcode` directly returns a base64 PNG data URL ready to drop into both `<img src>` and `<a href download>`. Same payload, two uses.

### `qrcode` API Cheat Sheet

```ts
import QRCode from "qrcode";

// Returns Promise<string> — the data URL.
const dataUrl = await QRCode.toDataURL(text, {
  errorCorrectionLevel: "L" | "M" | "Q" | "H", // default "M"
  margin: number, // default 4 (modules of quiet zone)
  width: number,  // pixels of the rendered PNG square (default 200, max 1024-ish)
  color: { dark: string; light: string }, // CSS color strings, default black/white
});
```

We use `errorCorrectionLevel: "M"` (≈15% recovery) — appropriate for clean printed material. `H` (≈30%) is overkill for our use case and increases symbol density (more dots = harder to scan from a phone).

### Browser Bundle Size Note

`qrcode`'s browser entry point pulls in the encoder + the canvas-to-PNG renderer. Bundle impact: ≈30KB minified+gzipped. This is acceptable for an operator-only feature behind a dialog (not loaded for renters). Webpack / Turbopack tree-shake the unused Node-only entry points automatically.

### `<img download>` Browser Compatibility

The `download` attribute on `<a>` is supported in all modern browsers (Chrome 14+, Firefox 20+, Safari 10.1+, Edge 13+). When the `href` is a `data:` URL, browsers do NOT require same-origin; the file downloads with the suggested filename. No CORS, no blob URL juggling, no `URL.createObjectURL` cleanup. Operators on iOS Safari will see a "Save Image" sheet rather than an automatic download — that's fine and matches platform conventions.

### Auto-Open Interaction

The posting assistant dialog auto-opens on `?posted=1` (Story 2.5). The QR component starts loading the moment the dialog mounts — meaning it's ready by the time the operator's eye scans down to the booking-link section. No prefetching is needed; the `useEffect` runs as soon as the dialog body renders.

### What Is Out of Scope

- **Per-platform QR variants** — operators will use the same QR for KSL, Facebook, Craigslist, printed flyers, and stickers. No need to embed UTM parameters per platform in this story. (If we ever want per-platform analytics on scans, that is a future story that adds a tracking redirect at `/qr/[code]` and rewrites `bookingUrl` per platform.)
- **QR generation in the renter-facing flow** — renters do not need a QR for their own booking link. The component is reusable later if we ever want renters to share their pickup confirmation, but no story needs that today.
- **Server-side QR pre-rendering** — generating the QR on the server (`QRCode.toDataURL` works in Node too) and serializing it into the page's HTML would shave the brief loading skeleton, but at the cost of bloating every listing detail page response with a ≈10KB base64 string that 99% of operators will never look at (the dialog only opens on demand). Client-side generation is the right tradeoff.
- **PDF export of a printable flyer** — out of scope. Operators can print the dialog directly via the browser's print menu; if they want a polished one-page PDF flyer with the QR + listing details, that is a future story (call it "Printable listing flyer").
- **Customizing QR colors per operator brand** — operators are getting fixed black-on-white, which is what scanners expect. Brand colors come later, if ever.
- **A QR code on the renter's manage-my-rental page** — not in MVP. Maybe Epic 4 polish.

### Manual Smoke Test (For After Implementation)

1. Open an existing listing detail page (`/listings/{id}`).
2. Click `Posting assistant`.
3. Verify the QR code renders within ≈100ms of the dialog opening (no visible skeleton flash on a fast machine, brief skeleton on a slow one).
4. Scan the QR with a phone camera (iOS Camera app, Android Google Lens, or any scanner). Verify it opens `https://{host}/book/{listingId}` and the renter listing page loads.
5. Click `Download QR`. Verify a file named `booking-qr-{listingId}.png` is saved.
6. Open the downloaded PNG. Verify it is a 256×256 black-on-white QR. Print it. Scan the printout. Confirm it still opens the booking page.
7. Disconnect from the network. Re-open the dialog (the QR is generated client-side so it should still work since the booking URL is already in the props). Confirm the QR still renders.
8. Force the QR generation to fail by mocking `QRCode.toDataURL` to reject in the browser devtools (or by passing a `bookingUrl` of `undefined` via a local edit). Verify the error fallback renders with the dashed border and the destructive-colored copy. Confirm the Download button is `aria-disabled` and visually muted.

### File Manifest (Expected Final Shape)

New files:
- `_bmad-output/implementation-artifacts/2-6-qr-code-for-classifieds-posting.md` (this file)
- `components/booking/booking-qr-code.tsx`
- `components/booking/booking-qr-code.test.tsx`

Modified files:
- `package.json` — add `qrcode: "1.5.4"` to dependencies, `@types/qrcode: "1.5.5"` to devDependencies.
- `package-lock.json` — refreshed by `npm install`.
- `components/listing/posting-assistant-dialog.tsx` — add `listingId` prop, replace placeholder with `<BookingQrCode>`, restructure section layout, update subtitle copy.
- `components/listing/listing-detail-view.tsx` — pass `listingId={listing.id}` to `<PostingAssistantDialog>`.
- `components/listing/posting-assistant-dialog.test.tsx` — add `qrcode` mock, supply `listingId`, add QR-render test, drop placeholder-text assertions.
- `components/listing/listing-detail-view.test.tsx` — add `qrcode` mock and/or `listingId` prop as needed.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — `2-6-qr-code-for-classifieds-posting` → `done`, bump `last_updated`.

No migrations. No new Server Actions. No new env vars. No proxy / RLS changes.

## Dev Agent Record

**Agent:** Claude Opus 4.7 (1M context) via `/bmad-dev-story`
**Date completed:** 2026-04-26

### Completion Notes

- Replaced the placeholder `<div>` in `PostingAssistantDialog` with `<BookingQrCode />`. The QR is generated client-side via `QRCode.toDataURL` (errorCorrectionLevel `M`, margin 2, width 256, black on white) inside a `useEffect` keyed on `bookingUrl`. State machine: `loading` → `ready` / `error`, with a 160×160 skeleton placeholder during `loading`, the rendered `<img>` on `ready`, and a dashed-border error block on `error`.
- The Download button is a real `<a download>` (wrapped via `Button asChild variant="outline" size="sm"`) so the browser's native save flow handles the file. Filename uses `booking-qr-${listingId}.png`. While loading/errored, the anchor is `aria-disabled="true" tabIndex={-1}` and visually muted via `pointer-events-none opacity-50`.
- Restructured the booking-link section so it stacks (default) on mobile and becomes a two-column layout on `md:` (`flex-row md:items-start md:gap-space-4`) — booking-link controls on the left, QR + Download on the right.
- Extended `PostingAssistantDialogProps` with `listingId: string` and threaded it through from `ListingDetailView` (already had `listing.id` in scope).
- Updated the dialog subtitle to advertise QR printing.
- Added `qrcode@1.5.4` (dependency) and `@types/qrcode@1.5.5` (devDependency), exact-pinned to match the `@marsidev/react-turnstile` precedent.
- Test results: full vitest run passes with `--exclude '**/.claude/**'` (the `.claude/worktrees/` directories contain stale pre-existing scratch copies that vitest's default include pattern picks up — these are environment noise, not regressions). 62 / 62 test files pass, 536 / 536 tests pass — net +7 tests in `components/booking/booking-qr-code.test.tsx` and +1 in `components/listing/posting-assistant-dialog.test.tsx`. `npm run lint` (excluding `.claude/`), `npm run type-check`, and `npm run build` all clean.
- Pre-existing test bug fixed in passing: `components/listing/listing-detail-view.test.tsx` was asserting `getByAltText("Honda EU2200i Generator")` but commit `45174cc` (photo-grid) changed alt text to `"{name} photo {N}"` for multi-photo listings. Updated the assertion to match the new alt; the failure existed at baseline and was blocking the "no regressions" gate even without my changes.
- Browser verification: opened the posting assistant on `/listings/181c9c16-...` against the running dev server, confirmed the QR `<img>` renders with a real `data:image/png;base64,…` src, alt text `"QR code linking to 1.1 Ton Mini-Excavator's booking page"`, the Download anchor's `download` attribute is `booking-qr-181c9c16-adf7-44d3-9f2e-5571c5165467.png`, the new subtitle copy renders, and the browser console emitted no errors. Screenshot captured during run.

### File List

New files:
- `components/booking/booking-qr-code.tsx`
- `components/booking/booking-qr-code.test.tsx`

Modified files:
- `package.json` — add `qrcode: 1.5.4` to `dependencies`, `@types/qrcode: 1.5.5` to `devDependencies`.
- `package-lock.json` — refreshed by `npm install`.
- `components/listing/posting-assistant-dialog.tsx` — added `listingId` prop, imported `BookingQrCode`, replaced placeholder, restructured booking-link section to a two-column layout on `md:`, updated subtitle copy.
- `components/listing/listing-detail-view.tsx` — pass `listingId={listing.id}` to `<PostingAssistantDialog>`.
- `components/listing/posting-assistant-dialog.test.tsx` — added `qrcode` mock, supplied `listingId="test-id"` on every render, added one new test asserting the QR `<img>` and Download anchor render with the correct filename.
- `components/listing/listing-detail-view.test.tsx` — added `qrcode` mock; fixed pre-existing alt-text assertion to match the photo-grid rendering.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — `2-6-qr-code-for-classifieds-posting` → `review`.

## Change Log

| Date       | Version | Description                                                | Author                              |
| ---------- | ------- | ---------------------------------------------------------- | ----------------------------------- |
| 2026-04-26 | 0.1     | Initial draft — ready for dev                              | BMad SM                             |
| 2026-04-26 | 1.0     | Implementation complete; status → review                   | Claude Opus 4.7 via `/bmad-dev-story` |
