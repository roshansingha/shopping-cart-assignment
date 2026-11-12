import type { Product } from "../schema";
import { ProductCard } from "./product-card";

/** Images in the first row are preloaded (the LCP candidate); the rest stay lazy. */
const PRELOAD_COUNT = 4;

export function ProductGrid({ products }: { products: Product[] }) {
  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {products.map((p, i) => (
        <ProductCard key={p.id} product={p} preload={i < PRELOAD_COUNT} highPriority={i === 0} />
      ))}
    </ul>
  );
}

export function ProductGridSkeleton() {
  return (
    <div role="status" aria-label="Loading products">
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4" aria-hidden="true">
        {Array.from({ length: 8 }, (_, i) => (
          <li
            key={i}
            className="h-80 motion-safe:animate-pulse rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-800"
          />
        ))}
      </ul>
      <span className="sr-only">Loading products…</span>
    </div>
  );
}
