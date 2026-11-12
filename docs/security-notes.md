# Security notes

## Scope and threat model

What this app handles: a read-only product list from a third-party API, and a shopping cart kept in the browser's localStorage. There are **no accounts, no personal data, no payments and no secrets**. That shapes the priorities:

- The main risk is **untrusted input**: the third-party API, URL parameters, and localStorage (which any script on the page, or the user, can edit).
- The worst realistic outcome of a bug is script injection (XSS) or a corrupted cart, not data theft.
- If checkout or login is ever added, this threat model must be redone. In particular a server must recompute totals from product ids and quantities and never trust anything the browser sends.

## Controls

| Untrusted source                                     | Control                                                                                                                                                                                                                                                     | Verified by                                                                                                                      |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Product API response**                             | Parsed with Zod. Wrong shapes, negative or non-finite prices, out-of-range ratings, and image URLs that are not `https` are rejected. **One bad product rejects the whole list**, so a half-trusted payload is never rendered. Unknown fields are stripped. | `schema.test.ts` (22 cases incl. `javascript:`, `data:`, `file:`, protocol-relative URLs)                                        |
| **API text in the page**                             | Rendered only as React text. The code contains no `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function` or `document.write` (searched the whole source).                                                                                           | Integration test feeds a product titled `<img onerror=…><script>…` and checks it appears as literal text and creates no element. |
| **Product images**                                   | `next/image` only optimizes the exact host, path, no port, no query string (`fakestoreapi.com/img/**`), so the optimizer is not an open proxy. SVG is not enabled. I checked all 20 real products match this pattern.                                       | Build and E2E; real API checked by hand.                                                                                         |
| **URL parameters** (`q`, `category`, `sort`, `page`) | Allow-listed or clamped; invalid values fall back to defaults; `q` is trimmed and capped at 100 characters.                                                                                                                                                 | `query.test.ts`, a hostile-parameter integration test                                                                            |
| **localStorage cart**                                | Validated on every load. Anything malformed, with a quantity over the cap, or with more than 100 lines is discarded and the cart starts empty. Never half-trusted.                                                                                          | 25 validator tests + store tests                                                                                                 |
| **`/api/cart-products?ids=`**                        | Only positive integers, no duplicates, at most 100. Bad input gets 400; an upstream failure gets a generic 502 with no internal detail. Returns only four fields per product.                                                                               | `cart-products.test.ts`, `route.test.ts`                                                                                         |
| **Outbound request URL**                             | The upstream URL is fixed in code; `PRODUCTS_API_URL` is a server-side env var only used for tests. No user input ever forms a URL we fetch, so no SSRF path.                                                                                               | Code search                                                                                                                      |
| **Secrets**                                          | None exist. `.env*` is git-ignored, no `.env` file is present, and a scan for key/token/password patterns found only a test string.                                                                                                                         | Scan                                                                                                                             |

## Security headers and CSP

Set in [src/shared/security-headers.ts](../src/shared/security-headers.ts) and applied to every route, including the API.

| Header                       | Value / purpose                                                                                                                                                                                                         |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Content-Security-Policy`    | `default-src 'self'`; scripts from our origin only; `object-src 'none'`; `base-uri 'self'`; `form-action 'self'`; `frame-ancestors 'none'`; images, fonts and fetches same-origin only. No `unsafe-eval` in production. |
| `Strict-Transport-Security`  | Two years, `includeSubDomains`. `preload` deliberately omitted: it is a public commitment that is hard to undo.                                                                                                         |
| `X-Content-Type-Options`     | `nosniff`                                                                                                                                                                                                               |
| `X-Frame-Options`            | `DENY` (older browsers; CSP covers the rest)                                                                                                                                                                            |
| `Referrer-Policy`            | `strict-origin-when-cross-origin`                                                                                                                                                                                       |
| `Permissions-Policy`         | camera, microphone, geolocation, payment, USB, motion sensors all off                                                                                                                                                   |
| `Cross-Origin-Opener-Policy` | `same-origin`                                                                                                                                                                                                           |
| `X-Powered-By`               | Removed                                                                                                                                                                                                                 |

### The CSP decision, and the weakness I accepted

**The policy allows `'unsafe-inline'` for scripts.** That is the weakest part of this setup: if an attacker found a way to inject an inline `<script>`, the CSP would not stop it. I tried to avoid it and could not:

1. **Nonces** (the usual strict approach) force every page to render dynamically and are incompatible with Partial Prerendering, per the Next.js docs. That would undo the performance work (static shell, CDN-cacheable pages) for an app with nothing sensitive to protect.
2. **Experimental hash-based SRI**, which is meant to allow a strict policy while keeping static rendering. I built it with inline scripts disallowed and ran the full test suite: **16 of 21 tests failed.** The server-rendered HTML still appeared, but the browser refused Next's inline bootstrap script ("Executing inline script violates … script-src 'self'"), so the page never became interactive and every "Add to cart" button stayed disabled. The hashes did not cover those inline scripts in this setup (Turbopack, Cache Components). I reverted it.

**What the CSP still does protect against** (each has an end-to-end test against a real browser):

- Scripts from any other origin are refused.
- `eval` and `new Function` are blocked.
- Injected `<style>` elements are refused.
- Images from other origins are refused (so no tracking pixels or data exfiltration through images).
- Plugins, `<base>` hijacking, form posts to other sites and framing are all blocked.

**Compensating controls:** the app has no sink an attacker could use to inject HTML (see Controls), and it stores nothing sensitive, so the practical blast radius of a script injection is a modified cart.

**When to revisit:** as soon as the app handles accounts, payments or personal data, move to nonces and accept dynamic rendering (the docs' recommendation for sensitive apps), or re-test SRI if it leaves experimental status.

**Other CSP choices**

- `style-src-attr 'unsafe-inline'` is needed because `next/image` writes inline `style` attributes. Inline `<style>` elements stay blocked.
- Development relaxes the policy (eval for React debugging, websockets for hot reload). A unit test asserts this never reaches production.
- `upgrade-insecure-requests` is not set; HSTS covers it and it would interfere with local production testing over `http://localhost`.

### Two testing traps (kept so nobody repeats them)

Both made my first CSP test pass or fail for the wrong reason:

- Playwright's `page.evaluate()` runs over the DevTools protocol, which **disables the eval restriction**. My first eval test reported "allowed" even though the policy blocks it.
- A script appended inside that call also runs _inside_ it. The working test runs the probe from a timer, after the call returns, like real injected code.

## Dependency audit

Run with `pnpm audit` on 2026-11-12.

| Scope                              | Result                             |
| ---------------------------------- | ---------------------------------- |
| Production dependencies (`--prod`) | **No known vulnerabilities**       |
| All dependencies                   | **1 moderate**, 0 high, 0 critical |

### Finding: `minimatch` denial of service (GHSA-g3hv-75wg-m249), moderate, dev-only

- **What:** vulnerable `minimatch` versions (≥7.0.0, <11.0.1) can be made to hang on specially crafted glob patterns.
- **Where:** pulled in only through the lint toolchain (`eslint-config-next` → `typescript-eslint` → `typescript-estree` → `minimatch`), 11 dependency paths. It is not in the production bundle (the `--prod` audit is clean).
- **Decision: not acted on, accepted and monitored.**
  - _Not exploitable here:_ it needs an attacker-controlled glob pattern. The lint tooling only reads patterns from config files the developers write.
  - _No compatible fix exists:_ the newest `typescript-estree` (8.72.2, already installed) asks for `minimatch ^10.2.2`, which is still in the vulnerable range. Forcing version 11 with a package override would put an unsupported major version into the linter, risking a broken lint setup for a risk that is not reachable.
  - _Revisit_ when `typescript-eslint` ships a release that depends on a patched `minimatch`.

### Policy enforced in CI

`.github/workflows/ci.yml` runs `pnpm audit --prod --audit-level=moderate` (any production vulnerability fails the build) and `pnpm audit --audit-level=high` (a high or critical finding anywhere fails it). The accepted moderate dev-only finding does not block, but anything worse will. I confirmed the exit codes locally: 0, 0, and 1 for a moderate-level check over everything.

### Supply-chain notes

- `pnpm-lock.yaml` is committed and CI installs with `--frozen-lockfile`, so builds use exactly the audited versions.
- The workspace config disables install scripts for `sharp` and `unrs-resolver`.

## Verification

- **165 unit and integration tests and 21 end-to-end tests pass**, including 7 browser tests that check the headers are present, that normal use (browse, filter, add to cart, open the drawer, reload) triggers **zero CSP violations**, and that the CSP actually blocks the things listed above.
- **Mutation check:** I removed each protection in turn: the image scheme restriction, eval allowed in production, framing allowed, images from any origin, `nosniff` dropped, and the id validator loosened. The suite caught all six, with between 1 and 13 failing tests each.

## Not done (limitations)

- **Nothing was tested on the deployed site.** Headers should be re-checked after deploying to Vercel (`curl -I <url>` or an online header scanner), because a CDN or platform setting can add or override headers.
- **No CSP reporting endpoint**, so violations in real users' browsers would go unnoticed.
- **No rate limiting** on `/api/cart-products`. It is cheap (upstream data is cached for an hour, at most 100 ids per call) but unauthenticated, so it relies on the hosting platform's protections.
- **No automated dynamic scan** (for example OWASP ZAP) and no third-party penetration test.
- **No HSTS preload** and no Subresource Integrity (see the CSP section).
- The audit reflects one day's advisory database; new advisories appear over time, which is why the check runs in CI.
