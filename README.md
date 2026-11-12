# Shopping cart

Next.js (App Router, Cache Components) + TypeScript, Zustand for the cart, Zod for validation.
Full setup, architecture and test docs are completed in Phase 9.

## Commands

```bash
corepack pnpm dev          # dev server
corepack pnpm test         # unit tests
corepack pnpm coverage     # tests + coverage thresholds
corepack pnpm typecheck && corepack pnpm lint
```

## Product listing: how it scales to a large catalog

FakeStore returns only 20 products, so the listing is deliberately built so the same design survives 20,000.

- **Fetch once, cache, filter on the server.** `getProducts()` is a `"use cache"` function (1 hour), so every visitor shares one upstream call. Search, category, sort and pagination run on the server per request in pure functions (`features/products/query.ts`). The client receives only the current page (8 cards), not the whole catalog.
- **State lives in the URL** (`?q=&category=&sort=&page=`). Views are linkable, survive reload, and work with back/forward. Params are untrusted: invalid values fall back to defaults and out-of-range pages clamp.
- **Pagination over infinite scroll.** Pages are plain links: they work without JavaScript, keep the DOM small, give stable URLs, and keep the footer reachable. Infinite scroll would grow the DOM without bound and hurt keyboard and screen-reader use.
- **Search is debounced** (300 ms) before it touches the URL, so typing does not trigger a request per keystroke.
- **What would change with a real backend:** the whole-catalog cache would stop making sense. `queryProducts` would become a call that passes `q`, `category`, `sort` and `page` to the API (server-side filtering and cursor or offset pagination), cached per query. The URL contract and UI stay the same. Revisit ADR-001 then (TanStack Query for client-side server state).
- **Loading, empty and error states:** skeleton grid inside `<Suspense>`, an empty state with a "Clear filters" link, and `error.tsx` with a retry button.

## Cart: edge cases and decisions

| Case                                      | Decision                                                                                                                                                                                                                          |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rapid clicks                              | Store updates are synchronous functional updates (`set(s => ...)`), so no click is lost. Buttons are not debounced; the cap makes extra clicks harmless.                                                                          |
| Stock                                     | The API has no stock field. A simulated cap of `MAX_QUANTITY = 10` per line is enforced in pure cart logic. At the cap the `+` button is disabled, a visible message appears, and a live region announces it.                     |
| Stale tabs                                | A `storage` event listener (`CartHydrator`) rehydrates the store when another tab writes or clears the cart.                                                                                                                      |
| Corrupted or tampered storage             | Rehydrate validates with Zod (`parseStoredCart`). Wrong shape, bad JSON, negative or over-cap quantities, or a version mismatch all fall back to an empty cart. Duplicate lines are merged.                                       |
| Storage unavailable (private mode, quota) | `safeLocalStorage` swallows errors; the cart keeps working in memory for that tab.                                                                                                                                                |
| Price changed since added                 | **No price snapshot.** Only `{productId, quantity}` is stored; prices come from the current product data, so the cart total is never stale. Trade-off: the total can change between visits, which is acceptable with no checkout. |
| Product removed upstream                  | The line shows as "Unavailable item" with a Remove button and counts as 0 in the total.                                                                                                                                           |
| Hydration                                 | The store reads localStorage after mount (`skipHydration`); add buttons are disabled until then, avoiding SSR mismatch and overwriting a saved cart.                                                                              |

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

### Contrast (computed with the WCAG formula)

Text pairs used in the UI: 5.0:1 to 17.9:1, all above 4.5:1 (the lowest is amber-700 on white at 5.02). The first check showed form-control borders at 1.5:1 and 1.7:1, below the 3:1 needed for UI component boundaries. They were changed to zinc-500 (4.83:1 on white, 3.67:1 on dark).

### Trade-offs made under time pressure

- No automated axe run yet (see developer log); contrast was computed by script and the rest reviewed by hand.
- Cart announcements are generic strings, not localized.
- Modal scroll lock uses `:has()`, which older browsers ignore. The drawer still works there.
- No custom focus-return code: relying on native `<dialog>` behaviour means it needs a real-browser check (Playwright, Phase 5).

## Testing

```bash
corepack pnpm test       # Vitest: unit + integration (76 tests, ~3s)
corepack pnpm coverage   # same, with coverage thresholds enforced
corepack pnpm e2e        # Playwright (Chromium): builds the app and runs 14 browser tests
```

First E2E run needs the browser: `corepack pnpm exec playwright install chromium`.

| Layer       | Tools                                | What it covers                                                                                                                                                                                                                                                                                           |
| ----------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit        | Vitest                               | Cart logic (zero/negative quantity, removing the last item, cap, large quantities, NaN, rounding, duplicates, immutability), query parsing/sorting/pagination, API client (malformed payload, invalid JSON, 500, network failure), store and persistence (corrupted storage, tab sync, storage failures) |
| Integration | Vitest + React Testing Library + MSW | Listing success, empty, loading and error states; filter, sort, search and pagination; debounced search; cart add/increase/decrease/remove, cap message, live-region announcements, drawer totals, unavailable products                                                                                  |
| E2E         | Playwright + axe                     | Browse and filter via the URL; add, change quantity, confirm totals, reload, confirm persistence; corrupted storage; two-tab sync; skip link; drawer Escape and focus return; focus trap; axe (WCAG 2 A/AA) on listing, empty state, open drawer and a 320px viewport                                    |

- **MSW** intercepts at the network layer, so the real `fetchProducts` runs unchanged. Any request without a handler fails the test (verified by `src/test/server.test.ts`), so tests can never silently hit the real API.
- **E2E is deterministic.** The app runs a production build against a local mock API (`e2e/mock-api.ts`, selected with `PRODUCTS_API_URL`) and builds into `.next-e2e`, so it never overwrites a normal build. Only product images still come from `fakestoreapi.com`.
- **`ProductsSection` is an async Server Component.** RTL cannot render it directly, so tests `await` the function and render the returned tree.

### Coverage thresholds and why

- **80% global** (lines, functions, branches, statements): a floor that catches neglected code without rewarding tests of framework glue. Current: about 95%.
- **95% on `cart/logic.ts`, `cart/persistence.ts` and `products/query.ts`**: this is where money and input handling live, and it is pure, so high coverage is cheap and meaningful.
- Not chased: `app/layout.tsx`, `app/site-header.tsx` and `page.tsx` are thin Next glue that Playwright exercises end to end. Forcing unit coverage there would test mocks, not behaviour.

### How I know the tests are meaningful (mutation check)

Coverage shows code ran, not that tests would notice it breaking. I temporarily broke the code in 8 ways, one at a time, and re-ran the suite each time:

| Mutation                                         | Result                |
| ------------------------------------------------ | --------------------- |
| Quantity cap removed                             | killed (2 tests fail) |
| Zero quantity no longer removes the line         | killed (3)            |
| Total ignores quantity                           | killed (2)            |
| Decrement does nothing                           | killed (3)            |
| `removeItem` keeps the item                      | killed (2)            |
| Stored-quantity cap not enforced                 | killed (1)            |
| Cents conversion uses `floor` instead of `round` | killed (1)            |
| Out-of-range page not clamped                    | killed (1)            |

All 8 were caught and the originals restored. Not done: an automated mutation tool (Stryker); this was a manual spot check of the highest-risk logic.
