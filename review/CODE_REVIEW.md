# Code review: `CartSummary` widget

- **PR:** "Add cart summary widget" (a fictional PR written for this exercise)
- **Under review:** [`examples/cart-summary.before.tsx`](examples/cart-summary.before.tsx)
- **Proposed refactor:** [`examples/cart-summary.after.tsx`](examples/cart-summary.after.tsx)
- **Evidence:** [`examples/cart-summary.test.tsx`](examples/cart-summary.test.tsx), run with
  `pnpm vitest run review`

The anti-pattern this exercise is about is **derived state kept in an effect**. I have run into it
in production code, and it is the main comment below, written as I would leave it on the PR. While
writing the example I also gave it four other defects, so the refactor could be checked against
each. They are summarised in the appendix. Three of them block the merge on their own.

---

## The review comment

> **`cart-summary.before.tsx`, lines 26 and 38–41: please compute `total` during render instead of
> syncing it with an effect.**
>
> ```tsx
> const [total, setTotal] = useState(0);
>
> // keep the total up to date
> useEffect(() => {
>   setTotal(items.reduce((sum, i) => sum + (products[i.productId]?.price ?? 0) * i.quantity, 0));
> }, [items, products]);
> ```
>
> `total` is never independent data. It is a pure function of `items` and `products`, which are
> already in state. Storing it a second time and copying it across in an effect gives us two
> sources of truth, and the effect is the only thing keeping them in agreement.
>
> **What goes wrong:**
>
> - **A frame of wrong money.** When `items` changes, React renders with the new items and the
>   _old_ total, commits that to the screen, runs the effect, and then renders again with the right
>   total. For one frame the list and the total disagree. In a cart that is the wrong number next
>   to a price.
> - **Twice the rendering.** One click on Remove renders this component **3 times** here, against
>   **1** in the refactor (measured with React's `<Profiler>`, test 4 in the spec).
> - **It breaks quietly when the code changes.** This is how I have seen it fail in production:
>   someone later adds a discount, or tax, or a new field, and forgets to add it to the effect's
>   dependency list. Nothing errors. The total is simply stale until something else happens to
>   change. With the value computed during render, there is no list to forget.
> - **Lint already flags it:** `react-hooks/set-state-in-effect`. It is the only error in this PR.
>
> **Suggested change.** Delete the state and the effect, and compute the value where it is shown,
> using the cents helper we already have:
>
> ```tsx
> const prices = new Map(Object.values(byId).map((p) => [p.id, p.price]));
> const total = settled ? totalCents(lines, prices) : null; // null until every price is known
> …
> <p>Total: {total === null ? "—" : formatCents(total)}</p>
> ```
>
> Showing `—` until every price has loaded also fixes a smaller issue: today the widget shows a
> confident `$0.00` while prices are still loading.
>
> **Cost:** the sum is recomputed on every render. A cart is tens of lines at most, so this is
> trivial. Reach for `useMemo` only if profiling ever shows a need, not in advance.
>
> **The rule I would apply:** an effect is for synchronising with something _outside_ React (here,
> the fetch). A value that can be calculated from props or state should be calculated, not stored.
> The refactor moves this into the shared `useCartProducts` hook, which the real cart drawer uses
> too, so the calculation exists once.

---

## How the fix is proven

- **The same spec runs against both versions.** For the original, each test is wrapped in
  `it.fails`, so it passes only if the bug is really there. For the refactor, the same assertions
  must pass. I also ran the original's tests as ordinary tests and read the failures, to check they
  fail for the stated reason and not a setup error.
- **Test 4, "one change is one render"**, counts commits with `<Profiler>`: 3 for the original, 1
  for the refactor.
- **The total is checked as a value:** correct once prices are known, `—` before.

---

## Appendix: the other defects in this PR

Short versions. Each has a failing test against the original and a passing one against the
refactor.

| #   | Defect                                                   | Severity   | What happens                                                                                                                                                                                             | Fix                                                                                        |
| --- | -------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 1   | `dangerouslySetInnerHTML` on the product title           | Blocking   | A title from the third-party API becomes live markup (`<img onerror=…>`). Our CSP allows inline scripts, so nothing stops it.                                                                            | Render `{title}` as text. React escapes it.                                                |
| 2   | `key={index}` with an uncontrolled `<input>`             | Blocking   | Edit row 1, remove row 1: row 2 inherits row 1's typed value. A wrong quantity against the wrong product.                                                                                                | `key={productId}`, and the existing `QuantityStepper` instead of a free-typed input.       |
| 3   | Fetch in an effect with no race protection or error path | Blocking   | An older, slower response replaces the map and **Product 2 vanishes**. No `.catch`, so a failure leaves blank titles forever.                                                                            | The app's existing loader, which merges by id, skips ids in flight and has an error state. |
| 5   | One context value holding everything                     | Should fix | A new object every render, so every consumer re-renders: `CartBadge` rendered 2 times when prices arrived (refactor: 0). It also duplicates the cart store without persistence, the limit or validation. | Read the Zustand store through selectors, e.g. `useCartStore((s) => itemCount(s.lines))`.  |

**Smaller notes:** remove the `any` on the context and its `eslint-disable`; give each Remove
button a name that says what it removes; the early return on an empty cart leaves old products in
state.

**What the tooling caught:** ESLint caught 1 of the 5 defects (the one in the main comment).
TypeScript caught none, because `createContext<any>` turns checking off. A build would pass. The
PR had no tests, and the project-wide 80% coverage floor would not have stopped it either: adding
it untested drops line coverage from 96% to 88%, which still passes. Only tests caught all five.
That is why I would also ask, as a team rule, that a PR adding a component adds its tests.

**What I liked:** a clear split between data and display, which the refactor keeps; a real
`<button>` for Remove and a labelled section; and functional `setItems((prev) => …)` updates, so
rapid clicks are not lost.

**What I am not asking for:** no new dependency such as React Query, since the existing store
handles the one lookup (ADR-001 says when to revisit), and no `useMemo` or `React.memo` added "just
in case".
