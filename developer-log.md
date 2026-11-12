# Developer log: AI strategy, audit, verification, disagreement

How AI was used on this project, and how its output was checked. Four required sections first, then the decisions and open items that don't fit them.

> **Reading note.** Sections marked **YOUR INPUT NEEDED** can only be written truthfully by the person who did the work. They are left explicit rather than filled with plausible text. Everything else below is drawn from the project record (the commands run, the numbers measured, the code before and after).

---

## 1. AI strategy

### What context the AI was given

- **The assignment brief**, in full, and a **phase plan** (Phases 0 to 9 with time estimates, the deliverables checklist, and a "risks to watch" list). The plan carried the constraints: TypeScript, feature-based folders, integer cents for money, "decide the stock policy deliberately", "pick one edge case to deliberately not handle", and "don't claim a performance win without a before measurement".
- **A project instruction file (`AGENTS.md`)** warning that this Next.js version has breaking changes and that the bundled docs in `node_modules/next/dist/docs/` must be read before writing code. This mattered repeatedly (see Audit, entry 7).
- **A one-phase-at-a-time loop.** Each phase was requested separately, and each ended with the AI reporting what was built, which checks ran, and what was _not_ verified, before the next phase started.

### How the prompting differed by task

| Task type                 | How the AI was directed                                                                                                                                                                                                                            |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture (ADR, state) | Options and constraints were given up front (Context vs Redux Toolkit vs Zustand vs Jotai, plus "separate server state"); the decision was written down while the trade-offs were fresh, then **amended** when later measurements contradicted it. |
| Implementation            | Pure logic first (cart functions, query parsing, schemas), then UI on top, so each layer was testable before the next existed.                                                                                                                     |
| Tests                     | Strategy first (which layer proves which claim, coverage thresholds and why), then tests, then a **mutation check** to prove the tests could fail.                                                                                                 |
| Performance and security  | **Measure first, change second.** The AI was required to produce before numbers, and to report findings that did not support the plan's assumptions.                                                                                               |

### An example of a prompt that had to be iterated

**YOUR INPUT NEEDED.** The conversation record contains no prompt that was rewritten because its first version produced poor output, so none is invented here. If you iterated on a prompt (for example the first attempt at an ADR, an accessibility request, or a test request that produced trivially-passing tests), describe it here: the first prompt, what was wrong with the result, and what you changed.

### Where the AI pushed back on the plan

The plan said: if fakestoreapi.com is blocked from Vercel, build a route handler that proxies and caches it. The AI's response was that this would not help: the proxy would run on the same Vercel network that is blocked, and CORS is irrelevant because the app fetches on the server. What would help is a committed snapshot of the data used as an explicit fallback. This was recorded, not built, because it is only needed if the deployed check fails. (Evidence behind it: a `HEAD` request to the API got `403 cf-mitigated: challenge` from Cloudflare, while `GET` returned 200.)

---

## 2. Human audit

Each entry below is a case where AI-written output was wrong, weak or risky, and was changed. **How each was caught is stated honestly:** by a test, a tool or a measurement that the workflow required. Where you personally spotted or rejected something in review, add it, or edit an entry to say so.

Entries are tagged **[structural]** (architecture, performance, security) or **[local]**. The assignment asks for at least three, with at least one structural. There are eight.

### 1. [structural, performance] The header shipped the whole product catalog to the browser

Caught by: building against a 1,000-product mock after Lighthouse looked fine at 20 products.

```tsx
// Before: src/app/site-header.tsx. Every product's data was serialised into every page.
export async function SiteHeader() {
  const products = (await getProducts()).map(({ id, title, price, image }) => ({
    id,
    title,
    price,
    image,
  }));
  return (
    <header>
      … <CartDrawer products={products} productsUnavailable={unavailable} /> …
    </header>
  );
}

// After: the header fetches nothing. The drawer asks for only the cart's own lines, once opened.
export function SiteHeader() {
  return (
    <header>
      … <CartDrawer /> …
    </header>
  );
}
// cart-drawer.tsx:  useEffect(() => { if (open) void load(idsKey.split(",").map(Number)); }, …)
//                   -> GET /api/cart-products?ids=1,2  (validated: positive integers, max 100)
```

Evidence: embedded page data at 1,000 products fell from **280.5 kB to 35.5 kB**, and now stays flat as the catalog grows. The README had claimed the browser only received the current page, so this was also a documentation claim the code did not meet.

### 2. [structural, security] The product schema accepted dangerous URL schemes

Caught by: asking "what does `z.url()` actually allow?" during the security phase.

```ts
// Before: accepts javascript:, data: and file: URLs
image: z.url(),

// After: https only. Verified against all 20 real products before tightening.
image: z.url({ protocol: /^https$/ }),
```

Evidence: 7 new tests (`javascript:`, `data:`, `file:`, plain `http`, protocol-relative, not-a-URL, empty). Removing the restriction makes 6 tests fail.

### 3. [structural, performance] Zod was shipped to every browser to validate four fields

Caught by: tagging the client JavaScript chunks by library, which showed a 39.7 kB (gzipped) chunk containing Zod.

```ts
// Before: persistence.ts (ships to the browser)
import { z } from "zod";
const storedSchema = z.object({ lines: z.array(z.object({ productId: z.number().int().positive(), … })) });

// After: small hand-written validator; Zod stays server-side only
const isValidLine = (l: unknown) =>
  isRecord(l) && Number.isInteger(l.productId) && (l.productId as number) > 0 && … ;
```

The first fix was also wrong: switching to `zod/mini` was expected to remove most of it but removed only about a third (213.0 to 199.5 kB), because Zod's core still shipped. Measuring each step, instead of assuming, is what led to the hand-written version (final: 213.0 to 185.2 kB, together with entry 1). Covered by 25 tests, each condition mutation-checked.

### 4. [structural, performance] The LCP image was lazy-loaded

Caught by: Lighthouse's "LCP request discovery" check scoring 0, once broken test images were fixed (see "Wrong turns" below).

```tsx
// Before: all 8 card images were loading="lazy", including the first row
<Image src={product.image} alt="" fill sizes="…" />

// After: first row preloaded, the single LCP candidate gets high fetch priority
<Image src={product.image} alt="" fill sizes="…" preload={preload} fetchPriority={highPriority ? "high" : undefined} />
```

Evidence (5 runs each, applied throttling): mobile LCP **2478 ms to 1648 ms**, with non-overlapping ranges. Under Lighthouse's default simulated throttling the LCP did not change (Speed Index did), and both results are reported in `docs/performance-notes.md`.

### 5. [local, accessibility] Button names did not contain their visible text

Caught by: the first axe run in a real browser (`label-content-name-mismatch`). Unit tests could not see it.

```tsx
// Before: visible text "Add to cart", accessible name "Add Backpack to cart"
aria-label={`Add ${title} to cart`}
// After: the visible text is inside the name, so voice control ("click Add to cart") works
aria-label={`Add to cart: ${title}`}
```

The same run found the Cart button's name read "Cart , 3 items" (a stray space from a screen-reader-only span); fixed with an explicit `aria-label`.

### 6. [local, testing] The guard against unmocked network calls was silently not working

Caught by: TypeScript flagging an unknown option after a test-library upgrade.

```ts
// Before: msw 3 renamed this option, so it was ignored and unmocked requests only warned
server.listen({ onUnhandledRequest: "error" });
// After: plus a test that proves a request without a handler really does fail
server.listen({ onUnhandledFrame: "error" });
```

### 7. [local, framework] Deprecated and renamed Next.js 16 APIs

Caught by: following the project instruction to read the bundled docs rather than trust memory. `error.tsx` receives `retry`, not `reset`; `priority` on `next/image` is deprecated in favour of `preload`; `searchParams` is a Promise that must be read inside `<Suspense>` with Cache Components.

### 8. [structural, resilience] One refused request failed the whole deploy

Caught by: the first real Netlify build, which failed (`Product service returned 403`, `Error occurred prerendering page "/"`). This had been predicted in Phase 0 and in the "Where the AI pushed back on the plan" note above, but nothing had been built, because it could only be tested on a deployed host.

```ts
// Before: any API failure (here a 403 from Cloudflare) propagated and failed the prerender
export async function getProducts() {
  "use cache";
  cacheLife("hours");
  return fetchProducts(fetch, process.env.PRODUCTS_API_URL);
}

// After: expected API failures serve a committed, schema-validated catalog, labelled as such,
// and cached for minutes so live data returns quickly. Real bugs are still rethrown.
export async function getProducts(): Promise<ProductsResult> {
  "use cache";
  try {
    const products = await fetchProducts(fetch, process.env.PRODUCTS_API_URL);
    cacheLife("hours");
    return { products, source: "live" };
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    cacheLife("minutes");
    return { products: getFallbackProducts(), source: "fallback" };
  }
}
```

Verification: the failure was **reproduced locally first** by pointing the build at a mock that returns 403 (same error as Netlify), then the fix was shown to make that same build succeed and serve 8 cards with the notice. Smoke test 11/11 in that state. Five mutants (no fallback, fallback cached for an hour, bugs masked as outages, fallback labelled live, notice removed) were all caught. Deliberately not done: sending a browser-like User-Agent to get past Cloudflare, since that is evading the API owner's bot protection.

---

## 3. Verification

### How AI helped generate tests for edge cases

The AI wrote the unit, integration and end-to-end tests from edge-case lists (zero and negative quantity, removing the last item, large quantities, NaN, rounding, duplicate adds, corrupted storage, API 500 / network failure / malformed payloads, hostile URL parameters and hostile API text). Edge cases came from the plan's checklist plus cases the AI added while building each layer.

### How I checked the tests were meaningful, not trivially passing

Passing tests prove little; the question is whether they would _fail_ when the code is wrong. Methods used, with results:

| Method                                                      | What it proved                                                                                                                                                                                                                       |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Mutation checks**, three rounds, done by hand             | Breaking the code on purpose, one change at a time: cart and money logic (8 of 8 caught), stored-cart validator and render isolation (6 of 6), security protections (6 of 6). Each mutant was restored and the suite re-run green.   |
| **`it.fails` against a known-bad component**                | The code review exercise runs one spec against a flawed component (must fail all 5) and its refactor (must pass). The failures were then read as ordinary tests to confirm they failed for the _stated_ reasons, not harness errors. |
| **Render-isolation test, then broken on purpose**           | A Profiler test shows only the changed product re-renders; replacing the selector with a whole-cart one made it fail.                                                                                                                |
| **Negative control for the smoke test**                     | Pointed at a port with nothing listening, it fails all 11 checks and exits non-zero.                                                                                                                                                 |
| **Coverage thresholds with reasoning**                      | 80% global, 95% on the pure money and input logic. Current: about 96%. Coverage is treated as a floor, not as proof.                                                                                                                 |
| **Real-browser tests for what a simulated DOM cannot show** | Two-tab sync, focus return, axe, and the real CSP. These found defects unit tests could not (entries 5 and the CSP traps below).                                                                                                     |

### Tests that passed or failed for the wrong reason (caught, not hidden)

- **"eval is blocked" reported "allowed"** even though the CSP header was correct. Playwright's `page.evaluate()` runs over the DevTools protocol, which disables the eval restriction, and a script appended inside that call also runs inside it. Confirmed with a throwaway script (`EvalError` when run from a timer), then the test was rewritten.
- **A mutant that silently did nothing:** a script's search pattern did not match after the formatter changed the line. The "PATTERN MISSING" message was noticed and that mutant re-run by hand instead of being counted as caught.
- **A wrong expected value:** a test expected a total of `$4.00` where the fixtures give `$40.00`. The arithmetic was checked and the test fixed, not the code.
- **A failure only CI could show:** the first GitHub Actions run failed at `pnpm typecheck` (`Cannot find name 'LayoutProps'` / `'PageProps'`). Next.js generates those global types into `.next/types` during a build or dev run, so they existed on the developer machine and not on a fresh checkout. Reproduced locally by moving the generated folders aside, fixed by running `next typegen` before `tsc` in the `typecheck` script, then every CI step was run from that clean state to find any other hidden dependency on local build output (none).
- **My own broken measurements:** fixture image URLs returned 404, so the first Lighthouse runs left out image cost and showed an unrealistic LCP. It surfaced because Best Practices scored 96 with a console error. Documented in the performance notes; those runs are kept only for the JavaScript-driven metrics.

### What has NOT been verified

- The fix for the Netlify 403 is verified locally against a simulated block, not yet on Netlify itself. **Product images** (also served by fakestoreapi.com through the host's image optimizer) may be refused too; check after redeploying and run `pnpm smoke <url>`.
- GitHub Actions has never run; confirm it is green after the first push.
- No screen-reader testing (VoiceOver or NVDA); no real-device or 200% zoom checks.
- Playwright runs Chromium only.
- In-memory search and sort have not been benchmarked at 1,000+ products.

---

## 4. A disagreement

**YOUR INPUT NEEDED.** The assignment asks for an instance where the AI suggested something you did not go with, and your reasoning. Nothing in the project record is a substantive override, so none is invented here. Two small, real instances exist that you can use only if they match what you actually thought:

1. After the performance phase, the AI offered to benchmark the in-memory search and sort at 1,000 and 10,000 products, and asked whether to do that or move on. You chose to move on to the security phase. It is still unmeasured (listed above).
2. The AI flagged `alt=""` on product images as a decision for you (the title is adjacent text, but a stricter reviewer may want descriptive alt text). No decision was recorded.

If you have a real disagreement (an architecture choice, a library, a test style, a design call), replace this section with it: what the AI suggested, what you did instead, and why.

---

## Decisions and open items

**Decisions with reasons** (details in the README and docs):

- **Stock policy:** the API has no stock field, so a simulated cap of 10 per line is enforced in the pure cart logic and shown with a visible, announced message.
- **Money:** integer cents everywhere, converted once at the API boundary.
- **No price snapshot in the cart:** only product id and quantity are stored; prices come from fresh product data, so a total is never stale.
- **Deliberately not handled:** multi-device cart sync (needs accounts and a server-side cart).
- **CSP:** allows inline scripts (`'unsafe-inline'`). Nonces force dynamic rendering and undo the performance work; the experimental SRI mode was tried and broke the app (16 of 21 tests failed). Documented as a known weakness, with when to revisit, in `docs/security-notes.md`.
- **Dependency audit:** one moderate, dev-only finding (`minimatch`) accepted because no compatible patched release exists; CI fails on any production or high-severity finding.

**Still to do before submitting:**

1. Fill in the two **YOUR INPUT NEEDED** sections above.
2. Commit and push; confirm GitHub Actions is green.
3. Redeploy to Netlify, then run `pnpm smoke https://<your-url>` and re-check the response headers and product images.
4. Put the live URL at the top of the README.
5. If product images are blocked on the host, consider bundling the 20 images in `public/` for fallback mode.
