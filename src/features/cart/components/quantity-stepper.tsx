"use client";

import { MAX_QUANTITY } from "../logic";
import { selectQuantity, useCartStore } from "../store";

const btn =
  "inline-flex h-10 w-10 items-center justify-center rounded border border-zinc-500 text-lg disabled:opacity-40 hover:bg-zinc-100 dark:border-zinc-500 dark:hover:bg-zinc-800";

/** Add button when the item is not in the cart, +/- stepper when it is. */
export function QuantityStepper({
  productId,
  title,
  showAddWhenEmpty = true,
}: {
  productId: number;
  title: string;
  showAddWhenEmpty?: boolean;
}) {
  const quantity = useCartStore(selectQuantity(productId));
  const hydrated = useCartStore((s) => s.hydrated);

  const add = () => {
    const { add, announce } = useCartStore.getState();
    add(productId);
    const now = useCartStore.getState().lines.find((l) => l.productId === productId)?.quantity ?? 0;
    announce(
      now >= MAX_QUANTITY
        ? `${title}: maximum of ${MAX_QUANTITY} reached.`
        : `${title} added. Quantity ${now}.`,
    );
  };
  const decrement = () => {
    const { decrement, announce } = useCartStore.getState();
    decrement(productId);
    const now = useCartStore.getState().lines.find((l) => l.productId === productId)?.quantity ?? 0;
    announce(now === 0 ? `${title} removed from cart.` : `${title}. Quantity ${now}.`);
  };

  if (quantity === 0 && showAddWhenEmpty) {
    return (
      <button
        type="button"
        onClick={add}
        disabled={!hydrated}
        aria-label={`Add to cart: ${title}`}
        className="mt-3 w-full rounded bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        Add to cart
      </button>
    );
  }

  const atMax = quantity >= MAX_QUANTITY;
  return (
    <div className="mt-3">
      <div role="group" aria-label={`Quantity of ${title}`} className="flex items-center gap-2">
        <button
          type="button"
          onClick={decrement}
          className={btn}
          aria-label={`Decrease quantity of ${title}`}
        >
          <span aria-hidden="true">−</span>
        </button>
        <span className="min-w-6 text-center text-sm tabular-nums">{quantity}</span>
        <button
          type="button"
          onClick={add}
          disabled={atMax}
          className={btn}
          aria-label={`Increase quantity of ${title}`}
        >
          <span aria-hidden="true">+</span>
        </button>
      </div>
      {atMax && (
        <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
          Maximum of {MAX_QUANTITY} per item.
        </p>
      )}
    </div>
  );
}
