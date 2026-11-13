# Performance notes

I measured before changing anything. Three real problems turned up, and one suspected problem turned
out not to exist.

Lighthouse already scored 97 to 100 at this catalogue size, so the score is not the headline.
Findings 1 and 2 are about what would hurt as the catalogue and team grow. Finding 3 is a
user-visible load-time gain.

## Summary

### 1. The whole catalogue was sent to the browser

- **Before:** at 1,000 products the page carried 280.5 kB of embedded data.
- **After:** 35.5 kB, and flat however large the catalogue is.
- **Fix:** the cart drawer asks for only the products in the cart, and only when it opens.

### 2. Zod was shipped to every visitor

- **Before:** 213.0 kB of client JavaScript (gzipped).
- **After:** 185.2 kB (−27.8 kB, −13%), together with finding 1.
- **Fix:** a small hand-written validator for the saved cart. Full Zod stays on the server.

### 3. The main product image was lazy-loaded

- **Before:** mobile load time (LCP) of 2478 ms under slow-network throttling.
- **After:** 1648 ms (−33%), five runs each, with no overlap in the ranges.
- **Fix:** preload the first row of images, and mark the first one as high priority.

### 4. Suspected: every product card re-renders when the cart changes

- **Result:** not a problem. Only the changed product re-renders.
- **Action:** none needed. I added a regression test.

## Re-checked on 2026-11-13

After the later changes (header, field styling, saved-catalogue fallback, new routes), I re-measured
the page weight on a production build:

- **Client JavaScript:** 185.4 kB gzipped (was 185.2 kB).
- **Embedded page data:** 37.4 kB at both 10 and 1,000 products. Still flat, and 1.9 kB above the
  Phase 6 figure because of the additions since.
- **Render-isolation test:** still passes.
- **Not re-run:** Lighthouse. The scores in this document are from Phase 6.

## How I measured

- **The app:** a production build (`next build` and `next start`), not dev mode.
- **The data:** a local mock API (`e2e/mock-api.ts`) serving the same fixtures every run, so numbers
  are repeatable. `MOCK_PRODUCT_COUNT=1000` simulates a large catalogue by repeating the fixtures.
- **Page weight:** `scripts/perf/measure.mjs` fetches the page and every script it references. It
  reports gzipped sizes and the size of the server data embedded in the HTML.
- **Lighthouse 13.6** on Chrome, mobile preset, through `scripts/perf/lighthouse.mjs`. Each result is
  the median of 3 to 5 runs. All samples are saved in `docs/perf/*.json`.
- **Re-render counts:** React's `<Profiler>` inside a test (`render-isolation.test.tsx`). A card
  reports a commit only if something inside it re-rendered.
- **Bundle contents:** I tagged each client chunk by searching for library signatures. This is how
  I found Zod. I did not use the interactive `next analyze` viewer.

To reproduce:

```bash
node e2e/mock-api.ts &                       # mock API on :4010
PRODUCTS_API_URL=http://localhost:4010/products pnpm build
PRODUCTS_API_URL=http://localhost:4010/products pnpm start -p 3100 &
node scripts/perf/measure.mjs                # page weight
node scripts/perf/lighthouse.mjs my-label    # Lighthouse, saves to docs/perf/
LH_THROTTLING=devtools LH_FORMS=mobile node scripts/perf/lighthouse.mjs my-label-applied
```

## Finding 1: the catalogue was sent to the browser

**Found.** The page shows 8 products, and the README claimed the browser only receives the current
page. But the site header fetched all products and passed `{id, title, price, image}` for every one
to the cart drawer. Those props were written into every page.

**Diagnosed by.** Lighthouse looked fine at 20 products, so I tested the thing I was claiming. I
built the same code against a 1,000-product mock and measured the page.

**Result.**

| Catalogue      | Embedded page data | HTML (gzipped) |
| -------------- | ------------------ | -------------- |
| 10 products    | 38.7 kB            | 8.3 kB         |
| 1,000 products | **280.5 kB**       | **21.7 kB**    |

That is about 0.24 kB per product on every page view. A 20,000-product catalogue would add roughly
4.8 MB. Nothing in Lighthouse at 20 products would ever show this.

**Changed.**

- The header no longer fetches anything.
- A new route, `GET /api/cart-products?ids=1,2,3`, returns only those products, trimmed to the four
  fields the cart needs. The ids are validated (positive integers, no duplicates, at most 100), and
  bad input gets a 400.
- The drawer loads details only when opened, remembers them, and never asks again for a product it
  already has or one the server said no longer exists.
- Stored carts are limited to 100 lines, so tampered storage cannot create a huge request.

**After:** 35.5 kB at both 10 and 1,000 products. The size no longer depends on the catalogue.

**Trade-offs**

- Opening the drawer costs one small request, so prices appear after a brief "Loading prices…". If
  it fails, the drawer says so, hides the total (instead of showing a wrong one) and offers
  "Try again".
- There is a new endpoint to maintain and keep validated.
- Prices no longer display offline. Before, they came with the page.

## Finding 2: Zod in the client bundle

**Found.** Tagging the client chunks showed one 39.7 kB (gzipped) chunk containing Zod, about 19% of
all JavaScript. It was there only because `cart/persistence.ts` used Zod to validate the saved
cart.

**What I tried, measuring each step**

| Step                                   | Client JS (gzipped)   |
| -------------------------------------- | --------------------- |
| Baseline                               | 213.0 kB              |
| Switch to `zod/mini` (smaller build)   | 199.5 kB (−13.5)      |
| Hand-written validator, plus finding 1 | 185.2 kB (−14.3 more) |

I expected `zod/mini` to remove most of it. It removed about a third, because Zod's core still
shipped (the chunk was still 25.9 kB). So I replaced it with a small hand-written validator. I did
not measure that change and finding 1 separately.

**Trade-off.** We lose the declarative schema, but this is four fields. The validator has 25
dedicated tests, plus the store's corrupted-storage tests. I broke five of its conditions one at a
time, and all five were caught. Zod is still used on the server (`products/schema.ts`), where
bundle size does not matter.

## Finding 3: the main image was lazy-loaded

**Found.** My first Lighthouse runs showed LCP equal to first paint (about 760 ms), but only because
every product image was returning 404. That was a mistake in my test data (see "Mistakes in my own
measurements"). Once images loaded, mobile LCP was about 2.5 s. Lighthouse's "LCP request
discovery" check scored 0: the largest element was the first product image, and it was
`loading="lazy"` with no `fetchpriority`, so the browser found it late.

**Changed**

- `preload` on the first four images (the first row on desktop). In Next 16 this replaces the
  deprecated `priority` prop.
- `fetchPriority="high"` on the first image only. Marking many images high priority makes them
  compete with each other.

**Result** (same code with the fix off and on, 5 Lighthouse runs each, mobile)

| Throttling method | Fix    | LCP         | Speed Index | First paint |
| ----------------- | ------ | ----------- | ----------- | ----------- |
| Applied           | off    | 2478 ms     | 1717 ms     | 1571 ms     |
| Applied           | **on** | **1648 ms** | 1537 ms     | 1463 ms     |
| Simulated         | off    | 2471 ms     | 1424 ms     | 756 ms      |
| Simulated         | on     | 2510 ms     | 760 ms      | 759 ms      |

Individual LCP runs under applied throttling: off 2465, 2447, 2478, 2645, 2666 ms; on 1683, 1646,
1656, 1648, 1647 ms.

**The two methods disagree, and I am reporting both.**

- **Applied throttling** actually slows the browser's network and CPU. LCP improved by a third, and
  the runs do not overlap.
- **Simulated throttling** is Lighthouse's model of slow 4G. LCP did not change, but Speed Index
  roughly halved.
- The trace explains the second result. The preload removed the discovery delay (373 ms down to
  29 ms), but the image was then ready before first paint, so LCP became limited by first paint
  itself.
- I trust the applied result for the LCP claim because it is a real run, not a model. I would still
  re-check on a real device before calling it a win.

**Trade-off.** On a narrow phone, four preloaded images means some are below the fold. Two columns
and a couple of rows are visible on mobile anyway, so I kept the number small instead of computing
it per screen size.

## Finding 4: what I looked at and did not need to change

**Cart changes re-rendering every product card.** I expected this to be the main problem. It is
not. Each card's controls subscribe to only their own product's quantity, so a change re-renders
only that card.

I verified it instead of assuming it:

- `render-isolation.test.tsx` renders eight cards, each wrapped in a `<Profiler>`, changes one
  product, and checks that the other seven did not re-render.
- I then replaced the selector with one that reads the whole cart. Both tests failed, so the test
  would catch a regression.

Also checked:

- Layout shift is 0.
- Total blocking time has medians of 20 to 109 ms (single runs 12 to 253 ms).
- The drawer renders no rows or images while closed, which is also covered by a test.

## Mistakes in my own measurements

- **Broken images in the first runs.** My test data pointed at an image path that does not exist
  (`…_.jpg` instead of `…_t.png`), so every image returned 404. The first before and after pair
  (`before-lighthouse.json`, `after-lighthouse.json`) therefore leaves out image cost.
  - They are comparable to each other, so I kept them for the JavaScript and blocking-time changes
    (mobile blocking time 109 → 57 ms, Speed Index 1274 → 763 ms, transfer 249 → 221 kB).
  - Their LCP numbers (about 760 ms) are not realistic.
  - The 404s also explain a Best Practices score of 96, which is 100 once images load.
  - The image test above was run afterwards with working images.
- **Stale data across builds.** After fixing the test data, the next build still contained the old
  URL, because Next reused cached product data. I deleted the build folder and rebuilt before
  measuring again.
- **Misleading intermediate files** were deleted. `docs/perf/` holds the clean pair plus the four
  image-fix runs.

## Limitations

- Everything ran on one laptop against a local mock API. Real network delays, CDN behaviour and the
  real API's image sizes were not measured.
- The 1,000-product catalogue repeats ten fixtures. It tests how page weight scales, not how search
  or sort behave on large data (see [ADR-002](adr-002-listing-strategy.md)).
- Lighthouse results vary by about ±100 to 200 ms between runs. I used medians of 3 to 5.
- No React DevTools Profiler screenshots. I used the `<Profiler>` API inside a test, which is
  repeatable and stays in the suite.
- I used chunk tagging instead of `next analyze`, and did no real-device testing.
