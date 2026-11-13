// Usage: node scripts/bench/query.mjs
// Measures the two costs that decide when "fetch everything and filter in memory" stops being OK:
//   1. per request (cache hit): queryProducts() filtering, sorting and slicing
//   2. per cache refresh (cache miss): JSON.parse + Zod validation of the whole catalog
// Synthetic products with the real API's shape. Numbers depend on the machine; compare sizes, not machines.
import { performance } from "node:perf_hooks";
import { z } from "zod";
import { queryProducts } from "../../src/features/products/query.ts";

// Same shape as src/features/products/schema.ts (copied: that file uses a path alias plain Node cannot resolve).
const productSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1),
  price: z
    .number()
    .nonnegative()
    .finite()
    .transform((n) => Math.round(n * 100)),
  description: z.string(),
  category: z.string().min(1),
  image: z.url({ protocol: /^https$/ }),
  rating: z.object({ rate: z.number().min(0).max(5), count: z.number().int().nonnegative() }),
});
const productsSchema = z.array(productSchema);

const words = [
  "slim",
  "fit",
  "casual",
  "gold",
  "ring",
  "backpack",
  "jacket",
  "monitor",
  "drive",
  "cotton",
  "silver",
  "bracelet",
  "hat",
  "shirt",
  "gaming",
  "portable",
  "waterproof",
  "leather",
];
const categories = [
  "men's clothing",
  "women's clothing",
  "jewelery",
  "electronics",
  "home",
  "sports",
  "toys",
  "books",
  "garden",
  "tools",
];
const rawCatalog = (n) =>
  Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    title:
      Array.from({ length: 5 }, (_, k) => words[(i * 7 + k * 3) % words.length]).join(" ") +
      ` ${i + 1}`,
    price: 5 + ((i * 37) % 995) + 0.99,
    description:
      "A reasonably long description of the product, about as long as the real API's ones are. ".repeat(
        3,
      ),
    category: categories[i % categories.length],
    image: `https://fakestoreapi.com/img/${i + 1}.png`,
    rating: { rate: 1 + ((i * 13) % 40) / 10, count: (i * 17) % 500 },
  }));

const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const time = (fn, runs = 25) => {
  for (let i = 0; i < 3; i++) fn(); // warm up
  const t = [];
  for (let i = 0; i < runs; i++) {
    const s = performance.now();
    fn();
    t.push(performance.now() - s);
  }
  return median(t);
};
const ms = (n) =>
  (n < 1 ? n.toFixed(2) : n < 10 ? n.toFixed(1) : Math.round(n)).toString().padStart(6);

const rows = [];
for (const n of [20, 1_000, 10_000, 50_000, 100_000]) {
  const raw = rawCatalog(n);
  const json = JSON.stringify(raw);
  const mb = (json.length / 1024 / 1024).toFixed(1);
  const parseMs = time(() => productsSchema.parse(JSON.parse(json)), n >= 50_000 ? 5 : 15);
  const products = productsSchema.parse(raw);
  const base = { q: "", category: "", sort: "default", page: 1 };
  rows.push({
    n,
    mb,
    refresh: parseMs,
    plain: time(() => queryProducts(products, base)),
    search: time(() => queryProducts(products, { ...base, q: "gold ring" })),
    filterSort: time(() =>
      queryProducts(products, { ...base, category: "electronics", sort: "price-asc" }),
    ),
    worst: time(() => queryProducts(products, { ...base, q: "a", sort: "name-asc", page: 9999 })),
  });
}
console.log(
  "products |  JSON MB | refresh (parse+validate) | page 1 | search | filter+sort | worst (search+name sort)",
);
for (const r of rows) {
  console.log(
    `${String(r.n).padStart(8)} | ${String(r.mb).padStart(8)} | ${ms(r.refresh)} ms${" ".repeat(14)} | ${ms(r.plain)} | ${ms(r.search)} | ${ms(r.filterSort)}      | ${ms(r.worst)}  (ms, median)`,
  );
}
