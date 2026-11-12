# ADR-001: State management

- **Status:** Accepted
- **Date:** 2026-11-12

## Context

The app has two kinds of state with different needs:

1. **Server data**: the product list from `https://fakestoreapi.com/products`. It is read-only, shared by every visitor, and changes rarely.
2. **Client state**: the shopping cart. The user owns it, it must update synchronously, survive reloads, and drive reactive UI in several places (header badge, listing buttons, cart view).

Filter, search and sort choices are a third, smaller kind: view state that should be shareable by URL.

## Options considered

| Option                         | Pros                                                                                                      | Cons                                                                                                                     |
| ------------------------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **React Context + useReducer** | No dependency; familiar                                                                                   | Every consumer re-renders on any change unless split into many contexts; persistence and cross-tab sync are hand-written |
| **Redux Toolkit**              | Mature, great devtools, strong conventions for large teams                                                | Heavy boilerplate and bundle for one slice of state; more ceremony than the problem needs                                |
| **Zustand**                    | ~1 KB; selector-based subscriptions avoid needless re-renders; built-in `persist` middleware; no provider | Fewer enforced conventions than Redux, so the team must keep slice structure disciplined                                 |
| **TanStack Query (+ Zustand)** | Caching, retries, background refetch, request deduplication for server data                               | Adds a dependency and provider; the only server data here is one read-only GET that Next.js already caches               |
| **Jotai / Valtio**             | Fine-grained atoms or proxies                                                                             | Less familiar to most teams; no clear advantage over Zustand here                                                        |

## Decision

- **Cart:** Zustand with the `persist` middleware (localStorage), exposing narrow selectors.
- **Products:** fetched in a Next.js server component with `fetch` and Next's cache, validated with Zod, and passed to the client as props. No client-side fetching library.
- **Filter / search / sort:** URL search params, so views are linkable and survive reloads.
- **Cart logic:** written as pure functions (`addItem`, `decrementItem`, `setQuantity`, `removeItem`, `totalCents`) separate from the store, so it can be unit tested without React.

## Rationale

- Server data and client data have different lifecycles; keeping them apart avoids forcing one tool to do both jobs.
- TanStack Query was rejected for now. With a single read-only endpoint, a server component gives caching and zero client JavaScript, and a smaller dependency set is easier to maintain and audit.
- Zustand's selector subscriptions mean a cart change re-renders only the components that read the changed slice, which supports the performance requirement.
- Redux Toolkit would be justified for a larger team that wants strict conventions; it is more than this scope needs.

## Persistence

- Persist only `{ productId, quantity }` per line plus a schema `version`. Prices and titles are re-derived from fresh product data so stale prices are never charged.
- On hydrate, validate the stored value; if it is corrupt, too large (over 100 lines) or from an unknown version, discard it and start with an empty cart. (Originally Zod; see the amendment below.)
- A `storage` event listener keeps multiple tabs in sync.

## Consequences

- Fast to build and easy to test.
- If client-side fetching, pagination from a real backend, or mutations (checkout, live stock) are added, **revisit this ADR and add TanStack Query** for server state. The cart store would not need to change.
- The team must agree on a convention for store slices (one file per feature) as the product grows.

## Amendment (Phase 6, performance measurements)

Two decisions above changed after measuring (details and numbers in `docs/performance-notes.md`):

- **Persisted-state validation is hand-written, not Zod.** The cart store ships to the browser, and Zod added about 14 kB gzipped even in its tree-shakable build, for four checks. The behaviour (reject anything malformed, never half-trust it) is unchanged and covered by tests. Zod stays in use server-side for API responses.
- **The cart no longer receives the product list from the server layout.** The original design passed product data to the cart drawer from the header, which grew the HTML with the catalog (280 kB of extra page data at 1,000 products). The drawer now fetches only its own lines through `GET /api/cart-products`, on demand. This keeps the rule that prices are never stored in the cart; they are looked up fresh.

Consequence for the "revisit this ADR" trigger: this endpoint is the first client-driven server-state read. If more of them appear (order history, live stock), that is the point to adopt TanStack Query for caching and retries.
