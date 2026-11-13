# Coverage report

Generated on 2026-11-13 by `pnpm coverage:report`. Regenerate it after
changing code or tests. CI also uploads the full interactive HTML report with every run (the
`coverage-report` artifact on the Actions run page).

## Result

- **Thresholds:** all met.
- **Lines:** 96.3% (313 of 325)
- **Statements:** 96.5%
- **Branches:** 95.5% (210 of 220)
- **Functions:** 95.9%

## Thresholds, and why

- **80% across the project** (lines, functions, branches, statements). A floor that catches
  neglected code without rewarding tests of framework glue.
- **95% on the cart logic, the saved-cart validation and the query logic.** They hold the money and
  input rules and are plain functions, so high coverage is cheap and meaningful.
- The build fails if coverage drops below a threshold. The settings are in `vitest.config.ts`.
- Coverage shows that code ran, not that a test would notice it breaking. See
  [testing-strategy.md](testing-strategy.md) for how that is checked.

## Reading the low numbers

- **`page.tsx` and `cart-hydrator.tsx` show 0%** because unit tests do not run them. The browser tests
  do: every one loads the page, and the "two tabs stay in sync" test exercises the hydrator. Coverage
  from the browser tests is not included in this report.
- **`site.ts`** is two constants (the brand name and description).
- **Low branch numbers on a few components** (`filters.tsx`, `error.tsx`, `store.ts`) are
  defensive branches and default values that no test takes. The strict 95% bar applies to the cart
  logic, the saved-cart validation and the query logic, which are all at 100%.

## Per file

### `src/app`

- `api/cart-products/route.ts`: lines 100%, branches 100%, functions 100%
- `api/upstream-status/route.ts`: lines 100%, branches 75%, functions 100%
- `error.tsx`: lines 100%, branches 50%, functions 100%
- `page.tsx`: lines 0%, branches 100%, functions 0%

### `src/features/cart`

- `cart-products.ts`: lines 100%, branches 100%, functions 100%
- `components/cart-drawer.tsx`: lines 100%, branches 96.4%, functions 100%
- `components/cart-hydrator.tsx`: lines 0%, branches 0%, functions 0%
- `components/live-region.tsx`: lines 100%, branches 100%, functions 100%
- `components/quantity-stepper.tsx`: lines 100%, branches 100%, functions 100%
- `logic.ts`: lines 100%, branches 100%, functions 100%
- `persistence.ts`: lines 100%, branches 100%, functions 100%
- `product-details.ts`: lines 100%, branches 100%, functions 100%
- `store.ts`: lines 100%, branches 66.7%, functions 100%
- `use-cart-products.ts`: lines 100%, branches 100%, functions 100%

### `src/features/products`

- `api.ts`: lines 100%, branches 100%, functions 100%
- `components/filters.tsx`: lines 97.6%, branches 75%, functions 93.3%
- `components/pagination.tsx`: lines 100%, branches 100%, functions 100%
- `components/product-card.tsx`: lines 100%, branches 100%, functions 100%
- `components/product-grid.tsx`: lines 100%, branches 100%, functions 100%
- `components/products-section.tsx`: lines 100%, branches 100%, functions 100%
- `fallback.ts`: lines 100%, branches 100%, functions 100%
- `get-products.ts`: lines 100%, branches 100%, functions 100%
- `query.ts`: lines 100%, branches 100%, functions 100%
- `schema.ts`: lines 100%, branches 100%, functions 100%

### `src/shared`

- `money.ts`: lines 100%, branches 100%, functions 100%
- `security-headers.ts`: lines 100%, branches 100%, functions 100%
- `site.ts`: lines 0%, branches 100%, functions 100%
