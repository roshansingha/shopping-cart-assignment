import Link from "next/link";
import { getProducts } from "../get-products";
import { getCategories, parseQuery, queryProducts, type RawParams } from "../query";
import { Filters } from "./filters";
import { Pagination } from "./pagination";
import { ProductGrid } from "./product-grid";

/** Server component. Reads searchParams, so it must render inside <Suspense> (Cache Components). */
export async function ProductsSection({ searchParams }: { searchParams: Promise<RawParams> }) {
  const [products, params] = await Promise.all([getProducts(), searchParams]);
  const query = parseQuery(params);
  const result = queryProducts(products, query);

  return (
    <>
      <Filters categories={getCategories(products)} />
      <p role="status" className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
        {result.total} {result.total === 1 ? "product" : "products"}
      </p>
      {result.total === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 p-10 text-center dark:border-zinc-700">
          <p className="font-medium">No products match your filters.</p>
          <Link href="/" className="mt-2 inline-block text-sm underline">
            Clear filters
          </Link>
        </div>
      ) : (
        <ProductGrid products={result.items} />
      )}
      <Pagination query={query} page={result.page} pageCount={result.pageCount} />
    </>
  );
}
