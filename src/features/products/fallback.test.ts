import { describe, expect, it } from "vitest";
import { getFallbackProducts } from "./fallback";

describe("fallback catalog", () => {
  const products = getFallbackProducts();

  it("is valid under the same schema as live data (prices become integer cents)", () => {
    expect(products).toHaveLength(20);
    for (const p of products) expect(Number.isInteger(p.price)).toBe(true);
  });

  it("has unique ids, so it works with the cart", () => {
    expect(new Set(products.map((p) => p.id)).size).toBe(products.length);
  });

  it("only references images the optimizer is allowed to fetch (https, fakestoreapi.com/img/)", () => {
    for (const p of products) {
      const u = new URL(p.image);
      expect(u.protocol).toBe("https:");
      expect(u.hostname).toBe("fakestoreapi.com");
      expect(u.pathname.startsWith("/img/")).toBe(true);
      expect(u.search).toBe("");
    }
  });

  it("spans several categories, so the filter is usable in fallback mode", () => {
    expect(new Set(products.map((p) => p.category)).size).toBeGreaterThan(1);
  });
});
