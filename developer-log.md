# Developer log

Running log of decisions, AI use and verification. Add to it as you go, not at the end.

## Strategy

<!-- How I split the work, what I asked the AI for, prompt iterations -->

## Audit

<!-- AI output I reviewed. Record at least 3 corrections, one structural. -->

## Verification

<!-- How I checked it worked: tests, mutation check, manual checks -->

## Disagreement

<!-- A real point where I disagreed with the AI and what I decided -->

## Phase 0 notes

- Stock policy: the API has no stock field, so a simulated per-line cap (`MAX_QUANTITY`) is enforced in cart logic.
- Money is stored as integer cents.
- TODO (reminder): add GitHub Actions CI (lint, typecheck, test).
- TODO: check fakestoreapi.com from a deployed Vercel preview; if blocked, add a caching proxy route handler.

## Phase 2 notes

- Next 16 differences found in the bundled docs, not my memory: error boundaries receive `retry` (not `reset`); `searchParams` is a Promise and must be read inside `<Suspense>` with Cache Components; page props are typed with the global `PageProps<"/">`.
- Lint (react-hooks) rejected writing a ref during render in `Filters`; moved it into an effect.
- Cart add/remove buttons are intentionally left for Phase 3 (placeholder comment in `product-card.tsx`).
- Not yet verified: production server smoke test and visual check in a browser (the command was blocked by the permission classifier).

## Phase 3 notes

- Decision: no price snapshot in storage (see README cart table); ADR-001 already said this.
- Decision: deliberately not handling multi-device sync.
- Native `<dialog>` instead of a hand-built focus trap; revisit if browser support becomes an issue.
- Not yet verified in a real browser: drawer focus return, two-tab sync, live-region announcements. Store-level tests cover persistence, corruption and tab-sync logic; Playwright (Phase 5) should cover the rest.

## Phase 4 notes

- Found by checking my own work: form control borders (zinc-300/700) were 1.5:1 and 1.7:1, failing the 3:1 non-text contrast rule; fixed to zinc-500. Text contrast all passed.
- Found by reading the code: card titles were `h3` directly under `h1` (skipped a level) and page/error each rendered their own `<main>`, which would break the skip-link target. Moved `<main id="main-content">` into the layout; titles are now `h2`.
- ESLint (`no-html-link-for-pages`) rejected a plain `<a href="/">`; switched to `next/link`.
- TODO: axe was NOT run (no browser run this phase). Add `@axe-core/playwright` in Phase 5 and run it on the listing, the open drawer and the empty/error states.
- TODO: manually verify in a browser: skip link, Tab order, drawer focus return, 320px width, 200% zoom, VoiceOver announcements.

## Phase 5 notes (verification)

- Running Playwright for the first time found two real defects my unit tests could not: (1) "Add Product N to cart" violated axe `label-content-name-mismatch` (accessible name did not contain the visible "Add to cart"), now "Add to cart: Product N"; (2) the Cart button's accessible name rendered as "Cart , 3 items" because of an sr-only span, now an explicit `aria-label`. This closes the Phase 4 TODO: axe now runs on listing, empty state, open drawer and 320px width, with no violations.
- Tooling finding: msw 3 renamed `onUnhandledRequest` to `onUnhandledFrame`. TypeScript flagged it; before that the "fail on unmocked requests" guard was silently only warning. Added `server.test.ts` to prove the guard works.
- Tooling finding: RTL async helpers hang under Vitest fake timers, so the debounce tests use real timers (~0.7s).
- Mutation check: 8 deliberate bugs, all caught (table in README). The check only counts if I saw tests fail, so I ran it as a script that restores each file and confirmed the suite is green again afterwards.
- Known gaps: no automated mutation tool; E2E runs on Chromium only; the listing's real-API behaviour (CORS, rate limits) is untested and still a Phase 0 TODO to check from a Vercel preview.
