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
- **Cart logic:** written as pure functions (`addItem`, `setQuantity`, `removeItem`, `selectTotal`) separate from the store, so it can be unit tested without React.

## Rationale

- Server data and client data have different lifecycles; keeping them apart avoids forcing one tool to do both jobs.
- TanStack Query was rejected for now. With a single read-only endpoint, a server component gives caching and zero client JavaScript, and a smaller dependency set is easier to maintain and audit.
- Zustand's selector subscriptions mean a cart change re-renders only the components that read the changed slice, which supports the performance requirement.
- Redux Toolkit would be justified for a larger team that wants strict conventions; it is more than this scope needs.

## Persistence

- Persist only `{ productId, quantity }` per line plus a schema `version`. Prices and titles are re-derived from fresh product data so stale prices are never charged.
- On hydrate, validate the stored value with Zod; if it is corrupt or from an unknown version, discard it and start with an empty cart.
- A `storage` event listener keeps multiple tabs in sync.

## Consequences

- Fast to build and easy to test.
- If client-side fetching, pagination from a real backend, or mutations (checkout, live stock) are added, **revisit this ADR and add TanStack Query** for server state. The cart store would not need to change.
- The team must agree on a convention for store slices (one file per feature) as the product grows.
