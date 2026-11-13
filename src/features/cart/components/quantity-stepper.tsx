"use client";

import { useId, useRef } from "react";
import { MAX_QUANTITY, getQuantity } from "../logic";
import { selectQuantity, useCartStore } from "../store";

const btn =
  "inline-flex h-10 w-10 items-center justify-center rounded border border-zinc-500 text-lg aria-disabled:cursor-not-allowed aria-disabled:opacity-40 hover:bg-zinc-100 dark:border-zinc-500 dark:hover:bg-zinc-800";

type Target = "add" | "increase";

/**
 * Add button when the item is not in the cart, +/- stepper when it is.
 *
 * Focus: pressing Add swaps the button for the stepper, and pressing − at quantity 1 swaps it back.
 * Either way the pressed button disappears, which would drop keyboard and screen-reader focus to
 * the top of the page. So the handler records where focus should go, and the replacement control
 * takes it as it mounts. Only this component's own clicks move focus; a change from another tab
 * never does.
 *
 * `onEmptied` is for views where quantity 0 removes the whole row (the cart drawer): the row, and
 * this stepper with it, is about to unmount, so the parent decides where focus goes.
 */
export function QuantityStepper({
  productId,
  title,
  showAddWhenEmpty = true,
  onEmptied,
}: {
  productId: number;
  title: string;
  showAddWhenEmpty?: boolean;
  onEmptied?: () => void;
}) {
  const quantity = useCartStore(selectQuantity(productId));
  const hydrated = useCartStore((s) => s.hydrated);
  const maxNoteId = useId();
  const focusNext = useRef<Target | null>(null);
  const takeFocus = (target: Target) => (el: HTMLButtonElement | null) => {
    if (el && focusNext.current === target) {
      focusNext.current = null;
      el.focus();
    }
  };

  const add = () => {
    const { add, announce, lines } = useCartStore.getState();
    const before = getQuantity(lines, productId); // live value: rapid clicks outrun re-renders
    if (before >= MAX_QUANTITY) {
      announce(`${title}: maximum of ${MAX_QUANTITY} reached.`);
      return;
    }
    add(productId);
    const now = getQuantity(useCartStore.getState().lines, productId);
    if (before === 0) focusNext.current = "increase";
    announce(
      now >= MAX_QUANTITY
        ? `${title}: maximum of ${MAX_QUANTITY} reached.`
        : `${title} added. Quantity ${now}.`,
    );
  };
  const decrement = () => {
    const { decrement, announce } = useCartStore.getState();
    decrement(productId);
    const now = getQuantity(useCartStore.getState().lines, productId);
    if (now === 0) {
      if (showAddWhenEmpty) focusNext.current = "add";
      onEmptied?.();
    }
    announce(now === 0 ? `${title} removed from cart.` : `${title}. Quantity ${now}.`);
  };

  if (quantity === 0 && showAddWhenEmpty) {
    return (
      <button
        ref={takeFocus("add")}
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

  // aria-disabled rather than disabled: a disabled button drops focus the moment it is disabled,
  // so a keyboard user pressing + up to the cap would lose their place. The cap itself is enforced
  // in the cart logic, and the click handler only announces it.
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
          ref={takeFocus("increase")}
          type="button"
          onClick={add}
          aria-disabled={atMax}
          aria-describedby={atMax ? maxNoteId : undefined}
          className={btn}
          aria-label={`Increase quantity of ${title}`}
        >
          <span aria-hidden="true">+</span>
        </button>
      </div>
      {atMax && (
        <p id={maxNoteId} className="mt-1 text-xs text-amber-700 dark:text-amber-400">
          Maximum of {MAX_QUANTITY} per item.
        </p>
      )}
    </div>
  );
}
