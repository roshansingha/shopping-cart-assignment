import snapshot from "./fallback-products.json";
import { productsSchema, type Product } from "./schema";

/**
 * A committed copy of the catalog, used only when the live API cannot be reached.
 *
 * Why it exists: fakestoreapi.com sits behind Cloudflare, which answered a deploy build with
 * HTTP 403, and because the listing is prerendered, one refused request failed the whole deploy.
 * A shop that shows a slightly old catalog is better than one that shows nothing.
 *
 * Refresh with: curl -s https://fakestoreapi.com/products | pnpm exec prettier --stdin-filepath x.json
 * and commit the result to fallback-products.json.
 */
export const SNAPSHOT_DATE = "2026-11-12";

/** Goes through the same schema as live data: a corrupt snapshot fails loudly in tests, not in prod. */
export function getFallbackProducts(): Product[] {
  return productsSchema.parse(snapshot);
}
