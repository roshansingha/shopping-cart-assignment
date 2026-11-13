import { MAX_LINES } from "./persistence";

/** The only product fields the cart needs. Keeps payloads small however large the catalog is. */
export type CartProduct = { id: number; title: string; price: number; image: string };

export const toCartProduct = ({ id, title, price, image }: CartProduct): CartProduct => ({
  id,
  title,
  price,
  image,
});

export const isCartProduct = (v: unknown): v is CartProduct =>
  typeof v === "object" &&
  v !== null &&
  Number.isInteger((v as CartProduct).id) &&
  typeof (v as CartProduct).title === "string" &&
  Number.isInteger((v as CartProduct).price) &&
  typeof (v as CartProduct).image === "string";

/**
 * Parses the `ids` query param ("1,2,3"). Returns null when it is missing or invalid so the
 * route can answer 400. Input is untrusted: only positive integers, no duplicates, bounded count.
 */
export function parseIds(param: string | null): number[] | null {
  if (param === null) return null;
  if (param === "") return [];
  const parts = param.split(",");
  if (parts.length > MAX_LINES) return null;
  const ids: number[] = [];
  for (const part of parts) {
    if (!/^[1-9]\d{0,9}$/.test(part)) return null;
    ids.push(Number(part));
  }
  return [...new Set(ids)];
}

/** What to call a cart line: its title, or an honest placeholder while loading or if it is gone. */
export function lineTitle(
  productId: number,
  byId: Record<number, CartProduct>,
  unavailable: Record<number, true>,
): string {
  return (
    byId[productId]?.title ??
    (unavailable[productId] ? `Unavailable item #${productId}` : "Loading…")
  );
}
