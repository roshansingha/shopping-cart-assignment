// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { productsSchema } from "@/features/products/schema";
import { rawProducts } from "@/test/fixtures";
import { server } from "@/test/server";
import { toCartProduct } from "./cart-products";
import { useProductDetails } from "./product-details";
import { useCartStore } from "./store";
import { useCartProducts } from "./use-cart-products";

const catalog = productsSchema.parse(rawProducts).map(toCartProduct);

/** Serves /api/cart-products and records which ids were asked for. */
function serve() {
  const calls: string[] = [];
  server.use(
    http.get("/api/cart-products", ({ request }) => {
      const ids = new URL(request.url).searchParams.get("ids") ?? "";
      calls.push(ids);
      const wanted = ids.split(",").map(Number);
      return HttpResponse.json(catalog.filter((p) => wanted.includes(p.id)));
    }),
  );
  return calls;
}

beforeEach(() => {
  useCartStore.setState({ lines: [], hydrated: true });
  useProductDetails.setState({ byId: {}, unavailable: {}, pending: {}, error: false });
});

describe("useCartProducts", () => {
  it("does not fetch anything while disabled (a closed drawer costs nothing)", async () => {
    const calls = serve();
    useCartStore.setState({ lines: [{ productId: 1, quantity: 1 }] });
    renderHook(() => useCartProducts({ enabled: false }));
    await new Promise((r) => setTimeout(r, 50));
    expect(calls).toEqual([]);
  });

  it("fetches only the products in the cart once enabled", async () => {
    const calls = serve();
    useCartStore.setState({
      lines: [
        { productId: 2, quantity: 1 },
        { productId: 5, quantity: 3 },
      ],
    });
    const { rerender } = renderHook(({ on }) => useCartProducts({ enabled: on }), {
      initialProps: { on: false },
    });
    expect(calls).toEqual([]);
    rerender({ on: true });
    await waitFor(() => expect(calls).toEqual(["2,5"]));
  });

  it("has no total until every line is known, then reports it in integer cents", async () => {
    serve();
    useCartStore.setState({
      lines: [
        { productId: 1, quantity: 2 }, // 2 x 10995 cents ($109.95)
        { productId: 2, quantity: 1 }, // 1 x 2000 cents ($20.00)
      ],
    });
    const { result } = renderHook(() => useCartProducts());
    expect(result.current.total).toBeNull(); // not $0.00: that would be a wrong number
    await waitFor(() => expect(result.current.total).toBe(23990)); // 21990 + 2000
    expect(result.current.settled).toBe(true);
  });

  it("is loading while a lookup is in flight, and not after", async () => {
    serve();
    useCartStore.setState({ lines: [{ productId: 1, quantity: 1 }] });
    const { result } = renderHook(() => useCartProducts());
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it("treats a product that no longer exists as settled and worth nothing", async () => {
    serve();
    useCartStore.setState({
      lines: [
        { productId: 1, quantity: 1 },
        { productId: 999, quantity: 4 },
      ],
    });
    const { result } = renderHook(() => useCartProducts());
    await waitFor(() => expect(result.current.settled).toBe(true));
    expect(result.current.unavailable[999]).toBe(true);
    expect(result.current.total).toBe(10995); // only product 1 counts
  });

  it("does not ask again when only a quantity changes", async () => {
    const calls = serve();
    useCartStore.setState({ lines: [{ productId: 1, quantity: 1 }] });
    renderHook(() => useCartProducts());
    await waitFor(() => expect(calls).toEqual(["1"]));
    act(() => useCartStore.getState().add(1));
    await new Promise((r) => setTimeout(r, 50));
    expect(calls).toEqual(["1"]);
  });

  it("asks only for the new product when one is added", async () => {
    const calls = serve();
    useCartStore.setState({ lines: [{ productId: 1, quantity: 1 }] });
    renderHook(() => useCartProducts());
    await waitFor(() => expect(calls).toEqual(["1"]));
    act(() => useCartStore.getState().add(2));
    await waitFor(() => expect(calls).toEqual(["1", "2"]));
  });

  it("reports a failed lookup, keeps the total hidden, and recovers on retry", async () => {
    server.use(http.get("/api/cart-products", () => HttpResponse.json({}, { status: 502 })));
    useCartStore.setState({ lines: [{ productId: 1, quantity: 1 }] });
    const { result } = renderHook(() => useCartProducts());
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.total).toBeNull();

    serve();
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.total).toBe(10995));
    expect(result.current.error).toBe(false);
  });
});
