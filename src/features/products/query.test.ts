import { describe, expect, it } from "vitest";
import { PAGE_SIZE, getCategories, parseQuery, queryProducts, toSearchParams } from "./query";
import type { Product } from "./schema";

const mk = (id: number, over: Partial<Product> = {}): Product => ({
  id,
  title: `Item ${id}`,
  price: id * 100,
  description: "",
  category: id % 2 ? "odd" : "even",
  image: "https://fakestoreapi.com/img/x.jpg",
  rating: { rate: id % 5, count: 1 },
  ...over,
});
const products = Array.from({ length: 20 }, (_, i) => mk(i + 1));
const base = { q: "", category: "", sort: "default" as const, page: 1 };

describe("parseQuery", () => {
  it("returns defaults for empty params", () => {
    expect(parseQuery({})).toEqual(base);
  });
  it("rejects invalid sort and page", () => {
    expect(parseQuery({ sort: "hack", page: "-3" })).toEqual(base);
    expect(parseQuery({ page: "abc" }).page).toBe(1);
  });
  it("takes the first value of repeated params and trims q", () => {
    expect(parseQuery({ q: ["  hat ", "x"], page: ["2", "3"] })).toMatchObject({
      q: "hat",
      page: 2,
    });
  });
  it("limits q length", () => {
    expect(parseQuery({ q: "a".repeat(500) }).q).toHaveLength(100);
  });
});

describe("toSearchParams", () => {
  it("omits defaults and round-trips", () => {
    expect(toSearchParams(base).toString()).toBe("");
    const q = { q: "a b", category: "odd", sort: "price-asc" as const, page: 2 };
    expect(parseQuery(Object.fromEntries(toSearchParams(q)))).toEqual(q);
  });
});

describe("queryProducts", () => {
  it("paginates", () => {
    const p = queryProducts(products, base);
    expect(p.items).toHaveLength(PAGE_SIZE);
    expect(p).toMatchObject({ total: 20, page: 1, pageCount: 3 });
    expect(queryProducts(products, { ...base, page: 3 }).items).toHaveLength(4);
  });
  it("clamps out-of-range pages", () => {
    expect(queryProducts(products, { ...base, page: 99 }).page).toBe(3);
  });
  it("filters by category and search (case-insensitive)", () => {
    expect(queryProducts(products, { ...base, category: "odd" }).total).toBe(10);
    expect(queryProducts(products, { ...base, q: "ITEM 1" }).total).toBe(11);
  });
  it("returns an empty single page when nothing matches", () => {
    expect(queryProducts(products, { ...base, q: "zzz" })).toEqual({
      items: [],
      total: 0,
      page: 1,
      pageCount: 1,
    });
  });
  it("sorts without mutating the input", () => {
    const copy = [...products];
    const asc = queryProducts(products, { ...base, sort: "price-asc" }).items;
    const desc = queryProducts(products, { ...base, sort: "price-desc" }).items;
    expect(asc[0].id).toBe(1);
    expect(desc[0].id).toBe(20);
    expect(products).toEqual(copy);
  });
  it("sorts by rating and name", () => {
    expect(queryProducts(products, { ...base, sort: "rating-desc" }).items[0].rating.rate).toBe(4);
    const named = [mk(1, { title: "b" }), mk(2, { title: "a" })];
    expect(queryProducts(named, { ...base, sort: "name-asc" }).items[0].title).toBe("a");
  });
});

describe("getCategories", () => {
  it("returns unique sorted categories", () => {
    expect(getCategories(products)).toEqual(["even", "odd"]);
  });
});
