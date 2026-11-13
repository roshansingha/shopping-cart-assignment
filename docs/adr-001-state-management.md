# ADR-001: State management and code structure

- **Status:** Accepted
- **Date:** 2026-11-12 (updated 2026-11-13)

## Context

The app has three kinds of state with different needs:

1. **Server data:** the product list from `https://fakestoreapi.com/products`. It is read-only,
   shared by every visitor, and changes rarely.
2. **View state:** search, category, sort and page. It should be shareable by link.
3. **Client state:** the shopping cart. The user owns it. It must update instantly, survive
   reloads, and drive several places at once (header badge, product cards, cart drawer).

## Options considered

### React Context + useReducer

- **Good:** no dependency, familiar.
- **Bad:** every component reading the context re-renders on any change, unless it is split into
  many contexts. Persistence and cross-tab sync would be hand-written.

### Redux Toolkit

- **Good:** mature, great devtools, strong conventions for large teams.
- **Bad:** heavy boilerplate for one slice of state. More ceremony than the problem needs.

### Zustand (chosen for the cart)

- **Good:** about 1 KB. Components subscribe to just the slice they need, so a change re-renders
  only what shows it. Built-in `persist` middleware. No provider wrapper.
- **Bad:** fewer enforced conventions than Redux, so the team must keep its structure disciplined.

### TanStack Query (with Zustand)

- **Good:** caching, retries and request de-duplication for server data.
- **Bad:** a dependency and a provider. Our only server data is one read-only request that Next.js
  already caches, so it has nothing to do yet.

## Decision

- **Cart:** Zustand with the `persist` middleware (localStorage), read through narrow selectors.
- **Products:** fetched in a Next.js server component, cached by Next, and validated with Zod at
  the boundary. The browser gets only the current page. No client-side fetching library.
- **Search, filter, sort, page:** URL search params. Links work, reloads and Back keep the view.
  See [ADR-002](adr-002-listing-strategy.md) for how the listing scales.
- **Cart product details** (title, price, image): a small second store that fetches only the
  products in the cart, on demand, from `GET /api/cart-products`.
- **Cart logic:** plain functions (`addItem`, `decrementItem`, `setQuantity`, `removeItem`,
  `totalCents`), separate from the store.

## Why

- Server data and client data have different lifecycles. Keeping them apart avoids forcing one tool
  to do both jobs.
- Zustand's selectors mean a cart change updates only the components that show it. This is tested:
  changing one product does not re-render the other cards.
- A smaller set of dependencies is easier to maintain and audit.
- Keeping the logic as plain functions means the state library can change without rewriting the
  rules, and the rules can be tested without a browser.

## Persistence

- Only `{ productId, quantity }` per line is saved, plus a version. Prices are never stored, so a
  stale price can never be charged.
- Saved data is validated on load. If it is malformed, too large (over 100 lines) or from an
  unknown version, it is discarded and the cart starts empty.
- A `storage` listener keeps other tabs in sync.
- Every cart scenario is explained in [cart-behavior.md](cart-behavior.md).

## How the code is structured to scale to a larger team

```
src/
  app/                    routes and layout only
  features/
    products/             schema, API, query logic, components, tests
    cart/                 logic, store, persistence, components, tests
  shared/                 small utilities with no feature knowledge
```

**Rules the structure follows**

- **One folder per feature.** A feature owns its data shapes, logic, state, components and tests, so
  two people can work on different features without touching the same files.
- **Pure logic is separate from React and storage.** It is the easiest code to test and to change
  safely.
- **Dependencies run one way.** The cart imports nothing from products. Products use only the cart's
  quantity buttons. This is what stops a growing codebase turning into a tangle.
- **`app/` stays thin.** It wires features into pages. Rules and data handling live in the features.
- **Outside data is checked at the edge.** API responses, URL parameters and saved cart data are all
  validated before use. Money is integer cents everywhere.
- **Tests sit next to the code** they cover, and CI runs lint, types, tests, coverage thresholds and
  a dependency audit on every change.

**Adding a new feature (for example wishlist)**

1. Create `features/wishlist/` with its own logic, store and components.
2. Keep the rules as plain functions, and test them first.
3. Expose a small component or hook to the rest of the app. Do not import another feature's
   internals.
4. Add it to a page in `app/`.

**Not enforced yet**

- The one-way dependency rule is a habit, not a lint rule.
- There is no `CODEOWNERS` file assigning folders to people.
- It is one package, not a monorepo. That is fine for this size.

## Trade-offs we accept

- Zustand gives us less structure than Redux, so the team has to keep the one-folder-per-feature
  habit.
- The cart feature has two small stores (the cart, and the product details lookup). Each is simple,
  but there are two to learn.
- The cart lives in one browser. It does not follow the user to another device.

## When to change this decision

- **More client-side server data appears** (order history, live stock): add TanStack Query for
  caching and retries. The cart store would not change.
- **Many developers need strict conventions, devtools or middleware:** consider Redux Toolkit.
- **The cart must follow users across devices:** it needs accounts and a server-side cart.
- **Features start importing each other's internals:** enforce the boundary with a lint rule, or
  split the code into packages.

## History

Two decisions changed after measuring (numbers in [performance-notes.md](performance-notes.md)):

- **Saved-cart validation is hand-written, not Zod.** Zod added about 14 kB to every page for four
  checks. Zod is still used on the server for API data.
- **The cart drawer fetches its own products on demand.** The first design passed the whole product
  list from the header, which grew every page with the catalogue (280 kB extra at 1,000 products).
