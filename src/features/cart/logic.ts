/**
 * Pure cart logic. No React, no storage. Every function returns a new cart.
 * Stock policy: the API has no stock field, so we simulate one with MAX_QUANTITY per line.
 */
export const MAX_QUANTITY = 10;

export type CartLine = { productId: number; quantity: number };
export type Cart = readonly CartLine[];

const clamp = (q: number) => Math.min(Math.max(Math.trunc(q), 0), MAX_QUANTITY);

export function setQuantity(cart: Cart, productId: number, quantity: number): Cart {
  if (!Number.isFinite(quantity)) return cart;
  const q = clamp(quantity);
  const rest = cart.filter((l) => l.productId !== productId);
  if (q === 0) return rest;
  const existing = cart.findIndex((l) => l.productId === productId);
  if (existing === -1) return [...rest, { productId, quantity: q }];
  return cart.map((l) => (l.productId === productId ? { productId, quantity: q } : l));
}

export const getQuantity = (cart: Cart, productId: number): number =>
  cart.find((l) => l.productId === productId)?.quantity ?? 0;

export const addItem = (cart: Cart, productId: number): Cart =>
  setQuantity(cart, productId, getQuantity(cart, productId) + 1);

export const decrementItem = (cart: Cart, productId: number): Cart =>
  setQuantity(cart, productId, getQuantity(cart, productId) - 1);

export const removeItem = (cart: Cart, productId: number): Cart =>
  cart.filter((l) => l.productId !== productId);

export const isAtMax = (cart: Cart, productId: number): boolean =>
  getQuantity(cart, productId) >= MAX_QUANTITY;

export const itemCount = (cart: Cart): number => cart.reduce((n, l) => n + l.quantity, 0);

/** Total in integer cents. Lines whose product is unknown (e.g. removed upstream) are skipped. */
export function totalCents(cart: Cart, priceCentsById: ReadonlyMap<number, number>): number {
  return cart.reduce((sum, l) => sum + (priceCentsById.get(l.productId) ?? 0) * l.quantity, 0);
}
