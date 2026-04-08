# Story 1.2: Design System Foundation

Status: done

## Story

As an operator or renter,
I want the application to have a consistent, professional visual identity,
so that every surface feels trustworthy and cohesive.

## Acceptance Criteria

1. **Desert Sunset Color System:** CSS custom properties in `globals.css` define: primary (#E87B35), primary-dark (#C45A2D), primary-light (#F5C4A1), secondary (#4A6178), secondary-dark (#2E3E50), secondary-light (#D5DEE8), success (#3D9A5F), warning (#D4952B), error (#C4392E), and neutral scale (900 #1A1A1A, 700 #4A4A4A, 500 #7A7A7A, 300 #D1D1D1, 100 #F5F5F5, white #FFFFFF)
2. **Typography:** Inter font loaded with `font-display: swap` for weights 400, 500, 600, 700. Typography scale tokens defined (display, h1, h2, h3, body, body-medium, small, caption, price) with mobile-first sizes and desktop overrides at `lg` breakpoint
3. **Spacing:** Spacing scale tokens (space-1 through space-16) follow 4px base / 8-point grid
4. **shadcn/ui Theme:** shadcn/ui theme customized to use Desert Sunset tokens (primary, destructive, border, input, ring colors mapped to new palette)
5. **Button Hierarchy:** 3-tier button hierarchy: Primary (amber fill, 48px min height, one per screen), Secondary (neutral fill, 44px), Ghost (no fill, primary text color)
6. **WCAG AA Contrast:** All primary-on-white text combinations meet WCAG AA contrast (primary-dark #C45A2D used for small text on light backgrounds)
7. **Focus Indicators:** `:focus-visible` outline uses primary-dark 2px solid on all focusable elements

## What Already Exists (from Story 1.1)

The starter scaffold provides a working but **unbranded** design system that must be replaced:

- `app/globals.css` — CSS variables using HSL format with neutral monochrome palette (gray primary, no brand colors)
- `tailwind.config.ts` — Extended colors referencing CSS variables, dark mode via class, tailwindcss-animate plugin
- `app/layout.tsx` — Uses **Geist** font (not Inter), title "Next.js and Supabase Starter Kit", next-themes ThemeProvider
- `components.json` — shadcn/ui with "new-york" style, "neutral" base color
- `components/ui/` — 7 components installed: badge, button, card, checkbox, dropdown-menu, input, label
- Dark mode: fully configured via next-themes (system/class-based) — **KEEP** dark mode infrastructure even though MVP doesn't need it; removing it breaks shadcn/ui components

## Tasks / Subtasks

- [x] Task 1: Replace color system in globals.css (AC: #1)
  - [x] Replace all `:root` CSS custom properties with Desert Sunset palette converted to HSL format for Tailwind compatibility
  - [x] Update `.dark` selector colors to appropriate dark variants (maintain dark mode support)
  - [x] Add semantic color variables: `--success`, `--warning`, `--info` mapped to the spec hex values
  - [x] Add rental lifecycle status color variables for badges
  - [x] Verify no hardcoded color values remain in globals.css
- [x] Task 2: Replace font system (AC: #2)
  - [x] Replace Geist font import in `app/layout.tsx` with Inter from `next/font/google` (weights: 400, 500, 600, 700, `font-display: swap`)
  - [x] Update CSS variable from `--font-geist-sans` to `--font-inter`
  - [x] Update body font-family reference in globals.css or tailwind config
  - [x] Define typography scale as Tailwind utility classes or CSS custom properties (display 28px, h1 24px, h2 20px, h3 18px, body 16px, body-medium 16px/500, small 14px, caption 12px, price 24px/700)
  - [x] Add desktop overrides at `lg` breakpoint (display 36px, h1 30px, h2 24px, price 28px)
  - [x] Write test: verify Inter font CSS variable is applied to document root
- [x] Task 3: Define spacing scale (AC: #3)
  - [x] Add spacing scale to `tailwind.config.ts` extending Tailwind's spacing: space-1 (4px) through space-16 (64px) following 4px base unit
  - [x] Write test: verify custom spacing values resolve correctly in Tailwind config
- [x] Task 4: Customize shadcn/ui theme (AC: #4)
  - [x] Update `tailwind.config.ts` color mappings to reference new Desert Sunset CSS variables
  - [x] Ensure `primary`, `secondary`, `destructive`, `muted`, `accent`, `border`, `input`, `ring` all map correctly
  - [x] Update `components.json` if base color configuration needs changing
  - [x] Verify existing shadcn/ui components (badge, button, card, checkbox, dropdown-menu, input, label) render correctly with new theme
  - [x] Write test: render Button and Card with new theme, verify they don't crash
- [x] Task 5: Implement 3-tier button hierarchy (AC: #5)
  - [x] Modify `components/ui/button.tsx` to add/update variants: `default` (Primary: amber fill, white text, 48px min-h), `secondary` (neutral fill, 44px min-h), `ghost` (no fill, primary text), keep `destructive` and `outline`
  - [x] Add `size` variants if not present: ensure `default` size meets 48px for primary and 44px for secondary
  - [x] Write test: render all 3 button tiers, verify correct classes/styles applied
- [x] Task 6: WCAG AA contrast and focus indicators (AC: #6, #7)
  - [x] Add global `:focus-visible` style in globals.css: `outline: 2px solid` using primary-dark color, `outline-offset: 2px`
  - [x] Audit all color-on-white combinations: primary (#E87B35) on white is 3.4:1 (large text only), primary-dark (#C45A2D) on white is 5.2:1 (AA for all text)
  - [x] Ensure button text uses appropriate contrast colors (white on primary, primary-dark on ghost)
  - [x] Write test: verify focus-visible outline renders on a button element
- [x] Task 7: Update branding and metadata (cleanup)
  - [x] Update `app/layout.tsx` metadata: title to "RentingApp", description to match product
  - [x] Remove Geist font import completely (replaced by Inter in Task 2)
  - [x] Verify `npm run lint`, `npm run type-check`, `npm test`, and `npm run build` all pass

## Dev Notes

### Architecture Compliance

**CSS Variable Format:** shadcn/ui uses HSL format without the `hsl()` wrapper. Example: `--primary: 24 80% 56%` (not `--primary: #E87B35`). Convert all hex values to HSL for compatibility with the existing Tailwind config pattern. The Tailwind config references these as `hsl(var(--primary))`.

**Hex to HSL Conversions (critical reference):**
| Token | Hex | HSL |
|-------|-----|-----|
| primary | #E87B35 | 24 80% 56% |
| primary-dark | #C45A2D | 18 63% 47% |
| primary-light | #F5C4A1 | 25 83% 80% |
| secondary | #4A6178 | 210 24% 38% |
| secondary-dark | #2E3E50 | 210 27% 25% |
| secondary-light | #D5DEE8 | 211 30% 87% |
| success | #3D9A5F | 143 43% 42% |
| warning | #D4952B | 36 67% 50% |
| error | #C4392E | 4 63% 48% |
| neutral-900 | #1A1A1A | 0 0% 10% |
| neutral-700 | #4A4A4A | 0 0% 29% |
| neutral-500 | #7A7A7A | 0 0% 48% |
| neutral-300 | #D1D1D1 | 0 0% 82% |
| neutral-100 | #F5F5F5 | 0 0% 96% |

**Font Change:** The starter uses Geist from `next/font/google`. Replace with Inter. The `next/font/google` import handles `font-display: swap` via the `display` option. Set the CSS variable on `<html>` via className, same pattern the starter uses for Geist.

```typescript
import { Inter } from "next/font/google";
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-inter",
});
```

**Typography Scale Implementation:** Define as Tailwind `fontSize` extension in `tailwind.config.ts` with embedded line-height and font-weight:
```
fontSize: {
  display: ["1.75rem", { lineHeight: "1.2", fontWeight: "700" }],
  h1: ["1.5rem", { lineHeight: "1.3", fontWeight: "700" }],
  h2: ["1.25rem", { lineHeight: "1.3", fontWeight: "600" }],
  h3: ["1.125rem", { lineHeight: "1.4", fontWeight: "600" }],
  body: ["1rem", { lineHeight: "1.5", fontWeight: "400" }],
  "body-medium": ["1rem", { lineHeight: "1.5", fontWeight: "500" }],
  small: ["0.875rem", { lineHeight: "1.4", fontWeight: "400" }],
  caption: ["0.75rem", { lineHeight: "1.4", fontWeight: "400" }],
  price: ["1.5rem", { lineHeight: "1.2", fontWeight: "700" }],
}
```

Desktop overrides at `lg` breakpoint: use `lg:text-display` etc. with responsive values. Define desktop variants:
```
"display-lg": ["2.25rem", { lineHeight: "1.2", fontWeight: "700" }],
"h1-lg": ["1.875rem", { lineHeight: "1.3", fontWeight: "700" }],
"h2-lg": ["1.5rem", { lineHeight: "1.3", fontWeight: "600" }],
"price-lg": ["1.75rem", { lineHeight: "1.2", fontWeight: "700" }],
```

**Spacing Scale:** Extend `tailwind.config.ts` spacing:
```
spacing: {
  "space-1": "4px",
  "space-2": "8px",
  "space-3": "12px",
  "space-4": "16px",
  "space-6": "24px",
  "space-8": "32px",
  "space-10": "40px",
  "space-12": "48px",
  "space-16": "64px",
}
```

**Button Component:** The existing `button.tsx` uses `class-variance-authority` (cva) for variants. Modify the existing variants rather than creating a new component. Keep the cva pattern.

**Dark Mode:** The starter has dark mode via next-themes. Story 1.2 only needs to define reasonable dark mode values — MVP is light-mode only but shadcn/ui components will break if dark mode CSS vars are removed. Keep the `.dark` selector with sensible dark variants of Desert Sunset.

### Anti-Patterns — NEVER do
- `export default` — always use named exports
- `any` type — use proper types or `unknown`
- Hardcoded color values in components — always use CSS variables via Tailwind classes
- Inline styles for colors/spacing — use Tailwind utilities

### Previous Story Intelligence (Story 1.1)

**Key learnings from Story 1.1:**
- ESLint flat config needs explicit ignores (`.next/` was added)
- The starter uses `NEXT_PUBLIC_SUPABASE_ANON_KEY` (was renamed from PUBLISHABLE_KEY)
- Varlock handles env var validation at runtime
- All CI pipeline steps (lint, type-check, varlock scan, test, build) must pass

**Files modified in Story 1.1 that Story 1.2 will also touch:**
- `app/globals.css` — Story 1.2 replaces the entire color system
- `tailwind.config.ts` — Story 1.2 extends with typography and spacing
- `app/layout.tsx` — Story 1.2 replaces font and metadata

### Testing Approach

Story 1.2 is primarily CSS/config changes. Tests should verify:
1. Font CSS variable is applied (render layout, check computed style)
2. Button variants render without crashing (component smoke tests)
3. Tailwind config resolves custom values (unit test the config export)
4. Focus-visible styling is applied (render interactive element, check outline)

Use Vitest + React Testing Library. Tests colocated next to source files per convention.

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 1, Story 1.2]
- [Source: _bmad-output/planning-artifacts/architecture.md — Styling Solution, Component Boundaries, Naming Conventions]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Design System Foundation, Color System, Typography, Spacing, Accessibility]
- [Source: _bmad-output/implementation-artifacts/1-1-initialize-project-with-supabase-nextjs-starter.md — Previous story learnings]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- tailwind-merge strips custom `text-*` classes when combined with other `text-*` utilities — resolved by using arbitrary value `[color:hsl(var(--primary-dark))]` for ghost button text color instead of `text-primary-dark`
- `next/font/google` is a build-time Next.js feature not available in Vitest — mocked via `vi.mock()`

### Completion Notes List

- Replaced entire color system in globals.css: neutral monochrome → Desert Sunset palette (all HSL format)
- Added dark mode variants maintaining shadcn/ui compatibility
- Added semantic colors (success, warning, info) and neutral scale as CSS custom properties
- Replaced Geist font with Inter (400, 500, 600, 700 weights, font-display: swap)
- Defined typography scale in tailwind.config.ts: 9 mobile tokens + 4 desktop overrides
- Defined spacing scale: space-1 (4px) through space-16 (64px) on 4px base grid
- Extended Tailwind colors with primary.dark, primary.light, secondary.dark, secondary.light, success, warning, info, neutral scale
- Updated button.tsx: 3-tier hierarchy (default 48px, secondary 44px, ghost with primary-dark text)
- Added global focus-visible outline using primary-dark 2px solid
- Updated branding: title "RentingApp", Inter font
- All verification passes: 12 tests, lint, type-check, build

### Change Log

- 2026-04-07: Story 1.2 implementation complete — all 7 tasks finished

### File List

**New files:**
- components/ui/button.test.tsx
- app/layout.test.tsx

**Modified files:**
- app/globals.css (complete color system replacement — Desert Sunset palette)
- tailwind.config.ts (typography scale, spacing scale, extended color mappings)
- app/layout.tsx (Geist → Inter font, RentingApp branding)
- components/ui/button.tsx (3-tier button hierarchy with size variants)
