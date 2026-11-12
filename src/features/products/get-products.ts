import { cacheLife } from "next/cache";
import { ApiError, fetchProducts } from "./api";
import { getFallbackProducts } from "./fallback";
import type { Product } from "./schema";

export type ProductSource = "live" | "fallback";
export type ProductsResult = { products: Product[]; source: ProductSource };

/**
 * One cached upstream call shared by every visitor; filtering happens after, per request.
 *
 * If the live API fails (blocked, down, or returning something unexpected) we serve the committed
 * snapshot and say so, instead of failing the page or the whole build.
 */
export async function getProducts(): Promise<ProductsResult> {
  "use cache";
  try {
    // PRODUCTS_API_URL lets E2E tests point at a local mock; unset means the real API.
    const products = await fetchProducts(fetch, process.env.PRODUCTS_API_URL);
    cacheLife("hours");
    return { products, source: "live" };
  } catch (error) {
    if (!(error instanceof ApiError)) throw error; // a bug, not an outage: do not mask it
    const status = error.status ? ` ${error.status}` : "";
    console.warn(`Product API unavailable (${error.kind}${status}); serving the saved catalog.`);
    // Short cache: once the API recovers we want live data again within minutes, not an hour.
    cacheLife("minutes");
    return { products: getFallbackProducts(), source: "fallback" };
  }
}
