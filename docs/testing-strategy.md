# Testing strategy

The aim is not a high test count. It is tests that **fail when the code is wrong**, placed where
they can prove the most for the least effort.

At the time of writing: 214 passing tests plus 5 that are meant to fail (see "How we know the tests
are meaningful"), in 21 files, and 22 browser tests.

## The principles

1. **Test behaviour, not implementation.** Tests find things the way a user does (by role and
   accessible name), so they survive refactors and also catch accessibility mistakes.
2. **Put each check at the cheapest layer that can prove it.** Pure rules are tested without a
   browser. Only what needs a real browser is tested in one.
3. **Prove that the tests can fail.** A passing test says little. We break the code on purpose and
   check that the tests notice.
4. **Hold the strictest bar where mistakes cost most.** Money, saved data and input handling get
   higher coverage than layout glue.
5. **No surprises from the network.** Unit and integration tests cannot reach the real API, and
   browser tests run against a mock, so results are repeatable.

## The three layers

### 1. Unit tests (Vitest)

**What:** the rules, with no React and no browser.

- Cart logic: add, decrement, set and remove; totals; zero and negative quantities; removing the
  last item; large quantities; NaN; the 10-per-product limit; duplicate adds; the input is never
  changed.
- Money: prices become integer cents (for example 0.29 becomes 29, not 28).
- Search, filter, sort and pagination from the URL, including hostile and out-of-range values.
- The API client: a malformed payload, invalid JSON, a server error, a network failure and a
  blocked request (403).
- The saved cart: every kind of corrupted data, a cart that is too large, and storage that throws.
- Security headers, and the validation of product data.

**Why this layer:** these tests are fast and exact, and they cover the code where a mistake would be
most expensive.

### 2. Integration tests (React Testing Library + MSW)

**What:** real components working together, with the network faked at its edge.

- The product list in each state: loading, empty, error and the saved-catalogue fallback.
- Filter, sort, search (including the 300 ms delay) and pagination.
- The cart through the real store: add, increase, decrease, remove, the limit message,
  announcements, and the drawer's totals, loading and error states.
- Hostile content from the API rendered as plain text, never as markup.
- Only the changed product re-renders when the cart changes.

**Why these tools**

- **React Testing Library** queries by what a user sees, so tests do not depend on internals.
- **MSW** (Mock Service Worker) fakes the network, so the real data-fetching code runs unchanged. Any
  request without a prepared answer fails the test, so nothing can silently call the real API.

### 3. End-to-end tests (Playwright + axe)

**What:** the real app, in a real browser, doing what a user does.

- Browse, filter and sort through the URL, then paginate.
- Add to the cart, change quantities, check totals, **reload and confirm the cart persisted**.
- Two browser tabs staying in sync.
- The limit of 10, and a corrupted saved cart starting empty.
- Keyboard use: the skip link, Escape, focus returning, the focus trap.
- Accessibility with axe on four views: the list, the empty state, the open drawer and a 320 px
  screen.
- Security: the headers are present, normal use causes no CSP violations, and the CSP really blocks
  `eval`, scripts from other sites, injected styles and images from other sites.

**Why a real browser:** two tabs, focus returning, and a working CSP cannot be reproduced in a
simulated page. These tests found real bugs the other layers missed (for example button names that
did not match their visible text).

**Why it is repeatable:** the app is built for production and run against a local mock API, so the
results do not depend on an outside service.

## Coverage, and why these thresholds

- **80% across the project** (lines, functions, branches, statements). A floor that catches
  neglected code without rewarding tests of framework glue.
- **95% on the cart logic, the saved-cart validation and the query logic.** These hold the money
  and input rules. They are plain functions, so high coverage is cheap and meaningful.
- Not chased: thin framework glue such as the layout. The browser tests exercise it, and a unit
  test would only test a mock.
- **Current:** about 96% overall. The build fails if coverage drops below a threshold.
- **The report:** [coverage-report.md](coverage-report.md) lists every file. Regenerate it with
  `pnpm coverage:report`. CI also uploads the full HTML report with each run.

Coverage shows that code ran, not that a test would notice it breaking. That is why we also do the
checks below.

## How we know the tests are meaningful

### Breaking the code on purpose (mutation checks)

We changed the code in a deliberate wrong way, one change at a time, ran the tests, and restored it.
Every break was caught:

- **Cart and money logic:** 8 of 8 (limit removed, zero not removing a line, total ignoring
  quantity, rounding down, a page number not clamped, and others).
- **Saved-cart validation and re-render isolation:** 6 of 6.
- **Security protections:** 6 of 6 (for example eval allowed, images from any origin, framing
  allowed).
- **The saved-catalogue fallback:** 5 of 5 (including a bug being disguised as an outage).
- **The shared cart hook and utility:** 5 of 5 (for example fetching while disabled, or showing
  $0.00 instead of hiding the total while loading).
- **The focus and search-box fixes:** 8 of 8 (for example the search box not following the URL,
  focus not moved after Add, `disabled` instead of `aria-disabled` at the cap, and the drawer
  opened non-modally). One survived at first, always focusing the first drawer line, so a
  three-line test was added.

This was done by hand, not with an automated tool, so a break we did not think of could survive.

### A known-bad component

The code review exercise runs one test file against a deliberately flawed component and its fix.
For the flawed one, each test is marked "must fail", so the build stays green, but it turns red if
anyone fixes the flawed version by accident. We also ran those tests as ordinary tests to read the
failure messages, and confirmed each one fails for the stated reason, not because of a mistake in
the test.

### Checking the checks

- The smoke test, pointed at a server that is not running, fails every check.
- A test proves that a request with no prepared answer really fails.

### Tests that were wrong, and caught

These are recorded because they show the method working:

- A test said `eval` was allowed even though the policy blocks it. Playwright's own script channel
  bypasses that rule, so the test had to run the attempt as ordinary page code.
- A library option had been renamed, so the "fail on unexpected requests" guard was silently only
  warning.
- One of our own breaking scripts did nothing because the formatter had changed the line it looked
  for. It printed a warning and was re-run by hand.
- A test expected the wrong total ($4.00 instead of $40.00), and fixing the test, not the code, was
  right.
- The "drawer traps focus" browser test pressed Tab six times and checked focus was inside the
  dialog. It passed by coincidence: in a native modal dialog, Tab past the last control goes to the
  browser's toolbar and then wraps, and six presses from Close happened to land back inside. A
  change to where focus starts made it fail. It now records every Tab stop over two full cycles and
  fails if any lands on the page behind. Opening the drawer as non-modal makes it fail, as it should.

## The edge case we deliberately did not handle

**A cart that follows the user across devices.** It needs accounts and a server-side cart, which is
out of scope. Tabs in the same browser do stay in sync. The related risk of two tabs writing in the
same few milliseconds is also not handled or tested. Details in
[cart-behavior.md](cart-behavior.md).

## What is not tested

- **No screen-reader testing,** only axe and keyboard tests.
- **Chromium only.** Safari and Firefox are not tested.
- **The real API from a deployed host** is checked by hand with `pnpm smoke`, not in CI.
- **No visual-regression or load tests.** Performance measurements are run by hand.
- **No automated mutation tool,** only the manual checks above.
- **No real-device testing.**

## Running the tests

```bash
pnpm test        # unit and integration tests
pnpm coverage    # the same, with the coverage thresholds enforced
pnpm e2e         # browser tests (build the app and run it against the mock API)
pnpm smoke <url> # quick checks of a running or deployed site
```

On every push and pull request, CI runs the dependency audit, lint, type check, format check, the
coverage run, and the browser tests.
