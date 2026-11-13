# Developer log: AI strategy, audit, verification, disagreement

How AI was used on this project, and how its output was checked. Four required sections first,
then the decisions and open items that don't fit them.

> **Reading note.** Where an entry says what happened, the evidence (a test, a measurement or
> the code) is named next to it.

---

## 1. AI strategy

### What context the AI was given

- **The assignment brief**, in full, and a **phase plan** (Phases 0 to 9 with time estimates, the
  deliverables checklist, and a "risks to watch" list). The plan carried the constraints:
  TypeScript, feature-based folders, integer cents for money, "decide the stock policy
  deliberately", "pick one edge case to deliberately not handle", and "don't claim a performance
  win without a before measurement".
- **Standing constraints,** all of which the code follows:
  - TypeScript, with no `any` in the app code.
  - Feature-based folders (`features/products`, `features/cart`, `shared`).
  - Money as integer cents, converted once at the API boundary.
  - Validation at every boundary: API responses with Zod, URL parameters by allow-list, and saved
    cart data with a validator (Zod at first, then hand-written to keep it out of the browser
    bundle; see audit entry 3).
  - pnpm, with the version pinned and a frozen lockfile in CI (see section 4).
- **A project instruction file (`AGENTS.md`)** warning that this Next.js version has breaking
  changes and that the bundled docs in `node_modules/next/dist/docs/` must be read before writing
  code. This mattered repeatedly (see Audit, entry 7).
- **A one-phase-at-a-time loop.** Each phase was requested separately, and each ended with the AI
  reporting what was built, which checks ran, and what was _not_ verified, before the next phase
  started.

### How the prompting differed by task

- **Architecture (ADR, state):** Options and constraints were given up front (Context vs Redux
  Toolkit vs Zustand vs Jotai, plus "separate server state"). I then asked the AI to **argue
  against its own recommendation** before deciding. The decision was written down while the
  trade-offs were fresh, then **amended** when later measurements contradicted it.
- **Implementation:** Pure logic first (cart functions, query parsing, schemas), then UI on top,
  so each layer was testable before the next existed.
- **Tests:** Strategy first (which layer proves which claim, coverage thresholds and why), then
  tests, then a **mutation check** to prove the tests could fail. Tests describe behaviour through
  public interfaces (roles and visible names), not internals.
- **Performance and security:** **Measure first, change second.** The AI was required to produce
  before numbers, and to report findings that did not support the plan's assumptions.

### An example of a prompt that had to be iterated

**First prompt:** "Write a Zustand cart store with localStorage persistence."

**What was wrong with the result:** it solved "persist a cart" but not the failure modes the
assignment names.

- It stored whole product objects instead of ids.
- It used floating-point prices.
- It saved unvalidated state with no version.
- `add` was not safe against rapid clicks.
- Cross-tab sync was never mentioned.

**Second prompt, which the code reflects:** "Store only `{productId, quantity}`. Prices are looked
up fresh and never stored. Keep pure functions (add, decrement, set, remove, totals) separate from
the store. Validate on rehydrate with a version field, and fall back to an empty cart on any
failure. Cap quantity at `MAX_QUANTITY`. Rehydrate on the `storage` event."

**Where that landed:** `features/cart/logic.ts` (the pure functions and the cap), `persistence.ts`
(validation and the line limit), `store.ts` (the store and its persistence), and
`components/cart-hydrator.tsx` (cross-tab sync).

### Where the AI pushed back on the plan

The plan said: if fakestoreapi.com is blocked from Vercel, build a route handler that proxies and
caches it. The AI's response was that this would not help: the proxy would run on the same Vercel
network that is blocked, and CORS is irrelevant because the app fetches on the server. What would
help is a committed snapshot of the data used as an explicit fallback. This was recorded, not
built, because it is only needed if the deployed check fails. (Evidence behind it: a `HEAD`
request to the API got `403 cf-mitigated: challenge` from Cloudflare, while `GET` returned 200.)

---

## 2. Human audit

Each entry below is a case where AI-written output was wrong, weak or risky, and I rejected it or
had it reworked. Each says what I did to catch it. Most came from checks I insisted on (measuring
at catalogue scale, running axe in a real browser, reading the Next.js docs, asking what a library
call actually accepts), not from trusting that code which ran was correct.

Entries are tagged **[structural]** (architecture, performance, security) or **[local]**. The
assignment asks for at least three, with at least one structural. There are eleven.

### 1. [structural, performance] The header shipped the whole product catalog to the browser

Caught by me: Lighthouse looked fine at 20 products, but I did not trust a measurement taken on a
catalogue that small. I built against a 1,000-product mock to test the README's claim that the
browser only receives the current page, and the claim did not hold.

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

Evidence: embedded page data at 1,000 products fell from **280.5 kB to 35.5 kB**, and now stays
flat as the catalog grows. The README had claimed the browser only received the current page, so
this was also a documentation claim the code did not meet.

### 2. [structural, security] The product schema accepted dangerous URL schemes

Caught by me: during the security phase I asked "what does `z.url()` actually allow?" instead of
assuming it meant a web address. It also accepted `javascript:`, `data:` and `file:` URLs, which
would end up in `<img src>`.

```ts
// Before: accepts javascript:, data: and file: URLs
image: z.url(),

// After: https only. Verified against all 20 real products before tightening.
image: z.url({ protocol: /^https$/ }),
```

Evidence: 7 new tests (`javascript:`, `data:`, `file:`, plain `http`, protocol-relative,
not-a-URL, empty). Removing the restriction makes 6 tests fail.

### 3. [structural, performance] Zod was shipped to every browser to validate four fields

Caught by me: I wanted to know what was actually in the client bundle, so I had each JavaScript
chunk tagged by library. A 39.7 kB (gzipped) chunk contained Zod, which the AI had used in the
browser to validate four fields of saved cart data.

```ts
// Before: persistence.ts (ships to the browser)
import { z } from "zod";
const storedSchema = z.object({ lines: z.array(z.object({ productId: z.number().int().positive(), … })) });

// After: small hand-written validator; Zod stays server-side only
const isValidLine = (l: unknown) =>
  isRecord(l) && Number.isInteger(l.productId) && (l.productId as number) > 0 && … ;
```

The first fix was also wrong: switching to `zod/mini` was expected to remove most of it but
removed only about a third (213.0 to 199.5 kB), because Zod's core still shipped. Measuring each
step, instead of assuming, is what led to the hand-written version (final: 213.0 to 185.2 kB,
together with entry 1). Covered by 25 tests, each condition mutation-checked.

### 4. [structural, performance] The LCP image was lazy-loaded

Caught by me: once I had fixed the broken test images (see "My own broken measurements" under
Verification), I re-ran Lighthouse and read the "LCP request discovery" check, which scored 0. The
AI had left every card image lazy-loaded, including the one that is the page's largest paint.

```tsx
// Before: all 8 card images were loading="lazy", including the first row
<Image src={product.image} alt="" fill sizes="…" />

// After: first row preloaded, the single LCP candidate gets high fetch priority
<Image src={product.image} alt="" fill sizes="…" preload={preload} fetchPriority={highPriority ? "high" : undefined} />
```

Evidence (5 runs each, applied throttling): mobile LCP **2478 ms to 1648 ms**, with
non-overlapping ranges. Under Lighthouse's default simulated throttling the LCP did not change
(Speed Index did), and both results are reported in `docs/performance-notes.md`.

### 5. [local, accessibility] Button names did not contain their visible text

Caught by me: I required axe to run in a real browser, not only unit tests, and its first run
flagged `label-content-name-mismatch` on the AI's button labels. Unit tests could not see it.

```tsx
// Before: visible text "Add to cart", accessible name "Add Backpack to cart"
aria-label={`Add ${title} to cart`}
// After: the visible text is inside the name, so voice control ("click Add to cart") works
aria-label={`Add to cart: ${title}`}
```

The same run found the Cart button's name read "Cart , 3 items" (a stray space from a
screen-reader-only span); fixed with an explicit `aria-label`.

### 6. [local, testing] The guard against unmocked network calls was silently not working

Caught by me: after a test-library upgrade, TypeScript flagged an unknown option. Rather than
silence the error, I checked why: msw 3 had renamed the option, so the guard against unmocked
requests had quietly been only warning.

```ts
// Before: msw 3 renamed this option, so it was ignored and unmocked requests only warned
server.listen({ onUnhandledRequest: "error" });
// After: plus a test that proves a request without a handler really does fail
server.listen({ onUnhandledFrame: "error" });
```

### 7. [local, framework] Deprecated and renamed Next.js 16 APIs

Caught by me: I held the AI to the project's `AGENTS.md` instruction (generated by Next.js) to read
the bundled docs before writing code, because its memory of the framework predates this version.
Checking its code against those docs turned up three things it had wrong:
`error.tsx` receives `retry`, not `reset`; `priority` on `next/image` is deprecated in favour of
`preload`; `searchParams` is a Promise that must be read inside `<Suspense>` with Cache
Components.

### 8. [structural, resilience] One refused request failed the whole deploy

Caught by me: I deployed to Netlify and the first real build failed (`Product service returned
403`, `Error occurred prerendering page "/"`). I had listed this risk in my Phase 0 plan, and the
AI had argued against my proxy idea (see "Where the AI pushed back on the plan" above), but nothing
had been built, because it could only be tested on a deployed host.

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

Verification: the failure was **reproduced locally first** by pointing the build at a mock that
returns 403 (same error as Netlify), then the fix was shown to make that same build succeed and
serve 8 cards with the notice. Smoke test 11/11 in that state. Five mutants (no fallback, fallback
cached for an hour, bugs masked as outages, fallback labelled live, notice removed) were all
caught. Deliberately not done: sending a browser-like User-Agent to get past Cloudflare, since
that is evading the API owner's bot protection.

### 9. [local, security] The first cart store trusted whatever was in localStorage

Caught by me: the brief asks explicitly about persisted state, and my first prompt had not
covered it (see section 1), so I rejected the first store, which trusted storage. Anything in storage can be edited by the user or another script, so
a tampered cart could crash the app or feed it bad data.

```ts
// Before: trusts storage
const cart = JSON.parse(localStorage.getItem("cart") ?? "{}");

// After: features/cart/persistence.ts. Anything wrong becomes an empty cart.
export function parseStoredCart(raw: unknown): Cart {
  if (!isRecord(raw) || !Array.isArray(raw.lines)) return [];
  if (raw.lines.length > MAX_LINES || !raw.lines.every(isValidLine)) return [];
  return (raw.lines as { productId: number; quantity: number }[]).reduce<Cart>(
    (cart, l) => setQuantity(cart, l.productId, l.quantity),
    [],
  );
}
```

Evidence: 25 validator tests, the store's corrupted-storage tests, and a browser test where
corrupted saved data starts an empty cart.

### 10. [local, correctness] Money was floating-point

Caught by me: "integer cents" was a standing constraint in my plan, but the AI's first cart used
floating-point prices anyway. I rejected it, had prices converted to cents once at the API
boundary, and asked for rounding tests.

```ts
// Before: float math drifts (0.1 + 0.2 style)
total = items.reduce((s, i) => s + i.price * i.qty, 0);

// After: integer cents, formatted only for display (features/cart/logic.ts, shared/money.ts)
export function totalCents(cart: Cart, priceCentsById: ReadonlyMap<number, number>): number {
  return cart.reduce((sum, l) => sum + (priceCentsById.get(l.productId) ?? 0) * l.quantity, 0);
}
export const toCents = (amount: number): number => Math.round(amount * 100);
```

Evidence: tests for "totals in integer cents without float drift" and for 0.29 becoming 29 cents.
When I swapped the rounding for `floor` as a deliberate break, a test failed.

### 11. [local, accessibility and correctness] Focus was dropped, and the search box drifted from the URL

Caught by me: once everything was green, I asked the AI for a whole-project review scored against
the brief's criteria, then chose which findings to fix and had them fixed with tests. Neither was covered by a test, which is why the suite had not noticed.

- **Focus.** Pressing Add to cart replaced the button with the stepper, and − at quantity 1
  replaced the stepper with the button. Either way the pressed button vanished and keyboard focus
  fell to the top of the page. The same happened when a drawer line was removed, and when `+`
  became `disabled` at the cap.
- **Search box.** It copied `q` from the URL once, then kept its own text. "Clear filters" and Back
  changed the results but left the old text in the box.

```tsx
// Before: the replacement control just appears; focus is wherever the browser drops it
if (quantity === 0 && showAddWhenEmpty) return <button onClick={add}>Add to cart</button>;
<button onClick={add} disabled={atMax}>+</button>

// After: the handler records where focus goes, and the replacement takes it as it mounts.
// Only our own clicks set it, so a change from another tab never moves focus.
if (before === 0) focusNext.current = "increase";
<button ref={takeFocus("add")} …>Add to cart</button>
<button ref={takeFocus("increase")} aria-disabled={atMax} …>+</button>
```

```tsx
// Before: initial value only
const [search, setSearch] = useState(current.q);

// After: follow outside changes to q, but ignore the URL catching up with our own writes,
// which would otherwise overwrite text typed while the navigation was in flight
if (current.q !== seenQ) {
  setSeenQ(current.q);
  const ours = written.indexOf(current.q);
  if (ours === -1) {
    setSearch(current.q);
    setWritten([]);
  } else setWritten(written.slice(ours + 1));
}
```

The first draft of the drawer fix made the heading focusable as the fallback target. That changed
where focus lands when the drawer _opens_, which broke a browser test, and that in turn exposed
that the test had only been passing by coincidence (see Verification). The fallback is now the
Close button.

Evidence: 9 new or changed tests (focus after Add and −, at the cap, after removing the first,
middle and last drawer line, not moved by another tab's change; the search box clearing, coming
back on Back, not overwriting typing, keeping a trailing space). Seven mutants, one per part of
the fix, are all caught. The first round let one through (always focusing the first line), so a
three-line test was added.

---

## 3. Verification

### How AI helped generate tests for edge cases

The AI wrote the unit, integration and end-to-end tests from edge-case lists (zero and negative
quantity, removing the last item, large quantities, NaN, rounding, duplicate adds, corrupted
storage, API 500 / network failure / malformed payloads, hostile URL parameters and hostile API
text). Edge cases came from the plan's checklist plus cases the AI added while building each
layer.

### How I checked the tests were meaningful, not trivially passing

Passing tests prove little; the question is whether they would _fail_ when the code is wrong.
Methods used, with results:

- **Mutation checks**, five rounds, done by hand: Breaking the code on purpose, one change at a
  time: cart and money logic (8 of 8 caught), stored-cart validator and render isolation (6 of 6),
  security protections (6 of 6), the saved-catalogue fallback (5 of 5) and the shared cart hook
  and utility (5 of 5). Each mutant was restored and the suite re-run green.
- **`it.fails` against a known-bad component**: The code review exercise runs one spec against a
  flawed component (must fail all 5) and its refactor (must pass). The failures were then read as
  ordinary tests to confirm they failed for the _stated_ reasons, not harness errors.
- **Render-isolation test, then broken on purpose**: A Profiler test shows only the changed
  product re-renders; replacing the selector with a whole-cart one made it fail.
- **Negative control for the smoke test**: Pointed at a port with nothing listening, it fails all
  11 checks and exits non-zero.
- **Coverage thresholds with reasoning**: 80% global, 95% on the pure money and input logic.
  Current: about 96%. Coverage is treated as a floor, not as proof.
- **Real-browser tests for what a simulated DOM cannot show**: Two-tab sync, focus return, axe,
  and the real CSP. These found defects unit tests could not (entries 5 and the CSP traps below).

Coverage is a floor, not proof. The mutation checks are the real evidence that a test would notice
a break.

### Tests that passed or failed for the wrong reason (caught, not hidden)

- **"eval is blocked" reported "allowed"** even though the CSP header was correct. Playwright's
  `page.evaluate()` runs over the DevTools protocol, which disables the eval restriction, and a
  script appended inside that call also runs inside it. Confirmed with a throwaway script
  (`EvalError` when run from a timer), then the test was rewritten.
- **A mutant that silently did nothing:** a script's search pattern did not match after the
  formatter changed the line. The "PATTERN MISSING" message was noticed and that mutant re-run by
  hand instead of being counted as caught.
- **A wrong expected value:** a test expected a total of `$4.00` where the fixtures give `$40.00`.
  The arithmetic was checked and the test fixed, not the code.
- **A failure only CI could show:** the first GitHub Actions run failed at `pnpm typecheck`
  (`Cannot find name 'LayoutProps'` / `'PageProps'`). Next.js generates those global types into
  `.next/types` during a build or dev run, so they existed on the developer machine and not on a
  fresh checkout. Reproduced locally by moving the generated folders aside, fixed by running
  `next typegen` before `tsc` in the `typecheck` script, then every CI step was run from that clean
  state to find any other hidden dependency on local build output (none).
- **A browser test that passed by coincidence:** "drawer traps focus" pressed Tab six times and
  checked focus was inside the dialog. In a native modal dialog, Tab past the last control goes to
  the browser toolbar and wraps back, and six presses from Close happened to land inside. It now
  checks every Tab stop and fails if any reaches the page behind; opening the drawer non-modally
  makes it fail.
- **My own broken measurements:** fixture image URLs returned 404, so the first Lighthouse runs
  left out image cost and showed an unrealistic LCP. It surfaced because Best Practices scored 96
  with a console error. Documented in the performance notes; those runs are kept only for the
  JavaScript-driven metrics.

### What has been confirmed, and what has not

- **Confirmed on 2026-11-13:** the live site (https://fake-store-api-shopping-cart.netlify.app/)
  passes the smoke test 12/12. Its `/api/upstream-status` check shows the product API refusing
  the host with `HTTP 403, server=cloudflare, cf-mitigated=challenge`, so the earlier guess (that
  Cloudflare screens data-centre traffic) is now confirmed, and the site serves the saved catalog
  with its notice. Product images load through the host's image optimizer.
- GitHub Actions has run green on this repository (lint, types, format, audit, coverage and
  Playwright).
- No screen-reader testing (VoiceOver or NVDA); no real-device or 200% zoom checks.
- Playwright runs Chromium only.
- In-memory search and sort were benchmarked on synthetic data on one laptop
  (`scripts/bench/query.mjs`, results in ADR-002). Real serverless instances are slower, and host
  cache-entry size limits are unchecked.

---

## 4. A disagreement: Tailwind classes instead of inline styles

**What the AI suggested:** some early component code was styled with inline `style={{ … }}`
objects instead of Tailwind classes. When I raised it, the AI said that for a small amount of code
it was fine to go ahead with inline styles.

**What I did instead:** I insisted that everything use Tailwind, as every other component does,
and had that code rewritten.

**Why I overrode it**

- **Inline styles cannot do what this app needs.** A `style` attribute cannot express media
  queries (the product grid goes from 2 to 3 to 4 columns), `:hover`, `:focus-visible` (the
  keyboard focus rings the accessibility work depends on), or dark mode. Each of those would have
  needed a second mechanism alongside the inline styles.
- **One way of styling scales; two do not.** "It is only a little code" is how every exception
  starts. A team that inherits two styling systems has to know both and decide between them in
  every review. Keeping one rule was cheap now and expensive to recover later.
- **Colour contrast stays checked.** Colours come from Tailwind's palette, whose contrast is
  documented in `docs/accessibility-and-responsive.md`. Hand-picked values in inline styles would
  bypass those checks.

**Where the AI had a point:** inline styles are the right tool for values that are truly dynamic,
computed at runtime. None of the code in question was. It is also not a security argument: the
content security policy allows inline style attributes (`style-src-attr 'unsafe-inline'`), which
`next/image` relies on.

### A related call: pnpm instead of npm

This was not a disagreement. The AI set the project up with npm, the default, and never argued
for it. I changed it to pnpm because I wanted the stricter and more reproducible setup it gives a
project meant to grow. These are its benefits here:

- **Strict dependency resolution.** pnpm's non-flat `node_modules` stops code importing packages
  it did not declare ("phantom dependencies"). That matters for a codebase meant to scale to a
  larger team.
- **Supply-chain safety.** pnpm only runs dependency install scripts that are allow-listed. This
  repo's `pnpm-workspace.yaml` blocks the scripts of `sharp` and `unrs-resolver`. That ties into
  the security notes.
- **Reproducibility.** `pnpm-lock.yaml` is committed, `packageManager` pins `pnpm@12.18.0`, and
  both CI jobs install with `--frozen-lockfile`, so every install is the same.
- **Disk and install efficiency.** A shared content-addressable store makes repeat installs and CI
  cache restores cheaper. On a project this small I expect the difference to be minor, and I did
  not measure it.
- **Room to grow.** Workspace support is built in if this ever becomes a monorepo.

**Trade-offs I accepted**

- Reviewers may expect npm, so the README says how to install pnpm (`corepack enable` or
  `npm install -g pnpm`).
- A real cost I hit: pnpm was not installed on my machine, and `npm install -g pnpm` failed with a
  permissions error. I fixed it with Homebrew.
- Both Vercel and Netlify built the project from the lockfile and the pinned version without extra
  setup.

---

## Decisions and open items

**Decisions with reasons** (details in the README and docs):

- **Stock policy:** the API has no stock field, so a simulated cap of 10 per line is enforced in
  the pure cart logic and shown with a visible, announced message.
- **Money:** integer cents everywhere, converted once at the API boundary.
- **No price snapshot in the cart:** only product id and quantity are stored; prices come from
  fresh product data, so a total is never stale.
- **Deliberately not handled:** multi-device cart sync (needs accounts and a server-side cart).
- **CSP:** allows inline scripts (`'unsafe-inline'`). Nonces force dynamic rendering and undo the
  performance work; the experimental SRI mode was tried and broke the app (16 of 21 tests failed).
  Documented as a known weakness, with when to revisit, in `docs/security-notes.md`.
- **Dependency audit:** one moderate, dev-only finding (`minimatch`) accepted because no
  compatible patched release exists; CI fails on any production or high-severity finding.
