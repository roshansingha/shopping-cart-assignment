/** Convert a decimal price (e.g. 109.95) to integer cents, avoiding float drift. */
export const toCents = (amount: number): number => Math.round(amount * 100);

export const formatCents = (cents: number): string =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
