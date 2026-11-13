import { useEffect } from "react";
import { totalCents } from "./logic";
import { useProductDetails } from "./product-details";
import { useCartStore } from "./store";

/**
 * Everything a cart view needs to show prices: the lines, their product details, loading and error
 * state, and the total.
 *
 * Details are fetched for the lines in the cart only, and only while `enabled`, so a closed drawer
 * costs nothing. `total` is null until every line's details are known (or known to be missing), so
 * a half-loaded cart never shows a wrong number.
 *
 * Shared by the cart drawer and any other view of the cart, instead of each repeating the effect.
 */
export function useCartProducts({ enabled = true }: { enabled?: boolean } = {}) {
  const lines = useCartStore((s) => s.lines);
  const byId = useProductDetails((s) => s.byId);
  const unavailable = useProductDetails((s) => s.unavailable);
  const pending = useProductDetails((s) => s.pending);
  const error = useProductDetails((s) => s.error);
  const load = useProductDetails((s) => s.load);

  const idsKey = lines.map((l) => l.productId).join(",");
  useEffect(() => {
    if (enabled) void load(idsKey ? idsKey.split(",").map(Number) : []);
  }, [enabled, idsKey, load]);

  const loading = lines.some((l) => pending[l.productId]);
  const settled = lines.every((l) => byId[l.productId] || unavailable[l.productId]);
  const prices = new Map(Object.values(byId).map((p) => [p.id, p.price]));
  const total = settled ? totalCents(lines, prices) : null;
  const retry = () => void load(lines.map((l) => l.productId));

  return { lines, byId, unavailable, loading, error, settled, total, retry };
}
