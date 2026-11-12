import { z } from "zod";
import { MAX_QUANTITY, setQuantity, type Cart } from "./logic";

export const STORAGE_KEY = "cart-v1";

const storedSchema = z.object({
  lines: z.array(
    z.object({
      productId: z.number().int().positive(),
      quantity: z.number().int().min(1).max(MAX_QUANTITY),
    }),
  ),
});

/**
 * Storage is untrusted (corruption, old versions, hand-edited values).
 * Anything that is not exactly the expected shape becomes an empty cart.
 * Valid lines are rebuilt through setQuantity so duplicates merge and the cap holds.
 */
export function parseStoredCart(raw: unknown): Cart {
  const parsed = storedSchema.safeParse(raw);
  if (!parsed.success) return [];
  return parsed.data.lines.reduce<Cart>(
    (cart, l) => setQuantity(cart, l.productId, l.quantity),
    [],
  );
}
