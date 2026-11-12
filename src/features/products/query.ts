import type { Product } from "./schema";

export const PAGE_SIZE = 8;
export const SORTS = ["default", "price-asc", "price-desc", "rating-desc", "name-asc"] as const;
export type Sort = (typeof SORTS)[number];

export type ProductQuery = { q: string; category: string; sort: Sort; page: number };
export type RawParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** URL params are untrusted input: anything invalid falls back to a safe default. */
export function parseQuery(params: RawParams): ProductQuery {
  const sort = first(params.sort);
  const page = Number.parseInt(first(params.page) ?? "1", 10);
  return {
    q: (first(params.q) ?? "").trim().slice(0, 100),
    category: first(params.category) ?? "",
    sort: (SORTS as readonly string[]).includes(sort ?? "") ? (sort as Sort) : "default",
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

/** Inverse of parseQuery: only non-default values reach the URL. */
export function toSearchParams(query: Partial<ProductQuery>): URLSearchParams {
  const sp = new URLSearchParams();
  if (query.q) sp.set("q", query.q);
  if (query.category) sp.set("category", query.category);
  if (query.sort && query.sort !== "default") sp.set("sort", query.sort);
  if (query.page && query.page > 1) sp.set("page", String(query.page));
  return sp;
}

export const getCategories = (products: readonly Product[]): string[] =>
  [...new Set(products.map((p) => p.category))].sort();

const comparators: Record<Exclude<Sort, "default">, (a: Product, b: Product) => number> = {
  "price-asc": (a, b) => a.price - b.price,
  "price-desc": (a, b) => b.price - a.price,
  "rating-desc": (a, b) => b.rating.rate - a.rating.rate,
  "name-asc": (a, b) => a.title.localeCompare(b.title),
};

export type ProductPage = { items: Product[]; total: number; page: number; pageCount: number };

export function queryProducts(products: readonly Product[], query: ProductQuery): ProductPage {
  const needle = query.q.toLowerCase();
  let list = products.filter(
    (p) =>
      (!query.category || p.category === query.category) &&
      (!needle || p.title.toLowerCase().includes(needle)),
  );
  if (query.sort !== "default") list = [...list].sort(comparators[query.sort]);

  const pageCount = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const page = Math.min(query.page, pageCount); // out-of-range page clamps to the last one
  const start = (page - 1) * PAGE_SIZE;
  return { items: list.slice(start, start + PAGE_SIZE), total: list.length, page, pageCount };
}
