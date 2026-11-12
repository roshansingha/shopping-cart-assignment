import { describe, expect, it } from "vitest";
import { isCartProduct, parseIds, toCartProduct } from "./cart-products";
import { MAX_LINES } from "./persistence";

describe("parseIds", () => {
  it("parses a list and de-duplicates", () => {
    expect(parseIds("1,2,3")).toEqual([1, 2, 3]);
    expect(parseIds("2,2,2,5")).toEqual([2, 5]);
  });
  it("treats an empty value as no ids, but a missing param as invalid", () => {
    expect(parseIds("")).toEqual([]);
    expect(parseIds(null)).toBeNull();
  });
  it.each([
    "0",
    "-1",
    "1.5",
    "abc",
    "1,,2",
    "1,x",
    " 1",
    "01",
    "1e3",
    "99999999999",
    "1;2",
    "<script>",
  ])("rejects %j", (bad) => expect(parseIds(bad)).toBeNull());
  it("bounds the number of ids", () => {
    const ok = Array.from({ length: MAX_LINES }, (_, i) => i + 1).join(",");
    expect(parseIds(ok)).toHaveLength(MAX_LINES);
    expect(parseIds(ok + `,${MAX_LINES + 1}`)).toBeNull();
  });
});

describe("cart product shape", () => {
  const p = { id: 1, title: "t", price: 100, image: "https://x/y.jpg" };
  it("toCartProduct strips extra fields", () => {
    expect(toCartProduct({ ...p, description: "long", rating: 5 } as never)).toEqual(p);
  });
  it("isCartProduct accepts the shape and rejects bad ones", () => {
    expect(isCartProduct(p)).toBe(true);
    expect(isCartProduct({ ...p, price: 1.5 })).toBe(false); // must be integer cents
    expect(isCartProduct({ ...p, id: "1" })).toBe(false);
    expect(isCartProduct(null)).toBe(false);
    expect(isCartProduct({ id: 1 })).toBe(false);
  });
});
