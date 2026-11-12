import { describe, expect, it } from "vitest";
import { productSchema, productsSchema } from "./schema";

const good = {
  id: 1,
  title: "Backpack",
  price: 109.95,
  description: "d",
  category: "men's clothing",
  image: "https://fakestoreapi.com/img/1.png",
  rating: { rate: 3.9, count: 120 },
};

describe("productSchema: API data is untrusted", () => {
  it("accepts a valid product and converts the price to integer cents", () => {
    expect(productSchema.parse(good)).toMatchObject({ id: 1, price: 10995 });
  });

  it("strips fields it does not know about instead of passing them through", () => {
    const parsed = productSchema.parse({ ...good, isAdmin: true, __proto__x: "y" });
    expect(parsed).not.toHaveProperty("isAdmin");
    expect(parsed).not.toHaveProperty("__proto__x");
  });

  it.each([
    ["javascript:", "javascript:alert(1)"],
    ["data:", "data:text/html,<script>alert(1)</script>"],
    ["plain http", "http://fakestoreapi.com/img/1.png"],
    ["file:", "file:///etc/passwd"],
    ["protocol-relative", "//evil.example/x.png"],
    ["not a URL", "not a url"],
    ["empty", ""],
  ])("rejects an image URL that is %s", (_n, image) => {
    expect(productSchema.safeParse({ ...good, image }).success).toBe(false);
  });

  it.each([
    ["negative price", { price: -1 }],
    ["NaN price", { price: NaN }],
    ["Infinity price", { price: Infinity }],
    ["string price", { price: "9.99" }],
    ["zero id", { id: 0 }],
    ["fractional id", { id: 1.5 }],
    ["string id", { id: "1" }],
    ["empty title", { title: "" }],
    ["missing category", { category: undefined }],
    ["rating above 5", { rating: { rate: 9, count: 1 } }],
    ["negative rating count", { rating: { rate: 3, count: -1 } }],
  ])("rejects %s", (_n, patch) => {
    expect(productSchema.safeParse({ ...good, ...patch }).success).toBe(false);
  });

  it("rejects the whole list if one product is bad (never half-trust a payload)", () => {
    expect(
      productsSchema.safeParse([good, { ...good, id: 2, image: "javascript:alert(1)" }]).success,
    ).toBe(false);
  });

  it("rejects a non-array payload", () => {
    expect(productsSchema.safeParse({ products: [good] }).success).toBe(false);
    expect(productsSchema.safeParse(null).success).toBe(false);
  });
});
