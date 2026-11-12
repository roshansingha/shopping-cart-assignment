# Performance notes

## Summary

I measured before changing anything. Three real problems turned up, and one suspected problem turned out not to exist.

| #   | Finding                                                                                                                                                                      | Evidence (before → after)                                                                                                                                  | Fix                                                                                                           |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1   | The header sent the **whole product catalog** to the browser so the cart drawer could look up prices. Page data grew with the catalog even though only 8 products are shown. | 10 products: 38.7 kB → 36.3 kB of embedded page data. **1,000 products: 280.5 kB → 35.5 kB** (now flat). HTML gzipped at 1,000 products: 21.7 kB → 8.0 kB. | The drawer asks `GET /api/cart-products?ids=…` for only the products in the cart, and only once it is opened. |
| 2   | **Zod was shipped to every browser** to validate four fields of the localStorage cart.                                                                                       | Client JS (gzipped): 213.0 kB → 199.5 kB with `zod/mini` → **185.2 kB** with the hand-written validator plus finding 1 (−27.8 kB, −13%).                   | Hand-written validator in `cart/persistence.ts`; full Zod stays server-side.                                  |
| 3   | The **LCP image was `loading="lazy"`**, so the browser found it late.                                                                                                        | Mobile LCP under applied slow-4G throttling: **2478 ms → 1648 ms (−33%)**, 5 runs each, ranges don't overlap. Speed Index (simulated): 1424 → 760 ms.      | `preload` on the first row of images, `fetchPriority="high"` on the first one only.                           |
| 4   | _Suspected:_ every product card re-renders when the cart changes.                                                                                                            | **Not a problem.** Only the changed product re-renders.                                                                                                    | None needed. Added a regression test.                                                                         |

Lighthouse scores were already 97–100 at this catalog size, so the headline is not the score. Findings 1 and 2 are about what would hurt as the catalog and team grow; finding 3 is a user-visible load-time gain.

## How I measured

- **App:** production build (`next build` + `next start`), not dev mode.
- **Data:** a local mock API (`e2e/mock-api.ts`) serving the same fixtures every run, so numbers are repeatable. `MOCK_PRODUCT_COUNT=1000` simulates a large catalog by repeating the fixtures.
- **Page weight:** `scripts/perf/measure.mjs` fetches the page, then every script it references, and reports gzipped sizes plus the size of the inlined React Server Components payload (the server data serialised into the HTML).
- **Lighthouse 13.6** on Chrome, mobile preset, via `scripts/perf/lighthouse.mjs`. Each configuration is the **median of 3–5 runs**; all samples are saved in `docs/perf/*.json`.
- **Re-render counts:** React's `<Profiler>` inside a Vitest test (`render-isolation.test.tsx`). A commit is reported for a card only if something inside it re-rendered.
- **Bundle composition:** I tagged each client chunk by searching for library signatures (this is how I found Zod). I did not use the interactive `next analyze` viewer.

Reproduce:

```bash
node e2e/mock-api.ts &                                   # mock API on :4010
PRODUCTS_API_URL=http://localhost:4010/products pnpm build
PRODUCTS_API_URL=http://localhost:4010/products pnpm start -p 3100 &
node scripts/perf/measure.mjs                            # page weight
node scripts/perf/lighthouse.mjs my-label                # Lighthouse, writes docs/perf/my-label-lighthouse.json
LH_THROTTLING=devtools LH_FORMS=mobile node scripts/perf/lighthouse.mjs my-label-applied
```

## Finding 1: the catalog was shipped to the browser (structural)

**What I found.** The page I had built shows 8 products, and the README claimed the browser only receives the current page. But the site header (a Server Component) fetched all products and passed `{id, title, price, image}` for every one of them to the cart drawer, a Client Component, so those props were serialised into every page. I found it because the initial Lighthouse run looked fine, so I tested the thing I was claiming: I built the same code against a 1,000-product mock.

| Catalog size   | Embedded page data (raw) | HTML (gzipped) |
| -------------- | ------------------------ | -------------- |
| 10 products    | 38.7 kB                  | 8.3 kB         |
| 1,000 products | **280.5 kB**             | **21.7 kB**    |

That is about 0.24 kB per product on _every_ page view, so a 20,000-product catalog would add roughly 4.8 MB. Nothing in Lighthouse at 20 products would ever show this.

**What I changed.**

- The header no longer fetches anything.
- New route `GET /api/cart-products?ids=1,2,3` returns only those products, trimmed to the four fields the cart needs. `ids` is validated (positive integers only, no duplicates, at most 100) and bad input gets a 400.
- The drawer loads missing product details only when opened, remembers them, and never re-requests a product it already has or one the server said no longer exists.
- Stored carts are limited to 100 lines (`MAX_LINES`), so tampered storage cannot produce a huge request.

**After:** 35.5 kB at both 10 and 1,000 products. The size no longer depends on the catalog.

**Trade-offs.**

- Opening the drawer now costs one small request, so prices appear after a brief "Loading prices…" state. If the request fails, the drawer says so, hides the total (rather than showing a wrong one) and offers "Try again".
- There is a new endpoint to maintain and keep validated.
- The cart no longer works offline for price display. Before, prices came from the page itself.

## Finding 2: Zod in the client bundle

**What I found.** Tagging the client chunks showed one 39.7 kB (gzipped) chunk containing Zod, about 19% of all JavaScript. It was there only because `cart/persistence.ts` used Zod to validate the localStorage cart.

**What I tried, in order, measuring each time.**

| Step                                           | Client JS (gzipped)   |
| ---------------------------------------------- | --------------------- |
| Baseline                                       | 213.0 kB              |
| Switch to `zod/mini` (the tree-shakable build) | 199.5 kB (−13.5)      |
| Hand-written validator, plus finding 1         | 185.2 kB (−14.3 more) |

I expected `zod/mini` to remove most of it. It removed about a third: Zod's core still shipped (the chunk was still 25.9 kB). So I replaced it with a small hand-written validator. I did not measure the last two changes separately.

**Trade-off.** Losing the declarative schema is a cost for a bigger shape, but this is four fields, and the validator is covered by 25 dedicated tests (plus the store's corrupted-storage tests). I mutation-checked it by breaking five of its conditions one at a time; all five were caught. Full Zod is still used on the server (`products/schema.ts`) where bundle size does not matter, and the ADR still holds: API data and persisted state are both validated.

## Finding 3: the LCP image was lazy-loaded

**What I found.** My first Lighthouse runs reported LCP equal to FCP (about 760 ms) because **every product image was returning 404**: a mistake in my test data, not the app (details in "Mistakes in my own measurements"). Once images actually loaded, mobile LCP jumped to about 2.5 s. Lighthouse's "LCP request discovery" check scored 0: the LCP element was the first product image, it had `loading="lazy"`, no `fetchpriority`, and was not discoverable from the initial HTML.

**What I changed.**

- `preload` on the first four images (the first row on desktop). In Next 16 this replaces the deprecated `priority` prop.
- `fetchPriority="high"` on the first image only. Marking many images high priority makes them compete.

**A/B result** (same code with the fix switched off and on, 5 Lighthouse runs each, mobile):

| Method               |        | LCP         | Speed Index | FCP     |
| -------------------- | ------ | ----------- | ----------- | ------- |
| Applied throttling   | off    | 2478 ms     | 1717 ms     | 1571 ms |
| Applied throttling   | **on** | **1648 ms** | 1537 ms     | 1463 ms |
| Simulated throttling | off    | 2471 ms     | 1424 ms     | 756 ms  |
| Simulated throttling | on     | 2510 ms     | 760 ms      | 759 ms  |

Individual LCP samples under applied throttling: off 2465, 2447, 2478, 2645, 2666 ms; on 1683, 1646, 1656, 1648, 1647 ms.

**These two methods disagree and I am reporting both.** Under _applied_ throttling (the browser's network and CPU are actually slowed) LCP improved by a third and the samples do not overlap. Under Lighthouse's default _simulated_ throttling (a model of slow 4G), LCP did not change, but Speed Index roughly halved. The trace explains the second result: the preload fixed the discovery delay (resource load delay 373 ms → 29 ms), but the image was then ready before the first paint, so LCP became bounded by first paint itself. I trust the applied result for the LCP claim because it is a real run rather than a model. I would still re-check on a real device before calling it a win.

**Trade-off.** On a narrow phone, four preloaded images means some are below the fold. Because 2 columns × a couple of rows are visible on mobile anyway, I kept the number small rather than computing it per breakpoint.

## Finding 4: what I looked at and did not need to change

**Cart changes re-rendering every product card.** I expected this to be the main problem. It is not: each card's controls subscribe to only their own product's quantity (`selectQuantity(productId)`), so a change re-renders only that card. I verified it rather than assuming it:

- `render-isolation.test.tsx` renders eight cards, each in a `<Profiler>`, changes one product, and asserts the other seven did not commit.
- I then replaced the selector with one that reads the whole cart: both tests failed. So the test would catch a regression.

Also checked: cumulative layout shift is 0, total blocking time has medians of 20–109 ms (individual runs 12–253 ms), and the drawer renders no rows or images while closed (also asserted in a test).

## Mistakes in my own measurements

- **Broken images in the first runs.** My fixtures pointed at an image path that does not exist upstream (`…_.jpg` instead of `…_t.png`). Every image returned 404, so the first before/after Lighthouse pair (the files `before-lighthouse.json` and `after-lighthouse.json`) excludes image cost. They are comparable to _each other_, which is why they are kept for the JavaScript and blocking-time changes (mobile TBT 109 → 57 ms, Speed Index 1274 → 763 ms, transfer 249 → 221 kB), but their LCP numbers (about 760 ms) are not realistic. The console error also explains the Best Practices score of 96, which is 100 once images load. The image A/B above was run afterwards with working images.
- **Stale data across builds.** After fixing the fixture, the next build still contained the old URL because Next reused cached product data. I deleted the build folder and rebuilt before measuring again.
- **Intermediate Lighthouse files** that were misleading or superseded were deleted. What remains in `docs/perf/` is the clean pair plus the four A/B runs.

## Limitations

- Everything ran on one laptop against a local mock API. Real network latency, CDN behaviour and the real API's image sizes were not measured.
- The 1,000-product catalog repeats ten fixtures. It tests payload scaling, not search or sort cost on large data.
- Lighthouse results vary by roughly ±100–200 ms between runs; I used medians of 3–5 and report spread where it matters.
- No React DevTools Profiler screenshots: I used the `<Profiler>` API in a test instead, so the result is repeatable and guarded.
- I used chunk tagging rather than `next analyze`, and did no real-device testing.
