import { MAX_QUANTITY, setQuantity, type Cart } from "./logic";

export const STORAGE_KEY = "cart-v1";
/** A real cart is tiny. Anything bigger is corruption or tampering, and would flood the lookup API. */
export const MAX_LINES = 100;

// Hand-written on purpose. This file ships to every browser, and even Zod's tree-shakable build
// kept ~15 kB gzipped of core code for four checks (see docs/performance-notes.md). Server-side
// API validation (products/schema.ts) keeps using full Zod; it never reaches the client.
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

const isValidLine = (l: unknown) =>
  isRecord(l) &&
  Number.isInteger(l.productId) &&
  (l.productId as number) > 0 &&
  Number.isInteger(l.quantity) &&
  (l.quantity as number) >= 1 &&
  (l.quantity as number) <= MAX_QUANTITY;

/**
 * Storage is untrusted (corruption, old versions, hand-edited values).
 * Anything that is not exactly the expected shape becomes an empty cart.
 * Valid lines are rebuilt through setQuantity so duplicates merge and the cap holds.
 */
export function parseStoredCart(raw: unknown): Cart {
  if (!isRecord(raw) || !Array.isArray(raw.lines)) return [];
  if (raw.lines.length > MAX_LINES || !raw.lines.every(isValidLine)) return [];
  return (raw.lines as { productId: number; quantity: number }[]).reduce<Cart>(
    (cart, l) => setQuantity(cart, l.productId, l.quantity),
    [],
  );
}
