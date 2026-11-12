// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { ProductCard } from "@/features/products/components/product-card";
import { productsSchema } from "@/features/products/schema";
import { rawProducts } from "@/test/fixtures";
import { server } from "@/test/server";
import { toCartProduct } from "../cart-products";
import { MAX_QUANTITY } from "../logic";
import { STORAGE_KEY } from "../persistence";
import { useProductDetails } from "../product-details";
import { useCartStore } from "../store";
import { CartDrawer } from "./cart-drawer";
import { CartLiveRegion } from "./live-region";

const products = productsSchema.parse(rawProducts);
const catalog = products.map(toCartProduct);

/** Stand-in for GET /api/cart-products: returns only the requested ids. */
const lookup = (calls?: string[]) =>
  http.get("/api/cart-products", ({ request }) => {
    const ids = new URL(request.url).searchParams.get("ids") ?? "";
    calls?.push(ids);
    const wanted = ids.split(",").map(Number);
    return HttpResponse.json(catalog.filter((p) => wanted.includes(p.id)));
  });

function setup() {
  render(
    <>
      <CartDrawer />
      <ul>
        <ProductCard product={products[0]} />
      </ul>
      <CartLiveRegion />
    </>,
  );
  return userEvent.setup();
}
const qty = () => within(screen.getByRole("group", { name: "Quantity of Product 1" }));
const openCart = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole("button", { name: /^Cart/ }));
const cartDialog = () => screen.getByRole("dialog", { name: "Your cart", hidden: true });

beforeEach(() => {
  localStorage.clear();
  useCartStore.setState({ lines: [], hydrated: true, announcement: { id: 0, text: "" } });
  useProductDetails.setState({ byId: {}, unavailable: {}, pending: {}, error: false });
  server.use(lookup());
});

describe("cart interactions", () => {
  it("add, increase, decrease and remove from the card", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Add to cart: Product 1" }));
    expect(qty().getByText("1")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Increase quantity of Product 1" }));
    expect(qty().getByText("2")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Decrease quantity of Product 1" }));
    await user.click(screen.getByRole("button", { name: "Decrease quantity of Product 1" }));
    expect(screen.getByRole("button", { name: "Add to cart: Product 1" })).toBeInTheDocument();
  });

  it("header badge reflects item count, accessibly", async () => {
    const user = setup();
    expect(screen.getByRole("button", { name: "Cart, 0 items" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add to cart: Product 1" }));
    await user.click(screen.getByRole("button", { name: "Increase quantity of Product 1" }));
    expect(screen.getByRole("button", { name: /^Cart, 2 items/ })).toBeInTheDocument();
  });

  it("rapid clicks are all counted", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Add to cart: Product 1" }));
    const plus = screen.getByRole("button", { name: "Increase quantity of Product 1" });
    await Promise.all([user.click(plus), user.click(plus), user.click(plus)]);
    expect(useCartStore.getState().lines).toEqual([{ productId: 1, quantity: 4 }]);
  });

  it("stops at the cap, disables +, and explains why", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Add to cart: Product 1" }));
    const plus = screen.getByRole("button", { name: "Increase quantity of Product 1" });
    for (let i = 1; i < MAX_QUANTITY; i++) await user.click(plus);
    expect(plus).toBeDisabled();
    expect(screen.getAllByText(`Maximum of ${MAX_QUANTITY} per item.`).length).toBeGreaterThan(0);
    expect(screen.getByText(`Product 1: maximum of ${MAX_QUANTITY} reached.`)).toBeInTheDocument();
  });

  it("announces changes in the live region", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Add to cart: Product 1" }));
    expect(screen.getByText("Product 1 added. Quantity 1.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Decrease quantity of Product 1" }));
    expect(screen.getByText("Product 1 removed from cart.")).toBeInTheDocument();
  });

  it("persists to localStorage", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Add to cart: Product 1" }));
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).state.lines).toEqual([
      { productId: 1, quantity: 1 },
    ]);
  });

  it("disables Add until the cart has hydrated", () => {
    useCartStore.setState({ hydrated: false });
    setup();
    expect(screen.getByRole("button", { name: "Add to cart: Product 1" })).toBeDisabled();
  });
});

describe("cart drawer", () => {
  it("is empty by default with a zero total", async () => {
    const user = setup();
    await openCart(user);
    expect(screen.getByText("Your cart is empty.")).toBeInTheDocument();
    expect(screen.getByText("$0.00")).toBeInTheDocument();
  });

  it("shows line price and total in correct cents, and removes a line", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Add to cart: Product 1" }));
    await user.click(screen.getByRole("button", { name: "Increase quantity of Product 1" }));
    await openCart(user);
    const dialog = cartDialog();
    // 2 x 109.95: line and total (prices arrive after the on-demand lookup)
    await waitFor(() => expect(within(dialog).getAllByText("$219.90")).toHaveLength(2));
    await user.click(within(dialog).getByRole("button", { name: "Remove Product 1 from cart" }));
    expect(within(dialog).getByText("Your cart is empty.")).toBeInTheDocument();
    expect(within(dialog).getByText("$0.00")).toBeInTheDocument();
  });

  it("looks up only the products in the cart, and only once the drawer opens", async () => {
    const calls: string[] = [];
    server.use(lookup(calls));
    useCartStore.setState({
      lines: [
        { productId: 2, quantity: 1 },
        { productId: 5, quantity: 3 },
      ],
    });
    const user = setup();
    expect(calls).toEqual([]); // nothing fetched just by rendering the page
    await openCart(user);
    await waitFor(() => expect(calls).toEqual(["2,5"])); // 2 of the 10 products, not the catalog
  });

  it("does not re-request products it already has", async () => {
    const calls: string[] = [];
    server.use(lookup(calls));
    useCartStore.setState({ lines: [{ productId: 1, quantity: 1 }] });
    const user = setup();
    await openCart(user);
    await waitFor(() => expect(within(cartDialog()).getAllByText("$109.95").length).toBe(2));
    await user.click(within(cartDialog()).getByRole("button", { name: "Close", hidden: true }));
    await openCart(user);
    expect(calls).toEqual(["1"]);
  });

  it("shows a loading state until prices arrive", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    server.use(
      http.get("/api/cart-products", async () => {
        await gate; // hold the response open so the loading state is observable
        return HttpResponse.json(catalog);
      }),
    );
    useCartStore.setState({ lines: [{ productId: 1, quantity: 1 }] });
    const user = setup();
    await openCart(user);
    expect(await within(cartDialog()).findByText("Loading prices…")).toBeInTheDocument();
    expect(within(cartDialog()).getByText("—")).toBeInTheDocument(); // no total from partial data
    release();
    await waitFor(() => expect(within(cartDialog()).getAllByText("$109.95").length).toBe(2));
    expect(within(cartDialog()).queryByText("Loading prices…")).not.toBeInTheDocument();
  });

  it("copes with products that are no longer in the catalog", async () => {
    useCartStore.setState({ lines: [{ productId: 999, quantity: 2 }] });
    const user = setup();
    await openCart(user);
    expect(await within(cartDialog()).findByText("Unavailable item #999")).toBeInTheDocument();
    expect(within(cartDialog()).getByText("$0.00")).toBeInTheDocument();
  });

  it("explains a failed lookup, hides the total, and recovers on retry", async () => {
    server.use(http.get("/api/cart-products", () => HttpResponse.json({}, { status: 502 })));
    useCartStore.setState({ lines: [{ productId: 1, quantity: 1 }] });
    const user = setup();
    await openCart(user);
    const alert = await within(cartDialog()).findByRole("alert", { hidden: true });
    expect(alert).toHaveTextContent("prices are unavailable");
    expect(within(cartDialog()).getByText("—")).toBeInTheDocument();

    server.use(lookup());
    await user.click(within(alert).getByRole("button", { name: "Try again", hidden: true }));
    await waitFor(() => expect(within(cartDialog()).getAllByText("$109.95").length).toBe(2));
    expect(within(cartDialog()).queryByRole("alert", { hidden: true })).not.toBeInTheDocument();
  });

  it("rejects a malformed lookup response instead of rendering it", async () => {
    server.use(http.get("/api/cart-products", () => HttpResponse.json([{ id: "x" }])));
    useCartStore.setState({ lines: [{ productId: 1, quantity: 1 }] });
    const user = setup();
    await openCart(user);
    expect(await within(cartDialog()).findByRole("alert", { hidden: true })).toBeInTheDocument();
  });

  it("closes with the Close button", async () => {
    const user = setup();
    await openCart(user);
    const dialog = cartDialog();
    expect(dialog).toHaveAttribute("open");
    await user.click(within(dialog).getByRole("button", { name: "Close", hidden: true }));
    expect(dialog).not.toHaveAttribute("open");
  });

  it("renders no cart rows while closed", () => {
    useCartStore.setState({ lines: [{ productId: 1, quantity: 1 }] });
    setup();
    const closed = document.querySelector("dialog")!;
    expect(closed).not.toHaveAttribute("open");
    expect(closed.querySelector("ul")).toBeNull();
    expect(closed.querySelector("img")).toBeNull();
  });
});
