# Cart: features and edge cases

What the cart does, why it is built this way, and what happens when real usage gets messy.
This is the answer to the brief's "Add to Cart" section.

## Features

### Add to cart

- Every product card has an **Add to cart** button.
- Once a product is in the cart, the button becomes a **− quantity +** stepper.
- The button is disabled for a moment after the page loads, until the saved cart has been read (see
  scenario 7).

### Quantity management

- **Increment** with `+`, **decrement** with `−`.
- Decrementing from 1 removes the product from the cart.
- **Remove** in the cart drawer removes the whole line at once.
- Quantity is capped at **10 per product** (see scenario 3).

### Cart count and summary update everywhere

- The header badge, every product card's stepper, and the cart drawer all read from **one store**.
- Each place subscribes only to what it needs (the count, or one product's quantity), so a change
  updates exactly the places that show it and nothing else.
- This is tested: changing one product does not re-render the other cards.

### Cart drawer

- Shows each line with its image, title, line price and a stepper, plus the **total**.
- Product details are fetched **only for the products in the cart, and only when the drawer opens**.
- While prices load it says "Loading prices…", and the total shows "—" instead of a wrong number.
- If the lookup fails, it says so and offers **Try again**.

### Persistence across reloads

- The cart is saved in the browser's **localStorage** and read back on load.
- Only the product id and quantity are saved, never prices or titles.

### Keyboard focus after a change

- Pressing **Add to cart** replaces that button with the stepper, so focus moves to `+`. Pressing
  `−` at quantity 1 brings the Add button back, and focus moves to it. Without this, the pressed
  button disappears and focus falls to the top of the page.
- In the drawer, removing a line moves focus to the Remove button of the line that took its place,
  else the line above, else Close.
- Only the user's own click moves focus. A change arriving from another tab never does.

### Announcements for screen readers

- Every change is announced in one polite live region, for example "Backpack added. Quantity 2." and
  "Maximum of 10 reached."

## Why localStorage

- There are no accounts or server-side carts, so the cart belongs to the browser.
- localStorage is synchronous, simple, and survives closing the tab. `sessionStorage` would lose
  the cart when the tab closes.
- Cookies are sent to the server on every request, which is wasteful for data only the browser
  needs. IndexedDB is asynchronous and more than a small cart requires.
- A server-side cart would add sync across devices, but it needs accounts. That is out of scope
  (see "What we did not handle").

## Scenarios we considered

### 1. Rapid repeated clicks

**Problem:** a fast double or triple click must add 2 or 3, not 1.

**What we do**

- Every change is a synchronous update that starts from the **latest** cart, never from a stale
  copy. Two clicks in the same instant both count.
- We do **not** debounce or disable the buttons. The cap makes extra clicks harmless, and
  debouncing would make the cart feel slow.

**Proof:** `store.test.ts` ("rapid clicks are not lost") and `cart.integration.test.tsx` ("rapid
clicks are all counted").

### 2. Stale state across tabs

**Problem:** with two tabs open, a change in one tab should show up in the other.

**What we do**

- When one tab saves the cart, the browser fires a `storage` event in the **other** tabs.
- Each tab listens for it (`CartHydrator`) and re-reads the cart. Clearing the storage in one tab
  also empties the others.
- A tab does not receive its own events, and saving an identical value does not fire one, so
  there is no loop.

**Proof:** `e2e/shop.spec.ts` ("two tabs stay in sync through storage events") and the store test
for syncing and cleared storage.

**Known limit:** if two tabs change the cart in the same few milliseconds, the later write wins and
the earlier change can be lost. Real users do not hit this, and it is not tested.

### 3. Adding more than is available (stock)

**Problem:** the API has no stock information, but a real cart must not allow unlimited quantities.

**What we do**

- We **simulate** a limit of **10 per product** (`MAX_QUANTITY`).
- The limit is enforced in the **cart logic itself**, not just the buttons, so no code path can go
  over it.
- At the limit, the `+` button is marked `aria-disabled` (not `disabled`, which would drop keyboard
  focus the moment it applied), a visible message appears ("Maximum of 10 per item."),
  and the live region announces it.

**Proof:** `logic.test.ts` (large quantities, NaN, negatives), the integration test "stops at the
cap, disables +, and explains why", and the E2E test "caps quantity at 10 with a visible message".

### 4. Corrupted or tampered saved data

**Problem:** localStorage can hold anything: bad JSON, an old format, or values edited by hand.

**What we do**

- On load the saved cart is **validated**. If anything is wrong (bad shape, a negative or over-limit
  quantity, more than 100 lines), the **whole saved cart is discarded** and the cart starts empty.
  We never half-trust bad data.
- Duplicate lines for the same product are merged.

**Proof:** the corrupted-input cases in `persistence.test.ts` and `store.test.ts` (bad JSON, wrong
shape, negative or over-limit quantities, too many lines), and the E2E test "starts empty when
stored cart data is corrupted".

### 5. Browser storage unavailable or full

**Problem:** private browsing modes and full storage can make saving throw errors.

**What we do:** storage access is wrapped so errors are swallowed. The cart keeps working in
memory for that tab. It just won't survive a reload.

**Proof:** `store.test.ts` ("never throws when localStorage is blocked or full").

### 6. Data changing underneath the cart

- **A price changes after something was added:** we never store prices, so the total always uses the
  current price. The trade-off is that a total can change between visits, which is fine with no
  checkout.
- **A product disappears from the catalogue:** the line shows "Unavailable item" with a Remove
  button, and counts as 0 in the total.
- **The price lookup fails:** an error with Try again, and the total is hidden instead of wrong.

**Proof:** the drawer tests in `cart.integration.test.tsx`.

### 7. The page loads before the cart has been read

**Problem:** if someone clicked Add in the first instant, the saved cart could be overwritten.

**What we do:** the cart is read from storage right after the page loads, and **Add to cart is
disabled until that is done**. This also avoids a mismatch between the server-rendered page and the
browser.

**Proof:** the integration test "disables Add until the cart has hydrated".

## What we did not handle

- **Multi-device sync.** A cart built on a phone does not appear on a laptop. It needs accounts and
  a server-side cart. This is the edge case we deliberately left out.
- **Simultaneous writes from two tabs** in the same few milliseconds (scenario 2).
- **Real stock.** The limit of 10 is a stand-in for a stock number the API does not provide.
- **Checkout.** There is none, which is why using the current price is safe. If checkout is added,
  the server must recompute totals from product ids and quantities and never trust the browser's.

## Where to look

- Cart logic (add, decrement, set, remove, totals): `src/features/cart/logic.ts`
- The store and persistence: `src/features/cart/store.ts` and `persistence.ts`
- Cross-tab sync: `src/features/cart/components/cart-hydrator.tsx`
- Quantity buttons and announcements: `quantity-stepper.tsx`
- The drawer and its price lookup: `cart-drawer.tsx` and `product-details.ts`
- State management decision: [ADR-001](adr-001-state-management.md)
