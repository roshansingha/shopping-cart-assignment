# Shopping cart

A production-style shopping cart built with Next.js (App Router), TypeScript and Zustand. It lists products from [fakestoreapi.com](https://fakestoreapi.com/products) with filtering, search, sorting and pagination, and has a persistent cart with quantity management, cross-tab sync, and an accessible drawer.

- **Live demo:** _add the Vercel URL here after deploying_
- **Where the reasoning lives:** this README is the map. The decisions, measurements and trade-offs are in the documents listed under [Documentation](#documentation).

## Quick start

Requires **Node 24 or newer** and **pnpm 12** (the exact version is pinned in `package.json`).

```bash
pnpm install
pnpm dev            # http://localhost:3000
```

If `pnpm` is not on your PATH, either run `corepack enable` once, or prefix every command below with `corepack`, for example `corepack pnpm dev`.

| Command                        | What it does                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------ |
| `pnpm dev`                     | Development server                                                                   |
| `pnpm build` / `pnpm start`    | Production build and server                                                          |
| `pnpm test`                    | Unit and integration tests (Vitest)                                                  |
| `pnpm coverage`                | Same, with coverage thresholds enforced                                              |
| `pnpm e2e`                     | Browser tests (Playwright + axe). First run: `pnpm exec playwright install chromium` |
| `pnpm smoke <url>`             | HTTP smoke test of a running site, for example the deployed URL                      |
| `pnpm lint` / `pnpm typecheck` | ESLint / TypeScript                                                                  |
| `pnpm format` / `format:check` | Prettier                                                                             |

## Versions

| Tool       | Version       | Tool                      | Version         |
| ---------- | ------------- | ------------------------- | --------------- |
| Node       | 24.18 (>= 24) | Vitest                    | 5.1.0           |
| pnpm       | 12.18.0       | React Testing Library     | 16.3.3          |
| Next.js    | 16.4.6        | MSW                       | 3.0.5           |
| React      | 19.3.0        | Playwright / axe-core     | 1.65.0 / 4.14.0 |
| TypeScript | 5.9.3         | Lighthouse (measurements) | 13.6.0          |
| Zustand    | 5.1.0         | ESLint / Prettier         | 9.39.5 / 3.10.0 |
| Zod        | 4.6.7         | Tailwind CSS              | 4.3.3           |

Next.js 16 differs from earlier versions in ways that matter here (for example `retry` instead of `reset` in `error.tsx`, and `preload` replacing `priority` on `next/image`). The project's `AGENTS.md` tells coding agents to read the bundled docs in `node_modules/next/dist/docs/` first, and that is how those differences were found.

## TypeScript

The whole app, its tests and the mock API are TypeScript in strict mode. The only plain JavaScript is tooling that does not ship: `eslint.config.mjs` and the measurement scripts in `scripts/`, which are small Node scripts run directly, with no build step.

## Architecture

```
src/
  app/                    Routes and layout only (thin glue)
    page.tsx              Listing page: static shell + <Suspense> around the data
    layout.tsx            Skip link, header, single <main>, cart live region
    error.tsx             Error boundary with a retry button
    api/cart-products/    GET: returns only the requested products to the cart drawer
  features/
    products/             Everything about the catalog
      schema.ts           Zod schema: API data is untrusted, price converted to integer cents
      api.ts              fetchProducts with normalized errors (network / http / parse)
      get-products.ts     The one cached upstream call ("use cache", 1 hour)
      query.ts            Pure search, filter, sort and pagination from URL params
      components/         Card, grid + skeleton, filters (client), pagination, section
    cart/                 Everything about the cart
      logic.ts            Pure functions: add, decrement, set, remove, totals (integer cents)
      persistence.ts      Validates localStorage on load; bad data becomes an empty cart
      store.ts            Zustand store + persist + cross-tab sync
      product-details.ts  On-demand lookup of title and price for cart lines only
      components/         Drawer (native <dialog>), stepper, hydrator, live region
  shared/                 money.ts, security-headers.ts
  test/                   Test setup, fixtures, MSW server
e2e/                      Playwright specs and a mock API for deterministic runs
docs/ review/ scripts/    Written deliverables, review exercise, measurement and smoke scripts
```

**How a request flows.** `page.tsx` renders a static shell immediately and streams the product section behind `<Suspense>`. The section calls `getProducts()` (one cached upstream call shared by all visitors), then `queryProducts()` filters, sorts and slices it from the URL parameters, and only the current page of 8 cards is rendered. Filter, search and sort state lives in the URL, so views are linkable and survive reload.

**Where state lives, and why** (full reasoning in [ADR-001](docs/adr-001-state-management.md)):

| State                         | Home                                   | Why                                                                                               |
| ----------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Product catalog (server data) | Server component + Next cache          | One read-only endpoint. No client fetching library needed, and zero client JS for the list.       |
| Filter, search, sort, page    | URL search params                      | Shareable, survives reload, works with back and forward                                           |
| Cart lines                    | Zustand with `persist` (localStorage)  | Synchronous updates, selector subscriptions so only what changed re-renders, built-in persistence |
| Cart product details          | Small Zustand cache, fetched on demand | Keeps page weight independent of catalog size                                                     |

**Rules the structure enforces.** Business logic (`logic.ts`, `query.ts`) is pure and has no React or storage imports, so it is tested without a DOM. Dependencies between features run one way: the cart imports nothing from products (it knows a product only as the small `CartProduct` shape, supplied by the route handler), and products use the cart only through its `QuantityStepper` component, the add button on each card. Money is integer cents everywhere and converted once, at the API boundary.

## Product listing: how it scales to a large catalog

FakeStore returns only 20 products, so the listing is deliberately built so the same design survives 20,000.

- **Fetch once, cache, filter on the server.** `getProducts()` is a `"use cache"` function (1 hour), so every visitor shares one upstream call. Search, category, sort and pagination run on the server per request in pure functions (`features/products/query.ts`). The client receives only the current page (8 cards), not the whole catalog.
- **State lives in the URL** (`?q=&category=&sort=&page=`). Params are untrusted: invalid values fall back to defaults and out-of-range pages clamp.
- **Pagination over infinite scroll.** Pages are plain links: they work without JavaScript, keep the DOM small, give stable URLs, and keep the footer reachable. Infinite scroll would grow the DOM without bound and hurt keyboard and screen-reader use.
- **Search is debounced** (300 ms) before it touches the URL, so typing does not trigger a request per keystroke.
- **What would change with a real backend:** the whole-catalog cache would stop making sense. `queryProducts` would become a call that passes `q`, `category`, `sort` and `page` to the API (server-side filtering and cursor or offset pagination), cached per query. The URL contract and UI stay the same. Revisit ADR-001 then (TanStack Query for client-side server state).
- **The browser never receives the whole catalog.** Only the current page is rendered, and the cart drawer fetches just its own lines on demand. (An earlier version leaked the full list through the header; see finding 1 in [docs/performance-notes.md](docs/performance-notes.md).)
- **Not measured:** the cost of in-memory search and sort at 1,000+ products. At that size it is almost certainly milliseconds, but I have not benchmarked it.
- **Loading, empty and error states:** skeleton grid inside `<Suspense>`, an empty state with a "Clear filters" link, and `error.tsx` with a retry button.

## Cart: edge cases and decisions

| Case                                      | Decision                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rapid clicks                              | Store updates are synchronous functional updates (`set(s => ...)`), so no click is lost. Buttons are not debounced; the cap makes extra clicks harmless.                                                                                                                                                                                          |
| Stock                                     | The API has no stock field. A simulated cap of `MAX_QUANTITY = 10` per line is enforced in pure cart logic. At the cap the `+` button is disabled, a visible message appears, and a live region announces it.                                                                                                                                     |
| Stale tabs                                | A `storage` event listener (`CartHydrator`) rehydrates the store when another tab writes or clears the cart.                                                                                                                                                                                                                                      |
| Corrupted or tampered storage             | Rehydrate validates with a small hand-written validator (`parseStoredCart`; Zod would add ~14 kB of client JS for four checks, see `docs/performance-notes.md`). A cart over 100 lines is rejected too. Wrong shape, bad JSON, negative or over-cap quantities, or a version mismatch all fall back to an empty cart. Duplicate lines are merged. |
| Storage unavailable (private mode, quota) | `safeLocalStorage` swallows errors; the cart keeps working in memory for that tab.                                                                                                                                                                                                                                                                |
| Price changed since added                 | **No price snapshot.** Only `{productId, quantity}` is stored; prices come from the current product data, so the cart total is never stale. Trade-off: the total can change between visits, which is acceptable with no checkout.                                                                                                                 |
| Product details for the drawer            | Looked up on demand via `GET /api/cart-products?ids=…` for only the lines in the cart, and only when the drawer opens, so page weight does not grow with the catalog. A failed lookup shows an error with Try again and hides the total instead of showing a wrong one.                                                                           |
| Product removed upstream                  | The line shows as "Unavailable item" with a Remove button and counts as 0 in the total.                                                                                                                                                                                                                                                           |
| Hydration                                 | The store reads localStorage after mount (`skipHydration`); add buttons are disabled until then, avoiding SSR mismatch and overwriting a saved cart.                                                                                                                                                                                              |

**Deliberately not handled: multi-device sync.** The cart lives in the browser, so a cart built on a phone does not appear on a laptop. Solving it needs accounts and a server-side cart, which is out of scope. Tabs on the same browser do sync.

The cart drawer is a native `<dialog>` opened with `showModal()`, which gives the focus trap, Escape to close and focus return without custom ARIA.

## Responsive design and accessibility

- **Mobile-first grid:** 2 columns by default, 3 from `sm`, 4 from `lg`. The cart drawer is full width on phones and capped at `max-w-md` above that.
- **Landmarks:** a skip link (first focusable element), `header`, a single `main#main-content`, and a `search` form. Pagination is a labelled `nav`. Headings run `h1` (Products), then one `h2` per product card.
- **Focus:** a global 3px `:focus-visible` ring (blue, lighter in dark mode). Both pass 3:1 against their backgrounds.
- **Drawer:** a native `<dialog>` opened with `showModal()`. The browser supplies the focus trap, Escape to close, an inert background and focus return to the Cart button. Page scroll is locked with `body:has(dialog[open])`.
- **Announcements:** one `aria-live="polite"` region announces cart changes ("X added. Quantity 2", "maximum of 10 reached", "X removed"). The result count (`role="status"`) announces filter results.
- **Why little ARIA:** native elements already carry the semantics: `<button>`, `<dialog>`, `<select>`, `<label>`, `<nav>`, `<ul>`. ARIA is used only where they fall short: labels that include the product name on repeated buttons ("Add to cart: Backpack" keeps the visible text inside the accessible name), the live region, `aria-haspopup="dialog"` on the trigger, and a visually hidden "out of 5 stars" on ratings.
- **Other:** skeleton pulse respects `prefers-reduced-motion`; quantity buttons are 40px; product images use `alt=""` because the title is adjacent text.

### How it was checked

- **axe** (WCAG 2 A/AA) runs in the Playwright suite on the listing, the empty state, the open cart drawer with items, and a 320px-wide viewport, with no violations. It also caught two real defects that unit tests could not: button names that did not contain their visible text, and a stray space in the Cart button's name.
- **Contrast** was computed with the WCAG formula. Text pairs range from 5.0:1 to 17.9:1, all above 4.5:1. The first check found form-control borders at 1.5:1 and 1.7:1, below the 3:1 needed for UI component boundaries; they were changed to zinc-500 (4.83:1 on white, 3.67:1 on dark).
- **Keyboard** behaviour is tested in a real browser: the skip link moves focus to main content, Escape closes the drawer and returns focus to the Cart button, and focus stays inside the open drawer.

### Trade-offs made under time pressure

- **No screen-reader testing.** axe and keyboard tests catch a lot but not how VoiceOver or NVDA actually read the page, so announcement wording is untested by ear.
- Cart announcements are generic English strings, not localized.
- Modal scroll lock uses `:has()`, which older browsers ignore. The drawer still works there.
- No manual checks at 200% zoom or on real devices; only the 320px viewport is covered automatically.

## Testing

```bash
pnpm test       # Vitest: unit + integration (172 passing, plus 5 intentional expected-failures, ~5s)
pnpm coverage   # same, with coverage thresholds enforced (about 96% overall)
pnpm e2e        # Playwright (Chromium): builds the app and runs 21 browser tests
```

| Layer       | Tools                                | What it covers                                                                                                                                                                                                                                                                                                             |
| ----------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit        | Vitest                               | Cart logic (zero/negative quantity, removing the last item, cap, large quantities, NaN, rounding, duplicates, immutability), query parsing/sorting/pagination, API client (malformed payload, invalid JSON, 500, network failure), store and persistence (corrupted storage, tab sync, storage failures), security headers |
| Integration | Vitest + React Testing Library + MSW | Listing success, empty, loading and error states; filter, sort, search and pagination; debounced search; hostile content rendered as text; cart add/increase/decrease/remove, cap message, live-region announcements, drawer totals, lookup loading and failure; render isolation                                          |
| E2E         | Playwright + axe                     | Browse and filter via the URL; add, change quantity, confirm totals, reload, confirm persistence; corrupted storage; two-tab sync; keyboard and focus; axe on four views; security headers, zero CSP violations in normal use, and the CSP actually blocking eval, foreign scripts, styles and images                      |

**Why these tools.** Vitest because it is fast and shares config with the build. React Testing Library because it queries by what a user sees (roles and names), which keeps tests from depending on implementation. MSW because it intercepts at the network layer, so the real `fetchProducts` runs unchanged. Playwright because the behaviours that matter most here (two tabs, focus return, a real CSP) cannot be reproduced in a simulated DOM.

- Any request without a mock handler fails the test (verified by `src/test/server.test.ts`), so tests can never silently hit the real API.
- **E2E is deterministic.** The app runs a production build against a local mock API (`e2e/mock-api.ts`, selected with `PRODUCTS_API_URL`) and builds into `.next-e2e`, so it never overwrites a normal build. Only product images still come from `fakestoreapi.com`.
- **`ProductsSection` is an async Server Component.** React Testing Library cannot render it directly, so tests `await` the function and render the returned tree.

### Coverage thresholds and why

- **80% global** (lines, functions, branches, statements): a floor that catches neglected code without rewarding tests of framework glue.
- **95% on `cart/logic.ts`, `cart/persistence.ts` and `products/query.ts`**: this is where money and input handling live, and it is pure, so high coverage is cheap and meaningful.
- Not chased: `app/layout.tsx` and `app/site-header.tsx` are thin Next glue that Playwright exercises end to end. Forcing unit coverage there would test mocks, not behaviour.

### How I know the tests are meaningful (mutation checks)

Coverage shows code ran, not that tests would notice it breaking. Three times I broke the code on purpose, one change at a time, and re-ran the suite:

| Round                                                | Mutations                                                                                                                                                                                        | Caught |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| Cart and money logic (Phase 5)                       | cap removed, zero quantity no longer removes, total ignores quantity, decrement does nothing, `removeItem` keeps the item, stored cap not enforced, `floor` instead of `round`, page not clamped | 8 of 8 |
| Stored-cart validator and render isolation (Phase 6) | five validator conditions removed one at a time; the card subscribing to the whole cart instead of its own quantity                                                                              | 6 of 6 |
| Security protections (Phase 7)                       | image scheme check removed, eval allowed in production, framing allowed, images from any origin, `nosniff` dropped, id validator loosened                                                        | 6 of 6 |

Not done: an automated mutation tool (Stryker). These were manual spot checks of the highest-risk logic, so a mutant in code I did not think to break could still survive.

## Performance

Measured before changing anything (production build, Lighthouse 13.6, mock API for repeatable data). Full method, numbers, trade-offs and mistakes: [docs/performance-notes.md](docs/performance-notes.md).

| Finding                                             | Result                                                                                                                    |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Whole catalog shipped to the browser via the header | 1,000 products: 280.5 kB → 35.5 kB of embedded page data (now flat)                                                       |
| Zod shipped to every browser                        | Client JS 213.0 kB → 185.2 kB gzipped (together with the fix above)                                                       |
| LCP image was lazy-loaded                           | Mobile LCP 2478 → 1648 ms under applied slow-4G throttling (simulated throttling showed no LCP change; both are reported) |
| Every card re-rendering on cart changes (suspected) | Not a problem; verified with a Profiler test, no fix needed                                                               |

Lighthouse scores were already 97 to 100 at this catalog size, so the value of this work is in what would hurt as the catalog grows. The measurements ran on one laptop against a local mock API. Reproduce with `scripts/perf/measure.mjs` and `scripts/perf/lighthouse.mjs`; raw results are in `docs/perf/`.

## Security

Full threat model, controls, the CSP trade-off and the dependency audit: [docs/security-notes.md](docs/security-notes.md).

- **All outside data is treated as untrusted:** API responses (Zod; one bad product rejects the whole list; images must be `https`), URL parameters, localStorage and the `ids` parameter of the cart lookup route are all validated, and a bad cart is discarded rather than half-trusted.
- **No HTML injection path:** API text is rendered only as React text; the source has no `dangerouslySetInnerHTML`, `eval` or `innerHTML`. `next/image` only optimizes the exact `fakestoreapi.com/img/**` pattern.
- **Headers on every route:** CSP, HSTS, `nosniff`, framing denied, referrer and permissions policies. No `unsafe-eval` in production.
- **Known weakness, chosen deliberately:** the CSP allows inline scripts (`'unsafe-inline'`) because the strict alternatives either force fully dynamic rendering (nonces) or broke the app (experimental SRI, 16 of 21 tests failed). Details and when to revisit are in the notes.
- **Dependencies:** `pnpm audit --prod` is clean. One moderate, dev-only finding (`minimatch`, via the lint toolchain) is accepted with reasons. CI fails on any production vulnerability or any high-severity one.

## Code review exercise

[review/CODE_REVIEW.md](review/CODE_REVIEW.md) reviews a deliberately flawed `CartSummary` component in pull-request voice: an XSS hole, index keys with uncontrolled inputs, a fetch race, derived state in an effect, and a single context value. A refactor built on this app's own store sits next to it in `review/examples/`, and one shared test spec proves every claim (the original must fail each test; `pnpm vitest run review`). The flawed component was written for the exercise, not taken from a real codebase.

## Continuous integration and deployment

- **CI** ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs on every push to `main` and on pull requests. One job runs the dependency audit, lint, typecheck, format check and the coverage run (which fails below the thresholds); a second runs the Playwright suite.
- **Deployment:** Vercel, with no environment variables needed (the product API URL is fixed in code). After deploying, run `pnpm smoke https://<your-deployment>`. It checks the listing, pagination, filters, the cart lookup route, image loading, the security headers and 404 handling over plain HTTP, and has already passed 11 of 11 checks against a local production build using the real API.
- **Not yet confirmed from a deployment:** that `fakestoreapi.com` is reachable from Vercel's servers (it sits behind Cloudflare, which challenged one of my `HEAD` requests). If it is blocked, the listing shows its error state; see `developer-log.md` for the fallback plan.

## Documentation

| Document                                                             | What it is                                                                 |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| [docs/adr-001-state-management.md](docs/adr-001-state-management.md) | Options considered for state, the decision, and two later amendments       |
| [docs/performance-notes.md](docs/performance-notes.md)               | What I measured, what I changed, before and after numbers, and my mistakes |
| [docs/security-notes.md](docs/security-notes.md)                     | Threat model, controls, the CSP trade-off, and the dependency audit        |
| [review/CODE_REVIEW.md](review/CODE_REVIEW.md)                       | The code review exercise                                                   |
| [developer-log.md](developer-log.md)                                 | How AI was used: strategy, audit, verification, and disagreement           |
