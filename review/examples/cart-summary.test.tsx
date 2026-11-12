// @vitest-environment jsdom
/**
 * One behaviour spec, run against the original component and the refactor.
 *
 * For the original, each test is wrapped in `it.fails`: it PASSES only if the assertion FAILS,
 * which proves the bug is real. If someone fixes the original by accident the test goes red
 * and says so. For the refactor the same assertions must simply pass.
 */
import { Profiler, useContext, type ReactNode } from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { useProductDetails } from "@/features/cart/product-details";
import { useCartStore } from "@/features/cart/store";
import { server } from "@/test/server";
import * as After from "./cart-summary.after";
import * as Before from "./cart-summary.before";

type Line = { productId: number; quantity: number };
type Product = { id: number; title: string; price: number; image: string };
type Commits = { summary: number; badge: number };

const product = (id: number, title = `Product ${id}`): Product => ({
  id,
  title,
  price: id * 1000,
  image: "https://fakestoreapi.com/img/x.png",
});

/** Serves /api/cart-products from `catalog`; `gate` lets a test hold back one specific request. */
function serve(catalog: Product[], gate?: { ids: string; promise: Promise<void> }) {
  const calls: string[] = [];
  server.use(
    http.get("/api/cart-products", async ({ request }) => {
      const ids = new URL(request.url).searchParams.get("ids") ?? "";
      calls.push(ids);
      if (gate && ids === gate.ids) await gate.promise;
      const wanted = ids.split(",").map(Number);
      return HttpResponse.json(catalog.filter((p) => wanted.includes(p.id)));
    }),
  );
  return calls;
}
const deferred = () => {
  let release!: () => void;
  const promise = new Promise<void>((r) => (release = r));
  return { promise, release };
};
const settle = () => act(() => new Promise((r) => setTimeout(r, 60)));

type Harness = {
  name: string;
  /** true = the original; its tests are expected to fail */
  broken: boolean;
  mount: (lines: Line[]) => { add: (id: number) => void; commits: Commits };
  /** change a row's quantity the way this UI allows */
  bump: (title: string) => Promise<void>;
  quantityOf: (title: string) => string;
};

const row = (title: string) => screen.getByText(title).closest("li")!;

function profile(commits: Commits, node: { summary: ReactNode; badge: ReactNode }) {
  return (
    <>
      <Profiler id="summary" onRender={() => void (commits.summary += 1)}>
        {node.summary}
      </Profiler>
      <Profiler id="badge" onRender={() => void (commits.badge += 1)}>
        {node.badge}
      </Profiler>
    </>
  );
}

const beforeHarness: Harness = {
  name: "original",
  broken: true,
  mount(lines) {
    const commits = { summary: 0, badge: 0 };
    const api: { add?: (id: number) => void } = {};
    const Grab = () => {
      api.add = useContext(Before.CartContext).add;
      return null;
    };
    render(
      <Before.CartProvider initialItems={lines}>
        <Grab />
        {profile(commits, { summary: <Before.CartSummary />, badge: <Before.CartBadge /> })}
      </Before.CartProvider>,
    );
    return { add: (id) => act(() => api.add!(id)), commits };
  },
  bump: async (title) => {
    await userEvent.setup().type(within(row(title)).getByRole("spinbutton"), "9");
  },
  quantityOf: (title) => (within(row(title)).getByRole("spinbutton") as HTMLInputElement).value,
};

const afterHarness: Harness = {
  name: "refactor",
  broken: false,
  mount(lines) {
    const commits = { summary: 0, badge: 0 };
    useCartStore.setState({ lines, hydrated: true });
    render(profile(commits, { summary: <After.CartSummary />, badge: <After.CartBadge /> }));
    return { add: (id) => act(() => useCartStore.getState().add(id)), commits };
  },
  bump: async (title) => {
    await userEvent
      .setup()
      .click(within(row(title)).getByRole("button", { name: /^Increase quantity/ }));
  },
  quantityOf: (title) =>
    within(within(row(title)).getByRole("group")).getByText(/^\d+$/).textContent!,
};

beforeEach(() => {
  localStorage.clear();
  useCartStore.setState({ lines: [], hydrated: true });
  useProductDetails.setState({ byId: {}, unavailable: {}, pending: {}, error: false });
});

describe.each([beforeHarness, afterHarness])("CartSummary ($name)", (h) => {
  // The original must FAIL each of these. `it.fails` flips the result so CI stays green.
  const test = h.broken ? it.fails : it;

  test("1. renders API text as text, never as markup (XSS)", async () => {
    const hostile = "<img src=x onerror=alert(1)>Evil";
    serve([product(1, hostile)]);
    h.mount([{ productId: 1, quantity: 1 }]);
    await settle();
    expect(document.querySelector("img[onerror]")).toBeNull();
    expect(screen.getByText(hostile)).toBeInTheDocument(); // visible as literal text
  });

  test("2. removing a row does not hand its state to the next row (index keys)", async () => {
    serve([product(1), product(2)]);
    h.mount([
      { productId: 1, quantity: 1 },
      { productId: 2, quantity: 5 },
    ]);
    await waitFor(() => expect(screen.getByText("Product 2")).toBeInTheDocument());
    await h.bump("Product 1"); // the user edits row 1 first
    await userEvent
      .setup()
      .click(within(row("Product 1")).getByRole("button", { name: /remove/i }));
    expect(h.quantityOf("Product 2")).toBe("5"); // original shows row 1's edited value instead
  });

  test("3. a slow, older response cannot overwrite a newer one (fetch race)", async () => {
    const gate = deferred();
    serve([product(1), product(2)], { ids: "1", promise: gate.promise });
    const { add } = h.mount([{ productId: 1, quantity: 1 }]); // request A is held back
    add(2); // request B (the newer one) answers immediately
    await waitFor(() => expect(screen.getByText("Product 2")).toBeInTheDocument());
    gate.release(); // request A finally lands, after B
    await settle();
    expect(screen.getByText("Product 1")).toBeInTheDocument();
    expect(screen.getByText("Product 2")).toBeInTheDocument(); // original loses product 2
  });

  test("4. one change is one render: no effect-driven derived state", async () => {
    serve([product(1), product(2)]);
    const { commits } = h.mount([
      { productId: 1, quantity: 1 },
      { productId: 2, quantity: 1 },
    ]);
    await waitFor(() => expect(screen.getByText("Product 2")).toBeInTheDocument());
    await settle();
    commits.summary = 0;
    await userEvent
      .setup()
      .click(within(row("Product 1")).getByRole("button", { name: /remove/i }));
    await settle();
    expect(commits.summary).toBe(1); // original re-renders once for the item, then again for total
  });

  test("5. a component that only needs the count ignores unrelated updates", async () => {
    const gate = deferred();
    serve([product(1)], { ids: "1", promise: gate.promise });
    const { commits } = h.mount([{ productId: 1, quantity: 1 }]);
    await settle();
    commits.badge = 0;
    gate.release(); // product details arrive: the cart count has not changed
    await settle();
    expect(commits.badge).toBe(0); // original's single context value re-renders every consumer
  });
});

describe("the refactor, behaviour the original also needs to keep", () => {
  it("shows a correct total once prices are known and a placeholder before", async () => {
    serve([product(1), product(2)]);
    afterHarness.mount([
      { productId: 1, quantity: 2 },
      { productId: 2, quantity: 1 },
    ]);
    expect(screen.getByText("Total: —")).toBeInTheDocument(); // not $0.00: that would be wrong
    await waitFor(() => expect(screen.getByText("Total: $40.00")).toBeInTheDocument()); // 2x$10 + 1x$20
  });

  it("gives the remove button an accessible name that says what it removes", async () => {
    serve([product(1)]);
    afterHarness.mount([{ productId: 1, quantity: 1 }]);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Remove Product 1 from cart" }),
      ).toBeInTheDocument(),
    );
  });
});
