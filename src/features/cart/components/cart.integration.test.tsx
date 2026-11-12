// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { ProductCard } from "@/features/products/components/product-card";
import { productsSchema } from "@/features/products/schema";
import { rawProducts } from "@/test/fixtures";
import { MAX_QUANTITY } from "../logic";
import { STORAGE_KEY } from "../persistence";
import { useCartStore } from "../store";
import { CartDrawer } from "./cart-drawer";
import { CartLiveRegion } from "./live-region";

const products = productsSchema.parse(rawProducts);
const cartProducts = products.map(({ id, title, price, image }) => ({ id, title, price, image }));

function setup(opts: { unavailable?: boolean; known?: typeof cartProducts } = {}) {
  render(
    <>
      <CartDrawer products={opts.known ?? cartProducts} productsUnavailable={!!opts.unavailable} />
      <ul>
        <ProductCard product={products[0]} />
      </ul>
      <CartLiveRegion />
    </>,
  );
  return userEvent.setup();
}
const qty = () => within(screen.getByRole("group", { name: "Quantity of Product 1" }));

beforeEach(() => {
  localStorage.clear();
  useCartStore.setState({ lines: [], hydrated: true, announcement: { id: 0, text: "" } });
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
    // shown on the card and again in the drawer
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
    await user.click(screen.getByRole("button", { name: /^Cart/ }));
    expect(screen.getByText("Your cart is empty.")).toBeInTheDocument();
    expect(screen.getByText("$0.00")).toBeInTheDocument();
  });

  it("shows line price and total in correct cents, and removes a line", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Add to cart: Product 1" }));
    await user.click(screen.getByRole("button", { name: "Increase quantity of Product 1" }));
    await user.click(screen.getByRole("button", { name: /^Cart/ }));
    const dialog = screen.getByRole("dialog", { name: "Your cart", hidden: true });
    expect(within(dialog).getAllByText("$219.90")).toHaveLength(2); // 2 x 109.95: line and total
    await user.click(within(dialog).getByRole("button", { name: "Remove Product 1 from cart" }));
    expect(within(dialog).getByText("Your cart is empty.")).toBeInTheDocument();
    expect(within(dialog).getByText("$0.00")).toBeInTheDocument();
  });

  it("copes with products that are no longer in the catalog", async () => {
    useCartStore.setState({ lines: [{ productId: 999, quantity: 2 }] });
    const user = setup({ known: [] });
    await user.click(screen.getByRole("button", { name: /^Cart/ }));
    expect(screen.getByText("Unavailable item #999")).toBeInTheDocument();
    expect(screen.getByText("$0.00")).toBeInTheDocument();
  });

  it("warns and hides the total when product data failed to load", async () => {
    useCartStore.setState({ lines: [{ productId: 1, quantity: 1 }] });
    const user = setup({ unavailable: true, known: [] });
    await user.click(screen.getByRole("button", { name: /^Cart/ }));
    expect(screen.getByRole("alert", { hidden: true })).toHaveTextContent("prices are unavailable");
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("closes with the Close button", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: /^Cart/ }));
    const dialog = screen.getByRole("dialog", { name: "Your cart", hidden: true });
    expect(dialog).toHaveAttribute("open");
    await user.click(within(dialog).getByRole("button", { name: "Close", hidden: true }));
    expect(dialog).not.toHaveAttribute("open");
  });
});
