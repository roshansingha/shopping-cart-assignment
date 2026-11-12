import { cacheLife } from "next/cache";
import { fetchProducts } from "./api";

/** One cached upstream call shared by every visitor; filtering happens after, per request. */
export async function getProducts() {
  "use cache";
  cacheLife("hours");
  // PRODUCTS_API_URL lets E2E tests point at a local mock; unset means the real API.
  return fetchProducts(fetch, process.env.PRODUCTS_API_URL);
}
