# Code review: `CartSummary` widget

**PR:** "Add cart summary widget" (a fictional PR for this exercise)
**Files under review:** [`examples/cart-summary.before.tsx`](examples/cart-summary.before.tsx)
**Proposed refactor:** [`examples/cart-summary.after.tsx`](examples/cart-summary.after.tsx)
**Evidence:** [`examples/cart-summary.test.tsx`](examples/cart-summary.test.tsx) (run with `corepack pnpm vitest run review`)

**Verdict: request changes.** Nice, readable first pass, and the demo works. But there are five problems that only show up under real usage. Three should block the merge (1, 2, 3), two I'd like fixed in this PR (4, 5). I wrote a refactor and a test file so you can see each problem fail rather than take my word for it.

## How to reproduce everything below

One behaviour spec runs against both versions. For the original, each test is wrapped in `it.fails`, so it passes only when the assertion fails (proving the bug is real) and turns red if anyone fixes the original without updating this review. For the refactor the same assertions just pass.

| #   | Behaviour                                             | Original                                             | Refactor     |
| --- | ----------------------------------------------------- | ---------------------------------------------------- | ------------ |
| 1   | API text is rendered as text, never as markup         | **fails**: a live `<img onerror>` element is created | passes       |
| 2   | Removing a row doesn't hand its state to the next row | **fails**: row 2 shows `19`, should be `5`           | passes       |
| 3   | A slow, older response can't overwrite a newer one    | **fails**: Product 2 disappears                      | passes       |
| 4   | One change is one render                              | **fails**: 3 renders                                 | 1 render     |
| 5   | A count-only component ignores unrelated updates      | **fails**: re-renders 2 times                        | 0 re-renders |

I checked that the original fails each test **for the stated reason** (by running them as normal tests and reading the failure messages), not because of a mistake in the test harness.

---

## 1. Blocking: API data is injected as HTML (security)

```tsx
<span dangerouslySetInnerHTML={{ __html: products[item.productId]?.title ?? "" }} />
```

**Problem.** `title` comes from a third-party API. `dangerouslySetInnerHTML` turns whatever it sends into live markup. A title like `<img src=x onerror=…>` becomes a real element; the test confirms it.

**Why it matters.** This is an XSS hole whose only precondition is that the upstream data is wrong or compromised, which we don't control. Our CSP currently allows inline scripts (see `docs/security-notes.md`), so there is no safety net behind this line.

**Fix.** Render it as a text child: `<span>{title}</span>`. React escapes it.

**Trade-off.** Titles containing real HTML would show literally. We don't have any (I checked the 20 real products). If we ever need rich text, sanitize with an allow-list library at a single trusted boundary rather than sprinkling `dangerouslySetInnerHTML` around.

## 2. Blocking: index keys plus an uncontrolled input (correctness)

```tsx
{items.map((item, index) => (
  <li key={index}>
    …
    <input type="number" defaultValue={item.quantity} onChange={…} />
```

**Problem.** React matches list items by position. When row 1 is removed, row 2 _becomes_ position 1 and inherits the DOM element that was there, including whatever the user had typed into its input. `defaultValue` only sets the initial value, so it can't overwrite a value the user already edited.

**Repro (from the test).** Rows: Product 1 (qty 1), Product 2 (qty 5). Edit row 1's quantity, then remove row 1. Product 2 now shows `19`, row 1's edited value, instead of `5`.

**Why it matters.** In a cart this is the worst kind of bug: it's silent, and it shows the customer the wrong quantity against the wrong item, next to a price.

**Fix.** Two changes, and both are needed:

- `key={l.productId}`: a stable identity, so removal never reassigns elements.
- Don't keep quantity in uncontrolled DOM state at all. The store is the single source of truth, and the quantity is shown by the existing `QuantityStepper`, which also enforces the 10-item cap that this input silently ignores (you can type `-5` or `999999` into it today).

**Trade-off.** A stepper replaces free typing of a number. For a cart that is usually better UX, and it removes a whole class of invalid input (NaN, negatives, fractions).

## 3. Blocking: fetch in an effect with no race protection (correctness)

```tsx
useEffect(() => {
  fetch(`/api/cart-products?ids=${…}`)
    .then((r) => r.json())
    .then((list) => setProducts(Object.fromEntries(list.map((p) => [p.id, p]))));
}, [items]);
```

**Problems.**

- Every change to `items` fires a request, and responses can arrive out of order. The last one to _land_ wins, not the last one _sent_.
- `setProducts` **replaces** the whole map with whichever response came back, so a stale response throws away newer data.
- No `AbortController`, no `.catch`: a failed request is an unhandled rejection and the UI sits on blank titles forever.
- It re-requests ids it already has, on every change.

**Repro (from the test).** Cart has Product 1, so request A (`ids=1`) is in flight. The user adds Product 2, request B (`ids=1,2`) returns immediately and both titles appear. Then request A finally lands and replaces the map with only Product 1. **Product 2 vanishes.** On a slow mobile connection this is easy to hit just by tapping quickly.

**Fix.** Use what the app already has: `useProductDetails().load(ids)`. It keys results by id and _merges_ them (so an old response can't remove newer entries), skips ids that are already loaded or in flight, remembers products the server says no longer exist, and exposes an error state. If you'd rather not use the store, the minimum fix is an `AbortController` in the effect's cleanup, merging instead of replacing, and a `.catch`.

**Trade-off.** The store is a module-level singleton shared by every component. That's the point (one cache), but tests need to reset it between runs.

## 4. Should fix: derived state kept in an effect (performance and correctness)

```tsx
const [total, setTotal] = useState(0);
useEffect(() => {
  setTotal(items.reduce(…));
}, [items, products]);
```

**Problem.** `total` is a pure function of `items` and `products`, but it's stored as separate state and synced by an effect. Each change therefore renders **twice**: first with the new items and the _old_ total, then again after the effect runs `setTotal`. When the product details arrive that's a third render.

**Evidence.** One click on Remove causes **3 renders** in the original and **1** in the refactor.

**Why it matters.** The first render briefly shows a total that doesn't match the rows above it, which is a flicker of wrong money on screen. It's also extra work on every interaction, and two pieces of state that can disagree.

**Fix.** Compute it while rendering: `totalCents(lines, prices)`. Rule of thumb: if you can calculate it from props or state, don't store it. While prices are still loading, show `—` rather than `$0.00` (the original shows a confident zero, which is wrong).

**Trade-off.** It's recalculated on every render. A cart is tens of lines at most (stored carts over 100 lines are rejected), so that is trivial. Reach for `useMemo` only if profiling ever shows a problem, and I'd want to see the numbers first.

## 5. Should fix: one big context value, duplicating the cart store (architecture and performance)

```tsx
<CartContext.Provider value={{ items, products, total, add, remove, setQuantity }}>
```

**Problems.**

- The `value` is a new object literal on every render, so **every** consumer re-renders whenever _anything_ in it changes. `CartBadge` only needs a count, but it re-rendered **2 times** when product details arrived, although the count hadn't changed (the refactor: 0).
- It re-implements the cart that `ADR-001` already decided to keep in a Zustand store. This copy has no persistence (the cart is lost on reload), no cross-tab sync, no stock cap, no validation of stored data, and its `add` creates a duplicate row instead of incrementing. Two sources of truth will drift.

**Fix.** Delete the provider and read from the store with selectors, so a component re-renders only when the value _it_ selected changes: `useCartStore((s) => itemCount(s.lines))`.

**Trade-off.** Context is the right tool for values that rarely change (theme, locale, the current user). It's a poor fit for frequently changing application state. If you did want to keep Context, splitting it into separate state and actions contexts and memoizing the value would help, but every state consumer would still re-render on every change, which selector subscriptions avoid.

---

## Smaller notes (not blocking)

- `createContext<any>` removes all type checking from every consumer. If a context stays, type it.
- The "Remove" button says only "Remove". A screen reader user hears the same label on every row. The refactor labels it "Remove _Product name_ from cart".
- Showing `$0.00` while data loads reads as a real total. Use a placeholder.
- The `items.length === 0` early return in the effect leaves stale products around after the cart is emptied. Harmless today, confusing later.

## What I liked

- A clear split between a data provider and a presentational component. The refactor keeps that shape: the effect fetches, and the component just renders.
- `aria-label` on the section landmark and a real `<button>` for remove. Good defaults.
- Functional `setItems((prev) => …)` updates, so rapid clicks don't lose changes. That's the right instinct and easy to forget.

## What I'm _not_ asking for

- No new dependency (React Query and similar). The app has one read-only lookup and the existing store handles it. ADR-001 says when to revisit.
- No `useMemo`/`React.memo` sprinkled in "just in case". Selector subscriptions fix the actual cause; memoizing around a broken context value would only hide it.
