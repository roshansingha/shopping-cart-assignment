# Responsive design and accessibility

The strategy, the choices behind it, what was checked, and what was not.

## Is it fully achieved?

**Responsive design: yes, as far as a browser test can show.** Checked at seven widths from 320 px to
1920 px, in Chromium. At every width there is no horizontal scrolling, the layout adapts, the header
and cart drawer fit, and axe finds no issues. It has not been tested on real devices or in Safari or
Firefox.

**Accessibility: the main requirements are met and tested, but "fully" would overstate it.**
Structure, keyboard use, focus, contrast and ARIA are all deliberate and checked with axe and
keyboard tests. It has **not** been tested with a screen reader, and some touch targets are smaller
than the 44 px often recommended. Both are listed under "Trade-offs" below.

## Responsive design

### Strategy

- **Mobile first.** The default layout is the phone layout. Wider screens add columns and spacing.
- **The page adapts to the width, not to the device.** There are no device checks, only breakpoints.
- **Images are sized for the slot they fill**, so a phone does not download a desktop-sized image.

### What changes at each width

- **Under 640 px (phones):** a 2-column product grid. The search box and both dropdowns stack on
  top of each other. The cart drawer fills the whole screen width.
- **640 px and up (tablets):** 3 columns. The three filters sit in one row. The drawer is capped at
  448 px wide.
- **1024 px and up (laptops and desktops):** 4 columns. Content is centred and capped at 72 rem so
  lines do not become too long.

### Evidence (production build, Chromium)

Widths tested: 320, 375, 640, 768, 1024, 1280 and 1920 px.

- **No horizontal scrolling** at any width, including 320 px. That width is the same as zooming a
  1280 px screen to 400%, which is the standard reflow test.
- **Grid columns** step 2 → 3 → 4 as expected.
- **The header fits** and the Cart button stays on screen at every width.
- **The open cart drawer fits** at every width (full width on phones, 448 px above that).
- **axe finds nothing** at WCAG 2.2 AA on the product list and on the open drawer at every width.
- **Zoom is not blocked.** The page does not disable pinch zoom, and the page language is set.

A gap found during this check and fixed: the search and dropdown text was 14 px on phones. iOS Safari
zooms the whole page when a text field smaller than 16 px is focused. It is now 16 px up to 767 px
wide and 14 px from tablet up.

## Accessibility strategy

Three principles, in order:

1. **Use the browser's own elements first.** A real `button`, `select`, `label`, `nav`, `dialog` and
   list already carry correct meaning, keyboard behaviour and focus handling. Using them is
   cheaper and more reliable than recreating them with ARIA.
2. **Add ARIA only where the native element falls short.** Wrong ARIA is worse than none.
3. **Check in a real browser, and measure instead of assuming.** Contrast ratios are calculated, and
   axe and keyboard tests run in Chromium. A jsdom test cannot show most of this.

## The breakdown, point by point

### Page structure

- The page language is set (`lang="en"`), and the tab title is the brand name.
- Landmarks: a header, one `main`, a labelled search form, and a labelled pagination `nav`.
- Headings go in order: one `h1` ("Products"), then an `h2` per product card. The cart drawer has
  its own `h2`.
- A **skip link** is the first thing you can tab to. It jumps to the main content.

### Keyboard

- Everything can be reached and used with the keyboard, in a natural order. No custom tab order.
- **Escape** closes the cart drawer.
- Tested in a real browser: the skip link moves focus to the main content, Escape closes the
  drawer, and focus returns to the Cart button.

### Focus

- Buttons and links get a clear 3 px ring that sits outside the element.
- Search and dropdown fields get a neutral 2 px edge instead, so focus looks like part of the field
  and not like a second border. It is very visible: 17.9:1 contrast on a white field, 15.1:1 on a
  dark one.
- The main content area can receive focus (for the skip link) but shows no ring, because it is not
  something you interact with.
- **Focus is never dropped when a control disappears.** Add to cart and the quantity stepper swap
  places, and drawer lines disappear when removed. Each time, focus moves to the control that took
  the pressed one's place (details in [cart-behavior.md](cart-behavior.md)). The `+` button at the
  cap uses `aria-disabled` rather than `disabled` for the same reason, and the "Maximum of 10" note
  is its description.

### The cart drawer

- It is a native `<dialog>` opened as a modal. The browser provides Escape to close, an inert page
  behind it, and focus returning to the button that opened it.
- Tab never reaches the page behind it. Strictly, it is not a closed loop: after the last control,
  Tab goes to the browser's own toolbar and then back into the dialog. That is the platform's
  behaviour and keeps the browser reachable, so we did not add a script to force a closed loop.
- It is named by its heading. The title and Close button always exist, so focus has somewhere to
  land the moment it opens.
- Page scrolling is locked while it is open.

### Forms

- Every field has a visible label, and the search form is exposed as a search landmark.
- Field text is 16 px on phones (see above).

### Announcements for screen readers

- One polite live region announces cart changes: "Backpack added. Quantity 2.", "Maximum of 10
  reached.", "Backpack removed from cart."
- The "N products" count announces filter results.
- "Loading prices…" is announced while the cart loads, and a failed price lookup is announced as an
  alert with a retry button.
- The 10-per-product limit is also shown as visible text, so it does not depend on colour or sound.

### Names that make sense out of context

- Repeated buttons name their product: "Add to cart: Backpack", "Remove Backpack from cart",
  "Increase quantity of Backpack". Without the name, every button would sound the same in a list
  of buttons.
- **The visible words stay inside the accessible name.** The first version said "Add Backpack to
  cart", which axe flagged, because someone using voice control who says "click Add to cart"
  would not match it. It is now "Add to cart: Backpack".
- The Cart button's name includes the count: "Cart, 2 items".
- Ratings have hidden text ("out of 5 stars"). Product images use empty alt text because the
  product title is right beside them. Decorative icons are hidden from assistive technology.

### Colour and contrast

- Contrast was **calculated**, not eyeballed. Text ranges from 5.0:1 to 17.9:1, all above the 4.5:1
  requirement.
- The first check found form-field borders at about 1.5:1, below the 3:1 needed for the edges of
  controls. They are now 4.8:1 on white.
- Dark mode follows the system setting and was checked separately.
- Nothing is conveyed by colour alone.

### Motion

- The loading skeleton's pulse only plays when the user has not asked for reduced motion.

## Where ARIA is used, and why

- **Product names inside button labels,** because native text alone would repeat "Add to cart" on
  every card.
- **The polite live region,** because there is no native way to announce a change that happens
  somewhere else on the page.
- **`aria-haspopup="dialog"` on the Cart button,** so it is announced as opening a dialog.
- **`role="status"` and `role="alert"`** for the result count, the loading message and the
  price-lookup failure.
- **`role="search"` on the filter form,** since a plain form is not a landmark.
- **`aria-hidden` on decorative icons and the badge number,** because the button's own label already
  says the count.

Deliberately **not** used: `role="button"` on a div, a custom dropdown built from ARIA, hand-written
focus-trap code, or any `tabindex` above zero.

## How it is tested

- **axe, in a real browser,** on the product list, the empty state, the open cart drawer, and a
  320 px-wide screen. It runs with the standard WCAG 2 A and AA rule sets. A wider sweep from 320
  to 1920 px, also at WCAG 2.2 AA, is in `scripts/a11y/responsive-check.mjs` (`pnpm a11y:widths`).
  It is run by hand, not in CI.
- **Keyboard tests** for the skip link, Escape, focus return and the focus trap.
- **Calculated contrast** for every text and control colour pair, in light and dark.
- **Width sweep** at seven widths for scrolling, layout, header and drawer fit
  (`pnpm a11y:widths`, against the running e2e build).

axe finds only a share of real problems, so a clean result is evidence, not proof.

## Trade-offs

- **No screen-reader testing** (VoiceOver, NVDA, TalkBack). Announcement wording is checked in the
  page, not heard.
- **Some touch targets are under 44 px.** All are above the 24 px WCAG 2.2 AA minimum, but:
  Add to cart 36 px, Cart button 38 px, fields and quantity buttons 40 px, the Next link 34 px, the
  brand link 28 px. Making them 44 px would change the look, so it was not done.
- **Announcements are English only** and fixed text.
- **Chromium only.** The native dialog and dropdown look and behave slightly differently in Safari
  and Firefox, and that has not been checked.
- **No real-device testing,** and no check of high-contrast mode, custom text spacing or
  right-to-left layouts.
- **The page scroll lock uses `:has()`,** which older browsers ignore. The drawer still works there.
