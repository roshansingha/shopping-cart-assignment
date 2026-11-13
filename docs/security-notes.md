# Security notes

How the app is protected, what the dependency audit found, and what was deliberately accepted.

## Summary

- **All outside data is treated as untrusted.** The product API, URL parameters, saved cart data
  and the cart lookup route are all checked before use.
- **There is no way to inject HTML.** API text is only ever shown as plain text, and the source
  has no `dangerouslySetInnerHTML`, `eval`, `innerHTML` or similar.
- **Every response carries security headers,** including a Content Security Policy (CSP).
- **Dependency audit (2026-11-13):** production dependencies are clean. One moderate finding in
  development tooling was accepted, with reasons (below).
- **One known weakness, chosen on purpose:** the CSP allows inline scripts. The stricter options
  either force every page to render dynamically or broke the app (below).
- **Not done:** no rate limiting, no CSP reporting, no outside security scan.

## Scope and threat model

The app shows a read-only product list from a third-party API and keeps a shopping cart in the
browser's localStorage. There are **no accounts, no personal data, no payments and no secrets**.
That shapes the priorities:

- The main risk is **untrusted input**: the third-party API, URL parameters, and localStorage
  (which any script on the page, or the user, can edit).
- The worst realistic outcome of a bug is script injection (XSS) or a corrupted cart, not theft
  of data.
- If checkout or login is ever added, this must be redone. A server would then have to recompute
  totals from product ids and quantities, and never trust anything sent by the browser.

## How each source of untrusted data is handled

### The product API response

- It is parsed with Zod. Wrong shapes, negative or infinite prices, out-of-range ratings, and
  image URLs that are not `https` are rejected.
- **One bad product rejects the whole list,** so a half-trusted payload is never shown. Unknown
  fields are dropped.
- **Proof:** `schema.test.ts` (22 cases, including `javascript:`, `data:`, `file:` and
  protocol-relative URLs).

### API text shown in the page

- It is rendered only as plain text. A product titled `<img onerror=…><script>…` appears as that
  literal text and creates no element.
- **Proof:** an integration test with exactly that title. The whole source was also searched for
  `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function` and `document.write`. The only
  hit was a code comment.

### Product images

- `next/image` only optimises the exact host, path, no port and no query string
  (`fakestoreapi.com/img/**`), so the optimiser cannot be used as an open proxy. SVG is not
  enabled.
- I checked that all 20 real product images match this pattern before tightening it.

### URL parameters (`q`, `category`, `sort`, `page`)

- Each is allow-listed or clamped. Invalid values fall back to defaults. The search term is
  trimmed and capped at 100 characters.
- **Proof:** `query.test.ts` and a hostile-parameter integration test.

### The saved cart in localStorage

- It is validated on every load. Anything malformed, with a quantity over the limit, or with more
  than 100 lines is discarded and the cart starts empty. It is never half-trusted.
- **Proof:** 25 validator tests and the store's corrupted-storage tests.

### The cart lookup route (`/api/cart-products?ids=`)

- Only positive whole numbers are accepted, with no duplicates and at most 100 of them.
- Bad input gets a 400. An unexpected failure gets a generic 502 with no internal detail.
- It returns only four fields per product.
- **Proof:** `cart-products.test.ts` and `route.test.ts`.

### Outbound requests and secrets

- The upstream address is fixed in code. `PRODUCTS_API_URL` is a server-side setting used only
  for tests. No user input ever forms a URL we fetch, so there is no server-side request forgery
  path.
- There are **no secrets** in the project. `.env*` files are git-ignored and none exist. A scan
  for key, token and password patterns found only a test string.

## Security headers and CSP

Set in [src/shared/security-headers.ts](../src/shared/security-headers.ts) and applied to every
route, including the API.

- **Content-Security-Policy:** scripts, images, fonts and requests from our own origin only.
  Plugins, `<base>` changes, form posts to other sites and framing are all blocked. No
  `unsafe-eval` in production.
- **Strict-Transport-Security:** two years. `preload` is left out on purpose, because it is a
  public commitment that is hard to undo.
- **X-Content-Type-Options:** `nosniff`.
- **X-Frame-Options:** `DENY` (for older browsers; the CSP covers the rest).
- **Referrer-Policy:** `strict-origin-when-cross-origin`.
- **Permissions-Policy:** camera, microphone, location, payment, USB and motion sensors all off.
- **Cross-Origin-Opener-Policy:** `same-origin`.
- **X-Powered-By:** removed.

### The weakness we accepted

**The policy allows `'unsafe-inline'` for scripts.** That is the weakest part. If an attacker
found a way to inject an inline `<script>`, the CSP would not stop it. I tried to avoid it and
could not:

1. **Nonces** (the usual strict approach) force every page to render dynamically and do not work
   with Partial Prerendering, according to the Next.js docs. That would undo the performance work
   for an app with nothing sensitive to protect.
2. **Experimental hash-based SRI,** meant to allow a strict policy while keeping static pages. I
   built it with inline scripts disallowed and ran the tests: **16 of 21 failed.** The page was
   rendered, but the browser refused Next's own inline start-up script, so it never became
   interactive and every "Add to cart" button stayed disabled. I reverted it.

**What the CSP still protects against** (each has a browser test):

- Scripts from any other site are refused.
- `eval` and `new Function` are blocked.
- Injected `<style>` elements are refused.
- Images from other sites are refused, so no tracking pixels.

**Compensating controls:** there is no way to inject HTML (see above), and nothing sensitive is
stored, so the practical damage from an injected script would be a modified cart.

**When to revisit:** as soon as the app handles accounts, payments or personal data. Then move to
nonces and accept dynamic rendering, or re-test SRI if it stops being experimental.

### Other CSP choices

- `style-src-attr 'unsafe-inline'` is needed because `next/image` writes inline `style`
  attributes. Inline `<style>` elements stay blocked.
- Development relaxes the policy (eval for debugging, websockets for hot reload). A test checks
  that this never reaches production.
- A UI library's custom dropdown was ruled out partly because it injects an inline `<style>` that
  this policy blocks. We use a native `<select>` instead.

### Two testing traps (kept so nobody repeats them)

Both made my first CSP test give the wrong answer:

- Playwright's `page.evaluate()` runs over the DevTools protocol, which **switches off the eval
  restriction.** My first test said `eval` was allowed even though the policy blocks it.
- A script added inside that call also runs _inside_ it. The working test runs the attempt from a
  timer, after the call returns, like real injected code.

## Dependency audit

Run with `pnpm audit` on 2026-11-13.

- **Production dependencies:** no known vulnerabilities.
- **All dependencies:** 1 moderate, 0 high, 0 critical.

### The finding: `minimatch` denial of service (moderate, development only)

- **What:** `minimatch` versions from 7.0.0 up to (not including) 11.0.1 can be made to hang by a
  specially crafted glob pattern. Advisory GHSA-g3hv-75wg-m249.
- **Where:** only through the linting tools (`eslint-config-next`, then `typescript-eslint`, then
  `typescript-estree`, then `minimatch`), by 11 routes. It is not in the production bundle.
- **Decision: not acted on, accepted and monitored.**
  - _Not exploitable here:_ it needs an attacker-controlled glob pattern. The lint tools only
    read patterns from config files the developers write.
  - _No compatible fix exists:_ the newest `typescript-estree` (8.72.2, already installed) asks
    for `minimatch ^10.2.2`, which is still in the vulnerable range. Forcing version 11 with an
    override would put an unsupported version into the linter, risking a broken lint setup for a
    risk that cannot be reached.
  - _Revisit_ when `typescript-eslint` ships a release that uses a patched `minimatch`.

### The policy CI enforces

`.github/workflows/ci.yml` runs two checks:

- `pnpm audit --prod --audit-level=moderate` fails the build on any production vulnerability.
- `pnpm audit --audit-level=high` fails it on a high or critical finding anywhere.

The accepted moderate finding does not block. Anything worse does.

### Supply chain

- `pnpm-lock.yaml` is committed and CI installs with `--frozen-lockfile`, so builds use exactly
  the audited versions.
- The workspace settings disable install scripts for `sharp` and `unrs-resolver`.
- The runtime dependencies are only `next`, `react`, `react-dom`, `zod` and `zustand`.

## The saved catalogue and the diagnostic route

When the live API refuses us, the app shows a saved copy of the catalogue. Security notes on that:

- **Trust:** the saved copy is committed code, but it goes through the same Zod checks as live
  data every time, and a test checks each image address against the image allow-list. A bad edit
  fails in CI, not in production.
- **Honesty:** when the saved copy is shown, the page says so. It never presents old prices as
  current.
- **What it deliberately does not do:** it does not try to get past the API's bot screening, for
  example by sending a browser-like User-Agent. That would be evading a protection the API owner
  chose. Degrading gracefully is the right response to being refused.
- **No disguised bugs:** only expected API failures trigger the fallback. Any other error is
  raised, so a bug in our code cannot be hidden as an outage. This is tested.
- **Diagnostic route:** `GET /api/upstream-status` reports whether this server can reach the live
  API (status, the `server` header and `cf-mitigated`). It never returns the upstream body, is
  cached for 30 seconds so it cannot be used to hammer the API through us, and shows nothing that
  anyone requesting the API directly would not see.

## Verification

- **205 unit and integration tests and 21 browser tests pass.** Seven browser tests are about
  security: the headers are present, normal use causes **zero CSP violations**, and the CSP really
  blocks the things listed above.
- **Breaking the protections on purpose:** I removed each one in turn (the image scheme check,
  eval allowed, framing allowed, images from any site, `nosniff`, the id check). The tests caught
  all six.
- **Deployed sites:** the smoke test (`pnpm smoke <url>`) checks the security headers on a live
  address. It passed on both the Netlify and Vercel deployments.

## Not done

- **No check for CSP violations in the browser console on the deployed sites.** The headers were
  confirmed present, but normal use was only watched for violations locally.
- **No CSP reporting endpoint,** so violations in real users' browsers would go unnoticed.
- **No rate limiting** on `/api/cart-products`. It is cheap (upstream data is cached for an hour,
  and at most 100 ids per call) but unauthenticated, so it relies on the host's protections.
- **No automated dynamic scan** (for example OWASP ZAP) and no outside penetration test.
- **No HSTS preload** and no Subresource Integrity.
- The audit reflects one day's advisory database. New advisories appear over time, which is why
  the check runs in CI.
